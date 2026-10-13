const express = require('express');
const db = require('../db');
const {
  ORDEM_CATEGORIAS,
  ErroNegocio,
  executar,
  dataISOValida,
  inteiroPositivo,
  exigirAnoPlausivel,
  aplicarAjuste,
  avisosDeSaldo,
} = require('../rebanho-core');

const router = express.Router();

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Cadeia de maturação por espécie/categoria de nascimento: quantos meses após o
// nascimento cada transição acontece, e para qual categoria o animal vai.
const CADEIAS_MATURACAO = {
  // `meses` conta a partir do nascimento. Reprodutor NÃO entra na cadeia: o carneiro só
  // vira reprodutor se for promovido ao posto (decisão em aberto — ver ARQUITETURA.md 4.3).
  ovino: {
    Borrego: [
      { meses: 3, categoria: 'Marrão' },
      { meses: 12, categoria: 'Carneiro' },
    ],
    Borrega: [
      { meses: 3, categoria: 'Marrã' },
      { meses: 12, categoria: 'Ovelha' },
    ],
  },
  bovino: {
    Bezerro: [
      { meses: 12, categoria: 'Garrote' },
      { meses: 24, categoria: 'Novilho' },
      { meses: 36, categoria: 'Touro' },
    ],
    Bezerra: [
      { meses: 12, categoria: 'Garrota' },
      { meses: 24, categoria: 'Novilha' },
      { meses: 36, categoria: 'Vaca' },
    ],
  },
};

function validarEspecie(req, res, next) {
  const { especie } = req.query;
  if (!especie || !['bovino', 'ovino'].includes(especie)) {
    return res.status(400).json({ erro: 'parâmetro especie deve ser "bovino" ou "ovino"' });
  }
  next();
}

function somarMeses(dataISO, quantidadeMeses) {
  const [ano, mes] = dataISO.split('-').map(Number);
  const totalMeses = ano * 12 + (mes - 1) + quantidadeMeses;
  return { ano: Math.floor(totalMeses / 12), mes: (totalMeses % 12) + 1 };
}

function lerQuantidadeEData(corpo) {
  const quantidade = inteiroPositivo(corpo.quantidade);
  if (quantidade === null) {
    throw new ErroNegocio('quantidade deve ser um número inteiro maior que zero');
  }
  if (!dataISOValida(corpo.data)) {
    throw new ErroNegocio('data deve ser uma data válida no formato AAAA-MM-DD');
  }
  exigirAnoPlausivel(Number(corpo.data.slice(0, 4)), 'ano da data');
  return { quantidade, data: corpo.data };
}

function categoriasDaCadeia(especie, categoria) {
  return [categoria, ...CADEIAS_MATURACAO[especie][categoria].map((etapa) => etapa.categoria)];
}

function lerEspecie(corpo) {
  if (!corpo.especie || !['bovino', 'ovino'].includes(corpo.especie)) {
    throw new ErroNegocio('especie deve ser "bovino" ou "ovino"');
  }
  return corpo.especie;
}

function lerCategoriaNascimento(especie, categoria) {
  const cadeia = CADEIAS_MATURACAO[especie]?.[categoria];
  if (!cadeia) throw new ErroNegocio(`categoria de nascimento inválida para ${especie}`);
  return cadeia;
}

function lerCategoriaRebanho(especie, categoria) {
  if (!ORDEM_CATEGORIAS[especie].includes(categoria)) {
    throw new ErroNegocio(`categoria inválida para ${especie}`);
  }
}

function textoOuNulo(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto || null;
}

router.get('/anos', validarEspecie, (req, res) => {
  const linhas = db
    .prepare('SELECT DISTINCT ano FROM rebanho_snapshots WHERE especie = ? ORDER BY ano DESC')
    .all(req.query.especie);
  res.json(linhas.map((l) => l.ano));
});

