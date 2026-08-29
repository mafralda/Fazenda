const db = require('./index');

db.exec(`
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  descricao TEXT,
  valor REAL NOT NULL,
  data TEXT NOT NULL,
  forma_pagamento TEXT,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rebanho_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  especie TEXT NOT NULL CHECK (especie IN ('bovino', 'ovino')),
  categoria TEXT NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  saldo_anterior INTEGER NOT NULL DEFAULT 0,
  evolucao INTEGER NOT NULL DEFAULT 0,
  obitos INTEGER NOT NULL DEFAULT 0,
  vendas INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0,
  nascimentos INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  UNIQUE(especie, categoria, ano, mes)
);

CREATE TABLE IF NOT EXISTS rebanho_notas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  especie TEXT NOT NULL CHECK (especie IN ('bovino', 'ovino')),
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  texto TEXT NOT NULL,
  UNIQUE(especie, ano, mes)
);

CREATE TABLE IF NOT EXISTS rebanho_nascimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  especie TEXT NOT NULL CHECK (especie IN ('bovino', 'ovino')),
  categoria TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  data TEXT NOT NULL,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rebanho_transicoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  especie TEXT NOT NULL CHECK (especie IN ('bovino', 'ovino')),
  categoria_origem TEXT NOT NULL,
  categoria_destino TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  nascimento_id INTEGER NOT NULL REFERENCES rebanho_nascimentos(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const count = db.prepare('SELECT COUNT(*) as total FROM categorias').get().total;

if (count === 0) {
  const insert = db.prepare('INSERT INTO categorias (nome, tipo) VALUES (?, ?)');

  const categoriasIniciais = [
    ['Venda de animais', 'receita'],
    ['Outras receitas', 'receita'],
    ['Mão de obra', 'despesa'],
    ['Salário', 'despesa'],
    ['Insumos', 'despesa'],
    ['Ração', 'despesa'],
    ['Manutenção', 'despesa'],
    ['Combustível', 'despesa'],
    ['Medicamentos', 'despesa'],
    ['Maquinário / Equipamentos', 'despesa'],
    ['Benfeitorias / Construções', 'despesa'],
    ['Outras despesas', 'despesa'],
  ];

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(...row);
  });

  insertMany(categoriasIniciais);
  console.log('Categorias iniciais criadas.');
}

// Remove os campos de CAPEX/OPEX de bancos criados antes dessa mudança.
const colunasCategorias = db.prepare('PRAGMA table_info(categorias)').all();
if (colunasCategorias.some((c) => c.name === 'classificacao_padrao')) {
  db.exec('ALTER TABLE categorias DROP COLUMN classificacao_padrao');
  console.log('Coluna classificacao_padrao removida de categorias.');
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

if (colunasLancamentos.some((c) => c.name === 'classificacao')) {
  db.exec('ALTER TABLE lancamentos DROP COLUMN classificacao');
  console.log('Coluna classificacao removida de lancamentos.');
}

module.exports = db;
