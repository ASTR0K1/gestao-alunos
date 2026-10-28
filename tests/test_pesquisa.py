"""A pesquisa: acentos, ordem das palavras, erros de escrita, relevância, filtros e páginas."""

import random
import unittest

import registar
from ajuda import ComBdTemporaria, aluno
import pesquisar

PRIMEIROS = ["Ana", "João", "Maria", "Pedro", "Beatriz", "Carlos", "Domingas", "Eduardo", "Filomena",
             "Gonçalo", "Helena", "Isabel", "Joaquim", "Kiala", "Luzia", "Manuel", "Nzinga", "Osvaldo",
             "Paulina", "Quintino", "Rosalina", "Sebastião", "Teresa", "Ulisses", "Vitória", "Wilson",
             "Ximena", "Yara", "Zacarias", "Álvaro", "Inês", "Cláudia", "Fernando", "Gabriela", "Henrique"]
APELIDOS = ["Silva", "Costa", "Manuel", "Pereira", "Fernandes", "Gonçalves", "Mateus", "Domingos",
            "Cardoso", "Sebastião", "Ferreira", "Almeida", "Rodrigues", "Baptista", "Quissanga",
            "Mendes", "Tavares", "Cardoso", "Lopes", "Nascimento", "Kiala", "Vieira", "Bento", "Neto"]


def nomes_de_teste(quantos=130, semente=2026):
    """Nomes completos diferentes, sempre os mesmos para a mesma semente."""
    sorteio = random.Random(semente)
    nomes = set()
    while len(nomes) < quantos:
        partes = [sorteio.choice(PRIMEIROS), sorteio.choice(APELIDOS), sorteio.choice(APELIDOS)]
        if len(set(partes)) == 3:
            nomes.add(" ".join(partes))
    return sorted(nomes)


def com_um_erro(palavra, sorteio):
    """A palavra com um erro de escrita: letra a mais, a menos, trocada ou duas letras invertidas."""
    tipo = sorteio.choice(["apagar", "inserir", "trocar", "inverter"])
    i = sorteio.randrange(1, len(palavra) - 1)        # o primeiro erro não é logo na 1.ª letra
    if tipo == "apagar":
        return palavra[:i] + palavra[i + 1:]
    if tipo == "inserir":
        return palavra[:i] + sorteio.choice("aeiourstn") + palavra[i:]
    if tipo == "trocar":
        nova = sorteio.choice([c for c in "abcdefghilmnoprstuv" if c != palavra[i]])
        return palavra[:i] + nova + palavra[i + 1:]
    if palavra[i] == palavra[i + 1]:
        return palavra
    return palavra[:i] + palavra[i + 1] + palavra[i] + palavra[i + 2:]


class PesquisaComAlunos(ComBdTemporaria):
    def setUp(self):
        super().setUp()
        for nome, classe, turma, sala, enc, oc in [
            ("João Manuel Silva", 7, "B", "12", "923456789", "Chegou atrasado"),
            ("Ana Beatriz Costa", 9, "A", "3", "934000111", ""),
            ("Carlos Pedro", 12, "C", "20", "912345678", "Problemas de comportamento recorrentes"),
            ("Álvaro Dias", 7, "B", "12", "923000999", ""),
            ("Beatriz Lopes", 7, "A", "2", "923000998", "Esqueceu o material"),
        ]:
            registar.registar_aluno(aluno(nome, classe, turma, sala, enc, oc))

    def nomes(self, texto, **filtros):
        return [a["nome"] for a in pesquisar.pesquisar(texto=texto, **filtros)["alunos"]]


