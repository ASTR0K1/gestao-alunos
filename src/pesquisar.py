"""Pesquisa de alunos: lê o txt, filtra, ordena e devolve uma página de resultados.

A pesquisa por nome:
  * ignora acentos e maiúsculas ("joao" encontra "João");
  * aceita as palavras por qualquer ordem ("silva manuel" encontra "João Manuel Silva");
  * perdoa erros de escrita: letra a mais, a menos, trocada ou duas letras invertidas
    ("Jaoo", "Silvaa", "Manoel" encontram o João Manuel Silva);
  * põe primeiro o que mais se parece com o que foi escrito (relevância);
  * se não encontra nada, sugere nomes parecidos ("Querias dizer...?").
"""

import difflib
from collections import Counter, namedtuple

import ficheiro_alunos
from utilitarios import (NaoEncontrado, chave_natural, distancia, formatar_telefone,
                         normalizar, palavras, parecenca, tolerancia)

# Como ordenar cada coluna. O nome serve sempre de desempate.
CHAVES_ORDEM = {
    "id": lambda a: a["id"],
    "nome": lambda a: normalizar(a["nome"]),
    "classe": lambda a: (a["classe"], chave_natural(a["turma"]), normalizar(a["nome"])),
    "turma": lambda a: (chave_natural(a["turma"]), a["classe"], normalizar(a["nome"])),
    "sala": lambda a: (chave_natural(a["sala"]), normalizar(a["nome"])),
}

# Acima disto dois nomes contam como "parecidos" (aviso ao registar)
PARECENCA_MINIMA = 0.88

Preparado = namedtuple("Preparado", "nome palavras_nome palavras_outros")


def _preparar(aluno):
    """Os textos do aluno, já sem acentos, prontos para comparar com o que se escreveu."""
    telefone = aluno["encarregado"]
    outros = palavras(" ".join([
        aluno["sala"], aluno["turma"], str(aluno["classe"]),
        telefone, formatar_telefone(telefone), aluno["ocorrencia"],
    ]))
    # "sala12", "turmab", "classe7": é o que fica quando se escreve "sala 12", "turma B",
    # "classe 7". Assim "sala 12" não apanha quem é só da classe 12.
    for rotulo, valor in (("sala", aluno["sala"]), ("turma", aluno["turma"]), ("classe", aluno["classe"])):
        outros.append(rotulo + "".join(palavras(valor)))
    return Preparado(" ".join(palavras(aluno["nome"])), palavras(aluno["nome"]), outros)


ROTULOS = ("sala", "turma", "classe")


def _termos_da_pesquisa(texto):
    brutos = palavras(texto)
    # +244 923 456 789 (ou 244923456789): o indicativo não conta
    if (len(brutos) > 1 and brutos[0] == "244" and all(t.isdigit() for t in brutos[1:])
            and sum(len(t) for t in brutos[1:]) >= 6):
        brutos = brutos[1:]
    termos = []
    i = 0
    while i < len(brutos):
        termo = brutos[i]
        if len(termo) == 12 and termo.startswith("244") and termo.isdigit():
            termo = termo[3:]
        if termo in ROTULOS and i + 1 < len(brutos):
            termo += brutos[i + 1]                  # "sala" "12" -> "sala12"
            i += 1
        termos.append(termo)
        i += 1
    return termos


def _pontuar_termo(p, termo):
    """Quanto vale uma palavra pesquisada para este aluno. Devolve (pontos, palavra do
    nome que bateu só aproximadamente, ou None). 0 pontos = não encontrou."""
    melhor = 0
    for palavra in p.palavras_nome:
        if palavra == termo:
            return 100, None                      # a palavra inteira
        if palavra.startswith(termo):
            melhor = 85                           # o princípio de uma palavra
    if melhor:
        return melhor, None
    if len(termo) >= 3 and termo in p.nome:
        return 60, None                           # no meio de uma palavra do nome
    if termo in p.palavras_outros:
        return 50, None                           # sala, turma, telefone ou ocorrência
    if len(termo) >= 3 and any(termo in outra for outra in p.palavras_outros):
        return 40, None

    # Último recurso: erro de escrita num nome (só para palavras de 4 letras ou mais)
    if len(termo) >= 4 and not termo.isdigit():
        limite = tolerancia(len(termo))
        menor, parecida = limite + 1, None
        for palavra in p.palavras_nome:
            erros = distancia(termo, palavra, limite)
            if len(termo) >= 5 and len(palavra) > len(termo):   # quem ainda está a escrever
                erros = min(erros, distancia(termo, palavra[:len(termo)], limite))
            if erros < menor:
                menor, parecida = erros, palavra
        if parecida is not None:
            return 30 - 6 * menor, parecida
    return 0, None


def _pontuar(p, termos):
    """Pontuação do aluno para tudo o que foi escrito, ou None se alguma palavra falha."""
    total = 0
    aproximadas = []
    for termo in termos:
        pontos, parecida = _pontuar_termo(p, termo)
        if not pontos:
            return None
        total += pontos
        if parecida:
            aproximadas.append(parecida)
    pontuacao = total / len(termos)
    juntos = " ".join(termos)
    if p.nome == juntos:
        pontuacao += 30                           # o nome completo, tal e qual
    elif p.nome.startswith(juntos):
        pontuacao += 15
    return pontuacao, aproximadas


