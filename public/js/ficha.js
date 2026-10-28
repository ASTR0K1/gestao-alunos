// A ficha do aluno (o cartão que se repete no site todo) e a gaveta que a mostra.

import { api, ErroApi } from './api.js';
import { criarFormulario } from './formulario.js';
import { icone } from './icones.js';
import { aviso, fecharAoClicarFora } from './ui.js';
import {
  ciclo, copiar, destacar, digitosDoTelefone, esvaziar, h, telefoneAEscrever,
} from './util.js';

const preenchido = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/**
 * Cria uma ficha que se pode ir actualizando: { el, atualizar(aluno, { destaques, rascunho }) }.
 * `rascunho` é a ficha do formulário de registo, que vai sendo preenchida enquanto se escreve.
 */
export function criarFicha({ compacta = false } = {}) {
  const nome = h('h3', { class: 'ficha-nome' });
  const etiquetaTurma = h('strong');
  const etiquetaCiclo = h('small');
  const sala = h('dd');
  const telefone = h('dd', { class: 'ficha-telefone' });
  const ocorrencia = h('dd');
  const linhaOcorrencia = h('div', { class: 'ficha-linha ficha-ocorrencia' }, h('dt', {}, 'Ocorrência'), ocorrencia);

  const el = h('article', { class: `ficha${compacta ? ' ficha-compacta' : ''}` },
    h('header', { class: 'ficha-topo' },
      nome,
      h('div', { class: 'ficha-etiqueta' }, etiquetaTurma, etiquetaCiclo)),
    h('dl', { class: 'ficha-corpo' },
      h('div', { class: 'ficha-linha' }, h('dt', {}, 'Sala'), sala),
      h('div', { class: 'ficha-linha' }, h('dt', {}, 'Encarregado'), telefone),
      linhaOcorrencia));

  function atualizar(aluno = {}, { destaques = [], rascunho = false } = {}) {
    el.classList.toggle('ficha-rascunho', rascunho);

    esvaziar(nome, preenchido(aluno.nome)
      ? (destaques.length ? destacar(aluno.nome, destaques) : aluno.nome)
      : h('span', { class: 'vazio' }, 'Nome do aluno'));

    const classe = Number(aluno.classe) || 0;
    const c = classe ? ciclo(classe) : null;
    el.dataset.ciclo = c ? String(c.id) : '0';
    etiquetaTurma.textContent = classe ? `${classe}.ª ${aluno.turma || ''}`.trim() : 'Turma';
    etiquetaCiclo.textContent = c ? c.nome : 'Classe';

    esvaziar(sala, preenchido(aluno.sala) ? destacar(aluno.sala, destaques) : h('span', { class: 'vazio' }, 'Sala'));

    const digitos = digitosDoTelefone(aluno.encarregado ?? '');
    esvaziar(telefone);
    if (digitos) {
      telefone.append(h('span', { class: 'telefone-numero' }, destacar(telefoneAEscrever(digitos), destaques)));
      if (!rascunho && !compacta && digitos.length === 9) {
        telefone.append(
          h('button', { type: 'button', class: 'btn-mini', 'aria-label': `Copiar o número ${telefoneAEscrever(digitos)}`,
            onclick: async (ev) => {
              const botao = ev.currentTarget;
              const ok = await copiar(digitos);
              aviso(ok ? 'Número copiado.' : 'Não consegui copiar. Seleciona o número e copia à mão.', { tipo: ok ? 'ok' : 'erro', duracao: 2500 });
              botao.focus();
            } }, icone('copiar'), 'Copiar'),
          h('a', { class: 'btn-mini', href: `tel:+244${digitos}`, 'aria-label': `Ligar para ${telefoneAEscrever(digitos)}` }, icone('telefone'), 'Ligar'));
      }
    } else {
      telefone.append(h('span', { class: 'vazio' }, 'Telefone'));
    }

    const temOcorrencia = preenchido(aluno.ocorrencia);
    linhaOcorrencia.classList.toggle('com-ocorrencia', temOcorrencia);
    esvaziar(ocorrencia, temOcorrencia
      ? destacar(aluno.ocorrencia, destaques)
      : h('span', { class: 'vazio' }, rascunho ? 'O que aconteceu, se houver algo a registar' : 'Sem ocorrências registadas'));
  }

  return { el, atualizar };
}

// =============================================================================
// A gaveta: mostra uma ficha ao lado, com setas para o aluno seguinte, editar e apagar.
// =============================================================================

