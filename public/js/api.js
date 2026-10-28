// Fala com o servidor. Todos os pedidos passam por aqui.

export class ErroApi extends Error {
  constructor(estado, mensagem, campos = {}) {
    super(mensagem);
    this.estado = estado;      // 0 = não houve resposta
    this.mensagem = mensagem;
    this.campos = campos;
  }
}

let aoExpirar = null;

/** A sessão terminou a meio do trabalho: `funcao` pede o código outra vez e o pedido repete-se. */
export function definirAoExpirar(funcao) {
  aoExpirar = funcao;
}

const SEM_REPETIR = ['/api/entrar', '/api/criar-acesso', '/api/estado', '/api/sair'];

async function pedir(metodo, caminho, corpo, { sinal, repetir = true } = {}) {
  const cabecalhos = { 'X-Requested-With': 'fetch' };
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';

  let resposta;
  try {
    resposta = await fetch(caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      credentials: 'same-origin',
      signal: sinal,
    });
  } catch (erro) {
    if (erro.name === 'AbortError') throw erro;
    throw new ErroApi(0, 'Não consegui falar com o servidor. Confirma que a janela do servidor continua aberta e tenta outra vez.');
  }

  let dados = null;
  try { dados = await resposta.json(); } catch { dados = null; }

  if (resposta.status === 401 && repetir && aoExpirar && !SEM_REPETIR.some((c) => caminho.startsWith(c))) {
    await aoExpirar();
    return pedir(metodo, caminho, corpo, { sinal, repetir: false });
  }
  if (!resposta.ok) {
    throw new ErroApi(resposta.status, dados?.erro || 'Algo correu mal. Tenta outra vez.', dados?.campos || {});
  }
  return dados;
}

export const api = {
  get: (caminho, opcoes) => pedir('GET', caminho, undefined, opcoes),
  post: (caminho, corpo, opcoes) => pedir('POST', caminho, corpo ?? {}, opcoes),
  put: (caminho, corpo, opcoes) => pedir('PUT', caminho, corpo ?? {}, opcoes),
  apagar: (caminho, opcoes) => pedir('DELETE', caminho, undefined, opcoes),
};
