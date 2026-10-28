"""Registar, editar, apagar, desfazer e avisar de nomes parecidos."""

import unittest

import ficheiro_alunos
import pesquisar
import registar
from ajuda import ComBdTemporaria, aluno
from utilitarios import ErroValidacao, NaoEncontrado


class TestRegistar(ComBdTemporaria):
    def test_registo_normal_arruma_os_dados(self):
        novo = registar.registar_aluno(aluno("joão manuel DA silva", classe="7", turma="b", sala=" 12 ",
                                             encarregado="+244 923 456 789",
                                             ocorrencia="Chegou atrasado; faltou\nà prova"))
        self.assertEqual(novo["id"], 1)
        self.assertEqual(novo["nome"], "João Manuel da Silva")
        self.assertEqual((novo["classe"], novo["turma"], novo["sala"]), (7, "B", "12"))
        self.assertEqual(novo["encarregado"], "923456789")
        self.assertEqual(novo["ocorrencia"], "Chegou atrasado, faltou à prova")
        self.assertEqual(ficheiro_alunos.ler_alunos(), [novo])

    def test_formulario_vazio_da_um_erro_por_campo(self):
        with self.assertRaises(ErroValidacao) as e:
            registar.registar_aluno({})
        self.assertEqual(set(e.exception.campos), {"nome", "classe", "turma", "sala", "encarregado"})

    def test_cada_campo_tem_o_seu_limite(self):
        with self.assertRaises(ErroValidacao) as e:
            registar.registar_aluno(aluno("x" * 90, classe=14, turma="T" * 11, sala="S" * 11,
                                          encarregado="123", ocorrencia="y" * 501))
        self.assertEqual(set(e.exception.campos), {"nome", "classe", "turma", "sala", "encarregado", "ocorrencia"})

    def test_tipos_estranhos_no_json_nao_rebentam(self):
        with self.assertRaises(ErroValidacao):
            registar.registar_aluno({"nome": ["lista"], "classe": {"a": 1}, "turma": None,
                                     "sala": True, "encarregado": 923456789})
        with self.assertRaises(ErroValidacao):
            registar.registar_aluno([1, 2, 3])

    def test_telefone_pode_vir_como_numero(self):
        self.assertEqual(registar.registar_aluno(aluno("Ana Costa", encarregado=923456789))["encarregado"], "923456789")

    def test_ids_crescem_e_nao_voltam_atras(self):
        registar.registar_aluno(aluno("Ana Costa"))
        registar.registar_aluno(aluno("Rui Neto"))
        registar.apagar_aluno(1)
        self.assertEqual(registar.registar_aluno(aluno("Eva Lima"))["id"], 3)

    def test_nome_repetido_na_mesma_turma_e_recusado(self):
        registar.registar_aluno(aluno("João Manuel Silva", classe=7, turma="B"))
        for tentativa in ["JOAO MANUEL SILVA", "joão  manuel   silva", "Joao Manuel Silva"]:
            with self.assertRaises(ErroValidacao) as e:
                registar.registar_aluno(aluno(tentativa, classe=7, turma="b"))
            self.assertIn("nome", e.exception.campos, tentativa)
        # outra turma ou outra classe: pode ser outra pessoa com o mesmo nome
        registar.registar_aluno(aluno("João Manuel Silva", classe=7, turma="C"))
        registar.registar_aluno(aluno("João Manuel Silva", classe=8, turma="B"))
        self.assertEqual(len(ficheiro_alunos.ler_alunos()), 3)