let gaveta = null;
let estado = null;
let aoAlterarEstaFicha = () => {};

/** Avisa a página que aberta a gaveta (e as outras, pelo evento) de que a lista mudou. */
function aoAlterar(aluno) {
  aoAlterarEstaFicha(aluno);
  document.dispatchEvent(new CustomEvent('alunos-alterados'));
}

/**
 * abrirFicha(alunoOuId, { lista, destaques, aoAlterar })
 * `lista` são os alunos que estão no ecrã, para as setas passarem de um para o outro.
 * `aoAlterar` (opcional) é chamada quando se edita, apaga ou desfaz. O site inteiro também
 * recebe o evento "alunos-alterados" para se actualizar.
 */
export async function abrirFicha(alvo, { lista = [], destaques = [], aoAlterar: depois = null } = {}) {
  garantirGaveta();
  aoAlterarEstaFicha = depois || (() => {});

  let aluno = typeof alvo === 'object' ? alvo : lista.find((a) => a.id === alvo);
  if (!aluno) {
    try {
      aluno = await api.get(`/api/alunos/${alvo}`);
    } catch (erro) {
      aviso(erro.mensagem || 'Não consegui abrir a ficha.', { tipo: 'erro' });
      return;
    }
  }

  let indice = lista.findIndex((a) => a.id === aluno.id);
  const alunos = indice === -1 ? [aluno] : [...lista];
  if (indice === -1) indice = 0;

  estado = { alunos, indice, aluno, destaques, modo: 'ver', erro: '' };
  desenhar();
  if (!gaveta.open) gaveta.showModal();

  // Confere em silêncio se a ficha mudou entretanto (ou se já foi apagada).
  const id = aluno.id;
  api.get(`/api/alunos/${id}`).then((fresco) => {
    if (estado?.aluno.id === id && estado.modo === 'ver' && JSON.stringify(fresco) !== JSON.stringify(estado.aluno)) {
      estado.aluno = fresco;
      estado.alunos[estado.indice] = fresco;
      desenhar();
    }
  }).catch((erro) => {
    if (erro instanceof ErroApi && erro.estado === 404 && estado?.aluno.id === id) {
      aviso('Este aluno já não existe na lista.', { tipo: 'erro' });
      gaveta.close();
      aoAlterar();
    }
  });
}

function garantirGaveta() {
  if (gaveta) return;
  gaveta = h('dialog', { class: 'gaveta', 'aria-label': 'Ficha do aluno' });
  fecharAoClicarFora(gaveta);

  // Esc na edição volta à ficha em vez de fechar tudo
  gaveta.addEventListener('cancel', (ev) => {
    if (estado && estado.modo !== 'ver') {
      ev.preventDefault();
      estado.modo = 'ver';
      desenhar();
    }
  });

  gaveta.addEventListener('keydown', (ev) => {
    if (!estado || estado.modo !== 'ver' || ev.target.closest('input, textarea, select')) return;
    if (ev.key === 'ArrowLeft') ir(-1);
    if (ev.key === 'ArrowRight') ir(1);
  });

  document.body.append(gaveta);
}

function ir(passo) {
  const novo = estado.indice + passo;
  if (novo < 0 || novo >= estado.alunos.length) return;
  estado.indice = novo;
  estado.aluno = estado.alunos[novo];
  estado.erro = '';
  desenhar(passo > 0 ? '[data-acao="seguinte"]' : '[data-acao="anterior"]');
}