router.get('/serie', validarEspecie, (req, res) => {
  const { especie } = req.query;
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const categorias = ORDEM_CATEGORIAS[especie];

  // Uma categoria sem linha num mês que tem dados (ex.: só Borrego e Marrão ganharam linha
  // por causa de um nascimento) mantém o último total conhecido — senão o total geral do
  // mês "despencaria" por falta das outras categorias. Antes do primeiro registro, null.
  const todas = db
    .prepare('SELECT categoria, ano, mes, total FROM rebanho_snapshots WHERE especie = ? AND ano <= ? ORDER BY ano, mes')
    .all(especie, ano);
  const ultimoTotal = {};
  for (const l of todas) if (l.ano < ano) ultimoTotal[l.categoria] = l.total;
  const linhas = todas.filter((l) => l.ano === ano);

  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const doMes = linhas.filter((l) => l.mes === mes);
    for (const l of doMes) ultimoTotal[l.categoria] = l.total;
    const porCategoria = {};
    let totalGeral = 0;
    for (const c of categorias) {
      const total = doMes.length ? ultimoTotal[c] ?? null : null; // mês sem dados segue todo null
      porCategoria[c] = total;
      if (total !== null) totalGeral += total;
    }
    return {
      mes: String(mes).padStart(2, '0'),
      nome: NOMES_MES[i],
      tem_dados: doMes.length > 0,
      total_geral: doMes.length > 0 ? totalGeral : null,
      por_categoria: porCategoria,
    };
  });

  res.json({ especie, ano, categorias, meses });
});

router.get('/mes', validarEspecie, (req, res) => {
  const { especie } = req.query;
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const mes = Number(req.query.mes) || new Date().getMonth() + 1;
  const categorias = ORDEM_CATEGORIAS[especie];

  const linhas = db
    .prepare('SELECT * FROM rebanho_snapshots WHERE especie = ? AND ano = ? AND mes = ?')
    .all(especie, ano, mes);

  // Categoria sem linha num mês que TEM dados: carrega o último total conhecido (sem
  // movimento no mês). Mês sem nenhum dado continua zerado.
  const ultimaLinhaAntes = db.prepare(
    `SELECT total FROM rebanho_snapshots
     WHERE especie = ? AND categoria = ? AND (ano < ? OR (ano = ? AND mes < ?))
     ORDER BY ano DESC, mes DESC LIMIT 1`
  );
  const porCategoria = categorias.map((c) => {
    const linha = linhas.find((l) => l.categoria === c);
    if (linha) return linha;
    const total = linhas.length ? ultimaLinhaAntes.get(especie, c, ano, ano, mes)?.total ?? 0 : 0;
    return {
      categoria: c,
      saldo_anterior: total,
      evolucao: 0,
      obitos: 0,
      vendas: 0,
      compras: 0,
      subtotal: total,
      nascimentos: 0,
      total,
    };
  });

  const totais = porCategoria.reduce(
    (acc, l) => {
      acc.saldo_anterior += l.saldo_anterior;
      acc.obitos += l.obitos;
      acc.vendas += l.vendas;
      acc.compras += l.compras;
      acc.subtotal += l.subtotal;
      acc.nascimentos += l.nascimentos;
      acc.total += l.total;
      return acc;
    },
    { saldo_anterior: 0, obitos: 0, vendas: 0, compras: 0, subtotal: 0, nascimentos: 0, total: 0 }
  );

  const nota = db
    .prepare('SELECT texto FROM rebanho_notas WHERE especie = ? AND ano = ? AND mes = ?')
    .get(especie, ano, mes);

  res.json({
    especie,
    ano,
    mes: String(mes).padStart(2, '0'),
    nome_mes: NOMES_MES[mes - 1],
    categorias: porCategoria,
    totais,
    tem_dados: linhas.length > 0,
    nota: nota ? nota.texto : null,
  });
});

