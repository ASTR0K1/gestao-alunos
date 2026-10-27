/* Gestão de alunos — frontend ligado à API do servidor (src/servidor.py).
   Os dados ficam no servidor, em bd/alunos.txt. Aqui só se mostra e se pede. */
(function () {
  'use strict';

  const MAX_OCORRENCIA = 500;
  const TURMAS_COMUNS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /* =====================================================================
     Utilitários
     ===================================================================== */

  const $ = (seletor, raiz) => (raiz || document).querySelector(seletor);
  const $$ = (seletor, raiz) => Array.from((raiz || document).querySelectorAll(seletor));

  function criar(etiqueta, classe, texto) {
    const e = document.createElement(etiqueta);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function limpar(texto) {
    return String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  }

  // Minúsculas e sem acentos, para pesquisar "joao" e encontrar "João"
  function normalizar(texto) {
    return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function soDigitos(texto) {
    let d = String(texto == null ? '' : texto).replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('244') === 0) d = d.slice(3);
    return d;
  }

  function formatarTelefone(d) {
    return d.length === 9 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d;
  }

  // Formata o número enquanto se escreve: 923456 -> "923 456"
  function formatarEnquantoEscreve(valor) {
    let d = valor.replace(/\D/g, '');
    if ((/^\s*\+/.test(valor) || d.length > 9) && d.indexOf('244') === 0) d = d.slice(3);
    d = d.slice(0, 9);
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(' ');
  }

  function iniciais(nome) {
    const palavras = limpar(nome).split(' ').filter(Boolean);
    if (!palavras.length) return '?';
    const primeira = palavras[0].charAt(0);
    const ultima = palavras.length > 1 ? palavras[palavras.length - 1].charAt(0) : '';
    return (primeira + ultima).toUpperCase();
  }

  function criarAvatar(aluno, grande) {
    const e = criar('span', 'avatar avatar--' + (aluno.id % 6) + (grande ? ' avatar--grande' : ''), iniciais(aluno.nome));
    e.setAttribute('aria-hidden', 'true');
    return e;
  }

  function atrasar(funcao, ms) {
    let temporizador;
    return function () {
      const argumentos = arguments;
      clearTimeout(temporizador);
      temporizador = setTimeout(function () { funcao.apply(null, argumentos); }, ms);
    };
  }

  // Põe o texto com os termos pesquisados destacados (<mark>)
  function realcar(texto, termos) {
    const fragmento = document.createDocumentFragment();
    const normal = normalizar(texto);
    if (!termos.length || normal.length !== texto.length) {
      fragmento.appendChild(document.createTextNode(texto));
      return fragmento;
    }
    const marcado = new Array(texto.length).fill(false);
    termos.forEach(function (termo) {
      let i = normal.indexOf(termo);
      while (i !== -1) {
        for (let k = i; k < i + termo.length; k++) marcado[k] = true;
        i = normal.indexOf(termo, i + termo.length);
      }
    });
    let inicio = 0;
    while (inicio < texto.length) {
      let fim = inicio;
      while (fim < texto.length && marcado[fim] === marcado[inicio]) fim++;
      const pedaco = texto.slice(inicio, fim);
      if (marcado[inicio]) fragmento.appendChild(criar('mark', null, pedaco));
      else fragmento.appendChild(document.createTextNode(pedaco));
      inicio = fim;
    }
    return fragmento;
  }

  async function copiarTexto(texto) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch (e) { /* tenta o método antigo */ }
    // O campo temporário tem de ficar dentro do diálogo aberto, senão não pode ser seleccionado
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    (document.querySelector('dialog[open]') || document.body).appendChild(area);
    area.select();
    let copiou = false;
    try { copiou = document.execCommand('copy'); } catch (e) { copiou = false; }
    area.remove();
    return copiou;
  }

  /* =====================================================================
     Comunicação com o servidor
     ===================================================================== */

  class ErroApi extends Error {
    constructor(estado, mensagem, campos) {
      super(mensagem);
      this.estado = estado;
      this.campos = campos || {};
    }
  }

  async function api(metodo, caminho, corpo, sinal) {
    const opcoes = {
      method: metodo,
      headers: { 'X-Requested-With': 'fetch', 'Accept': 'application/json' },
      credentials: 'same-origin',
      signal: sinal
    };
    if (corpo !== undefined) {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }

    let resposta;
    try {
      resposta = await fetch(caminho, opcoes);
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new ErroApi(0, 'Não foi possível falar com o servidor. Confirma que ele está a funcionar.');
    }

    let dados = null;
    try { dados = await resposta.json(); } catch (e) { dados = null; }

    if (!resposta.ok) {
      // Sessão terminada numa página protegida: volta ao início para entrar outra vez
      if (resposta.status === 401 && document.body.hasAttribute('data-protegida')) {
        window.location.replace('index.html?expirou=1');
      }
      throw new ErroApi(
        resposta.status,
        (dados && dados.erro) || 'Ocorreu um erro. Tenta outra vez.',
        dados && dados.campos
      );
    }
    return dados;
  }

  function mostrarErroServidor(abertoComoFicheiro) {
    document.body.classList.add('sessao-validada');
    const folha = $('.folha');
    folha.textContent = '';
    folha.appendChild(criar('h1', null, 'Não foi possível ligar ao servidor'));
    folha.appendChild(criar('p', 'intro', abertoComoFicheiro
      ? 'Esta página foi aberta como ficheiro. Ela precisa do servidor para guardar e pesquisar os alunos.'
      : 'O servidor não respondeu. Confirma que ele está a funcionar e tenta outra vez.'));

    const passos = criar('ol');
    const p1 = criar('li', null, 'Abre o terminal na pasta gestao-alunos.');
    const p2 = criar('li', null, 'Escreve ');
    p2.appendChild(criar('code', null, 'python3 src/servidor.py'));
    const p3 = criar('li', null, 'Abre ');
    p3.appendChild(criar('code', null, 'http://localhost:8000'));
    p3.appendChild(document.createTextNode(' no browser.'));
    [p1, p2, p3].forEach(function (li) { passos.appendChild(li); });
    folha.appendChild(passos);

    const botao = criar('button', 'btn', 'Tentar outra vez');
    botao.type = 'button';
    botao.addEventListener('click', function () { window.location.reload(); });
    const caixa = criar('div', 'accoes');
    caixa.appendChild(botao);
    folha.appendChild(caixa);
  }

  /* =====================================================================
     Avisos
     ===================================================================== */

  let temporizadorAviso;
  function avisar(mensagem, tipo) {
    const caixa = $('#aviso');
    if (!caixa) return;
    caixa.textContent = mensagem;
    caixa.dataset.tipo = tipo || 'ok';
    caixa.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () { caixa.hidden = true; }, 4500);
  }

  /* =====================================================================
     Formulários
     ===================================================================== */

  function lerFormulario(form) {
    const f = new FormData(form);
    return {
      nome: limpar(f.get('nome')),
      classe: parseInt(f.get('classe'), 10) || 0,
      turma: limpar(f.get('turma')).toUpperCase(),
      sala: limpar(f.get('sala')),
      encarregado: soDigitos(f.get('encarregado')),
      ocorrencia: limpar(f.get('ocorrencia'))
    };
  }

  // Verificação rápida no browser, para avisar logo. O servidor volta a verificar tudo.
  function validarAluno(d) {
    const erros = {};
    if (d.nome.length < 3) erros.nome = 'Escreve o nome completo do aluno, com pelo menos 3 letras.';
    if (!(d.classe >= 1 && d.classe <= 13)) erros.classe = 'Escolhe a classe do aluno.';
    if (!d.turma) erros.turma = 'Indica a turma, por exemplo A.';
    if (!d.sala) erros.sala = 'Indica a sala, por exemplo 12.';
    if (d.encarregado.length !== 9) erros.encarregado = 'O número do encarregado deve ter 9 dígitos, por exemplo 923 456 789.';
    if (d.ocorrencia.length > MAX_OCORRENCIA) erros.ocorrencia = 'Usa no máximo ' + MAX_OCORRENCIA + ' caracteres.';
    return erros;
  }

  function limparErro(campo) {
    const controlo = $('input, select, textarea', campo);
    const erro = $('.erro', campo);
    if (!controlo || !erro) return;
    erro.hidden = true;
    erro.textContent = '';
    controlo.removeAttribute('aria-invalid');
    if (controlo.dataset.descricao) controlo.setAttribute('aria-describedby', controlo.dataset.descricao);
    else controlo.removeAttribute('aria-describedby');
  }

  function aplicarErro(campo, mensagem) {
    const controlo = $('input, select, textarea', campo);
    const erro = $('.erro', campo);
    if (!controlo || !erro) return null;
    if (controlo.dataset.descricao === undefined) {
      controlo.dataset.descricao = controlo.getAttribute('aria-describedby') || '';
    }
    erro.textContent = mensagem;
    erro.id = controlo.id + '-erro';
    erro.hidden = false;
    controlo.setAttribute('aria-invalid', 'true');
    controlo.setAttribute('aria-describedby', (controlo.dataset.descricao + ' ' + erro.id).trim());
    return controlo;
  }

  // Mostra os erros de todos os campos e leva o cursor ao primeiro com erro
  function mostrarErros(form, erros) {
    let primeiro = null;
    $$('.campo[data-campo]', form).forEach(function (campo) {
      const mensagem = erros[campo.dataset.campo];
      if (mensagem) {
        const controlo = aplicarErro(campo, mensagem);
        if (controlo && !primeiro) primeiro = controlo;
      } else {
        limparErro(campo);
      }
    });
    if (primeiro) primeiro.focus();
  }

  function actualizarContador(areaTexto) {
    const contador = $('[data-contador-de="' + areaTexto.id + '"]') ||
      (areaTexto.id === 'fichaOcorrencia' ? $('#fichaContador') : null);
    if (!contador) return;
    const tamanho = areaTexto.value.length;
    contador.textContent = tamanho + '/' + MAX_OCORRENCIA;
    contador.classList.toggle('contador--limite', tamanho >= MAX_OCORRENCIA * 0.9);
  }

  // Comportamentos comuns a todos os formulários do aluno e do acesso
  function ligarFormulario(form) {
    form.addEventListener('input', function (ev) {
      const alvo = ev.target;
      const campo = alvo.closest('.campo[data-campo]');
      if (campo) {
        alvo.dataset.tocado = '1';
        limparErro(campo);
      }
      if (alvo.name === 'turma' && alvo.value !== alvo.value.toUpperCase()) {
        alvo.value = alvo.value.toUpperCase();
      }
      if (alvo.name === 'encarregado' && alvo.selectionStart === alvo.value.length) {
        const formatado = formatarEnquantoEscreve(alvo.value);
        if (formatado !== alvo.value) alvo.value = formatado;
      }
      if (alvo.tagName === 'TEXTAREA') actualizarContador(alvo);
    });

    form.addEventListener('change', function (ev) {
      const campo = ev.target.closest('.campo[data-campo]');
      if (campo) {
        ev.target.dataset.tocado = '1';
        limparErro(campo);
      }
    });

    // Ao sair de um campo que foi mexido, avisa logo se está mal (sem prender o cursor)
    form.addEventListener('focusout', function (ev) {
      const alvo = ev.target;
      const campo = alvo.closest && alvo.closest('.campo[data-campo]');
      if (!campo || !alvo.dataset.tocado || form.dataset.validacaoRapida !== '1') return;
      const erros = validarAluno(lerFormulario(form));
      const mensagem = erros[campo.dataset.campo];
      if (mensagem) aplicarErro(campo, mensagem);
    });
  }

  function actualizarContadores(raiz) {
    $$('textarea', raiz).forEach(actualizarContador);
  }

  function limparTocados(form) {
    $$('input, select, textarea', form).forEach(function (c) { delete c.dataset.tocado; });
  }

  function tratarErroDeFormulario(form, erro) {
    if (erro.estado === 401 && document.body.hasAttribute('data-protegida')) return;
    if (erro.campos && Object.keys(erro.campos).length) mostrarErros(form, erro.campos);
    else avisar(erro.message, 'erro');
  }

  // Desactiva o botão enquanto o servidor responde (evita clicar duas vezes)
  async function comBotaoOcupado(botao, textoOcupado, accao) {
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = textoOcupado;
    try {
      return await accao();
    } finally {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }

  function preencherClasses() {
    $$('select[data-classes]').forEach(function (select) {
      for (let n = 1; n <= 13; n++) {
        const opcao = criar('option', null, n + 'ª classe');
        opcao.value = String(n);
        select.appendChild(opcao);
      }
    });
  }

  function preencherListaTurmas(turmasExistentes) {
    const lista = $('#listaTurmas');
    if (!lista) return;
    const todas = new Set(TURMAS_COMUNS);
    (turmasExistentes || []).forEach(function (t) { todas.add(t); });
    lista.textContent = '';
    Array.from(todas).sort(function (x, y) {
      return x.localeCompare(y, 'pt', { numeric: true });
    }).forEach(function (t) {
      const opcao = document.createElement('option');
      opcao.value = t;
      lista.appendChild(opcao);
    });
  }

  function ligarMostrarCodigo() {
    $$('input[data-mostrar]').forEach(function (caixa) {
      caixa.addEventListener('change', function () {
        $$(caixa.dataset.mostrar).forEach(function (campo) {
          campo.type = caixa.checked ? 'text' : 'password';
        });
      });
    });
  }

  /* =====================================================================
     Diálogos
     ===================================================================== */

  // Pede para fechar (dá oportunidade a quem ouve "cancel" de impedir)
  function pedirFecho(dialogo) {
    const evento = new Event('cancel', { cancelable: true });
    dialogo.dispatchEvent(evento);
    if (!evento.defaultPrevented) dialogo.close();
  }

  function ligarDialogos() {
    $$('dialog').forEach(function (dialogo) {
      let premidoNoFundo = false;
      dialogo.addEventListener('mousedown', function (ev) { premidoNoFundo = ev.target === dialogo; });
      dialogo.addEventListener('click', function (ev) {
        if (ev.target === dialogo && premidoNoFundo) pedirFecho(dialogo);
      });
    });
    $$('[data-fechar]').forEach(function (botao) {
      botao.addEventListener('click', function () { pedirFecho(botao.closest('dialog')); });
    });
  }

  /* =====================================================================
     Cabeçalho e sessão
     ===================================================================== */

  function iniciarCabecalho(pagina, nome) {
    $('#menu').hidden = false;
    $('#sessao').hidden = false;
    $('#nomeCoordenador').textContent = 'Coordenador: ' + nome;
    $$('#menu a').forEach(function (a) {
      if (a.dataset.nav === pagina) a.setAttribute('aria-current', 'page');
    });
    const sair = $('#btnSair');
    if (sair.dataset.ligado) return;
    sair.dataset.ligado = '1';
    sair.addEventListener('click', async function () {
      try { await api('POST', '/api/sair'); } catch (e) { /* sai na mesma */ }
      window.location.href = 'index.html';
    });
  }

  /* =====================================================================
     Página inicial
     ===================================================================== */

  function iniciarIndex(estadoInicial) {
    const ecraCriar = $('#ecraCriar');
    const ecraEntrar = $('#ecraEntrar');
    const painel = $('#painel');
    const formCriar = $('#formCriar');
    const formEntrar = $('#formEntrar');

    function mostrar(estado) {
      ecraCriar.hidden = estado.coordenador_existe;
      ecraEntrar.hidden = !estado.coordenador_existe || estado.autenticado;
      painel.hidden = !estado.autenticado;
      if (estado.autenticado) {
        iniciarCabecalho('index', estado.nome);
        carregarPainel();
      } else {
        $('#menu').hidden = true;
        $('#sessao').hidden = true;
        const primeiro = $('input:not([type="checkbox"])', estado.coordenador_existe ? ecraEntrar : ecraCriar);
        if (primeiro) primeiro.focus();
      }
    }

    async function recarregarEstado() {
      mostrar(await api('GET', '/api/estado'));
    }

    async function carregarPainel() {
      try {
        desenharPainel(await api('GET', '/api/resumo'));
      } catch (erro) {
        if (erro.estado === 401) await recarregarEstado();
        else avisar(erro.message, 'erro');
      }
    }

    function desenharPainel(resumo) {
      $('#nTotal').textContent = String(resumo.total);
      $('#nOcorrencias').textContent = String(resumo.com_ocorrencia);
      $('#nTurmas').textContent = String(resumo.turmas);

      // alunos por classe
      const classes = $('#listaClasses');
      classes.textContent = '';
      const maior = resumo.por_classe.reduce(function (m, c) { return Math.max(m, c.total); }, 0);
      resumo.por_classe.forEach(function (c) {
        const li = criar('li');
        const ligacao = criar('a');
        ligacao.href = 'pesquisar.html?classe=' + c.classe;
        ligacao.setAttribute('aria-label', c.classe + 'ª classe: ' + c.total + (c.total === 1 ? ' aluno' : ' alunos') + '. Ver alunos.');
        ligacao.appendChild(criar('span', null, c.classe + 'ª classe'));
        const barra = criar('span', 'barra');
        barra.setAttribute('aria-hidden', 'true');
        const enchimento = criar('span');
        enchimento.style.setProperty('--largura', (maior ? (c.total / maior) * 100 : 0) + '%');
        barra.appendChild(enchimento);
        ligacao.appendChild(barra);
        ligacao.appendChild(criar('span', 'total', String(c.total)));
        li.appendChild(ligacao);
        classes.appendChild(li);
      });
      $('#semAlunos').hidden = resumo.total > 0;

      // alunos com ocorrência (os últimos registados)
      const lista = $('#listaOcorrencias');
      lista.textContent = '';
      resumo.ocorrencias_recentes.forEach(function (a) {
        const li = criar('li');
        const ligacao = criar('a');
        ligacao.href = 'pesquisar.html?ficha=' + a.id;
        ligacao.appendChild(criar('strong', null, a.nome));
        ligacao.appendChild(criar('span', 'meta', a.classe + 'ª classe, turma ' + a.turma));
        const p = criar('p');
        p.appendChild(criar('span', 'ocorrencia', a.ocorrencia.length > 110 ? a.ocorrencia.slice(0, 107).trimEnd() + '...' : a.ocorrencia));
        ligacao.appendChild(p);
        li.appendChild(ligacao);
        lista.appendChild(li);
      });
      $('#semOcorrencias').hidden = resumo.com_ocorrencia > 0;
      $('#linkTodas').hidden = resumo.com_ocorrencia === 0;
    }

    ligarFormulario(formCriar);
    ligarFormulario(formEntrar);

    formCriar.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const f = new FormData(formCriar);
      const nome = limpar(f.get('nome'));
      const codigo = String(f.get('codigo') || '');
      const repetir = String(f.get('repetir') || '');
      const erros = {};
      if (nome.length < 3) erros.nome = 'Escreve o teu nome, com pelo menos 3 letras.';
      if (codigo.length < 6) erros.codigo = 'O código deve ter pelo menos 6 caracteres.';
      if (!erros.codigo && repetir !== codigo) erros.repetir = 'Os dois códigos não são iguais.';
      mostrarErros(formCriar, erros);
      if (Object.keys(erros).length) return;

      try {
        await comBotaoOcupado($('#btnCriar'), 'A criar...', function () {
          return api('POST', '/api/criar-acesso', { nome: nome, codigo: codigo });
        });
        formCriar.reset();
        await recarregarEstado();
      } catch (erro) {
        if (erro.estado === 409) await recarregarEstado();
        else tratarErroDeFormulario(formCriar, erro);
      }
    });

    formEntrar.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const codigo = String(new FormData(formEntrar).get('codigo') || '');
      if (!codigo) {
        mostrarErros(formEntrar, { codigo: 'Escreve o teu código de acesso.' });
        return;
      }
      try {
        await comBotaoOcupado($('#btnEntrar'), 'A entrar...', function () {
          return api('POST', '/api/entrar', { codigo: codigo });
        });
        formEntrar.reset();
        await recarregarEstado();
      } catch (erro) {
        if (erro.estado === 429) {
          mostrarErros(formEntrar, { codigo: erro.message });
        } else {
          tratarErroDeFormulario(formEntrar, erro);
          $('#l-codigo').select();
        }
      }
    });

    if (new URLSearchParams(window.location.search).get('expirou') === '1') {
      $('#avisoSessao').hidden = false;
    }
    mostrar(estadoInicial);
  }

  /* =====================================================================
     Registar aluno
     ===================================================================== */

  function iniciarRegistar() {
    const form = $('#formRegistar');
    const botao = $('#btnRegistar');
    const sucesso = $('#sucesso');
    form.dataset.validacaoRapida = '1';
    ligarFormulario(form);

    // Turmas que já existem, para sugerir no campo da turma
    api('GET', '/api/alunos?por_pagina=5').then(function (r) {
      preencherListaTurmas(r.turmas);
    }).catch(function () { preencherListaTurmas([]); });

    // Quantos alunos a turma já tem, e qual a sala que costumam usar
    const infoTurma = $('#infoTurma');
    const actualizarInfoTurma = atrasar(async function () {
      const classe = parseInt(form.elements.classe.value, 10);
      const turma = limpar(form.elements.turma.value).toUpperCase();
      infoTurma.textContent = '';
      if (!(classe >= 1) || !turma) return;
      try {
        const info = await api('GET', '/api/turma?classe=' + classe + '&turma=' + encodeURIComponent(turma));
        const aindaIgual = parseInt(form.elements.classe.value, 10) === classe &&
          limpar(form.elements.turma.value).toUpperCase() === turma;
        if (!aindaIgual) return;
        infoTurma.textContent = info.total === 0
          ? 'Ainda não há alunos na ' + classe + 'ª classe, turma ' + turma + '.'
          : classe + 'ª classe, turma ' + turma + ': ' + info.total + (info.total === 1 ? ' aluno registado.' : ' alunos registados.');
        if (info.sala_habitual && !form.elements.sala.value) {
          const usar = criar('button', 'btn-texto', 'Usar a sala ' + info.sala_habitual);
          usar.type = 'button';
          usar.addEventListener('click', function () {
            form.elements.sala.value = info.sala_habitual;
            limparErro(form.elements.sala.closest('.campo'));
            infoTurma.textContent = '';
            form.elements.encarregado.focus();
          });
          infoTurma.appendChild(usar);
        }
      } catch (erro) {
        infoTurma.textContent = '';
      }
    }, 250);
    form.elements.classe.addEventListener('change', actualizarInfoTurma);
    form.elements.turma.addEventListener('input', actualizarInfoTurma);
    form.elements.sala.addEventListener('input', function () {
      if (form.elements.sala.value) $$('.btn-texto', infoTurma).forEach(function (b) { b.remove(); });
    });

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      sucesso.hidden = true;
      const dados = lerFormulario(form);
      const erros = validarAluno(dados);
      mostrarErros(form, erros);
      if (Object.keys(erros).length) return;

      try {
        const aluno = await comBotaoOcupado(botao, 'A guardar...', function () {
          return api('POST', '/api/alunos', dados);
        });

        $('#sucessoTexto').textContent = aluno.nome + ' foi registado na ' + aluno.classe + 'ª classe, turma ' + aluno.turma + '.';
        $('#sucessoFicha').href = 'pesquisar.html?ficha=' + aluno.id;
        sucesso.hidden = false;

        // Quem regista uma turma inteira só quer mudar o nome, o número e a ocorrência
        if ($('#manter').checked) {
          form.elements.nome.value = '';
          form.elements.encarregado.value = '';
          form.elements.ocorrencia.value = '';
        } else {
          form.reset();
          $('#manter').checked = true;
        }
        limparTocados(form);
        actualizarContadores(form);
        form.elements.nome.focus();
        actualizarInfoTurma();
        api('GET', '/api/alunos?por_pagina=5').then(function (r) { preencherListaTurmas(r.turmas); }).catch(function () {});
      } catch (erro) {
        tratarErroDeFormulario(form, erro);
      }
    });
  }

  /* =====================================================================
     Pesquisar alunos
     ===================================================================== */

  function iniciarPesquisar() {
    const campoQ = $('#q');
    const filtroClasse = $('#fClasse');
    const filtroTurma = $('#fTurma');
    const soOcorrencia = $('#soOcorrencia');
    const ordenarPor = $('#ordenarPor');
    const porPagina = $('#porPagina');
    const corpo = $('#corpo');
    const envolve = $('#tabelaEnvolve');
    const formEditar = $('#formEditar');
    const dlgFicha = $('#dlgFicha');
    const dlgEditar = $('#dlgEditar');
    const dlgApagar = $('#dlgApagar');
    const ORDENS = ['id', 'nome', 'classe', 'turma', 'sala'];

    // O que se está a pesquisar. Fica escrito no endereço da página.
    const estado = { q: '', classe: '', turma: '', ocorrencia: false, ordem: 'nome', dir: 'asc', pagina: 1, porPagina: 10 };
    let resposta = null;       // última resposta do servidor
    let controlador = null;    // para cancelar o pedido anterior
    let numeroDoPedido = 0;
    let alunoDaFicha = null;
    let idParaApagar = null;
    let edicaoVeioDaFicha = false;

    formEditar.dataset.validacaoRapida = '1';
    ligarFormulario(formEditar);

    /* --- estado <-> endereço --- */

    function lerEndereco() {
      const p = new URLSearchParams(window.location.search);
      estado.q = p.get('q') || '';
      estado.classe = /^\d{1,2}$/.test(p.get('classe') || '') ? p.get('classe') : '';
      estado.turma = p.get('turma') || '';
      estado.ocorrencia = p.get('ocorrencia') === '1';
      estado.ordem = ORDENS.indexOf(p.get('ordem')) >= 0 ? p.get('ordem') : 'nome';
      estado.dir = p.get('dir') === 'desc' ? 'desc' : 'asc';
      estado.pagina = Math.max(1, parseInt(p.get('pagina'), 10) || 1);
      const por = parseInt(p.get('por_pagina'), 10);
      estado.porPagina = [10, 20, 50].indexOf(por) >= 0 ? por : 10;
    }

    function parametros(paraEndereco) {
      const p = new URLSearchParams();
      if (estado.q) p.set('q', estado.q);
      if (estado.classe) p.set('classe', estado.classe);
      if (estado.turma) p.set('turma', estado.turma);
      if (estado.ocorrencia) p.set('ocorrencia', '1');
      if (!paraEndereco || estado.ordem !== 'nome') p.set('ordem', estado.ordem);
      if (!paraEndereco || estado.dir !== 'asc') p.set('dir', estado.dir);
      if (!paraEndereco || estado.pagina !== 1) p.set('pagina', String(estado.pagina));
      if (!paraEndereco || estado.porPagina !== 10) p.set('por_pagina', String(estado.porPagina));
      return p.toString();
    }

    function escreverEndereco() {
      const texto = parametros(true);
      window.history.replaceState(null, '', window.location.pathname + (texto ? '?' + texto : ''));
    }

    function mostrarEstadoNosControlos() {
      campoQ.value = estado.q;
      filtroClasse.value = estado.classe;
      soOcorrencia.checked = estado.ocorrencia;
      porPagina.value = String(estado.porPagina);
      ordenarPor.value = estado.ordem + ':' + estado.dir;
    }

    /* --- pedir ao servidor --- */

    async function carregar() {
      if (controlador) controlador.abort();
      controlador = new AbortController();
      const numero = ++numeroDoPedido;
      const qDoPedido = estado.q;
      envolve.classList.add('a-carregar');
      try {
        const r = await api('GET', '/api/alunos?' + parametros(false), undefined, controlador.signal);
        if (numero !== numeroDoPedido) return;
        r.termos = normalizar(qDoPedido).split(/\s+/).filter(Boolean);
        resposta = r;
        estado.pagina = r.pagina;
        desenhar();
      } catch (erro) {
        if (erro.name === 'AbortError' || numero !== numeroDoPedido) return;
        if (erro.estado !== 401) avisar(erro.message, 'erro');
      } finally {
        if (numero === numeroDoPedido) envolve.classList.remove('a-carregar');
      }
    }

    const carregarComAtraso = atrasar(carregar, 220);

    /* --- desenhar --- */

    function actualizarFiltroTurma(turmas) {
      const lista = turmas.slice();
      if (estado.turma && lista.indexOf(estado.turma) < 0) lista.push(estado.turma);
      while (filtroTurma.options.length > 1) filtroTurma.remove(1);
      lista.forEach(function (t) {
        const opcao = criar('option', null, 'Turma ' + t);
        opcao.value = t;
        filtroTurma.appendChild(opcao);
      });
      filtroTurma.value = estado.turma;
    }

    function criarLinha(aluno, termos) {
      const tr = document.createElement('tr');
      tr.dataset.id = String(aluno.id);

      function celula(rotulo, conteudo, classe) {
        const td = criar('td', classe);
        td.dataset.label = rotulo;
        if (typeof conteudo === 'string') td.textContent = conteudo;
        else td.appendChild(conteudo);
        return td;
      }

      tr.appendChild(celula('Nº', String(aluno.id).padStart(3, '0'), 'col-num'));

      const nome = criar('div', 'nome-celula');
      nome.appendChild(criarAvatar(aluno));
      const botaoNome = criar('button', 'ligacao-nome');
      botaoNome.type = 'button';
      botaoNome.dataset.accao = 'ficha';
      botaoNome.setAttribute('aria-label', 'Abrir ficha de ' + aluno.nome);
      botaoNome.appendChild(realcar(aluno.nome, termos));
      nome.appendChild(botaoNome);
      tr.appendChild(celula('Nome', nome));

      tr.appendChild(celula('Classe', aluno.classe + 'ª'));
      tr.appendChild(celula('Turma', aluno.turma));
      const sala = criar('span');
      sala.appendChild(realcar(aluno.sala, termos));
      tr.appendChild(celula('Sala', sala));
      const enc = criar('span');
      enc.appendChild(realcar(formatarTelefone(aluno.encarregado), termos));
      tr.appendChild(celula('Encarregado', enc));

      let ocorrencia;
      if (aluno.ocorrencia) {
        ocorrencia = criar('span', 'ocorrencia');
        ocorrencia.appendChild(realcar(aluno.ocorrencia, termos));
      } else {
        ocorrencia = criar('span', 'sem-ocorrencia', 'Sem ocorrência');
      }
      tr.appendChild(celula('Ocorrência', ocorrencia, 'col-ocorrencia'));

      const accoes = criar('div');
      const editar = criar('button', 'btn btn--secundario btn--pequeno', 'Editar');
      editar.type = 'button';
      editar.dataset.accao = 'editar';
      editar.setAttribute('aria-label', 'Editar ' + aluno.nome);
      const apagar = criar('button', 'btn btn--secundario btn--pequeno', 'Apagar');
      apagar.type = 'button';
      apagar.dataset.accao = 'apagar';
      apagar.setAttribute('aria-label', 'Apagar ' + aluno.nome);
      accoes.appendChild(editar);
      accoes.appendChild(apagar);
      tr.appendChild(celula('Acções', accoes, 'col-accoes'));
      return tr;
    }

    function desenharChips() {
      const lista = $('#chips');
      lista.textContent = '';
      const chips = [];
      if (estado.q) chips.push({ texto: 'Pesquisa: ' + estado.q, remover: function () { estado.q = ''; campoQ.value = ''; } });
      if (estado.classe) chips.push({ texto: 'Classe: ' + estado.classe + 'ª', remover: function () { estado.classe = ''; estado.turma = ''; filtroClasse.value = ''; } });
      if (estado.turma) chips.push({ texto: 'Turma: ' + estado.turma, remover: function () { estado.turma = ''; } });
      if (estado.ocorrencia) chips.push({ texto: 'Só com ocorrência', remover: function () { estado.ocorrencia = false; soOcorrencia.checked = false; } });

      chips.forEach(function (chip) {
        const li = criar('li');
        const botao = criar('button', 'chip');
        botao.type = 'button';
        botao.setAttribute('aria-label', 'Remover filtro: ' + chip.texto);
        botao.appendChild(document.createTextNode(chip.texto));
        const x = criar('span', 'x', '×');
        x.setAttribute('aria-hidden', 'true');
        botao.appendChild(x);
        botao.addEventListener('click', function () {
          chip.remover();
          estado.pagina = 1;
          carregar();
          campoQ.focus();
        });
        li.appendChild(botao);
        lista.appendChild(li);
      });
      if (chips.length > 1) {
        const li = criar('li');
        const limparTudo = criar('button', 'btn-texto', 'Limpar tudo');
        limparTudo.type = 'button';
        limparTudo.addEventListener('click', limparFiltros);
        li.appendChild(limparTudo);
        lista.appendChild(li);
      }
    }

    function desenhar() {
      const r = resposta;
      actualizarFiltroTurma(r.turmas);
      preencherListaTurmas(r.turmas);

      corpo.textContent = '';
      r.alunos.forEach(function (a) { corpo.appendChild(criarLinha(a, r.termos)); });
      envolve.hidden = r.alunos.length === 0;

      // contagem
      $('#contagem').textContent = !r.existem_alunos ? ''
        : r.total === 0 ? 'Nenhum aluno encontrado'
        : r.total === 1 ? '1 aluno encontrado'
        : r.total + ' alunos encontrados';
      desenharChips();

      // quando não há nada para mostrar
      const vazio = $('#vazio');
      vazio.hidden = r.alunos.length > 0;
      if (r.alunos.length === 0) {
        const semAlunos = !r.existem_alunos;
        $('#vazioTitulo').textContent = semAlunos ? 'Ainda não há alunos registados' : 'Nenhum aluno encontrado';
        $('#vazioTexto').textContent = semAlunos
          ? 'Regista o primeiro aluno para poderes pesquisar.'
          : 'Confirma a escrita do nome ou limpa a pesquisa e os filtros.';
        $('#vazioLink').hidden = !semAlunos;
        $('#vazioLimpar').hidden = semAlunos;
      }

      // ordenação (cabeçalhos da tabela e lista para ecrãs pequenos)
      $$('th .ordenar').forEach(function (botao) {
        const th = botao.closest('th');
        if (botao.dataset.ordem === estado.ordem) th.setAttribute('aria-sort', estado.dir === 'asc' ? 'ascending' : 'descending');
        else th.setAttribute('aria-sort', 'none');
      });
      ordenarPor.value = estado.ordem + ':' + estado.dir;

      // páginas
      const paginacao = $('#paginacao');
      paginacao.hidden = r.total <= 10;
      $('#infoPagina').textContent = 'Página ' + r.pagina + ' de ' + r.paginas;
      $('#btnAnterior').disabled = r.pagina <= 1;
      $('#btnSeguinte').disabled = r.pagina >= r.paginas;

      escreverEndereco();
    }

    function limparFiltros() {
      estado.q = '';
      estado.classe = '';
      estado.turma = '';
      estado.ocorrencia = false;
      estado.pagina = 1;
      mostrarEstadoNosControlos();
      carregar();
      campoQ.focus();
    }

    /* --- controlos da pesquisa --- */

    campoQ.addEventListener('input', function () {
      estado.q = limpar(campoQ.value);
      estado.pagina = 1;
      carregarComAtraso();
    });
    filtroClasse.addEventListener('change', function () {
      estado.classe = filtroClasse.value;
      estado.turma = '';
      estado.pagina = 1;
      carregar();
    });
    filtroTurma.addEventListener('change', function () {
      estado.turma = filtroTurma.value;
      estado.pagina = 1;
      carregar();
    });
    soOcorrencia.addEventListener('change', function () {
      estado.ocorrencia = soOcorrencia.checked;
      estado.pagina = 1;
      carregar();
    });
    ordenarPor.addEventListener('change', function () {
      const partes = ordenarPor.value.split(':');
      estado.ordem = partes[0];
      estado.dir = partes[1];
      estado.pagina = 1;
      carregar();
    });
    porPagina.addEventListener('change', function () {
      estado.porPagina = parseInt(porPagina.value, 10);
      estado.pagina = 1;
      carregar();
    });
    $('#formPesquisa').addEventListener('submit', function (ev) { ev.preventDefault(); });
    $('#vazioLimpar').addEventListener('click', limparFiltros);

    $$('th .ordenar').forEach(function (botao) {
      botao.addEventListener('click', function () {
        const coluna = botao.dataset.ordem;
        if (estado.ordem === coluna) {
          estado.dir = estado.dir === 'asc' ? 'desc' : 'asc';
        } else {
          estado.ordem = coluna;
          estado.dir = 'asc';
        }
        estado.pagina = 1;
        carregar();
      });
    });

    $('#btnAnterior').addEventListener('click', function () {
      estado.pagina = Math.max(1, estado.pagina - 1);
      carregar();
    });
    $('#btnSeguinte').addEventListener('click', function () {
      estado.pagina += 1;
      carregar();
    });

    // "/" leva o cursor à pesquisa
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if ($('dialog[open]')) return;
      const alvo = ev.target;
      if (alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable)) return;
      ev.preventDefault();
      campoQ.focus();
      campoQ.select();
    });

    /* --- ficha do aluno --- */

    function textoDaOcorrencia() {
      return limpar($('#fichaOcorrencia').value);
    }

    function ocorrenciaPorGuardar() {
      return !!alunoDaFicha && dlgFicha.open && textoDaOcorrencia() !== alunoDaFicha.ocorrencia;
    }

    function preencherFicha(aluno) {
      alunoDaFicha = aluno;
      const avatar = $('#fichaAvatar');
      avatar.className = 'avatar avatar--grande avatar--' + (aluno.id % 6);
      avatar.textContent = iniciais(aluno.nome);
      $('#fichaNome').textContent = aluno.nome;
      $('#fichaTurma').textContent = aluno.classe + 'ª classe, turma ' + aluno.turma;
      $('#fichaNumero').textContent = String(aluno.id).padStart(3, '0');
      $('#fichaSala').textContent = aluno.sala;
      $('#fichaTelefone').textContent = formatarTelefone(aluno.encarregado);
      $('#fichaLigar').href = 'tel:+244' + aluno.encarregado;
      $('#fichaLigar').setAttribute('aria-label', 'Ligar a ' + formatarTelefone(aluno.encarregado));
      $('#fichaOcorrencia').value = aluno.ocorrencia;
      actualizarContador($('#fichaOcorrencia'));
      $('#fichaEstado').textContent = aluno.ocorrencia ? '' : 'Este aluno não tem ocorrência registada.';
      $('#fichaErro').hidden = true;
      $('#btnGuardarOcorrencia').disabled = true;
    }

    function abrirFicha(aluno) {
      preencherFicha(aluno);
      if (!dlgFicha.open) dlgFicha.showModal();
    }

    $('#fichaOcorrencia').addEventListener('input', function () {
      actualizarContador(this);
      const mudou = textoDaOcorrencia() !== alunoDaFicha.ocorrencia;
      $('#btnGuardarOcorrencia').disabled = !mudou;
      $('#fichaEstado').textContent = mudou ? 'Alteração por guardar.' : '';
      $('#fichaErro').hidden = true;
    });

    // Se há texto por guardar, pergunta antes de fechar a ficha
    dlgFicha.addEventListener('cancel', function (ev) {
      if (ocorrenciaPorGuardar() &&
          !window.confirm('A ocorrência tem alterações que não foram guardadas. Fechar mesmo assim?')) {
        ev.preventDefault();
      }
    });

    $('#btnGuardarOcorrencia').addEventListener('click', async function () {
      const a = alunoDaFicha;
      try {
        const novo = await comBotaoOcupado(this, 'A guardar...', function () {
          return api('PUT', '/api/alunos/' + a.id, {
            nome: a.nome, classe: a.classe, turma: a.turma, sala: a.sala,
            encarregado: a.encarregado, ocorrencia: textoDaOcorrencia()
          });
        });
        preencherFicha(novo);
        $('#fichaEstado').textContent = novo.ocorrencia ? 'Ocorrência guardada.' : 'Ocorrência apagada.';
        carregar();
      } catch (erro) {
        const mensagem = (erro.campos && erro.campos.ocorrencia) || erro.message;
        $('#fichaErro').textContent = mensagem;
        $('#fichaErro').hidden = false;
        $('#btnGuardarOcorrencia').disabled = false;
      }
    });

    $('#fichaCopiar').addEventListener('click', async function () {
      const numero = formatarTelefone(alunoDaFicha.encarregado);
      const copiou = await copiarTexto(numero);
      avisar(copiou ? 'Número copiado: ' + numero : 'Não foi possível copiar. O número é ' + numero, copiou ? 'ok' : 'erro');
    });

    $('#fichaEditar').addEventListener('click', function () {
      pedirFecho(dlgFicha);
      if (dlgFicha.open) return;      // ficou aberta porque há texto por guardar
      abrirEdicao(alunoDaFicha, true);
    });

    $('#fichaApagar').addEventListener('click', function () {
      pedirFecho(dlgFicha);
      if (dlgFicha.open) return;
      abrirApagar(alunoDaFicha);
    });

    /* --- editar --- */

    function abrirEdicao(aluno, veioDaFicha) {
      edicaoVeioDaFicha = veioDaFicha;
      const campos = formEditar.elements;
      campos.alunoId.value = String(aluno.id);
      campos.nome.value = aluno.nome;
      campos.classe.value = String(aluno.classe);
      campos.turma.value = aluno.turma;
      campos.sala.value = aluno.sala;
      campos.encarregado.value = formatarTelefone(aluno.encarregado);
      campos.ocorrencia.value = aluno.ocorrencia;
      limparTocados(formEditar);
      mostrarErros(formEditar, {});
      actualizarContadores(formEditar);
      dlgEditar.showModal();
    }

    // quando a edição é cancelada, volta à ficha
    dlgEditar.addEventListener('close', function () {
      if (edicaoVeioDaFicha && alunoDaFicha && !dlgFicha.open) {
        edicaoVeioDaFicha = false;
        abrirFicha(alunoDaFicha);
      }
    });

    formEditar.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const dados = lerFormulario(formEditar);
      const erros = validarAluno(dados);
      mostrarErros(formEditar, erros);
      if (Object.keys(erros).length) return;

      const id = parseInt(formEditar.elements.alunoId.value, 10);
      try {
        const novo = await comBotaoOcupado($('#btnGuardarEdicao'), 'A guardar...', function () {
          return api('PUT', '/api/alunos/' + id, dados);
        });
        // Se a edição veio da ficha, o evento "close" reabre a ficha com estes dados novos
        if (edicaoVeioDaFicha) alunoDaFicha = novo;
        dlgEditar.close();
        await carregar();
        avisar('Alterações guardadas: ' + novo.nome);
      } catch (erro) {
        tratarErroDeFormulario(formEditar, erro);
      }
    });

    /* --- apagar --- */

    function abrirApagar(aluno) {
      idParaApagar = aluno.id;
      $('#nomeApagar').textContent = aluno.nome;
      dlgApagar.showModal();
    }

    $('#btnConfirmarApagar').addEventListener('click', async function () {
      const id = idParaApagar;
      const nome = $('#nomeApagar').textContent;
      try {
        await comBotaoOcupado(this, 'A apagar...', function () {
          return api('DELETE', '/api/alunos/' + id);
        });
        dlgApagar.close();
        idParaApagar = null;
        if (alunoDaFicha && alunoDaFicha.id === id) alunoDaFicha = null;
        await carregar();
        avisar('Aluno apagado: ' + nome);
      } catch (erro) {
        dlgApagar.close();
        avisar(erro.message, 'erro');
        carregar();
      }
    });

    /* --- cliques na tabela --- */

    corpo.addEventListener('click', function (ev) {
      const linha = ev.target.closest('tr');
      if (!linha || !resposta) return;
      const aluno = resposta.alunos.find(function (a) { return a.id === parseInt(linha.dataset.id, 10); });
      if (!aluno) return;
      const botao = ev.target.closest('button[data-accao]');
      const accao = botao ? botao.dataset.accao : 'ficha';
      if (accao === 'editar') abrirEdicao(aluno, false);
      else if (accao === 'apagar') abrirApagar(aluno);
      else abrirFicha(aluno);
    });

    /* --- arranque da página --- */

    lerEndereco();
    const abrirFichaDe = new URLSearchParams(window.location.search).get('ficha');
    mostrarEstadoNosControlos();

    carregar().then(async function () {
      if (!abrirFichaDe || !/^\d{1,9}$/.test(abrirFichaDe)) return;
      try {
        abrirFicha(await api('GET', '/api/alunos/' + abrirFichaDe));
      } catch (erro) {
        if (erro.estado === 404) avisar('Esse aluno já não existe.', 'erro');
      }
    });
  }

  /* =====================================================================
     Arranque
     ===================================================================== */

  async function iniciar() {
    const pagina = document.body.dataset.pagina;

    if (window.location.protocol === 'file:') {
      mostrarErroServidor(true);
      return;
    }

    let estado;
    try {
      estado = await api('GET', '/api/estado');
    } catch (erro) {
      mostrarErroServidor(false);
      return;
    }

    if (document.body.hasAttribute('data-protegida') && !estado.autenticado) {
      window.location.replace('index.html');
      return;
    }
    document.body.classList.add('sessao-validada');

    preencherClasses();
    ligarDialogos();
    ligarMostrarCodigo();

    if (pagina === 'index') {
      iniciarIndex(estado);
      return;
    }
    iniciarCabecalho(pagina, estado.nome);
    if (pagina === 'registrar') iniciarRegistar();
    if (pagina === 'pesquisar') iniciarPesquisar();
  }

  iniciar();
})();
