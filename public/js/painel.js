// O painel: um resumo da escola e uma pesquisa rápida.

import { api, ErroApi } from './api.js';
import { abrirFicha } from './ficha.js';
import { desenhoVazio, icone } from './icones.js';
import {
  $, ciclo, consulta, curto, debounce, destacar, esvaziar, h, navegarComSetas, nomeDaTurma, normalizar,
  plural, primeiroNome, saudacao,
} from './util.js';

const NOMES_DOS_CICLOS = [
  { id: 1, nome: 'Primário', classes: '1.ª a 6.ª' },
  { id: 2, nome: '1.º Ciclo', classes: '7.ª a 9.ª' },
  { id: 3, nome: '2.º Ciclo', classes: '10.ª a 13.ª' },
];

export async function iniciar(sessao) {
  $('#saudacao').textContent = `${saudacao()}, ${primeiroNome(sessao.nome)}.`;
  prepararBusca();

  const raiz = $('#painel-conteudo');
  const carregar = async () => {
    try {
      const resumo = await api.get('/api/resumo');
      desenhar(raiz, resumo);
    } catch (erro) {
      if (!(erro instanceof ErroApi)) throw erro;
      esvaziar(raiz, h('div', { class: 'banner banner-erro', role: 'alert' },
        icone('aviso'),
        h('div', { class: 'banner-corpo' },
          h('p', { class: 'banner-titulo' }, 'Não consegui carregar o resumo.'),
          h('p', {}, erro.mensagem),
          h('button', { type: 'button', class: 'btn btn-secundario', onclick: carregar }, 'Tentar outra vez'))));
    }
  };

  document.addEventListener('alunos-alterados', carregar);
  await carregar();
}

// ------------------------------------------------------------------ busca rápida

function prepararBusca() {
  const entrada = $('#busca-q');
  const lista = $('#busca-lista');
  const leitor = $('#busca-estado');
  let pedido = 0;

  navegarComSetas(lista, { entrada, seletor: 'button, a' });

  const fechar = () => {
    lista.hidden = true;
    esvaziar(lista);
    leitor.textContent = '';
  };

  const procurar = debounce(async () => {
    const q = entrada.value.trim();
    if (normalizar(q).replace(/\s/g, '').length < 2) { fechar(); return; }
    const meu = ++pedido;
    try {
      const r = await api.get('/api/alunos?' + consulta({ q, ordem: 'relevancia', por_pagina: 5 }));
      if (meu !== pedido) return;
      desenharBusca(lista, leitor, q, r);
    } catch {
      if (meu === pedido) fechar();
    }
  }, 180);

  entrada.addEventListener('input', procurar);
  entrada.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !lista.hidden) { ev.stopPropagation(); fechar(); }
  });
  $('#busca-painel').addEventListener('submit', () => { /* Enter leva à página de pesquisa */ });
}

function desenharBusca(lista, leitor, q, r) {
  const itens = [];
  if (r.alunos.length) {
    for (const aluno of r.alunos) {
      itens.push(h('li', {}, h('button', { type: 'button', class: 'busca-item',
        onclick: () => abrirFicha(aluno, { lista: r.alunos, destaques: r.destaques }) },
      h('span', { class: 'busca-item-nome' }, destacar(aluno.nome, r.destaques)),
      h('span', { class: 'busca-item-detalhe' }, `${nomeDaTurma(aluno.classe, aluno.turma)}, sala ${aluno.sala}`))));
    }
    itens.push(h('li', {}, h('a', { class: 'busca-ver', href: 'pesquisar.html?' + consulta({ q }) },
      r.total > r.alunos.length ? `Ver os ${r.total} resultados` : 'Ver na pesquisa', icone('direita'))));
  } else {
    itens.push(h('li', { class: 'busca-vazio' },
      r.existem_alunos ? `Nenhum aluno com «${q}».` : 'Ainda não há alunos registados.'));
    for (const sugestao of r.sugestoes || []) {
      itens.push(h('li', {}, h('button', { type: 'button', class: 'busca-item', onclick: () => {
        const entrada = $('#busca-q');
        entrada.value = sugestao;
        entrada.dispatchEvent(new Event('input'));
        entrada.focus();
      } }, h('span', { class: 'busca-item-nome' }, `Querias dizer ${sugestao}?`))));
    }
  }
  esvaziar(lista, itens);
  lista.hidden = false;
  leitor.textContent = r.alunos.length
    ? `${plural(r.total, 'aluno encontrado', 'alunos encontrados')}. Prime a seta para baixo para escolher.`
    : 'Nenhum aluno encontrado.';
}

// ------------------------------------------------------------------ o resumo

