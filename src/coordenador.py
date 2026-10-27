"""Acesso do coordenador: criar o código, entrar, sessões e travão a tentativas erradas.

O código nunca é guardado em texto: no bd/coordenador.txt fica só
    nome;sal;resumo
onde o "resumo" é calculado com PBKDF2 (não se consegue voltar ao código).
Para repor o acesso, apaga-se o bd/coordenador.txt no servidor.
"""

import hashlib
import hmac
import os
import secrets
import threading
import time

import config
from utilitarios import ErroValidacao, limpar, texto_de

_bloqueio = threading.Lock()
_sessoes = {}     # token -> (nome, momento em que expira)
_falhas = {}      # endereço -> (número de falhas, momento do desbloqueio, última falha)


def _resumo_do_codigo(codigo, sal):
    return hashlib.pbkdf2_hmac(
        "sha256", codigo.encode("utf-8"), sal, config.ITERACOES_HASH)


def _ler_acesso():
    """Devolve (nome, sal, resumo) ou None se ainda não há coordenador."""
    try:
        with open(config.FICHEIRO_COORDENADOR, encoding="utf-8") as ficheiro:
            colunas = ficheiro.readline().strip().split(config.SEPARADOR)
        if len(colunas) != 3:
            return None
        return colunas[0], bytes.fromhex(colunas[1]), bytes.fromhex(colunas[2])
    except (OSError, ValueError):
        return None


def existe():
    return _ler_acesso() is not None


def nome_do_coordenador():
    acesso = _ler_acesso()
    return acesso[0] if acesso else None


def criar_acesso(nome, codigo):
    """Cria o coordenador. Só funciona se ainda não existir nenhum."""
    nome = limpar(nome)
    codigo = texto_de(codigo)

    erros = {}
    if len(nome) < config.MIN_NOME_COORDENADOR:
        erros["nome"] = f"Escreve o teu nome, com pelo menos {config.MIN_NOME_COORDENADOR} letras."
    elif len(nome) > config.MAX_NOME_COORDENADOR:
        erros["nome"] = f"Usa no máximo {config.MAX_NOME_COORDENADOR} caracteres."
    if len(codigo) < config.MIN_CODIGO:
        erros["codigo"] = f"O código deve ter pelo menos {config.MIN_CODIGO} caracteres."
    elif len(codigo) > config.MAX_CODIGO:
        erros["codigo"] = f"Usa no máximo {config.MAX_CODIGO} caracteres."
    if erros:
        raise ErroValidacao(erros)

    sal = os.urandom(16)
    linha = config.SEPARADOR.join([nome, sal.hex(), _resumo_do_codigo(codigo, sal).hex()])
    config.PASTA_BD.mkdir(parents=True, exist_ok=True)
    try:
        # modo "x": falha se o ficheiro já existir (duas pessoas a criar ao mesmo tempo)
        with open(config.FICHEIRO_COORDENADOR, "x", encoding="utf-8") as ficheiro:
            ficheiro.write(linha + "\n")
    except FileExistsError:
        return None
    try:
        os.chmod(config.FICHEIRO_COORDENADOR, 0o600)
    except OSError:
        pass
    return nome


def verificar_codigo(codigo):
    """Devolve o nome do coordenador se o código estiver certo, senão None."""
    acesso = _ler_acesso()
    if acesso is None:
        return None
    nome, sal, resumo = acesso
    tentativa = _resumo_do_codigo(texto_de(codigo)[:config.MAX_CODIGO], sal)
    return nome if hmac.compare_digest(tentativa, resumo) else None


# --- Travão a tentativas erradas (por endereço) -------------------------------

def segundos_de_espera(endereco):
    """Se o endereço está bloqueado, devolve quantos segundos faltam; senão 0."""
    with _bloqueio:
        falhas, ate, ultima = _falhas.get(endereco, (0, 0, 0))
        restante = ate - time.time()
        if restante > 0:
            return int(restante) + 1
        if falhas and (ate or time.time() - ultima > 15 * 60):
            _falhas.pop(endereco, None)      # bloqueio acabou, ou falhas muito antigas
        return 0


def registar_falha(endereco):
    with _bloqueio:
        falhas, ate, _ = _falhas.get(endereco, (0, 0, 0))
        falhas += 1
        agora = time.time()
        ate = agora + config.BLOQUEIO_SEGUNDOS if falhas >= config.TENTATIVAS_MAXIMAS else 0
        _falhas[endereco] = (falhas, ate, agora)


def limpar_falhas(endereco):
    with _bloqueio:
        _falhas.pop(endereco, None)


# --- Sessões ----------------------------------------------------------------

def abrir_sessao(nome):
    token = secrets.token_urlsafe(32)
    with _bloqueio:
        agora = time.time()
        for antigo in [t for t, (_, fim) in _sessoes.items() if fim < agora]:
            del _sessoes[antigo]
        _sessoes[token] = (nome, agora + config.DURACAO_SESSAO)
    return token


def nome_da_sessao(token):
    """Devolve o nome do coordenador dono desta sessão, ou None se não for válida."""
    if not token:
        return None
    with _bloqueio:
        sessao = _sessoes.get(token)
        if sessao is None:
            return None
        nome, fim = sessao
        if fim < time.time():
            del _sessoes[token]
            return None
        return nome


def fechar_sessao(token):
    with _bloqueio:
        _sessoes.pop(token, None)
