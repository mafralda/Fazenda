const express = require('express');
const db = require('../db');

const router = express.Router();

const SELECT_COM_CATEGORIA = `
  SELECT l.*, c.nome as categoria_nome
  FROM lancamentos l
  JOIN categorias c ON c.id = l.categoria_id
`;

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
  const { tipo, categoria_id, descricao, subcategoria, quantidade, valor, data, forma_pagamento, observacoes } =
    req.body;

  if (!tipo || !categoria_id || !valor || !data) {
    return res.status(400).json({ erro: 'tipo, categoria_id, valor e data são obrigatórios' });
  }
  if (!['receita', 'despesa'].includes(tipo)) {
    return res.status(400).json({ erro: 'tipo deve ser "receita" ou "despesa"' });
  }

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

  res.status(201).json(
    db.prepare(`${SELECT_COM_CATEGORIA} WHERE l.id = ?`).get(info.lastInsertRowid)
  );
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const existente = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'lançamento não encontrado' });

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

  res.json(db.prepare(`${SELECT_COM_CATEGORIA} WHERE l.id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existente = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'lançamento não encontrado' });

  db.prepare('DELETE FROM lancamentos WHERE id = ?').run(id);
  res.status(204).send();
});

module.exports = router;
