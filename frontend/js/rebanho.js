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

  btnNovaParicao: document.getElementById('btn-nova-paricao'),
  tabParicoes: document.getElementById('tab-paricoes'),
  abaParicoes: document.getElementById('aba-paricoes'),
  tabelaParicoes: document.getElementById('tabela-paricoes'),
  modalParicao: document.getElementById('modal-paricao'),
  formParicao: document.getElementById('form-paricao'),
  parTitulo: document.getElementById('par-titulo'),
  parData: document.getElementById('par-data'),
  parCampos: document.getElementById('par-campos'),
  parObservacoes: document.getElementById('par-observacoes'),
  parAplicar: document.getElementById('par-aplicar'),
  parAvisoPlanilha: document.getElementById('par-aviso-planilha'),
  parPrevia: document.getElementById('par-previa'),
  parInconsistencias: document.getElementById('par-inconsistencias'),
  parAvisoEdicao: document.getElementById('par-aviso-edicao'),
  parBtnCancelar: document.getElementById('par-btn-cancelar'),
  parBtnSalvar: document.getElementById('par-btn-salvar'),
};

let especieAtual = 'bovino';
let graficoRebanho = null;
let eventosHistorico = []; // última listagem exibida: alimenta os modais de edição
let requisicaoHistorico = 0; // descarta respostas antigas quando os filtros mudam rápido
let nascimentoEditandoId = null;
let obitoEditandoId = null;
let transicaoEditandoId = null;
let paricoesCarregadas = []; // última listagem da aba Parições: alimenta o modal de edição
let requisicaoParicoes = 0;
let paricaoEditandoId = null;
let paricaoOriginal = null;
let salvandoParicao = false;
let usuarioMexeuAplicar = false; // enquanto false, o aviso de "mês já na planilha" pode desmarcar o checkbox
let desmarcadoAutomaticamente = false; // a caixa foi desmarcada pelo aviso (e volta a marcar se o mês deixar de ter nascimentos)
let requisicaoPlanilha = 0;
let categoriasNascimentoOvino = null; // cadeia de maturação (meses e destino) vinda da API, para a prévia

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

