const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatoData = (isoDate) => {
  const [ano, mes, dia] = isoDate.split('-');
  return `${dia}/${mes}/${ano}`;
};

const el = {
  seletorAno: document.getElementById('seletor-ano'),
  seletorMes: document.getElementById('seletor-mes'),
  cardReceita: document.getElementById('card-receita'),
  cardDespesa: document.getElementById('card-despesa'),
  cardSaldo: document.getElementById('card-saldo'),
  cardSaldoLabel: document.getElementById('card-saldo-label'),
  cardSaldoWrapper: document.getElementById('card-saldo-wrapper'),
  tabelaDespesasCategoria: document.getElementById('tabela-despesas-categoria'),
  tabelaReceitasCategoria: document.getElementById('tabela-receitas-categoria'),
  tabelaCorpo: document.getElementById('tabela-corpo'),
};

async function carregarAnos() {
  const anos = await api.dashboard.anos();
  const anoAtual = String(new Date().getFullYear());
  const opcoes = anos.length ? anos : [anoAtual];

  el.seletorAno.innerHTML = opcoes.map((a) => `<option value="${a}">${a}</option>`).join('');
  el.seletorAno.value = opcoes.includes(anoAtual) ? anoAtual : opcoes[0];
}

function preencherTabelaCategoria(elemento, dados) {
  if (!dados.length) {
    elemento.innerHTML = '<tr><td colspan="2" class="sem-dados">Sem lançamentos.</td></tr>';
    return;
  }
  elemento.innerHTML = dados
    .map((d) => `<tr><td>${d.categoria}</td><td>${formatoMoeda.format(d.valor)}</td></tr>`)
    .join('');
}

async function carregarRelatorio() {
  const ano = el.seletorAno.value;
  const mes = el.seletorMes.value;
  const dados = await api.dashboard.mensal(ano, mes);

  el.cardReceita.textContent = formatoMoeda.format(dados.total_receitas);
  el.cardDespesa.textContent = formatoMoeda.format(dados.total_despesas);
  el.cardSaldo.textContent = formatoMoeda.format(dados.saldo);
  el.cardSaldoLabel.textContent = dados.saldo < 0 ? 'Prejuízo do mês' : 'Lucro do mês';
  el.cardSaldoWrapper.classList.toggle('card-negativo', dados.saldo < 0);

  preencherTabelaCategoria(el.tabelaDespesasCategoria, dados.despesas_por_categoria);
  preencherTabelaCategoria(el.tabelaReceitasCategoria, dados.receitas_por_categoria);

  if (!dados.lancamentos.length) {
    el.tabelaCorpo.innerHTML = '<tr><td colspan="7" class="vazio">Nenhum lançamento neste período.</td></tr>';
    return;
  }

  el.tabelaCorpo.innerHTML = dados.lancamentos
    .map((l) => {
      const badgeTipo = `<span class="badge badge-${l.tipo}">${l.tipo === 'receita' ? 'Receita' : 'Despesa'}</span>`;
      const valorClasse = l.tipo === 'receita' ? 'valor-receita' : 'valor-despesa';
      const sinal = l.tipo === 'receita' ? '+' : '-';

      return `
        <tr>
          <td>${formatoData(l.data)}</td>
          <td>${badgeTipo}</td>
          <td>${l.categoria_nome}</td>
          <td>${l.subcategoria || ''}</td>
          <td class="col-valor">${l.quantidade ?? ''}</td>
          <td>${l.descricao || ''}</td>
          <td class="col-valor ${valorClasse}">${sinal} ${formatoMoeda.format(l.valor)}</td>
        </tr>`;
    })
    .join('');
}

async function iniciar() {
  await carregarAnos();
  el.seletorMes.value = String(new Date().getMonth() + 1).padStart(2, '0');

  el.seletorAno.addEventListener('change', carregarRelatorio);
  el.seletorMes.addEventListener('change', carregarRelatorio);

  await carregarRelatorio();
}

iniciar();
