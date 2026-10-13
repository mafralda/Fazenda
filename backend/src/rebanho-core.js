// Núcleo do rebanho compartilhado entre as rotas (rebanho e lançamentos):
// ajuste dos snapshots mensais por categoria e validações comuns.
const db = require('./db');

const ORDEM_CATEGORIAS = {
  bovino: ['Bezerro', 'Bezerra', 'Garrote', 'Garrota', 'Novilho', 'Novilha', 'Vaca', 'Touro'],
  ovino: ['Borrego', 'Borrega', 'Marrão', 'Marrã', 'Ovelha', 'Reprodutor'],
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

module.exports = {
  ORDEM_CATEGORIAS,
  ErroNegocio,
  executar,
  dataISOValida,
  inteiroPositivo,
  exigirAnoPlausivel,
  aplicarAjuste,
  avisosDeSaldo,
};
