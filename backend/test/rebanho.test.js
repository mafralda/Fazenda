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
  const texto = await res.text();
  return { status: res.status, corpo: texto ? JSON.parse(texto) : null };
}

function linha(especie, categoria, ano, mes) {
  return db
    .prepare('SELECT * FROM rebanho_snapshots WHERE especie=? AND categoria=? AND ano=? AND mes=?')
    .get(especie, categoria, ano, mes);
}

function transicoesDe(nascimentoId) {
  return db
    .prepare('SELECT id, quantidade, ano, mes FROM rebanho_transicoes WHERE nascimento_id = ? ORDER BY ano, mes')
    .all(nascimentoId);
}

// ---------- Nascimentos ----------

test('PUT /nascimento/:id refaz o snapshot e regenera as transições', async () => {
  const criado = await chamar('POST', '/nascimento', {
    especie: 'ovino', categoria: 'Borrego', quantidade: 2, data: '2025-03-10',
  });
  assert.equal(criado.status, 201);
  const id = criado.corpo.id;
  assert.equal(linha('ovino', 'Borrego', 2025, 3).nascimentos, 2);

  const editado = await chamar('PUT', `/nascimento/${id}`, {
    categoria: 'Borrego', quantidade: 3, data: '2025-04-05', observacoes: '  corrigido  ',
  });
  assert.equal(editado.status, 200);

  assert.equal(linha('ovino', 'Borrego', 2025, 3).nascimentos, 0);
  assert.equal(linha('ovino', 'Borrego', 2025, 3).total, 0);
  assert.equal(linha('ovino', 'Borrego', 2025, 4).nascimentos, 3);
  assert.equal(linha('ovino', 'Borrego', 2025, 4).total, 3);

  // Transições antigas (2025-06 aos 3 meses, 2026-03 com 1 ano) saem; as novas
  // (2025-07 e 2026-04) entram com a nova quantidade.
  assert.deepEqual(
    transicoesDe(id).map((t) => [t.quantidade, t.ano, t.mes]),
    [[3, 2025, 7], [3, 2026, 4]]
  );
  assert.equal(linha('ovino', 'Marrão', 2025, 6).total, 0);
  assert.equal(linha('ovino', 'Borrego', 2025, 7).total, 0);
  assert.equal(linha('ovino', 'Marrão', 2025, 7).total, 3);
  assert.equal(linha('ovino', 'Marrão', 2026, 3).total, 3); // ainda marrão: vira carneiro em 04/2026
  assert.equal(linha('ovino', 'Carneiro', 2026, 4).total, 3);

  const salvo = db.prepare('SELECT * FROM rebanho_nascimentos WHERE id = ?').get(id);
  assert.equal(salvo.observacoes, 'corrigido');
});

test('PUT /nascimento/:id só com observações não mexe nas transições', async () => {
  const { corpo } = await chamar('POST', '/nascimento', {
    especie: 'ovino', categoria: 'Borrega', quantidade: 1, data: '2025-06-01',
  });
  const antes = transicoesDe(corpo.id).map((t) => t.id);

  const editado = await chamar('PUT', `/nascimento/${corpo.id}`, {
    categoria: 'Borrega', quantidade: 1, data: '2025-06-01', observacoes: 'só nota',
  });
  assert.equal(editado.status, 200);
  assert.deepEqual(transicoesDe(corpo.id).map((t) => t.id), antes);
});