router.post('/snapshot', (req, res) => {
  const {
    especie,
    categoria,
    ano,
    mes,
    saldo_anterior,
    evolucao,
    obitos,
    vendas,
    compras,
    subtotal,
    nascimentos,
    total,
  } = req.body;

  if (!especie || !['bovino', 'ovino'].includes(especie)) {
    return res.status(400).json({ erro: 'especie deve ser "bovino" ou "ovino"' });
  }
  if (!categoria || !ano || !mes) {
    return res.status(400).json({ erro: 'categoria, ano e mes são obrigatórios' });
  }

  db.prepare(
    `INSERT INTO rebanho_snapshots
      (especie, categoria, ano, mes, saldo_anterior, evolucao, obitos, vendas, compras, subtotal, nascimentos, total)
     VALUES (@especie, @categoria, @ano, @mes, @saldo_anterior, @evolucao, @obitos, @vendas, @compras, @subtotal, @nascimentos, @total)
     ON CONFLICT(especie, categoria, ano, mes) DO UPDATE SET
       saldo_anterior = excluded.saldo_anterior,
       evolucao = excluded.evolucao,
       obitos = excluded.obitos,
       vendas = excluded.vendas,
       compras = excluded.compras,
       subtotal = excluded.subtotal,
       nascimentos = excluded.nascimentos,
       total = excluded.total`
  ).run({
    especie,
    categoria,
    ano,
    mes,
    saldo_anterior: saldo_anterior || 0,
    evolucao: evolucao || 0,
    obitos: obitos || 0,
    vendas: vendas || 0,
    compras: compras || 0,
    subtotal: subtotal || 0,
    nascimentos: nascimentos || 0,
    total: total || 0,
  });

  res.status(201).json({ ok: true });
});

router.get('/categorias-nascimento', validarEspecie, (req, res) => {
  const cadeias = CADEIAS_MATURACAO[req.query.especie];
  res.json(
    Object.entries(cadeias).map(([categoria, etapas]) => ({
      categoria,
      proxima_transicao: etapas[0],
    }))
  );
});

router.get('/categorias', validarEspecie, (req, res) => {
  res.json(ORDEM_CATEGORIAS[req.query.especie]);
});

