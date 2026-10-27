"""Leitura e escrita do ficheiro bd/alunos.txt (a "base de dados").

É o único módulo que mexe no txt. Se um dia trocares o txt por uma base de
dados a sério, só este ficheiro muda.

Formato de cada linha:  id;nome;sala;classe;turma;encarregado;ocorrencia
"""

import os
import tempfile
import threading

import config

# Só uma operação de cada vez pode ler-e-depois-gravar, senão dois pedidos
# ao mesmo tempo podiam apagar as alterações um do outro.
BLOQUEIO = threading.RLock()


def ler_alunos():
    """Devolve a lista de alunos (cada aluno é um dicionário)."""
    alunos = []
    if not config.FICHEIRO_ALUNOS.exists():
        return alunos

    with BLOQUEIO:
        with open(config.FICHEIRO_ALUNOS, encoding="utf-8") as ficheiro:
            for linha in ficheiro:
                linha = linha.rstrip("\r\n")
                if not linha.strip():
                    continue
                colunas = linha.split(config.SEPARADOR)
                if len(colunas) < 6:
                    continue          # linha incompleta: ignora
                try:
                    alunos.append({
                        "id": int(colunas[0]),
                        "nome": colunas[1],
                        "sala": colunas[2],
                        "classe": int(colunas[3]),
                        "turma": colunas[4],
                        "encarregado": colunas[5],
                        "ocorrencia": config.SEPARADOR.join(colunas[6:]),
                    })
                except ValueError:
                    continue          # id ou classe inválidos: ignora
    return alunos


def gravar_alunos(alunos):
    """Grava a lista inteira no txt.

    Escreve primeiro num ficheiro temporário e só depois substitui o original.
    Assim, se o computador falhar a meio, o alunos.txt nunca fica a metade.
    """
    config.PASTA_BD.mkdir(parents=True, exist_ok=True)
    with BLOQUEIO:
        descritor, caminho_temporario = tempfile.mkstemp(
            dir=config.PASTA_BD, prefix=".alunos-", suffix=".tmp")
        try:
            with os.fdopen(descritor, "w", encoding="utf-8", newline="\n") as ficheiro:
                for aluno in sorted(alunos, key=lambda a: a["id"]):
                    colunas = [
                        aluno["id"], aluno["nome"], aluno["sala"], aluno["classe"],
                        aluno["turma"], aluno["encarregado"], aluno["ocorrencia"],
                    ]
                    ficheiro.write(config.SEPARADOR.join(str(c) for c in colunas) + "\n")
                ficheiro.flush()
                os.fsync(ficheiro.fileno())
            os.replace(caminho_temporario, config.FICHEIRO_ALUNOS)
        except BaseException:
            if os.path.exists(caminho_temporario):
                os.remove(caminho_temporario)
            raise


def proximo_id(alunos):
    return max((a["id"] for a in alunos), default=0) + 1
