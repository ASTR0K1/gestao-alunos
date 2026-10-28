"""O alunos.txt: ler com tolerância, gravar sem perder nada, cópias de segurança."""

import os
import time
import unittest
from unittest import mock

from ajuda import ComBdTemporaria, aluno   # tem de vir primeiro: prepara o caminho para src
import config
import ficheiro_alunos
import registar


class TestLeitura(ComBdTemporaria):
    def test_sem_ficheiro_a_lista_e_vazia(self):
        self.assertEqual(ficheiro_alunos.ler_alunos(), [])

    def test_utf8_com_e_sem_bom(self):
        linha = "1;João Manuel Silva;12;7;B;923456789;Chegou atrasado\n"
        for codificacao in ("utf-8", "utf-8-sig"):
            self.escrever_txt(linha, codificacao)
            lidos = ficheiro_alunos.ler_alunos()
            self.assertEqual(lidos[0]["nome"], "João Manuel Silva", codificacao)
            self.assertEqual(lidos[0]["id"], 1, codificacao)   # o BOM não estraga a primeira coluna

    def test_ficheiro_antigo_em_ansi(self):
        self.escrever_txt("1;João Gonçalves;12;7;B;923456789;Não trouxe o material\n", "cp1252")
        lidos = ficheiro_alunos.ler_alunos()
        self.assertEqual(lidos[0]["nome"], "João Gonçalves")
        self.assertEqual(lidos[0]["ocorrencia"], "Não trouxe o material")

    def test_fins_de_linha_do_windows_e_linhas_vazias(self):
        self.escrever_txt("1;Ana Costa;1;5;A;923000001;\r\n\r\n2;Rui Neto;2;5;A;923000002;\r\n")
        self.assertEqual([a["id"] for a in ficheiro_alunos.ler_alunos()], [1, 2])

    def test_linhas_estragadas_sao_contadas(self):
        self.escrever_txt(
            "1;Ana Costa;1;5;A;923000001;\n"
            "isto não é uma linha\n"
            "x;Rui Neto;2;5;A;923000002;\n"          # número que não é número
            "3;Rui Neto;2;sete;A;923000002;\n"       # classe que não é número
            "0;Rui Neto;2;5;A;923000002;\n"          # número 0 não vale
            "6;Paulo Dias;3;5;A;923000003\n")        # sem coluna da ocorrência: aceita-se
        alunos, ignoradas = ficheiro_alunos.ler_alunos_e_ignoradas()
        self.assertEqual([a["nome"] for a in alunos], ["Ana Costa", "Paulo Dias"])
        self.assertEqual(ignoradas, 4)

    def test_ponto_e_virgula_na_ocorrencia_nao_perde_texto(self):
        self.escrever_txt("1;Ana Costa;1;5;A;923000001;Chegou tarde;falou alto\n")
        self.assertEqual(ficheiro_alunos.ler_alunos()[0]["ocorrencia"], "Chegou tarde;falou alto")

    def test_numeros_repetidos_recebem_numero_novo_sempre_igual(self):
        self.escrever_txt("1;Ana Costa;1;5;A;923000001;\n1;Rui Neto;2;5;A;923000002;\n5;Eva Lima;3;5;A;923000003;\n")
        primeira = [(a["id"], a["nome"]) for a in ficheiro_alunos.ler_alunos()]
        segunda = [(a["id"], a["nome"]) for a in ficheiro_alunos.ler_alunos()]
        self.assertEqual(primeira, segunda)
        self.assertEqual(len({i for i, _ in primeira}), 3)

    def test_proximo_id(self):
        self.assertEqual(ficheiro_alunos.proximo_id([]), 1)
        self.assertEqual(ficheiro_alunos.proximo_id([{"id": 3}, {"id": 9}]), 10)


