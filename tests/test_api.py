"""A API contra o servidor verdadeiro, ligado numa cópia temporária do projecto.

Os testes correm por ordem (test_01, test_02...) porque cada um continua do que o anterior deixou.
"""

import http.client
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CODIGO = "segredo123"


def porta_livre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Cliente:
    def __init__(self, porta):
        self.porta = porta
        self.cookie = None

    def pedir(self, metodo, caminho, corpo=None, cabecalhos=None, bruto=None, marca=True):
        ligacao = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=10)
        h = {"X-Requested-With": "fetch"} if marca else {}
        if self.cookie:
            h["Cookie"] = self.cookie
        h.update(cabecalhos or {})
        dados = None
        if corpo is not None:
            dados = json.dumps(corpo).encode("utf-8")
            h["Content-Type"] = "application/json"
        if bruto is not None:
            dados = bruto
        ligacao.request(metodo, caminho, body=dados, headers=h)
        r = ligacao.getresponse()
        texto = r.read()
        sc = r.getheader("Set-Cookie")
        if sc:
            valor = sc.split(";")[0]
            self.cookie = valor if not valor.endswith("=") else None
        try:
            js = json.loads(texto.decode("utf-8"))
        except ValueError:
            js = None
        ligacao.close()
        return r.status, js, r, texto


def aluno(nome, classe=7, turma="A", sala="1", encarregado="923000000", ocorrencia=""):
    return {"nome": nome, "classe": classe, "turma": turma, "sala": sala,
            "encarregado": encarregado, "ocorrencia": ocorrencia}


class TestAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="projecto-"))
        shutil.copytree(RAIZ / "src", cls.tmp / "src", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(RAIZ / "public", cls.tmp / "public")
        (cls.tmp / "bd").mkdir()
        (cls.tmp / "segredo-fora-de-public.txt").write_text("NAO DEVE SER SERVIDO")
        (cls.tmp / "public" / "fonts").mkdir(exist_ok=True)
        (cls.tmp / "public" / "fonts" / "teste.woff2").write_bytes(b"wOF2 falso")
        cls.porta = porta_livre()
        cls.saidas_de_erro = []                   # o que o servidor escreveu como erro, a cada arranque
        cls.arrancar()
        cls.c = Cliente(cls.porta)

    @classmethod
    def arrancar(cls):
        cls.servidor = subprocess.Popen(
            [sys.executable, str(cls.tmp / "src" / "servidor.py")],
            env=dict(os.environ, ALUNOS_PORTA=str(cls.porta)),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for _ in range(60):                       # espera até o servidor responder
            try:
                socket.create_connection(("127.0.0.1", cls.porta), timeout=0.2).close()
                return
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("o servidor não arrancou")

    @classmethod
    def parar(cls):
        """Pára o servidor e guarda o que ele escreveu como erro."""
        if cls.servidor is None:
            return
        cls.servidor.terminate()
        try:
            _, erros = cls.servidor.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            cls.servidor.kill()
            _, erros = cls.servidor.communicate()
        cls.saidas_de_erro.append(erros.decode("utf-8", "replace"))
        cls.servidor = None

    @classmethod
    def tearDownClass(cls):
        cls.parar()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def txt(self):
        return (self.tmp / "bd" / "alunos.txt").read_text(encoding="utf-8")

    # ---------------------------------------------------------------- site e segurança

    def test_01_ficheiros_do_site(self):
        c = self.c
        s, js, r, _ = c.pedir("GET", "/api/estado")
        self.assertEqual((s, js), (200, {"coordenador_existe": False, "autenticado": False, "nome": None}))
        s, _, r, corpo = c.pedir("GET", "/")
        self.assertEqual(s, 200)
        self.assertIn("text/html", r.getheader("Content-Type"))
        self.assertIn("default-src 'self'", r.getheader("Content-Security-Policy"))
        self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff")
        s, _, r, _ = c.pedir("GET", "/css/estilo.css")
        self.assertIn("text/css", r.getheader("Content-Type"))
        self.assertEqual(r.getheader("Cache-Control"), "no-store")
        for js_ in sorted((RAIZ / "public" / "js").glob("*.js")):
            s, _, r, _ = c.pedir("GET", "/js/" + js_.name)
            self.assertEqual(s, 200, js_.name)
            self.assertIn("javascript", r.getheader("Content-Type"), js_.name)
        s, _, r, _ = c.pedir("GET", "/fonts/teste.woff2")
        self.assertEqual(r.getheader("Content-Type"), "font/woff2")
        self.assertIn("max-age", r.getheader("Cache-Control"))       # as letras ficam guardadas

    def test_02_nada_fora_de_public(self):
        for caminho in ["/../src/config.py", "/..%2fsrc/config.py", "/%2e%2e/segredo-fora-de-public.txt",
                        "/../bd/alunos.txt", "/src/config.py", "/bd/alunos.txt", "/..%2f..%2fetc/passwd",
                        "/%00", "/../../../../etc/passwd", "/bd/coordenador.txt", "/bd/copias/"]:
            s, _, _, corpo = self.c.pedir("GET", caminho)
            self.assertEqual(s, 404, caminho)
            self.assertNotIn(b"NAO DEVE", corpo)
            self.assertNotIn(b"root:", corpo)

    def test_03_api_protegida_sem_sessao(self):
        for metodo, caminho in [("GET", "/api/alunos"), ("GET", "/api/resumo"), ("POST", "/api/alunos"),
                                ("GET", "/api/alunos/1"), ("DELETE", "/api/alunos/1"), ("PUT", "/api/alunos/1"),
                                ("GET", "/api/turma?classe=1&turma=A"), ("GET", "/api/semelhantes?nome=Ana+Costa"),
                                ("POST", "/api/restaurar")]:
            s, _, _, _ = self.c.pedir(metodo, caminho, corpo={} if metodo in ("POST", "PUT") else None)
            self.assertEqual(s, 401, f"{metodo} {caminho}")

    def test_04_pedidos_sem_cabecalho_sao_recusados(self):
        s, _, _, _ = self.c.pedir("POST", "/api/criar-acesso", corpo={"nome": "Maria Silva", "codigo": CODIGO},
                                  marca=False)
        self.assertEqual(s, 403)

    # ---------------------------------------------------------------- acesso do coordenador

    def test_05_criar_acesso(self):
        c = self.c
        s, js, _, _ = c.pedir("POST", "/api/criar-acesso", {"nome": "Ma", "codigo": "123"})
        self.assertEqual(s, 422)
        self.assertIn("nome", js["campos"])
        self.assertIn("codigo", js["campos"])
        s, js, r, _ = c.pedir("POST", "/api/criar-acesso", {"nome": "Maria Coordenadora", "codigo": CODIGO})
        self.assertEqual((s, js["nome"]), (201, "Maria Coordenadora"))
        cookie = r.getheader("Set-Cookie")
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        self.assertTrue(c.pedir("GET", "/api/estado")[1]["autenticado"])
        ficheiro = (self.tmp / "bd" / "coordenador.txt").read_text(encoding="utf-8")
        self.assertNotIn(CODIGO, ficheiro)
        s, _, _, _ = Cliente(self.porta).pedir("POST", "/api/criar-acesso", {"nome": "Intruso Qualquer", "codigo": "outrosegredo"})
        self.assertEqual(s, 409)

    # ---------------------------------------------------------------- registar

    def test_10_registar_valida(self):
        c = self.c
        s, js, _, _ = c.pedir("POST", "/api/alunos", {})
        self.assertEqual((s, set(js["campos"])), (422, {"nome", "classe", "turma", "sala", "encarregado"}))
        s, js, _, _ = c.pedir("POST", "/api/alunos", aluno("x" * 90, 14, "A", "1", "123", "y" * 501))
        self.assertEqual(s, 422)
        self.assertLessEqual({"nome", "classe", "encarregado", "ocorrencia"}, set(js["campos"]))
        s, js, _, _ = c.pedir("POST", "/api/alunos", {"nome": ["lista"], "classe": {"a": 1}, "turma": None,
                                                      "sala": True, "encarregado": 923456789})
        self.assertEqual(s, 422)
        s, js, _, _ = c.pedir("POST", "/api/alunos", aluno("Joana", 7, "A", "1", "923000000"))
        self.assertEqual((s, "nome" in js["campos"]), (422, True))          # falta o apelido
        s, js, _, _ = c.pedir("POST", "/api/alunos", aluno("Joana 2 Silva", 7, "A", "1", "923000000"))
        self.assertEqual((s, "nome" in js["campos"]), (422, True))          # números no nome
        self.assertEqual(self.txt() if (self.tmp / "bd" / "alunos.txt").exists() else "", "")   # nada foi gravado

    def test_11_registar(self):
        c = self.c
        s, js, _, _ = c.pedir("POST", "/api/alunos", aluno("joão manuel DA silva", "7", "b", "12", "+244 923 456 789",
                                                          "Chegou atrasado; faltou\nà prova"))
        self.assertEqual(s, 201)
        self.assertEqual((js["id"], js["nome"], js["turma"], js["classe"]), (1, "João Manuel da Silva", "B", 7))
        self.assertEqual(js["encarregado"], "923456789")
        self.assertEqual(js["ocorrencia"], "Chegou atrasado, faltou à prova")
        s, js, _, _ = c.pedir("POST", "/api/alunos", aluno("JOAO manuel DA silva", 7, "B", "3", "923111222"))
        self.assertEqual((s, "nome" in js["campos"]), (422, True))
        for dados in [aluno("Ana Beatriz Costa", 9, "A", "3", "934000111"),
                      aluno("Carlos Pedro", 12, "C", "20", "912345678", "Problemas de comportamento recorrentes"),
                      aluno("Álvaro Dias", 7, "B", "12", "923000999"),
                      aluno("Beatriz Lopes", 7, "A", "2", "923000998", "Esqueceu o material")]:
            self.assertEqual(self.c.pedir("POST", "/api/alunos", dados)[0], 201)
        linhas = self.txt().strip().split("\n")
        self.assertEqual(len(linhas), 5)
        self.assertTrue(all(l.count(";") == 6 for l in linhas))
        self.assertEqual([f for f in os.listdir(self.tmp / "bd") if f.startswith(".alunos-")], [])

    # ---------------------------------------------------------------- pesquisar

    def test_20_pesquisar(self):
        def pesq(consulta):
            s, js, _, _ = self.c.pedir("GET", "/api/alunos" + consulta)
            self.assertEqual(s, 200, consulta)
            return js

        js = pesq("")
        self.assertEqual(js["total"], 5)
        self.assertEqual([a["nome"] for a in js["alunos"]][:2], ["Álvaro Dias", "Ana Beatriz Costa"])
        self.assertEqual(pesq("?q=joao")["total"], 1)
        self.assertEqual(pesq("?q=silva%20manuel")["total"], 1)
        self.assertEqual(pesq("?q=923%20456")["total"], 1)
        self.assertEqual(pesq("?q=%2B244%20923%20456%20789")["total"], 1)
        self.assertEqual(pesq("?q=sala%2012")["total"], 2)
        js = pesq("?q=silvaa")                                  # erro de escrita
        self.assertEqual((js["total"], js["aproximados"]), (1, [js["alunos"][0]["id"]]))
        self.assertIn("silva", js["destaques"])
        js = pesq("?q=joaum%20silva")
        self.assertEqual((js["total"], js["sugestoes"]), (0, ["João Manuel da Silva"]))
        js = pesq("?q=beatriz&ordem=relevancia")
        self.assertEqual(js["ordem_usada"], "relevancia")
        self.assertEqual(js["alunos"][0]["nome"], "Beatriz Lopes")
        js = pesq("?classe=7")
        self.assertEqual((js["total"], js["turmas"]), (3, ["A", "B"]))
        self.assertEqual(pesq("?classe=7&turma=B")["total"], 2)
        self.assertEqual(pesq("?ocorrencia=1")["total"], 3)
        self.assertEqual([a["classe"] for a in pesq("?ordem=classe&dir=desc")["alunos"]], [12, 9, 7, 7, 7])
        self.assertEqual([a["sala"] for a in pesq("?ordem=sala")["alunos"]], ["2", "3", "12", "12", "20"])
        js = pesq("?por_pagina=5&pagina=99&ordem=perigoso")
        self.assertEqual((js["pagina"], js["paginas"], js["ordem_usada"]), (1, 1, "nome"))
        self.assertEqual(pesq("?classe=abc&por_pagina=xyz&pagina=-3")["total"], 5)
        self.assertEqual(pesq("?q=" + "a" * 5000)["total"], 0)       # pesquisa enorme não rebenta

    def test_21_paginacao(self):
        nomes = ["Abel", "Bruno", "Carla", "Dinis", "Elisa", "Fabio", "Gisela", "Hugo", "Iris", "Jorge",
                 "Kelly", "Lucas", "Marta"]
        for i, nome in enumerate(nomes):
            self.assertEqual(self.c.pedir("POST", "/api/alunos", aluno(f"{nome} Teste", 5, "D", str(i + 1), "923000%03d" % i))[0], 201)
        s, js, _, _ = self.c.pedir("GET", "/api/alunos?por_pagina=5&pagina=2")
        self.assertEqual((js["total"], js["paginas"], len(js["alunos"]), js["pagina"]), (18, 4, 5, 2))
        s, js, _, _ = self.c.pedir("GET", "/api/alunos?por_pagina=5&pagina=4")
        self.assertEqual(len(js["alunos"]), 3)

    def test_22_turma_e_resumo(self):
        c = self.c
        self.assertEqual(c.pedir("GET", "/api/turma?classe=7&turma=b")[1], {"total": 2, "sala_habitual": "12"})
        self.assertEqual(c.pedir("GET", "/api/turma?classe=1&turma=Z")[1], {"total": 0, "sala_habitual": None})
        s, js, _, _ = c.pedir("GET", "/api/resumo")
        self.assertEqual((js["total"], js["com_ocorrencia"], js["turmas"], js["linhas_ignoradas"]), (18, 3, 5, 0))
        self.assertEqual(js["por_classe"][0], {"classe": 5, "total": 13, "com_ocorrencia": 0})
        self.assertEqual([a["nome"] for a in js["ocorrencias_recentes"]],
                         ["Beatriz Lopes", "Carlos Pedro", "João Manuel da Silva"])
        self.assertEqual(len(js["recentes"]), 5)
        self.assertEqual({"classe", "turma", "total", "com_ocorrencia", "salas"}, set(js["lista_de_turmas"][0]))

    def test_23_semelhantes(self):
        c = self.c
        s, js, _, _ = c.pedir("GET", "/api/semelhantes?nome=Jo%C3%A3o+Manuel+da+Silvaa&classe=7&turma=b")
        self.assertEqual(s, 200)
        self.assertEqual(len(js["semelhantes"]), 1)
        self.assertEqual(js["semelhantes"][0]["nome"], "João Manuel da Silva")
        self.assertTrue(js["semelhantes"][0]["mesma_turma"])
        self.assertFalse(js["semelhantes"][0]["exacto"])
        self.assertEqual(c.pedir("GET", "/api/semelhantes?nome=Pedro+Kiala+Mateus")[1], {"semelhantes": []})
        self.assertEqual(c.pedir("GET", "/api/semelhantes")[1], {"semelhantes": []})
        self.assertEqual(c.pedir("GET", "/api/semelhantes?nome=Jo%C3%A3o+Manuel+da+Silva&ignorar=1")[1], {"semelhantes": []})
        self.assertEqual(c.pedir("GET", "/api/semelhantes?nome=" + "z" * 4000)[0], 200)

    # ---------------------------------------------------------------- editar, apagar, desfazer

    def test_30_obter_e_editar(self):
        c = self.c
        s, js, _, _ = c.pedir("GET", "/api/alunos/1")
        self.assertEqual((s, js["nome"]), (200, "João Manuel da Silva"))
        self.assertEqual(c.pedir("GET", "/api/alunos/999")[0], 404)
        s, js, _, _ = c.pedir("PUT", "/api/alunos/1", aluno("João Manuel da Silva", 7, "B", "14", "923456789"))
        self.assertEqual((s, js["sala"], js["ocorrencia"], js["id"]), (200, "14", "", 1))
        s, js, _, _ = c.pedir("PUT", "/api/alunos/1", aluno("Álvaro Dias", 7, "B", "14", "923456789"))
        self.assertEqual((s, "nome" in js["campos"]), (422, True))
        self.assertEqual(c.pedir("PUT", "/api/alunos/999", aluno("Fantasma Teste"))[0], 404)

    def test_31_apagar_e_desfazer(self):
        c = self.c
        s, js, _, _ = c.pedir("DELETE", "/api/alunos/2")
        self.assertEqual((s, js["ok"], js["aluno"]["nome"], js["aluno"]["id"]), (200, True, "Ana Beatriz Costa", 2))
        self.assertEqual(c.pedir("DELETE", "/api/alunos/2")[0], 404)
        self.assertEqual(c.pedir("GET", "/api/alunos")[1]["total"], 17)
        copias = list((self.tmp / "bd" / "copias").glob("alunos-*.txt"))
        self.assertTrue(copias, "apagar tem de deixar uma cópia de segurança")
        s, js2, _, _ = c.pedir("POST", "/api/restaurar", js["aluno"])
        self.assertEqual((s, js2["id"], js2["nome"]), (201, 2, "Ana Beatriz Costa"))
        self.assertEqual(c.pedir("GET", "/api/alunos")[1]["total"], 18)
        s, _, _, _ = c.pedir("POST", "/api/restaurar", {"id": 77, "nome": ""})
        self.assertEqual(s, 422)
        s, js, _, _ = c.pedir("POST", "/api/alunos", aluno("Novo Aluno", 1, "A", "1", "923000000"))
        self.assertEqual(js["id"], 19)

    # ---------------------------------------------------------------- pedidos maus

    def test_40_pedidos_maus(self):
        c = self.c
        self.assertEqual(c.pedir("POST", "/api/alunos", bruto=b"isto nao e json")[0], 422)
        self.assertEqual(c.pedir("POST", "/api/alunos", bruto=b"[1,2,3]")[0], 422)
        self.assertEqual(c.pedir("POST", "/api/alunos", bruto=b"{" + b"\"a\":1," * 5000 + b"\"b\":2}")[0], 422)
        self.assertEqual(c.pedir("GET", "/api/nao-existe")[0], 404)
        self.assertIn(c.pedir("PATCH", "/api/alunos/1")[0], (405, 501))
        self.assertEqual(c.pedir("GET", "/api/estado")[0], 200)                 # o servidor aguentou tudo

    def test_41_ficheiro_em_uso_da_aviso_claro_e_nada_se_perde(self):
        c = self.c
        bd = self.tmp / "bd"
        # Um alunos.txt que o servidor não consegue ler nem trocar (o Excel faz isto no Windows).
        (bd / "alunos.txt").rename(bd / "alunos-guardado.txt")
        (bd / "alunos.txt").mkdir()
        try:
            s, js, _, _ = c.pedir("POST", "/api/alunos", aluno("Pedro Kiala Mateus", 3, "A", "1", "923000000"))
            self.assertEqual(s, 503)
            self.assertIn("alunos.txt", js["erro"])
            self.assertIn("Nada foi alterado", js["erro"])
            self.assertEqual(c.pedir("GET", "/api/alunos")[0], 503)
        finally:
            (bd / "alunos.txt").rmdir()
            (bd / "alunos-guardado.txt").rename(bd / "alunos.txt")
        s, js, _, _ = c.pedir("GET", "/api/alunos")
        self.assertEqual((s, js["total"]), (200, 19))                          # voltou ao normal, sem perdas
        self.assertEqual([f for f in os.listdir(bd) if f.startswith(".alunos-")], [])

    # ---------------------------------------------------------------- sessão

    def test_50_sair_e_entrar(self):
        c = self.c
        s, js, r, _ = c.pedir("POST", "/api/sair")
        self.assertEqual(s, 200)
        self.assertIn("Max-Age=0", r.getheader("Set-Cookie"))
        self.assertEqual(c.pedir("GET", "/api/alunos")[0], 401)
        self.assertEqual(Cliente(self.porta).pedir("GET", "/api/alunos", cabecalhos={"Cookie": "sessao=inventado"})[0], 401)
        c2 = Cliente(self.porta)
        s, js, _, _ = c2.pedir("POST", "/api/entrar", {"codigo": "errado"})
        self.assertEqual((s, "codigo" in js["campos"]), (401, True))
        s, js, _, _ = c2.pedir("POST", "/api/entrar", {"codigo": CODIGO})
        self.assertEqual(s, 200)
        self.assertTrue(c2.pedir("GET", "/api/estado")[1]["autenticado"])

    def test_51_travao_de_tentativas(self):
        c3 = Cliente(self.porta)
        codigos = [c3.pedir("POST", "/api/entrar", {"codigo": "x" + str(i)})[0] for i in range(5)]
        s, js, r, _ = c3.pedir("POST", "/api/entrar", {"codigo": CODIGO})
        self.assertEqual(codigos, [401] * 5)
        self.assertEqual(s, 429)
        self.assertTrue(r.getheader("Retry-After"))

    # ---------------------------------------------------------------- persistência e paralelismo

    def test_60_reiniciar_nao_perde_nada(self):
        self.parar()
        self.arrancar()
        c4 = Cliente(self.porta)
        # o travão do passo anterior perdeu-se com o reinício, por isso o código certo entra
        s, _, _, _ = c4.pedir("POST", "/api/entrar", {"codigo": CODIGO})
        self.assertEqual(s, 200)
        type(self).c = c4
        s, js, _, _ = c4.pedir("GET", "/api/alunos")
        self.assertEqual((s, js["total"]), (200, 19))

    def test_61_vinte_registos_em_paralelo(self):
        nomes = ["Abel", "Bruno", "Carla", "Dinis", "Elisa", "Fabio", "Gisela", "Hugo", "Iris", "Jorge",
                 "Kelly", "Lucas", "Marta", "Nuno", "Olga", "Paulo", "Rita", "Sara", "Tiago", "Vera"]
        resultados = []

        def registar_um(i, nome):
            cli = Cliente(self.porta)
            cli.cookie = self.c.cookie
            resultados.append(cli.pedir("POST", "/api/alunos", aluno(f"{nome} Paralelo", 3, "P", str(i), "923555%03d" % i))[0])

        fios = [threading.Thread(target=registar_um, args=(i, n)) for i, n in enumerate(nomes)]
        [f.start() for f in fios]
        [f.join() for f in fios]
        s, js, _, _ = self.c.pedir("GET", "/api/alunos?classe=3&turma=P&por_pagina=50")
        ids = [a["id"] for a in js["alunos"]]
        self.assertEqual(resultados.count(201), 20)
        self.assertEqual((js["total"], len(set(ids))), (20, 20))

    def test_99_servidor_sem_erros(self):
        # Se algum pedido tivesse feito o servidor "rebentar", ficaria um Traceback na saída de erros.
        # Os 503 do teste 41 são esperados e escrevem um OSError: só esses podem aparecer.
        self.parar()
        texto = "\n".join(self.saidas_de_erro)
        tracebacks = texto.count("Traceback")
        esperados = texto.count("IsADirectoryError") + texto.count("PermissionError")
        self.assertLessEqual(tracebacks, esperados, texto[-1500:])


if __name__ == "__main__":
    unittest.main()
