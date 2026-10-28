"""Servidor do sistema: entrega o site (pasta public/) e a API em /api/.

Para arrancar (a partir da pasta gestao-alunos/):

    python3 src/servidor.py

e abrir  http://localhost:8000  no browser. Para parar: Ctrl+C.

Só usa a biblioteca padrão do Python, não há nada para instalar.
"""

import json
import mimetypes
import re
import sys
import traceback
import webbrowser
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

import config
import coordenador
import pesquisar
import registar
from utilitarios import ErroValidacao, NaoEncontrado

TIPOS_DE_FICHEIRO = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
}

NOME_COOKIE = "sessao"
ROTA_ALUNO = re.compile(r"^/api/alunos/(\d{1,9})$")

CABECALHOS_DE_SEGURANCA = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    # só carrega ficheiros do próprio site (nada de scripts ou estilos de fora)
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; form-action 'self'",
}


def _inteiro(valor, padrao, minimo=None, maximo=None):
    try:
        numero = int(valor)
    except (TypeError, ValueError):
        return padrao
    if minimo is not None:
        numero = max(minimo, numero)
    if maximo is not None:
        numero = min(maximo, numero)
    return numero


class Manipulador(BaseHTTPRequestHandler):
    server_version = "GestaoAlunos/2.0"

    # ---------------------------------------------------------------- entrada

    def do_GET(self):
        self._tratar("GET")

    def do_POST(self):
        self._tratar("POST")

    def do_PUT(self):
        self._tratar("PUT")

    def do_DELETE(self):
        self._tratar("DELETE")

    def _tratar(self, metodo):
        try:
            url = urlsplit(self.path)
            if url.path.startswith("/api/"):
                self._api(metodo, url)
            elif metodo == "GET":
                self._ficheiro_estatico(url.path)
            else:
                self._json(405, {"erro": "Método não permitido."})
        except ErroValidacao as erro:
            self._json(422, {"erro": erro.mensagem, "campos": erro.campos})
        except NaoEncontrado:
            self._json(404, {"erro": "Aluno não encontrado."})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except OSError:
            # Quase sempre é o alunos.txt aberto noutro programa (o Excel, por exemplo)
            traceback.print_exc()
            self._json(503, {"erro": "Não foi possível guardar no ficheiro alunos.txt. "
                                     "Fecha os outros programas que o estejam a usar e tenta outra vez. "
                                     "Nada foi alterado."})
        except Exception:
            traceback.print_exc()
            self._json(500, {"erro": "Erro interno do servidor."})

    # -------------------------------------------------------------- respostas

    def _enviar(self, estado, corpo, tipo, extra=None, cache="no-store"):
        self.send_response(estado)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", cache)
        for nome, valor in CABECALHOS_DE_SEGURANCA.items():
            self.send_header(nome, valor)
        for nome, valor in (extra or {}).items():
            self.send_header(nome, valor)
        self.end_headers()
        self.wfile.write(corpo)

    def _json(self, estado, dados, extra=None):
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self._enviar(estado, corpo, "application/json; charset=utf-8", extra)

    def _cookie_de_sessao(self, token, duracao):
        return {"Set-Cookie": f"{NOME_COOKIE}={token}; Path=/; Max-Age={duracao}; HttpOnly; SameSite=Strict"}

    # ------------------------------------------------------------------ pedido

    def _token(self):
        cabecalho = self.headers.get("Cookie")
        if not cabecalho:
            return None
        cookies = SimpleCookie()
        try:
            cookies.load(cabecalho)
        except Exception:
            return None
        morango = cookies.get(NOME_COOKIE)
        return morango.value if morango else None

    def _corpo_json(self):
        tamanho = _inteiro(self.headers.get("Content-Length"), 0, 0)
        if tamanho > config.TAMANHO_MAXIMO_PEDIDO:
            raise ErroValidacao({}, "Pedido demasiado grande.")
        try:
            dados = json.loads(self.rfile.read(tamanho).decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            raise ErroValidacao({}, "Pedido inválido.")
        if not isinstance(dados, dict):
            raise ErroValidacao({}, "Pedido inválido.")
        return dados

    # --------------------------------------------------------------------- API

    def _api(self, metodo, url):
        caminho = url.path
        consulta = parse_qs(url.query)

        # Contra pedidos vindos de outros sites: quem altera dados tem de enviar
        # este cabeçalho, e um site de fora não o consegue enviar.
        if metodo != "GET" and self.headers.get("X-Requested-With") != "fetch":
            self._json(403, {"erro": "Pedido não permitido."})
            return

        # --- estado e acesso (não precisam de sessão) ---
        if caminho == "/api/estado" and metodo == "GET":
            nome = coordenador.nome_da_sessao(self._token())
            self._json(200, {
                "coordenador_existe": coordenador.existe(),
                "autenticado": nome is not None,
                "nome": nome,
            })
            return

        if caminho == "/api/criar-acesso" and metodo == "POST":
            dados = self._corpo_json()
            nome = coordenador.criar_acesso(dados.get("nome"), dados.get("codigo"))
            if nome is None:
                self._json(409, {"erro": "O acesso do coordenador já foi criado."})
                return
            token = coordenador.abrir_sessao(nome)
            self._json(201, {"nome": nome}, self._cookie_de_sessao(token, config.DURACAO_SESSAO))
            return

        if caminho == "/api/entrar" and metodo == "POST":
            self._entrar()
            return

        if caminho == "/api/sair" and metodo == "POST":
            coordenador.fechar_sessao(self._token())
            self._json(200, {"ok": True}, self._cookie_de_sessao("", 0))
            return

        # --- daqui para baixo só com sessão do coordenador ---
        if coordenador.nome_da_sessao(self._token()) is None:
            self._json(401, {"erro": "A sessão terminou. Entra outra vez."})
            return

        if caminho == "/api/resumo" and metodo == "GET":
            self._json(200, pesquisar.resumo())
            return

        if caminho == "/api/turma" and metodo == "GET":
            classe = _inteiro(consulta.get("classe", [""])[0], 0)
            turma = consulta.get("turma", [""])[0].strip().upper()
            self._json(200, pesquisar.info_turma(classe, turma))
            return

        if caminho == "/api/semelhantes" and metodo == "GET":
            self._json(200, {"semelhantes": pesquisar.semelhantes(
                consulta.get("nome", [""])[0][:config.MAX_NOME * 2],
                _inteiro(consulta.get("classe", [""])[0], None),
                consulta.get("turma", [""])[0].strip().upper(),
                _inteiro(consulta.get("ignorar", [""])[0], None),
            )})
            return

        if caminho == "/api/restaurar" and metodo == "POST":
            self._json(201, registar.restaurar_aluno(self._corpo_json()))
            return

        if caminho == "/api/alunos":
            if metodo == "GET":
                self._listar_alunos(consulta)
            elif metodo == "POST":
                self._json(201, registar.registar_aluno(self._corpo_json()))
            else:
                self._json(405, {"erro": "Método não permitido."})
            return

        encontrado = ROTA_ALUNO.match(caminho)
        if encontrado:
            id_aluno = int(encontrado.group(1))
            if metodo == "GET":
                self._json(200, pesquisar.obter_aluno(id_aluno))
            elif metodo == "PUT":
                self._json(200, registar.editar_aluno(id_aluno, self._corpo_json()))
            elif metodo == "DELETE":
                self._json(200, {"ok": True, "aluno": registar.apagar_aluno(id_aluno)})
            else:
                self._json(405, {"erro": "Método não permitido."})
            return

        self._json(404, {"erro": "Endereço não encontrado."})

    def _entrar(self):
        endereco = self.client_address[0]
        espera = coordenador.segundos_de_espera(endereco)
        if espera:
            self._json(429, {"erro": f"Demasiadas tentativas. Tenta outra vez dentro de {espera} segundos."},
                       {"Retry-After": str(espera)})
            return
        if not coordenador.existe():
            self._json(409, {"erro": "Ainda não existe acesso do coordenador."})
            return

        nome = coordenador.verificar_codigo(self._corpo_json().get("codigo"))
        if nome is None:
            coordenador.registar_falha(endereco)
            self._json(401, {"erro": "Código incorrecto.", "campos": {"codigo": "Código incorrecto. Tenta outra vez."}})
            return

        coordenador.limpar_falhas(endereco)
        token = coordenador.abrir_sessao(nome)
        self._json(200, {"nome": nome}, self._cookie_de_sessao(token, config.DURACAO_SESSAO))

    def _listar_alunos(self, consulta):
        def parametro(nome, padrao=""):
            return consulta.get(nome, [padrao])[0]

        classe = _inteiro(parametro("classe"), None, 1, 99)
        ordem = parametro("ordem", "nome")
        resultado = pesquisar.pesquisar(
            texto=parametro("q")[:100],
            classe=classe,
            turma=parametro("turma").strip().upper(),
            so_ocorrencia=parametro("ocorrencia") == "1",
            ordem=ordem,
            descendente=parametro("dir") == "desc",
            pagina=_inteiro(parametro("pagina"), 1, 1),
            por_pagina=_inteiro(parametro("por_pagina"), 10, 5, 50),
        )
        self._json(200, resultado)

    # ------------------------------------------------------- ficheiros do site

    def _ficheiro_estatico(self, caminho):
        relativo = unquote(caminho).lstrip("/") or "index.html"
        try:
            alvo = (config.PASTA_PUBLIC / relativo).resolve()
            alvo.relative_to(config.PASTA_PUBLIC.resolve())   # tem de ficar dentro de public/
        except (ValueError, OSError):
            self._enviar(404, "Página não encontrada.".encode("utf-8"), "text/plain; charset=utf-8")
            return
        if not alvo.is_file():
            self._enviar(404, "Página não encontrada.".encode("utf-8"), "text/plain; charset=utf-8")
            return

        # Os tipos principais ficam fixos aqui. No Windows o Python lê-os do registo do
        # sistema, onde o ".js" pode estar como texto simples, e o browser recusa-se a
        # executar scripts servidos assim (por causa do cabeçalho nosniff).
        tipo = TIPOS_DE_FICHEIRO.get(alvo.suffix.lower())
        if tipo is None:
            tipo = mimetypes.guess_type(alvo.name)[0] or "application/octet-stream"
        # As letras não mudam: ficam guardadas uma semana no browser. O resto (html, css,
        # js) é pedido sempre, para uma actualização do site aparecer logo.
        cache = "public, max-age=604800" if alvo.suffix.lower() == ".woff2" else "no-store"
        self._enviar(200, alvo.read_bytes(), tipo, cache=cache)

    def log_message(self, formato, *argumentos):
        sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), formato % argumentos))


