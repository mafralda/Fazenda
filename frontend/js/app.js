const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatoData = (isoDate) => {
  const [ano, mes, dia] = isoDate.split('-');
  return `${dia}/${mes}/${ano}`;
};

let categoriasCache = [];

const el = {
  filtroDataInicio: document.getElementById('filtro-data-inicio'),
  filtroDataFim: document.getElementById('filtro-data-fim'),
  filtroTipo: document.getElementById('filtro-tipo'),
  filtroClassificacao: document.getElementById('filtro-classificacao'),
  filtroCategoria: document.getElementById('filtro-categoria'),
  filtroSubcategoria: document.getElementById('filtro-subcategoria'),
  btnLimparFiltros: document.getElementById('btn-limpar-filtros'),

  cardReceita: document.getElementById('card-receita'),
  cardDespesa: document.getElementById('card-despesa'),
  cardSaldo: document.getElementById('card-saldo'),
  cardCapex: document.getElementById('card-capex'),
  cardOpex: document.getElementById('card-opex'),

  tabelaCorpo: document.getElementById('tabela-corpo'),

  btnNovoLancamento: document.getElementById('btn-novo-lancamento'),
  modal: document.getElementById('modal-lancamento'),
  form: document.getElementById('form-lancamento'),
  modalTitulo: document.getElementById('modal-titulo'),
  btnCancelar: document.getElementById('btn-cancelar'),

  campoId: document.getElementById('lancamento-id'),
  campoTipo: document.getElementById('campo-tipo'),
  grupoClassificacao: document.getElementById('grupo-classificacao'),
  campoClassificacao: document.getElementById('campo-classificacao'),
  campoCategoria: document.getElementById('campo-categoria'),
  campoDescricao: document.getElementById('campo-descricao'),
  campoSubcategoria: document.getElementById('campo-subcategoria'),
  listaSubcategorias: document.getElementById('lista-subcategorias'),
  campoQuantidade: document.getElementById('campo-quantidade'),
  campoValor: document.getElementById('campo-valor'),
  campoData: document.getElementById('campo-data'),
  campoFormaPagamento: document.getElementById('campo-forma-pagamento'),
  campoObservacoes: document.getElementById('campo-observacoes'),
};

function coletarFiltros() {
  const filtros = {};
  if (el.filtroDataInicio.value) filtros.data_inicio = el.filtroDataInicio.value;
  if (el.filtroDataFim.value) filtros.data_fim = el.filtroDataFim.value;
  if (el.filtroTipo.value) filtros.tipo = el.filtroTipo.value;
  if (el.filtroClassificacao.value) filtros.classificacao = el.filtroClassificacao.value;
  if (el.filtroCategoria.value) filtros.categoria_id = el.filtroCategoria.value;
  if (el.filtroSubcategoria.value) filtros.subcategoria = el.filtroSubcategoria.value;
  return filtros;
}

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
  el.listaSubcategorias.innerHTML = '';

  subcategorias.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    el.filtroSubcategoria.appendChild(opt);

    const optDatalist = document.createElement('option');
    optDatalist.value = s;
    el.listaSubcategorias.appendChild(optDatalist);
  });

  if (subcategorias.includes(valorAtual)) el.filtroSubcategoria.value = valorAtual;
}

function preencherCategoriasDoFormulario() {
  const tipoSelecionado = el.campoTipo.value;
  const categoriasFiltradas = categoriasCache.filter((c) => c.tipo === tipoSelecionado);

  el.campoCategoria.innerHTML = '';
  categoriasFiltradas.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nome;
    opt.dataset.classificacaoPadrao = c.classificacao_padrao || '';
    el.campoCategoria.appendChild(opt);
  });

  el.grupoClassificacao.style.display = tipoSelecionado === 'despesa' ? 'flex' : 'none';
  aplicarClassificacaoPadraoSugerida();
}

function aplicarClassificacaoPadraoSugerida() {
  if (el.campoTipo.value !== 'despesa') {
    el.campoClassificacao.value = '';
    return;
  }
  const opcaoSelecionada = el.campoCategoria.selectedOptions[0];
  const padrao = opcaoSelecionada?.dataset.classificacaoPadrao || '';
  el.campoClassificacao.value = padrao;
}

async function carregarResumo() {
  const resumo = await api.lancamentos.resumo(coletarFiltros());
  el.cardReceita.textContent = formatoMoeda.format(resumo.total_receitas);
  el.cardDespesa.textContent = formatoMoeda.format(resumo.total_despesas);
  el.cardSaldo.textContent = formatoMoeda.format(resumo.saldo);
  el.cardCapex.textContent = formatoMoeda.format(resumo.total_capex);
  el.cardOpex.textContent = formatoMoeda.format(resumo.total_opex);
}

