// Funções pequenas usadas por todo o site.

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

/**
 * Cria um elemento: h('button', { class: 'btn', onclick: ... }, 'Texto', outroElemento).
 * Os textos entram sempre como texto (nunca como HTML), por isso o que o utilizador
 * escreve não pode estragar a página.
 */
export function h(etiqueta, atributos, ...filhos) {
  const el = document.createElement(etiqueta);
  for (const [chave, valor] of Object.entries(atributos || {})) {
    if (valor == null || valor === false) continue;
    if (chave === 'class') el.className = valor;
    else if (chave === 'dataset') Object.assign(el.dataset, valor);
    else if (chave.startsWith('on') && typeof valor === 'function') el.addEventListener(chave.slice(2), valor);
    else if (valor === true) el.setAttribute(chave, '');
    else el.setAttribute(chave, valor);
  }
  juntar(el, filhos);
  return el;
}

export function juntar(el, filhos) {
  for (const filho of filhos.flat(Infinity)) {
    if (filho == null || filho === false) continue;
    el.append(filho.nodeType ? filho : document.createTextNode(String(filho)));
  }
  return el;
}

export function esvaziar(el, ...filhos) {
  el.replaceChildren();
  return juntar(el, filhos);
}

// --- Texto -------------------------------------------------------------------

export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function plural(n, singular, varios) {
  return `${n} ${n === 1 ? singular : varios}`;
}

export function curto(texto, limite = 80) {
  const t = String(texto ?? '');
  return t.length <= limite ? t : t.slice(0, limite - 1).trimEnd() + '…';
}

export function primeiroNome(nome) {
  return String(nome ?? '').trim().split(/\s+/)[0] || '';
}

export function saudacao(agora = new Date()) {
  const hora = agora.getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 19) return 'Boa tarde';
  return 'Boa noite';
}

// --- Escola ------------------------------------------------------------------

/** Primário: 1.ª a 6.ª · 1.º Ciclo: 7.ª a 9.ª · 2.º Ciclo: 10.ª a 13.ª */
export function ciclo(classe) {
  if (classe <= 6) return { id: 1, nome: 'Primário' };
  if (classe <= 9) return { id: 2, nome: '1.º Ciclo' };
  return { id: 3, nome: '2.º Ciclo' };
}

export const nomeDaClasse = (classe) => `${classe}.ª classe`;
export const nomeDaTurma = (classe, turma) => `${classe}.ª ${turma}`;

// --- Telefone ----------------------------------------------------------------

export function formatarTelefone(valor) {
  const d = String(valor ?? '').replace(/\D/g, '');
  return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
}

/** Só os dígitos do número, sem o +244 e no máximo 9. */
export function digitosDoTelefone(valor) {
  const texto = String(valor ?? '');
  let d = texto.replace(/\D/g, '');
  if (/^\s*(\+|00)\s*244/.test(texto)) d = d.replace(/^(00)?244/, '');
  else if (d.length >= 12 && d.startsWith('244')) d = d.slice(3);
  return d.slice(0, 9);
}

/** 923456 -> "923 456", para mostrar enquanto se escreve. */
export function telefoneAEscrever(digitos) {
  return digitos.replace(/(\d{3})(?=\d)/g, '$1 ');
}

// --- Nomes (as mesmas regras do servidor, para avisar logo ao escrever) ----------

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
export const MAX_NOME = 80;

