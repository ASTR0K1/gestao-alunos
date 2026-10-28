"""Configuração do sistema: caminhos, formato do ficheiro txt e limites."""

import os
from pathlib import Path

# --- Pastas e ficheiros -----------------------------------------------------
PASTA_BASE = Path(__file__).resolve().parent.parent   # gestao-alunos/
PASTA_BD = PASTA_BASE / "bd"
PASTA_PUBLIC = PASTA_BASE / "public"

FICHEIRO_ALUNOS = PASTA_BD / "alunos.txt"
FICHEIRO_COORDENADOR = PASTA_BD / "coordenador.txt"
PASTA_COPIAS = PASTA_BD / "copias"

# --- Cópias de segurança do alunos.txt ----------------------------------------
# Antes de cada alteração guarda-se uma cópia em bd/copias/. Para não encher a pasta
# durante um registo seguido, faz-se no máximo uma por minuto (excepto antes de apagar).
MAX_COPIAS = 50
INTERVALO_COPIAS = 60            # segundos

# --- Formato do alunos.txt --------------------------------------------------
# Cada linha: id;nome;sala;classe;turma;encarregado;ocorrencia
SEPARADOR = ";"

# --- Servidor ---------------------------------------------------------------
# 127.0.0.1 = só este computador. Para outros computadores da escola usarem o
# sistema, arranca com:  ALUNOS_ENDERECO=0.0.0.0 python3 src/servidor.py
ENDERECO = os.environ.get("ALUNOS_ENDERECO", "127.0.0.1")
PORTA = int(os.environ.get("ALUNOS_PORTA", "8000"))
TAMANHO_MAXIMO_PEDIDO = 16 * 1024   # bytes

# --- Regras dos dados -------------------------------------------------------
CLASSE_MINIMA = 1
CLASSE_MAXIMA = 13
MAX_NOME = 80
MAX_TURMA = 10
MAX_SALA = 10
MAX_OCORRENCIA = 500
MIN_NOME_COORDENADOR = 3
MAX_NOME_COORDENADOR = 60
MIN_CODIGO = 6
MAX_CODIGO = 64

# --- Sessão e segurança do coordenador --------------------------------------
DURACAO_SESSAO = 8 * 60 * 60     # 8 horas, em segundos
ITERACOES_HASH = 200_000         # custo do PBKDF2 que protege o código
TENTATIVAS_MAXIMAS = 5           # tentativas erradas seguidas...
BLOQUEIO_SEGUNDOS = 60           # ...e espera-se este tempo
