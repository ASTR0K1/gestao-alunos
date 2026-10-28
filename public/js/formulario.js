// O formulário do aluno: serve para registar e para editar.
// Avisa logo ao escrever (nome parecido, turma, telefone), mas quem decide é sempre o servidor.

import { api, ErroApi } from './api.js';
import { criarCampo } from './campos.js';
import { icone } from './icones.js';
import {
  arrumarNome, consulta, debounce, digitosDoTelefone, erroDeNome, esvaziar, h, nomeDaTurma,
  normalizar, plural, telefoneAEscrever,
} from './util.js';

const MAX_OCORRENCIA = 500;
const MAX_TURMA = 10;
const MAX_SALA = 10;

const OPCOES_CLASSE = [{ valor: '', texto: 'Escolhe…' }]
  .concat(Array.from({ length: 13 }, (_, i) => ({ valor: String(i + 1), texto: `${i + 1}.ª classe` })));

// As turmas que já existem em cada classe (para sugerir enquanto se escreve a turma).
const turmasPorClasse = new Map();

export function esquecerTurmas(classe) {
  turmasPorClasse.delete(Number(classe));
}

async function turmasDaClasse(classe) {
  const c = Number(classe);
  if (!c) return [];
  if (!turmasPorClasse.has(c)) {
    const r = await api.get('/api/alunos?' + consulta({ classe: c, por_pagina: 5 }));
    turmasPorClasse.set(c, r.turmas);
  }
  return turmasPorClasse.get(c);
}

let numero = 0;

/**
 * criarFormulario({ modo: 'registar' | 'editar', aluno, aoGuardar(aluno), aoCancelar, aoMudar(valores), aoVerSemelhante(id) })
 * Devolve { el, valores(), definir(valores), focar(), prepararProximo(), sujo() }.
 */