class TestEditarApagarRestaurar(ComBdTemporaria):
    def setUp(self):
        super().setUp()
        registar.registar_aluno(aluno("João Manuel Silva", classe=7, turma="B", sala="12"))
        registar.registar_aluno(aluno("Álvaro Dias", classe=7, turma="B", sala="12"))

    def test_editar(self):
        editado = registar.editar_aluno(1, aluno("João Manuel Silva", classe=7, turma="B", sala="14"))
        self.assertEqual((editado["id"], editado["sala"]), (1, "14"))
        self.assertEqual(pesquisar.obter_aluno(1)["sala"], "14")
        self.assertEqual(pesquisar.obter_aluno(2)["sala"], "12")      # o outro não foi tocado

    def test_editar_sem_mudar_o_nome_nao_e_duplicado_de_si_proprio(self):
        registar.editar_aluno(1, aluno("João Manuel Silva", classe=7, turma="B", sala="3"))

    def test_editar_para_nome_de_outro_e_recusado(self):
        with self.assertRaises(ErroValidacao) as e:
            registar.editar_aluno(1, aluno("Alvaro Dias", classe=7, turma="B"))
        self.assertIn("nome", e.exception.campos)

    def test_editar_ou_apagar_quem_nao_existe(self):
        with self.assertRaises(NaoEncontrado):
            registar.editar_aluno(99, aluno("Fantasma Teste"))
        with self.assertRaises(NaoEncontrado):
            registar.apagar_aluno(99)
        with self.assertRaises(NaoEncontrado):
            pesquisar.obter_aluno(99)

    def test_apagar_devolve_o_aluno_e_desfazer_repoe_com_o_mesmo_numero(self):
        apagado = registar.apagar_aluno(1)
        self.assertEqual(apagado["nome"], "João Manuel Silva")
        self.assertEqual([a["id"] for a in ficheiro_alunos.ler_alunos()], [2])
        de_volta = registar.restaurar_aluno(apagado)
        self.assertEqual(de_volta, apagado)
        self.assertEqual([a["id"] for a in ficheiro_alunos.ler_alunos()], [1, 2])

    def test_desfazer_com_numero_ocupado_usa_o_proximo(self):
        apagado = registar.apagar_aluno(1)
        registar.registar_aluno(aluno("Eva Lima"))                      # fica com o número 3
        registar.apagar_aluno(3)
        registar.registar_aluno(aluno("Outra Pessoa"))                  # volta a ser o 3
        de_volta = registar.restaurar_aluno(dict(apagado, id=3))
        self.assertEqual(de_volta["id"], 4)

    def test_desfazer_aluno_antigo_com_nome_de_uma_palavra(self):
        self.escrever_txt("1;Joao;5;7;B;923456789;\n")
        apagado = registar.apagar_aluno(1)
        self.assertEqual(registar.restaurar_aluno(apagado)["nome"], "Joao")

    def test_desfazer_nao_aceita_lixo(self):
        with self.assertRaises(ErroValidacao):
            registar.restaurar_aluno({"id": 5, "nome": "", "classe": 7})


class TestSemelhantes(ComBdTemporaria):
    def setUp(self):
        super().setUp()
        registar.registar_aluno(aluno("João Manuel Silva", classe=7, turma="B"))
        registar.registar_aluno(aluno("Ana Beatriz Costa", classe=9, turma="A"))

    def test_igual_sem_acentos(self):
        encontrados = pesquisar.semelhantes("JOAO MANUEL SILVA", 7, "B")
        self.assertEqual(len(encontrados), 1)
        self.assertTrue(encontrados[0]["exacto"])
        self.assertTrue(encontrados[0]["mesma_turma"])

    def test_quase_igual(self):
        for escrito in ["João Manuel Silvaa", "Joao Manoel Silva", "Silva Manuel João", "João Manuel Sila"]:
            encontrados = pesquisar.semelhantes(escrito, 7, "B")
            self.assertEqual([e["nome"] for e in encontrados], ["João Manuel Silva"], escrito)
            self.assertFalse(encontrados[0]["exacto"], escrito)

    def test_aviso_diz_se_e_da_mesma_turma(self):
        self.assertFalse(pesquisar.semelhantes("João Manuel Silvaa", 8, "C")[0]["mesma_turma"])

    def test_nomes_diferentes_nao_avisam(self):
        self.assertEqual(pesquisar.semelhantes("Pedro Kiala Mateus", 7, "B"), [])
        self.assertEqual(pesquisar.semelhantes("João Pedro Silva", 7, "B"), [])
        self.assertEqual(pesquisar.semelhantes("Ana", 7, "B"), [])         # curto demais para comparar
        self.assertEqual(pesquisar.semelhantes("", 7, "B"), [])

    def test_ao_editar_nao_avisa_do_proprio(self):
        self.assertEqual(pesquisar.semelhantes("João Manuel Silva", 7, "B", ignorar_id=1), [])


if __name__ == "__main__":
    unittest.main()
