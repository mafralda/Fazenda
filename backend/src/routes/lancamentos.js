const express = require('express');
const db = require('../db');
const {
  ORDEM_CATEGORIAS,
  ErroNegocio,
  executar,
  dataISOValida,
  inteiroPositivo,
  exigirAnoPlausivel,
  aplicarAjuste,
  avisosDeSaldo,
} = require('../rebanho-core');

const router = express.Router();

const SELECT_COM_CATEGORIA = `
  SELECT l.*, c.nome as categoria_nome, rl.especie as animal_especie
  FROM lancamentos l
  JOIN categorias c ON c.id = l.categoria_id
  LEFT JOIN rebanho_lancamentos rl ON rl.lancamento_id = l.id
`;

// Venda e compra de animais mexem no rebanho quando o lançamento informa a espécie
// (`animal_especie`) e usa a `subcategoria` como categoria do animal (ex.: "Ovelha").
// Sem espécie o lançamento é só financeiro — é o caso dos lançamentos antigos, que
// NÃO são reaplicados: as planilhas de rebanho importadas já contêm essas vendas.
const MOVIMENTOS = {
  venda: { categoria: 'Venda de animais', tipo: 'receita', campo: 'vendas' },
  compra: { categoria: 'Compra de animais', tipo: 'despesa', campo: 'compras' },
};

function movimentoDaCategoria(nome) {
  return Object.keys(MOVIMENTOS).find((m) => MOVIMENTOS[m].categoria === nome) ?? null;
}

// Valida a parte "rebanho" do lançamento. Devolve null se ele não mexe no rebanho.
function lerVinculoRebanho({ categoriaNome, tipo, animalEspecie, subcategoria, quantidade, data }) {
  if (!animalEspecie) return null;

  const movimento = movimentoDaCategoria(categoriaNome);
  if (!movimento) {
    throw new ErroNegocio(
      'animal_especie só vale para as categorias "Venda de animais" e "Compra de animais" ' +
        '(para trocar de categoria, envie animal_especie: null e o ajuste no rebanho é desfeito)'
    );
  }
  const regra = MOVIMENTOS[movimento];
  if (tipo !== regra.tipo) throw new ErroNegocio(`"${regra.categoria}" deve ser do tipo "${regra.tipo}"`);
  if (!Object.hasOwn(ORDEM_CATEGORIAS, animalEspecie)) {
    throw new ErroNegocio('animal_especie deve ser "bovino" ou "ovino"');
  }
  if (!ORDEM_CATEGORIAS[animalEspecie].includes(subcategoria)) {
    throw new ErroNegocio(
      `subcategoria deve ser uma categoria de ${animalEspecie}: ${ORDEM_CATEGORIAS[animalEspecie].join(', ')}`
    );
  }
  const qtd = inteiroPositivo(quantidade);
  if (qtd === null) {
    throw new ErroNegocio('quantidade deve ser um número inteiro maior que zero para alterar o rebanho');
  }
  if (!dataISOValida(data)) throw new ErroNegocio('data deve ser uma data válida no formato AAAA-MM-DD');
  exigirAnoPlausivel(Number(data.slice(0, 4)), 'ano da data');

  return { movimento, campo: regra.campo, especie: animalEspecie, categoria: subcategoria, quantidade: qtd, data };
}

