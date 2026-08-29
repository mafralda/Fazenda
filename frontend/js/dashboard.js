const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const CORES = {
  receita: '#2e7d32',
  despesa: '#c62828',
  categorias: ['#2e7d32', '#1565c0', '#ef6c00', '#6a1b9a', '#c62828', '#00897b', '#8d6e63', '#5e35b1', '#039be5', '#fdd835'],
};

const el = {
  seletorAno: document.getElementById('seletor-ano'),
  cardReceita: document.getElementById('card-receita'),
  cardDespesa: document.getElementById('card-despesa'),
  cardSaldo: document.getElementById('card-saldo'),
  cardSaldoLabel: document.getElementById('card-saldo-label'),
  cardSaldoWrapper: document.getElementById('card-saldo-wrapper'),
  tabelaAnimais: document.getElementById('tabela-animais'),
  btnNovoLancamento: document.getElementById('btn-novo-lancamento'),
};

let graficoMensal, graficoDespesasCategoria, graficoReceitasCategoria, graficoAnimais;

async function carregarAnos() {
  const anos = await api.dashboard.anos();
  const anoAtual = String(new Date().getFullYear());
  const opcoes = anos.length ? anos : [anoAtual];

  el.seletorAno.innerHTML = opcoes.map((a) => `<option value="${a}">${a}</option>`).join('');
  el.seletorAno.value = opcoes.includes(anoAtual) ? anoAtual : opcoes[0];
}

function destruirGraficos() {
  [graficoMensal, graficoDespesasCategoria, graficoReceitasCategoria, graficoAnimais].forEach((g) => g?.destroy());
  document.querySelectorAll('.sem-dados').forEach((elemento) => elemento.remove());
}

function montarGraficoMensal(porMes) {
  const ctx = document.getElementById('grafico-mensal');
  graficoMensal = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: porMes.map((m) => m.nome.slice(0, 3)),
      datasets: [
        { label: 'Receitas', data: porMes.map((m) => m.receitas), backgroundColor: CORES.receita },
        { label: 'Despesas', data: porMes.map((m) => m.despesas), backgroundColor: CORES.despesa },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => formatoMoeda.format(v) } } },
    },
  });
}

function montarGraficoCategoria(canvasId, dados) {
  const ctx = document.getElementById(canvasId);
  if (!dados.length) {
    ctx.parentElement.insertAdjacentHTML('beforeend', '<p class="sem-dados">Sem lançamentos no período.</p>');
    return null;
  }
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: dados.map((d) => d.categoria),
      datasets: [{ data: dados.map((d) => d.valor), backgroundColor: CORES.categorias }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'right' } },
    },
  });
}

function montarGraficoAnimais(dados) {
  const ctx = document.getElementById('grafico-animais');
  if (!dados.length) {
    ctx.parentElement.insertAdjacentHTML('beforeend', '<p class="sem-dados">Sem vendas de animais no período.</p>');
    return null;
  }
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dados.map((d) => d.tipo_animal),
      datasets: [{ label: 'Quantidade vendida', data: dados.map((d) => d.quantidade_total), backgroundColor: CORES.categorias }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    },
  });
}

function preencherTabelaAnimais(dados) {
  if (!dados.length) {
    el.tabelaAnimais.innerHTML = '<tr><td colspan="5" class="sem-dados">Sem vendas de animais no período.</td></tr>';
    return;
  }
  el.tabelaAnimais.innerHTML = dados
    .map(
      (d) => `
        <tr>
          <td>${d.tipo_animal}</td>
          <td>${d.quantidade_total}</td>
          <td>${d.numero_vendas}</td>
          <td>${d.preco_medio !== null ? formatoMoeda.format(d.preco_medio) : '—'}</td>
          <td>${formatoMoeda.format(d.valor_total)}</td>
        </tr>`
    )
    .join('');
}

async function carregarDashboard() {
  const ano = el.seletorAno.value;
  const [dados, animais] = await Promise.all([api.dashboard.anual(ano), api.dashboard.animais(ano)]);

  el.cardReceita.textContent = formatoMoeda.format(dados.total_receitas);
  el.cardDespesa.textContent = formatoMoeda.format(dados.total_despesas);
  el.cardSaldo.textContent = formatoMoeda.format(dados.saldo);
  el.cardSaldoLabel.textContent = dados.saldo < 0 ? 'Prejuízo' : 'Lucro';
  el.cardSaldoWrapper.classList.toggle('card-negativo', dados.saldo < 0);

  destruirGraficos();
  montarGraficoMensal(dados.por_mes);
  graficoDespesasCategoria = montarGraficoCategoria('grafico-despesas-categoria', dados.despesas_por_categoria);
  graficoReceitasCategoria = montarGraficoCategoria('grafico-receitas-categoria', dados.receitas_por_categoria);

  preencherTabelaAnimais(animais);
  graficoAnimais = montarGraficoAnimais(animais);
}

async function iniciar() {
  await carregarAnos();
  el.seletorAno.addEventListener('change', carregarDashboard);

  el.btnNovoLancamento.addEventListener('click', () => NovoLancamentoModal.abrir());
  NovoLancamentoModal.aoSalvar = carregarDashboard;

  await carregarDashboard();
}

iniciar();
