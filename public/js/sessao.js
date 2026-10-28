// Entrar, criar o acesso do coordenador, sair, e a barra de cima.

import { api, definirAoExpirar, ErroApi } from './api.js';
import { criarCampo, criarCampoCodigo } from './campos.js';
import { icone, marca } from './icones.js';
import { $, h, esvaziar, primeiroNome } from './util.js';

const PAGINAS = [
  { id: 'painel', href: 'index.html', rotulo: 'Painel', icone: 'painel' },
  { id: 'pesquisar', href: 'pesquisar.html', rotulo: 'Pesquisar', icone: 'procurar' },
  { id: 'registar', href: 'registrar.html', rotulo: 'Registar', icone: 'registar' },
];

const TITULOS = { painel: 'Painel', pesquisar: 'Pesquisar alunos', registar: 'Registar aluno' };
const MIN_CODIGO = 6;

let reentrada = null;

// ---------------------------------------------------------------- arranque

export async function iniciarSessao(pagina) {
  definirAoExpirar(reentrar);

  let estado = await obterEstado();
  if (!estado.autenticado) estado = await mostrarEntrada(estado);

  montarTopo(pagina, estado.nome);
  return { nome: estado.nome };
}

async function obterEstado() {
  for (;;) {
    try {
      return await api.get('/api/estado');
    } catch (erro) {
      await mostrarSemServidor(erro);
    }
  }
}

function mostrarSemServidor(erro) {
  const gate = $('#gate');
  $('#aviso-js')?.remove();
  gate.hidden = false;
  return new Promise((resolver) => {
    esvaziar(gate, h('div', { class: 'gate-cartao', role: 'alert' },
      h('h1', {}, 'Sem ligação ao servidor'),
      h('p', {}, erro.mensagem),
      h('button', { type: 'button', class: 'btn btn-primario', onclick: () => { gate.hidden = true; resolver(); } }, 'Tentar outra vez')));
  });
}

// ---------------------------------------------------------------- entrada

function mostrarEntrada(estado) {
  const gate = $('#gate');
  $('#aviso-js')?.remove();
  gate.hidden = false;
  document.title = 'Entrar – Gestão de Alunos';

  return new Promise((resolver) => {
    const concluir = (nome) => {
      gate.hidden = true;
      esvaziar(gate);
      resolver({ autenticado: true, nome });
    };
    const mostrar = (existe) => {
      esvaziar(gate, existe ? formularioEntrar(concluir) : formularioCriar(concluir, () => mostrar(true)));
      gate.querySelector('input')?.focus();
    };
    mostrar(estado.coordenador_existe);
  });
}

function cartaoDaEntrada(titulo, texto, filhos) {
  return h('div', { class: 'gate-cartao' },
    h('div', { class: 'gate-marca' }, marca(34), h('span', {}, 'Gestão de Alunos')),
    h('h1', {}, titulo),
    texto && h('p', { class: 'gate-texto' }, texto),
    filhos);
}

function formularioEntrar(concluir) {
  const codigo = criarCampoCodigo({ rotulo: 'Código do coordenador', nome: 'codigo' });
  const aviso = h('p', { class: 'erro erro-geral', role: 'alert', hidden: true });
  const botao = h('button', { type: 'submit', class: 'btn btn-primario btn-largo' }, 'Entrar');

  const form = h('form', { novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault();
    codigo.erro('');
    aviso.hidden = true;
    if (!codigo.controlo.value) {
      codigo.erro('Escreve o código para entrar.');
      codigo.controlo.focus();
      return;
    }
    botao.disabled = true;
    try {
      const r = await api.post('/api/entrar', { codigo: codigo.controlo.value });
      concluir(r.nome);
    } catch (erro) {
      if (!(erro instanceof ErroApi)) throw erro;
      if (erro.estado === 401) codigo.erro(erro.campos.codigo || erro.mensagem);
      else { aviso.textContent = erro.mensagem; aviso.hidden = false; }
      codigo.controlo.select();
      codigo.controlo.focus();
    } finally {
      botao.disabled = false;
    }
  } }, codigo.el, aviso, botao);

  return cartaoDaEntrada('Entrar', 'Escreve o código do coordenador para ver e gerir os alunos.', form);
}