function desenhar(focarEm = null) {
  const { aluno, alunos, indice, modo } = estado;

  const ficha = criarFicha();
  ficha.atualizar(aluno, { destaques: estado.destaques });

  const navegacao = alunos.length > 1 && modo === 'ver'
    ? h('div', { class: 'gaveta-nav' },
      h('button', { type: 'button', class: 'btn btn-fantasma btn-icone', 'data-acao': 'anterior', 'aria-label': 'Aluno anterior',
        disabled: indice === 0, onclick: () => ir(-1) }, icone('esquerda')),
      h('span', { class: 'gaveta-posicao' }, `${indice + 1} de ${alunos.length}`),
      h('button', { type: 'button', class: 'btn btn-fantasma btn-icone', 'data-acao': 'seguinte', 'aria-label': 'Aluno seguinte',
        disabled: indice === alunos.length - 1, onclick: () => ir(1) }, icone('direita')))
    : h('div', { class: 'gaveta-nav' });

  const topo = h('header', { class: 'gaveta-topo' },
    navegacao,
    h('button', { type: 'button', class: 'btn btn-fantasma btn-icone', 'aria-label': 'Fechar ficha', onclick: () => gaveta.close() }, icone('fechar')));

  const erro = estado.erro
    ? h('div', { class: 'banner banner-erro', role: 'alert' }, icone('aviso'), h('p', {}, estado.erro))
    : null;

  let corpo;
  if (modo === 'editar') {
    const formulario = criarFormulario({
      modo: 'editar',
      aluno,
      aoCancelar: () => { estado.modo = 'ver'; desenhar('[data-acao="editar"]'); },
      aoGuardar: (novo) => {
        estado.aluno = novo;
        estado.alunos[estado.indice] = novo;
        estado.modo = 'ver';
        desenhar('[data-acao="editar"]');
        aviso('Alterações guardadas.', { tipo: 'ok' });
        aoAlterar(novo);
      },
    });
    corpo = h('div', { class: 'gaveta-corpo' },
      h('h2', { class: 'gaveta-titulo' }, 'Editar ficha'),
      formulario.el);
    focarEm = focarEm || '#' + formulario.el.querySelector('input').id;
  } else {
    corpo = h('div', { class: 'gaveta-corpo' },
      erro,
      ficha.el,
      h('p', { class: 'gaveta-meta' }, `Registo n.º ${aluno.id}`),
      modo === 'apagar' ? confirmacaoDeApagar(aluno) : accoes());
  }

  esvaziar(gaveta, h('div', { class: 'gaveta-interior' }, topo, corpo));

  const alvo = focarEm && gaveta.querySelector(focarEm);
  if (alvo && !alvo.disabled) alvo.focus();
  else if (focarEm) gaveta.querySelector('.gaveta-nav button:not([disabled])')?.focus();
}

function accoes() {
  return h('div', { class: 'gaveta-acoes' },
    h('button', { type: 'button', class: 'btn btn-secundario', 'data-acao': 'editar', onclick: () => { estado.modo = 'editar'; estado.erro = ''; desenhar(); } },
      icone('editar'), 'Editar'),
    h('button', { type: 'button', class: 'btn btn-fantasma btn-perigo-texto', 'data-acao': 'apagar', onclick: () => { estado.modo = 'apagar'; estado.erro = ''; desenhar('#confirmar-apagar'); } },
      icone('apagar'), 'Apagar'));
}

function confirmacaoDeApagar(aluno) {
  return h('div', { class: 'confirmacao', role: 'group', 'aria-label': 'Confirmar que se apaga o aluno' },
    h('p', {}, h('strong', {}, `Apagar ${aluno.nome}?`)),
    h('p', { class: 'ajuda' }, 'Fica guardada uma cópia de segurança e podes desfazer logo a seguir.'),
    h('div', { class: 'confirmacao-acoes' },
      h('button', { type: 'button', id: 'confirmar-apagar', class: 'btn btn-perigo', onclick: apagar }, icone('apagar'), 'Sim, apagar'),
      h('button', { type: 'button', class: 'btn btn-fantasma', onclick: () => { estado.modo = 'ver'; desenhar('[data-acao="apagar"]'); } }, 'Cancelar')));
}

async function apagar() {
  const { aluno } = estado;
  try {
    const r = await api.apagar(`/api/alunos/${aluno.id}`);
    const apagado = r.aluno || aluno;

    gaveta.close();
    aoAlterar();
    aviso(`${apagado.nome} foi apagado.`, {
      tipo: 'ok',
      acao: { rotulo: 'Desfazer', aoClicar: () => desfazer(apagado) },
    });
  } catch (erro) {
    if (!(erro instanceof ErroApi)) throw erro;
    estado.modo = 'ver';
    estado.erro = erro.estado === 404 ? 'Este aluno já tinha sido apagado.' : erro.mensagem;
    desenhar();
    if (erro.estado === 404) aoAlterar();
  }
}

async function desfazer(apagado) {
  try {
    const de_volta = await api.post('/api/restaurar', apagado);
    aviso(`${de_volta.nome} voltou à lista.`, { tipo: 'ok' });
    aoAlterar(de_volta);
  } catch (erro) {
    aviso(erro.mensagem || 'Não consegui desfazer.', { tipo: 'erro' });
  }
}
