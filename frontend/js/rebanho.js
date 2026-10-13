const CORES_CATEGORIAS = ['#2e7d32', '#1565c0', '#ef6c00', '#6a1b9a', '#c62828', '#00897b', '#8d6e63', '#5e35b1'];

const el = {
  btnBovino: document.getElementById('btn-especie-bovino'),
  btnOvino: document.getElementById('btn-especie-ovino'),
  seletorAno: document.getElementById('seletor-ano'),
  seletorMes: document.getElementById('seletor-mes'),
  cardsCategorias: document.getElementById('cards-categorias'),
  tabelaMes: document.getElementById('tabela-mes'),
  notaMes: document.getElementById('nota-mes'),

  tabVisaoGeral: document.getElementById('tab-visao-geral'),
  tabHistorico: document.getElementById('tab-historico'),
  abaVisaoGeral: document.getElementById('aba-visao-geral'),
  abaHistorico: document.getElementById('aba-historico'),
  tabelaHistorico: document.getElementById('tabela-historico'),
  histPeriodo: document.getElementById('hist-periodo'),
  histDataInicio: document.getElementById('hist-data-inicio'),
  histDataFim: document.getElementById('hist-data-fim'),
  histEvento: document.getElementById('hist-evento'),
  histLimpar: document.getElementById('hist-limpar'),

  btnNovoNascimento: document.getElementById('btn-novo-nascimento'),
  btnNovoObito: document.getElementById('btn-novo-obito'),
  modalNascimento: document.getElementById('modal-nascimento'),
  formNascimento: document.getElementById('form-nascimento'),
  nascTitulo: document.getElementById('nasc-titulo'),
  nascAvisoEdicao: document.getElementById('nasc-aviso-edicao'),
  nascEspecie: document.getElementById('nasc-especie'),
  nascCategoria: document.getElementById('nasc-categoria'),
  nascQuantidade: document.getElementById('nasc-quantidade'),
  nascData: document.getElementById('nasc-data'),
  nascObservacoes: document.getElementById('nasc-observacoes'),
  nascPreview: document.getElementById('nasc-preview'),
  nascBtnCancelar: document.getElementById('nasc-btn-cancelar'),

  modalObito: document.getElementById('modal-obito'),
  formObito: document.getElementById('form-obito'),
  obitoTitulo: document.getElementById('obito-titulo'),
  obitoEspecie: document.getElementById('obito-especie'),
  obitoCategoria: document.getElementById('obito-categoria'),
  obitoQuantidade: document.getElementById('obito-quantidade'),
  obitoData: document.getElementById('obito-data'),
  obitoObservacoes: document.getElementById('obito-observacoes'),
  obitoBtnCancelar: document.getElementById('obito-btn-cancelar'),

  modalTransicao: document.getElementById('modal-transicao'),
  formTransicao: document.getElementById('form-transicao'),
  transDescricao: document.getElementById('trans-descricao'),
  transQuantidade: document.getElementById('trans-quantidade'),
  transMes: document.getElementById('trans-mes'),
  transBtnCancelar: document.getElementById('trans-btn-cancelar'),
};

let especieAtual = 'bovino';
let graficoRebanho = null;
let eventosHistorico = []; // última listagem exibida: alimenta os modais de edição
let requisicaoHistorico = 0; // descarta respostas antigas quando os filtros mudam rápido
let nascimentoEditandoId = null;
let obitoEditandoId = null;
let transicaoEditandoId = null;

