"""Leitura e escrita do ficheiro bd/alunos.txt (a "base de dados").

É o único módulo que mexe no txt. Se um dia trocares o txt por uma base de
dados a sério, só este ficheiro muda.

Formato de cada linha:  id;nome;sala;classe;turma;encarregado;ocorrencia

Garantias:
  * leitura tolerante: aceita UTF-8 com ou sem BOM (o Bloco de Notas e o Excel põem BOM)
    e também ficheiros antigos em ANSI (Windows-1252);
  * escrita segura: grava num ficheiro temporário e só depois troca pelo original;
  * gravação verificada: depois de gravar volta a ler o ficheiro e confere. Se não
    ficou igual, repõe o conteúdo anterior e dá erro em vez de perder dados;
  * cópia de segurança antes de cada alteração (em bd/copias/).
"""

import os
import shutil
import tempfile
import threading
import time
from datetime import datetime

import config

# Só uma operação de cada vez pode ler-e-depois-gravar, senão dois pedidos
# ao mesmo tempo podiam apagar as alterações um do outro.
BLOQUEIO = threading.RLock()


# --- Leitura ------------------------------------------------------------------

def _ler_texto():
    try:
        with open(config.FICHEIRO_ALUNOS, "rb") as ficheiro:
            bruto = ficheiro.read()
    except FileNotFoundError:
        return ""
    try:
        return bruto.decode("utf-8-sig")
    except UnicodeDecodeError:
        return bruto.decode("cp1252", errors="replace")


def ler_alunos_e_ignoradas():
    """Devolve (lista de alunos, número de linhas que não deu para ler)."""
    alunos = []
    ignoradas = 0
    texto = _ler_texto().replace("\r\n", "\n").replace("\r", "\n")

    for linha in texto.split("\n"):
        if not linha.strip():
            continue
        colunas = linha.split(config.SEPARADOR)
        if len(colunas) < 6:
            ignoradas += 1
            continue
        try:
            identificador = int(colunas[0].strip())
            classe = int(colunas[3].strip())
        except ValueError:
            ignoradas += 1
            continue
        if identificador < 1:
            ignoradas += 1
            continue
        alunos.append({
            "id": identificador,
            "nome": colunas[1].strip(),
            "sala": colunas[2].strip(),
            "classe": classe,
            "turma": colunas[4].strip(),
            "encarregado": colunas[5].strip(),
            "ocorrencia": config.SEPARADOR.join(colunas[6:]).strip(),
        })

    # Dois alunos com o mesmo número (ficheiro editado à mão): o segundo recebe um
    # número novo, sempre o mesmo enquanto o ficheiro não mudar.
    usados = set()
    proximo = max((a["id"] for a in alunos), default=0) + 1
    for aluno in alunos:
        if aluno["id"] in usados:
            aluno["id"] = proximo
            proximo += 1
        usados.add(aluno["id"])
    return alunos, ignoradas


def ler_alunos():
    """Devolve a lista de alunos (cada aluno é um dicionário)."""
    return ler_alunos_e_ignoradas()[0]


def proximo_id(alunos):
    return max((a["id"] for a in alunos), default=0) + 1


# --- Cópias de segurança --------------------------------------------------------

def fazer_copia(forcar=False):
    """Guarda uma cópia do alunos.txt actual em bd/copias/. Devolve o caminho, ou None.

    Sem `forcar`, só faz outra se a última tiver mais de um minuto (um registo seguido
    de uma turma não enche a pasta). Mantém as 50 mais recentes.
    """
    origem = config.FICHEIRO_ALUNOS
    if not origem.exists() or origem.stat().st_size == 0:
        return None

    config.PASTA_COPIAS.mkdir(parents=True, exist_ok=True)
    existentes = sorted(config.PASTA_COPIAS.glob("alunos-*.txt"))
    if existentes and not forcar:
        if time.time() - existentes[-1].stat().st_mtime < config.INTERVALO_COPIAS:
            return None

    destino = config.PASTA_COPIAS / ("alunos-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f") + ".txt")
    shutil.copyfile(origem, destino)

    for antiga in sorted(config.PASTA_COPIAS.glob("alunos-*.txt"))[:-config.MAX_COPIAS]:
        try:
            antiga.unlink()
        except OSError:
            pass
    return destino


# --- Escrita ------------------------------------------------------------------

def _texto_dos_alunos(alunos):
    linhas = []
    for aluno in sorted(alunos, key=lambda a: a["id"]):
        colunas = [aluno["id"], aluno["nome"], aluno["sala"], aluno["classe"],
                   aluno["turma"], aluno["encarregado"], aluno["ocorrencia"]]
        linhas.append(config.SEPARADOR.join(str(c) for c in colunas) + "\n")
    return "".join(linhas)


def _escrever_atomico(conteudo):
    """Grava `conteudo` (bytes) no alunos.txt sem nunca o deixar a meio."""
    config.PASTA_BD.mkdir(parents=True, exist_ok=True)
    descritor, caminho_temporario = tempfile.mkstemp(
        dir=config.PASTA_BD, prefix=".alunos-", suffix=".tmp")
    try:
        with os.fdopen(descritor, "wb") as ficheiro:
            ficheiro.write(conteudo)
            ficheiro.flush()
            os.fsync(ficheiro.fileno())
        # No Windows o antivírus pode segurar o ficheiro por instantes: tenta 3 vezes.
        for tentativa in range(3):
            try:
                os.replace(caminho_temporario, config.FICHEIRO_ALUNOS)
                break
            except PermissionError:
                if tentativa == 2:
                    raise
                time.sleep(0.15)
    except BaseException:
        if os.path.exists(caminho_temporario):
            os.remove(caminho_temporario)
        raise


def gravar_alunos(alunos, copia_obrigatoria=False):
    """Grava a lista inteira no txt e confere que ficou bem gravada."""
    with BLOQUEIO:
        antigo = None
        if config.FICHEIRO_ALUNOS.exists():
            antigo = config.FICHEIRO_ALUNOS.read_bytes()
        fazer_copia(forcar=copia_obrigatoria)

        _escrever_atomico(_texto_dos_alunos(alunos).encode("utf-8"))

        esperado = sorted(alunos, key=lambda a: a["id"])
        if ler_alunos() != esperado:
            if antigo is not None:
                _escrever_atomico(antigo)
            raise OSError("A gravação do alunos.txt não ficou igual ao esperado. "
                          "O ficheiro foi reposto como estava.")
