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
  const res = await fetch(`${baseUrl}/api/rebanho${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: res.status, corpo: await res.json() };
}

// Um nascimento no fim do ano só cria linhas (por causa da cadeia de maturação) para as
// categorias envolvidas nos meses seguintes. As demais categorias não têm linha nesses meses,
// mas continuam existindo: o total do rebanho não pode "despencar" por causa disso.
test('/serie e /mes repetem o último total das categorias sem linha no mês', async () => {
  for (let mes = 1; mes <= 12; mes++) {
    await chamar('POST', '/snapshot', {
      especie: 'ovino', categoria: 'Ovelha', ano: 2026, mes, saldo_anterior: 100, subtotal: 100, total: 100,
    });
  }
  const nascimento = await chamar('POST', '/nascimento', {
    especie: 'ovino', categoria: 'Borrego', quantidade: 10, data: '2026-12-15',
  });
  assert.equal(nascimento.status, 201);

  // 2026: só Ovelha até novembro; dezembro soma os 10 borregos
  const serie2026 = (await chamar('GET', '/serie?especie=ovino&ano=2026')).corpo;
  assert.deepEqual(
    serie2026.meses.map((m) => m.total_geral),
    [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 110]
  );

  // 2027: só Borrego/Marrão/Carneiro ganharam linhas, mas o total segue 100 ovelhas + 10 animais
  const serie2027 = (await chamar('GET', '/serie?especie=ovino&ano=2027')).corpo;
  assert.ok(serie2027.meses.every((m) => m.tem_dados));
  assert.deepEqual(serie2027.meses.map((m) => m.total_geral), Array(12).fill(110));
  assert.equal(serie2027.meses[1].por_categoria.Ovelha, 100); // carregada de 2026
  assert.equal(serie2027.meses[1].por_categoria.Borrego, 10);
  assert.equal(serie2027.meses[3].por_categoria.Marrão, 10);
  assert.equal(serie2027.meses[3].por_categoria.Carneiro, null); // nunca teve linha antes de 12/2027

  // detalhe do mês: a categoria sem linha aparece com o total carregado e sem movimento
  const fevereiro = (await chamar('GET', '/mes?especie=ovino&ano=2027&mes=2')).corpo;
  const ovelha = fevereiro.categorias.find((c) => c.categoria === 'Ovelha');
  assert.deepEqual(
    [ovelha.saldo_anterior, ovelha.total, ovelha.nascimentos, ovelha.obitos],
    [100, 100, 0, 0]
  );
  assert.equal(fevereiro.totais.total, 110);

  // ano sem nenhuma linha: todos os meses seguem sem dados e com tudo null (contrato antigo)
  const serie2028 = (await chamar('GET', '/serie?especie=ovino&ano=2028')).corpo;
  for (const m of serie2028.meses) {
    assert.equal(m.tem_dados, false);
    assert.equal(m.total_geral, null);
    assert.ok(Object.values(m.por_categoria).every((v) => v === null));
  }

  // mês sem nenhum dado continua zerado (e sem dados)
  const semDados = (await chamar('GET', '/mes?especie=ovino&ano=2028&mes=1')).corpo;
  assert.equal(semDados.tem_dados, false);
  assert.equal(semDados.totais.total, 0);
});