// Aplica no snapshot o nascimento (já gravado em rebanho_nascimentos) e gera a
// cadeia de transições de maturação.
function aplicarNascimento(id, { especie, categoria, quantidade, data }) {
  const cadeia = CADEIAS_MATURACAO[especie][categoria];
  const [anoNasc, mesNasc] = data.split('-').map(Number);
  aplicarAjuste(especie, categoria, anoNasc, mesNasc, 'nascimentos', quantidade);

  const inserirTransicao = db.prepare(
    `INSERT INTO rebanho_transicoes (especie, categoria_origem, categoria_destino, quantidade, ano, mes, nascimento_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  let categoriaAtual = categoria;
  for (const etapa of cadeia) {
    const { ano, mes } = somarMeses(data, etapa.meses);
    aplicarAjuste(especie, categoriaAtual, ano, mes, 'evolucao', -quantidade);
    aplicarAjuste(especie, etapa.categoria, ano, mes, 'evolucao', quantidade);
    inserirTransicao.run(especie, categoriaAtual, etapa.categoria, quantidade, ano, mes, id);
    categoriaAtual = etapa.categoria;
  }
}

// Desfaz o efeito de um nascimento no snapshot e apaga as transições dele
// (a linha em rebanho_nascimentos é mantida: quem chama decide se apaga ou atualiza).
function reverterNascimento(nascimento) {
  const [anoNasc, mesNasc] = nascimento.data.split('-').map(Number);
  aplicarAjuste(nascimento.especie, nascimento.categoria, anoNasc, mesNasc, 'nascimentos', -nascimento.quantidade);

  const transicoes = db.prepare('SELECT * FROM rebanho_transicoes WHERE nascimento_id = ?').all(nascimento.id);
  for (const t of transicoes) {
    aplicarAjuste(t.especie, t.categoria_origem, t.ano, t.mes, 'evolucao', t.quantidade);
    aplicarAjuste(t.especie, t.categoria_destino, t.ano, t.mes, 'evolucao', -t.quantidade);
  }
  db.prepare('DELETE FROM rebanho_transicoes WHERE nascimento_id = ?').run(nascimento.id);
}

router.post('/nascimento', (req, res) => {
  executar(res, () => {
    const especie = lerEspecie(req.body);
    lerCategoriaNascimento(especie, req.body.categoria);
    const { quantidade, data } = lerQuantidadeEData(req.body);
    const dados = { especie, categoria: req.body.categoria, quantidade, data };

    const id = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO rebanho_nascimentos (especie, categoria, quantidade, data, observacoes) VALUES (?, ?, ?, ?, ?)')
        .run(especie, dados.categoria, quantidade, data, textoOuNulo(req.body.observacoes));
      aplicarNascimento(info.lastInsertRowid, dados);
      return info.lastInsertRowid;
    })();

    res.status(201).json({ ok: true, id });
  });
});

// Editar categoria/quantidade/data refaz o efeito no snapshot e REGERA as
// transições (edições manuais nelas se perdem). Se só as observações mudaram,
// o snapshot e as transições não são tocados. A espécie não muda.
router.put('/nascimento/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM rebanho_nascimentos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'nascimento não encontrado' });

  executar(res, () => {
    lerCategoriaNascimento(existente.especie, req.body.categoria);
    const { quantidade, data } = lerQuantidadeEData(req.body);
    const novo = { ...existente, categoria: req.body.categoria, quantidade, data };
    const mudouEfeito =
      novo.categoria !== existente.categoria || novo.quantidade !== existente.quantidade || novo.data !== existente.data;

    db.transaction(() => {
      if (mudouEfeito) reverterNascimento(existente);
      db.prepare('UPDATE rebanho_nascimentos SET categoria=?, quantidade=?, data=?, observacoes=? WHERE id=?').run(
        novo.categoria,
        novo.quantidade,
        novo.data,
        textoOuNulo(req.body.observacoes),
        existente.id
      );
      if (mudouEfeito) aplicarNascimento(existente.id, novo);
    })();

    const avisos = mudouEfeito
      ? avisosDeSaldo(
          existente.especie,
          [
            ...categoriasDaCadeia(existente.especie, existente.categoria),
            ...categoriasDaCadeia(existente.especie, novo.categoria),
          ],
          [existente.data, novo.data]
        )
      : [];
    res.json({ ok: true, id: existente.id, avisos });
  });
});

router.delete('/nascimento/:id', (req, res) => {
  const nascimento = db.prepare('SELECT * FROM rebanho_nascimentos WHERE id = ?').get(req.params.id);
  if (!nascimento) return res.status(404).json({ erro: 'nascimento não encontrado' });

  db.transaction(() => {
    reverterNascimento(nascimento);
    db.prepare('DELETE FROM rebanho_nascimentos WHERE id = ?').run(nascimento.id);
  })();

  const avisos = avisosDeSaldo(nascimento.especie, categoriasDaCadeia(nascimento.especie, nascimento.categoria), [
    nascimento.data,
  ]);
  res.json({ ok: true, avisos });
});

// ---------- Óbitos ----------
//
// O óbito reduz a categoria no mês em que ocorreu e desce para os meses seguintes.
// Ele NÃO cancela transições de maturação já agendadas (o sistema não rastreia
// animal a animal), então um óbito antes de uma transição futura continua
// "evoluindo" a quantidade original. Quando isso deixa algum mês com saldo negativo,
// a resposta traz `avisos` (não bloqueia); ajuste a transição (PUT /transicao/:id).
// Já o saldo do próprio mês do óbito é validado: óbitos > animais existentes dá 400.

function aplicarObito(obito) {
  const [ano, mes] = obito.data.split('-').map(Number);
  aplicarAjuste(obito.especie, obito.categoria, ano, mes, 'obitos', obito.quantidade);

  const { total } = db
    .prepare('SELECT total FROM rebanho_snapshots WHERE especie=? AND categoria=? AND ano=? AND mes=?')
    .get(obito.especie, obito.categoria, ano, mes);
  if (total < 0) {
    throw new ErroNegocio(
      `saldo insuficiente de ${obito.categoria} em ${String(mes).padStart(2, '0')}/${ano} (disponível: ${total + obito.quantidade})`
    );
  }
}

function reverterObito(obito) {
  const [ano, mes] = obito.data.split('-').map(Number);
  aplicarAjuste(obito.especie, obito.categoria, ano, mes, 'obitos', -obito.quantidade);
}

router.post('/obito', (req, res) => {
  executar(res, () => {
    const especie = lerEspecie(req.body);
    lerCategoriaRebanho(especie, req.body.categoria);
    const { quantidade, data } = lerQuantidadeEData(req.body);

    const id = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO rebanho_obitos (especie, categoria, quantidade, data, observacoes) VALUES (?, ?, ?, ?, ?)')
        .run(especie, req.body.categoria, quantidade, data, textoOuNulo(req.body.observacoes));
      aplicarObito({ especie, categoria: req.body.categoria, quantidade, data });
      return info.lastInsertRowid;
    })();

    res.status(201).json({ ok: true, id, avisos: avisosDeSaldo(especie, [req.body.categoria], [data]) });
  });
});

router.put('/obito/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM rebanho_obitos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'óbito não encontrado' });

  executar(res, () => {
    lerCategoriaRebanho(existente.especie, req.body.categoria);
    const { quantidade, data } = lerQuantidadeEData(req.body);
    const novo = { ...existente, categoria: req.body.categoria, quantidade, data };

    db.transaction(() => {
      reverterObito(existente);
      db.prepare('UPDATE rebanho_obitos SET categoria=?, quantidade=?, data=?, observacoes=? WHERE id=?').run(
        novo.categoria,
        novo.quantidade,
        novo.data,
        textoOuNulo(req.body.observacoes),
        existente.id
      );
      aplicarObito(novo);
    })();

    const avisos = avisosDeSaldo(existente.especie, [existente.categoria, novo.categoria], [existente.data, novo.data]);
    res.json({ ok: true, id: existente.id, avisos });
  });
});

router.delete('/obito/:id', (req, res) => {
  const obito = db.prepare('SELECT * FROM rebanho_obitos WHERE id = ?').get(req.params.id);
  if (!obito) return res.status(404).json({ erro: 'óbito não encontrado' });

  db.transaction(() => {
    reverterObito(obito);
    db.prepare('DELETE FROM rebanho_obitos WHERE id = ?').run(obito.id);
  })();

  res.status(204).send();
});

// ---------- Transições (geradas pelos nascimentos; só quantidade e mês são editáveis) ----------

router.put('/transicao/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM rebanho_transicoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'transição não encontrada' });

  executar(res, () => {
    const quantidade = inteiroPositivo(req.body.quantidade);
    if (quantidade === null) {
      throw new ErroNegocio('quantidade deve ser um número inteiro maior que zero');
    }
    const mesTexto = String(req.body.mes_ano || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesTexto)) {
      throw new ErroNegocio('mes_ano deve estar no formato AAAA-MM');
    }
    const [ano, mes] = mesTexto.split('-').map(Number);
    exigirAnoPlausivel(ano, 'ano do mês');

    db.transaction(() => {
      aplicarAjuste(existente.especie, existente.categoria_origem, existente.ano, existente.mes, 'evolucao', existente.quantidade);
      aplicarAjuste(existente.especie, existente.categoria_destino, existente.ano, existente.mes, 'evolucao', -existente.quantidade);
      db.prepare('UPDATE rebanho_transicoes SET quantidade=?, ano=?, mes=? WHERE id=?').run(quantidade, ano, mes, existente.id);
      aplicarAjuste(existente.especie, existente.categoria_origem, ano, mes, 'evolucao', -quantidade);
      aplicarAjuste(existente.especie, existente.categoria_destino, ano, mes, 'evolucao', quantidade);
    })();

    const avisos = avisosDeSaldo(
      existente.especie,
      [existente.categoria_origem, existente.categoria_destino],
      [`${existente.ano}-${String(existente.mes).padStart(2, '0')}`, mesTexto]
    );
    res.json({ ok: true, id: existente.id, avisos });
  });
});

const TIPOS_EVENTO = ['nascimento', 'obito', 'transicao'];

// Filtros opcionais: data_inicio/data_fim (AAAA-MM-DD, inclusivos) e evento
// (nascimento | obito | transicao). Transições só têm mês, então entram quando o
// mês delas cruza o intervalo (comparação por AAAA-MM).
router.get('/historico', validarEspecie, (req, res) => {
  const { especie, data_inicio: dataInicio, data_fim: dataFim, evento } = req.query;

  if (dataInicio && !dataISOValida(dataInicio)) {
    return res.status(400).json({ erro: 'data_inicio deve ser uma data válida no formato AAAA-MM-DD' });
  }
  if (dataFim && !dataISOValida(dataFim)) {
    return res.status(400).json({ erro: 'data_fim deve ser uma data válida no formato AAAA-MM-DD' });
  }
  if (dataInicio && dataFim && dataInicio > dataFim) {
    return res.status(400).json({ erro: 'data_inicio não pode ser posterior a data_fim' });
  }
  if (evento && !TIPOS_EVENTO.includes(evento)) {
    return res.status(400).json({ erro: `evento deve ser um de: ${TIPOS_EVENTO.join(', ')}` });
  }

  const incluir = (tipo) => !evento || evento === tipo;

  function filtroPorData(coluna) {
    const condicoes = [];
    const params = [];
    if (dataInicio) {
      condicoes.push(`${coluna} >= ?`);
      params.push(dataInicio);
    }
    if (dataFim) {
      condicoes.push(`${coluna} <= ?`);
      params.push(dataFim);
    }
    return { sql: condicoes.map((c) => ` AND ${c}`).join(''), params };
  }

  function listarDiarios(tabela) {
    const filtro = filtroPorData('data');
    return db
      .prepare(`SELECT * FROM ${tabela} WHERE especie = ?${filtro.sql} ORDER BY data DESC, id DESC`)
      .all(especie, ...filtro.params);
  }

  const eventos = [];

  if (incluir('nascimento')) {
    for (const n of listarDiarios('rebanho_nascimentos')) {
      eventos.push({
        tipo: 'nascimento',
        data: n.data,
        categoria: n.categoria,
        quantidade: n.quantidade,
        observacoes: n.observacoes,
        id: n.id,
      });
    }
  }

  if (incluir('obito')) {
    for (const o of listarDiarios('rebanho_obitos')) {
      eventos.push({
        tipo: 'obito',
        data: o.data,
        categoria: o.categoria,
        quantidade: o.quantidade,
        observacoes: o.observacoes,
        id: o.id,
      });
    }
  }

  if (incluir('transicao')) {
    const filtro = filtroPorData("printf('%04d-%02d', ano, mes)");
    // transições comparam por mês: o filtro usa só AAAA-MM das datas informadas
    const params = filtro.params.map((p) => p.slice(0, 7));
    const transicoes = db
      .prepare(`SELECT * FROM rebanho_transicoes WHERE especie = ?${filtro.sql} ORDER BY ano DESC, mes DESC, id DESC`)
      .all(especie, ...params);
    for (const t of transicoes) {
      eventos.push({
        tipo: 'transicao',
        data: `${t.ano}-${String(t.mes).padStart(2, '0')}-01`,
        categoria_origem: t.categoria_origem,
        categoria_destino: t.categoria_destino,
        quantidade: t.quantidade,
        id: t.id,
      });
    }
  }

  eventos.sort((a, b) => b.data.localeCompare(a.data));

  res.json(eventos);
});

router.post('/nota', (req, res) => {
  const { especie, ano, mes, texto } = req.body;

  if (!especie || !['bovino', 'ovino'].includes(especie)) {
    return res.status(400).json({ erro: 'especie deve ser "bovino" ou "ovino"' });
  }
  if (!ano || !mes || !texto) {
    return res.status(400).json({ erro: 'ano, mes e texto são obrigatórios' });
  }

  db.prepare(
    `INSERT INTO rebanho_notas (especie, ano, mes, texto)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(especie, ano, mes) DO UPDATE SET texto = excluded.texto`
  ).run(especie, ano, mes, texto);

  res.status(201).json({ ok: true });
});

module.exports = router;