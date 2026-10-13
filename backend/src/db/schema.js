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
  compras INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS rebanho_obitos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  especie TEXT NOT NULL CHECK (especie IN ('bovino', 'ovino')),
  categoria TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  data TEXT NOT NULL,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vínculo entre um lançamento de venda/compra de animais e o ajuste que ele fez
-- no rebanho. Guarda o que foi aplicado (e não só o estado atual do lançamento)
-- para editar/excluir o lançamento desfazerem exatamente aquele ajuste.
-- Lançamentos antigos não têm vínculo: as planilhas de rebanho já os contêm.
CREATE TABLE IF NOT EXISTS rebanho_lancamentos (
  lancamento_id INTEGER PRIMARY KEY REFERENCES lancamentos(id),
  especie TEXT NOT NULL CHECK (especie IN ('bovino', 'ovino')),
  categoria TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  movimento TEXT NOT NULL CHECK (movimento IN ('venda', 'compra')),
  data TEXT NOT NULL
);

-- Parição (ovinos): resumo do evento como na planilha. Os números ficam aqui; o efeito
-- no rebanho vem de nascimentos (borregos/borregas vivos) e de um óbito (ovelhas mortas)
-- gravados em rebanho_nascimentos/rebanho_obitos com paricao_id apontando para esta linha.
-- aplicado_no_rebanho = 0 guarda só as estatísticas (ex.: mês que já está nas planilhas).
CREATE TABLE IF NOT EXISTS rebanho_paricoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  especie TEXT NOT NULL DEFAULT 'ovino' CHECK (especie IN ('bovino', 'ovino')),
  data TEXT NOT NULL,
  ovelhas INTEGER NOT NULL DEFAULT 0,
  crias INTEGER NOT NULL DEFAULT 0,
  borregos_vivos INTEGER NOT NULL DEFAULT 0,
  borregas_vivas INTEGER NOT NULL DEFAULT 0,
  partos_duplos INTEGER NOT NULL DEFAULT 0,
  aleijados INTEGER NOT NULL DEFAULT 0,
  natimortos INTEGER NOT NULL DEFAULT 0,
  mortes INTEGER NOT NULL DEFAULT 0,
  total_mortos INTEGER NOT NULL DEFAULT 0,
  ovelhas_mortas INTEGER NOT NULL DEFAULT 0,
  abortos INTEGER NOT NULL DEFAULT 0,
  aplicado_no_rebanho INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT,
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

// Categorias que precisam existir em qualquer banco, inclusive nos que já existiam
// (as categorias iniciais acima só são criadas em banco vazio). "Compra de animais"
// também soma ao rebanho (ver routes/lancamentos.js).
const categoriasGarantidas = [
  ['Compra de animais', 'despesa'],
  ['Sal Proteinado', 'despesa'],
];

for (const [nome, tipo] of categoriasGarantidas) {
  const existe = db.prepare('SELECT 1 FROM categorias WHERE nome = ? AND tipo = ?').get(nome, tipo);
  if (!existe) {
    db.prepare('INSERT INTO categorias (nome, tipo) VALUES (?, ?)').run(nome, tipo);
    console.log(`Categoria "${nome}" criada.`);
  }
}

// Coluna de compras no snapshot do rebanho, para bancos criados antes dela existir.
const colunasSnapshots = db.prepare('PRAGMA table_info(rebanho_snapshots)').all();
if (!colunasSnapshots.some((c) => c.name === 'compras')) {
  db.exec('ALTER TABLE rebanho_snapshots ADD COLUMN compras INTEGER NOT NULL DEFAULT 0');
  console.log('Coluna compras adicionada em rebanho_snapshots.');
}

// Nascimentos e óbitos gerados por uma parição apontam para ela (paricao_id). A coluna é
// adicionada por ALTER tanto em banco novo quanto em existente, para os dois terem o
// mesmo schema. FK sem CASCADE de propósito: a ordem de exclusão é feita no código.
for (const tabela of ['rebanho_nascimentos', 'rebanho_obitos']) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
  if (!colunas.some((c) => c.name === 'paricao_id')) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN paricao_id INTEGER REFERENCES rebanho_paricoes(id)`);
    console.log(`Coluna paricao_id adicionada em ${tabela}.`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${tabela}_paricao ON ${tabela}(paricao_id)`);
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