class TestPesquisaBasica(PesquisaComAlunos):
    def test_sem_acentos_nem_maiusculas(self):
        self.assertEqual(self.nomes("joao"), ["João Manuel Silva"])
        self.assertEqual(self.nomes("JOÃO"), ["João Manuel Silva"])
        self.assertEqual(self.nomes("alvaro"), ["Álvaro Dias"])
        self.assertEqual(self.nomes("Álvaro"), ["Álvaro Dias"])

    def test_palavras_por_qualquer_ordem(self):
        self.assertEqual(self.nomes("silva manuel"), ["João Manuel Silva"])
        self.assertEqual(self.nomes("costa ana"), ["Ana Beatriz Costa"])

    def test_inicio_de_palavra_e_meio(self):
        self.assertEqual(self.nomes("man"), ["João Manuel Silva"])
        self.assertEqual(self.nomes("anuel"), ["João Manuel Silva"])

    def test_todas_as_palavras_tem_de_bater(self):
        self.assertEqual(self.nomes("joao costa"), [])

    def test_telefone_com_ou_sem_espacos_e_com_indicativo(self):
        for escrito in ["923 456", "923456", "923456789", "+244 923 456 789", "923-456"]:
            self.assertEqual(self.nomes(escrito), ["João Manuel Silva"], escrito)

    def test_sala_turma_e_ocorrencia(self):
        self.assertEqual(self.nomes("sala 12"), ["Álvaro Dias", "João Manuel Silva"])
        self.assertEqual(self.nomes("sala 20"), ["Carlos Pedro"])
        self.assertEqual(self.nomes("classe 12"), ["Carlos Pedro"])          # "12" também é uma sala
        self.assertEqual(self.nomes("turma b"), ["Álvaro Dias", "João Manuel Silva"])
        self.assertEqual(self.nomes("classe 7 turma a"), ["Beatriz Lopes"])
        self.assertEqual(self.nomes("12"), ["Álvaro Dias", "Carlos Pedro", "João Manuel Silva"])   # sala 12 ou classe 12
        self.assertEqual(self.nomes("atras"), ["João Manuel Silva"])
        self.assertEqual(self.nomes("comportamento"), ["Carlos Pedro"])

    def test_sem_texto_lista_todos_por_ordem_alfabetica(self):
        self.assertEqual(self.nomes(""),
                         ["Álvaro Dias", "Ana Beatriz Costa", "Beatriz Lopes", "Carlos Pedro", "João Manuel Silva"])

    def test_nada_encontrado(self):
        resposta = pesquisar.pesquisar(texto="xyzxyz")
        self.assertEqual((resposta["total"], resposta["alunos"], resposta["sugestoes"]), (0, [], []))
        self.assertTrue(resposta["existem_alunos"])


class TestErrosDeEscrita(PesquisaComAlunos):
    def test_erros_comuns(self):
        for escrito in ["jaoo", "joaoo", "silvaa", "silv", "manoel", "manuell", "Joao Manoel Silva", "alvro", "beatris"]:
            self.assertTrue(self.nomes(escrito), escrito)

    def test_aproximados_vem_marcados_e_com_a_palavra_certa_para_realcar(self):
        resposta = pesquisar.pesquisar(texto="silvaa")
        self.assertEqual(resposta["aproximados"], [resposta["alunos"][0]["id"]])
        self.assertIn("silva", resposta["destaques"])
        self.assertIn("silvaa", resposta["destaques"])

    def test_resultado_exacto_nao_e_marcado_como_aproximado(self):
        self.assertEqual(pesquisar.pesquisar(texto="silva")["aproximados"], [])

    def test_palavras_curtas_nao_inventam_resultados(self):
        self.assertEqual(self.nomes("ana"), ["Ana Beatriz Costa"])
        self.assertEqual(self.nomes("anb"), [])
        self.assertEqual(self.nomes("jo"), ["João Manuel Silva"])       # princípio de palavra
        self.assertEqual(self.nomes("xo"), [])

    def test_palavra_curta_completa_nao_traz_outro_nome_parecido(self):
        # "joao" é um nome inteiro: não deve trazer "Joaquim" só porque começa por "joa"
        registar.registar_aluno(aluno("Joaquim Bento Neto", classe=10, turma="A"))
        self.assertEqual(self.nomes("joao"), ["João Manuel Silva"])
        self.assertEqual(pesquisar.pesquisar(texto="joao")["aproximados"], [])
        # mas quem ainda está a escrever uma palavra longa continua a ser encontrado
        self.assertEqual(self.nomes("joaquin"), ["Joaquim Bento Neto"])
        self.assertEqual(self.nomes("beatrixs"), ["Ana Beatriz Costa", "Beatriz Lopes"])

    def test_digitos_nunca_sao_adivinhados(self):
        self.assertEqual(self.nomes("923456780"), [])

    def test_sugestoes_quando_nao_ha_resultados(self):
        resposta = pesquisar.pesquisar(texto="joaum silva")
        self.assertEqual(resposta["total"], 0)
        self.assertEqual(resposta["sugestoes"], ["João Manuel Silva"])
        self.assertEqual(pesquisar.pesquisar(texto="joao")["sugestoes"], [])    # só com 0 resultados

    def test_o_exacto_vem_antes_do_aproximado(self):
        registar.registar_aluno(aluno("Maria Silvaa Neto", classe=8, turma="D"))
        ordem = self.nomes("silva", ordem="relevancia")
        self.assertEqual(ordem[0], "João Manuel Silva")
        self.assertIn("Maria Silvaa Neto", ordem)


