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

function linha(categoria, ano, mes) {
  return db
    .prepare("SELECT * FROM rebanho_snapshots WHERE especie='ovino' AND categoria=? AND ano=? AND mes=?")
    .get(categoria, ano, mes);
}

function contar(tabela) {
  return db.prepare(`SELECT COUNT(*) n FROM ${tabela}`).get().n;
}

function filhos(paricaoId) {
  const nascimentos = db
    .prepare('SELECT * FROM rebanho_nascimentos WHERE paricao_id = ? ORDER BY categoria')
    .all(paricaoId);
  const obitos = db.prepare('SELECT * FROM rebanho_obitos WHERE paricao_id = ? ORDER BY categoria').all(paricaoId);
  return { nascimentos, obitos };
}

function transicoes(nascimentoId) {
  return db
    .prepare('SELECT id, quantidade, ano, mes FROM rebanho_transicoes WHERE nascimento_id = ? ORDER BY ano, mes')
    .all(nascimentoId);
}

function cadeia(nascimentoId) {
  return db
    .prepare('SELECT categoria_origem o, categoria_destino d, ano, mes FROM rebanho_transicoes WHERE nascimento_id = ? ORDER BY ano, mes')
    .all(nascimentoId)
    .map((t) => `${t.o}→${t.d} ${t.mes}/${t.ano}`);
}

// 12 meses de 2026 com 100 ovelhas; regrava tudo, então cada teste começa com Ovelha limpa.
async function semearOvelha() {
  for (let mes = 1; mes <= 12; mes++) {
    await chamar('POST', '/snapshot', {
      especie: 'ovino', categoria: 'Ovelha', ano: 2026, mes,
      saldo_anterior: 100, subtotal: 100, total: 100,
    });
  }
}

// Os números do exemplo do usuário ("PARIÇÃO DEZEMBRO").
const PLANILHA = {
  ovelhas: 18, crias: 18, borregos_vivos: 10, borregas_vivas: 7, partos_duplos: 1, aleijados: 0,
  natimortos: 0, mortes: 1, total_mortos: 1, ovelhas_mortas: 1, abortos: 2,
};

