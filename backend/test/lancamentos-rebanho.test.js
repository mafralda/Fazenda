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

async function chamar(metodo, caminho, corpo) {
  const res = await fetch(`${baseUrl}/api${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await res.text();
  return { status: res.status, corpo: texto ? JSON.parse(texto) : null };
}

function idCategoria(nome) {
  return db.prepare('SELECT id FROM categorias WHERE nome = ?').get(nome).id;
}

function linha(especie, categoria, ano, mes) {
  return db
    .prepare('SELECT * FROM rebanho_snapshots WHERE especie=? AND categoria=? AND ano=? AND mes=?')
    .get(especie, categoria, ano, mes);
}

function contar(tabela) {
  return db.prepare(`SELECT COUNT(*) n FROM ${tabela}`).get().n;
}

// 5 meses de Ovelha com 10 animais; regrava tudo, então cada teste começa do zero.
async function semearOvelha() {
  for (let mes = 1; mes <= 5; mes++) {
    await chamar('POST', '/rebanho/snapshot', {
      especie: 'ovino', categoria: 'Ovelha', ano: 2026, mes,
      saldo_anterior: 10, subtotal: 10, total: 10,
    });
  }
}

function venda(extra = {}) {
  return {
    tipo: 'receita',
    categoria_id: idCategoria('Venda de animais'),
    descricao: 'Venda de ovelhas',
    subcategoria: 'Ovelha',
    quantidade: 3,
    valor: 1500,
    data: '2026-03-10',
    animal_especie: 'ovino',
    ...extra,
  };
}

function totaisOvelha() {
  return [1, 2, 3, 4, 5].map((mes) => linha('ovino', 'Ovelha', 2026, mes).total);
}

test('a categoria "Compra de animais" existe como despesa', async () => {
  const { corpo } = await chamar('GET', '/categorias');
  const compra = corpo.find((c) => c.nome === 'Compra de animais');
  assert.ok(compra);
  assert.equal(compra.tipo, 'despesa');
});

test('venda com espécie desconta do rebanho no mês e nos seguintes', async () => {
  await semearOvelha();

  const res = await chamar('POST', '/lancamentos', venda());
  assert.equal(res.status, 201);
  assert.equal(res.corpo.animal_especie, 'ovino');
  assert.deepEqual(res.corpo.avisos, []);

  const marco = linha('ovino', 'Ovelha', 2026, 3);
  assert.deepEqual([marco.vendas, marco.subtotal, marco.total], [3, 7, 7]);
  assert.deepEqual(totaisOvelha(), [10, 10, 7, 7, 7]);
  assert.equal(linha('ovino', 'Ovelha', 2026, 4).saldo_anterior, 7);

  // a listagem informa a espécie para o formulário de edição
  const lista = await chamar('GET', '/lancamentos');
  assert.equal(lista.corpo.find((l) => l.id === res.corpo.id).animal_especie, 'ovino');

  await chamar('DELETE', `/lancamentos/${res.corpo.id}`);
});

test('editar a venda refaz o ajuste (quantidade e mês)', async () => {
  await semearOvelha();
  const { corpo } = await chamar('POST', '/lancamentos', venda());

  const editada = await chamar('PUT', `/lancamentos/${corpo.id}`, venda({ quantidade: 5, data: '2026-04-02' }));
  assert.equal(editada.status, 200);

  assert.deepEqual(totaisOvelha(), [10, 10, 10, 5, 5]);
  assert.equal(linha('ovino', 'Ovelha', 2026, 3).vendas, 0);
  assert.equal(linha('ovino', 'Ovelha', 2026, 4).vendas, 5);

  // o vínculo guarda o que foi aplicado agora
  const vinculo = db.prepare('SELECT * FROM rebanho_lancamentos WHERE lancamento_id = ?').get(corpo.id);
  assert.deepEqual([vinculo.quantidade, vinculo.data], [5, '2026-04-02']);

  await chamar('DELETE', `/lancamentos/${corpo.id}`);
});

test('editar sem mexer na espécie mantém o vínculo (PUT parcial)', async () => {
  await semearOvelha();
  const { corpo } = await chamar('POST', '/lancamentos', venda());

  const res = await chamar('PUT', `/lancamentos/${corpo.id}`, { valor: 1800 });
  assert.equal(res.status, 200);
  assert.equal(res.corpo.valor, 1800);
  assert.equal(res.corpo.animal_especie, 'ovino');
  assert.deepEqual(totaisOvelha(), [10, 10, 7, 7, 7]);

  await chamar('DELETE', `/lancamentos/${corpo.id}`);
});

test('animal_especie null desfaz o ajuste e mantém o lançamento financeiro', async () => {
  await semearOvelha();
  const { corpo } = await chamar('POST', '/lancamentos', venda());

  const res = await chamar('PUT', `/lancamentos/${corpo.id}`, { animal_especie: null });
  assert.equal(res.status, 200);
  assert.equal(res.corpo.animal_especie, null);
  assert.equal(res.corpo.valor, 1500);
  assert.deepEqual(totaisOvelha(), [10, 10, 10, 10, 10]);
  assert.equal(contar('rebanho_lancamentos'), 0);

  await chamar('DELETE', `/lancamentos/${corpo.id}`);
});

test('trocar para categoria que não é de animais exige limpar a espécie', async () => {
  await semearOvelha();
  const { corpo } = await chamar('POST', '/lancamentos', venda());
  const outras = idCategoria('Outras receitas');

  // sem limpar, a espécie antiga continua valendo e a categoria nova não aceita
  const recusado = await chamar('PUT', `/lancamentos/${corpo.id}`, { categoria_id: outras });
  assert.equal(recusado.status, 400);
  assert.deepEqual(totaisOvelha(), [10, 10, 7, 7, 7]);

  const ok = await chamar('PUT', `/lancamentos/${corpo.id}`, { categoria_id: outras, animal_especie: null });
  assert.equal(ok.status, 200);
  assert.deepEqual(totaisOvelha(), [10, 10, 10, 10, 10]);

  await chamar('DELETE', `/lancamentos/${corpo.id}`);
});

test('excluir a venda devolve os animais ao rebanho', async () => {
  await semearOvelha();
  const { corpo } = await chamar('POST', '/lancamentos', venda());
  assert.deepEqual(totaisOvelha(), [10, 10, 7, 7, 7]);

  const apagada = await chamar('DELETE', `/lancamentos/${corpo.id}`);
  assert.equal(apagada.status, 200);
  assert.deepEqual(apagada.corpo.avisos, []);
  assert.deepEqual(totaisOvelha(), [10, 10, 10, 10, 10]);
  assert.equal(linha('ovino', 'Ovelha', 2026, 3).vendas, 0);
  assert.equal(contar('rebanho_lancamentos'), 0);
});

test('excluir uma compra cujos animais já foram vendidos avisa do saldo negativo', async () => {
  const compra = await chamar('POST', '/lancamentos', {
    tipo: 'despesa', categoria_id: idCategoria('Compra de animais'), subcategoria: 'Reprodutor',
    quantidade: 5, valor: 5000, data: '2026-03-10', animal_especie: 'ovino',
  });
  const vendaPosterior = await chamar('POST', '/lancamentos', venda({
    subcategoria: 'Reprodutor', quantidade: 5, data: '2026-04-10',
  }));
  assert.equal(linha('ovino', 'Reprodutor', 2026, 4).total, 0);

  const apagada = await chamar('DELETE', `/lancamentos/${compra.corpo.id}`);
  assert.equal(apagada.status, 200);
  assert.equal(apagada.corpo.avisos.length, 1);
  assert.match(apagada.corpo.avisos[0], /Reprodutor.*-5.*04\/2026/);

  await chamar('DELETE', `/lancamentos/${vendaPosterior.corpo.id}`);
  assert.equal(linha('ovino', 'Reprodutor', 2026, 4).total, 0);
});

test('POST /rebanho/snapshot grava e regrava a coluna compras', async () => {
  const base = { especie: 'bovino', categoria: 'Touro', ano: 2020, mes: 1, saldo_anterior: 5, subtotal: 8, total: 8 };
  await chamar('POST', '/rebanho/snapshot', { ...base, compras: 3 });
  assert.equal(linha('bovino', 'Touro', 2020, 1).compras, 3);

  // regravar o mês substitui a linha inteira (compras volta a 0 se não vier)
  await chamar('POST', '/rebanho/snapshot', base);
  assert.equal(linha('bovino', 'Touro', 2020, 1).compras, 0);
});

test('compra de animais soma ao rebanho (coluna compras) e a exclusão desfaz', async () => {
  const compra = {
    tipo: 'despesa',
    categoria_id: idCategoria('Compra de animais'),
    descricao: 'Compra de bezerros',
    subcategoria: 'Bezerro',
    quantidade: 4,
    valor: 6000,
    data: '2026-03-10',
    animal_especie: 'bovino',
  };
  const res = await chamar('POST', '/lancamentos', compra);
  assert.equal(res.status, 201);

  const marco = linha('bovino', 'Bezerro', 2026, 3);
  assert.deepEqual([marco.compras, marco.subtotal, marco.total], [4, 4, 4]);

  // a tela de rebanho recebe a coluna e o total do mês
  const mes = await chamar('GET', '/rebanho/mes?especie=bovino&ano=2026&mes=3');
  assert.equal(mes.corpo.categorias.find((c) => c.categoria === 'Bezerro').compras, 4);
  assert.equal(mes.corpo.totais.compras, 4);

  await chamar('DELETE', `/lancamentos/${res.corpo.id}`);
  const depois = linha('bovino', 'Bezerro', 2026, 3);
  assert.deepEqual([depois.compras, depois.subtotal, depois.total], [0, 0, 0]);
});

test('venda sem espécie é só financeira: não mexe no rebanho (lançamentos antigos)', async () => {
  await semearOvelha();
  const res = await chamar('POST', '/lancamentos', venda({ animal_especie: undefined, quantidade: 9 }));
  assert.equal(res.status, 201);
  assert.equal(res.corpo.animal_especie, null);

  assert.deepEqual(totaisOvelha(), [10, 10, 10, 10, 10]);
  assert.equal(contar('rebanho_lancamentos'), 0);

  // editar um lançamento antigo sem informar espécie também não aplica nada retroativamente
  await chamar('PUT', `/lancamentos/${res.corpo.id}`, { quantidade: 8 });
  assert.deepEqual(totaisOvelha(), [10, 10, 10, 10, 10]);
  assert.equal(contar('rebanho_lancamentos'), 0);

  await chamar('DELETE', `/lancamentos/${res.corpo.id}`);
});

test('venda maior que o saldo é salva e devolve aviso de saldo negativo', async () => {
  await semearOvelha();
  const res = await chamar('POST', '/lancamentos', venda({ quantidade: 50 }));
  assert.equal(res.status, 201);
  assert.equal(res.corpo.avisos.length, 1);
  assert.match(res.corpo.avisos[0], /Ovelha.*saldo negativo.*03\/2026/);
  assert.equal(linha('ovino', 'Ovelha', 2026, 3).total, -40);

  await chamar('DELETE', `/lancamentos/${res.corpo.id}`);
  assert.deepEqual(totaisOvelha(), [10, 10, 10, 10, 10]);
});

test('validações do vínculo recusam com 400 e não deixam rastro', async () => {
  await semearOvelha();
  const lancamentosAntes = contar('lancamentos');

  const casos = [
    ['espécie inexistente', venda({ animal_especie: 'suino' })],
    ['categoria que não é de animais', venda({ categoria_id: idCategoria('Outras receitas') })],
    ['categoria de outra espécie', venda({ subcategoria: 'Bezerro' })],
    ['subcategoria vazia', venda({ subcategoria: '' })],
    ['quantidade fracionada', venda({ quantidade: 1.5 })],
    ['quantidade ausente', venda({ quantidade: null })],
    ['tipo trocado (venda como despesa)', venda({ tipo: 'despesa' })],
    ['data inválida', venda({ data: '2026-02-30' })],
    ['ano absurdo', venda({ data: '9999-01-01' })],
  ];

  for (const [descricao, corpo] of casos) {
    const res = await chamar('POST', '/lancamentos', corpo);
    assert.equal(res.status, 400, descricao);
  }

  assert.equal(contar('lancamentos'), lancamentosAntes);
  assert.equal(contar('rebanho_lancamentos'), 0);
  assert.deepEqual(totaisOvelha(), [10, 10, 10, 10, 10]);
});

test('categoria_id inexistente devolve 400', async () => {
  const res = await chamar('POST', '/lancamentos', {
    tipo: 'despesa', categoria_id: 99999, valor: 10, data: '2026-03-10',
  });
  assert.equal(res.status, 400);
});