class TestRelevancia(PesquisaComAlunos):
    def test_nome_completo_vence_a_palavra_solta(self):
        registar.registar_aluno(aluno("Beatriz Lopes Mateus", classe=8, turma="D"))
        registar.registar_aluno(aluno("Maria Beatriz Santos", classe=8, turma="D"))
        ordem = self.nomes("beatriz lopes", ordem="relevancia")
        self.assertEqual(ordem[0], "Beatriz Lopes")                       # o nome exacto
        self.assertEqual(ordem[1], "Beatriz Lopes Mateus")                # começa por ele
        ordem = self.nomes("beatriz", ordem="relevancia")
        self.assertEqual(len(ordem), 4)
        # os nomes que começam por "Beatriz" vêm antes dos que a têm a meio
        self.assertLess(ordem.index("Beatriz Lopes"), ordem.index("Maria Beatriz Santos"))
        self.assertLess(ordem.index("Beatriz Lopes Mateus"), ordem.index("Ana Beatriz Costa"))

    def test_sem_pesquisa_a_relevancia_cai_para_o_nome(self):
        resposta = pesquisar.pesquisar(texto="", ordem="relevancia")
        self.assertEqual(resposta["ordem_usada"], "nome")


class TestFiltrosOrdemEPaginas(PesquisaComAlunos):
    def test_filtros(self):
        resposta = pesquisar.pesquisar(classe=7)
        self.assertEqual((resposta["total"], resposta["turmas"]), (3, ["A", "B"]))
        self.assertEqual(pesquisar.pesquisar(classe=7, turma="B")["total"], 2)
        self.assertEqual(pesquisar.pesquisar(so_ocorrencia=True)["total"], 3)
        self.assertEqual(self.nomes("beatriz", classe=7), ["Beatriz Lopes"])

    def test_ordens(self):
        self.assertEqual([a["classe"] for a in pesquisar.pesquisar(ordem="classe", descendente=True)["alunos"]],
                         [12, 9, 7, 7, 7])
        self.assertEqual([a["sala"] for a in pesquisar.pesquisar(ordem="sala")["alunos"]],
                         ["2", "3", "12", "12", "20"])            # 2 antes de 12
        self.assertEqual(pesquisar.pesquisar(ordem="perigoso")["ordem_usada"], "nome")

    def test_paginas_fora_do_limite_sao_corrigidas(self):
        resposta = pesquisar.pesquisar(pagina=99, por_pagina=5)
        self.assertEqual((resposta["pagina"], resposta["paginas"]), (1, 1))
        self.assertEqual(pesquisar.pesquisar(pagina=-3)["pagina"], 1)
        self.assertEqual(pesquisar.pesquisar(por_pagina=1000)["por_pagina"], 50)

    def test_paginacao(self):
        for i in range(13):
            registar.registar_aluno(aluno(f"Turma Cinco {chr(65 + i)}{chr(97 + i)}", classe=5, turma="D", sala=str(i + 1)))
        resposta = pesquisar.pesquisar(por_pagina=5, pagina=2)
        self.assertEqual((resposta["total"], resposta["paginas"], len(resposta["alunos"])), (18, 4, 5))
        self.assertEqual(len(pesquisar.pesquisar(por_pagina=5, pagina=4)["alunos"]), 3)


class TestResumoETurma(PesquisaComAlunos):
    def test_resumo(self):
        r = pesquisar.resumo()
        self.assertEqual((r["total"], r["com_ocorrencia"], r["turmas"], r["linhas_ignoradas"]), (5, 3, 4, 0))
        self.assertEqual([t["total"] for t in r["lista_de_turmas"]], [1, 2, 1, 1])     # 7A, 7B, 9A, 12C
        self.assertEqual([(t["classe"], t["turma"]) for t in r["lista_de_turmas"]],
                         [(7, "A"), (7, "B"), (9, "A"), (12, "C")])
        self.assertEqual([a["nome"] for a in r["recentes"]][0], "Beatriz Lopes")
        self.assertEqual([a["nome"] for a in r["ocorrencias_recentes"]], ["Beatriz Lopes", "Carlos Pedro", "João Manuel Silva"])

    def test_resumo_conta_linhas_estragadas(self):
        with open(self.pasta / "bd" / "alunos.txt", "a", encoding="utf-8") as f:
            f.write("lixo sem colunas\n")
        self.assertEqual(pesquisar.resumo()["linhas_ignoradas"], 1)

    def test_info_da_turma(self):
        self.assertEqual(pesquisar.info_turma(7, "B"), {"total": 2, "sala_habitual": "12"})
        self.assertEqual(pesquisar.info_turma(1, "Z"), {"total": 0, "sala_habitual": None})