function aplicarVinculo(lancamentoId, v) {
  const [ano, mes] = v.data.split('-').map(Number);
  aplicarAjuste(v.especie, v.categoria, ano, mes, v.campo, v.quantidade);
  db.prepare(
    `INSERT INTO rebanho_lancamentos (lancamento_id, especie, categoria, quantidade, movimento, data)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(lancamentoId, v.especie, v.categoria, v.quantidade, v.movimento, v.data);
}

// Desfaz no rebanho o que o vínculo do lançamento aplicou (usa o que foi gravado,
// não o estado atual do lançamento). Sem vínculo, não faz nada.
function reverterVinculo(lancamentoId) {
  const atual = db.prepare('SELECT * FROM rebanho_lancamentos WHERE lancamento_id = ?').get(lancamentoId);
  if (!atual) return;
  const [ano, mes] = atual.data.split('-').map(Number);
  aplicarAjuste(atual.especie, atual.categoria, ano, mes, MOVIMENTOS[atual.movimento].campo, -atual.quantidade);
  db.prepare('DELETE FROM rebanho_lancamentos WHERE lancamento_id = ?').run(lancamentoId);
}

// Avisos de saldo negativo nas categorias tocadas pelos vínculos (não bloqueiam o lançamento:
// o registro financeiro vale mesmo que o rebanho cadastrado esteja desatualizado).
function avisosDosVinculos(vinculos) {
  const avisos = vinculos
    .filter(Boolean)
    .flatMap((v) => avisosDeSaldo(v.especie, [v.categoria], [v.data]));
  return [...new Set(avisos)];
}

function aplicarFiltros(query, params, filtros) {
  const condicoes = [];

  if (filtros.data_inicio) {
    condicoes.push('l.data >= ?');
    params.push(filtros.data_inicio);
  }
  if (filtros.data_fim) {
    condicoes.push('l.data <= ?');
    params.push(filtros.data_fim);
  }
  if (filtros.tipo) {
    condicoes.push('l.tipo = ?');
    params.push(filtros.tipo);
  }
  if (filtros.categoria_id) {
    condicoes.push('l.categoria_id = ?');
    params.push(filtros.categoria_id);
  }
  if (filtros.subcategoria) {
    condicoes.push('l.subcategoria = ?');
    params.push(filtros.subcategoria);
  }

  if (condicoes.length) {
    query += ' WHERE ' + condicoes.join(' AND ');
  }

  return query;
}

router.get('/', (req, res) => {
  const params = [];
  let query = aplicarFiltros(SELECT_COM_CATEGORIA, params, req.query);
  query += ' ORDER BY l.data DESC, l.id DESC';

  res.json(db.prepare(query).all(...params));
});

router.get('/subcategorias', (req, res) => {
  const linhas = db
    .prepare(
      "SELECT DISTINCT subcategoria FROM lancamentos WHERE subcategoria IS NOT NULL AND subcategoria != '' ORDER BY subcategoria"
    )
    .all();
  res.json(linhas.map((l) => l.subcategoria));
});

router.get('/resumo', (req, res) => {
  const params = [];
  let query = aplicarFiltros('SELECT * FROM lancamentos l', params, req.query);
  const linhas = db.prepare(query).all(...params);

  const resumo = linhas.reduce(
    (acc, l) => {
      if (l.tipo === 'receita') {
        acc.total_receitas += l.valor;
      } else {
        acc.total_despesas += l.valor;
      }
      return acc;
    },
    { total_receitas: 0, total_despesas: 0 }
  );

  resumo.saldo = resumo.total_receitas - resumo.total_despesas;

  res.json(resumo);
});

router.post('/', (req, res) => {
  const {
    tipo, categoria_id, descricao, subcategoria, quantidade, valor, data, forma_pagamento, observacoes, animal_especie,
  } = req.body;

  if (!tipo || !categoria_id || !valor || !data) {
    return res.status(400).json({ erro: 'tipo, categoria_id, valor e data são obrigatórios' });
  }
  if (!['receita', 'despesa'].includes(tipo)) {
    return res.status(400).json({ erro: 'tipo deve ser "receita" ou "despesa"' });
  }
  const categoria = db.prepare('SELECT nome FROM categorias WHERE id = ?').get(categoria_id);
  if (!categoria) return res.status(400).json({ erro: 'categoria_id não existe' });

  executar(res, () => {
    const vinculo = lerVinculoRebanho({
      categoriaNome: categoria.nome, tipo, animalEspecie: animal_especie, subcategoria, quantidade, data,
    });

    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO lancamentos
            (tipo, categoria_id, descricao, subcategoria, quantidade, valor, data, forma_pagamento, observacoes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          tipo,
          categoria_id,
          descricao || null,
          subcategoria || null,
          quantidade || null,
          valor,
          data,
          forma_pagamento || null,
          observacoes || null
        );
      if (vinculo) aplicarVinculo(info.lastInsertRowid, vinculo);
      return info.lastInsertRowid;
    })();

    res.status(201).json({
      ...db.prepare(`${SELECT_COM_CATEGORIA} WHERE l.id = ?`).get(id),
      avisos: avisosDosVinculos([vinculo]),
    });
  });
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const existente = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'lançamento não encontrado' });
  const vinculoAtual = db.prepare('SELECT * FROM rebanho_lancamentos WHERE lancamento_id = ?').get(id);

  const campos = {
    tipo: req.body.tipo ?? existente.tipo,
    categoria_id: req.body.categoria_id ?? existente.categoria_id,
    descricao: req.body.descricao !== undefined ? req.body.descricao : existente.descricao,
    subcategoria: req.body.subcategoria !== undefined ? req.body.subcategoria : existente.subcategoria,
    quantidade: req.body.quantidade !== undefined ? req.body.quantidade : existente.quantidade,
    valor: req.body.valor ?? existente.valor,
    data: req.body.data ?? existente.data,
    forma_pagamento: req.body.forma_pagamento !== undefined ? req.body.forma_pagamento : existente.forma_pagamento,
    observacoes: req.body.observacoes !== undefined ? req.body.observacoes : existente.observacoes,
  };
  // Omitir animal_especie mantém o vínculo atual; mandar null/'' desfaz o ajuste no rebanho.
  const animalEspecie = req.body.animal_especie !== undefined ? req.body.animal_especie : vinculoAtual?.especie;

  const categoria = db.prepare('SELECT nome FROM categorias WHERE id = ?').get(campos.categoria_id);
  if (!categoria) return res.status(400).json({ erro: 'categoria_id não existe' });

  executar(res, () => {
    const novoVinculo = lerVinculoRebanho({
      categoriaNome: categoria.nome,
      tipo: campos.tipo,
      animalEspecie,
      subcategoria: campos.subcategoria,
      quantidade: campos.quantidade,
      data: campos.data,
    });

    db.transaction(() => {
      reverterVinculo(id);
      db.prepare(
        `UPDATE lancamentos SET
          tipo = ?, categoria_id = ?, descricao = ?, subcategoria = ?, quantidade = ?,
          valor = ?, data = ?, forma_pagamento = ?, observacoes = ?, atualizado_em = datetime('now')
         WHERE id = ?`
      ).run(
        campos.tipo,
        campos.categoria_id,
        campos.descricao,
        campos.subcategoria,
        campos.quantidade,
        campos.valor,
        campos.data,
        campos.forma_pagamento,
        campos.observacoes,
        id
      );
      if (novoVinculo) aplicarVinculo(Number(id), novoVinculo);
    })();

    res.json({
      ...db.prepare(`${SELECT_COM_CATEGORIA} WHERE l.id = ?`).get(id),
      avisos: avisosDosVinculos([vinculoAtual, novoVinculo]),
    });
  });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existente = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'lançamento não encontrado' });

  const vinculo = db.prepare('SELECT * FROM rebanho_lancamentos WHERE lancamento_id = ?').get(id);

  db.transaction(() => {
    reverterVinculo(id);
    db.prepare('DELETE FROM lancamentos WHERE id = ?').run(id);
  })();
  // desfazer uma compra pode deixar o rebanho negativo (os animais já foram vendidos/morreram)
  res.json({ ok: true, avisos: avisosDosVinculos([vinculo]) });
});

module.exports = router;
