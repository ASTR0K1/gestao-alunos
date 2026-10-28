// A página de pesquisa: escreve, filtra, ordena, abre a ficha.
// O que está escolhido fica no endereço da página (?q=...&classe=...), por isso o botão "voltar" e os favoritos funcionam.

import { api, ErroApi } from './api.js';
import { abrirFicha, criarFicha } from './ficha.js';
import { desenhoVazio, icone } from './icones.js';
import {
  $, ciclo, consulta, curto, debounce, destacar, esvaziar, formatarTelefone, h, nomeDaTurma, plural,
} from './util.js';

const POR_PAGINA = 12;

const ORDENS = ['auto', 'nome', 'classe', 'sala', 'id'];

const estado = {
  q: '', classe: '', turma: '', oc: false, ordem: 'auto', dir: '', pagina: 1, vista: 'tabela',
};

let ultima = null;           // última resposta do servidor
let pedido = 0;
let controlador = null;
let primeiraVez = true;

export function iniciar() {
  lerEndereco();
  const el = {
    q: $('#q'), limpar: $('#limpar-q'), classe: $('#f-classe'), turma: $('#f-turma'),
    ordem: $('#f-ordem'), oc: $('#f-oc'), tabela: $('#vista-tabela'), fichas: $('#vista-fichas'),
    meta: $('#meta'), resultados: $('#resultados'), paginacao: $('#paginacao'), form: $('#form-pesquisa'),
  };

  // As classes
  esvaziar(el.classe, h('option', { value: '' }, 'Todas'),
    Array.from({ length: 13 }, (_, i) => h('option', { value: String(i + 1) }, `${i + 1}.ª classe`)));

  const mostrarControlos = () => {
    el.q.value = estado.q;
    el.limpar.hidden = !estado.q;
    el.classe.value = estado.classe;
    if (estado.turma && ![...el.turma.options].some((o) => o.value === estado.turma)) {
      el.turma.append(h('option', { value: estado.turma }, estado.turma));
    }
    el.turma.value = estado.turma;
    el.oc.checked = estado.oc;
    el.ordem.value = estado.ordem;
    for (const [botao, vista] of [[el.tabela, 'tabela'], [el.fichas, 'fichas']]) {
      botao.setAttribute('aria-pressed', String(estado.vista === vista));
    }
  };
  mostrarControlos();

  const recarregar = (voltarAoInicio = true) => {
    if (voltarAoInicio) estado.pagina = 1;
    carregar(el);
  };

  // --- eventos
  const escreveu = debounce(() => recarregar(), 220);
  el.q.addEventListener('input', () => {
    estado.q = el.q.value;
    el.limpar.hidden = !estado.q;
    escreveu();
  });
  el.q.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && el.q.value) { ev.stopPropagation(); limparTexto(); }
  });
  el.form.addEventListener('submit', (ev) => { ev.preventDefault(); escreveu.cancelar(); recarregar(); });
  const limparTexto = () => { el.q.value = ''; estado.q = ''; el.limpar.hidden = true; escreveu.cancelar(); recarregar(); el.q.focus(); };
  el.limpar.addEventListener('click', limparTexto);

  el.classe.addEventListener('change', () => { estado.classe = el.classe.value; estado.turma = ''; el.turma.value = ''; recarregar(); });
  el.turma.addEventListener('change', () => { estado.turma = el.turma.value; recarregar(); });
  el.oc.addEventListener('change', () => { estado.oc = el.oc.checked; recarregar(); });
  el.ordem.addEventListener('change', () => {
    estado.ordem = el.ordem.value;
    estado.dir = estado.ordem === 'id' ? 'desc' : '';
    recarregar();
  });
  for (const [botao, vista] of [[el.tabela, 'tabela'], [el.fichas, 'fichas']]) {
    botao.addEventListener('click', () => {
      estado.vista = vista;
      mostrarControlos();
      guardarEndereco();
      if (ultima) desenhar(el, ultima);
    });
  }

  // Clicar nos títulos da tabela, "Limpar", sugestões e páginas: um só sítio para os botões que desenhamos depois
  el.resultados.addEventListener('click', (ev) => {
    const ordenar = ev.target.closest('[data-ordenar]');
    if (ordenar) {
      const coluna = ordenar.dataset.ordenar;
      if (estado.ordem === coluna) estado.dir = estado.dir ? '' : 'desc';
      else { estado.ordem = coluna; estado.dir = ''; }
      mostrarControlos();
      recarregar();
      return;
    }
    const sugestao = ev.target.closest('[data-sugestao]');
    if (sugestao) {
      estado.q = sugestao.dataset.sugestao;
      mostrarControlos();
      recarregar();
      return;
    }
    if (ev.target.closest('[data-limpar-tudo]')) limparTudo();
    if (ev.target.closest('[data-tentar]')) carregar(el);
  });
  el.meta.addEventListener('click', (ev) => { if (ev.target.closest('[data-limpar-tudo]')) limparTudo(); });
  el.paginacao.addEventListener('click', (ev) => {
    const botao = ev.target.closest('[data-pagina]');
    if (!botao || botao.disabled) return;
    estado.pagina = Number(botao.dataset.pagina);
    carregar(el);
    el.resultados.scrollIntoView({ block: 'start', behavior: 'auto' });
  });

  function limparTudo() {
    Object.assign(estado, { q: '', classe: '', turma: '', oc: false, ordem: 'auto', dir: '', pagina: 1 });
    mostrarControlos();
    recarregar();
  }

  // As setas para cima e para baixo percorrem as linhas
  el.resultados.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const alvos = [...el.resultados.querySelectorAll('.linha-botao, .cartao')];
    const i = alvos.indexOf(document.activeElement);
    if (i === -1) return;
    const passo = estado.vista === 'fichas' ? 0 : (ev.key === 'ArrowDown' ? 1 : -1);
    if (!passo) return;
    ev.preventDefault();
    (alvos[i + passo] || alvos[i]).focus();
  });
  el.q.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') {
      const primeiro = el.resultados.querySelector('.linha-botao, .cartao');
      if (primeiro) { ev.preventDefault(); primeiro.focus(); }
    }
  });

  document.addEventListener('alunos-alterados', () => carregar(el));
  window.addEventListener('popstate', () => { lerEndereco(); mostrarControlos(); carregar(el); });

  carregar(el);
  if (!estado.q) el.q.focus();
}

