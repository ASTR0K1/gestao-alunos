// A paleta de comandos (Ctrl K): escreve um nome para abrir a ficha, ou o nome de uma página para ir lá.

import { api } from './api.js';
import { abrirFicha } from './ficha.js';
import { icone } from './icones.js';
import { fecharAoClicarFora } from './ui.js';
import {
  consulta, debounce, destacar, esvaziar, h, navegarComSetas, nomeDaTurma, normalizar, plural,
} from './util.js';

const ACOES = [
  { rotulo: 'Ir para o painel', icone: 'painel', href: 'index.html', palavras: 'painel inicio resumo turmas' },
  { rotulo: 'Pesquisar alunos', icone: 'procurar', href: 'pesquisar.html', palavras: 'pesquisar procurar lista alunos' },
  { rotulo: 'Registar um aluno', icone: 'registar', href: 'registrar.html', palavras: 'registar novo aluno adicionar' },
  { rotulo: 'Ver alunos com ocorrência', icone: 'bandeira', href: 'pesquisar.html?oc=1', palavras: 'ocorrencia ocorrencias problemas' },
  { rotulo: 'Sair', icone: 'sair', sair: true, palavras: 'sair terminar sessao' },
];

let dialogo = null;
let entrada = null;
let lista = null;
let estadoLeitor = null;
let resultado = null;      // resposta da pesquisa de alunos para o texto actual
let pedido = 0;

export function abrirPaleta() {
  if (!dialogo) criar();
  if (dialogo.open) return;
  entrada.value = '';
  resultado = null;
  desenhar();
  dialogo.showModal();
  entrada.focus();
}

function criar() {
  entrada = h('input', {
    type: 'search', class: 'paleta-entrada', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Escreve o nome de um aluno ou de uma página',
    'aria-label': 'Procurar aluno ou ir para uma página',
  });
  lista = h('div', { class: 'paleta-lista' });
  estadoLeitor = h('p', { class: 'fora-do-ecra', role: 'status' });

  dialogo = h('dialog', { class: 'paleta', 'aria-label': 'Procurar' },
    h('div', { class: 'paleta-caixa' },
      h('div', { class: 'paleta-campo' }, icone('procurar'), entrada),
      lista,
      estadoLeitor,
      h('p', { class: 'paleta-ajuda' },
        h('span', {}, h('kbd', { class: 'tecla tecla-clara' }, '↑'), ' ', h('kbd', { class: 'tecla tecla-clara' }, '↓'), ' escolher'),
        h('span', {}, h('kbd', { class: 'tecla tecla-clara' }, 'Enter'), ' abrir'),
        h('span', {}, h('kbd', { class: 'tecla tecla-clara' }, 'Esc'), ' fechar'))));

  fecharAoClicarFora(dialogo);
  navegarComSetas(lista, { entrada, seletor: 'button, a' });

  const procurar = debounce(async (texto) => {
    if (normalizar(texto).replace(/\s/g, '').length < 2) { resultado = null; desenhar(); return; }
    const meu = ++pedido;
    try {
      const r = await api.get('/api/alunos?' + consulta({ q: texto.trim(), ordem: 'relevancia', por_pagina: 6 }));
      if (meu !== pedido) return;
      resultado = { texto: texto.trim(), ...r };
    } catch {
      if (meu !== pedido) return;
      resultado = null;
    }
    desenhar();
  }, 150);

  entrada.addEventListener('input', () => { desenhar(); procurar(entrada.value); });
  entrada.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      lista.querySelector('button, a')?.click();
    }
  });

  document.body.append(dialogo);
}

function desenhar() {
  const texto = normalizar(entrada.value).trim();
  const palavras = texto.split(/\s+/).filter(Boolean);

  const acoes = ACOES.filter((a) => {
    const alvo = normalizar(`${a.rotulo} ${a.palavras}`);
    return palavras.every((p) => alvo.includes(p));
  });

  const itens = [];

  if (resultado && resultado.texto && normalizar(resultado.texto) === normalizar(entrada.value.trim())) {
    if (resultado.alunos.length) {
      itens.push(h('p', { class: 'paleta-grupo' }, 'Alunos'));
      for (const aluno of resultado.alunos) {
        itens.push(h('button', { type: 'button', class: 'paleta-item', onclick: () => {
          dialogo.close();
          abrirFicha(aluno, { lista: resultado.alunos, destaques: resultado.destaques });
        } },
        h('span', { class: 'paleta-item-nome' }, destacar(aluno.nome, resultado.destaques)),
        h('span', { class: 'paleta-item-detalhe' }, `${nomeDaTurma(aluno.classe, aluno.turma)}, sala ${aluno.sala}`)));
      }
      itens.push(h('a', { class: 'paleta-item paleta-item-ver', href: 'pesquisar.html?' + consulta({ q: resultado.texto }) },
        icone('procurar'),
        h('span', { class: 'paleta-item-nome' },
          resultado.total > resultado.alunos.length ? `Ver os ${resultado.total} resultados` : 'Ver na pesquisa')));
    } else if (resultado.sugestoes?.length) {
      itens.push(h('p', { class: 'paleta-grupo' }, 'Querias dizer'));
      for (const sugestao of resultado.sugestoes) {
        itens.push(h('button', { type: 'button', class: 'paleta-item', onclick: () => {
          entrada.value = sugestao;
          desenhar();
          resultado = null;
          entrada.dispatchEvent(new Event('input'));
          entrada.focus();
        } }, h('span', { class: 'paleta-item-nome' }, sugestao)));
      }
    }
  }

  if (acoes.length) {
    itens.push(h('p', { class: 'paleta-grupo' }, texto ? 'Páginas' : 'Ir para'));
    for (const a of acoes) {
      itens.push(a.sair
        ? h('button', { type: 'button', class: 'paleta-item', onclick: async () => {
          try { await api.post('/api/sair'); } catch { /* sai na mesma */ }
          location.href = 'index.html';
        } }, icone(a.icone), h('span', { class: 'paleta-item-nome' }, a.rotulo))
        : h('a', { class: 'paleta-item', href: a.href }, icone(a.icone), h('span', { class: 'paleta-item-nome' }, a.rotulo)));
    }
  }

  if (!itens.length) {
    itens.push(h('p', { class: 'paleta-vazio' },
      texto.length < 2 ? 'Escreve pelo menos duas letras.' : `Nenhum resultado para «${entrada.value.trim()}».`));
  }

  esvaziar(lista, itens);

  const nAlunos = resultado?.alunos?.length ?? 0;
  estadoLeitor.textContent = texto.length >= 2 && resultado ? plural(nAlunos, 'aluno encontrado', 'alunos encontrados') : '';
}
