"""Registar, editar e apagar alunos: valida os dados e grava no txt."""

import config
import ficheiro_alunos
from utilitarios import (ErroValidacao, NaoEncontrado, limpar, normalizar,
                         so_digitos, texto_de)


def validar_aluno(dados, alunos, id_actual=None):
    """Confere os dados vindos do formulário.

    Devolve o aluno já limpo (sem id) ou levanta ErroValidacao com uma
    mensagem por campo. `id_actual` serve na edição, para o aluno não ser
    considerado repetido dele próprio.
    """
    if not isinstance(dados, dict):
        raise ErroValidacao({}, "Pedido inválido.")

    nome = limpar(dados.get("nome"))
    turma = limpar(dados.get("turma")).upper()
    sala = limpar(dados.get("sala"))
    encarregado = so_digitos(dados.get("encarregado"))
    ocorrencia = limpar(dados.get("ocorrencia"))

    try:
        classe = int(texto_de(dados.get("classe")))
    except ValueError:
        classe = 0

    erros = {}
    if len(nome) < 3:
        erros["nome"] = "Escreve o nome completo do aluno, com pelo menos 3 letras."
    elif len(nome) > config.MAX_NOME:
        erros["nome"] = f"Usa no máximo {config.MAX_NOME} caracteres."

    if not config.CLASSE_MINIMA <= classe <= config.CLASSE_MAXIMA:
        erros["classe"] = "Escolhe a classe do aluno."

    if not turma:
        erros["turma"] = "Indica a turma, por exemplo A."
    elif len(turma) > config.MAX_TURMA:
        erros["turma"] = f"Usa no máximo {config.MAX_TURMA} caracteres."

    if not sala:
        erros["sala"] = "Indica a sala, por exemplo 12."
    elif len(sala) > config.MAX_SALA:
        erros["sala"] = f"Usa no máximo {config.MAX_SALA} caracteres."

    if len(encarregado) != 9:
        erros["encarregado"] = "O número do encarregado deve ter 9 dígitos, por exemplo 923 456 789."

    if len(ocorrencia) > config.MAX_OCORRENCIA:
        erros["ocorrencia"] = f"Usa no máximo {config.MAX_OCORRENCIA} caracteres."

    # Mesmo nome (sem contar acentos nem maiúsculas) na mesma classe e turma
    if not any(c in erros for c in ("nome", "classe", "turma")):
        nome_normalizado = normalizar(nome)
        for outro in alunos:
            if (outro["id"] != id_actual
                    and normalizar(outro["nome"]) == nome_normalizado
                    and outro["classe"] == classe
                    and outro["turma"] == turma):
                erros["nome"] = "Já existe um aluno com este nome na mesma classe e turma."
                break

    if erros:
        raise ErroValidacao(erros)

    return {
        "nome": nome,
        "sala": sala,
        "classe": classe,
        "turma": turma,
        "encarregado": encarregado,
        "ocorrencia": ocorrencia,
    }


def registar_aluno(dados):
    with ficheiro_alunos.BLOQUEIO:
        alunos = ficheiro_alunos.ler_alunos()
        aluno = validar_aluno(dados, alunos)
        aluno["id"] = ficheiro_alunos.proximo_id(alunos)
        alunos.append(aluno)
        ficheiro_alunos.gravar_alunos(alunos)
        return aluno


def editar_aluno(id_aluno, dados):
    with ficheiro_alunos.BLOQUEIO:
        alunos = ficheiro_alunos.ler_alunos()
        posicao = next((i for i, a in enumerate(alunos) if a["id"] == id_aluno), None)
        if posicao is None:
            raise NaoEncontrado()
        aluno = validar_aluno(dados, alunos, id_actual=id_aluno)
        aluno["id"] = id_aluno
        alunos[posicao] = aluno
        ficheiro_alunos.gravar_alunos(alunos)
        return aluno


def apagar_aluno(id_aluno):
    with ficheiro_alunos.BLOQUEIO:
        alunos = ficheiro_alunos.ler_alunos()
        restantes = [a for a in alunos if a["id"] != id_aluno]
        if len(restantes) == len(alunos):
            raise NaoEncontrado()
        ficheiro_alunos.gravar_alunos(restantes)