// ------------------------------------------------------------------ endereço

function lerEndereco() {
  const p = new URLSearchParams(location.search);
  estado.q = p.get('q') || '';
  estado.classe = /^\d{1,2}$/.test(p.get('classe') || '') ? p.get('classe') : '';
  estado.turma = (p.get('turma') || '').toUpperCase().slice(0, 10);
  estado.oc = p.get('oc') === '1';
  estado.ordem = ORDENS.includes(p.get('ordem')) ? p.get('ordem') : 'auto';
  estado.dir = p.get('dir') === 'desc' ? 'desc' : '';
  estado.pagina = Math.max(1, Number(p.get('pagina')) || 1);
  estado.vista = p.get('vista') === 'fichas' ? 'fichas' : 'tabela';
}

function guardarEndereco() {
  const texto = consulta({
    q: estado.q.trim(), classe: estado.classe, turma: estado.turma, oc: estado.oc,
    ordem: estado.ordem === 'auto' ? '' : estado.ordem, dir: estado.dir,
    pagina: estado.pagina > 1 ? estado.pagina : '', vista: estado.vista === 'fichas' ? 'fichas' : '',
  });
  history.replaceState(null, '', texto ? `?${texto}` : location.pathname);
}

// ------------------------------------------------------------------ pedido

function parametros() {
  const q = estado.q.trim();
  let ordem = estado.ordem;
  if (ordem === 'auto') ordem = q ? 'relevancia' : 'nome';
  return {
    q, classe: estado.classe, turma: estado.turma, ocorrencia: estado.oc, ordem,
    dir: ordem === 'relevancia' ? '' : estado.dir, pagina: estado.pagina, por_pagina: POR_PAGINA,
  };
}

