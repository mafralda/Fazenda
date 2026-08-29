const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatoData = (isoDate) => {
  const [ano, mes, dia] = isoDate.split('-');
  return `${dia}/${mes}/${ano}`;
};

const el = {
  seletorAno: document.getElementById('filtro-ano'),
  btnAnoAtual: document.getElementById('btn-ano-atual'),
  btnTodosAnos: document.getElementById('btn-todos-anos'),

  filtroDataInicio: document.getElementById('filtro-data-inicio'),
  filtroDataFim: document.getElementById('filtro-data-fim'),
  filtroTipo: document.getElementById('filtro-tipo'),
  filtroCategoria: document.getElementById('filtro-categoria'),
  filtroSubcategoria: document.getElementById('filtro-subcategoria'),
  btnLimparFiltros: document.getElementById('btn-limpar-filtros'),

  cardReceita: document.getElementById('card-receita'),
  cardDespesa: document.getElementById('card-despesa'),
  cardSaldo: document.getElementById('card-saldo'),
  cardSaldoLabel: document.getElementById('card-saldo-label'),
  cardSaldoWrapper: document.getElementById('card-saldo-wrapper'),

  tabelaCorpo: document.getElementById('tabela-corpo'),

  btnNovoLancamento: document.getElementById('btn-novo-lancamento'),
};

function coletarFiltros() {
  const filtros = {};
  if (el.filtroDataInicio.value) filtros.data_inicio = el.filtroDataInicio.value;
  if (el.filtroDataFim.value) filtros.data_fim = el.filtroDataFim.value;
  if (el.filtroTipo.value) filtros.tipo = el.filtroTipo.value;
  if (el.filtroCategoria.value) filtros.categoria_id = el.filtroCategoria.value;
  if (el.filtroSubcategoria.value) filtros.subcategoria = el.filtroSubcategoria.value;
  return filtros;
}

// ---------- Filtro rápido de ano ----------

async function carregarSeletorAno() {
  const anos = await api.dashboard.anos();
  const anoAtual = String(new Date().getFullYear());

  el.seletorAno.innerHTML =
    '<option value="">Todos os anos</option>' +
    anos.map((a) => `<option value="${a}">${a}</option>`).join('');

  el.seletorAno.value = anos.includes(anoAtual) ? anoAtual : '';
}

function aplicarFiltroAno(ano) {
  if (ano) {
    el.filtroDataInicio.value = `${ano}-01-01`;
    el.filtroDataFim.value = `${ano}-12-31`;
  } else {
    el.filtroDataInicio.value = '';
    el.filtroDataFim.value = '';
  }
  atualizarTudo();
}

// ---------- Categorias / subcategorias (filtros da listagem) ----------

let categoriasCache = [];

async function carregarCategorias() {
  categoriasCache = await api.categorias.listar();

  el.filtroCategoria.innerHTML = '<option value="">Todas</option>';
  categoriasCache.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nome;
    el.filtroCategoria.appendChild(opt);
  });
}

async function carregarSubcategorias() {
  const subcategorias = await api.lancamentos.subcategorias();
  const valorAtual = el.filtroSubcategoria.value;

  el.filtroSubcategoria.innerHTML = '<option value="">Todas</option>';
  subcategorias.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    el.filtroSubcategoria.appendChild(opt);
  });

  if (subcategorias.includes(valorAtual)) el.filtroSubcategoria.value = valorAtual;
}

// ---------- Resumo / tabela ----------

async function carregarResumo() {
  const resumo = await api.lancamentos.resumo(coletarFiltros());
  el.cardReceita.textContent = formatoMoeda.format(resumo.total_receitas);
  el.cardDespesa.textContent = formatoMoeda.format(resumo.total_despesas);
  el.cardSaldo.textContent = formatoMoeda.format(resumo.saldo);
  el.cardSaldoLabel.textContent = resumo.saldo < 0 ? 'Prejuízo' : 'Lucro';
  el.cardSaldoWrapper.classList.toggle('card-negativo', resumo.saldo < 0);
}

async function carregarTabela() {
  const lancamentos = await api.lancamentos.listar(coletarFiltros());

  if (lancamentos.length === 0) {
    el.tabelaCorpo.innerHTML = '<tr><td colspan="8" class="vazio">Nenhum lançamento encontrado.</td></tr>';
    return;
  }

  el.tabelaCorpo.innerHTML = lancamentos
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
          <td class="col-acoes">
            <button class="link-acao" data-editar="${l.id}">Editar</button>
            <button class="link-acao excluir" data-excluir="${l.id}">Excluir</button>
          </td>
        </tr>`;
    })
    .join('');
}

async function atualizarTudo() {
  await Promise.all([carregarResumo(), carregarTabela(), carregarSubcategorias()]);
}

async function excluirLancamento(id) {
  if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
  await api.lancamentos.excluir(id);
  await atualizarTudo();
}

async function editarLancamento(id) {
  const lancamentos = await api.lancamentos.listar(coletarFiltros());
  const lancamento = lancamentos.find((l) => String(l.id) === String(id));
  if (lancamento) NovoLancamentoModal.abrir(lancamento);
}

function ligarEventos() {
  el.btnNovoLancamento.addEventListener('click', () => NovoLancamentoModal.abrir());

  el.btnAnoAtual.addEventListener('click', () => {
    const anoAtual = String(new Date().getFullYear());
    el.seletorAno.value = el.seletorAno.querySelector(`option[value="${anoAtual}"]`) ? anoAtual : '';
    aplicarFiltroAno(el.seletorAno.value);
  });

  el.btnTodosAnos.addEventListener('click', () => {
    el.seletorAno.value = '';
    aplicarFiltroAno('');
  });

  el.seletorAno.addEventListener('change', () => aplicarFiltroAno(el.seletorAno.value));

  el.tabelaCorpo.addEventListener('click', (evento) => {
    const idEditar = evento.target.dataset.editar;
    const idExcluir = evento.target.dataset.excluir;
    if (idEditar) editarLancamento(idEditar);
    if (idExcluir) excluirLancamento(idExcluir);
  });

  [el.filtroDataInicio, el.filtroDataFim, el.filtroTipo, el.filtroCategoria, el.filtroSubcategoria].forEach(
    (campo) => campo.addEventListener('change', atualizarTudo)
  );

  el.btnLimparFiltros.addEventListener('click', () => {
    el.filtroDataInicio.value = '';
    el.filtroDataFim.value = '';
    el.filtroTipo.value = '';
    el.filtroCategoria.value = '';
    el.filtroSubcategoria.value = '';
    el.seletorAno.value = '';
    atualizarTudo();
  });
}

async function iniciar() {
  ligarEventos();
  NovoLancamentoModal.aoSalvar = atualizarTudo;

  await carregarCategorias();
  await carregarSeletorAno();
  aplicarFiltroAno(el.seletorAno.value); // já dispara atualizarTudo() com o ano atual
}

iniciar();
