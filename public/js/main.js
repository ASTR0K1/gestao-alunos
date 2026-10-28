// Ponto de entrada: confirma a sessão e arranca o código da página em que estamos.

import { icone } from './icones.js';
import { abrirPaleta } from './paleta.js';
import { iniciarSessao } from './sessao.js';
import { aviso } from './ui.js';
import { $ } from './util.js';

const PAGINAS = {
  painel: () => import('./painel.js'),
  pesquisar: () => import('./pesquisa.js'),
  registar: () => import('./registo.js'),
};

// Ícones que estão escritos no HTML como <span data-icone="procurar">
for (const marcador of document.querySelectorAll('[data-icone]')) {
  marcador.replaceWith(icone(marcador.dataset.icone));
}

function atalhos() {
  document.addEventListener('abrir-paleta', abrirPaleta);

  document.addEventListener('keydown', (ev) => {
    const escrever = ev.target.closest?.('input, textarea, select, [contenteditable]');
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      abrirPaleta();
    } else if (ev.key === '/' && !escrever && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !document.querySelector('dialog[open]')) {
      ev.preventDefault();
      const campo = $('[data-busca-principal]');
      if (campo) campo.focus();
      else abrirPaleta();
    }
  });
}

async function arrancar() {
  const pagina = document.body.dataset.pagina;
  const sessao = await iniciarSessao(pagina);
  atalhos();
  try {
    const modulo = await PAGINAS[pagina]();
    await modulo.iniciar(sessao);
  } catch (erro) {
    console.error(erro);
    aviso('Não consegui carregar esta página. Atualiza a página (F5). Se continuar, fecha e abre outra vez o servidor.', { tipo: 'erro' });
  }
}

arrancar();
