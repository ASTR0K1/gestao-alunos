"""Regras dos nomes e funções de texto."""

import unittest

import ajuda  # noqa: F401  (prepara o caminho para a pasta src)
from utilitarios import (arrumar_nome, distancia, erro_de_nome, formatar_telefone, limpar,
                         normalizar, palavras, parecenca, so_digitos, tolerancia)


class TestArrumarNome(unittest.TestCase):
    def test_maiusculas_certas(self):
        casos = {
            "joão manuel silva": "João Manuel Silva",
            "JOÃO MANUEL SILVA": "João Manuel Silva",
            "joão manuel DA silva": "João Manuel da Silva",
            "maria dos santos": "Maria dos Santos",
            "ana-maria d'almeida": "Ana-Maria D'Almeida",
            "  ana    costa  ": "Ana Costa",
            "McDonald costa": "McDonald Costa",     # maiúsculas no meio ficam como foram escritas
            "de souza": "De Souza",                  # a partícula no início do nome leva maiúscula
            "tIAGO dA sILVA": "Tiago da Silva",      # Caps Lock trocado
            "mARIA d'ALMEIDA": "Maria D'Almeida",
            "d'Almeida costa": "d'Almeida Costa",    # 'd' sozinho antes do apóstrofo não é Caps Lock trocado
            "iNÊS": "Inês",
        }
        for entrada, esperado in casos.items():
            self.assertEqual(arrumar_nome(entrada), esperado, entrada)

    def test_tira_lixo_do_copiar_e_colar(self):
        self.assertEqual(arrumar_nome("Ana\u00a0Costa\u200b"), "Ana Costa")
        self.assertEqual(arrumar_nome("Ana\nCosta\t"), "Ana Costa")
        self.assertEqual(arrumar_nome("Ana;Costa"), "Ana,Costa")   # ';' nunca chega ao ficheiro
        self.assertEqual(arrumar_nome("Joa\u0303o Silva"), "Jo\u00e3o Silva")      # acento "separado" da letra
        self.assertEqual(arrumar_nome(None), "")
        self.assertEqual(arrumar_nome(["lista"]), "")


class TestErroDeNome(unittest.TestCase):
    def test_nomes_validos(self):
        for nome in ["Ana Costa", "A. Costa", "João Manuel da Silva", "Ana-Maria D'Almeida",
                     "Ana C", "Zé Kiala", "Nzinga Mbande"]:
            self.assertIsNone(erro_de_nome(nome), nome)

    def test_precisa_de_nome_e_apelido(self):
        for nome in ["", "Ana", "- -", ". .", "Maria"]:
            self.assertIn("nome completo", erro_de_nome(nome), repr(nome))

    def test_so_letras(self):
        for nome in ["Ana 2 Costa", "Ana_Costa", "Ana@Costa", "<b>Ana</b> Costa", "Ana/Costa", "Ana 7"]:
            self.assertIn("só pode ter letras", erro_de_nome(nome), nome)

    def test_tamanho_maximo(self):
        self.assertIsNone(erro_de_nome("A" * 39 + " " + "B" * 40))
        self.assertIn("máximo", erro_de_nome("A" * 40 + " " + "B" * 40))

    def test_modo_menos_exigente_para_restaurar(self):
        self.assertIsNone(erro_de_nome("Joao", estrito=False))
        self.assertIsNone(erro_de_nome("Aluno 07", estrito=False))
        self.assertIsNotNone(erro_de_nome("", estrito=False))
        self.assertIn("máximo", erro_de_nome("x" * 81, estrito=False))


class TestTexto(unittest.TestCase):
    def test_normalizar_e_palavras(self):
        self.assertEqual(normalizar("João"), "joao")
        self.assertEqual(normalizar("ÁLVARO Cônsul"), "alvaro consul")
        self.assertEqual(palavras("João da Silva-Neto"), ["joao", "da", "silva", "neto"])

    def test_limpar(self):
        self.assertEqual(limpar("a;b\r\nc"), "a,b c")
        self.assertEqual(limpar("  muitos   espaços "), "muitos espaços")
        self.assertEqual(limpar(True), "")

    def test_telefone(self):
        self.assertEqual(so_digitos("+244 923 456 789"), "923456789")
        self.assertEqual(so_digitos("(923) 456-789"), "923456789")
        self.assertEqual(so_digitos("244923456789"), "923456789")
        self.assertEqual(formatar_telefone("923456789"), "923 456 789")


class TestDistancia(unittest.TestCase):
    def test_um_erro(self):
        for a, b in [("joao", "jaoo"),       # letras trocadas
                     ("silva", "silvaa"),    # letra a mais
                     ("silva", "silv"),      # letra a menos
                     ("manuel", "manoel"),   # letra diferente
                     ("pedro", "perdo")]:    # duas letras invertidas
            self.assertEqual(distancia(a, b, 1), 1, (a, b))
            self.assertEqual(distancia(b, a, 1), 1, (b, a))

    def test_igual_e_longe(self):
        self.assertEqual(distancia("silva", "silva", 2), 0)
        self.assertEqual(distancia("abcdef", "uvwxyz", 1), 2)      # passou do limite: limite + 1
        self.assertEqual(distancia("a", "abcdef", 2), 3)           # tamanhos muito diferentes

    def test_tolerancia(self):
        self.assertEqual([tolerancia(n) for n in (1, 3, 4, 7, 8, 12)], [0, 0, 1, 1, 2, 2])


class TestParecenca(unittest.TestCase):
    def test_nomes_parecidos(self):
        self.assertGreaterEqual(parecenca("João Manuel Silva", "joao manuel silvaa"), 0.88)
        self.assertGreaterEqual(parecenca("Silva Manuel João", "João Manuel Silva"), 0.88)  # outra ordem
        self.assertGreaterEqual(parecenca("Álvaro Dias", "Alvaro Dias"), 0.88)

    def test_nomes_diferentes(self):
        self.assertLess(parecenca("João Manuel Silva", "Ana Beatriz Costa"), 0.88)
        self.assertEqual(parecenca("João Manuel Silva", "Ana Beatriz Costa", minimo=0.88), 0.0)


if __name__ == "__main__":
    unittest.main()
