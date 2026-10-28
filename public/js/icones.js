// Ícones desenhados à mão em SVG (sem bibliotecas nem ficheiros de fora).

const NS = 'http://www.w3.org/2000/svg';

const CAMINHOS = {
  procurar: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  painel: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  registar: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M19 8v6M16 11h6"/>',
  sair: '<path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10"/><path d="M15 8l4 4-4 4M19 12H9"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  editar: '<path d="M4 20l1.2-4.2L16.6 4.4a2.1 2.1 0 0 1 3 3L8.2 18.8 4 20z"/><path d="M14.5 6.5l3 3"/>',
  apagar: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.5h9.2L17.5 7M10 11v5.5M14 11v5.5"/>',
  copiar: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  telefone: '<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/>',
  esquerda: '<path d="M15 5l-7 7 7 7"/>',
  direita: '<path d="M9 5l7 7-7 7"/>',
  cima: '<path d="M6 15l6-6 6 6"/>',
  baixo: '<path d="M6 9l6 6 6-6"/>',
  tabela: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 10h17M9 10v9"/>',
  fichas: '<rect x="3.5" y="4.5" width="7.5" height="7" rx="1.5"/><rect x="13" y="4.5" width="7.5" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7.5" height="6" rx="1.5"/><rect x="13" y="13.5" width="7.5" height="6" rx="1.5"/>',
  aviso: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.4v.1"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  desfazer: '<path d="M9 6L4 11l5 5"/><path d="M4.5 11H14a5 5 0 0 1 0 10h-3"/>',
  bandeira: '<path d="M6 20V4M6 5h11l-2.5 4 2.5 4H6"/>',
  olho: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  olhoFechado: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
};

export function icone(nome, classe = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icone ${classe}`.trim());
  svg.innerHTML = CAMINHOS[nome] || '';
  return svg;
}

/** O símbolo do site: uma ficha com a linha vermelha de cima e as linhas azuis. */
export function marca(tamanho = 30) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(tamanho));
  svg.setAttribute('height', String(tamanho));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML =
    '<rect x="3" y="5" width="26" height="22" rx="3" fill="#ffffff"/>' +
    '<path d="M3 11.5h26" stroke="#B3342A" stroke-width="2"/>' +
    '<path d="M8 17h16M8 22h10" stroke="#9DB6D0" stroke-width="1.7" stroke-linecap="round"/>';
  return svg;
}

/** Desenho para quando não há nada para mostrar: uma gaveta de fichas vazia. */
export function desenhoVazio() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 90');
  svg.setAttribute('width', '120');
  svg.setAttribute('height', '90');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'desenho-vazio');
  svg.innerHTML =
    '<rect x="14" y="52" width="92" height="30" rx="4" fill="#1E3B35"/>' +
    '<rect x="46" y="62" width="28" height="7" rx="3.5" fill="#EBEFEA"/>' +
    '<g transform="rotate(-7 44 40)"><rect x="24" y="14" width="46" height="40" rx="3" fill="#fff" stroke="#C9D3CC"/>' +
    '<path d="M24 24h46" stroke="#B3342A" stroke-width="1.6"/><path d="M30 33h34M30 40h22" stroke="#CFE0EE" stroke-width="1.6" stroke-linecap="round"/></g>' +
    '<g transform="rotate(6 76 38)"><rect x="52" y="10" width="46" height="42" rx="3" fill="#fff" stroke="#C9D3CC"/>' +
    '<path d="M52 20h46" stroke="#B3342A" stroke-width="1.6"/><path d="M58 29h34M58 36h22M58 43h28" stroke="#CFE0EE" stroke-width="1.6" stroke-linecap="round"/></g>' +
    '<rect x="14" y="52" width="92" height="30" rx="4" fill="#1E3B35"/>' +
    '<rect x="46" y="62" width="28" height="7" rx="3.5" fill="#EBEFEA"/>';
  return svg;
}
