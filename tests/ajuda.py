"""Apoio comum aos testes: põe a pasta src no caminho e dá uma pasta bd temporária."""

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "src"))

import config  # noqa: E402


class ComBdTemporaria(unittest.TestCase):
    """Cada teste usa uma pasta bd nova e vazia, para nunca mexer nos dados verdadeiros."""

    def setUp(self):
        self.pasta = Path(tempfile.mkdtemp(prefix="alunos-teste-"))
        self._original = (config.PASTA_BD, config.FICHEIRO_ALUNOS, config.FICHEIRO_COORDENADOR,
                          config.PASTA_COPIAS, config.MAX_COPIAS, config.INTERVALO_COPIAS)
        config.PASTA_BD = self.pasta / "bd"
        config.FICHEIRO_ALUNOS = config.PASTA_BD / "alunos.txt"
        config.FICHEIRO_COORDENADOR = config.PASTA_BD / "coordenador.txt"
        config.PASTA_COPIAS = config.PASTA_BD / "copias"
        config.PASTA_BD.mkdir()

    def tearDown(self):
        (config.PASTA_BD, config.FICHEIRO_ALUNOS, config.FICHEIRO_COORDENADOR,
         config.PASTA_COPIAS, config.MAX_COPIAS, config.INTERVALO_COPIAS) = self._original
        shutil.rmtree(self.pasta, ignore_errors=True)

    # --- atalhos
    def escrever_txt(self, conteudo, codificacao="utf-8"):
        config.FICHEIRO_ALUNOS.write_bytes(conteudo.encode(codificacao))

    def ler_txt(self):
        return config.FICHEIRO_ALUNOS.read_bytes()

    def ficheiros_temporarios(self):
        return [p.name for p in config.PASTA_BD.glob(".alunos-*.tmp")]


def aluno(nome, classe=7, turma="A", sala="1", encarregado="923000000", ocorrencia=""):
    """Dados de um aluno como chegam do formulário."""
    return {"nome": nome, "classe": classe, "turma": turma, "sala": sala,
            "encarregado": encarregado, "ocorrencia": ocorrencia}