test('PUT /nascimento/:id valida corpo e existência', async () => {
  const { corpo } = await chamar('POST', '/nascimento', {
    especie: 'bovino', categoria: 'Bezerro', quantidade: 1, data: '2025-02-01',
  });

  assert.equal((await chamar('PUT', '/nascimento/99999', { categoria: 'Bezerro', quantidade: 1, data: '2025-02-01' })).status, 404);
  assert.equal((await chamar('PUT', `/nascimento/${corpo.id}`, { categoria: 'Vaca', quantidade: 1, data: '2025-02-01' })).status, 400);
  assert.equal((await chamar('PUT', `/nascimento/${corpo.id}`, { categoria: 'Bezerro', quantidade: 0, data: '2025-02-01' })).status, 400);
  assert.equal((await chamar('PUT', `/nascimento/${corpo.id}`, { categoria: 'Bezerro', quantidade: 1.5, data: '2025-02-01' })).status, 400);
  assert.equal((await chamar('PUT', `/nascimento/${corpo.id}`, { categoria: 'Bezerro', quantidade: 1, data: '2025-02-30' })).status, 400);

  // nada foi alterado pelas tentativas inválidas
  assert.equal(linha('bovino', 'Bezerro', 2025, 2).nascimentos, 1);
});

// ---------- Óbitos ----------

async function semearOvelha() {
  for (const mes of [1, 2]) {
    await chamar('POST', '/snapshot', {
      especie: 'ovino', categoria: 'Ovelha', ano: 2025, mes,
      saldo_anterior: 10, subtotal: 10, total: 10,
    });
  }
}

