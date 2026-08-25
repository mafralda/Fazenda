const db = require('./index');

db.exec(`
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  classificacao_padrao TEXT CHECK (classificacao_padrao IN ('capex', 'opex') OR classificacao_padrao IS NULL),
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  classificacao TEXT CHECK (classificacao IN ('capex', 'opex') OR classificacao IS NULL),
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  descricao TEXT,
  valor REAL NOT NULL,
  data TEXT NOT NULL,
  forma_pagamento TEXT,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const count = db.prepare('SELECT COUNT(*) as total FROM categorias').get().total;

if (count === 0) {
  const insert = db.prepare(
    'INSERT INTO categorias (nome, tipo, classificacao_padrao) VALUES (?, ?, ?)'
  );

  const categoriasIniciais = [
    ['Venda de animais', 'receita', null],
    ['Outras receitas', 'receita', null],
    ['Mão de obra', 'despesa', 'opex'],
    ['Salário', 'despesa', 'opex'],
    ['Insumos', 'despesa', 'opex'],
    ['Ração', 'despesa', 'opex'],
    ['Manutenção', 'despesa', 'opex'],
    ['Combustível', 'despesa', 'opex'],
    ['Medicamentos', 'despesa', 'opex'],
    ['Maquinário / Equipamentos', 'despesa', 'capex'],
    ['Benfeitorias / Construções', 'despesa', 'capex'],
    ['Outras despesas', 'despesa', null],
  ];

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(...row);
  });

  insertMany(categoriasIniciais);
  console.log('Categorias iniciais criadas.');
}

const colunasLancamentos = db.prepare('PRAGMA table_info(lancamentos)').all();
const temSubcategoria = colunasLancamentos.some((c) => c.name === 'subcategoria');

if (!temSubcategoria) {
  db.exec('ALTER TABLE lancamentos ADD COLUMN subcategoria TEXT');
  console.log('Coluna subcategoria adicionada em lancamentos.');
}

const temQuantidade = colunasLancamentos.some((c) => c.name === 'quantidade');

if (!temQuantidade) {
  db.exec('ALTER TABLE lancamentos ADD COLUMN quantidade REAL');
  console.log('Coluna quantidade adicionada em lancamentos.');
}

module.exports = db;