class TestGarantiaDeEncontrarTodos(ComBdTemporaria):
    """O teste que importa: qualquer aluno registado tem de ser encontrado, escrito como for."""

    @classmethod
    def setUpClass(cls):
        cls.nomes = nomes_de_teste()

    def setUp(self):
        super().setUp()
        for i, nome in enumerate(self.nomes):
            registar.registar_aluno(aluno(nome, classe=1 + i % 13, turma="ABCD"[i % 4], sala=str(1 + i % 25),
                                          encarregado=f"92{i:07d}"))
        self.alunos = pesquisar.pesquisar(por_pagina=50)["total"]

    def encontra(self, texto, nome):
        resposta = pesquisar.pesquisar(texto=texto, por_pagina=50)
        return nome in [a["nome"] for a in resposta["alunos"]], resposta

    def test_registados_todos(self):
        self.assertEqual(self.alunos, len(self.nomes))
        self.assertGreaterEqual(len(self.nomes), 100)

    def test_nome_completo_escrito_de_varias_maneiras(self):
        for nome in self.nomes:
            for escrito in (nome, nome.lower(), nome.upper(), "  " + nome.replace(" ", "   ") + " ",
                            " ".join(reversed(nome.split()))):
                achou, _ = self.encontra(escrito, nome)
                self.assertTrue(achou, f"{escrito!r} não encontrou {nome!r}")

    def test_nome_completo_o_aluno_e_o_primeiro(self):
        for nome in self.nomes:
            resposta = pesquisar.pesquisar(texto=nome, ordem="relevancia", por_pagina=50)
            self.assertEqual(resposta["alunos"][0]["nome"], nome, nome)

    def test_sem_acentos(self):
        import unicodedata
        for nome in self.nomes:
            sem = "".join(c for c in unicodedata.normalize("NFD", nome) if not unicodedata.combining(c))
            achou, _ = self.encontra(sem, nome)
            self.assertTrue(achou, f"{sem!r} não encontrou {nome!r}")

    def test_cada_palavra_sozinha(self):
        for nome in self.nomes:
            for palavra in nome.split():
                achou, resposta = self.encontra(palavra, nome)
                self.assertTrue(achou, f"{palavra!r} não encontrou {nome!r} (total {resposta['total']})")

    def test_um_erro_de_escrita_em_qualquer_palavra(self):
        sorteio = random.Random(7)
        verificados = 0
        for nome in self.nomes:
            partes = nome.split()
            for posicao, palavra in enumerate(partes):
                if len(palavra) < 5:
                    continue
                errada = com_um_erro(palavra, sorteio)
                if len(errada) < 4 or errada == palavra:
                    continue
                verificados += 1
                escrito = " ".join(partes[:posicao] + [errada] + partes[posicao + 1:])
                for texto in (errada, escrito):
                    achou, resposta = self.encontra(texto, nome)
                    self.assertTrue(achou, f"{texto!r} (de {nome!r}) não encontrou o aluno")
                resposta = pesquisar.pesquisar(texto=escrito, ordem="relevancia", por_pagina=50)
                self.assertEqual(resposta["alunos"][0]["nome"], nome, f"{escrito!r} devia pôr {nome!r} primeiro")
        self.assertGreater(verificados, 150)       # o teste não pode ficar vazio sem darmos por isso

    def test_telefone_encontra_o_aluno(self):
        for i, nome in enumerate(self.nomes):
            achou, _ = self.encontra(f"92{i:07d}", nome)
            self.assertTrue(achou, nome)

    def test_paginando_aparecem_todos_uma_so_vez(self):
        vistos = []
        pagina = 1
        while True:
            resposta = pesquisar.pesquisar(pagina=pagina, por_pagina=7)
            vistos += [a["id"] for a in resposta["alunos"]]
            if pagina >= resposta["paginas"]:
                break
            pagina += 1
        self.assertEqual(len(vistos), len(self.nomes))
        self.assertEqual(len(set(vistos)), len(self.nomes))


if __name__ == "__main__":
    unittest.main()
