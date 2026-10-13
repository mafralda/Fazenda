// Parição (ovinos): o resumo do evento como na planilha ("PARIÇÃO DEZEMBRO": ovelhas, crias,
// borregos/borregas vivos, mortes...). Só três números mexem no rebanho; os demais são estatística:
//   borregos_vivos  -> nascimento de Borrego  (e a cadeia de maturação)
//   borregas_vivas  -> nascimento de Borrega  (e a cadeia de maturação)
//   ovelhas_mortas  -> óbito de Ovelha
// Esses lançamentos "filhos" ficam em rebanho_nascimentos/rebanho_obitos com paricao_id e só
// mudam pela própria parição (ver recusarSeDeParicao em routes/rebanho.js).
const express = require('express');
const db = require('../db');
const {
  ErroNegocio,
  executar,
  validarEspecie,
  dataISOValida,
  exigirAnoPlausivel,
  categoriasDaCadeia,
  aplicarNascimento,
  reverterNascimento,
  aplicarObito,
  reverterObito,
  avisosDeSaldo,
} = require('../rebanho-core');

const router = express.Router();

const ESPECIE = 'ovino';
const MAX_CONTAGEM = 9999;
const MESES_A_FRENTE = 12;

// Campos numéricos, na ordem da planilha, com o rótulo usado nas mensagens de erro.
const CAMPOS = {
  ovelhas: 'ovelhas',
  crias: 'crias',
  borregos_vivos: 'borregos vivos',
  borregas_vivas: 'borregas vivas',
  partos_duplos: 'partos duplos',
  aleijados: 'aleijados',
  natimortos: 'natimortos',
  mortes: 'mortes',
  total_mortos: 'total de mortos',
  ovelhas_mortas: 'ovelhas mortas',
  abortos: 'abortos',
};

const COLUNAS_CONTAGEM = Object.keys(CAMPOS);

function textoOuNulo(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto || null;
}

// Ausente/null/'' devolve null; senão exige inteiro seguro entre 0 e MAX_CONTAGEM
// (número ou texto só de dígitos: "1e3", "0x10", true e [3] não valem).
function lerContagem(valor, rotulo) {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = typeof valor === 'string' ? (/^\d+$/.test(valor.trim()) ? Number(valor.trim()) : NaN) : valor;
  if (typeof numero !== 'number' || !Number.isSafeInteger(numero) || numero < 0 || numero > MAX_CONTAGEM) {
    throw new ErroNegocio(`${rotulo} deve ser um número inteiro entre 0 e ${MAX_CONTAGEM}`);
  }
  return numero;
}

// `padrao` vale quando o campo não vem: true numa parição nova; no PUT, o valor atual (omitir o campo
// não pode transformar uma parição "só estatística" em lançada no rebanho).
function lerAplicar(corpo, padrao = true) {
  const valor = corpo.aplicar_no_rebanho;
  if (valor === undefined) return padrao;
  if (valor === true || valor === 1) return true;
  if (valor === false || valor === 0) return false;
  throw new ErroNegocio('aplicar_no_rebanho deve ser verdadeiro ou falso');
}

function mesDe(data) {
  return data.slice(0, 7);
}

function rotuloMes(mesISO) {
  const [ano, mes] = mesISO.split('-');
  return `${mes}/${ano}`;
}