function escapar(texto) {
  const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(texto ?? '').replace(/[&<>"']/g, (c) => mapa[c]);
}

// AAAA-MM-DD no fuso local (toISOString usaria UTC e viraria o dia à noite no Brasil)
function formatoDataISO(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function historicoVisivel() {
  return el.abaHistorico.style.display !== 'none';
}

function nomesMeses() {
  return [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
}

function preencherSeletorMes() {
  el.seletorMes.innerHTML = nomesMeses()
    .map((nome, i) => `<option value="${String(i + 1).padStart(2, '0')}">${nome}</option>`)
    .join('');
}

async function trocarEspecie(especie) {
  especieAtual = especie;
  el.btnBovino.classList.toggle('ativo', especie === 'bovino');
  el.btnOvino.classList.toggle('ativo', especie === 'ovino');
  await carregarAnos();
  if (historicoVisivel()) await carregarHistorico();
}

async function carregarAnos() {
  const anos = await api.rebanho.anos(especieAtual);
  const anoAtual = String(new Date().getFullYear());
  const opcoes = anos.length ? anos : [Number(anoAtual)];

  el.seletorAno.innerHTML = opcoes.map((a) => `<option value="${a}">${a}</option>`).join('');
  el.seletorAno.value = opcoes.map(String).includes(anoAtual) ? anoAtual : opcoes[0];

  await carregarTudo();
}

function destruirGrafico() {
  graficoRebanho?.destroy();
  document.querySelectorAll('.sem-dados').forEach((elemento) => elemento.remove());
}

function montarCards(serie, mesMaisRecente) {
  const cores = CORES_CATEGORIAS;
  const cardsHtml = serie.categorias
    .map((categoria, i) => {
      const total = mesMaisRecente ? mesMaisRecente.por_categoria[categoria] : null;
      return `
        <div class="card" style="border-left-color:${cores[i % cores.length]}">
          <span class="card-label">${categoria}</span>
          <span class="card-valor">${total ?? '—'}</span>
        </div>`;
    })
    .join('');

  const totalGeral = mesMaisRecente ? mesMaisRecente.total_geral : null;

  el.cardsCategorias.innerHTML = `
    <div class="card card-saldo">
      <span class="card-label">Total do rebanho</span>
      <span class="card-valor">${totalGeral ?? '—'}</span>
    </div>
    ${cardsHtml}
  `;
}

function montarGrafico(serie) {
  const ctx = document.getElementById('grafico-rebanho');
  const mesesComDados = serie.meses.filter((m) => m.tem_dados);

  if (!mesesComDados.length) {
    ctx.parentElement.insertAdjacentHTML('beforeend', '<p class="sem-dados">Sem dados de rebanho no período.</p>');
    return;
  }

  graficoRebanho = new Chart(ctx, {
    type: 'line',
    data: {
      labels: serie.meses.map((m) => m.nome.slice(0, 3)),
      datasets: [
        {
          label: 'Total do rebanho',
          data: serie.meses.map((m) => m.total_geral),
          borderColor: '#2e7d32',
          backgroundColor: 'rgba(46, 125, 50, 0.15)',
          fill: true,
          tension: 0.25,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: false } },
    },
  });
}

function preencherTabelaMes(dados) {
  el.tabelaMes.innerHTML = dados.categorias
    .map(
      (c) => `
        <tr>
          <td>${c.categoria}</td>
          <td class="col-valor">${c.saldo_anterior}</td>
          <td class="col-valor">${c.obitos}</td>
          <td class="col-valor">${c.vendas}</td>
          <td class="col-valor">${c.nascimentos}</td>
          <td class="col-valor"><strong>${c.total}</strong></td>
        </tr>`
    )
    .join('');

  el.tabelaMes.innerHTML += `
    <tr>
      <td><strong>Total</strong></td>
      <td class="col-valor"><strong>${dados.totais.saldo_anterior}</strong></td>
      <td class="col-valor"><strong>${dados.totais.obitos}</strong></td>
      <td class="col-valor"><strong>${dados.totais.vendas}</strong></td>
      <td class="col-valor"><strong>${dados.totais.nascimentos}</strong></td>
      <td class="col-valor"><strong>${dados.totais.total}</strong></td>
    </tr>`;

  el.notaMes.textContent = dados.nota ? `Observações: ${dados.nota}` : '';
}

async function carregarMes() {
  const dados = await api.rebanho.mes(especieAtual, el.seletorAno.value, el.seletorMes.value);
  preencherTabelaMes(dados);
}

// ---------- Abas ----------

function trocarAba(aba) {
  el.tabVisaoGeral.classList.toggle('ativo', aba === 'visao-geral');
  el.tabHistorico.classList.toggle('ativo', aba === 'historico');
  el.abaVisaoGeral.style.display = aba === 'visao-geral' ? '' : 'none';
  el.abaHistorico.style.display = aba === 'historico' ? '' : 'none';
  if (aba === 'historico') carregarHistorico();
}

function formatoDataCurta(isoDate) {
  const [ano, mes, dia] = isoDate.split('-');
  return `${dia}/${mes}/${ano}`;
}

// ---------- Filtros do histórico ----------

function filtrosHistorico() {
  return {
    data_inicio: el.histDataInicio.value,
    data_fim: el.histDataFim.value,
    evento: el.histEvento.value,
  };
}

function intervaloDoPeriodo(periodo, hoje = new Date()) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  switch (periodo) {
    case 'mes-atual': return [new Date(ano, mes, 1), new Date(ano, mes + 1, 0)];
    case 'mes-passado': return [new Date(ano, mes - 1, 1), new Date(ano, mes, 0)];
    case '90-dias': return [new Date(ano, mes, hoje.getDate() - 90), hoje];
    case 'ano-atual': return [new Date(ano, 0, 1), new Date(ano, 11, 31)];
    default: return null;
  }
}

// "Personalizado" mantém as datas digitadas; os demais períodos preenchem De/Até.
function aoMudarPeriodo() {
  const periodo = el.histPeriodo.value;
  if (periodo !== 'personalizado') {
    const intervalo = intervaloDoPeriodo(periodo);
    el.histDataInicio.value = intervalo ? formatoDataISO(intervalo[0]) : '';
    el.histDataFim.value = intervalo ? formatoDataISO(intervalo[1]) : '';
  }
  return carregarHistorico();
}

function aoMudarDatas() {
  el.histPeriodo.value = el.histDataInicio.value || el.histDataFim.value ? 'personalizado' : '';
  return carregarHistorico();
}

function limparFiltrosHistorico() {
  el.histPeriodo.value = '';
  el.histDataInicio.value = '';
  el.histDataFim.value = '';
  el.histEvento.value = '';
  return carregarHistorico();
}

// ---------- Histórico ----------

function mensagemHistorico(texto) {
  el.tabelaHistorico.innerHTML = `<tr><td colspan="6" class="vazio">${escapar(texto)}</td></tr>`;
}

function acoesEvento(ev, { excluivel }) {
  return `
    <button class="link-acao" data-acao="editar" data-tipo="${ev.tipo}" data-id="${ev.id}">Editar</button>
    ${excluivel ? `<button class="link-acao excluir" data-acao="excluir" data-tipo="${ev.tipo}" data-id="${ev.id}">Excluir</button>` : ''}`;
}

function linhaHistorico(ev) {
  if (ev.tipo === 'transicao') {
    return `
      <tr>
        <td>${formatoDataCurta(ev.data).slice(3)}</td>
        <td><span class="badge badge-transicao">Transição</span></td>
        <td>${escapar(ev.categoria_origem)} → ${escapar(ev.categoria_destino)}</td>
        <td class="col-valor">${ev.quantidade}</td>
        <td class="obs-automatica">gerada automaticamente</td>
        <td class="col-acoes">${acoesEvento(ev, { excluivel: false })}</td>
      </tr>`;
  }

  const ehObito = ev.tipo === 'obito';
  return `
    <tr>
      <td>${formatoDataCurta(ev.data)}</td>
      <td><span class="badge ${ehObito ? 'badge-obito' : 'badge-nascimento'}">${ehObito ? 'Óbito' : 'Nascimento'}</span></td>
      <td>${escapar(ev.categoria)}</td>
      <td class="col-valor">${ev.quantidade}</td>
      <td>${escapar(ev.observacoes)}</td>
      <td class="col-acoes">${acoesEvento(ev, { excluivel: true })}</td>
    </tr>`;
}

async function carregarHistorico() {
  const filtros = filtrosHistorico();
  const filtrado = Object.values(filtros).some(Boolean);
  const requisicao = ++requisicaoHistorico; // antes de qualquer retorno: invalida respostas em voo

  if (filtros.data_inicio && filtros.data_fim && filtros.data_inicio > filtros.data_fim) {
    eventosHistorico = [];
    mensagemHistorico('A data inicial não pode ser posterior à data final.');
    return;
  }

  let eventos;
  try {
    eventos = await api.rebanho.historico(especieAtual, filtros);
  } catch (erro) {
    if (requisicao === requisicaoHistorico) mensagemHistorico(erro.message);
    return;
  }
  if (requisicao !== requisicaoHistorico) return;

  eventosHistorico = eventos;

  if (!eventos.length) {
    mensagemHistorico(
      filtrado ? 'Nenhum evento encontrado para os filtros selecionados.' : 'Nenhum evento registrado ainda.'
    );
    return;
  }

  el.tabelaHistorico.innerHTML = eventos.map(linhaHistorico).join('');
}

// Recarrega visão geral e (se estiver aberta) a aba de histórico depois de uma mudança.
async function atualizarTelas() {
  await carregarTudo();
  if (historicoVisivel()) await carregarHistorico();
}

function avisarErro(erro) {
  alert(erro.message);
}

// A API devolve `avisos` quando a mudança deixa alguma categoria com saldo negativo.
function mostrarAvisos(resposta) {
  if (resposta?.avisos?.length) alert(`Salvo, mas atenção:\n\n${resposta.avisos.join('\n')}`);
}

async function excluirEvento(tipo, id) {
  const confirmacao = {
    nascimento: 'Excluir este nascimento? As transições futuras geradas por ele também serão desfeitas.',
    obito: 'Excluir este óbito? Os animais voltam ao saldo do rebanho.',
  }[tipo];
  if (!confirmacao || !confirm(confirmacao)) return;

  try {
    const resposta =
      tipo === 'nascimento' ? await api.rebanho.excluirNascimento(id) : await api.rebanho.excluirObito(id);
    await atualizarTelas();
    mostrarAvisos(resposta);
  } catch (erro) {
    alert(erro.message);
  }
}

function editarEvento(ev) {
  if (ev.tipo === 'nascimento') return abrirModalNascimento(ev);
  if (ev.tipo === 'obito') return abrirModalObito(ev);
  return abrirModalTransicao(ev);
}

// ---------- Modal de nascimento ----------

async function carregarCategoriasNascimento() {
  const especie = el.nascEspecie.value;
  const categorias = await api.rebanho.categoriasNascimento(especie);
  el.nascCategoria.innerHTML = categorias
    .map((c) => `<option value="${c.categoria}">${c.categoria}</option>`)
    .join('');
  atualizarPreview();
}

function somarMeses(dataISO, meses) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const totalMeses = ano * 12 + (mes - 1) + meses;
  const anoResultado = Math.floor(totalMeses / 12);
  const mesResultado = (totalMeses % 12) + 1;
  return `${String(mesResultado).padStart(2, '0')}/${anoResultado}`;
}

async function atualizarPreview() {
  const especie = el.nascEspecie.value;
  const categorias = await api.rebanho.categoriasNascimento(especie);
  const info = categorias.find((c) => c.categoria === el.nascCategoria.value);
  const data = el.nascData.value;

  if (!info || !data) {
    el.nascPreview.textContent = '';
    return;
  }

  el.nascPreview.textContent = `Vira ${info.proxima_transicao.categoria} em ${somarMeses(data, info.proxima_transicao.meses)} (${info.proxima_transicao.meses} meses de idade).`;
}

// Sem argumento abre o modal para registrar; com um nascimento do histórico, para editar.
async function abrirModalNascimento(nascimento = null) {
  nascimentoEditandoId = nascimento ? nascimento.id : null;
  el.formNascimento.reset();
  el.nascTitulo.textContent = nascimento ? 'Editar nascimento' : 'Registrar nascimento';
  el.nascAvisoEdicao.hidden = !nascimento;
  el.nascEspecie.value = especieAtual;
  el.nascEspecie.disabled = Boolean(nascimento); // a espécie de um lançamento não muda
  el.nascData.value = nascimento ? nascimento.data : formatoDataISO(new Date());
  if (nascimento) {
    el.nascQuantidade.value = nascimento.quantidade;
    el.nascObservacoes.value = nascimento.observacoes || '';
  }

  await carregarCategoriasNascimento();
  if (nascimento) {
    el.nascCategoria.value = nascimento.categoria;
    await atualizarPreview();
  }
  el.modalNascimento.showModal();
}

async function salvarNascimento(evento) {
  evento.preventDefault();

  const dados = {
    especie: el.nascEspecie.value,
    categoria: el.nascCategoria.value,
    quantidade: Number(el.nascQuantidade.value),
    data: el.nascData.value,
    observacoes: el.nascObservacoes.value,
  };

  try {
    const resposta = nascimentoEditandoId
      ? await api.rebanho.atualizarNascimento(nascimentoEditandoId, dados)
      : await api.rebanho.registrarNascimento(dados);
    el.modalNascimento.close();

    if (!nascimentoEditandoId && dados.especie !== especieAtual) {
      await trocarEspecie(dados.especie);
    } else {
      await atualizarTelas();
    }
    mostrarAvisos(resposta);
  } catch (erro) {
    alert(erro.message);
  }
}

// ---------- Modal de óbito ----------

async function carregarCategoriasObito() {
  const categorias = await api.rebanho.categorias(el.obitoEspecie.value);
  el.obitoCategoria.innerHTML = categorias.map((c) => `<option value="${escapar(c)}">${escapar(c)}</option>`).join('');
}

// Sem argumento abre o modal para registrar; com um óbito do histórico, para editar.
async function abrirModalObito(obito = null) {
  obitoEditandoId = obito ? obito.id : null;
  el.formObito.reset();
  el.obitoTitulo.textContent = obito ? 'Editar óbito' : 'Registrar óbito';
  el.obitoEspecie.value = especieAtual;
  el.obitoEspecie.disabled = Boolean(obito);
  el.obitoData.value = obito ? obito.data : formatoDataISO(new Date());
  if (obito) {
    el.obitoQuantidade.value = obito.quantidade;
    el.obitoObservacoes.value = obito.observacoes || '';
  }

  await carregarCategoriasObito();
  if (obito) el.obitoCategoria.value = obito.categoria;
  el.modalObito.showModal();
}

async function salvarObito(evento) {
  evento.preventDefault();

  const dados = {
    especie: el.obitoEspecie.value,
    categoria: el.obitoCategoria.value,
    quantidade: Number(el.obitoQuantidade.value),
    data: el.obitoData.value,
    observacoes: el.obitoObservacoes.value,
  };

  try {
    const resposta = obitoEditandoId
      ? await api.rebanho.atualizarObito(obitoEditandoId, dados)
      : await api.rebanho.registrarObito(dados);
    el.modalObito.close();

    if (!obitoEditandoId && dados.especie !== especieAtual) {
      await trocarEspecie(dados.especie);
    } else {
      await atualizarTelas();
    }
    mostrarAvisos(resposta);
  } catch (erro) {
    alert(erro.message);
  }
}

// ---------- Modal de transição (só edição) ----------

function abrirModalTransicao(transicao) {
  transicaoEditandoId = transicao.id;
  el.transDescricao.textContent = `${transicao.categoria_origem} → ${transicao.categoria_destino}`;
  el.transQuantidade.value = transicao.quantidade;
  el.transMes.value = transicao.data.slice(0, 7);
  el.modalTransicao.showModal();
}

async function salvarTransicao(evento) {
  evento.preventDefault();

  try {
    const resposta = await api.rebanho.atualizarTransicao(transicaoEditandoId, {
      quantidade: Number(el.transQuantidade.value),
      mes_ano: el.transMes.value,
    });
    el.modalTransicao.close();
    await atualizarTelas();
    mostrarAvisos(resposta);
  } catch (erro) {
    alert(erro.message);
  }
}

async function carregarTudo() {
  const serie = await api.rebanho.serie(especieAtual, el.seletorAno.value);

  const mesesComDados = serie.meses.filter((m) => m.tem_dados);
  const anoAtual = String(new Date().getFullYear());
  const mesAtual = String(new Date().getMonth() + 1).padStart(2, '0');

  let mesReferencia;
  if (el.seletorAno.value === anoAtual && mesesComDados.some((m) => m.mes === mesAtual)) {
    mesReferencia = mesesComDados.find((m) => m.mes === mesAtual);
  } else {
    mesReferencia = mesesComDados[mesesComDados.length - 1] || null;
  }

  destruirGrafico();
  montarCards(serie, mesReferencia);
  montarGrafico(serie);

  el.seletorMes.value = mesReferencia ? mesReferencia.mes : mesAtual;
  await carregarMes();
}

function ligarEventos() {
  el.btnBovino.addEventListener('click', () => trocarEspecie('bovino'));
  el.btnOvino.addEventListener('click', () => trocarEspecie('ovino'));
  el.seletorAno.addEventListener('change', carregarTudo);
  el.seletorMes.addEventListener('change', carregarMes);

  el.tabVisaoGeral.addEventListener('click', () => trocarAba('visao-geral'));
  el.tabHistorico.addEventListener('click', () => trocarAba('historico'));

  el.histPeriodo.addEventListener('change', aoMudarPeriodo);
  el.histDataInicio.addEventListener('change', aoMudarDatas);
  el.histDataFim.addEventListener('change', aoMudarDatas);
  el.histEvento.addEventListener('change', carregarHistorico);
  el.histLimpar.addEventListener('click', limparFiltrosHistorico);

  el.tabelaHistorico.addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-acao]');
    if (!botao) return;
    const { acao, tipo, id } = botao.dataset;

    if (acao === 'excluir') return excluirEvento(tipo, id);
    const ev = eventosHistorico.find((e) => e.tipo === tipo && String(e.id) === id);
    if (ev) Promise.resolve(editarEvento(ev)).catch(avisarErro);
  });

  // arrow functions: o click não pode passar o evento como "nascimento"/"óbito" a editar
  el.btnNovoNascimento.addEventListener('click', () => abrirModalNascimento().catch(avisarErro));
  el.nascBtnCancelar.addEventListener('click', () => el.modalNascimento.close());
  el.formNascimento.addEventListener('submit', salvarNascimento);
  el.nascEspecie.addEventListener('change', carregarCategoriasNascimento);
  el.nascCategoria.addEventListener('change', atualizarPreview);
  el.nascData.addEventListener('change', atualizarPreview);

  el.btnNovoObito.addEventListener('click', () => abrirModalObito().catch(avisarErro));
  el.obitoBtnCancelar.addEventListener('click', () => el.modalObito.close());
  el.formObito.addEventListener('submit', salvarObito);
  el.obitoEspecie.addEventListener('change', carregarCategoriasObito);

  el.transBtnCancelar.addEventListener('click', () => el.modalTransicao.close());
  el.formTransicao.addEventListener('submit', salvarTransicao);
}

async function iniciar() {
  preencherSeletorMes();
  ligarEventos();
  await trocarEspecie('bovino');
}

iniciar();