test('óbito: POST, PUT e DELETE ajustam o mês e propagam para os seguintes', async () => {
  await semearOvelha();

  const criado = await chamar('POST', '/obito', {
    especie: 'ovino', categoria: 'Ovelha', quantidade: 2, data: '2025-01-15', observacoes: 'picada de cobra',
  });
  assert.equal(criado.status, 201);
  const id = criado.corpo.id;

  let jan = linha('ovino', 'Ovelha', 2025, 1);
  let fev = linha('ovino', 'Ovelha', 2025, 2);
  assert.deepEqual([jan.obitos, jan.subtotal, jan.total], [2, 8, 8]);
  assert.deepEqual([fev.saldo_anterior, fev.subtotal, fev.total], [8, 8, 8]);

  const editado = await chamar('PUT', `/obito/${id}`, {
    categoria: 'Ovelha', quantidade: 1, data: '2025-02-10',
  });
  assert.equal(editado.status, 200);
  jan = linha('ovino', 'Ovelha', 2025, 1);
  fev = linha('ovino', 'Ovelha', 2025, 2);
  assert.deepEqual([jan.obitos, jan.subtotal, jan.total], [0, 10, 10]);
  assert.deepEqual([fev.obitos, fev.subtotal, fev.total], [1, 9, 9]);

  const apagado = await chamar('DELETE', `/obito/${id}`);
  assert.equal(apagado.status, 204);
  fev = linha('ovino', 'Ovelha', 2025, 2);
  assert.deepEqual([fev.obitos, fev.subtotal, fev.total], [0, 10, 10]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rebanho_obitos WHERE id = ?').get(id).n, 0);
  assert.equal((await chamar('DELETE', `/obito/${id}`)).status, 404);
});

test('óbito: saldo insuficiente devolve 400 e não deixa rastro', async () => {
  await semearOvelha();
  const antes = db.prepare('SELECT COUNT(*) n FROM rebanho_obitos').get().n;

  const res = await chamar('POST', '/obito', {
    especie: 'ovino', categoria: 'Ovelha', quantidade: 11, data: '2025-01-20',
  });
  assert.equal(res.status, 400);
  assert.match(res.corpo.erro, /saldo insuficiente/);

  const jan = linha('ovino', 'Ovelha', 2025, 1);
  assert.deepEqual([jan.obitos, jan.total], [0, 10]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rebanho_obitos').get().n, antes);
});

test('óbito: PUT que estoura o saldo é revertido por inteiro', async () => {
  await semearOvelha();
  const { corpo } = await chamar('POST', '/obito', {
    especie: 'ovino', categoria: 'Ovelha', quantidade: 3, data: '2025-01-05',
  });

  const res = await chamar('PUT', `/obito/${corpo.id}`, { categoria: 'Ovelha', quantidade: 50, data: '2025-01-05' });
  assert.equal(res.status, 400);

  const jan = linha('ovino', 'Ovelha', 2025, 1);
  assert.deepEqual([jan.obitos, jan.total], [3, 7]);
  assert.equal(db.prepare('SELECT quantidade FROM rebanho_obitos WHERE id = ?').get(corpo.id).quantidade, 3);

  await chamar('DELETE', `/obito/${corpo.id}`);
});

test('óbito: valida espécie, categoria, quantidade e data', async () => {
  const base = { especie: 'ovino', categoria: 'Ovelha', quantidade: 1, data: '2025-01-10' };
  assert.equal((await chamar('POST', '/obito', { ...base, especie: 'suino' })).status, 400);
  assert.equal((await chamar('POST', '/obito', { ...base, categoria: 'Vaca' })).status, 400);
  assert.equal((await chamar('POST', '/obito', { ...base, quantidade: -1 })).status, 400);
  assert.equal((await chamar('POST', '/obito', { ...base, data: '10/01/2025' })).status, 400);
  assert.equal((await chamar('PUT', '/obito/99999', base)).status, 404);
});

test('GET /categorias devolve todas as categorias da espécie', async () => {
  const { status, corpo } = await chamar('GET', '/categorias?especie=ovino');
  assert.equal(status, 200);
  assert.ok(corpo.includes('Ovelha') && corpo.includes('Borrego'));
  assert.equal((await chamar('GET', '/categorias?especie=gato')).status, 400);
});

// ---------- Transições ----------

test('cadeia de maturação dos ovinos: 3 meses e 1 ano; Reprodutor fica de fora', async () => {
  const opcoes = await chamar('GET', '/categorias-nascimento?especie=ovino');
  assert.deepEqual(
    opcoes.corpo.map((c) => [c.categoria, c.proxima_transicao.meses, c.proxima_transicao.categoria]),
    [['Borrego', 3, 'Marrão'], ['Borrega', 3, 'Marrã']]
  );

  const macho = await chamar('POST', '/nascimento', {
    especie: 'ovino', categoria: 'Borrego', quantidade: 1, data: '2045-01-15',
  });
  const femea = await chamar('POST', '/nascimento', {
    especie: 'ovino', categoria: 'Borrega', quantidade: 1, data: '2045-01-15',
  });
  const cadeia = (id) =>
    db
      .prepare('SELECT categoria_origem o, categoria_destino d, ano, mes FROM rebanho_transicoes WHERE nascimento_id = ? ORDER BY ano, mes')
      .all(id)
      .map((t) => `${t.o}→${t.d} ${t.mes}/${t.ano}`);
  assert.deepEqual(cadeia(macho.corpo.id), ['Borrego→Marrão 4/2045', 'Marrão→Carneiro 1/2046']);
  assert.deepEqual(cadeia(femea.corpo.id), ['Borrega→Marrã 4/2045', 'Marrã→Ovelha 1/2046']);

  // Carneiro é categoria do rebanho; Reprodutor continua existindo, mas ninguém vira reprodutor sozinho
  const categorias = (await chamar('GET', '/categorias?especie=ovino')).corpo;
  assert.ok(categorias.includes('Carneiro') && categorias.includes('Reprodutor'));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM rebanho_transicoes WHERE categoria_destino = 'Reprodutor'").get().n, 0);

  await chamar('DELETE', `/nascimento/${macho.corpo.id}`);
  await chamar('DELETE', `/nascimento/${femea.corpo.id}`);
});

test('PUT /transicao/:id move quantidade e mês no snapshot', async () => {
  const { corpo } = await chamar('POST', '/nascimento', {
    especie: 'ovino', categoria: 'Borrega', quantidade: 4, data: '2031-06-01',
  });
  const [primeira] = transicoesDe(corpo.id);
  assert.deepEqual([primeira.ano, primeira.mes], [2031, 9]); // Borrega → Marrã aos 3 meses

  const res = await chamar('PUT', `/transicao/${primeira.id}`, { quantidade: 3, mes_ano: '2031-11' });
  assert.equal(res.status, 200);

  const [editada] = transicoesDe(corpo.id);
  assert.deepEqual([editada.quantidade, editada.ano, editada.mes], [3, 2031, 11]);
  assert.equal(linha('ovino', 'Marrã', 2031, 9).evolucao, 0);
  assert.equal(linha('ovino', 'Marrã', 2031, 11).evolucao, 3);
  assert.equal(linha('ovino', 'Borrega', 2031, 9).total, 4);
  assert.equal(linha('ovino', 'Borrega', 2031, 11).total, 1);

  // a 2ª transição (Marrã → Ovelha, 4 animais em 06/2032) agora supera o que sobrou em Marrã
  assert.equal(res.corpo.avisos.length, 1);
  assert.match(res.corpo.avisos[0], /Marrã.*-1.*06\/2032/);

  assert.equal((await chamar('PUT', `/transicao/${primeira.id}`, { quantidade: 0, mes_ano: '2031-11' })).status, 400);
  assert.equal((await chamar('PUT', `/transicao/${primeira.id}`, { quantidade: 1, mes_ano: '2031-13' })).status, 400);
  assert.equal((await chamar('PUT', '/transicao/99999', { quantidade: 1, mes_ano: '2031-11' })).status, 404);
});

// ---------- Histórico e filtros ----------

test('GET /historico filtra por período e por evento', async () => {
  // Cenário isolado (bovino, anos 2040+) para não depender do estado dos outros testes.
  await chamar('POST', '/snapshot', {
    especie: 'bovino', categoria: 'Touro', ano: 2040, mes: 1,
    saldo_anterior: 5, subtotal: 5, total: 5,
  });
  const nasc = await chamar('POST', '/nascimento', {
    especie: 'bovino', categoria: 'Bezerro', quantidade: 1, data: '2040-02-10',
  });
  const obito = await chamar('POST', '/obito', {
    especie: 'bovino', categoria: 'Touro', quantidade: 1, data: '2040-03-15',
  });
  assert.equal(nasc.status, 201);
  assert.equal(obito.status, 201);

  const buscar = async (query) => {
    const { status, corpo } = await chamar('GET', `/historico?especie=bovino&${query}`);
    assert.equal(status, 200);
    return corpo.map((e) => e.tipo).sort();
  };

  // 2040 inteiro: nascimento + óbito (as transições caem em 2041 e 2042)
  assert.deepEqual(await buscar('data_inicio=2040-01-01&data_fim=2040-12-31'), ['nascimento', 'obito']);
  assert.deepEqual(await buscar('data_inicio=2040-01-01&data_fim=2040-12-31&evento=obito'), ['obito']);
  assert.deepEqual(await buscar('data_inicio=2040-01-01&data_fim=2040-12-31&evento=nascimento'), ['nascimento']);

  // limites inclusivos e janela vazia entre os dois eventos
  assert.deepEqual(await buscar('data_inicio=2040-02-10&data_fim=2040-02-10'), ['nascimento']);
  assert.deepEqual(await buscar('data_inicio=2040-02-11&data_fim=2040-03-14'), []);

  // só início / só fim
  assert.deepEqual(await buscar('data_inicio=2040-03-01&data_fim=2040-12-31&evento=obito'), ['obito']);
  assert.deepEqual(await buscar('data_fim=2040-02-28&evento=obito'), []);

  // transições comparam por mês: dia 20/02/2041 ainda pega a transição de fev/2041
  assert.deepEqual(await buscar('data_inicio=2041-02-20&data_fim=2041-02-28'), ['transicao']);
  assert.deepEqual(await buscar('data_inicio=2041-03-01&data_fim=2041-12-31&evento=transicao'), []);

  // sem filtros traz os três tipos
  const todos = new Set((await chamar('GET', '/historico?especie=bovino')).corpo.map((e) => e.tipo));
  assert.deepEqual([...todos].sort(), ['nascimento', 'obito', 'transicao']);
});

test('GET /historico rejeita filtros inválidos', async () => {
  const ruim = async (query) => (await chamar('GET', `/historico?especie=ovino&${query}`)).status;
  assert.equal(await ruim('evento=venda'), 400);
  assert.equal(await ruim('data_inicio=2040-13-01'), 400);
  assert.equal(await ruim('data_fim=ontem'), 400);
  assert.equal(await ruim('data_inicio=2040-05-01&data_fim=2040-04-01'), 400);
});

test('óbito antes de transição agendada: aceita, mas avisa do saldo negativo futuro', async () => {
  const nasc = await chamar('POST', '/nascimento', {
    especie: 'bovino', categoria: 'Bezerro', quantidade: 2, data: '2012-01-10',
  });

  // 1 dos 2 bezerros morre em 06/2012; a transição de 01/2013 ainda move os 2
  const obito = await chamar('POST', '/obito', {
    especie: 'bovino', categoria: 'Bezerro', quantidade: 1, data: '2012-06-01',
  });
  assert.equal(obito.status, 201);
  assert.equal(linha('bovino', 'Bezerro', 2012, 6).total, 1);
  assert.equal(obito.corpo.avisos.length, 1);
  assert.match(obito.corpo.avisos[0], /Bezerro.*-1.*01\/2013/);

  // desfazer o óbito zera o problema
  await chamar('DELETE', `/obito/${obito.corpo.id}`);
  assert.equal(linha('bovino', 'Bezerro', 2012, 6).total, 2);
  const apagado = await chamar('DELETE', `/nascimento/${nasc.corpo.id}`);
  assert.equal(apagado.status, 200);
  assert.deepEqual(apagado.corpo.avisos, []);
});

test('quantidade e ano são validados com rigor', async () => {
  const base = { especie: 'bovino', categoria: 'Bezerro', data: '2025-02-01' };
  assert.equal((await chamar('POST', '/nascimento', { ...base, quantidade: true })).status, 400);
  assert.equal((await chamar('POST', '/nascimento', { ...base, quantidade: [3] })).status, 400);
  assert.equal((await chamar('POST', '/nascimento', { ...base, quantidade: '' })).status, 400);
  assert.equal((await chamar('POST', '/nascimento', { ...base, quantidade: 1, data: '9999-12-31' })).status, 400);
  assert.equal((await chamar('POST', '/nascimento', { ...base, quantidade: 1, data: '0001-01-01' })).status, 400);
  assert.equal((await chamar('POST', '/obito', { ...base, quantidade: 1, data: '9999-12-31' })).status, 400);
  // nada foi criado pelas tentativas inválidas
  assert.equal(db.prepare("SELECT COUNT(*) n FROM rebanho_nascimentos WHERE data >= '9000'").get().n, 0);

  // texto numérico é aceito (formulários HTML enviam string)
  const ok = await chamar('POST', '/nascimento', { ...base, quantidade: '1' });
  assert.equal(ok.status, 201);
  await chamar('DELETE', `/nascimento/${ok.corpo.id}`);
});

test('DELETE /nascimento/:id continua desfazendo o nascimento e as transições', async () => {
  const { corpo } = await chamar('POST', '/nascimento', {
    especie: 'bovino', categoria: 'Bezerra', quantidade: 2, data: '2035-01-10',
  });
  const apagado = await chamar('DELETE', `/nascimento/${corpo.id}`);
  assert.equal(apagado.status, 200);
  assert.deepEqual(apagado.corpo.avisos, []);
  assert.equal(transicoesDe(corpo.id).length, 0);
  assert.equal(linha('bovino', 'Bezerra', 2035, 1).nascimentos, 0);
  assert.equal(linha('bovino', 'Vaca', 2038, 1).total, 0);
});