function paricoesVisivel() {
  return el.abaParicoes.style.display !== 'none';
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

  // parição é um evento de ovinos: botão e aba aparecem só nessa espécie (síncrono, antes dos awaits)
  const ovino = especie === 'ovino';
  el.btnNovaParicao.hidden = !ovino;
  el.tabParicoes.hidden = !ovino;
  if (!ovino && paricoesVisivel()) trocarAba('visao-geral');
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
          <td class="col-valor">${c.compras}</td>
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
      <td class="col-valor"><strong>${dados.totais.compras}</strong></td>
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
  el.tabParicoes.classList.toggle('ativo', aba === 'paricoes');
  el.abaVisaoGeral.style.display = aba === 'visao-geral' ? '' : 'none';
  el.abaHistorico.style.display = aba === 'historico' ? '' : 'none';
  el.abaParicoes.style.display = aba === 'paricoes' ? '' : 'none';
  if (aba === 'historico') carregarHistorico();
  if (aba === 'paricoes') carregarParicoes();
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

  // Venda/compra vêm de um lançamento financeiro: só mudam em Lançamentos, então sem botões.
  if (ev.tipo === 'venda' || ev.tipo === 'compra') {
    const ehVenda = ev.tipo === 'venda';
    const detalhe = ev.observacoes ? `: ${escapar(ev.observacoes)}` : '';
    return `
      <tr>
        <td>${formatoDataCurta(ev.data)}</td>
        <td><span class="badge ${ehVenda ? 'badge-venda' : 'badge-compra'}">${ehVenda ? 'Venda' : 'Compra'}</span></td>
        <td>${escapar(ev.categoria)}</td>
        <td class="col-valor">${ev.quantidade}</td>
        <td class="obs-automatica">gerada pelo lançamento${detalhe}</td>
        <td class="col-acoes"></td>
      </tr>`;
  }

  // Gerado por uma parição: só muda pela parição (aba Parições), então sem botões.
  const daParicao = Boolean(ev.paricao_id);
  const ehObito = ev.tipo === 'obito';
  return `
    <tr>
      <td>${formatoDataCurta(ev.data)}</td>
      <td><span class="badge ${ehObito ? 'badge-obito' : 'badge-nascimento'}">${ehObito ? 'Óbito' : 'Nascimento'}</span></td>
      <td>${escapar(ev.categoria)}</td>
      <td class="col-valor">${ev.quantidade}</td>
      <td${daParicao ? ' class="obs-automatica"' : ''}>${
        daParicao ? `gerado pela parição de ${formatoDataCurta(ev.paricao_data)}` : escapar(ev.observacoes)
      }</td>
      <td class="col-acoes">${daParicao ? '' : acoesEvento(ev, { excluivel: true })}</td>
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
  if (paricoesVisivel()) await carregarParicoes();
}

function avisarErro(erro) {
  alert(erro.message);
}

// A API devolve `avisos` quando a mudança deixa alguma categoria com saldo negativo.
function mostrarAvisos(resposta, verbo = 'Salvo') {
  if (resposta?.avisos?.length) alert(`${verbo}, mas atenção:\n\n${resposta.avisos.join('\n')}`);
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

// Tipo desconhecido não faz nada (nada de cair no modal errado).
const EDITAR_EVENTO = { nascimento: abrirModalNascimento, obito: abrirModalObito, transicao: abrirModalTransicao };

function editarEvento(ev) {
  return EDITAR_EVENTO[ev.tipo]?.(ev);
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

// ---------- Parições (aba e modal; só ovinos) ----------

// Campos numéricos do modal, agrupados como na planilha. `auto`: começa calculado a partir dos
// outros (a planilha faz o mesmo) e vira do usuário assim que ele digita por cima.
const GRUPOS_PARICAO = [
  {
    titulo: 'Ovelhas',
    campos: [
      { campo: 'ovelhas', rotulo: 'Ovelhas que pariram' },
      { campo: 'partos_duplos', rotulo: 'Partos duplos' },
      { campo: 'ovelhas_mortas', rotulo: 'Ovelhas mortas', dica: 'dão baixa no rebanho' },
      { campo: 'abortos', rotulo: 'Abortos' },
    ],
  },
  {
    titulo: 'Crias',
    campos: [
      { campo: 'crias', rotulo: 'Crias (total)', auto: true },
      { campo: 'borregos_vivos', rotulo: 'Borregos vivos', dica: 'entram no rebanho' },
      { campo: 'borregas_vivas', rotulo: 'Borregas vivas', dica: 'entram no rebanho' },
    ],
  },
  {
    titulo: 'Perdas',
    campos: [
      { campo: 'natimortos', rotulo: 'Natimortos' },
      { campo: 'mortes', rotulo: 'Mortes após o nascimento' },
      { campo: 'aleijados', rotulo: 'Aleijados', dica: 'contam como mortos' },
      { campo: 'total_mortos', rotulo: 'Total de mortos', auto: true },
    ],
  },
];
const CAMPOS_PARICAO = GRUPOS_PARICAO.flatMap((g) => g.campos);
// Só estes três mexem no rebanho; os demais são o registro do evento.
const CAMPOS_QUE_MEXEM_NO_REBANHO = ['borregos_vivos', 'borregas_vivas', 'ovelhas_mortas'];
// Ordem das colunas numéricas na tabela da aba (a mesma da planilha).
const COLUNAS_TABELA_PARICOES = [
  'ovelhas', 'crias', 'borregos_vivos', 'borregas_vivas', 'partos_duplos', 'aleijados',
  'natimortos', 'mortes', 'total_mortos', 'ovelhas_mortas', 'abortos',
];

// Colunas com percentual na aba: campo → base da divisão (ovelhas que pariram ou total de crias).
const BASE_PERCENTUAL_PARICAO = {
  partos_duplos: 'ovelhas',
  aleijados: 'crias',
  natimortos: 'crias',
  mortes: 'crias',
  total_mortos: 'crias',
  abortos: 'ovelhas',
  ovelhas_mortas: 'ovelhas',
};
const formatoPercentual = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

// "valor <small>x,x%</small>"; sem base (zero), só o valor.
function celulaParicao(campo, valor, linha) {
  const base = linha[BASE_PERCENTUAL_PARICAO[campo]];
  const percentual = base ? ` <small class="percentual">${formatoPercentual.format(valor / base)}</small>` : '';
  return `<td class="col-valor">${valor}${percentual}</td>`;
}

const inputsParicao = {};
const automaticoParicao = { crias: true, total_mortos: true };

function montarCamposParicao() {
  el.parCampos.innerHTML = GRUPOS_PARICAO.map(
    (g) => `
      <fieldset class="grupo">
        <legend>${g.titulo}</legend>
        <div class="campo-grade">
          ${g.campos
            .map(
              (c) => `
            <label>
              ${c.rotulo}${c.dica ? ` <small>(${c.dica})</small>` : ''}
              <input type="number" data-campo="${c.campo}" min="0" max="9999" step="1"
                     inputmode="numeric" placeholder="0" autocomplete="off" />
            </label>`
            )
            .join('')}
        </div>
      </fieldset>`
  ).join('');
  for (const c of CAMPOS_PARICAO) inputsParicao[c.campo] = el.parCampos.querySelector(`[data-campo="${c.campo}"]`);
}

// ----- aba -----

function mensagemParicoes(texto) {
  el.tabelaParicoes.innerHTML = `<tr><td colspan="15" class="vazio">${escapar(texto)}</td></tr>`;
}

function linhaParicao(p) {
  const rebanho = p.aplicado_no_rebanho
    ? '<span class="badge badge-nascimento" title="Borregos, borregas e ovelhas mortas foram lançados no rebanho">No rebanho</span>'
    : '<span class="badge badge-neutro" title="Só o registro do evento: o rebanho não foi alterado">Só estatística</span>';
  return `
    <tr>
      <td>${formatoDataCurta(p.data)}</td>
      ${COLUNAS_TABELA_PARICOES.map((c) => celulaParicao(c, p[c], p)).join('')}
      <td>${rebanho}</td>
      <td class="obs">${escapar(p.observacoes)}</td>
      <td class="col-acoes">
        <button class="link-acao" data-acao="editar-paricao" data-id="${p.id}">Editar</button>
        <button class="link-acao excluir" data-acao="excluir-paricao" data-id="${p.id}">Excluir</button>
      </td>
    </tr>`;
}

async function carregarParicoes() {
  const requisicao = ++requisicaoParicoes; // descarta respostas antigas
  let lista;
  try {
    lista = await api.rebanho.paricoes('ovino');
  } catch (erro) {
    if (requisicao === requisicaoParicoes) mensagemParicoes(erro.message);
    return;
  }
  if (requisicao !== requisicaoParicoes) return;

  paricoesCarregadas = lista;
  if (!lista.length) {
    mensagemParicoes('Nenhuma parição registrada ainda.');
    return;
  }

  const totais = Object.fromEntries(
    COLUNAS_TABELA_PARICOES.map((c) => [c, lista.reduce((soma, p) => soma + p[c], 0)])
  );
  el.tabelaParicoes.innerHTML =
    lista.map(linhaParicao).join('') +
    `<tr class="linha-total">
      <td>Total</td>
      ${COLUNAS_TABELA_PARICOES.map((c) => celulaParicao(c, totais[c], totais)).join('')}
      <td></td><td></td><td></td>
    </tr>`;
}

async function excluirParicao(id) {
  const paricao = paricoesCarregadas.find((p) => String(p.id) === String(id));
  const confirmacao = paricao?.aplicado_no_rebanho
    ? 'Excluir esta parição? Os borregos e borregas lançados no rebanho, a baixa das ovelhas mortas e as transições geradas também serão desfeitos.'
    : 'Excluir esta parição? Ela não alterou o rebanho.';
  if (!confirm(confirmacao)) return;

  try {
    const resposta = await api.rebanho.excluirParicao(id);
    await atualizarTelas();
    mostrarAvisos(resposta, 'Excluída');
  } catch (erro) {
    alert(erro.message);
  }
}

function aoClicarParicoes(evento) {
  const botao = evento.target.closest('button[data-acao]');
  if (!botao) return;
  const { acao, id } = botao.dataset;
  if (acao === 'excluir-paricao') return excluirParicao(id);
  if (acao === 'editar-paricao') {
    const paricao = paricoesCarregadas.find((p) => String(p.id) === String(id));
    if (paricao) abrirModalParicao(paricao).catch(avisarErro);
  }
}

// ----- modal -----

function numeroDoCampo(campo) {
  return Number(inputsParicao[campo].value || 0);
}

function valoresParicao() {
  return Object.fromEntries(CAMPOS_PARICAO.map((c) => [c.campo, numeroDoCampo(c.campo)]));
}

function recalcularAutomaticos() {
  if (automaticoParicao.total_mortos) {
    inputsParicao.total_mortos.value = numeroDoCampo('natimortos') + numeroDoCampo('mortes') + numeroDoCampo('aleijados');
  }
  if (automaticoParicao.crias) {
    inputsParicao.crias.value =
      numeroDoCampo('borregos_vivos') + numeroDoCampo('borregas_vivas') + numeroDoCampo('total_mortos');
  }
  for (const campo of Object.keys(automaticoParicao)) {
    inputsParicao[campo].closest('label').classList.toggle('campo-auto', automaticoParicao[campo]);
  }
}

// Mesmas regras de aviso do servidor, mostradas ao vivo (o servidor repete e é quem vale).
function inconsistenciasParicao(v) {
  const avisos = [];
  const vivos = v.borregos_vivos + v.borregas_vivas;
  if (vivos > v.crias) {
    avisos.push(`Borregos + borregas vivos (${vivos}) passam do total de crias (${v.crias}): o sistema vai recusar.`);
  }
  const mortosEsperados = v.natimortos + v.mortes + v.aleijados;
  if (v.total_mortos !== mortosEsperados) {
    avisos.push(`Total de mortos (${v.total_mortos}) difere de natimortos + mortes + aleijados (${mortosEsperados}).`);
  }
  if (v.crias !== vivos + v.total_mortos) {
    avisos.push(`Crias (${v.crias}) difere de borregos + borregas vivos + total de mortos (${vivos + v.total_mortos}).`);
  }
  if (v.ovelhas_mortas > v.ovelhas) {
    avisos.push(`Ovelhas mortas (${v.ovelhas_mortas}) é maior que as ovelhas que pariram (${v.ovelhas}).`);
  }
  if (v.partos_duplos > v.ovelhas) {
    avisos.push(`Partos duplos (${v.partos_duplos}) é maior que as ovelhas que pariram (${v.ovelhas}).`);
  }
  return avisos;
}

function previaParicao(v) {
  if (!el.parAplicar.checked) return 'Só estatística: o rebanho não será alterado.';

  const partes = [];
  if (v.borregos_vivos) partes.push(`+${v.borregos_vivos} borrego(s)`);
  if (v.borregas_vivas) partes.push(`+${v.borregas_vivas} borrega(s)`);
  if (v.ovelhas_mortas) partes.push(`−${v.ovelhas_mortas} ovelha(s)`);
  if (!partes.length) return 'Nenhum animal será lançado no rebanho (sem borregos, borregas nem ovelhas mortas).';

  const data = el.parData.value;
  let texto = `No rebanho${data ? ` em ${somarMeses(data, 0)}` : ''}: ${partes.join(', ')}.`;
  if (data && categoriasNascimentoOvino) {
    const chegada = (categoria, quantidade, rotulo) => {
      const info = categoriasNascimentoOvino.find((c) => c.categoria === categoria);
      if (!quantidade || !info) return null;
      const { meses, categoria: destino } = info.proxima_transicao;
      return `${rotulo} viram ${destino} em ${somarMeses(data, meses)}`;
    };
    const transicoes = [
      chegada('Borrego', v.borregos_vivos, 'os borregos'),
      chegada('Borrega', v.borregas_vivas, 'as borregas'),
    ].filter(Boolean);
    if (transicoes.length) texto += ` ${transicoes.join('; ')}.`;
  }
  return texto;
}

// O aviso de edição só importa se algo que mexe no rebanho mudou.
function efeitoNoRebanhoMudou(v) {
  if (!paricaoOriginal || !paricaoOriginal.aplicado_no_rebanho) return false;
  return (
    !el.parAplicar.checked ||
    el.parData.value.slice(0, 7) !== paricaoOriginal.data.slice(0, 7) ||
    CAMPOS_QUE_MEXEM_NO_REBANHO.some((c) => v[c] !== paricaoOriginal[c])
  );
}

function atualizarModalParicao() {
  const v = valoresParicao();
  el.parPrevia.textContent = previaParicao(v);

  const inconsistencias = inconsistenciasParicao(v);
  el.parInconsistencias.innerHTML = inconsistencias.map((t) => `<li>${escapar(t)}</li>`).join('');
  el.parInconsistencias.hidden = inconsistencias.length === 0;

  el.parAvisoEdicao.hidden = !efeitoNoRebanhoMudou(v);
}

function aoDigitarParicao(evento) {
  const campo = evento.target.dataset.campo;
  if (!campo) return;
  // apagar um campo calculado devolve o cálculo; digitar um número o torna do usuário
  if (campo in automaticoParicao) automaticoParicao[campo] = evento.target.value === '';
  recalcularAutomaticos();
  atualizarModalParicao();
}

// Enter num campo numérico vai para o próximo (e não envia o formulário pela metade).
function aoTeclarParicao(evento) {
  if (evento.key !== 'Enter' || !evento.target.matches('input[data-campo]')) return;
  evento.preventDefault();
  const campos = [...el.parCampos.querySelectorAll('input[data-campo]')];
  (campos[campos.indexOf(evento.target) + 1] || el.parObservacoes).focus();
}

// Registrar um mês que já está nas planilhas importadas contaria os borregos em dobro:
// avisa e, em parição nova, desmarca "Lançar no rebanho" (o usuário pode marcar de novo).
async function verificarMesNaPlanilha() {
  const requisicao = ++requisicaoPlanilha; // antes de qualquer retorno: invalida respostas em voo
  const data = el.parData.value;
  if (paricaoEditandoId || !data) {
    el.parAvisoPlanilha.hidden = true;
    return;
  }

  const [ano, mes] = data.split('-');
  let dados;
  try {
    dados = await api.rebanho.mes('ovino', ano, mes);
  } catch {
    return; // sem a checagem o servidor ainda avisa ao salvar
  }
  if (requisicao !== requisicaoPlanilha) return;

  const nascidos = ['Borrego', 'Borrega'].reduce(
    (soma, categoria) => soma + (dados.categorias.find((c) => c.categoria === categoria)?.nascimentos ?? 0),
    0
  );
  const jaTem = dados.tem_dados && nascidos > 0;
  el.parAvisoPlanilha.hidden = !jaTem;
  if (jaTem) {
    const desmarcou = !usuarioMexeuAplicar;
    el.parAvisoPlanilha.textContent =
      `${mes}/${ano} já tem ${nascidos} nascimento(s) de borregos e borregas no rebanho (da planilha ou de registros anteriores). ` +
      (desmarcou ? '"Lançar no rebanho" foi desmarcado para não contar em dobro: marque de novo se esta parição ainda não está nesses números.' : 'Se esta parição já está contada nesses números, desmarque "Lançar no rebanho" para registrar só as estatísticas.');
    if (desmarcou) {
      el.parAplicar.checked = false;
      desmarcadoAutomaticamente = true;
    }
  } else if (desmarcadoAutomaticamente && !usuarioMexeuAplicar) {
    // o mês novo não tem nascimentos: desfaz o desmarcar automático
    el.parAplicar.checked = true;
    desmarcadoAutomaticamente = false;
  }
  atualizarModalParicao();
}

function aoMudarDataParicao() {
  atualizarModalParicao();
  verificarMesNaPlanilha();
}

// Sem argumento abre para registrar; com uma parição da aba, para editar.
async function abrirModalParicao(paricao = null) {
  paricaoEditandoId = paricao ? paricao.id : null;
  paricaoOriginal = paricao;
  el.formParicao.reset();
  el.parTitulo.textContent = paricao ? 'Editar parição' : 'Registrar parição';
  el.parData.value = paricao ? paricao.data : ''; // sem data padrão: o mês decide as transições
  for (const c of CAMPOS_PARICAO) inputsParicao[c.campo].value = paricao ? paricao[c.campo] : '';
  el.parObservacoes.value = paricao?.observacoes || '';
  el.parAplicar.checked = paricao ? paricao.aplicado_no_rebanho : true;
  el.parAvisoPlanilha.hidden = true;
  usuarioMexeuAplicar = Boolean(paricao);
  desmarcadoAutomaticamente = false;
  requisicaoPlanilha++; // uma resposta da abertura anterior não pode aparecer neste modal
  // parição nova: crias e total de mortos calculados; edição: os valores gravados, a menos que
  // sigam a fórmula (aí continuam calculados e acompanham o que for alterado, como os mortos)
  automaticoParicao.total_mortos = !paricao || paricao.total_mortos === paricao.natimortos + paricao.mortes + paricao.aleijados;
  automaticoParicao.crias =
    !paricao || paricao.crias === paricao.borregos_vivos + paricao.borregas_vivas + paricao.total_mortos;
  recalcularAutomaticos();
  atualizarModalParicao();
  el.modalParicao.showModal();

  if (!categoriasNascimentoOvino) {
    categoriasNascimentoOvino = await api.rebanho.categoriasNascimento('ovino');
    atualizarModalParicao();
  }
}

async function salvarParicao(evento) {
  evento.preventDefault();
  if (salvandoParicao) return; // toque duplo não cria duas parições

  const dados = {
    data: el.parData.value,
    observacoes: el.parObservacoes.value,
    aplicar_no_rebanho: el.parAplicar.checked,
  };
  for (const c of CAMPOS_PARICAO) {
    const valor = inputsParicao[c.campo].value;
    dados[c.campo] = valor === '' ? null : Number(valor);
  }

  salvandoParicao = true;
  el.parBtnSalvar.disabled = true;
  el.parBtnSalvar.textContent = 'Salvando…';
  try {
    const resposta = paricaoEditandoId
      ? await api.rebanho.atualizarParicao(paricaoEditandoId, dados)
      : await api.rebanho.registrarParicao(dados);
    el.modalParicao.close();
    await atualizarTelas();
    mostrarAvisos(resposta);
  } catch (erro) {
    alert(erro.message);
  } finally {
    salvandoParicao = false;
    el.parBtnSalvar.disabled = false;
    el.parBtnSalvar.textContent = 'Salvar';
  }
}

function ligarEventos() {
  el.btnBovino.addEventListener('click', () => trocarEspecie('bovino'));
  el.btnOvino.addEventListener('click', () => trocarEspecie('ovino'));
  el.seletorAno.addEventListener('change', carregarTudo);
  el.seletorMes.addEventListener('change', carregarMes);

  el.tabVisaoGeral.addEventListener('click', () => trocarAba('visao-geral'));
  el.tabHistorico.addEventListener('click', () => trocarAba('historico'));
  el.tabParicoes.addEventListener('click', () => trocarAba('paricoes'));

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

  montarCamposParicao();
  el.btnNovaParicao.addEventListener('click', () => abrirModalParicao().catch(avisarErro));
  el.parBtnCancelar.addEventListener('click', () => el.modalParicao.close());
  el.formParicao.addEventListener('submit', salvarParicao);
  el.parData.addEventListener('change', aoMudarDataParicao);
  el.parAplicar.addEventListener('change', () => {
    usuarioMexeuAplicar = true;
    atualizarModalParicao();
  });
  el.parCampos.addEventListener('input', aoDigitarParicao);
  el.parCampos.addEventListener('keydown', aoTeclarParicao);
  el.tabelaParicoes.addEventListener('click', aoClicarParicoes);

  el.transBtnCancelar.addEventListener('click', () => el.modalTransicao.close());
  el.formTransicao.addEventListener('submit', salvarTransicao);
}

async function iniciar() {
  preencherSeletorMes();
  ligarEventos();
  await trocarEspecie('bovino');
}

iniciar();
