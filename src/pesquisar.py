"""Pesquisa de alunos: lê o txt, filtra, ordena e devolve uma página de resultados."""

from collections import Counter

import ficheiro_alunos
from utilitarios import (NaoEncontrado, chave_natural, formatar_telefone,
                         normalizar)

# Como ordenar cada coluna. O nome serve sempre de desempate.
CHAVES_ORDEM = {
    "id": lambda a: a["id"],
    "nome": lambda a: normalizar(a["nome"]),
    "classe": lambda a: (a["classe"], chave_natural(a["turma"]), normalizar(a["nome"])),
    "turma": lambda a: (chave_natural(a["turma"]), a["classe"], normalizar(a["nome"])),
    "sala": lambda a: (chave_natural(a["sala"]), normalizar(a["nome"])),
}


def _texto_de_pesquisa(aluno):
    """Tudo o que a caixa de pesquisa procura, junto num só texto."""
    return normalizar(" ".join([
        aluno["nome"],
        aluno["sala"],
        aluno["encarregado"],
        formatar_telefone(aluno["encarregado"]),
        aluno["ocorrencia"],
    ]))


def pesquisar(texto="", classe=None, turma="", so_ocorrencia=False,
              ordem="nome", descendente=False, pagina=1, por_pagina=10):
    todos = ficheiro_alunos.ler_alunos()

    # As turmas do filtro dependem da classe escolhida
    turmas = sorted(
        {a["turma"] for a in todos if classe is None or a["classe"] == classe},
        key=chave_natural)

    termos = normalizar(texto).split()
    encontrados = []
    for aluno in todos:
        if classe is not None and aluno["classe"] != classe:
            continue
        if turma and aluno["turma"] != turma:
            continue
        if so_ocorrencia and not aluno["ocorrencia"]:
            continue
        if termos:
            palheiro = _texto_de_pesquisa(aluno)
            if not all(t in palheiro for t in termos):
                continue
        encontrados.append(aluno)

    chave = CHAVES_ORDEM.get(ordem, CHAVES_ORDEM["nome"])
    encontrados.sort(key=chave, reverse=descendente)

    total = len(encontrados)
    por_pagina = max(5, min(50, por_pagina))
    paginas = max(1, -(-total // por_pagina))     # divisão a arredondar para cima
    pagina = max(1, min(pagina, paginas))
    inicio = (pagina - 1) * por_pagina

    return {
        "alunos": encontrados[inicio:inicio + por_pagina],
        "total": total,
        "pagina": pagina,
        "paginas": paginas,
        "por_pagina": por_pagina,
        "turmas": turmas,
        "existem_alunos": len(todos) > 0,
    }


def obter_aluno(id_aluno):
    for aluno in ficheiro_alunos.ler_alunos():
        if aluno["id"] == id_aluno:
            return aluno
    raise NaoEncontrado()


def info_turma(classe, turma):
    """Quantos alunos já tem a turma e qual é a sala que mais usam."""
    da_turma = [a for a in ficheiro_alunos.ler_alunos()
                if a["classe"] == classe and a["turma"] == turma]
    salas = Counter(a["sala"] for a in da_turma)
    return {
        "total": len(da_turma),
        "sala_habitual": salas.most_common(1)[0][0] if salas else None,
    }


def resumo():
    """Números do painel inicial."""
    todos = ficheiro_alunos.ler_alunos()
    com_ocorrencia = [a for a in todos if a["ocorrencia"]]
    por_classe = Counter(a["classe"] for a in todos)
    ocorrencias_por_classe = Counter(a["classe"] for a in com_ocorrencia)
    recentes = sorted(com_ocorrencia, key=lambda a: a["id"], reverse=True)[:5]

    return {
        "total": len(todos),
        "com_ocorrencia": len(com_ocorrencia),
        "turmas": len({(a["classe"], a["turma"]) for a in todos}),
        "por_classe": [
            {"classe": c, "total": por_classe[c], "com_ocorrencia": ocorrencias_por_classe[c]}
            for c in sorted(por_classe)
        ],
        "ocorrencias_recentes": recentes,
    }
