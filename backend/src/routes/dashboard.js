const express = require('express');
const db = require('../db');

const router = express.Router();

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

router.get('/anos', (req, res) => {
  const linhas = db
    .prepare("SELECT DISTINCT strftime('%Y', data) as ano FROM lancamentos ORDER BY ano DESC")
    .all();
  res.json(linhas.map((l) => l.ano));
});

router.get('/animais', (req, res) => {
  const ano = req.query.ano || String(new Date().getFullYear());

  const lancamentos = db
    .prepare(
      `SELECT l.*, c.nome as categoria_nome
       FROM lancamentos l JOIN categorias c ON c.id = l.categoria_id
       WHERE strftime('%Y', l.data) = ?
         AND c.nome = 'Venda de animais'
         AND l.subcategoria IS NOT NULL`
    )
    .all(ano);

  const porTipo = {};

  for (const l of lancamentos) {
    if (!porTipo[l.subcategoria]) {
      porTipo[l.subcategoria] = { tipo_animal: l.subcategoria, quantidade_total: 0, valor_total: 0, numero_vendas: 0 };
    }
    porTipo[l.subcategoria].quantidade_total += l.quantidade || 0;
    porTipo[l.subcategoria].valor_total += l.valor;
    porTipo[l.subcategoria].numero_vendas += 1;
  }

  const resultado = Object.values(porTipo)
    .map((t) => ({
      ...t,
      preco_medio: t.quantidade_total ? t.valor_total / t.quantidade_total : null,
    }))
    .sort((a, b) => b.valor_total - a.valor_total);

  res.json(resultado);
});

router.get('/anual', (req, res) => {
  const ano = req.query.ano || String(new Date().getFullYear());

  const lancamentos = db
    .prepare(
      `SELECT l.*, c.nome as categoria_nome
       FROM lancamentos l JOIN categorias c ON c.id = l.categoria_id
       WHERE strftime('%Y', l.data) = ?`
    )
    .all(ano);

  const porMes = Array.from({ length: 12 }, (_, i) => ({
    mes: String(i + 1).padStart(2, '0'),
    nome: NOMES_MES[i],
    receitas: 0,
    despesas: 0,
    capex: 0,
    opex: 0,
  }));

  const despesasPorCategoria = {};
  const receitasPorCategoria = {};

  const totais = { total_receitas: 0, total_despesas: 0, total_capex: 0, total_opex: 0 };

  for (const l of lancamentos) {
    const mesIndex = Number(l.data.slice(5, 7)) - 1;

    if (l.tipo === 'receita') {
      totais.total_receitas += l.valor;
      porMes[mesIndex].receitas += l.valor;
      receitasPorCategoria[l.categoria_nome] = (receitasPorCategoria[l.categoria_nome] || 0) + l.valor;
    } else {
      totais.total_despesas += l.valor;
      porMes[mesIndex].despesas += l.valor;
      despesasPorCategoria[l.categoria_nome] = (despesasPorCategoria[l.categoria_nome] || 0) + l.valor;

      if (l.classificacao === 'capex') {
        totais.total_capex += l.valor;
        porMes[mesIndex].capex += l.valor;
      } else if (l.classificacao === 'opex') {
        totais.total_opex += l.valor;
        porMes[mesIndex].opex += l.valor;
      }
    }
  }

  res.json({
    ano,
    ...totais,
    saldo: totais.total_receitas - totais.total_despesas,
    por_mes: porMes,
    despesas_por_categoria: Object.entries(despesasPorCategoria)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor),
    receitas_por_categoria: Object.entries(receitasPorCategoria)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor),
  });
});

router.get('/mensal', (req, res) => {
  const ano = req.query.ano || String(new Date().getFullYear());
  const mes = String(req.query.mes || String(new Date().getMonth() + 1)).padStart(2, '0');

  const lancamentos = db
    .prepare(
      `SELECT l.*, c.nome as categoria_nome
       FROM lancamentos l JOIN categorias c ON c.id = l.categoria_id
       WHERE strftime('%Y', l.data) = ? AND strftime('%m', l.data) = ?
       ORDER BY l.data ASC, l.id ASC`
    )
    .all(ano, mes);

  const despesasPorCategoria = {};
  const receitasPorCategoria = {};
  const totais = { total_receitas: 0, total_despesas: 0, total_capex: 0, total_opex: 0 };

  for (const l of lancamentos) {
    if (l.tipo === 'receita') {
      totais.total_receitas += l.valor;
      receitasPorCategoria[l.categoria_nome] = (receitasPorCategoria[l.categoria_nome] || 0) + l.valor;
    } else {
      totais.total_despesas += l.valor;
      despesasPorCategoria[l.categoria_nome] = (despesasPorCategoria[l.categoria_nome] || 0) + l.valor;
      if (l.classificacao === 'capex') totais.total_capex += l.valor;
      else if (l.classificacao === 'opex') totais.total_opex += l.valor;
    }
  }

  res.json({
    ano,
    mes,
    nome_mes: NOMES_MES[Number(mes) - 1],
    ...totais,
    saldo: totais.total_receitas - totais.total_despesas,
    despesas_por_categoria: Object.entries(despesasPorCategoria)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor),
    receitas_por_categoria: Object.entries(receitasPorCategoria)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor),
    lancamentos,
  });
});

module.exports = router;
