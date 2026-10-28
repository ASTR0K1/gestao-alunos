"""Funções de texto e erros partilhados pelos outros módulos."""

import difflib
import re
import unicodedata

import config

# Palavras que ficam em minúsculas dentro de um nome ("Maria da Silva")
PARTICULAS = {"de", "da", "do", "das", "dos", "e"}
# Além de letras, um nome pode ter espaço, apóstrofo, ponto e hífen
CARACTERES_DE_NOME = " '’.-"


class ErroValidacao(Exception):
    """Dados inválidos. `campos` diz o que corrigir em cada campo do formulário."""

    def __init__(self, campos, mensagem="Corrige os campos assinalados."):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.campos = campos


class NaoEncontrado(Exception):
    """O aluno pedido não existe."""


# --- Limpeza de texto ---------------------------------------------------------

def texto_de(valor):
    """Aceita só texto ou números vindos do JSON; qualquer outra coisa vira ''."""
    if isinstance(valor, bool):
        return ""
    if isinstance(valor, (str, int)):
        return str(valor)
    return ""


def limpar(valor):
    """Prepara um texto para guardar no txt.

    Tira caracteres de controlo e quebras de linha (também as "invisíveis" que vêm
    de copiar e colar), troca ';' por ',' (para não estragar as colunas do ficheiro)
    e junta espaços repetidos.
    """
    texto = unicodedata.normalize("NFC", texto_de(valor))     # "a" + "~" passa a "ã" (nomes copiados de um Mac)
    # Caracteres invisíveis (espaço de largura zero, marcas de direcção...) que vêm de copiar
    # do WhatsApp ou do Word: tirá-los evita nomes "iguais" que o computador acha diferentes.
    texto = "".join(c for c in texto if unicodedata.category(c) != "Cf")
    texto = re.sub(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]+", " ", texto)
    texto = texto.replace(config.SEPARADOR, ",")
    return re.sub(r"\s+", " ", texto).strip()


def normalizar(valor):
    """Minúsculas e sem acentos: 'João' -> 'joao'. Serve para comparar e pesquisar."""
    texto = unicodedata.normalize("NFD", texto_de(valor))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return texto.lower()


def palavras(valor):
    """Palavras de um texto, sem acentos nem maiúsculas: 'João da Silva' -> ['joao', 'da', 'silva']."""
    return re.findall(r"[a-z0-9]+", normalizar(valor))


def so_digitos(valor):
    """Fica só com os dígitos. Aceita o prefixo +244 / 244 do número de telefone."""
    digitos = re.sub(r"\D", "", texto_de(valor))
    if len(digitos) == 12 and digitos.startswith("244"):
        digitos = digitos[3:]
    return digitos


def formatar_telefone(digitos):
    """923456789 -> '923 456 789'."""
    if len(digitos) == 9:
        return f"{digitos[:3]} {digitos[3:6]} {digitos[6:]}"
    return digitos


def chave_natural(valor):
    """Para ordenar salas como pessoas: '2' vem antes de '10'."""
    partes = re.split(r"(\d+)", normalizar(valor))
    return [int(p) if p.isdigit() else p for p in partes]


# --- Nomes dos alunos ---------------------------------------------------------

def _capitalizar(palavra):
    """'d'almeida' -> "D'Almeida", 'ana-maria' -> 'Ana-Maria'."""
    return re.sub(r"[^\W\d_]+", lambda m: m.group().capitalize(), palavra)


def _caps_trocado(palavra):
    """'tIAGO': primeira letra minúscula e todas as outras maiúsculas (Caps Lock ligado sem querer)."""
    letras = [c for c in palavra if c.isalpha()]
    return len(letras) >= 2 and letras[0].islower() and all(c.isupper() for c in letras[1:])


