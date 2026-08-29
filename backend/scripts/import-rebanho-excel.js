// Importa os controles de rebanho (bovino/ovino) da pasta excel/ pro banco.
// Uso: node import-rebanho-excel.js
//      API_BASE=https://seu-app.fly.dev/api node import-rebanho-excel.js (produção)
const path = require('path');
const XLSX = require('xlsx');

const API = process.env.API_BASE || 'http://localhost:3000/api';
const EXCEL_DIR = path.join(__dirname, '..', '..', 'excel');

const ARQUIVOS = [
  { especie: 'bovino', arquivo: 'Rebanho_bovino_2025.xls' },
  { especie: 'bovino', arquivo: 'Rebanho_bovino_2026.xls' },
  { especie: 'ovino', arquivo: 'Rebanho_ovino_2025.xls' },
  { especie: 'ovino', arquivo: 'Rebanho_ovino_2026.xls' },
];

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  const n = parseInt(valor, 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseSheet(rows) {
  const linhaAno = rows.find((r) => (r[6] || '').toString().trim().replace(':', '').toLowerCase() === 'ano');
  const linhaMes = rows.find((r) => (r[6] || '').toString().trim().toLowerCase() === 'mês');
  if (!linhaAno || !linhaMes) return null;

  const ano = Number(linhaAno[7]);
  const nomeMes = (linhaMes[7] || '').toString().trim().toLowerCase();
  const mes = MESES.indexOf(nomeMes) + 1;
  if (!ano || !mes) return null;

  const indiceHeader = rows.findIndex((r) => (r[0] || '').toString().trim().toUpperCase() === 'REBANHO');
  const indiceTotal = rows.findIndex((r) => (r[0] || '').toString().trim().toUpperCase() === 'TOTAL');
  if (indiceHeader === -1 || indiceTotal === -1) return null;

  const categorias = rows.slice(indiceHeader + 1, indiceTotal).map((r) => ({
    categoria: (r[0] || '').toString().trim(),
    saldo_anterior: numero(r[1]),
    evolucao: numero(r[2]),
    obitos: numero(r[3]),
    vendas: numero(r[4]),
    subtotal: numero(r[5]),
    nascimentos: numero(r[6]),
    total: numero(r[7]),
  }));

  const notas = rows
    .slice(indiceTotal + 1)
    .map((r) => (r[1] || r[0] || '').toString().trim())
    .filter(Boolean)
    .join(' | ');

  return { ano, mes, categorias, nota: notas || null };
}

async function importarArquivo({ especie, arquivo }) {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, arquivo));
  let mesesImportados = 0;
  let categoriasImportadas = 0;

  for (const nomeAba of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, raw: false });
    const dados = parseSheet(rows);
    if (!dados) continue;

    for (const c of dados.categorias) {
      if (!c.categoria) continue;

      const resposta = await fetch(`${API}/rebanho/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          especie,
          categoria: c.categoria,
          ano: dados.ano,
          mes: dados.mes,
          saldo_anterior: c.saldo_anterior,
          evolucao: c.evolucao,
          obitos: c.obitos,
          vendas: c.vendas,
          subtotal: c.subtotal,
          nascimentos: c.nascimentos,
          total: c.total,
        }),
      });

      if (resposta.ok) categoriasImportadas++;
      else console.error(`Falha ao importar ${especie} ${c.categoria} ${dados.ano}-${dados.mes}:`, await resposta.text());
    }

    if (dados.nota) {
      await fetch(`${API}/rebanho/nota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ especie, ano: dados.ano, mes: dados.mes, texto: dados.nota }),
      });
    }

    mesesImportados++;
  }

  console.log(`${arquivo}: ${mesesImportados} meses, ${categoriasImportadas} registros de categoria importados.`);
}

async function main() {
  for (const item of ARQUIVOS) {
    await importarArquivo(item);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