function formularioCriar(concluir, irParaEntrar) {
  const nome = criarCampo({ rotulo: 'O teu nome', nome: 'nome', atributos: { autocomplete: 'name', autocapitalize: 'words' } });
  const codigo = criarCampoCodigo({ rotulo: 'Código de acesso', nome: 'codigo', novo: true, ajuda: `Pelo menos ${MIN_CODIGO} caracteres. Quem souber este código pode ver e alterar os alunos.` });
  const repetir = criarCampoCodigo({ rotulo: 'Repete o código', nome: 'repetir', novo: true });
  const aviso = h('p', { class: 'erro erro-geral', role: 'alert', hidden: true });
  const botao = h('button', { type: 'submit', class: 'btn btn-primario btn-largo' }, 'Criar acesso e entrar');

  const form = h('form', { novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault();
    [nome, codigo, repetir].forEach((c) => c.erro(''));
    aviso.hidden = true;

    const erros = [];
    if (nome.controlo.value.trim().length < 3) erros.push([nome, 'Escreve o teu nome (pelo menos 3 letras).']);
    if (codigo.controlo.value.length < MIN_CODIGO) erros.push([codigo, `O código precisa de pelo menos ${MIN_CODIGO} caracteres.`]);
    else if (repetir.controlo.value !== codigo.controlo.value) erros.push([repetir, 'Os dois códigos têm de ser iguais.']);
    if (erros.length) {
      erros.forEach(([campo, texto]) => campo.erro(texto));
      erros[0][0].controlo.focus();
      return;
    }

    botao.disabled = true;
    try {
      const r = await api.post('/api/criar-acesso', { nome: nome.controlo.value.trim(), codigo: codigo.controlo.value });
      concluir(r.nome);
    } catch (erro) {
      if (!(erro instanceof ErroApi)) throw erro;
      if (erro.estado === 409) { irParaEntrar(); return; }
      const campos = { nome, codigo };
      let mostrou = false;
      for (const [chave, texto] of Object.entries(erro.campos)) {
        if (campos[chave]) { campos[chave].erro(texto); mostrou = true; }
      }
      if (!mostrou) { aviso.textContent = erro.mensagem; aviso.hidden = false; }
    } finally {
      botao.disabled = false;
    }
  } }, nome.el, codigo.el, repetir.el, aviso, botao);

  return cartaoDaEntrada('Criar o acesso do coordenador', 'É a primeira vez que o site abre. Escolhe o código que vai proteger os dados dos alunos.', form);
}

// ---------------------------------------------------------------- sessão terminou

/** Abre uma janela por cima da página para escrever o código outra vez. Nada do que estava a ser escrito se perde. */
function reentrar() {
  if (reentrada) return reentrada;

  reentrada = new Promise((resolver) => {
    const codigo = criarCampoCodigo({ rotulo: 'Código do coordenador', nome: 'codigo-reentrada' });
    const aviso = h('p', { class: 'erro erro-geral', role: 'alert', hidden: true });
    const botao = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Continuar');

    const dialogo = h('dialog', { class: 'janela', 'aria-labelledby': 'reentrada-titulo' },
      h('form', { class: 'janela-corpo', novalidate: true, onsubmit: async (ev) => {
        ev.preventDefault();
        codigo.erro('');
        aviso.hidden = true;
        if (!codigo.controlo.value) { codigo.erro('Escreve o código para continuar.'); return; }
        botao.disabled = true;
        try {
          await api.post('/api/entrar', { codigo: codigo.controlo.value });
          dialogo.close();
          dialogo.remove();
          reentrada = null;
          resolver();
        } catch (erro) {
          if (!(erro instanceof ErroApi)) throw erro;
          if (erro.estado === 401) codigo.erro(erro.campos.codigo || erro.mensagem);
          else { aviso.textContent = erro.mensagem; aviso.hidden = false; }
          codigo.controlo.select();
        } finally {
          botao.disabled = false;
        }
      } },
      h('h2', { id: 'reentrada-titulo' }, 'A sessão terminou'),
      h('p', {}, 'Escreve o código outra vez para continuar. O que já tinhas escrito nesta página fica como está.'),
      codigo.el,
      aviso,
      h('div', { class: 'janela-acoes' },
        h('a', { class: 'btn btn-fantasma', href: 'index.html' }, 'Sair'),
        botao)));

    dialogo.addEventListener('cancel', (ev) => ev.preventDefault());   // só se fecha entrando
    document.body.append(dialogo);
    dialogo.showModal();
    codigo.controlo.focus();
  });
  return reentrada;
}

// ---------------------------------------------------------------- barra de cima

function montarTopo(pagina, nome) {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const tecla = mac ? '⌘ K' : 'Ctrl K';

  const nav = h('nav', { class: 'nav', 'aria-label': 'Principal' },
    PAGINAS.map((p) => h('a', { href: p.href, 'aria-current': p.id === pagina ? 'page' : null },
      icone(p.icone), h('span', {}, p.rotulo))));

  const botaoBusca = h('button', { type: 'button', class: 'topo-busca', 'aria-label': 'Procurar aluno ou ir para uma página',
    onclick: () => document.dispatchEvent(new CustomEvent('abrir-paleta')) },
    icone('procurar'),
    h('span', { class: 'topo-busca-texto' }, 'Procurar'),
    h('kbd', { class: 'tecla' }, tecla));

  const sair = h('button', { type: 'button', class: 'topo-sair', onclick: sairDaSessao },
    icone('sair'), h('span', {}, 'Sair'));

  const topo = $('#topo');
  esvaziar(topo, h('div', { class: 'topo-interior' },
    h('a', { class: 'marca', href: 'index.html', 'aria-label': 'Gestão de Alunos, ir para o painel' },
      marca(30), h('span', { class: 'marca-nome' }, 'Gestão de Alunos')),
    nav,
    h('div', { class: 'topo-direita' },
      botaoBusca,
      h('div', { class: 'utilizador' },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, (primeiroNome(nome)[0] || '?').toUpperCase()),
        h('span', { class: 'utilizador-nome' }, nome)),
      sair)));

  document.title = `${TITULOS[pagina] || 'Gestão'} – Gestão de Alunos`;
  topo.hidden = false;
  $('#conteudo').hidden = false;
  $('#aviso-js')?.remove();
}

async function sairDaSessao() {
  try { await api.post('/api/sair'); } catch { /* mesmo que falhe, voltamos ao início */ }
  location.href = 'index.html';
}