async function carregar(el) {
  controlador?.abort();
  controlador = new AbortController();
  const meu = ++pedido;

  el.resultados.setAttribute('aria-busy', 'true');
  if (primeiraVez) esvaziar(el.resultados, esqueleto());
  else el.resultados.classList.add('a-carregar');

  try {
    const r = await api.get('/api/alunos?' + consulta(parametros()), { sinal: controlador.signal });
    if (meu !== pedido) return;
    primeiraVez = false;
    ultima = r;
    estado.pagina = r.pagina;
    desenhar(el, r);
  } catch (erro) {
    if (erro.name === 'AbortError' || meu !== pedido) return;
    if (!(erro instanceof ErroApi)) throw erro;
    primeiraVez = false;
    ultima = null;
    esvaziar(el.meta);
    esvaziar(el.paginacao);
    esvaziar(el.resultados, h('div', { class: 'banner banner-erro', role: 'alert' },
      icone('aviso'),
      h('div', { class: 'banner-corpo' },
        h('p', { class: 'banner-titulo' }, 'Não consegui pesquisar.'),
        h('p', {}, erro.mensagem),
        h('button', { type: 'button', class: 'btn btn-secundario', 'data-tentar': '' }, 'Tentar outra vez'))));
  } finally {
    if (meu === pedido) {
      el.resultados.setAttribute('aria-busy', 'false');
      el.resultados.classList.remove('a-carregar');
    }
  }
}

function esqueleto() {
  return h('div', { class: 'esqueleto-lista', 'aria-hidden': 'true' },
    Array.from({ length: 6 }, () => h('div', { class: 'esqueleto' })));
}

// ------------------------------------------------------------------ desenho

function filtrosActivos() {
  return Boolean(estado.q.trim() || estado.classe || estado.turma || estado.oc);
}

function desenhar(el, r) {
  guardarEndereco();

  // As turmas do filtro vêm do servidor (dependem da classe escolhida)
  const turmas = r.turmas.includes(estado.turma) || !estado.turma ? r.turmas : [...r.turmas, estado.turma].sort();
  esvaziar(el.turma, h('option', { value: '' }, 'Todas'), turmas.map((t) => h('option', { value: t }, t)));
  el.turma.value = estado.turma;

  // "Melhor resultado" só faz sentido quando há texto
  const auto = el.ordem.querySelector('option[value="auto"]');
  auto.textContent = estado.q.trim() ? 'Melhor resultado' : 'Nome (A a Z)';
  el.ordem.value = estado.ordem;

  desenharMeta(el, r);

  if (!r.total) {
    esvaziar(el.resultados, vazio(r));
    esvaziar(el.paginacao);
    return;
  }

  esvaziar(el.resultados, estado.vista === 'fichas' ? fichas(r) : tabela(r));
  desenharPaginas(el, r);
}

function desenharMeta(el, r) {
  const filtros = [];
  if (estado.q.trim()) filtros.push(`«${estado.q.trim()}»`);
  if (estado.classe) filtros.push(`${estado.classe}.ª classe`);
  if (estado.turma) filtros.push(`turma ${estado.turma}`);
  if (estado.oc) filtros.push('com ocorrência');

  let texto;
  if (!r.existem_alunos) texto = '';
  else if (!r.total) texto = 'Nenhum aluno encontrado';
  else texto = `${plural(r.total, 'aluno encontrado', 'alunos encontrados')}`;
  if (texto && filtros.length) texto += `: ${filtros.join(', ')}`;
  if (texto && !filtros.length) texto = plural(r.total, 'aluno registado', 'alunos registados');

  esvaziar(el.meta, texto, filtrosActivos() && r.existem_alunos
    ? h('button', { type: 'button', class: 'btn-ligacao', 'data-limpar-tudo': '' }, 'Limpar tudo') : null);
}

function abrir(aluno, r) {
  abrirFicha(aluno, { lista: r.alunos, destaques: r.destaques });
}