test('parição da planilha: nascimentos, óbito, transições e listagem', async () => {
  await semearOvelha();
  const res = await chamar('POST', '/paricao', { data: '2026-12-15', ...PLANILHA, observacoes: '  dezembro  ' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.corpo.avisos, []);
  const id = res.corpo.id;

  try {
    const { nascimentos, obitos } = filhos(id);
    assert.deepEqual(
      nascimentos.map((n) => [n.categoria, n.quantidade, n.data]),
      [['Borrega', 7, '2026-12-15'], ['Borrego', 10, '2026-12-15']]
    );
    assert.deepEqual(obitos.map((o) => [o.categoria, o.quantidade, o.data]), [['Ovelha', 1, '2026-12-15']]);

    // snapshot: borregos/borregas entram em nascimentos; a ovelha morta sai do saldo
    const borrego = linha('Borrego', 2026, 12);
    assert.deepEqual([borrego.nascimentos, borrego.subtotal, borrego.total], [10, 0, 10]);
    const borrega = linha('Borrega', 2026, 12);
    assert.deepEqual([borrega.nascimentos, borrega.total], [7, 7]);
    const ovelha = linha('Ovelha', 2026, 12);
    assert.deepEqual([ovelha.obitos, ovelha.subtotal, ovelha.total], [1, 99, 99]);
    assert.equal(linha('Ovelha', 2026, 11).total, 100);

    // cadeia de maturação dos ovinos: 3 meses e 1 ano
    const doBorrego = nascimentos.find((n) => n.categoria === 'Borrego');
    const daBorrega = nascimentos.find((n) => n.categoria === 'Borrega');
    assert.deepEqual(cadeia(doBorrego.id), ['Borrego→Marrão 3/2027', 'Marrão→Carneiro 12/2027']);
    assert.deepEqual(cadeia(daBorrega.id), ['Borrega→Marrã 3/2027', 'Marrã→Ovelha 12/2027']);

    // listagem da aba Parições
    const lista = await chamar('GET', '/paricoes?especie=ovino');
    assert.equal(lista.corpo.length, 1);
    assert.deepEqual(lista.corpo[0], {
      id, especie: 'ovino', data: '2026-12-15', ...PLANILHA, aplicado_no_rebanho: true,
      observacoes: 'dezembro', criado_em: lista.corpo[0].criado_em,
    });
    assert.deepEqual((await chamar('GET', '/paricoes?especie=bovino')).corpo, []);

    // histórico: só os filhos, marcados com a parição de origem (a parição em si fica na aba própria)
    const hist = await chamar('GET', '/historico?especie=ovino&data_inicio=2026-12-01&data_fim=2026-12-31');
    const doMes = hist.corpo.filter((e) => e.tipo !== 'transicao');
    assert.equal(doMes.length, 3);
    for (const e of doMes) assert.deepEqual([e.paricao_id, e.paricao_data], [id, '2026-12-15']);
    assert.ok(!hist.corpo.some((e) => e.tipo === 'paricao'));
  } finally {
    const apagada = await chamar('DELETE', `/paricao/${id}`);
    assert.equal(apagada.status, 200);
  }

  // excluir desfaz tudo
  assert.deepEqual([linha('Borrego', 2026, 12).nascimentos, linha('Borrego', 2026, 12).total], [0, 0]);
  assert.deepEqual([linha('Ovelha', 2026, 12).obitos, linha('Ovelha', 2026, 12).total], [0, 100]);
  assert.equal(contar('rebanho_paricoes'), 0);
  assert.equal(contar('rebanho_nascimentos'), 0);
  assert.equal(contar('rebanho_obitos'), 0);
  assert.equal(contar('rebanho_transicoes'), 0);
  assert.equal((await chamar('DELETE', `/paricao/${id}`)).status, 404);
});

test('nascimentos e óbitos gerados pela parição só mudam pela própria parição', async () => {
  await semearOvelha();
  const { corpo } = await chamar('POST', '/paricao', {
    data: '2026-10-10', ovelhas: 3, borregos_vivos: 2, borregas_vivas: 1, ovelhas_mortas: 1,
  });
  try {
    const { nascimentos, obitos } = filhos(corpo.id);
    const quando = JSON.stringify([linha('Borrego', 2026, 10), linha('Ovelha', 2026, 10)]);

    const corpoNasc = { categoria: 'Borrego', quantidade: 5, data: '2026-10-10' };
    const corpoObito = { categoria: 'Ovelha', quantidade: 2, data: '2026-10-10' };
    for (const res of [
      await chamar('PUT', `/nascimento/${nascimentos[1].id}`, corpoNasc),
      await chamar('DELETE', `/nascimento/${nascimentos[1].id}`),
      await chamar('PUT', `/obito/${obitos[0].id}`, corpoObito),
      await chamar('DELETE', `/obito/${obitos[0].id}`),
    ]) {
      assert.equal(res.status, 400);
      assert.match(res.corpo.erro, /gerado pela parição de 10\/10\/2026/);
    }
    assert.equal(JSON.stringify([linha('Borrego', 2026, 10), linha('Ovelha', 2026, 10)]), quando);
    assert.equal(filhos(corpo.id).nascimentos.length, 2);
  } finally {
    await chamar('DELETE', `/paricao/${corpo.id}`);
  }
});

test('editar só estatísticas/observações/dia não toca nos filhos nem nos ajustes manuais das transições', async () => {
  await semearOvelha();
  const { corpo } = await chamar('POST', '/paricao', {
    data: '2026-09-05', ovelhas: 5, borregos_vivos: 4, borregas_vivas: 3,
  });
  try {
    const antes = filhos(corpo.id);
    const borrego = antes.nascimentos.find((n) => n.categoria === 'Borrego');

    // ajuste manual numa transição do borrego (jeito de compensar uma morte posterior)
    const [primeira] = transicoes(borrego.id);
    assert.equal((await chamar('PUT', `/transicao/${primeira.id}`, { quantidade: 3, mes_ano: '2027-01' })).status, 200);
    const transicoesAntes = JSON.stringify(transicoes(borrego.id));
    const snapshotAntes = JSON.stringify(linha('Borrego', 2026, 9));

    const res = await chamar('PUT', `/paricao/${corpo.id}`, {
      data: '2026-09-20', ovelhas: 5, borregos_vivos: 4, borregas_vivas: 3, abortos: 2, observacoes: 'revisada',
    });
    assert.equal(res.status, 200);

    const depois = filhos(corpo.id);
    assert.deepEqual(depois.nascimentos.map((n) => n.id), antes.nascimentos.map((n) => n.id));
    assert.equal(JSON.stringify(transicoes(borrego.id)), transicoesAntes); // ids e ajuste manual preservados
    assert.equal(JSON.stringify(linha('Borrego', 2026, 9)), snapshotAntes);
    assert.deepEqual(depois.nascimentos.map((n) => n.data), ['2026-09-20', '2026-09-20']); // só o dia mudou

    const salva = (await chamar('GET', '/paricoes?especie=ovino')).corpo.find((p) => p.id === corpo.id);
    assert.deepEqual([salva.abortos, salva.observacoes, salva.data], [2, 'revisada', '2026-09-20']);
  } finally {
    await chamar('DELETE', `/paricao/${corpo.id}`);
  }
});

test('editar o que mexe no rebanho reaplica só os filhos afetados', async () => {
  await semearOvelha();
  const base = { data: '2026-08-10', ovelhas: 18, borregos_vivos: 10, borregas_vivas: 7, ovelhas_mortas: 1 };
  const { corpo } = await chamar('POST', '/paricao', base);
  try {
    const antes = filhos(corpo.id);
    const borrego = antes.nascimentos.find((n) => n.categoria === 'Borrego');
    const borrega = antes.nascimentos.find((n) => n.categoria === 'Borrega');
    const idsBorrego = transicoes(borrego.id).map((t) => t.id);
    const idsBorrega = JSON.stringify(transicoes(borrega.id));
    assert.deepEqual([linha('Ovelha', 2026, 8).obitos, linha('Ovelha', 2026, 8).total], [1, 99]);

    // 12 borregos, sem ovelha morta: o borrego é refeito, a borrega fica intocada, o óbito some
    const res = await chamar('PUT', `/paricao/${corpo.id}`, { ...base, borregos_vivos: 12, ovelhas_mortas: 0 });
    assert.equal(res.status, 200);
    const meio = filhos(corpo.id);
    const borregoNovo = meio.nascimentos.find((n) => n.categoria === 'Borrego');
    assert.equal(borregoNovo.id, borrego.id);
    assert.equal(borregoNovo.quantidade, 12);
    assert.deepEqual(transicoes(borrego.id).map((t) => t.quantidade), [12, 12]);
    assert.notDeepEqual(transicoes(borrego.id).map((t) => t.id), idsBorrego); // transições regeradas
    assert.equal(JSON.stringify(transicoes(borrega.id)), idsBorrega); // a borrega não foi tocada
    assert.equal(meio.obitos.length, 0);
    assert.deepEqual([linha('Ovelha', 2026, 8).obitos, linha('Ovelha', 2026, 8).total], [0, 100]);
    assert.deepEqual([linha('Borrego', 2026, 8).nascimentos, linha('Borrego', 2026, 8).total], [12, 12]);

    // mudar o mês move todos os filhos juntos, mantendo os ids
    await chamar('PUT', `/paricao/${corpo.id}`, { ...base, data: '2026-09-10', borregos_vivos: 12, ovelhas_mortas: 0 });
    const fim = filhos(corpo.id);
    assert.deepEqual(fim.nascimentos.map((n) => n.id).sort(), meio.nascimentos.map((n) => n.id).sort());
    assert.deepEqual([linha('Borrego', 2026, 8).nascimentos, linha('Borrego', 2026, 8).total], [0, 0]);
    assert.deepEqual([linha('Borrego', 2026, 9).nascimentos, linha('Borrego', 2026, 9).total], [12, 12]);
    assert.deepEqual([linha('Borrega', 2026, 9).nascimentos, linha('Borrega', 2026, 9).total], [7, 7]);
    assert.equal(cadeia(borrego.id)[0], 'Borrego→Marrão 12/2026');
  } finally {
    await chamar('DELETE', `/paricao/${corpo.id}`);
  }
});

test('"Lançar no rebanho" desmarcado guarda só as estatísticas e pode ser ligado e desligado', async () => {
  await semearOvelha();
  const base = { data: '2026-03-10', ovelhas: 3, borregos_vivos: 2, borregas_vivas: 1, ovelhas_mortas: 1 };
  const { corpo } = await chamar('POST', '/paricao', { ...base, aplicar_no_rebanho: false });
  assert.equal(corpo.avisos.length, 0);
  try {
    assert.deepEqual(filhos(corpo.id), { nascimentos: [], obitos: [] });
    assert.equal(linha('Borrego', 2026, 3), undefined);
    assert.equal(linha('Ovelha', 2026, 3).obitos, 0);
    const salva = (await chamar('GET', '/paricoes?especie=ovino')).corpo[0];
    assert.equal(salva.aplicado_no_rebanho, false);

    // editar SEM informar aplicar_no_rebanho mantém "só estatística" (não vira lançada no rebanho)
    const semCampo = await chamar('PUT', `/paricao/${corpo.id}`, { ...base, abortos: 2 });
    assert.equal(semCampo.status, 200);
    assert.deepEqual(filhos(corpo.id), { nascimentos: [], obitos: [] });
    assert.equal((await chamar('GET', '/paricoes?especie=ovino')).corpo[0].aplicado_no_rebanho, false);
    assert.equal(linha('Ovelha', 2026, 3).obitos, 0);

    assert.equal((await chamar('PUT', `/paricao/${corpo.id}`, { ...base, aplicar_no_rebanho: true })).status, 200);
    const ligado = filhos(corpo.id);
    assert.deepEqual(ligado.nascimentos.map((n) => [n.categoria, n.quantidade]), [['Borrega', 1], ['Borrego', 2]]);
    assert.deepEqual(ligado.obitos.map((o) => o.quantidade), [1]);
    assert.deepEqual([linha('Ovelha', 2026, 3).obitos, linha('Ovelha', 2026, 3).total], [1, 99]);

    await chamar('PUT', `/paricao/${corpo.id}`, { ...base, aplicar_no_rebanho: false });
    assert.deepEqual(filhos(corpo.id), { nascimentos: [], obitos: [] });
    assert.deepEqual([linha('Ovelha', 2026, 3).obitos, linha('Ovelha', 2026, 3).total], [0, 100]);
    assert.equal(linha('Borrego', 2026, 3).nascimentos, 0);
  } finally {
    await chamar('DELETE', `/paricao/${corpo.id}`);
  }
});

test('avisa quando o mês já tem nascimentos vindos da planilha (contagem em dobro)', async () => {
  await semearOvelha();
  // como a planilha importada: 8 borregos já contados em junho/2026
  await chamar('POST', '/snapshot', {
    especie: 'ovino', categoria: 'Borrego', ano: 2026, mes: 6, nascimentos: 8, total: 8,
  });

  const res = await chamar('POST', '/paricao', { data: '2026-06-12', ovelhas: 3, borregos_vivos: 3 });
  assert.equal(res.status, 201);
  try {
    assert.equal(res.corpo.avisos.length, 1);
    assert.match(res.corpo.avisos[0], /Borrego já tinha 8 nascimento\(s\) em 06\/2026 vindo\(s\) da planilha/);

    // editar a própria parição não vira "duplicidade" nova: o resíduo continua sendo só o da planilha
    const edicao = await chamar('PUT', `/paricao/${res.corpo.id}`, { data: '2026-06-12', ovelhas: 3, borregos_vivos: 3, abortos: 1 });
    assert.match(edicao.corpo.avisos.join(' '), /Borrego já tinha 8 nascimento/);
  } finally {
    await chamar('DELETE', `/paricao/${res.corpo.id}`);
  }

  // só estatística: nada é aplicado, então não há o que avisar
  const soEstatistica = await chamar('POST', '/paricao', { data: '2026-06-12', ovelhas: 3, borregos_vivos: 3, aplicar_no_rebanho: false });
  assert.deepEqual(soEstatistica.corpo.avisos, []);
  await chamar('DELETE', `/paricao/${soEstatistica.corpo.id}`);
});

test('validações recusam com 400 e não deixam rastro (rollback total)', async () => {
  await semearOvelha();
  const antes = [contar('rebanho_paricoes'), contar('rebanho_nascimentos'), contar('rebanho_obitos'), contar('rebanho_snapshots')];
  const base = { data: '2026-05-10', ovelhas: 5, borregos_vivos: 2, crias: 2 };

  const casos = [
    ['data inválida', { ...base, data: '2026-02-30' }],
    ['ano fora de 2000..2100', { ...base, data: '1999-05-10' }],
    ['mais de 12 meses à frente', { ...base, data: '2100-01-01' }],
    ['contagem negativa', { ...base, mortes: -1 }],
    ['contagem fracionada', { ...base, mortes: 1.5 }],
    ['notação científica em texto', { ...base, mortes: '1e3' }],
    ['hexadecimal em texto', { ...base, mortes: '0x10' }],
    ['booleano', { ...base, mortes: true }],
    ['lista', { ...base, mortes: [3] }],
    ['acima do teto', { ...base, mortes: 10000 }],
    ['vivos acima das crias', { data: '2026-05-10', crias: 5, borregos_vivos: 4, borregas_vivas: 3 }],
    ['parição vazia', { data: '2026-05-10' }],
    ['aplicar_no_rebanho inválido', { ...base, aplicar_no_rebanho: 'sim' }],
    ['mês anterior ao primeiro registro de ovinos', { ...base, data: '2025-06-10' }],
    // vivos válidos + óbito de ovelha acima do saldo: tudo é desfeito, inclusive os nascimentos
    ['ovelhas mortas acima do saldo', { ...base, ovelhas: 200, ovelhas_mortas: 150 }],
  ];
  for (const [descricao, corpo] of casos) {
    const res = await chamar('POST', '/paricao', corpo);
    assert.equal(res.status, 400, descricao);
  }

  const saldo = await chamar('POST', '/paricao', { ...base, ovelhas: 200, ovelhas_mortas: 150 });
  assert.match(saldo.corpo.erro, /saldo insuficiente de Ovelha em 05\/2026 \(disponível: 100\).*Lançar no rebanho/);
  const anterior = await chamar('POST', '/paricao', { ...base, data: '2025-06-10' });
  assert.match(anterior.corpo.erro, /a partir de 01\/2026.*só as estatísticas/);

  assert.deepEqual(
    [contar('rebanho_paricoes'), contar('rebanho_nascimentos'), contar('rebanho_obitos'), contar('rebanho_snapshots')],
    antes
  );
  // (linhas zeradas de testes anteriores podem existir; o que importa é que nada foi somado)
  assert.equal(linha('Borrego', 2026, 5)?.nascimentos ?? 0, 0);
  assert.equal(linha('Ovelha', 2026, 5).obitos, 0);

  // mês pré-sistema só como estatística é aceito
  const estatistica = await chamar('POST', '/paricao', { ...base, data: '2025-06-10', aplicar_no_rebanho: false });
  assert.equal(estatistica.status, 201);
  await chamar('DELETE', `/paricao/${estatistica.corpo.id}`);

  assert.equal((await chamar('PUT', '/paricao/99999', base)).status, 404);
});

test('crias e total de mortos ausentes são derivados; números que não fecham viram avisos', async () => {
  // aleijados entram no total de mortos (como na planilha): 0 + 1 + 2 = 3; crias = 10 + 7 + 3
  const derivada = await chamar('POST', '/paricao', {
    data: '2026-07-10', borregos_vivos: 10, borregas_vivas: 7, mortes: 1, aleijados: 2, aplicar_no_rebanho: false,
  });
  assert.equal(derivada.status, 201);
  assert.deepEqual(derivada.corpo.avisos, []);
  const salva = (await chamar('GET', '/paricoes?especie=ovino')).corpo.find((p) => p.id === derivada.corpo.id);
  assert.deepEqual([salva.total_mortos, salva.crias], [3, 20]);

  const incoerente = await chamar('POST', '/paricao', {
    data: '2026-04-10', ovelhas: 2, crias: 20, borregos_vivos: 10, borregas_vivas: 7, total_mortos: 1,
    ovelhas_mortas: 3, partos_duplos: 5, aplicar_no_rebanho: false,
  });
  assert.equal(incoerente.status, 201); // nenhum desses é impossível: só avisa
  const textos = incoerente.corpo.avisos.join('\n');
  assert.match(textos, /Total de mortos \(1\) difere de natimortos \+ mortes \+ aleijados \(0\)/);
  assert.match(textos, /Crias \(20\) difere de .* \(18\)/);
  assert.match(textos, /Ovelhas mortas \(3\) é maior que as ovelhas que pariram \(2\)/);
  assert.match(textos, /Partos duplos \(5\) é maior que as ovelhas que pariram \(2\)/);

  // outra parição no mesmo mês também avisa
  const mesmoMes = await chamar('POST', '/paricao', { data: '2026-04-25', ovelhas: 1, aplicar_no_rebanho: false });
  assert.match(mesmoMes.corpo.avisos.join('\n'), /Já existe parição registrada em 04\/2026/);

  // texto numérico é aceito (formulários HTML enviam string)
  const texto = await chamar('POST', '/paricao', { data: '2026-02-10', ovelhas: '4', borregos_vivos: '3', aplicar_no_rebanho: false });
  assert.equal(texto.status, 201);

  for (const p of [derivada, incoerente, mesmoMes, texto]) await chamar('DELETE', `/paricao/${p.corpo.id}`);
});
