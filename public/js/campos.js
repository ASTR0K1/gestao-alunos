// Campos de formulário com etiqueta, ajuda e mensagem de erro ligadas corretamente (para leitores de ecrã).

import { h } from './util.js';

let contador = 0;

/**
 * criarCampo({ rotulo, nome, tipo, ajuda, opcoes, linhas, atributos, depois })
 * Devolve { el, controlo, erro(mensagem) }. `erro('')` limpa o erro.
 * `depois` é um elemento (ou lista) que fica no fim do campo, a seguir à mensagem de erro.
 * `lado` é um botão que fica ao lado do campo (por exemplo, "Mostrar").
 */
export function criarCampo({ rotulo, nome, tipo = 'text', ajuda = '', opcoes = null, linhas = 0, atributos = {}, depois = null, lado = null, classe = '' }) {
  const id = `campo${++contador}-${nome}`;
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;

  let controlo;
  if (opcoes) {
    controlo = h('select', { id, name: nome, ...atributos },
      opcoes.map((o) => h('option', { value: o.valor }, o.texto)));
  } else if (linhas) {
    controlo = h('textarea', { id, name: nome, rows: linhas, ...atributos });
  } else {
    controlo = h('input', { id, name: nome, type: tipo, ...atributos });
  }

  const ajudaEl = ajuda ? h('p', { class: 'ajuda', id: idAjuda }, ajuda) : null;
  const erroEl = h('p', { class: 'erro', id: idErro, hidden: true });
  controlo.setAttribute('aria-describedby', [ajudaEl && idAjuda, idErro].filter(Boolean).join(' '));

  const el = h('div', { class: `campo ${classe}`.trim() },
    h('label', { for: id }, rotulo),
    lado ? h('div', { class: 'entrada-com-botao' }, controlo, lado) : controlo,
    ajudaEl,
    erroEl,
    depois);

  function erro(mensagem) {
    if (mensagem) {
      erroEl.textContent = mensagem;
      erroEl.hidden = false;
      controlo.setAttribute('aria-invalid', 'true');
    } else {
      erroEl.textContent = '';
      erroEl.hidden = true;
      controlo.removeAttribute('aria-invalid');
    }
  }

  return { el, controlo, erro, id };
}

/** Campo de código com um botão para mostrar ou esconder o que se escreve. */
export function criarCampoCodigo({ rotulo, nome, ajuda = '', novo = false }) {
  const botao = h('button', { type: 'button', class: 'btn btn-secundario btn-pequeno', 'aria-pressed': 'false' }, 'Mostrar');
  const campo = criarCampo({
    rotulo, nome, tipo: 'password', ajuda, lado: botao,
    atributos: { autocomplete: novo ? 'new-password' : 'current-password', spellcheck: 'false', autocapitalize: 'off' },
  });
  botao.addEventListener('click', () => {
    const visivel = campo.controlo.type === 'password';
    campo.controlo.type = visivel ? 'text' : 'password';
    botao.textContent = visivel ? 'Esconder' : 'Mostrar';
    botao.setAttribute('aria-pressed', String(visivel));
    campo.controlo.focus();
  });
  return campo;
}