function limiteDeData(hoje) {
  const total = hoje.getUTCFullYear() * 12 + hoje.getUTCMonth() + MESES_A_FRENTE;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// Lê e valida o corpo. `crias` e `total_mortos` ausentes são derivados (a planilha os calcula:
// total de mortos = natimortos + mortes + aleijados; crias = vivos + total de mortos).
// Só é 400 o que é impossível; divergências entre campos redundantes viram aviso.
function lerParicao(corpo, hoje = new Date()) {
  if (!dataISOValida(corpo.data)) {
    throw new ErroNegocio('data deve ser uma data válida no formato AAAA-MM-DD');
  }
  exigirAnoPlausivel(Number(corpo.data.slice(0, 4)), 'ano da data');
  if (mesDe(corpo.data) > limiteDeData(hoje)) {
    throw new ErroNegocio(`a data da parição não pode passar de ${MESES_A_FRENTE} meses à frente`);
  }

  const v = {};
  for (const [campo, rotulo] of Object.entries(CAMPOS)) v[campo] = lerContagem(corpo[campo], rotulo);
  const n = (campo) => v[campo] ?? 0;
  if (v.total_mortos === null) v.total_mortos = n('natimortos') + n('mortes') + n('aleijados');
  if (v.crias === null) v.crias = n('borregos_vivos') + n('borregas_vivas') + v.total_mortos;
  for (const campo of Object.keys(CAMPOS)) v[campo] ??= 0;

  if (v.borregos_vivos + v.borregas_vivas > v.crias) {
    throw new ErroNegocio(
      `borregos vivos (${v.borregos_vivos}) + borregas vivas (${v.borregas_vivas}) não podem passar das crias (${v.crias})`
    );
  }
  if (COLUNAS_CONTAGEM.every((campo) => v[campo] === 0)) {
    throw new ErroNegocio('informe ao menos um número da parição');
  }

  return { ...v, data: corpo.data, observacoes: textoOuNulo(corpo.observacoes) };
}

// Avisos de números que não fecham entre si (não bloqueiam).
function avisosDeConsistencia(v) {
  const avisos = [];
  const mortosEsperados = v.natimortos + v.mortes + v.aleijados;
  if (v.total_mortos !== mortosEsperados) {
    avisos.push(
      `Total de mortos (${v.total_mortos}) difere de natimortos + mortes + aleijados (${mortosEsperados}).`
    );
  }
  const criasEsperadas = v.borregos_vivos + v.borregas_vivas + v.total_mortos;
  if (v.crias !== criasEsperadas) {
    avisos.push(`Crias (${v.crias}) difere de borregos vivos + borregas vivas + total de mortos (${criasEsperadas}).`);
  }
  if (v.ovelhas_mortas > v.ovelhas) {
    avisos.push(`Ovelhas mortas (${v.ovelhas_mortas}) é maior que as ovelhas que pariram (${v.ovelhas}).`);
  }
  if (v.partos_duplos > v.ovelhas) {
    avisos.push(`Partos duplos (${v.partos_duplos}) é maior que as ovelhas que pariram (${v.ovelhas}).`);
  }
  return avisos;
}

// Nascimentos de Borrego/Borrega que o snapshot do mês tem além dos registrados no sistema
// vieram das planilhas importadas: lançar a parição no rebanho os contaria de novo.
// (Só este sinal é confiável: óbitos de Ovelha e evolução têm movimento legítimo importado.)
function avisosDeDuplicidade(meses) {
  const snapshot = db.prepare('SELECT nascimentos FROM rebanho_snapshots WHERE especie=? AND categoria=? AND ano=? AND mes=?');
  const registrados = db.prepare(
    `SELECT COALESCE(SUM(quantidade), 0) AS soma FROM rebanho_nascimentos
     WHERE especie = ? AND categoria = ? AND substr(data, 1, 7) = ?`
  );
  const avisos = [];
  for (const mes of new Set(meses)) {
    const [ano, mesNum] = mes.split('-').map(Number);
    for (const categoria of ['Borrego', 'Borrega']) {
      const linha = snapshot.get(ESPECIE, categoria, ano, mesNum);
      if (!linha) continue;
      const residual = linha.nascimentos - registrados.get(ESPECIE, categoria, mes).soma;
      if (residual > 0) {
        avisos.push(
          `${categoria} já tinha ${residual} nascimento(s) em ${rotuloMes(mes)} vindo(s) da planilha: confira se esta parição não está contada em dobro (para só registrar as estatísticas, desmarque "Lançar no rebanho").`
        );
      }
    }
  }
  return avisos;
}

function avisosDeParicaoNoMes(mes, ignorarId) {
  const outras = db
    .prepare('SELECT id FROM rebanho_paricoes WHERE substr(data, 1, 7) = ? AND id != ?')
    .all(mes, ignorarId);
  return outras.length ? [`Já existe parição registrada em ${rotuloMes(mes)} (${outras.length}).`] : [];
}

// Não permite lançar no rebanho um mês anterior ao primeiro registro de ovinos (a base ainda
// não existe: um óbito de ovelha seria recusado e os nascimentos ficariam sem ponto de partida).
function exigirMesComRebanho(data, aplicado) {
  if (!aplicado) return;
  const { primeiro } = db
    .prepare('SELECT MIN(ano * 100 + mes) AS primeiro FROM rebanho_snapshots WHERE especie = ?')
    .get(ESPECIE);
  const [ano, mes] = mesDe(data).split('-').map(Number);
  if (primeiro !== null && ano * 100 + mes < primeiro) {
    const [anoPrimeiro, mesPrimeiro] = [Math.floor(primeiro / 100), primeiro % 100];
    throw new ErroNegocio(
      `o rebanho de ovinos só tem registros a partir de ${String(mesPrimeiro).padStart(2, '0')}/${anoPrimeiro}; ` +
        'para uma parição anterior, desmarque "Lançar no rebanho" e registre só as estatísticas'
    );
  }
}

// O que a parição pede ao rebanho agora (quantidade 0 = esse filho não deve existir).
function filhosDesejados(v, aplicado) {
  return [
    { tipo: 'nascimento', categoria: 'Borrego', quantidade: aplicado ? v.borregos_vivos : 0 },
    { tipo: 'nascimento', categoria: 'Borrega', quantidade: aplicado ? v.borregas_vivas : 0 },
    { tipo: 'obito', categoria: 'Ovelha', quantidade: aplicado ? v.ovelhas_mortas : 0 },
  ];
}

// Reconcilia os filhos existentes (paricao_id) com o desejado e só mexe no que mudou: um filho
// inalterado mantém id, snapshot e transições (inclusive ajustes manuais feitos nelas). O efeito
// é por ano-mês, então mudar só o dia atualiza a data sem refazer nada.
function reconciliarFilhos(paricaoId, data, desejados) {
  for (const d of desejados) {
    const ehNascimento = d.tipo === 'nascimento';
    const tabela = ehNascimento ? 'rebanho_nascimentos' : 'rebanho_obitos';
    const reverter = ehNascimento ? reverterNascimento : reverterObito;
    const aplicar = ehNascimento ? (r) => aplicarNascimento(r.id, r) : (r) => aplicarObito(r);
    const atual = db.prepare(`SELECT * FROM ${tabela} WHERE paricao_id = ? AND categoria = ?`).get(paricaoId, d.categoria);

    if (atual && d.quantidade === 0) {
      reverter(atual);
      db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(atual.id);
    } else if (!atual && d.quantidade > 0) {
      const info = db
        .prepare(`INSERT INTO ${tabela} (especie, categoria, quantidade, data, paricao_id) VALUES (?, ?, ?, ?, ?)`)
        .run(ESPECIE, d.categoria, d.quantidade, data, paricaoId);
      aplicar({ id: info.lastInsertRowid, especie: ESPECIE, categoria: d.categoria, quantidade: d.quantidade, data });
    } else if (atual && (atual.quantidade !== d.quantidade || mesDe(atual.data) !== mesDe(data))) {
      reverter(atual);
      db.prepare(`UPDATE ${tabela} SET quantidade = ?, data = ? WHERE id = ?`).run(d.quantidade, data, atual.id);
      aplicar({ ...atual, quantidade: d.quantidade, data });
    } else if (atual && atual.data !== data) {
      db.prepare(`UPDATE ${tabela} SET data = ? WHERE id = ?`).run(data, atual.id);
    }
  }
}

// Um óbito de ovelha recusado por falta de saldo ganha o contexto da parição e o remédio.
function comContextoDeParicao(fn) {
  try {
    return fn();
  } catch (erro) {
    if (erro instanceof ErroNegocio && /^saldo insuficiente/.test(erro.message)) {
      throw new ErroNegocio(
        `${erro.message}. As ovelhas mortas da parição saem do rebanho: ajuste o saldo ou desmarque "Lançar no rebanho" para registrar só as estatísticas`
      );
    }
    throw erro;
  }
}

function avisosDeSaldoDaParicao(datas) {
  const categorias = [...categoriasDaCadeia(ESPECIE, 'Borrego'), ...categoriasDaCadeia(ESPECIE, 'Borrega'), 'Ovelha'];
  return avisosDeSaldo(ESPECIE, categorias, datas);
}

router.get('/paricoes', validarEspecie, (req, res) => {
  const linhas = db
    .prepare('SELECT * FROM rebanho_paricoes WHERE especie = ? ORDER BY data DESC, id DESC')
    .all(req.query.especie);
  res.json(linhas.map((l) => ({ ...l, aplicado_no_rebanho: Boolean(l.aplicado_no_rebanho) })));
});

router.post('/paricao', (req, res) => {
  executar(res, () => {
    const v = lerParicao(req.body);
    const aplicado = lerAplicar(req.body);
    exigirMesComRebanho(v.data, aplicado);

    const id = comContextoDeParicao(() =>
      db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO rebanho_paricoes
              (data, ${COLUNAS_CONTAGEM.join(', ')}, aplicado_no_rebanho, observacoes)
             VALUES (?, ${COLUNAS_CONTAGEM.map(() => '?').join(', ')}, ?, ?)`
          )
          .run(v.data, ...COLUNAS_CONTAGEM.map((c) => v[c]), aplicado ? 1 : 0, v.observacoes);
        reconciliarFilhos(info.lastInsertRowid, v.data, filhosDesejados(v, aplicado));
        return info.lastInsertRowid;
      })()
    );

    const mes = mesDe(v.data);
    const avisos = [
      ...avisosDeConsistencia(v),
      ...avisosDeParicaoNoMes(mes, id),
      ...(aplicado ? [...avisosDeDuplicidade([mes]), ...avisosDeSaldoDaParicao([v.data])] : []),
    ];
    res.status(201).json({ ok: true, id, avisos });
  });
});

router.put('/paricao/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM rebanho_paricoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'parição não encontrada' });

  executar(res, () => {
    const v = lerParicao(req.body);
    const aplicado = lerAplicar(req.body, Boolean(existente.aplicado_no_rebanho));
    exigirMesComRebanho(v.data, aplicado);

    comContextoDeParicao(() =>
      db.transaction(() => {
        db.prepare(
          `UPDATE rebanho_paricoes SET data = ?, ${COLUNAS_CONTAGEM.map((c) => `${c} = ?`).join(', ')},
             aplicado_no_rebanho = ?, observacoes = ? WHERE id = ?`
        ).run(v.data, ...COLUNAS_CONTAGEM.map((c) => v[c]), aplicado ? 1 : 0, v.observacoes, existente.id);
        reconciliarFilhos(existente.id, v.data, filhosDesejados(v, aplicado));
      })()
    );

    const avisos = [
      ...avisosDeConsistencia(v),
      ...avisosDeParicaoNoMes(mesDe(v.data), existente.id),
      ...(aplicado ? avisosDeDuplicidade([mesDe(v.data)]) : []),
      ...avisosDeSaldoDaParicao([existente.data, v.data]),
    ];
    res.json({ ok: true, id: existente.id, avisos });
  });
});

router.delete('/paricao/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM rebanho_paricoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'parição não encontrada' });

  db.transaction(() => {
    // filhos primeiro (as transições saem junto com o nascimento), depois a parição (FK sem CASCADE);
    // "não aplicado" = nenhum filho desejado
    reconciliarFilhos(existente.id, existente.data, filhosDesejados(null, false));
    db.prepare('DELETE FROM rebanho_paricoes WHERE id = ?').run(existente.id);
  })();

  res.json({ ok: true, avisos: avisosDeSaldoDaParicao([existente.data]) });
});

module.exports = router;
