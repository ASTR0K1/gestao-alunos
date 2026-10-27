"""Funções de texto e erros partilhados pelos outros módulos."""

import re
import unicodedata

import config


class ErroValidacao(Exception):
    """Dados inválidos. `campos` diz o que corrigir em cada campo do formulário."""

    def __init__(self, campos, mensagem="Corrige os campos assinalados."):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.campos = campos


class NaoEncontrado(Exception):
    """O aluno pedido não existe."""


def texto_de(valor):
    """Aceita só texto ou números vindos do JSON; qualquer outra coisa vira ''."""
    if isinstance(valor, bool):
        return ""
    if isinstance(valor, (str, int)):
        return str(valor)
    return ""


def limpar(valor):
    """Prepara um texto para guardar no txt.

    Tira caracteres de controlo e quebras de linha, troca ';' por ',' (para não
    estragar as colunas do ficheiro) e junta espaços repetidos.
    """
    texto = texto_de(valor)
    texto = re.sub(r"[\x00-\x1f\x7f]+", " ", texto)
    texto = texto.replace(config.SEPARADOR, ",")
    return re.sub(r"\s+", " ", texto).strip()


def normalizar(valor):
    """Minúsculas e sem acentos: 'João' -> 'joao'. Serve para comparar e pesquisar."""
    texto = unicodedata.normalize("NFD", texto_de(valor))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return texto.lower()


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
