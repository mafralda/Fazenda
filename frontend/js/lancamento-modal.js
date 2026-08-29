// Modal de "Novo lançamento / Editar lançamento", compartilhado entre as páginas
// (Lançamentos e Dashboard). Injeta o próprio HTML no <body> e expõe
// `NovoLancamentoModal.abrir(lancamento?)`. Defina `NovoLancamentoModal.aoSalvar`
// para ser avisado quando um lançamento for criado/editado com sucesso.

const NovoLancamentoModal = {
  aoSalvar: null,
};

(function inicializarModal() {
  const HTML = `
    <dialog id="modal-lancamento">
      <form id="form-lancamento" method="dialog">
        <h2 id="modal-titulo">Novo lançamento</h2>
        <input type="hidden" id="lancamento-id" />

        <label>
          Tipo
          <select id="campo-tipo" required>
            <option value="receita">Receita</option>
            <option value="despesa">Despesa</option>
          </select>
        </label>

        <label>
          Categoria
          <select id="campo-categoria" required></select>
        </label>

        <label>
          Descrição
          <input type="text" id="campo-descricao" placeholder="Ex: compra de ração para o rebanho" />
        </label>

        <div class="campo-linha">
          <label>
            Subcategoria <span class="opcional">(opcional)</span>
            <input type="text" id="campo-subcategoria" list="lista-subcategorias" placeholder="Ex: Ovelha, Borrego, Carneiro..." />
            <datalist id="lista-subcategorias"></datalist>
          </label>

          <label>
            Quantidade <span class="opcional">(opcional)</span>
            <input type="number" id="campo-quantidade" step="0.01" min="0" placeholder="Ex: 9" />
          </label>
        </div>

        <label>
          Valor (R$)
          <input type="number" id="campo-valor" step="0.01" min="0" required />
        </label>

        <label>
          Data
          <input type="date" id="campo-data" required />
        </label>

        <label>
          Forma de pagamento
          <input type="text" id="campo-forma-pagamento" placeholder="Ex: PIX, dinheiro, boleto" />
        </label>

        <label>
          Observações
          <textarea id="campo-observacoes" rows="2"></textarea>
        </label>

        <div class="modal-acoes">
          <button type="button" id="btn-cancelar" class="btn btn-secundario">Cancelar</button>
          <button type="submit" id="btn-salvar" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    </dialog>
  `;

  document.body.insertAdjacentHTML('beforeend', HTML);

  const el = {
    modal: document.getElementById('modal-lancamento'),
    form: document.getElementById('form-lancamento'),
    modalTitulo: document.getElementById('modal-titulo'),
    btnCancelar: document.getElementById('btn-cancelar'),

    campoId: document.getElementById('lancamento-id'),
    campoTipo: document.getElementById('campo-tipo'),
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

  let categoriasCache = [];

  async function carregarCategorias() {
    categoriasCache = await api.categorias.listar();
  }

  async function carregarSubcategorias() {
    const subcategorias = await api.lancamentos.subcategorias();
    el.listaSubcategorias.innerHTML = '';
    subcategorias.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      el.listaSubcategorias.appendChild(opt);
    });
  }

  function preencherCategoriasDoFormulario() {
    const tipoSelecionado = el.campoTipo.value;
    const categoriasFiltradas = categoriasCache.filter((c) => c.tipo === tipoSelecionado);

    el.campoCategoria.innerHTML = '';
    categoriasFiltradas.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome;
      el.campoCategoria.appendChild(opt);
    });
  }

  async function abrir(lancamento = null) {
    if (categoriasCache.length === 0) await carregarCategorias();
    await carregarSubcategorias();

    el.form.reset();
    preencherCategoriasDoFormulario();

    if (lancamento) {
      el.modalTitulo.textContent = 'Editar lançamento';
      el.campoId.value = lancamento.id;
      el.campoTipo.value = lancamento.tipo;
      preencherCategoriasDoFormulario();
      el.campoCategoria.value = lancamento.categoria_id;
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

  function fechar() {
    el.modal.close();
  }

  async function salvar(evento) {
    evento.preventDefault();

    const dados = {
      tipo: el.campoTipo.value,
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
      fechar();
      if (typeof NovoLancamentoModal.aoSalvar === 'function') {
        await NovoLancamentoModal.aoSalvar();
      }
    } catch (erro) {
      alert(erro.message);
    }
  }

  el.btnCancelar.addEventListener('click', fechar);
  el.form.addEventListener('submit', salvar);
  el.campoTipo.addEventListener('change', preencherCategoriasDoFormulario);

  NovoLancamentoModal.abrir = abrir;
  NovoLancamentoModal.fechar = fechar;
})();