function tabela(r) {
  const cabeca = (coluna, rotulo) => {
    const activa = estado.ordem === coluna || (estado.ordem === 'auto' && coluna === 'nome' && !estado.q.trim());
    const sentido = activa ? (estado.dir ? 'descending' : 'ascending') : 'none';
    return h('th', { scope: 'col', 'aria-sort': sentido },
      h('button', { type: 'button', class: 'ordenar', 'data-ordenar': coluna },
        rotulo, activa ? icone(estado.dir ? 'baixo' : 'cima') : null));
  };

  const corpo = r.alunos.map((aluno) => {
    const parecido = r.aproximados.includes(aluno.id);
    const tr = h('tr', { class: 'linha' },
      h('td', { 'data-rotulo': 'Nome', class: 'col-nome' },
        h('button', { type: 'button', class: 'linha-botao' }, destacar(aluno.nome, r.destaques)),
        parecido && h('span', { class: 'selo-parecido', title: 'Encontrado por se parecer com o que escreveste' }, 'parecido')),
      h('td', { 'data-rotulo': 'Turma' }, h('span', { class: `chip-turma ciclo-${ciclo(aluno.classe).id}` }, nomeDaTurma(aluno.classe, aluno.turma))),
      h('td', { 'data-rotulo': 'Sala' }, destacar(aluno.sala, r.destaques)),
      h('td', { 'data-rotulo': 'Encarregado', class: 'col-telefone' }, destacar(formatarTelefone(aluno.encarregado), r.destaques)),
      h('td', { 'data-rotulo': 'Ocorrência', class: 'col-ocorrencia' }, aluno.ocorrencia
        ? h('span', { class: 'ocorrencia-marca' }, icone('bandeira'), destacar(curto(aluno.ocorrencia, 70), r.destaques))
        : h('span', { class: 'sem' }, '—', h('span', { class: 'fora-do-ecra' }, 'Sem ocorrência'))));
    tr.addEventListener('click', () => abrir(aluno, r));
    return tr;
  });

  return h('div', { class: 'tabela-caixa' },
    h('table', { class: 'tabela' },
      h('caption', { class: 'fora-do-ecra' }, 'Alunos'),
      h('thead', {}, h('tr', {},
        cabeca('nome', 'Nome'),
        cabeca('classe', 'Turma'),
        cabeca('sala', 'Sala'),
        h('th', { scope: 'col' }, 'Encarregado'),
        h('th', { scope: 'col' }, 'Ocorrência'))),
      h('tbody', {}, corpo)));
}

function fichas(r) {
  return h('ul', { class: 'fichas-grelha' }, r.alunos.map((aluno) => {
    const ficha = criarFicha({ compacta: true });
    ficha.atualizar(aluno, { destaques: r.destaques });
    return h('li', {}, h('button', { type: 'button', class: 'cartao', onclick: () => abrir(aluno, r),
      'aria-label': `Abrir a ficha de ${aluno.nome}` }, ficha.el,
    r.aproximados.includes(aluno.id) && h('span', { class: 'selo-parecido selo-no-cartao' }, 'parecido')));
  }));
}

function vazio(r) {
  if (!r.existem_alunos) {
    return h('section', { class: 'vazio-grande' },
      desenhoVazio(),
      h('h2', {}, 'Ainda não há alunos registados'),
      h('p', {}, 'Quando registares o primeiro aluno, ele aparece aqui.'),
      h('a', { class: 'btn btn-primario', href: 'registrar.html' }, icone('registar'), 'Registar o primeiro aluno'));
  }
  return h('section', { class: 'vazio-grande' },
    desenhoVazio(),
    h('h2', {}, 'Nenhum aluno encontrado'),
    r.sugestoes.length
      ? h('div', { class: 'sugestoes' },
        h('p', {}, 'Querias dizer:'),
        h('div', { class: 'sugestoes-lista' }, r.sugestoes.map((s) =>
          h('button', { type: 'button', class: 'btn btn-secundario', 'data-sugestao': s }, s))))
      : null,
    h('ul', { class: 'dicas' },
      h('li', {}, 'Tenta só o apelido, ou só parte do nome.'),
      h('li', {}, 'Podes pesquisar pelo telefone do encarregado ou por «sala 12».'),
      filtrosActivos() ? h('li', {}, 'Experimenta tirar algum filtro.') : null),
    filtrosActivos() ? h('button', { type: 'button', class: 'btn btn-primario', 'data-limpar-tudo': '' }, 'Limpar a pesquisa e os filtros') : null);
}

function desenharPaginas(el, r) {
  if (r.paginas <= 1) { esvaziar(el.paginacao); return; }
  const inicio = (r.pagina - 1) * r.por_pagina + 1;
  const fim = Math.min(r.total, r.pagina * r.por_pagina);
  esvaziar(el.paginacao,
    h('button', { type: 'button', class: 'btn btn-secundario', 'data-pagina': r.pagina - 1, disabled: r.pagina <= 1 },
      icone('esquerda'), 'Anterior'),
    h('p', { class: 'paginacao-texto' }, `Página ${r.pagina} de ${r.paginas}`,
      h('span', { class: 'ajuda' }, ` (alunos ${inicio} a ${fim})`)),
    h('button', { type: 'button', class: 'btn btn-secundario', 'data-pagina': r.pagina + 1, disabled: r.pagina >= r.paginas },
      'Seguinte', icone('direita')));
}