class TestEscrita(ComBdTemporaria):
    def setUp(self):
        super().setUp()
        registar.registar_aluno(aluno("Ana Costa"))
        registar.registar_aluno(aluno("Rui Neto", turma="B"))

    def test_ficheiro_com_sete_colunas_e_utf8(self):
        linhas = self.ler_txt().decode("utf-8").strip().split("\n")
        self.assertEqual(len(linhas), 2)
        self.assertTrue(all(l.count(";") == 6 for l in linhas))
        self.assertEqual(self.ficheiros_temporarios(), [])

    def test_falha_ao_trocar_o_ficheiro_nao_estraga_nada(self):
        # É o que acontece no Windows quando o Excel tem o alunos.txt aberto.
        antes = self.ler_txt()
        with mock.patch("ficheiro_alunos.os.replace", side_effect=PermissionError("em uso")), \
                mock.patch("ficheiro_alunos.time.sleep"):
            with self.assertRaises(OSError):
                registar.registar_aluno(aluno("Eva Lima", turma="C"))
        self.assertEqual(self.ler_txt(), antes)
        self.assertEqual(self.ficheiros_temporarios(), [])
        # e depois do problema passar, tudo volta a funcionar
        registar.registar_aluno(aluno("Eva Lima", turma="C"))
        self.assertEqual(len(ficheiro_alunos.ler_alunos()), 3)

    def test_bloqueio_passageiro_do_antivirus_e_ultrapassado(self):
        verdadeiro = os.replace
        chamadas = []

        def falha_duas_vezes(origem, destino):
            chamadas.append(1)
            if len(chamadas) <= 2:
                raise PermissionError("antivírus")
            return verdadeiro(origem, destino)

        with mock.patch("ficheiro_alunos.os.replace", side_effect=falha_duas_vezes), \
                mock.patch("ficheiro_alunos.time.sleep"):
            registar.registar_aluno(aluno("Eva Lima", turma="C"))
        self.assertEqual(len(ficheiro_alunos.ler_alunos()), 3)

    def test_gravacao_que_nao_confere_repoe_o_ficheiro(self):
        antes = self.ler_txt()
        original = ficheiro_alunos._texto_dos_alunos

        def texto_estragado(alunos):
            return original(alunos).split("\n")[0] + "\n"      # "perde" todas as outras linhas

        with mock.patch("ficheiro_alunos._texto_dos_alunos", side_effect=texto_estragado):
            with self.assertRaises(OSError) as erro:
                registar.registar_aluno(aluno("Eva Lima", turma="C"))
        self.assertIn("repos", str(erro.exception))
        self.assertEqual(self.ler_txt(), antes)

    def test_escrita_em_paralelo_nao_perde_registos(self):
        import threading
        erros = []

        def registar_um(i):
            try:
                registar.registar_aluno(aluno(f"Paralelo Nome{chr(97 + i)}", turma="P", sala=str(i)))
            except Exception as e:      # noqa: BLE001
                erros.append(e)

        fios = [threading.Thread(target=registar_um, args=(i,)) for i in range(15)]
        [f.start() for f in fios]
        [f.join() for f in fios]
        self.assertEqual(erros, [])
        alunos = ficheiro_alunos.ler_alunos()
        self.assertEqual(len(alunos), 17)
        self.assertEqual(len({a["id"] for a in alunos}), 17)


class TestCopias(ComBdTemporaria):
    def test_copia_antes_de_alterar_e_limite_de_um_minuto(self):
        registar.registar_aluno(aluno("Ana Costa"))                 # ainda não havia ficheiro: sem cópia
        self.assertFalse(config.PASTA_COPIAS.exists())
        registar.registar_aluno(aluno("Rui Neto"))                  # primeira cópia
        registar.registar_aluno(aluno("Eva Lima"))                  # menos de 1 minuto: não faz outra
        self.assertEqual(len(list(config.PASTA_COPIAS.glob("alunos-*.txt"))), 1)

    def test_copia_tem_o_conteudo_de_antes(self):
        registar.registar_aluno(aluno("Ana Costa"))
        antes = self.ler_txt()
        registar.registar_aluno(aluno("Rui Neto"))
        copia = next(config.PASTA_COPIAS.glob("alunos-*.txt"))
        self.assertEqual(copia.read_bytes(), antes)

    def test_apagar_obriga_a_copia(self):
        registar.registar_aluno(aluno("Ana Costa"))
        registar.registar_aluno(aluno("Rui Neto"))                  # cópia 1
        antes = self.ler_txt()
        registar.apagar_aluno(1)                                    # cópia 2, mesmo sem passar 1 minuto
        copias = sorted(config.PASTA_COPIAS.glob("alunos-*.txt"))
        self.assertEqual(len(copias), 2)
        self.assertEqual(copias[-1].read_bytes(), antes)

    def test_so_ficam_as_mais_recentes(self):
        config.MAX_COPIAS = 3
        registar.registar_aluno(aluno("Ana Costa"))
        for i in range(6):
            ficheiro_alunos.fazer_copia(forcar=True)
            time.sleep(0.002)
        self.assertEqual(len(list(config.PASTA_COPIAS.glob("alunos-*.txt"))), 3)

    def test_ficheiro_vazio_nao_gera_copia(self):
        self.escrever_txt("")
        self.assertIsNone(ficheiro_alunos.fazer_copia(forcar=True))


if __name__ == "__main__":
    unittest.main()
