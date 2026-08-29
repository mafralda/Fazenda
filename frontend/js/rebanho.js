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

  btnNovoNascimento: document.getElementById('btn-novo-nascimento'),
  modalNascimento: document.getElementById('modal-nascimento'),
  formNascimento: document.getElementById('form-nascimento'),
  nascEspecie: document.getElementById('nasc-especie'),
  nascCategoria: document.getElementById('nasc-categoria'),
  nascQuantidade: document.getElementById('nasc-quantidade'),
  nascData: document.getElementById('nasc-data'),
  nascObservacoes: document.getElementById('nasc-observacoes'),
  nascPreview: document.getElementById('nasc-preview'),
  nascBtnCancelar: document.getElementById('nasc-btn-cancelar'),
};

let especieAtual = 'bovino';
let graficoRebanho = null;

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

async function carregarHistorico() {
  const eventos = await api.rebanho.historico(especieAtual);

  if (!eventos.length) {
    el.tabelaHistorico.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum nascimento registrado ainda.</td></tr>';
    return;
  }

  el.tabelaHistorico.innerHTML = eventos
    .map((ev) => {
      if (ev.tipo === 'nascimento') {
        return `
          <tr>
            <td>${formatoDataCurta(ev.data)}</td>
            <td><span class="badge badge-nascimento">Nascimento</span></td>
            <td>${ev.categoria}</td>
            <td class="col-valor">${ev.quantidade}</td>
            <td>${ev.observacoes || ''}</td>
            <td class="col-acoes"><button class="link-acao excluir" data-excluir-nascimento="${ev.id}">Excluir</button></td>
          </tr>`;
      }
      return `
        <tr>
          <td>${formatoDataCurta(ev.data).slice(3)}</td>
          <td><span class="badge badge-transicao">Transição</span></td>
          <td>${ev.categoria_origem} → ${ev.categoria_destino}</td>
          <td class="col-valor">${ev.quantidade}</td>
          <td class="sem-dados">gerada automaticamente</td>
          <td class="col-acoes"></td>
        </tr>`;
    })
    .join('');
}

async function excluirNascimento(id) {
  if (!confirm('Excluir este nascimento? As transições futuras geradas por ele também serão desfeitas.')) return;
  await api.rebanho.excluirNascimento(id);
  await carregarHistorico();
  await carregarTudo();
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

function abrirModalNascimento() {
  el.formNascimento.reset();
  el.nascEspecie.value = especieAtual;
  el.nascData.value = new Date().toISOString().slice(0, 10);
  carregarCategoriasNascimento();
  el.modalNascimento.showModal();
}

async function salvarNascimento(evento) {
  evento.preventDefault();

  try {
    await api.rebanho.registrarNascimento({
      especie: el.nascEspecie.value,
      categoria: el.nascCategoria.value,
      quantidade: Number(el.nascQuantidade.value),
      data: el.nascData.value,
      observacoes: el.nascObservacoes.value,
    });
    el.modalNascimento.close();

    if (el.nascEspecie.value !== especieAtual) {
      await trocarEspecie(el.nascEspecie.value);
    } else {
      await carregarTudo();
    }
    if (el.abaHistorico.style.display !== 'none') await carregarHistorico();
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

  el.tabelaHistorico.addEventListener('click', (evento) => {
    const id = evento.target.dataset.excluirNascimento;
    if (id) excluirNascimento(id);
  });

  el.btnNovoNascimento.addEventListener('click', abrirModalNascimento);
  el.nascBtnCancelar.addEventListener('click', () => el.modalNascimento.close());
  el.formNascimento.addEventListener('submit', salvarNascimento);
  el.nascEspecie.addEventListener('change', carregarCategoriasNascimento);
  el.nascCategoria.addEventListener('change', atualizarPreview);
  el.nascData.addEventListener('change', atualizarPreview);
}

async function iniciar() {
  preencherSeletorMes();
  ligarEventos();
  await trocarEspecie('bovino');
}

iniciar();