def arrumar_nome(valor):
    """Deixa o nome com maiúsculas certas: 'joão DA silva' -> 'João da Silva'.

    Só mexe nas palavras escritas todas em minúsculas, todas em maiúsculas ou com o
    Caps Lock trocado ('tIAGO'). Quem escreveu 'McDonald' ou 'D'Almeida' com maiúsculas
    no meio fica como escreveu.
    """
    resultado = []
    for i, palavra in enumerate(limpar(valor).split(" ")):
        if not palavra:
            continue
        if palavra.islower() or palavra.isupper() or _caps_trocado(palavra):
            minuscula = palavra.lower()
            if i > 0 and minuscula in PARTICULAS:
                palavra = minuscula
            else:
                palavra = _capitalizar(minuscula)
        resultado.append(palavra)
    return " ".join(resultado)


def erro_de_nome(nome, estrito=True):
    """Devolve a mensagem de erro de um nome (já arrumado), ou None se estiver bem.

    Sem `estrito` só se exige que exista e caiba no ficheiro. Serve para voltar a pôr um
    aluno apagado, cujo nome já estava no ficheiro (talvez de antes destas regras).
    """
    if not estrito:
        if not nome:
            return "Escreve o nome completo do aluno: nome e apelido."
        if len(nome) > config.MAX_NOME:
            return f"Usa no máximo {config.MAX_NOME} caracteres."
        return None
    if any(not (c.isalpha() or c in CARACTERES_DE_NOME) for c in nome):
        return "O nome só pode ter letras, espaços, hífen, apóstrofo e ponto."
    com_letras = [p for p in nome.split(" ") if any(c.isalpha() for c in p)]
    if len(com_letras) < 2 or sum(c.isalpha() for c in nome) < 3:
        return "Escreve o nome completo do aluno: nome e apelido."
    if len(nome) > config.MAX_NOME:
        return f"Usa no máximo {config.MAX_NOME} caracteres."
    return None


# --- Erros de escrita ---------------------------------------------------------

def tolerancia(tamanho):
    """Quantos erros de escrita se perdoam numa palavra com este tamanho."""
    if tamanho <= 3:
        return 0
    return 1 if tamanho <= 7 else 2


def distancia(a, b, limite):
    """Número de erros de escrita entre duas palavras: letra a mais, a menos, trocada ou
    duas letras invertidas. Para logo que passa do limite e devolve limite + 1."""
    if a == b:
        return 0
    if abs(len(a) - len(b)) > limite:
        return limite + 1
    antepenultima = None
    anterior = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        actual = [i] + [0] * len(b)
        menor = actual[0]
        for j, cb in enumerate(b, 1):
            valor = min(anterior[j] + 1,                       # letra a mais
                        actual[j - 1] + 1,                     # letra a menos
                        anterior[j - 1] + (ca != cb))          # letra trocada
            if i > 1 and j > 1 and ca == b[j - 2] and a[i - 2] == cb:
                valor = min(valor, antepenultima[j - 2] + 1)   # duas letras invertidas
            actual[j] = valor
            menor = min(menor, valor)
        if menor > limite:
            return limite + 1
        antepenultima, anterior = anterior, actual
    return min(anterior[-1], limite + 1)


def parecenca(nome_a, nome_b, minimo=0.0):
    """Quanto dois nomes se parecem (0 a 1), ignorando acentos, maiúsculas e a ordem das palavras.

    `minimo` serve para despachar depressa os que claramente não se parecem: abaixo dele
    devolve 0.
    """
    palavras_a, palavras_b = palavras(nome_a), palavras(nome_b)
    melhor = 0.0
    for a, b in ((" ".join(palavras_a), " ".join(palavras_b)),
                 (" ".join(sorted(palavras_a)), " ".join(sorted(palavras_b)))):
        comparador = difflib.SequenceMatcher(None, a, b, autojunk=False)
        if comparador.real_quick_ratio() < minimo or comparador.quick_ratio() < minimo:
            continue
        melhor = max(melhor, comparador.ratio())
    return melhor if melhor >= minimo else 0.0