export function limparTexto(valor) {
  return String(valor ?? '')
    .normalize('NFC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/;/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

const ePequena = (c) => c === c.toLowerCase() && c !== c.toUpperCase();
const eGrande = (c) => c === c.toUpperCase() && c !== c.toLowerCase();

/** 'tIAGO': primeira letra minúscula e todas as outras maiúsculas (Caps Lock ligado sem querer). */
function capsTrocado(palavra) {
  const letras = [...palavra].filter((c) => /\p{L}/u.test(c));
  return letras.length >= 2 && ePequena(letras[0]) && letras.slice(1).every(eGrande);
}

/** 'joão DA silva' -> 'João da Silva'. Só mexe nas palavras todas em minúsculas, todas em maiúsculas ou com o Caps Lock trocado. */
export function arrumarNome(valor) {
  return limparTexto(valor).split(' ').filter(Boolean).map((palavra, i) => {
    const minuscula = palavra.toLowerCase();
    const maiuscula = palavra.toUpperCase();
    const soMinusculas = palavra === minuscula && palavra !== maiuscula;
    const soMaiusculas = palavra === maiuscula && palavra !== minuscula;
    if (!soMinusculas && !soMaiusculas && !capsTrocado(palavra)) return palavra;
    if (i > 0 && PARTICULAS.has(minuscula)) return minuscula;
    return minuscula.replace(/\p{L}+/gu, (parte) => parte.charAt(0).toUpperCase() + parte.slice(1));
  }).join(' ');
}

export function erroDeNome(nome) {
  const eLetra = (c) => /\p{L}/u.test(c);
  if (!nome) return 'Escreve o nome completo do aluno: nome e apelido.';
  if ([...nome].some((c) => !(eLetra(c) || " '’.-".includes(c)))) {
    return 'O nome só pode ter letras, espaços, hífen, apóstrofo e ponto.';
  }
  const comLetras = nome.split(' ').filter((p) => [...p].some(eLetra));
  const letras = [...nome].filter(eLetra).length;
  if (comLetras.length < 2 || letras < 3) return 'Escreve o nome completo do aluno: nome e apelido.';
  if (nome.length > MAX_NOME) return `Usa no máximo ${MAX_NOME} caracteres.`;
  return null;
}

// --- Realçar o que foi pesquisado ----------------------------------------------

/**
 * Devolve o texto com as partes que batem com `termos` dentro de <mark>.
 * Ignora acentos e maiúsculas: pesquisar "joao" realça "João".
 */
export function destacar(texto, termos) {
  const origem = Array.from(String(texto ?? ''));
  const validos = [...new Set((termos || []).map(normalizar).filter((t) => t.length >= 2))];
  const fragmento = document.createDocumentFragment();
  if (!validos.length || !origem.length) {
    fragmento.append(origem.join(''));
    return fragmento;
  }

  // Cada letra passa a letra sem acento, uma a uma, para os índices continuarem a bater certo.
  const simples = origem.map((c) => {
    const n = normalizar(c);
    return n.length === 1 ? n : '\u0001';
  }).join('');

  const marcado = new Array(origem.length).fill(false);
  for (const termo of validos) {
    let desde = 0;
    for (;;) {
      const i = simples.indexOf(termo, desde);
      if (i === -1) break;
      for (let k = i; k < i + termo.length; k++) marcado[k] = true;
      desde = i + 1;
    }
  }

  let inicio = 0;
  while (inicio < origem.length) {
    let fim = inicio;
    while (fim < origem.length && marcado[fim] === marcado[inicio]) fim++;
    const pedaco = origem.slice(inicio, fim).join('');
    fragmento.append(marcado[inicio] ? h('mark', {}, pedaco) : pedaco);
    inicio = fim;
  }
  return fragmento;
}

// --- Diversos ----------------------------------------------------------------

export function debounce(funcao, ms) {
  let relogio;
  const adiada = (...args) => {
    clearTimeout(relogio);
    relogio = setTimeout(() => funcao(...args), ms);
  };
  adiada.cancelar = () => clearTimeout(relogio);
  return adiada;
}

export function consulta(objeto) {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(objeto)) {
    if (valor !== '' && valor != null && valor !== false) p.set(chave, valor === true ? '1' : valor);
  }
  return p.toString();
}

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', class: 'fora-do-ecra' });
    area.value = texto;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

/** Setas para cima e para baixo percorrem os itens de uma lista; a seta para cima no primeiro volta ao campo. */
export function navegarComSetas(contentor, { entrada = null, seletor = 'button' } = {}) {
  contentor.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const itens = $$(seletor, contentor).filter((el) => !el.disabled && el.offsetParent !== null);
    const i = itens.indexOf(document.activeElement);
    if (i === -1) return;
    ev.preventDefault();
    if (ev.key === 'ArrowDown') (itens[i + 1] || itens[i]).focus();
    else if (i > 0) itens[i - 1].focus();
    else if (entrada) entrada.focus();
  });
  if (entrada) {
    entrada.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowDown') return;
      const primeiro = $$(seletor, contentor).find((el) => !el.disabled && el.offsetParent !== null);
      if (primeiro) { ev.preventDefault(); primeiro.focus(); }
    });
  }
}
