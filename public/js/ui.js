// Avisos que aparecem em baixo ("Aluno registado", "Desfazer"...).

import { h } from './util.js';
import { icone } from './icones.js';

let caixa = null;

function caixaDeAvisos() {
  if (!caixa) {
    // Um "popover" fica por cima de tudo, até das janelas abertas (a gaveta, a paleta).
    caixa = h('div', { class: 'avisos', popover: 'manual' });
    document.body.append(caixa);
  }
  return caixa;
}

function pôrPorCima() {
  if (!caixa.showPopover) return;
  try {
    if (caixa.matches(':popover-open')) caixa.hidePopover();
    caixa.showPopover();
  } catch { /* sem popover, fica o z-index do CSS */ }
}

/**
 * aviso('Texto', { tipo: 'ok' | 'erro' | 'info', acao: { rotulo, aoClicar }, duracao: ms })
 * Um aviso de erro fica até ser fechado.
 */
export function aviso(texto, { tipo = 'info', acao = null, duracao = null } = {}) {
  const tempo = duracao ?? (tipo === 'erro' ? 0 : acao ? 10000 : 5000);
  let relogio = null;

  const fechar = () => {
    clearTimeout(relogio);
    el.remove();
  };

  const el = h('div', { class: `aviso aviso-${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' },
    icone(tipo === 'erro' ? 'aviso' : tipo === 'ok' ? 'ok' : 'info'),
    h('span', { class: 'aviso-texto' }, texto),
    acao && h('button', { type: 'button', class: 'aviso-acao', onclick: () => { fechar(); acao.aoClicar(); } }, acao.rotulo),
    h('button', { type: 'button', class: 'aviso-fechar', 'aria-label': 'Fechar aviso', onclick: fechar }, icone('fechar')));

  caixaDeAvisos().append(el);
  pôrPorCima();
  while (caixa.children.length > 4) caixa.firstElementChild.remove();
  if (tempo) relogio = setTimeout(fechar, tempo);
  return { fechar };
}

/** Fecha uma <dialog> quando se clica fora da caixa (no fundo escurecido). */
export function fecharAoClicarFora(dialogo) {
  dialogo.addEventListener('click', (ev) => {
    if (ev.target === dialogo) dialogo.close();
  });
}
