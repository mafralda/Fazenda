const express = require('express');
const db = require('../db');

const router = express.Router();

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const ORDEM_CATEGORIAS = {
  bovino: ['Bezerro', 'Bezerra', 'Garrote', 'Garrota', 'Novilho', 'Novilha', 'Vaca', 'Touro'],
  ovino: ['Borrego', 'Borrega', 'Marrão', 'Marrã', 'Ovelha', 'Reprodutor'],
};

// Cadeia de maturação por espécie/categoria de nascimento: quantos meses após o
// nascimento cada transição acontece, e para qual categoria o animal vai.
const CADEIAS_MATURACAO = {
  ovino: {
    Borrego: [
      { meses: 12, categoria: 'Marrão' },
      { meses: 24, categoria: 'Reprodutor' },
    ],
    Borrega: [
      { meses: 12, categoria: 'Marrã' },
      { meses: 24, categoria: 'Ovelha' },
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

// Garante que existe uma linha de snapshot pra (especie,categoria,ano,mes),
// preenchendo com "carry-forward" (sem mudança) qualquer mês entre o último
// registro existente e o mês pedido.
function garantirLinha(especie, categoria, ano, mes) {
  const existente = db
    .prepare('SELECT * FROM rebanho_snapshots WHERE especie=? AND categoria=? AND ano=? AND mes=?')
    .get(especie, categoria, ano, mes);
  if (existente) return existente;

  const anterior = db
    .prepare(
      `SELECT * FROM rebanho_snapshots
       WHERE especie=? AND categoria=? AND (ano < ? OR (ano = ? AND mes < ?))
       ORDER BY ano DESC, mes DESC LIMIT 1`
    )
    .get(especie, categoria, ano, ano, mes);

  let anoIter;
  let mesIter;
  let totalCorrente;

  if (anterior) {
    anoIter = anterior.ano;
    mesIter = anterior.mes;
    totalCorrente = anterior.total;
  } else {
    anoIter = mes === 1 ? ano - 1 : ano;
    mesIter = mes === 1 ? 12 : mes - 1;
    totalCorrente = 0;
  }

  const inserir = db.prepare(
    `INSERT INTO rebanho_snapshots
      (especie, categoria, ano, mes, saldo_anterior, evolucao, obitos, vendas, subtotal, nascimentos, total)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, 0, ?)`
  );

  while (anoIter < ano || (anoIter === ano && mesIter < mes)) {
    mesIter++;
    if (mesIter > 12) {
      mesIter = 1;
      anoIter++;
    }
    const jaExiste = db
      .prepare('SELECT total FROM rebanho_snapshots WHERE especie=? AND categoria=? AND ano=? AND mes=?')
      .get(especie, categoria, anoIter, mesIter);
    if (jaExiste) {
      totalCorrente = jaExiste.total;
    } else {
      inserir.run(especie, categoria, anoIter, mesIter, totalCorrente, totalCorrente, totalCorrente);
    }
  }

  return db
    .prepare('SELECT * FROM rebanho_snapshots WHERE especie=? AND categoria=? AND ano=? AND mes=?')
    .get(especie, categoria, ano, mes);
}

// Propaga uma variação de total pros meses SEGUINTES já existentes (o saldo
// anterior de cada um desliza pela mesma quantidade). Usar delta (em vez de
// recalcular por fórmula) preserva qualquer peculiaridade que já existisse nos
// dados importados da planilha original (ex.: subtotal que não bate com
// saldo_anterior-evolução por causa de ajuste manual do dono do rebanho).
function propagarDelta(especie, categoria, anoInicio, mesInicio, delta) {
  if (!delta) return;
  db.prepare(
    `UPDATE rebanho_snapshots SET saldo_anterior = saldo_anterior + ?, subtotal = subtotal + ?, total = total + ?
     WHERE especie=? AND categoria=? AND (ano > ? OR (ano = ? AND mes > ?))`
  ).run(delta, delta, delta, especie, categoria, anoInicio, anoInicio, mesInicio);
}

const CAMPOS_AJUSTAVEIS = new Set(['nascimentos', 'evolucao']);

// nascimentos entra só no total (subtotal é "antes dos nascimentos" por
// definição da planilha); evolução entra no subtotal e por consequência no total.
function aplicarAjuste(especie, categoria, ano, mes, campo, delta) {
  if (!CAMPOS_AJUSTAVEIS.has(campo)) throw new Error(`Campo não ajustável: ${campo}`);
  garantirLinha(especie, categoria, ano, mes);

  if (campo === 'nascimentos') {
    db.prepare(
      `UPDATE rebanho_snapshots SET nascimentos = nascimentos + ?, total = total + ?
       WHERE especie=? AND categoria=? AND ano=? AND mes=?`
    ).run(delta, delta, especie, categoria, ano, mes);
  } else {
    db.prepare(
      `UPDATE rebanho_snapshots SET evolucao = evolucao + ?, subtotal = subtotal + ?, total = total + ?
       WHERE especie=? AND categoria=? AND ano=? AND mes=?`
    ).run(delta, delta, delta, especie, categoria, ano, mes);
  }

  propagarDelta(especie, categoria, ano, mes, delta);
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

  const linhas = db
    .prepare('SELECT * FROM rebanho_snapshots WHERE especie = ? AND ano = ?')
    .all(especie, ano);

  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const doMes = linhas.filter((l) => l.mes === mes);
    const porCategoria = {};
    let totalGeral = 0;
    for (const c of categorias) {
      const linha = doMes.find((l) => l.categoria === c);
      porCategoria[c] = linha ? linha.total : null;
      if (linha) totalGeral += linha.total;
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

  const porCategoria = categorias.map((c) => {
    const linha = linhas.find((l) => l.categoria === c);
    return (
      linha || {
        categoria: c,
        saldo_anterior: 0,
        evolucao: 0,
        obitos: 0,
        vendas: 0,
        subtotal: 0,
        nascimentos: 0,
        total: 0,
      }
    );
  });

  const totais = porCategoria.reduce(
    (acc, l) => {
      acc.saldo_anterior += l.saldo_anterior;
      acc.obitos += l.obitos;
      acc.vendas += l.vendas;
      acc.subtotal += l.subtotal;
      acc.nascimentos += l.nascimentos;
      acc.total += l.total;
      return acc;
    },
    { saldo_anterior: 0, obitos: 0, vendas: 0, subtotal: 0, nascimentos: 0, total: 0 }
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
      (especie, categoria, ano, mes, saldo_anterior, evolucao, obitos, vendas, subtotal, nascimentos, total)
     VALUES (@especie, @categoria, @ano, @mes, @saldo_anterior, @evolucao, @obitos, @vendas, @subtotal, @nascimentos, @total)
     ON CONFLICT(especie, categoria, ano, mes) DO UPDATE SET
       saldo_anterior = excluded.saldo_anterior,
       evolucao = excluded.evolucao,
       obitos = excluded.obitos,
       vendas = excluded.vendas,
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

router.post('/nascimento', (req, res) => {
  const { especie, categoria, quantidade, data, observacoes } = req.body;

  if (!especie || !['bovino', 'ovino'].includes(especie)) {
    return res.status(400).json({ erro: 'especie deve ser "bovino" ou "ovino"' });
  }
  const cadeia = CADEIAS_MATURACAO[especie]?.[categoria];
  if (!cadeia) {
    return res.status(400).json({ erro: `categoria de nascimento inválida para ${especie}` });
  }
  if (!quantidade || Number(quantidade) <= 0) {
    return res.status(400).json({ erro: 'quantidade deve ser maior que zero' });
  }
  if (!data) {
    return res.status(400).json({ erro: 'data é obrigatória' });
  }

  const qtd = Number(quantidade);
  const info = db
    .prepare('INSERT INTO rebanho_nascimentos (especie, categoria, quantidade, data, observacoes) VALUES (?, ?, ?, ?, ?)')
    .run(especie, categoria, qtd, data, observacoes || null);
  const nascimentoId = info.lastInsertRowid;

  const [anoNasc, mesNasc] = data.split('-').map(Number);
  aplicarAjuste(especie, categoria, anoNasc, mesNasc, 'nascimentos', qtd);

  const inserirTransicao = db.prepare(
    `INSERT INTO rebanho_transicoes (especie, categoria_origem, categoria_destino, quantidade, ano, mes, nascimento_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  let categoriaAtual = categoria;
  for (const etapa of cadeia) {
    const { ano, mes } = somarMeses(data, etapa.meses);
    aplicarAjuste(especie, categoriaAtual, ano, mes, 'evolucao', -qtd);
    aplicarAjuste(especie, etapa.categoria, ano, mes, 'evolucao', qtd);
    inserirTransicao.run(especie, categoriaAtual, etapa.categoria, qtd, ano, mes, nascimentoId);
    categoriaAtual = etapa.categoria;
  }

  res.status(201).json({ ok: true, id: nascimentoId });
});

router.delete('/nascimento/:id', (req, res) => {
  const nascimento = db.prepare('SELECT * FROM rebanho_nascimentos WHERE id = ?').get(req.params.id);
  if (!nascimento) return res.status(404).json({ erro: 'nascimento não encontrado' });

  const [anoNasc, mesNasc] = nascimento.data.split('-').map(Number);
  aplicarAjuste(nascimento.especie, nascimento.categoria, anoNasc, mesNasc, 'nascimentos', -nascimento.quantidade);

  const transicoes = db.prepare('SELECT * FROM rebanho_transicoes WHERE nascimento_id = ?').all(nascimento.id);
  for (const t of transicoes) {
    aplicarAjuste(t.especie, t.categoria_origem, t.ano, t.mes, 'evolucao', t.quantidade);
    aplicarAjuste(t.especie, t.categoria_destino, t.ano, t.mes, 'evolucao', -t.quantidade);
  }

  db.prepare('DELETE FROM rebanho_transicoes WHERE nascimento_id = ?').run(nascimento.id);
  db.prepare('DELETE FROM rebanho_nascimentos WHERE id = ?').run(nascimento.id);

  res.status(204).send();
});

router.get('/historico', validarEspecie, (req, res) => {
  const { especie } = req.query;

  const nascimentos = db
    .prepare('SELECT * FROM rebanho_nascimentos WHERE especie = ? ORDER BY data DESC')
    .all(especie);
  const transicoes = db
    .prepare('SELECT * FROM rebanho_transicoes WHERE especie = ? ORDER BY ano DESC, mes DESC')
    .all(especie);

  const eventos = [
    ...nascimentos.map((n) => ({
      tipo: 'nascimento',
      data: n.data,
      categoria: n.categoria,
      quantidade: n.quantidade,
      observacoes: n.observacoes,
      id: n.id,
    })),
    ...transicoes.map((t) => ({
      tipo: 'transicao',
      data: `${t.ano}-${String(t.mes).padStart(2, '0')}-01`,
      categoria_origem: t.categoria_origem,
      categoria_destino: t.categoria_destino,
      quantidade: t.quantidade,
      id: t.id,
    })),
  ];

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
