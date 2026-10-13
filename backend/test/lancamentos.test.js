const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let tmpDir;
let server;
let db;
let baseUrl;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazenda-test-'));
  // O banco abre ao carregar o módulo: DB_PATH precisa estar definido antes do require.
  process.env.DB_PATH = path.join(tmpDir, 'teste.db');

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

function idCategoria(nome) {
  return db.prepare('SELECT id FROM categorias WHERE nome = ?').get(nome).id;
}

async function postar(corpo) {
  const res = await fetch(`${baseUrl}/api/lancamentos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  return { status: res.status, corpo: await res.json() };
}

test('POST /api/lancamentos cria o lançamento e devolve 201 com o nome da categoria', async () => {
  const { status, corpo } = await postar({
    tipo: 'receita',
    categoria_id: idCategoria('Venda de animais'),
    descricao: 'Venda de 3 bezerros',
    quantidade: 3,
    valor: 4500.5,
    data: '2026-03-10',
  });

  assert.equal(status, 201);
  assert.equal(typeof corpo.id, 'number');
  assert.equal(corpo.tipo, 'receita');
  assert.equal(corpo.categoria_nome, 'Venda de animais');
  assert.equal(corpo.valor, 4500.5);
  assert.equal(corpo.data, '2026-03-10');
});

test('GET /api/lancamentos lista o lançamento criado', async () => {
  const criado = await postar({
    tipo: 'despesa',
    categoria_id: idCategoria('Ração'),
    descricao: 'Ração lote GET',
    valor: 800,
    data: '2026-03-11',
  });

  const res = await fetch(`${baseUrl}/api/lancamentos`);
  const lista = await res.json();

  assert.equal(res.status, 200);
  const encontrado = lista.find((l) => l.id === criado.corpo.id);
  assert.ok(encontrado, 'o lançamento criado deve aparecer na listagem');
  assert.equal(encontrado.descricao, 'Ração lote GET');
  assert.equal(encontrado.categoria_nome, 'Ração');
});

test('POST /api/lancamentos sem campos obrigatórios devolve 400', async () => {
  const { status, corpo } = await postar({ descricao: 'sem tipo, categoria, valor nem data' });

  assert.equal(status, 400);
  assert.match(corpo.erro, /obrigatórios/);
});

test('a categoria "Sal Proteinado" existe só como despesa e aceita lançamento', async () => {
  const listar = async (tipo) => (await fetch(`${baseUrl}/api/categorias?tipo=${tipo}`)).json();
  assert.ok((await listar('despesa')).some((c) => c.nome === 'Sal Proteinado'));
  assert.ok(!(await listar('receita')).some((c) => c.nome === 'Sal Proteinado'));

  const { status, corpo } = await postar({
    tipo: 'despesa',
    categoria_id: idCategoria('Sal Proteinado'),
    descricao: 'Sal proteinado para o gado',
    valor: 850,
    data: '2026-03-12',
  });
  assert.equal(status, 201);
  assert.equal(corpo.categoria_nome, 'Sal Proteinado');
});

test('POST /api/lancamentos com tipo inválido devolve 400', async () => {
  const { status, corpo } = await postar({
    tipo: 'transferencia',
    categoria_id: idCategoria('Ração'),
    valor: 100,
    data: '2026-03-12',
  });

  assert.equal(status, 400);
  assert.match(corpo.erro, /tipo/);
});