def _sugerir(base, termos):
    """Nomes parecidos com o que foi escrito, para quando não há resultados."""
    consulta = " ".join(termos)
    candidatos = {}
    for aluno in base:
        nome = " ".join(palavras(aluno["nome"]))
        melhor = 0.0
        for alvo in [nome] + (nome.split() if len(termos) == 1 else []):
            comparador = difflib.SequenceMatcher(None, consulta, alvo, autojunk=False)
            if comparador.real_quick_ratio() < 0.6 or comparador.quick_ratio() < 0.6:
                continue
            melhor = max(melhor, comparador.ratio())
        if melhor >= 0.6:
            candidatos[aluno["nome"]] = max(melhor, candidatos.get(aluno["nome"], 0))
    ordenados = sorted(candidatos.items(), key=lambda par: (-par[1], normalizar(par[0])))
    return [nome for nome, _ in ordenados[:3]]


def pesquisar(texto="", classe=None, turma="", so_ocorrencia=False,
              ordem="nome", descendente=False, pagina=1, por_pagina=10):
    todos = ficheiro_alunos.ler_alunos()

    # As turmas do filtro dependem da classe escolhida
    turmas = sorted(
        {a["turma"] for a in todos if classe is None or a["classe"] == classe},
        key=chave_natural)

    base = [a for a in todos
            if (classe is None or a["classe"] == classe)
            and (not turma or a["turma"] == turma)
            and (not so_ocorrencia or a["ocorrencia"])]

    termos = _termos_da_pesquisa(texto)
    pontuacoes = {}
    if termos:
        encontrados = []
        for aluno in base:
            resultado = _pontuar(_preparar(aluno), termos)
            if resultado is not None:
                pontuacoes[aluno["id"]] = resultado
                encontrados.append(aluno)
    else:
        encontrados = list(base)

    if ordem == "relevancia" and termos:
        encontrados.sort(key=lambda a: (-pontuacoes[a["id"]][0], normalizar(a["nome"])))
        ordem_usada = "relevancia"
    else:
        ordem_usada = ordem if ordem in CHAVES_ORDEM else "nome"
        encontrados.sort(key=CHAVES_ORDEM[ordem_usada], reverse=descendente)

    total = len(encontrados)
    por_pagina = max(5, min(50, por_pagina))
    paginas = max(1, -(-total // por_pagina))     # divisão a arredondar para cima
    pagina = max(1, min(pagina, paginas))
    inicio = (pagina - 1) * por_pagina
    da_pagina = encontrados[inicio:inicio + por_pagina]

    # O que o ecrã deve realçar: o que foi escrito e as palavras do nome que bateram
    # só aproximadamente (para "Silvaa" realçar "Silva").
    destaques = set(termos)
    aproximados = []
    for aluno in da_pagina:
        parecidas = pontuacoes.get(aluno["id"], (0, []))[1]
        if parecidas:
            aproximados.append(aluno["id"])
            destaques.update(parecidas)

    return {
        "alunos": da_pagina,
        "total": total,
        "pagina": pagina,
        "paginas": paginas,
        "por_pagina": por_pagina,
        "turmas": turmas,
        "existem_alunos": len(todos) > 0,
        "ordem_usada": ordem_usada,
        "destaques": sorted(destaques),
        "aproximados": aproximados,
        "sugestoes": _sugerir(base, termos) if termos and not encontrados else [],
    }


def semelhantes(nome, classe=None, turma="", ignorar_id=None):
    """Alunos com nome igual ou muito parecido (para avisar antes de registar)."""
    alvo = " ".join(palavras(nome))
    if len(alvo) < 5:
        return []
    resultado = []
    for aluno in ficheiro_alunos.ler_alunos():
        if aluno["id"] == ignorar_id:
            continue
        valor = parecenca(nome, aluno["nome"], minimo=PARECENCA_MINIMA)
        if valor < PARECENCA_MINIMA:
            continue
        resultado.append({
            "id": aluno["id"],
            "nome": aluno["nome"],
            "classe": aluno["classe"],
            "turma": aluno["turma"],
            "sala": aluno["sala"],
            "exacto": " ".join(palavras(aluno["nome"])) == alvo,
            "mesma_turma": aluno["classe"] == classe and aluno["turma"] == turma,
            "parecenca": round(valor, 3),
        })
    resultado.sort(key=lambda r: (-r["parecenca"], normalizar(r["nome"])))
    return resultado[:5]


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
    todos, ignoradas = ficheiro_alunos.ler_alunos_e_ignoradas()
    com_ocorrencia = [a for a in todos if a["ocorrencia"]]
    por_classe = Counter(a["classe"] for a in todos)
    ocorrencias_por_classe = Counter(a["classe"] for a in com_ocorrencia)

    turmas = {}
    for aluno in todos:
        turmas.setdefault((aluno["classe"], aluno["turma"]), []).append(aluno)
    lista_de_turmas = []
    for (classe, turma), alunos in sorted(turmas.items(), key=lambda par: (par[0][0], chave_natural(par[0][1]))):
        salas = [sala for sala, _ in Counter(a["sala"] for a in alunos).most_common(3)]
        lista_de_turmas.append({
            "classe": classe,
            "turma": turma,
            "total": len(alunos),
            "com_ocorrencia": sum(1 for a in alunos if a["ocorrencia"]),
            "salas": salas,
        })

    return {
        "total": len(todos),
        "com_ocorrencia": len(com_ocorrencia),
        "turmas": len(turmas),
        "lista_de_turmas": lista_de_turmas,
        "por_classe": [
            {"classe": c, "total": por_classe[c], "com_ocorrencia": ocorrencias_por_classe[c]}
            for c in sorted(por_classe)
        ],
        "ocorrencias_recentes": sorted(com_ocorrencia, key=lambda a: a["id"], reverse=True)[:5],
        "recentes": sorted(todos, key=lambda a: a["id"], reverse=True)[:5],
        "linhas_ignoradas": ignoradas,
    }
