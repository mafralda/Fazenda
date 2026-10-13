// Núcleo do rebanho compartilhado entre as rotas (rebanho e lançamentos):
// ajuste dos snapshots mensais por categoria e validações comuns.
const db = require('./db');

const ORDEM_CATEGORIAS = {
  bovino: ['Bezerro', 'Bezerra', 'Garrote', 'Garrota', 'Novilho', 'Novilha', 'Vaca', 'Touro'],
  ovino: ['Borrego', 'Borrega', 'Marrão', 'Marrã', 'Ovelha', 'Carneiro', 'Reprodutor'],
};

// Erro de regra de negócio/validação: vira 400 e desfaz a transação em andamento.
class ErroNegocio extends Error {}

// Roda `fn` e converte ErroNegocio em resposta 400; qualquer outro erro continua subindo.
function executar(res, fn) {
  try {
    return fn();
  } catch (erro) {
    if (erro instanceof ErroNegocio) return res.status(400).json({ erro: erro.message });
    throw erro;
  }
}

function dataISOValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [ano, mes, dia] = texto.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// garantirLinha preenche mês a mês até a data pedida: sem limite, um ano digitado
// errado (ex.: 9999) geraria dezenas de milhares de linhas.
const ANO_MIN = 2000;
const ANO_MAX = 2100;

// Aceita número ou texto numérico (true, [3] etc. não valem). Devolve null se inválido.
function inteiroPositivo(valor) {
  const numero = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  return typeof numero === 'number' && Number.isInteger(numero) && numero > 0 ? numero : null;
}

function exigirAnoPlausivel(ano, campo) {
  if (ano < ANO_MIN || ano > ANO_MAX) throw new ErroNegocio(`${campo} deve estar entre ${ANO_MIN} e ${ANO_MAX}`);
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

// Como cada coluna do snapshot reage a um ajuste (todas guardadas como número
// positivo, como na planilha): `sinal` é o efeito no total; `noSubtotal` diz se
// o efeito passa pelo subtotal (nascimentos entra só no total, porque o
// subtotal é "antes dos nascimentos" por definição da planilha).
const AJUSTES = {
  nascimentos: { sinal: 1, noSubtotal: false },
  evolucao: { sinal: 1, noSubtotal: true },
  obitos: { sinal: -1, noSubtotal: true },
  vendas: { sinal: -1, noSubtotal: true },
  compras: { sinal: 1, noSubtotal: true },
};

// Soma `delta` à coluna `campo` do mês e reflete no subtotal/total, propagando
// pros meses seguintes. Passe delta negativo para desfazer.
function aplicarAjuste(especie, categoria, ano, mes, campo, delta) {
  if (!Object.hasOwn(AJUSTES, campo)) throw new Error(`Campo não ajustável: ${campo}`);
  const regra = AJUSTES[campo];
  garantirLinha(especie, categoria, ano, mes);

  const efeito = regra.sinal * delta;
  const subtotal = regra.noSubtotal ? 'subtotal = subtotal + ?, ' : '';
  const valores = regra.noSubtotal ? [delta, efeito, efeito] : [delta, efeito];
  db.prepare(
    `UPDATE rebanho_snapshots SET ${campo} = ${campo} + ?, ${subtotal}total = total + ?
     WHERE especie=? AND categoria=? AND ano=? AND mes=?`
  ).run(...valores, especie, categoria, ano, mes);

  propagarDelta(especie, categoria, ano, mes, efeito);
}

// Avisos (não bloqueiam) de categorias que ficaram com total negativo a partir do
// mês mais antigo afetado. Acontece, por exemplo, quando um óbito reduz uma categoria
// que ainda tem transições agendadas de saída: ajuste essas transições no histórico.
function avisosDeSaldo(especie, categorias, datas) {
  const [ano, mes] = datas.map((d) => d.slice(0, 7)).sort()[0].split('-').map(Number);
  const buscar = db.prepare(
    `SELECT ano, mes, total FROM rebanho_snapshots
     WHERE especie=? AND categoria=? AND total < 0 AND (ano > ? OR (ano = ? AND mes >= ?))
     ORDER BY ano, mes LIMIT 1`
  );
  const avisos = [];
  for (const categoria of new Set(categorias)) {
    const ruim = buscar.get(especie, categoria, ano, ano, mes);
    if (ruim) {
      avisos.push(
        `${categoria} fica com saldo negativo (${ruim.total}) em ${String(ruim.mes).padStart(2, '0')}/${ruim.ano}: ajuste as transições ou lançamentos desse período.`
      );
    }
  }
  return avisos;
}

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

function categoriasDaCadeia(especie, categoria) {
  return [categoria, ...CADEIAS_MATURACAO[especie][categoria].map((etapa) => etapa.categoria)];
}

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

module.exports = {
  ORDEM_CATEGORIAS,
  CADEIAS_MATURACAO,
  ErroNegocio,
  executar,
  validarEspecie,
  dataISOValida,
  inteiroPositivo,
  exigirAnoPlausivel,
  somarMeses,
  categoriasDaCadeia,
  aplicarAjuste,
  aplicarNascimento,
  reverterNascimento,
  aplicarObito,
  reverterObito,
  avisosDeSaldo,
};