export function criarFormulario({ modo = 'registar', aluno = null, aoGuardar, aoCancelar = null, aoMudar = () => {}, aoVerSemelhante = null }) {
  const edicao = modo === 'editar';
  const idLista = `turmas-existentes-${++numero}`;

  const espelho = h('p', { class: 'espelho', 'aria-live': 'polite' });
  const caixaSemelhantes = h('div', { class: 'semelhantes', 'aria-live': 'polite' });
  const lista = h('datalist', { id: idLista });
  const contador = h('p', { class: 'contador' }, `0/${MAX_OCORRENCIA}`);
  const dica = h('div', { class: 'dica-turma', 'aria-live': 'polite' });
  const erroGeral = h('div', { class: 'banner banner-erro', role: 'alert', hidden: true });

  const nome = criarCampo({
    rotulo: 'Nome completo', nome: 'nome',
    ajuda: 'Nome e apelido. As maiúsculas ficam certas sozinhas.',
    atributos: { autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', maxlength: '120', placeholder: 'João Manuel da Silva' },
    depois: [espelho, caixaSemelhantes],
  });
  const classe = criarCampo({ rotulo: 'Classe', nome: 'classe', opcoes: OPCOES_CLASSE });
  const turma = criarCampo({
    rotulo: 'Turma', nome: 'turma',
    atributos: { autocomplete: 'off', autocapitalize: 'characters', maxlength: String(MAX_TURMA), list: idLista, placeholder: 'A' },
    depois: lista,
  });
  const sala = criarCampo({
    rotulo: 'Sala', nome: 'sala',
    atributos: { autocomplete: 'off', maxlength: String(MAX_SALA), placeholder: '12' },
  });
  const encarregado = criarCampo({
    rotulo: 'Telefone do encarregado', nome: 'encarregado', tipo: 'tel',
    ajuda: '9 dígitos. Podes colar com o +244.',
    atributos: { inputmode: 'numeric', autocomplete: 'off', placeholder: '923 456 789' },
  });
  const ocorrencia = criarCampo({
    rotulo: 'Ocorrência (opcional)', nome: 'ocorrencia', linhas: 4,
    ajuda: 'Problemas na escola, faltas, comportamento. Deixa em branco se não houver nada a registar.',
    atributos: { autocomplete: 'off' },
    depois: contador,
  });
  const campos = { nome, classe, turma, sala, encarregado, ocorrencia };

  const botao = h('button', { type: 'submit', class: 'btn btn-primario' });
  const rotuloDoBotao = edicao ? 'Guardar alterações' : 'Registar aluno';
  const mostrarBotao = (aGuardar) => esvaziar(botao, aGuardar ? 'A guardar…' : [icone(edicao ? 'ok' : 'registar'), rotuloDoBotao]);
  mostrarBotao(false);

  const form = h('form', { class: 'formulario', novalidate: true, autocomplete: 'off' },
    nome.el,
    h('div', { class: 'linha-tres' }, classe.el, turma.el, sala.el),
    dica,
    encarregado.el,
    ocorrencia.el,
    erroGeral,
    h('div', { class: 'formulario-acoes' },
      botao,
      aoCancelar && h('button', { type: 'button', class: 'btn btn-fantasma', onclick: aoCancelar }, 'Cancelar')));

  // ------------------------------------------------------------ valores

  function valores() {
    return {
      nome: nome.controlo.value,
      classe: classe.controlo.value ? Number(classe.controlo.value) : '',
      turma: turma.controlo.value.trim().toUpperCase(),
      sala: sala.controlo.value.trim(),
      encarregado: digitosDoTelefone(encarregado.controlo.value),
      ocorrencia: ocorrencia.controlo.value.trim(),
    };
  }

  function definir(v) {
    nome.controlo.value = v.nome ?? '';
    classe.controlo.value = v.classe ? String(v.classe) : '';
    turma.controlo.value = v.turma ?? '';
    sala.controlo.value = v.sala ?? '';
    encarregado.controlo.value = telefoneAEscrever(digitosDoTelefone(v.encarregado ?? ''));
    ocorrencia.controlo.value = v.ocorrencia ?? '';
    actualizarEspelho();
    actualizarContador();
    actualizarListaDeTurmas();
  }

  // ------------------------------------------------------------ pequenas ajudas

  function actualizarEspelho() {
    const escrito = nome.controlo.value.trim().replace(/\s+/g, ' ');
    const arrumado = arrumarNome(nome.controlo.value);
    espelho.textContent = escrito && arrumado && arrumado !== escrito ? `Vai ficar: ${arrumado}` : '';
  }

  function actualizarContador() {
    const n = ocorrencia.controlo.value.length;
    contador.textContent = `${n}/${MAX_OCORRENCIA}`;
    contador.classList.toggle('contador-excedido', n > MAX_OCORRENCIA);
  }

  async function actualizarListaDeTurmas() {
    const c = classe.controlo.value;
    if (!c) { esvaziar(lista); return; }
    try {
      const turmas = await turmasDaClasse(c);
      if (classe.controlo.value !== c) return;
      esvaziar(lista, turmas.map((t) => h('option', { value: t })));
    } catch { /* é só uma sugestão */ }
  }

  // ------------------------------------------------------------ turma e sala

  let pedidoTurma = 0;
  const verTurma = debounce(async () => {
    const v = valores();
    if (!v.classe || !v.turma) { esvaziar(dica); return; }
    const meu = ++pedidoTurma;
    try {
      const r = await api.get('/api/turma?' + consulta({ classe: v.classe, turma: v.turma }));
      if (meu !== pedidoTurma) return;
      const quem = nomeDaTurma(v.classe, v.turma);
      esvaziar(dica);
      if (!r.total) {
        dica.append(h('p', { class: 'ajuda' }, `A ${quem} ainda não tem alunos. Esta vai ser a primeira ficha.`));
        return;
      }
      const sobreSala = r.sala_habitual ? ` A sala mais usada é a ${r.sala_habitual}.` : '';
      dica.append(h('p', { class: 'ajuda' }, `A ${quem} já tem ${plural(r.total, 'aluno', 'alunos')}.${sobreSala}`));
      if (r.sala_habitual && sala.controlo.value.trim() !== r.sala_habitual) {
        dica.append(h('button', { type: 'button', class: 'btn-ligacao', onclick: () => {
          sala.controlo.value = r.sala_habitual;
          sala.erro('');
          verTurma();
          aoMudar(valores());
          sala.controlo.focus();
        } }, `Usar a sala ${r.sala_habitual}`));
      }
    } catch { /* é só uma dica */ }
  }, 300);

  // ------------------------------------------------------------ nomes parecidos

  let pedidoSemelhantes = 0;
  let bloqueio = null;           // { chave } quando já existe o mesmo nome na mesma turma

  const chaveActual = () => {
    const v = valores();
    return `${normalizar(arrumarNome(v.nome))}|${v.classe}|${v.turma}`;
  };

  const verSemelhantes = debounce(async () => {
    const v = valores();
    const arrumado = arrumarNome(v.nome);
    if (normalizar(arrumado).replace(/[^a-z]/g, '').length < 5) {
      bloqueio = null;
      esvaziar(caixaSemelhantes);
      return;
    }
    const meu = ++pedidoSemelhantes;
    const chave = chaveActual();
    try {
      const r = await api.get('/api/semelhantes?' + consulta({
        nome: arrumado, classe: v.classe, turma: v.turma, ignorar: aluno?.id,
      }));
      if (meu !== pedidoSemelhantes) return;
      mostrarSemelhantes(r.semelhantes, chave);
    } catch { /* é só um aviso */ }
  }, 350);

  function mostrarSemelhantes(encontrados, chave) {
    esvaziar(caixaSemelhantes);
    const igualNaTurma = encontrados.find((s) => s.exacto && s.mesma_turma);
    bloqueio = igualNaTurma ? chave : null;
    if (!encontrados.length) return;

    const igualOutraTurma = encontrados.find((s) => s.exacto && !s.mesma_turma);
    let titulo;
    if (igualNaTurma) titulo = `${igualNaTurma.nome} já está registado na ${nomeDaTurma(igualNaTurma.classe, igualNaTurma.turma)}.`;
    else if (igualOutraTurma) titulo = 'Já existe um aluno com este nome noutra turma. Confirma se não é a mesma pessoa.';
    else if (encontrados.length === 1) titulo = 'Há um aluno com um nome parecido. Confirma se não é a mesma pessoa.';
    else titulo = 'Há alunos com nomes parecidos. Confirma se não é a mesma pessoa.';

    caixaSemelhantes.append(h('div', { class: `banner ${igualNaTurma ? 'banner-erro' : 'banner-aviso'}` },
      icone('aviso'),
      h('div', { class: 'banner-corpo' },
        h('p', { class: 'banner-titulo' }, titulo),
        h('ul', { class: 'lista-semelhantes' }, encontrados.map((s) => h('li', {},
          h('span', { class: 'semelhante-nome' }, s.nome),
          h('span', { class: 'semelhante-detalhe' }, `${nomeDaTurma(s.classe, s.turma)}, sala ${s.sala}`),
          aoVerSemelhante && h('button', { type: 'button', class: 'btn-ligacao', onclick: () => aoVerSemelhante(s.id) }, 'Ver ficha')))))));
  }

  // ------------------------------------------------------------ validação

  function validar(v) {
    const erros = {};
    const erroNome = erroDeNome(arrumarNome(v.nome));
    if (erroNome) erros.nome = erroNome;
    if (!v.classe) erros.classe = 'Escolhe a classe do aluno.';
    if (!v.turma) erros.turma = 'Indica a turma, por exemplo A.';
    else if (v.turma.length > MAX_TURMA) erros.turma = `Usa no máximo ${MAX_TURMA} caracteres.`;
    if (!v.sala) erros.sala = 'Indica a sala, por exemplo 12.';
    else if (v.sala.length > MAX_SALA) erros.sala = `Usa no máximo ${MAX_SALA} caracteres.`;
    if (v.encarregado.length !== 9) erros.encarregado = 'O número do encarregado deve ter 9 dígitos, por exemplo 923 456 789.';
    if (v.ocorrencia.length > MAX_OCORRENCIA) erros.ocorrencia = `Usa no máximo ${MAX_OCORRENCIA} caracteres.`;
    if (!erros.nome && !erros.classe && !erros.turma && bloqueio && bloqueio === chaveActual()) {
      erros.nome = 'Já existe um aluno com este nome na mesma classe e turma.';
    }
    return erros;
  }

  function mostrarErros(erros) {
    let primeiro = null;
    for (const [chave, campo] of Object.entries(campos)) {
      campo.erro(erros[chave] || '');
      if (erros[chave] && !primeiro) primeiro = campo;
    }
    return primeiro;
  }

  // ------------------------------------------------------------ eventos

  form.addEventListener('input', (ev) => {
    const alvo = ev.target;
    erroGeral.hidden = true;

    if (alvo === encarregado.controlo) {
      const antes = alvo.value;
      const cursor = alvo.selectionStart ?? antes.length;
      const digitosAntes = digitosDoTelefone(antes.slice(0, cursor)).length;
      const novo = telefoneAEscrever(digitosDoTelefone(antes));
      if (novo !== antes) {
        alvo.value = novo;
        let contados = 0;
        let pos = 0;
        while (pos < novo.length && contados < digitosAntes) { if (/\d/.test(novo[pos])) contados++; pos++; }
        alvo.setSelectionRange(pos, pos);
      }
    } else if (alvo === turma.controlo) {
      const maiusculas = alvo.value.toUpperCase();
      if (maiusculas !== alvo.value) alvo.value = maiusculas;
    }

    for (const campo of Object.values(campos)) if (campo.controlo === alvo) campo.erro('');

    if (alvo === nome.controlo) actualizarEspelho();
    if (alvo === ocorrencia.controlo) actualizarContador();
    if (alvo === classe.controlo) actualizarListaDeTurmas();
    if ([nome, classe, turma].some((c) => c.controlo === alvo)) verSemelhantes();
    if ([classe, turma].some((c) => c.controlo === alvo)) verTurma();

    aoMudar(valores());
  });

  ocorrencia.controlo.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) form.requestSubmit();
  });

  let aGuardar = false;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (aGuardar) return;
    erroGeral.hidden = true;
    const v = valores();
    const primeiro = mostrarErros(validar(v));
    if (primeiro) { primeiro.controlo.focus(); return; }

    aGuardar = true;
    botao.disabled = true;
    mostrarBotao(true);
    try {
      const dados = edicao ? await api.put(`/api/alunos/${aluno.id}`, v) : await api.post('/api/alunos', v);
      esquecerTurmas(dados.classe);
      if (aluno) esquecerTurmas(aluno.classe);
      await aoGuardar(dados);
    } catch (erro) {
      if (!(erro instanceof ErroApi)) throw erro;
      const poucos = mostrarErros(erro.campos);
      if (poucos) poucos.controlo.focus();
      else {
        esvaziar(erroGeral, icone('aviso'), h('p', {}, erro.mensagem));
        erroGeral.hidden = false;
      }
    } finally {
      aGuardar = false;
      botao.disabled = false;
      mostrarBotao(false);
    }
  });

  // ------------------------------------------------------------ o que se pode fazer por fora

  if (aluno) definir(aluno);
  else actualizarListaDeTurmas();

  return {
    el: form,
    valores,
    definir,
    focar: () => nome.controlo.focus(),
    sujo: () => Boolean(nome.controlo.value.trim() || encarregado.controlo.value.trim() || ocorrencia.controlo.value.trim()),
    /** Depois de registar: limpa o aluno mas mantém classe, turma e sala (quem regista uma turma inteira agradece). */
    prepararProximo() {
      nome.controlo.value = '';
      encarregado.controlo.value = '';
      ocorrencia.controlo.value = '';
      Object.values(campos).forEach((c) => c.erro(''));
      erroGeral.hidden = true;
      bloqueio = null;
      pedidoSemelhantes++;
      esvaziar(caixaSemelhantes);
      actualizarEspelho();
      actualizarContador();
      verTurma();
      nome.controlo.focus();
    },
  };
}