class Servidor(ThreadingHTTPServer):
    # Por omissão a fila de espera só aceita 5 ligações ao mesmo tempo; as outras eram recusadas.
    request_queue_size = 128
    daemon_threads = True


def main():
    config.PASTA_BD.mkdir(parents=True, exist_ok=True)
    try:
        servidor = Servidor((config.ENDERECO, config.PORTA), Manipulador)
    except OSError as erro:
        print(f"Não foi possível usar a porta {config.PORTA}: {erro}")
        print(f"Provavelmente o servidor já está a funcionar noutra janela: abre http://localhost:{config.PORTA} no browser.")
        print("Se não for isso, fecha o outro programa que usa a porta ou escolhe outra:")
        print("  Windows (PowerShell):  $env:ALUNOS_PORTA=\"8001\"; python src\\servidor.py")
        print("  Linux / Mac:           ALUNOS_PORTA=8001 python3 src/servidor.py")
        sys.exit(1)

    print(f"Gestão de alunos a funcionar em http://{config.ENDERECO}:{config.PORTA}")
    print("Para parar: Ctrl+C")

    # No Windows e no Mac abre o site sozinho. A porta já está reservada, por isso o
    # browser fica à espera do servidor arrancar. (No Linux não se abre: sem ambiente
    # gráfico o Python podia lançar um browser de texto dentro do terminal.)
    if sys.platform in ("win32", "darwin"):
        try:
            webbrowser.open(f"http://localhost:{config.PORTA}")
        except Exception:
            pass
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor parado.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
