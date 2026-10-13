const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

// Banco no formato ANTERIOR à parição (sem paricao_id nem compras), com registros reais de
// rebanho. O app é carregado só depois, para o schema.js migrar esse arquivo (é o que acontece
// no deploy, em cima do volume existente). Os outros testes sempre partem de banco novo.
let tmpDir;
let server;
let db;
let baseUrl;
let ids;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazenda-test-'));
  const dbPath = path.join(tmpDir, 'legado.db');

  const legado = new Database(dbPath);
  legado.pragma('foreign_keys = ON');
  legado.exec(`
    CREATE TABLE rebanho_snapshots (
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
    CREATE TABLE rebanho_nascimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      especie TEXT NOT NULL CHECK (especie IN ('bovino', 'ovino')),
      categoria TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      data TEXT NOT NULL,
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE rebanho_transicoes (
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
    CREATE TABLE rebanho_obitos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      especie TEXT NOT NULL CHECK (especie IN ('bovino', 'ovino')),
      categoria TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      data TEXT NOT NULL,
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  legado.prepare(
    `INSERT INTO rebanho_snapshots (especie, categoria, ano, mes, saldo_anterior, subtotal, total)
     VALUES ('ovino', 'Ovelha', 2026, 2, 50, 50, 50)`
  ).run();
  const nasc = legado
    .prepare("INSERT INTO rebanho_nascimentos (especie, categoria, quantidade, data) VALUES ('ovino', 'Borrega', 2, '2026-01-10')")
    .run().lastInsertRowid;
  const inserirTransicao = legado.prepare(
    `INSERT INTO rebanho_transicoes (especie, categoria_origem, categoria_destino, quantidade, ano, mes, nascimento_id)
     VALUES ('ovino', ?, ?, 2, ?, ?, ?)`
  );
  inserirTransicao.run('Borrega', 'Marrã', 2026, 4, nasc);
  inserirTransicao.run('Marrã', 'Ovelha', 2027, 1, nasc);
  const obito = legado
    .prepare("INSERT INTO rebanho_obitos (especie, categoria, quantidade, data) VALUES ('ovino', 'Ovelha', 1, '2026-02-05')")
    .run().lastInsertRowid;
  legado.close();
  ids = { nasc, obito };

  process.env.DB_PATH = dbPath;
  db = require('../src/db');
  const app = require('../src/app');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (db) db.close();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function chamar(metodo, caminho, corpo) {
  const res = await fetch(`${baseUrl}/api/rebanho${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await res.text();
  return { status: res.status, corpo: texto ? JSON.parse(texto) : null };
}

const colunas = (tabela) => db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);

test('a migração acrescenta as colunas e preserva os registros antigos', () => {
  assert.ok(colunas('rebanho_nascimentos').includes('paricao_id'));
  assert.ok(colunas('rebanho_obitos').includes('paricao_id'));
  assert.ok(colunas('rebanho_snapshots').includes('compras'));

  const nascimento = db.prepare('SELECT * FROM rebanho_nascimentos WHERE id = ?').get(ids.nasc);
  assert.deepEqual([nascimento.categoria, nascimento.quantidade, nascimento.paricao_id], ['Borrega', 2, null]);
  assert.equal(db.prepare('SELECT paricao_id FROM rebanho_obitos WHERE id = ?').get(ids.obito).paricao_id, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rebanho_transicoes').get().n, 2);
  assert.equal(db.prepare('SELECT compras FROM rebanho_snapshots').get().compras, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('registros antigos continuam editáveis e excluíveis depois da migração', async () => {
  const editado = await chamar('PUT', `/nascimento/${ids.nasc}`, {
    categoria: 'Borrega', quantidade: 2, data: '2026-01-10', observacoes: 'conferido',
  });
  assert.equal(editado.status, 200);

  const obito = await chamar('PUT', `/obito/${ids.obito}`, { categoria: 'Ovelha', quantidade: 2, data: '2026-02-05' });
  assert.equal(obito.status, 200);

  assert.equal((await chamar('DELETE', `/obito/${ids.obito}`)).status, 204);
  assert.equal((await chamar('DELETE', `/nascimento/${ids.nasc}`)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rebanho_transicoes').get().n, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('a parição funciona sobre o banco migrado e respeita as chaves estrangeiras', async () => {
  const res = await chamar('POST', '/paricao', { data: '2026-03-10', ovelhas: 3, borregos_vivos: 3, ovelhas_mortas: 1 });
  assert.equal(res.status, 201);

  const nascimentos = db.prepare('SELECT paricao_id FROM rebanho_nascimentos WHERE paricao_id = ?').all(res.corpo.id);
  const obitos = db.prepare('SELECT paricao_id FROM rebanho_obitos WHERE paricao_id = ?').all(res.corpo.id);
  assert.equal(nascimentos.length, 1);
  assert.equal(obitos.length, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

  assert.equal((await chamar('DELETE', `/paricao/${res.corpo.id}`)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rebanho_paricoes').get().n, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