async function carregarTabela() {
  const lancamentos = await api.lancamentos.listar(coletarFiltros());

  if (lancamentos.length === 0) {
    el.tabelaCorpo.innerHTML = '<tr><td colspan="9" class="vazio">Nenhum lançamento encontrado.</td></tr>';
    return;
  }

  el.tabelaCorpo.innerHTML = lancamentos
    .map((l) => {
      const badgeTipo = `<span class="badge badge-${l.tipo}">${l.tipo === 'receita' ? 'Receita' : 'Despesa'}</span>`;
      const badgeClassificacao = l.classificacao
        ? `<span class="badge badge-${l.classificacao}">${l.classificacao.toUpperCase()}</span>`
        : '—';
      const valorClasse = l.tipo === 'receita' ? 'valor-receita' : 'valor-despesa';
      const sinal = l.tipo === 'receita' ? '+' : '-';

      return `
        <tr>
          <td>${formatoData(l.data)}</td>
          <td>${badgeTipo}</td>
          <td>${badgeClassificacao}</td>
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

function abrirModal(lancamento = null) {
  el.form.reset();
  preencherCategoriasDoFormulario();

  if (lancamento) {
    el.modalTitulo.textContent = 'Editar lançamento';
    el.campoId.value = lancamento.id;
    el.campoTipo.value = lancamento.tipo;
    preencherCategoriasDoFormulario();
    el.campoCategoria.value = lancamento.categoria_id;
    el.campoClassificacao.value = lancamento.classificacao || '';
    el.campoDescricao.value = lancamento.descricao || '';
    el.campoSubcategoria.value = lancamento.subcategoria || '';
    el.campoQuantidade.value = lancamento.quantidade ?? '';
    el.campoValor.value = lancamento.valor;
    el.campoData.value = lancamento.data;
    el.campoFormaPagamento.value = lancamento.forma_pagamento || '';
    el.campoObservacoes.value = lancamento.observacoes || '';
  } else {
    el.modalTitulo.textContent = 'Novo lançamento';
    el.campoId.value = '';
    el.campoData.value = new Date().toISOString().slice(0, 10);
  }

  el.modal.showModal();
}

function fecharModal() {
  el.modal.close();
}

async function salvarLancamento(evento) {
  evento.preventDefault();

  const dados = {
    tipo: el.campoTipo.value,
    classificacao: el.campoTipo.value === 'despesa' ? el.campoClassificacao.value || null : null,
    categoria_id: Number(el.campoCategoria.value),
    descricao: el.campoDescricao.value,
    subcategoria: el.campoSubcategoria.value,
    quantidade: el.campoQuantidade.value ? Number(el.campoQuantidade.value) : null,
    valor: Number(el.campoValor.value),
    data: el.campoData.value,
    forma_pagamento: el.campoFormaPagamento.value,
    observacoes: el.campoObservacoes.value,
  };

  const id = el.campoId.value;

  try {
    if (id) {
      await api.lancamentos.atualizar(id, dados);
    } else {
      await api.lancamentos.criar(dados);
    }
    fecharModal();
    await atualizarTudo();
  } catch (erro) {
    alert(erro.message);
  }
}

async function excluirLancamento(id) {
  if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
  await api.lancamentos.excluir(id);
  await atualizarTudo();
}

async function editarLancamento(id) {
  const lancamentos = await api.lancamentos.listar(coletarFiltros());
  const lancamento = lancamentos.find((l) => String(l.id) === String(id));
  if (lancamento) abrirModal(lancamento);
}

function ligarEventos() {
  el.btnNovoLancamento.addEventListener('click', () => abrirModal());
  el.btnCancelar.addEventListener('click', fecharModal);
  el.form.addEventListener('submit', salvarLancamento);
  el.campoTipo.addEventListener('change', preencherCategoriasDoFormulario);
  el.campoCategoria.addEventListener('change', aplicarClassificacaoPadraoSugerida);

  el.tabelaCorpo.addEventListener('click', (evento) => {
    const idEditar = evento.target.dataset.editar;
    const idExcluir = evento.target.dataset.excluir;
    if (idEditar) editarLancamento(idEditar);
    if (idExcluir) excluirLancamento(idExcluir);
  });

  [
    el.filtroDataInicio,
    el.filtroDataFim,
    el.filtroTipo,
    el.filtroClassificacao,
    el.filtroCategoria,
    el.filtroSubcategoria,
  ].forEach((campo) => campo.addEventListener('change', atualizarTudo));

  el.btnLimparFiltros.addEventListener('click', () => {
    el.filtroDataInicio.value = '';
    el.filtroDataFim.value = '';
    el.filtroTipo.value = '';
    el.filtroClassificacao.value = '';
    el.filtroCategoria.value = '';
    el.filtroSubcategoria.value = '';
    atualizarTudo();
  });
}

async function iniciar() {
  ligarEventos();
  await carregarCategorias();
  await atualizarTudo();
}

iniciar();
