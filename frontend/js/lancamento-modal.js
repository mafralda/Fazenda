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

        <label id="bloco-animal-especie" hidden>
          Animais
          <select id="campo-animal-especie">
            <option value="">Selecione…</option>
            <option value="bovino">Bovino (altera o rebanho)</option>
            <option value="ovino">Ovino (altera o rebanho)</option>
            <option value="nenhum">Outro animal (não altera o rebanho)</option>
          </select>
        </label>

        <label id="bloco-animal-categoria" hidden>
          Categoria do animal
          <select id="campo-animal-categoria"></select>
        </label>

        <p id="aviso-rebanho" class="nota-rebanho" hidden></p>

        <label>
          Descrição
          <input type="text" id="campo-descricao" placeholder="Ex: compra de ração para o rebanho" />
        </label>

        <div class="campo-linha">
          <label id="bloco-subcategoria">
            Subcategoria <span class="opcional">(opcional)</span>
            <input type="text" id="campo-subcategoria" list="lista-subcategorias" placeholder="Ex: Ovelha, Borrego, Carneiro..." />
            <datalist id="lista-subcategorias"></datalist>
          </label>

          <label>
            Quantidade <span id="quantidade-opcional" class="opcional">(opcional)</span>
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

    blocoAnimalEspecie: document.getElementById('bloco-animal-especie'),
    campoAnimalEspecie: document.getElementById('campo-animal-especie'),
    blocoAnimalCategoria: document.getElementById('bloco-animal-categoria'),
    campoAnimalCategoria: document.getElementById('campo-animal-categoria'),
    blocoSubcategoria: document.getElementById('bloco-subcategoria'),
    quantidadeOpcional: document.getElementById('quantidade-opcional'),
    avisoRebanho: document.getElementById('aviso-rebanho'),
  };

  // Estas categorias alteram o rebanho quando se informa a espécie do animal.
  const MOVIMENTOS_REBANHO = {
    'Venda de animais': 'venda',
    'Compra de animais': 'compra',
  };
  const ESPECIES_DO_REBANHO = ['bovino', 'ovino'];

  let categoriasCache = [];
  const categoriasAnimalCache = {};

  // AAAA-MM-DD no fuso local: toISOString usa UTC e, à noite, viraria o dia — e agora o
  // mês da data decide em qual mês do rebanho a venda/compra é lançada.
  function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function movimentoSelecionado() {
    const categoria = categoriasCache.find((c) => String(c.id) === el.campoCategoria.value);
    return categoria ? MOVIMENTOS_REBANHO[categoria.nome] ?? null : null;
  }

  async function carregarCategoriasAnimal(especie) {
    if (!categoriasAnimalCache[especie]) {
      categoriasAnimalCache[especie] = await api.rebanho.categorias(especie);
    }
    // o usuário pode ter trocado de espécie enquanto a lista carregava: não sobrescreve
    if (el.campoAnimalEspecie.value !== especie) return;
    el.campoAnimalCategoria.innerHTML = categoriasAnimalCache[especie]
      .map((c) => `<option value="${c}">${c}</option>`)
      .join('');
  }

  // Mostra/oculta os campos de rebanho conforme a categoria e a espécie escolhidas.
  function atualizarBlocoRebanho() {
    const movimento = movimentoSelecionado();
    const afetaRebanho = Boolean(movimento) && ESPECIES_DO_REBANHO.includes(el.campoAnimalEspecie.value);

    el.blocoAnimalEspecie.hidden = !movimento;
    el.campoAnimalEspecie.required = Boolean(movimento);

    el.blocoAnimalCategoria.hidden = !afetaRebanho;
    el.campoAnimalCategoria.required = afetaRebanho;
    el.blocoSubcategoria.hidden = afetaRebanho; // a categoria do animal vira a subcategoria

    // mexer no rebanho exige quantidade inteira
    el.campoQuantidade.required = afetaRebanho;
    el.campoQuantidade.step = afetaRebanho ? '1' : '0.01';
    el.campoQuantidade.min = afetaRebanho ? '1' : '0';
    el.quantidadeOpcional.hidden = afetaRebanho;

    el.avisoRebanho.hidden = !afetaRebanho;
    if (afetaRebanho) {
      el.avisoRebanho.textContent =
        movimento === 'venda'
          ? 'Esta venda será descontada do rebanho no mês da data informada.'
          : 'Esta compra será somada ao rebanho no mês da data informada.';
    }
  }

  async function aoMudarEspecieDoAnimal() {
    const especie = el.campoAnimalEspecie.value;
    if (ESPECIES_DO_REBANHO.includes(especie)) await carregarCategoriasAnimal(especie);
    atualizarBlocoRebanho();
  }

  function aoMudarTipo() {
    preencherCategoriasDoFormulario();
    atualizarBlocoRebanho();
  }

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

      if (lancamento.animal_especie) {
        el.campoAnimalEspecie.value = lancamento.animal_especie;
        await carregarCategoriasAnimal(lancamento.animal_especie);
        el.campoAnimalCategoria.value = lancamento.subcategoria;
      } else if (movimentoSelecionado()) {
        // venda/compra antiga (ou de outro animal): continua sem mexer no rebanho
        el.campoAnimalEspecie.value = 'nenhum';
      }
    } else {
      el.modalTitulo.textContent = 'Novo lançamento';
      el.campoId.value = '';
      el.campoData.value = hojeISO();
    }

    atualizarBlocoRebanho();
    el.modal.showModal();
  }

  function fechar() {
    el.modal.close();
  }

  async function salvar(evento) {
    evento.preventDefault();

    const afetaRebanho =
      Boolean(movimentoSelecionado()) && ESPECIES_DO_REBANHO.includes(el.campoAnimalEspecie.value);

    const dados = {
      tipo: el.campoTipo.value,
      categoria_id: Number(el.campoCategoria.value),
      descricao: el.campoDescricao.value,
      subcategoria: afetaRebanho ? el.campoAnimalCategoria.value : el.campoSubcategoria.value,
      quantidade: el.campoQuantidade.value ? Number(el.campoQuantidade.value) : null,
      valor: Number(el.campoValor.value),
      data: el.campoData.value,
      forma_pagamento: el.campoFormaPagamento.value,
      observacoes: el.campoObservacoes.value,
      // null (e não ausente) desfaz o ajuste no rebanho de um lançamento já vinculado
      animal_especie: afetaRebanho ? el.campoAnimalEspecie.value : null,
    };

    const id = el.campoId.value;

    try {
      const resposta = id
        ? await api.lancamentos.atualizar(id, dados)
        : await api.lancamentos.criar(dados);
      fechar();
      if (typeof NovoLancamentoModal.aoSalvar === 'function') {
        await NovoLancamentoModal.aoSalvar();
      }
      if (resposta?.avisos?.length) alert(`Salvo, mas atenção:\n\n${resposta.avisos.join('\n')}`);
    } catch (erro) {
      alert(erro.message);
    }
  }

  el.btnCancelar.addEventListener('click', fechar);
  el.form.addEventListener('submit', salvar);
  el.campoTipo.addEventListener('change', aoMudarTipo);
  el.campoCategoria.addEventListener('change', atualizarBlocoRebanho);
  el.campoAnimalEspecie.addEventListener('change', aoMudarEspecieDoAnimal);

  NovoLancamentoModal.abrir = abrir;
  NovoLancamentoModal.fechar = fechar;
})();
