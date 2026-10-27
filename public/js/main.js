/* Gestão de alunos — frontend
   - Os alunos ficam no localStorage do browser.
   - O ficheiro alunos.txt serve de cópia: descarrega-se e carrega-se na página inicial.
   - Formato de cada linha: numero;nome;sala;classe;turma;encarregado;ocorrencia
*/
(function () {
  'use strict';

  const CHAVE_ALUNOS = 'gestao_alunos_v1';
  const CHAVE_COORDENADOR = 'gestao_coordenador_v1';
  const CHAVE_SESSAO = 'gestao_sessao_v1';
  const MAX_OCORRENCIA = 500;

  /* ---------- Utilitários ---------- */

  const $ = (seletor, raiz) => (raiz || document).querySelector(seletor);
  const $$ = (seletor, raiz) => Array.from((raiz || document).querySelectorAll(seletor));

  function criar(etiqueta, classe, texto) {
    const e = document.createElement(etiqueta);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function lerJSON(armazem, chave, padrao) {
    try {
      const bruto = armazem.getItem(chave);
      return bruto ? JSON.parse(bruto) : padrao;
    } catch (e) {
      return padrao;
    }
  }

  function gravarJSON(armazem, chave, valor) {
    try {
      armazem.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Tira quebras de linha e ";" para não estragar o formato do alunos.txt
  function limpar(texto) {
    return String(texto == null ? '' : texto)
      .replace(/[\r\n]+/g, ' ')
      .replace(/;/g, ',')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Minúsculas e sem acentos, para pesquisar "joao" e encontrar "João"
  function normalizar(texto) {
    return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function soDigitos(texto) {
    let d = String(texto).replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('244') === 0) d = d.slice(3);
    return d;
  }

  function formatarTelefone(d) {
    return d.length === 9 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d;
  }

  // Resumo simples (cyrb53) para não guardar o código em texto claro.
  // Não é segurança a sério: tudo continua no browser.
  function resumo(texto) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  let temporizadorAviso;
  function avisar(mensagem, tipo) {
    const caixa = $('#aviso');
    if (!caixa) return;
    caixa.textContent = mensagem;
    caixa.dataset.tipo = tipo || 'ok';
    caixa.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () {
      caixa.hidden = true;
    }, 4500);
  }

  /* ---------- Dados dos alunos ---------- */

  function lerAlunos() {
    const lista = lerJSON(localStorage, CHAVE_ALUNOS, []);
    return Array.isArray(lista) ? lista : [];
  }

  function gravarAlunos(lista) {
    return gravarJSON(localStorage, CHAVE_ALUNOS, lista);
  }

  function proximoId(alunos) {
    return alunos.reduce(function (maior, a) { return Math.max(maior, a.id); }, 0) + 1;
  }

  function turmasDosAlunos(alunos) {
    const conjunto = new Set();
    alunos.forEach(function (a) { if (a.turma) conjunto.add(a.turma); });
    return Array.from(conjunto).sort(function (x, y) {
      return x.localeCompare(y, 'pt', { numeric: true });
    });
  }

  /* ---------- Validação (usada no registo, na edição e na importação) ---------- */

  function lerFormulario(form) {
    const f = new FormData(form);
    return {
      nome: limpar(f.get('nome')),
      classe: String(f.get('classe') || ''),
      turma: limpar(f.get('turma')).toUpperCase(),
      sala: limpar(f.get('sala')),
      encarregado: soDigitos(limpar(f.get('encarregado'))),
      ocorrencia: limpar(f.get('ocorrencia'))
    };
  }

  function validar(dados, alunos, idAtual) {
    const erros = {};
    const classe = parseInt(dados.classe, 10);

    if (dados.nome.length < 3) {
      erros.nome = 'Escreve o nome completo do aluno, com pelo menos 3 letras.';
    }
    if (!(classe >= 1 && classe <= 13)) {
      erros.classe = 'Escolhe a classe do aluno.';
    }
    if (!dados.turma) {
      erros.turma = 'Indica a turma, por exemplo A.';
    }
    if (!dados.sala) {
      erros.sala = 'Indica a sala, por exemplo 12.';
    }
    if (dados.encarregado.length !== 9) {
      erros.encarregado = 'O número do encarregado deve ter 9 dígitos, por exemplo 923 456 789.';
    }
    if (dados.ocorrencia.length > MAX_OCORRENCIA) {
      erros.ocorrencia = 'Usa no máximo ' + MAX_OCORRENCIA + ' caracteres.';
    }

    if (!erros.nome && !erros.classe && !erros.turma) {
      const nomeNormalizado = normalizar(dados.nome);
      const repetido = alunos.some(function (a) {
        return a.id !== idAtual &&
          normalizar(a.nome) === nomeNormalizado &&
          a.classe === dados.classe &&
          a.turma === dados.turma;
      });
      if (repetido) {
        erros.nome = 'Já existe um aluno com este nome na mesma classe e turma.';
      }
    }
    return erros;
  }

  function limparErro(campo) {
    const controlo = $('input, select, textarea', campo);
    const erro = $('.erro', campo);
    if (!controlo || !erro) return;
    erro.hidden = true;
    erro.textContent = '';
    controlo.removeAttribute('aria-invalid');
    if (controlo.dataset.descricao) {
      controlo.setAttribute('aria-describedby', controlo.dataset.descricao);
    } else {
      controlo.removeAttribute('aria-describedby');
    }
  }

  function mostrarErros(form, erros) {
    let primeiro = null;
    $$('.campo[data-campo]', form).forEach(function (campo) {
      const mensagem = erros[campo.dataset.campo];
      const controlo = $('input, select, textarea', campo);
      const erro = $('.erro', campo);
      if (!controlo || !erro) return;
      if (controlo.dataset.descricao === undefined) {
        controlo.dataset.descricao = controlo.getAttribute('aria-describedby') || '';
      }
      if (mensagem) {
        erro.textContent = mensagem;
        erro.id = controlo.id + '-erro';
        erro.hidden = false;
        controlo.setAttribute('aria-invalid', 'true');
        controlo.setAttribute('aria-describedby', (controlo.dataset.descricao + ' ' + erro.id).trim());
        if (!primeiro) primeiro = controlo;
      } else {
        limparErro(campo);
      }
    });
    if (primeiro) primeiro.focus();
  }

  function ligarLimpezaDeErros(form) {
    const aoAlterar = function (ev) {
      const campo = ev.target.closest('.campo[data-campo]');
      if (campo) limparErro(campo);
    };
    form.addEventListener('input', aoAlterar);
    form.addEventListener('change', aoAlterar);
  }

  /* ---------- Sessão do coordenador ---------- */

  function coordenador() {
    return lerJSON(localStorage, CHAVE_COORDENADOR, null);
  }

  function sessaoActiva() {
    const c = coordenador();
    const s = lerJSON(sessionStorage, CHAVE_SESSAO, null);
    return !!(c && s && s.nome === c.nome);
  }

  function iniciarSessao(nome) {
    gravarJSON(sessionStorage, CHAVE_SESSAO, { nome: nome });
  }

  function terminarSessao() {
    try { sessionStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* sem acção */ }
  }

  function actualizarCabecalho(pagina) {
    const dentro = sessaoActiva();
    $('#menu').hidden = !dentro;
    $('#sessao').hidden = !dentro;
    if (dentro) {
      $('#nomeCoordenador').textContent = 'Coordenador: ' + coordenador().nome;
    }
    $$('#menu a').forEach(function (a) {
      if (a.dataset.nav === pagina) a.setAttribute('aria-current', 'page');
    });
  }

  /* ---------- Partes comuns das páginas ---------- */

  function preencherClasses() {
    $$('select[data-classes]').forEach(function (select) {
      for (let n = 1; n <= 13; n++) {
        const opcao = criar('option', null, n + 'ª classe');
        opcao.value = String(n);
        select.appendChild(opcao);
      }
    });
  }

  function actualizarListaTurmas() {
    const lista = $('#listaTurmas');
    if (!lista) return;
    const turmas = new Set(['A', 'B', 'C', 'D', 'E', 'F']);
    turmasDosAlunos(lerAlunos()).forEach(function (t) { turmas.add(t); });
    lista.textContent = '';
    Array.from(turmas).sort(function (x, y) {
      return x.localeCompare(y, 'pt', { numeric: true });
    }).forEach(function (t) {
      const opcao = document.createElement('option');
      opcao.value = t;
      lista.appendChild(opcao);
    });
  }

  function ligarBotoesFechar() {
    $$('[data-fechar]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        botao.closest('dialog').close();
      });
    });
  }

  /* ---------- Página inicial ---------- */

  function resumoOcorrencia(texto) {
    return texto.length > 110 ? texto.slice(0, 107).trimEnd() + '...' : texto;
  }

  function desenharPainel() {
    const alunos = lerAlunos();
    const comOcorrencia = alunos.filter(function (a) { return a.ocorrencia; });
    const turmas = new Set(alunos.map(function (a) { return a.classe + '|' + a.turma; }));

    $('#nTotal').textContent = String(alunos.length);
    $('#nOcorrencias').textContent = String(comOcorrencia.length);
    $('#nTurmas').textContent = String(turmas.size);

    const lista = $('#listaOcorrencias');
    lista.textContent = '';
    comOcorrencia
      .sort(function (x, y) { return y.id - x.id; })
      .slice(0, 5)
      .forEach(function (a) {
        const li = criar('li');
        const ligacao = criar('a');
        ligacao.href = 'pesquisar.html?q=' + encodeURIComponent(a.nome);
        ligacao.appendChild(criar('strong', null, a.nome));
        ligacao.appendChild(criar('span', 'meta', a.classe + 'ª classe, turma ' + a.turma));
        const p = criar('p');
        p.appendChild(criar('span', 'ocorrencia', resumoOcorrencia(a.ocorrencia)));
        ligacao.appendChild(p);
        li.appendChild(ligacao);
        lista.appendChild(li);
      });
    $('#semOcorrencias').hidden = comOcorrencia.length > 0;
    $('#linkTodas').hidden = comOcorrencia.length === 0;
  }

  function lerTexto(texto) {
    const lidos = [];
    let ignoradas = 0;

    texto.split(/\r?\n/).forEach(function (linha) {
      if (!linha.trim()) return;
      const colunas = linha.split(';');
      if (colunas.length < 6) {
        ignoradas++;
        return;
      }
      const dados = {
        nome: limpar(colunas[1]),
        sala: limpar(colunas[2]),
        classe: String(parseInt(colunas[3], 10)),
        turma: limpar(colunas[4]).toUpperCase(),
        encarregado: soDigitos(colunas[5]),
        ocorrencia: limpar(colunas.slice(6).join(',')).slice(0, MAX_OCORRENCIA)
      };
      if (Object.keys(validar(dados, [], null)).length) {
        ignoradas++;
        return;
      }
      dados.id = parseInt(colunas[0], 10);
      lidos.push(dados);
    });

    // Números repetidos ou inválidos recebem um número novo
    const usados = new Set();
    lidos.forEach(function (a) {
      if (a.id > 0 && !usados.has(a.id)) usados.add(a.id);
      else a.id = 0;
    });
    let seguinte = lidos.reduce(function (m, a) { return Math.max(m, a.id); }, 0) + 1;
    lidos.forEach(function (a) { if (!a.id) a.id = seguinte++; });

    return { alunos: lidos, ignoradas: ignoradas };
  }

  function exportarTexto() {
    const alunos = lerAlunos().sort(function (x, y) { return x.id - y.id; });
    if (!alunos.length) {
      avisar('Ainda não há alunos para descarregar.', 'erro');
      return;
    }
    const linhas = alunos.map(function (a) {
      return [a.id, a.nome, a.sala, a.classe, a.turma, a.encarregado, a.ocorrencia].join(';');
    });
    const blob = new Blob([linhas.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const ligacao = criar('a');
    ligacao.href = url;
    ligacao.download = 'alunos.txt';
    document.body.appendChild(ligacao);
    ligacao.click();
    ligacao.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    avisar('alunos.txt descarregado com ' + alunos.length + (alunos.length === 1 ? ' aluno.' : ' alunos.'));
  }

  function importarTexto(ficheiro, campo) {
    const leitor = new FileReader();
    leitor.onload = function () {
      const texto = String(leitor.result).replace(/^﻿/, '');
      const resultado = lerTexto(texto);
      campo.value = '';
      if (!resultado.alunos.length) {
        avisar('Nenhum aluno válido neste ficheiro. Cada linha deve ter: número;nome;sala;classe;turma;encarregado;ocorrência.', 'erro');
        return;
      }
      const actuais = lerAlunos().length;
      if (actuais && !window.confirm('Substituir os ' + actuais + ' alunos actuais pelos ' + resultado.alunos.length + ' alunos do ficheiro?')) {
        return;
      }
      if (!gravarAlunos(resultado.alunos)) {
        avisar('Não foi possível guardar os alunos neste browser.', 'erro');
        return;
      }
      desenharPainel();
      let mensagem = resultado.alunos.length + (resultado.alunos.length === 1 ? ' aluno carregado.' : ' alunos carregados.');
      if (resultado.ignoradas) {
        mensagem += ' ' + resultado.ignoradas + (resultado.ignoradas === 1 ? ' linha ignorada por estar incompleta ou inválida.' : ' linhas ignoradas por estarem incompletas ou inválidas.');
      }
      avisar(mensagem);
    };
    leitor.onerror = function () {
      campo.value = '';
      avisar('Não foi possível ler o ficheiro.', 'erro');
    };
    leitor.readAsText(ficheiro, 'utf-8');
  }

  function iniciarIndex() {
    const ecraCriar = $('#ecraCriar');
    const ecraEntrar = $('#ecraEntrar');
    const painel = $('#painel');
    const formCriar = $('#formCriar');
    const formEntrar = $('#formEntrar');

    function mostrar() {
      const existe = !!coordenador();
      const dentro = sessaoActiva();
      ecraCriar.hidden = existe;
      ecraEntrar.hidden = !existe || dentro;
      painel.hidden = !dentro;
      actualizarCabecalho('index');
      if (dentro) desenharPainel();
    }

    ligarLimpezaDeErros(formCriar);
    ligarLimpezaDeErros(formEntrar);

    formCriar.addEventListener('submit', function (ev) {
      ev.preventDefault();
      const f = new FormData(formCriar);
      const nome = limpar(f.get('nome'));
      const codigo = String(f.get('codigo') || '');
      const repetir = String(f.get('repetir') || '');
      const erros = {};
      if (nome.length < 3) erros.nome = 'Escreve o teu nome, com pelo menos 3 letras.';
      if (codigo.length < 4) erros.codigo = 'O código deve ter pelo menos 4 caracteres.';
      if (!erros.codigo && repetir !== codigo) erros.repetir = 'Os dois códigos não são iguais.';
      mostrarErros(formCriar, erros);
      if (Object.keys(erros).length) return;

      if (!gravarJSON(localStorage, CHAVE_COORDENADOR, { nome: nome, codigo: resumo(codigo) })) {
        avisar('Não foi possível guardar o acesso neste browser.', 'erro');
        return;
      }
      iniciarSessao(nome);
      formCriar.reset();
      mostrar();
    });

    formEntrar.addEventListener('submit', function (ev) {
      ev.preventDefault();
      const codigo = String(new FormData(formEntrar).get('codigo') || '');
      const c = coordenador();
      if (!c || resumo(codigo) !== c.codigo) {
        mostrarErros(formEntrar, { codigo: 'Código incorrecto. Tenta outra vez.' });
        return;
      }
      iniciarSessao(c.nome);
      formEntrar.reset();
      mostrar();
    });

    $('#btnRepor').addEventListener('click', function () {
      if (!window.confirm('Apagar o acesso do coordenador? Os dados dos alunos não são apagados.')) return;
      try { localStorage.removeItem(CHAVE_COORDENADOR); } catch (e) { /* sem acção */ }
      terminarSessao();
      mostrar();
    });

    $('#btnExportar').addEventListener('click', exportarTexto);
    $('#ficheiroImportar').addEventListener('change', function (ev) {
      const ficheiro = ev.target.files && ev.target.files[0];
      if (ficheiro) importarTexto(ficheiro, ev.target);
    });

    mostrar();
  }

  /* ---------- Registar ---------- */

  function iniciarRegistar() {
    const form = $('#formRegistar');
    actualizarListaTurmas();
    ligarLimpezaDeErros(form);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      const alunos = lerAlunos();
      const dados = lerFormulario(form);
      const erros = validar(dados, alunos, null);
      mostrarErros(form, erros);
      if (Object.keys(erros).length) return;

      const aluno = Object.assign({ id: proximoId(alunos) }, dados);
      alunos.push(aluno);
      if (!gravarAlunos(alunos)) {
        avisar('Não foi possível guardar o aluno neste browser.', 'erro');
        return;
      }
      form.reset();
      actualizarListaTurmas();
      avisar('Aluno registado: ' + aluno.nome);
      $('#r-nome').focus();
    });
  }

  /* ---------- Pesquisar ---------- */

  function iniciarPesquisar() {
    const campoQ = $('#q');
    const filtroClasse = $('#fClasse');
    const filtroTurma = $('#fTurma');
    const soOcorrencia = $('#soOcorrencia');
    const corpo = $('#corpo');
    const formEditar = $('#formEditar');
    const dlgEditar = $('#dlgEditar');
    const dlgApagar = $('#dlgApagar');
    let idParaApagar = null;

    actualizarListaTurmas();
    ligarLimpezaDeErros(formEditar);
    ligarBotoesFechar();

    // Ligações vindas da página inicial: ?q=nome  e  ?ocorrencia=1
    const parametros = new URLSearchParams(window.location.search);
    campoQ.value = parametros.get('q') || '';
    soOcorrencia.checked = parametros.get('ocorrencia') === '1';

    function actualizarFiltroTurma(alunos) {
      const actual = filtroTurma.value;
      const turmas = turmasDosAlunos(alunos);
      while (filtroTurma.options.length > 1) filtroTurma.remove(1);
      turmas.forEach(function (t) {
        const opcao = criar('option', null, 'Turma ' + t);
        opcao.value = t;
        filtroTurma.appendChild(opcao);
      });
      filtroTurma.value = turmas.indexOf(actual) >= 0 ? actual : '';
    }

    function criarLinha(a) {
      const tr = document.createElement('tr');
      function celula(rotulo, conteudo, classe) {
        const td = criar('td', classe);
        td.dataset.label = rotulo;
        if (typeof conteudo === 'string') td.textContent = conteudo;
        else td.appendChild(conteudo);
        return td;
      }
      tr.appendChild(celula('Nº', String(a.id).padStart(3, '0'), 'col-num'));
      tr.appendChild(celula('Nome', criar('strong', null, a.nome)));
      tr.appendChild(celula('Classe', a.classe + 'ª'));
      tr.appendChild(celula('Turma', a.turma));
      tr.appendChild(celula('Sala', a.sala));
      tr.appendChild(celula('Encarregado', formatarTelefone(a.encarregado)));
      tr.appendChild(celula(
        'Ocorrência',
        a.ocorrencia ? criar('span', 'ocorrencia', a.ocorrencia) : criar('span', 'sem-ocorrencia', 'Sem ocorrência'),
        'col-ocorrencia'
      ));

      const accoes = criar('div');
      const editar = criar('button', 'btn btn--secundario btn--pequeno', 'Editar');
      editar.type = 'button';
      editar.dataset.accao = 'editar';
      editar.dataset.id = String(a.id);
      editar.setAttribute('aria-label', 'Editar ' + a.nome);
      const apagar = criar('button', 'btn btn--secundario btn--pequeno', 'Apagar');
      apagar.type = 'button';
      apagar.dataset.accao = 'apagar';
      apagar.dataset.id = String(a.id);
      apagar.setAttribute('aria-label', 'Apagar ' + a.nome);
      accoes.appendChild(editar);
      accoes.appendChild(apagar);
      tr.appendChild(celula('Acções', accoes, 'col-accoes'));
      return tr;
    }

    function mostrarVazio(titulo, texto, comLigacao) {
      $('#vazioTitulo').textContent = titulo;
      $('#vazioTexto').textContent = texto;
      $('#vazioLink').hidden = !comLigacao;
      $('#vazio').hidden = false;
    }

    function desenhar() {
      const alunos = lerAlunos();
      actualizarFiltroTurma(alunos);

      const termos = normalizar(campoQ.value).split(/\s+/).filter(Boolean);
      const lista = alunos.filter(function (a) {
        if (filtroClasse.value && a.classe !== filtroClasse.value) return false;
        if (filtroTurma.value && a.turma !== filtroTurma.value) return false;
        if (soOcorrencia.checked && !a.ocorrencia) return false;
        const palheiro = normalizar([a.nome, a.sala, a.encarregado, formatarTelefone(a.encarregado), a.ocorrencia].join(' '));
        return termos.every(function (t) { return palheiro.indexOf(t) >= 0; });
      }).sort(function (x, y) {
        return x.nome.localeCompare(y.nome, 'pt');
      });

      corpo.textContent = '';
      lista.forEach(function (a) { corpo.appendChild(criarLinha(a)); });

      $('#tabelaEnvolve').hidden = lista.length === 0;
      $('#vazio').hidden = true;
      $('#contagem').textContent = alunos.length === 0
        ? ''
        : lista.length === 1 ? '1 aluno encontrado' : lista.length + ' alunos encontrados';

      if (alunos.length === 0) {
        mostrarVazio('Ainda não há alunos registados', 'Regista o primeiro aluno para poderes pesquisar.', true);
      } else if (lista.length === 0) {
        mostrarVazio('Nenhum aluno encontrado', 'Confirma a escrita do nome ou limpa os filtros.', false);
      }
    }

    campoQ.addEventListener('input', desenhar);
    filtroClasse.addEventListener('change', desenhar);
    filtroTurma.addEventListener('change', desenhar);
    soOcorrencia.addEventListener('change', desenhar);
    $('#formPesquisa').addEventListener('submit', function (ev) { ev.preventDefault(); });
    $('#btnLimpar').addEventListener('click', function () {
      campoQ.value = '';
      filtroClasse.value = '';
      filtroTurma.value = '';
      soOcorrencia.checked = false;
      desenhar();
      campoQ.focus();
    });

    corpo.addEventListener('click', function (ev) {
      const botao = ev.target.closest('button[data-accao]');
      if (!botao) return;
      const id = parseInt(botao.dataset.id, 10);
      const aluno = lerAlunos().find(function (a) { return a.id === id; });
      if (!aluno) return;

      if (botao.dataset.accao === 'editar') {
        const campos = formEditar.elements;
        campos.alunoId.value = String(aluno.id);
        campos.nome.value = aluno.nome;
        campos.classe.value = aluno.classe;
        campos.turma.value = aluno.turma;
        campos.sala.value = aluno.sala;
        campos.encarregado.value = formatarTelefone(aluno.encarregado);
        campos.ocorrencia.value = aluno.ocorrencia;
        mostrarErros(formEditar, {});
        dlgEditar.showModal();
      } else {
        idParaApagar = aluno.id;
        $('#nomeApagar').textContent = aluno.nome;
        dlgApagar.showModal();
      }
    });

    formEditar.addEventListener('submit', function (ev) {
      ev.preventDefault();
      const id = parseInt(formEditar.elements.alunoId.value, 10);
      const alunos = lerAlunos();
      const dados = lerFormulario(formEditar);
      const erros = validar(dados, alunos, id);
      mostrarErros(formEditar, erros);
      if (Object.keys(erros).length) return;

      const posicao = alunos.findIndex(function (a) { return a.id === id; });
      if (posicao < 0) {
        dlgEditar.close();
        desenhar();
        return;
      }
      alunos[posicao] = Object.assign({ id: id }, dados);
      if (!gravarAlunos(alunos)) {
        avisar('Não foi possível guardar as alterações neste browser.', 'erro');
        return;
      }
      dlgEditar.close();
      actualizarListaTurmas();
      desenhar();
      avisar('Alterações guardadas: ' + dados.nome);
    });

    $('#btnConfirmarApagar').addEventListener('click', function () {
      const alunos = lerAlunos();
      const aluno = alunos.find(function (a) { return a.id === idParaApagar; });
      const restantes = alunos.filter(function (a) { return a.id !== idParaApagar; });
      if (!gravarAlunos(restantes)) {
        avisar('Não foi possível apagar o aluno neste browser.', 'erro');
        return;
      }
      dlgApagar.close();
      idParaApagar = null;
      desenhar();
      avisar('Aluno apagado' + (aluno ? ': ' + aluno.nome : ''));
    });

    desenhar();
  }

  /* ---------- Arranque ---------- */

  function iniciar() {
    const pagina = document.body.dataset.pagina;

    if (document.body.hasAttribute('data-protegida') && !sessaoActiva()) {
      window.location.replace('index.html');
      return;
    }
    document.body.classList.add('sessao-validada');

    $('#btnSair').addEventListener('click', function () {
      terminarSessao();
      window.location.href = 'index.html';
    });

    preencherClasses();

    if (pagina === 'index') {
      iniciarIndex();
    } else {
      actualizarCabecalho(pagina);
      if (pagina === 'registrar') iniciarRegistar();
      if (pagina === 'pesquisar') iniciarPesquisar();
    }
  }

  iniciar();
})();