function desenhar(raiz, r) {
  const avisos = [];
  if (r.linhas_ignoradas) {
    avisos.push(h('div', { class: 'banner banner-aviso', role: 'status' },
      icone('aviso'),
      h('div', { class: 'banner-corpo' },
        h('p', { class: 'banner-titulo' }, `${plural(r.linhas_ignoradas, 'linha do alunos.txt não pôde ser lida', 'linhas do alunos.txt não puderam ser lidas')}.`),
        h('p', {}, 'Foram ignoradas. Abre o ficheiro na pasta bd e confere se alguma linha ficou estragada.'))));
  }

  if (!r.total) {
    esvaziar(raiz, avisos, h('section', { class: 'vazio-grande' },
      desenhoVazio(),
      h('h2', {}, 'Ainda não há alunos registados'),
      h('p', {}, 'Regista o primeiro aluno e as turmas, as salas e as ocorrências começam a aparecer aqui.'),
      h('a', { class: 'btn btn-primario', href: 'registrar.html' }, icone('registar'), 'Registar o primeiro aluno')));
    return;
  }

  esvaziar(raiz,
    avisos,
    numeros(r),
    h('section', { class: 'bloco', 'aria-labelledby': 'titulo-turmas' },
      h('h2', { id: 'titulo-turmas' }, 'Turmas'),
      h('ul', { class: 'turmas' }, r.lista_de_turmas.map(cartaoDaTurma))),
    h('div', { class: 'duas-colunas' },
      listaDeAlunos('titulo-ocorrencias', 'Ocorrências recentes', r.ocorrencias_recentes, 'ocorrencia',
        'Nenhuma ocorrência registada. Está tudo calmo.'),
      listaDeAlunos('titulo-recentes', 'Registados há pouco', r.recentes, 'recente', '')));
}

function numeros(r) {
  const contagem = { 1: 0, 2: 0, 3: 0 };
  for (const c of r.por_classe) contagem[ciclo(c.classe).id] += c.total;

  const legenda = NOMES_DOS_CICLOS.filter((c) => contagem[c.id] > 0);
  const resumo = legenda.map((c) => `${c.nome} ${contagem[c.id]}`).join(', ');

  const barra = h('div', { class: 'ciclos-barra', role: 'img', 'aria-label': `Alunos por ciclo: ${resumo}` },
    legenda.map((c) => {
      const parte = h('span', { class: `ciclos-parte ciclo-${c.id}` });
      parte.style.setProperty('--parte', String(contagem[c.id]));
      return parte;
    }));

  return h('section', { class: 'resumo', 'aria-label': 'Resumo' },
    h('div', { class: 'numeros' },
      h('div', { class: 'numero' },
        h('strong', {}, String(r.total)),
        h('span', {}, r.total === 1 ? 'aluno registado' : 'alunos registados')),
      h('div', { class: 'numero' },
        h('strong', {}, String(r.turmas)),
        h('span', {}, r.turmas === 1 ? 'turma' : 'turmas')),
      h('a', { class: `numero numero-ligacao${r.com_ocorrencia ? ' numero-alerta' : ''}`, href: 'pesquisar.html?oc=1' },
        h('strong', {}, String(r.com_ocorrencia)),
        h('span', {}, r.com_ocorrencia === 1 ? 'aluno com ocorrência' : 'alunos com ocorrência'))),
    h('div', { class: 'ciclos' },
      barra,
      h('ul', { class: 'ciclos-legenda' }, legenda.map((c) => h('li', { class: `ciclo-${c.id}` },
        h('span', { class: 'ciclos-cor', 'aria-hidden': 'true' }),
        h('strong', {}, String(contagem[c.id])), ` ${c.nome}`,
        h('span', { class: 'ciclos-classes' }, ` (${c.classes})`))))));
}

function cartaoDaTurma(t) {
  const c = ciclo(t.classe);
  const salas = t.salas.length === 1 ? `Sala ${t.salas[0]}` : `Salas ${t.salas.join(', ')}`;
  return h('li', {}, h('a', {
    class: `turma-cartao ciclo-${c.id}`,
    href: 'pesquisar.html?' + consulta({ classe: t.classe, turma: t.turma }),
    'aria-label': `${nomeDaTurma(t.classe, t.turma)}: ${plural(t.total, 'aluno', 'alunos')}${t.com_ocorrencia ? `, ${plural(t.com_ocorrencia, 'ocorrência', 'ocorrências')}` : ''}`,
  },
  h('strong', { class: 'turma-nome' }, nomeDaTurma(t.classe, t.turma)),
  h('span', { class: 'turma-total' }, plural(t.total, 'aluno', 'alunos')),
  h('span', { class: 'turma-sala' }, salas),
  t.com_ocorrencia > 0 && h('span', { class: 'turma-ocorrencias' }, icone('bandeira'), plural(t.com_ocorrencia, 'ocorrência', 'ocorrências'))));
}

function listaDeAlunos(id, titulo, alunos, tipo, textoVazio) {
  return h('section', { class: 'bloco', 'aria-labelledby': id },
    h('h2', { id }, titulo),
    alunos.length
      ? h('ul', { class: 'lista-alunos' }, alunos.map((a) => h('li', {},
        h('button', { type: 'button', class: 'item-aluno', onclick: () => abrirFicha(a, { lista: alunos }) },
          h('span', { class: 'item-aluno-nome' }, a.nome),
          h('span', { class: `chip-turma ciclo-${ciclo(a.classe).id}` }, nomeDaTurma(a.classe, a.turma)),
          tipo === 'ocorrencia'
            ? h('span', { class: 'item-aluno-texto' }, icone('bandeira', 'icone-alerta'), curto(a.ocorrencia, 90))
            : h('span', { class: 'item-aluno-texto' }, `Registo n.º ${a.id}, sala ${a.sala}`)))))
      : h('p', { class: 'ajuda' }, textoVazio));
}
