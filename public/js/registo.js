// Registar um aluno: o formulário à esquerda e, à direita, a ficha a escrever-se enquanto preenches.

import { abrirFicha, criarFicha } from './ficha.js';
import { criarFormulario } from './formulario.js';
import { icone } from './icones.js';
import { aviso } from './ui.js';
import { $, ciclo, esvaziar, h, nomeDaTurma } from './util.js';

const MAX_NA_LISTA = 8;

export function iniciar() {
  const ficha = criarFicha();
  ficha.atualizar({}, { rascunho: true });
  const palco = h('div', { class: 'previa-palco' }, ficha.el);
  const nota = h('p', { class: 'ajuda previa-nota' }, 'É assim que a ficha vai ficar guardada no alunos.txt.');
  const listaEl = h('ul', { class: 'lista-alunos' });
  const blocoLista = h('section', { class: 'bloco', 'aria-labelledby': 'titulo-registados', hidden: true },
    h('h2', { id: 'titulo-registados' }, 'Registados nesta sessão'), listaEl);

  $('#previa').append(palco, nota, blocoLista);

  const registados = [];
  let carimbo = null;

  const tirarCarimbo = () => {
    carimbo?.remove();
    carimbo = null;
    palco.classList.remove('carimbada');
  };

  const formulario = criarFormulario({
    modo: 'registar',
    aoMudar: (valores) => {
      tirarCarimbo();
      ficha.atualizar(valores, { rascunho: true });
      nota.textContent = 'É assim que a ficha vai ficar guardada no alunos.txt.';
    },
    aoVerSemelhante: (id) => abrirFicha(id),
    aoGuardar: (novo) => {
      registados.unshift(novo);
      desenharLista();

      // A ficha mostra o que ficou realmente guardado (com as maiúsculas já arrumadas)
      ficha.atualizar(novo, { rascunho: true });
      tirarCarimbo();
      carimbo = h('div', { class: 'carimbo', role: 'img', 'aria-label': 'Registada' }, 'Registada');
      palco.append(carimbo);
      palco.classList.add('carimbada');
      nota.textContent = `Ficha n.º ${novo.id} guardada.`;

      aviso(`${novo.nome} foi registado (n.º ${novo.id}).`, { tipo: 'ok' });
      formulario.prepararProximo();
    },
  });

  $('#formulario').append(formulario.el);
  formulario.focar();

  function desenharLista() {
    blocoLista.hidden = false;
    esvaziar(listaEl, registados.slice(0, MAX_NA_LISTA).map((a) => h('li', {},
      h('button', { type: 'button', class: 'item-aluno', onclick: () => abrirFicha(a) },
        h('span', { class: 'item-aluno-nome' }, a.nome),
        h('span', { class: `chip-turma ciclo-${ciclo(a.classe).id}` }, nomeDaTurma(a.classe, a.turma)),
        h('span', { class: 'item-aluno-texto' }, icone('ok', 'icone-ok'), `Registo n.º ${a.id}, sala ${a.sala}`)))));
  }

  // Não deixar perder o que está escrito por engano
  window.addEventListener('beforeunload', (ev) => {
    if (formulario.sujo()) { ev.preventDefault(); ev.returnValue = ''; }
  });
}
