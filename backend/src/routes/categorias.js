const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { tipo } = req.query;
  let query = 'SELECT * FROM categorias WHERE ativo = 1';
  const params = [];

  if (tipo) {
    query += ' AND tipo = ?';
    params.push(tipo);
  }

  query += ' ORDER BY nome';
  res.json(db.prepare(query).all(...params));
});

router.post('/', (req, res) => {
  const { nome, tipo, classificacao_padrao } = req.body;

  if (!nome || !tipo) {
    return res.status(400).json({ erro: 'nome e tipo são obrigatórios' });
  }
  if (!['receita', 'despesa'].includes(tipo)) {
    return res.status(400).json({ erro: 'tipo deve ser "receita" ou "despesa"' });
  }
  if (classificacao_padrao && !['capex', 'opex'].includes(classificacao_padrao)) {
    return res.status(400).json({ erro: 'classificacao_padrao deve ser "capex" ou "opex"' });
  }

  const info = db
    .prepare('INSERT INTO categorias (nome, tipo, classificacao_padrao) VALUES (?, ?, ?)')
    .run(nome, tipo, classificacao_padrao || null);

  res.status(201).json(db.prepare('SELECT * FROM categorias WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const existente = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'categoria não encontrada' });

  const nome = req.body.nome ?? existente.nome;
  const classificacao_padrao =
    req.body.classificacao_padrao !== undefined
      ? req.body.classificacao_padrao
      : existente.classificacao_padrao;

  db.prepare('UPDATE categorias SET nome = ?, classificacao_padrao = ? WHERE id = ?').run(
    nome,
    classificacao_padrao,
    id
  );

  res.json(db.prepare('SELECT * FROM categorias WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existente = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'categoria não encontrada' });

  db.prepare('UPDATE categorias SET ativo = 0 WHERE id = ?').run(id);
  res.status(204).send();
});

module.exports = router;
