// Importa os balanços históricos (2017-2025) da pasta excel/ pra base de dados,
// classificando cada lançamento em categoria/subcategoria/quantidade automaticamente.
// Uso: node import-historico-excel.js            (local)
//      API_BASE=https://seu-app.fly.dev/api node import-historico-excel.js (produção)
//      DRY_RUN=1 node import-historico-excel.js  (só valida e mostra o resumo, não grava nada)
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const API = process.env.API_BASE || 'http://localhost:3000/api';
const DRY_RUN = process.env.DRY_RUN === '1';
const EXCEL_DIR = path.join(__dirname, '..', '..', 'excel');
// Fora da pasta do projeto: escrever aqui dentro faria o `node --watch` reiniciar
// o servidor no meio da importação (viu os .txt novos como mudança de código).
const LOG_DIR = process.env.LOG_DIR || require('os').tmpdir();
const ANOS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ---------- Leitura e parsing das planilhas ----------

function parseValor(str) {
  if (str == null) return null;
  const limpo = String(str).replace(/[^\d,.-]/g, '').replace(/,/g, '');
  const numero = parseFloat(limpo);
  return Number.isNaN(numero) ? null : numero;
}

function parseSheet(rows) {
  // Retorna [{ mes: '01', itens: [{descricao, valor}], subtotalDeclarado }]
  const meses = [];
  let buffer = [];

  for (const row of rows) {
    const tipo = (row[0] || '').toString().trim();
    if (!tipo) continue;

    const matchSubtotal = tipo.match(/^subtotal\s+(\S+)/i);
    if (matchSubtotal) {
      const nomeMes = matchSubtotal[1];
      const indiceMes = MESES.findIndex((m) => m.toLowerCase() === nomeMes.toLowerCase());
      if (indiceMes === -1) {
        console.warn(`  Mês não reconhecido em subtotal: "${tipo}"`);
        buffer = [];
        continue;
      }
      meses.push({
        mes: String(indiceMes + 1).padStart(2, '0'),
        itens: buffer,
        subtotalDeclarado: parseValor(row[1]),
      });
      buffer = [];
      continue;
    }

    if (/^total\b/i.test(tipo)) continue;
    if (/^(receitas|despesas)\s+\d{4}/i.test(tipo)) continue;
    if (tipo.toLowerCase() === 'tipo') continue;

    const valor = parseValor(row[1]);
    if (valor === null) continue;

    buffer.push({ descricao: tipo, valor });
  }

  return meses;
}

function lerAno(ano) {
  const caminho = path.join(EXCEL_DIR, `Balanço ${ano}.xlsx`);
  const wb = XLSX.readFile(caminho);

  const despesas = parseSheet(XLSX.utils.sheet_to_json(wb.Sheets['Despesas'], { header: 1, raw: false }));
  const receitas = parseSheet(XLSX.utils.sheet_to_json(wb.Sheets['Receitas'], { header: 1, raw: false }));

  return { despesas, receitas };
}

// ---------- Classificação de despesas ----------

const REGRAS_DESPESA = [
  [/sal[aá]rio|13[°º]|f[ée]rias|indeniza[çc][ãa]o/i, 'Salário'],
  [/m[ãaõ]o\s*de\s*obra/i, 'Mão de obra'],
  [/vacina|medicamento|verm[íi]fugo|glanvac|starvac|aftosa|cirurgia|brinco|chocalho|l[áa]tico|matabicheira/i, 'Medicamentos'],
  [/[óo]leo diesel|gasolina|lubrificante|[óo]leo mo?tosse?rra|combust[íi]vel/i, 'Combustível'],
  [/constru[çc][ãa]o|benfeitoria/i, 'Benfeitorias / Construções'],
  [/\bequipamentos?\b|m[áa]quina de tosa|\bbalan[çc]a\b/i, 'Maquinário / Equipamentos'],
  [/semente|herbicida|veneno|ure[ií]a|adubo/i, 'Insumos'],
  [/ra[çc][ãa]o|farelo|prote[íi]nado|bomix|n[úu]cleo|silagem|algaroba|caro[çc]o|sal mineral|sal comum|sal branco|\bsal\b|\bmilho\b/i, 'Ração'],
  [
    /conserto|reparo|manuten[çc][ãa]o|assis?t[êe]ncia t[ée]cnica|t[ée]cnico|solda|ferramenta|arame|prego|grampo|cimento|\btela\b|tinta|\bcabo\b|mangueira|conex[õo]es|registro|dobradi[çc]a|porteira|cancela|\bcoxo\b|\bcochos?\b|curral|chibanca|machado|vassoura|\bcloro\b|\bcorda\b|luvas?|parafuso|bucha|broca|\btubo|po[çc]o|mata-burro|irriga[çc][ãa]o|aspers?s?or|energia|trator|ro[çc]adeira|mo?tosse?rra|forrageira|bebedouro|caixa d['´]água|blocos?|ripa|sarrafo|barrote|telha|madeira|\bgerais\b|diversos|materiais?|pl[áa]stico|feno|pluvi[ôo]metro|placa|selador|verniz|thi?nn?er|cadeado|corrente|foice|sombrite|rastel|peneiras?|ara[çc][ãa]o|grad[ãa]o|\bretro\b|serragem|cocalhos?|frete|transporte|carrinho|limpeza|tanque|\bportas?\b|correias?/i,
    'Manutenção',
  ],
];

function classificarDespesa(descricao) {
  for (const [regex, categoria] of REGRAS_DESPESA) {
    if (regex.test(descricao)) return categoria;
  }
  return 'Outras despesas';
}

// ---------- Classificação de receitas (venda de animais) ----------

// Comparação por palavra inteira (tokenizada), não por substring — evita que
// "marrão" seja capturado parcialmente como "marrã" (problema de fronteira de
// palavra em regex com acento) e outras colisões parecidas.
const DICIONARIO_ANIMAIS = {
  bode: 'Bode', bodes: 'Bode',
  cabrito: 'Cabrito', cabritos: 'Cabrito',
  cabrita: 'Cabrita', cabritas: 'Cabrita',
  cabra: 'Cabra', cabras: 'Cabra',
  carneiro: 'Carneiro', carneiros: 'Carneiro', carneir: 'Carneiro', // 'carneir' cobre o typo "carneir0"
  ovelha: 'Ovelha', ovelhas: 'Ovelha',
  borrego: 'Borrego', borregos: 'Borrego',
  borrega: 'Borrega', borregas: 'Borrega',
  marrã: 'Marrã', marrãs: 'Marrã',
  marrão: 'Marrão', marrões: 'Marrão', marrãos: 'Marrão', // "marrãos" é typo recorrente na planilha
  garrote: 'Garrote', garrotes: 'Garrote',
  garrota: 'Garrota', garrotas: 'Garrota',
  bezerro: 'Bezerro', bezerros: 'Bezerro',
  bezerra: 'Bezerra', bezerras: 'Bezerra',
  novilho: 'Novilho', novilhos: 'Novilho',
  novilha: 'Novilha', novilhas: 'Novilha',
  vaca: 'Vaca', vacas: 'Vaca',
  boi: 'Boi', bois: 'Boi',
  touro: 'Touro', touros: 'Touro',
  jumento: 'Jumento', jumentos: 'Jumento',
  cavalo: 'Cavalo', cavalos: 'Cavalo',
  reprodutor: 'Reprodutor', reprodutores: 'Reprodutor',
};

function identificarAnimais(descricao) {
  const tokens = descricao.toLowerCase().match(/[a-zà-öø-ÿ]+/g) || [];
  const encontrados = new Set();
  for (const token of tokens) {
    const nome = DICIONARIO_ANIMAIS[token];
    if (nome) encontrados.add(nome);
  }
  return [...encontrados];
}

function classificarReceita(descricao) {
  const animaisEncontrados = identificarAnimais(descricao);

  if (animaisEncontrados.length === 0) {
    return { categoria: 'Outras receitas', subcategoria: null, quantidade: null };
  }

  if (animaisEncontrados.length > 1) {
    // Venda mista (ex: "4 carneiros, 1 marrã e 1 ovelha abate") — não dá pra
    // separar quantidade/valor por tipo com segurança, deixa sem subclassificação.
    return { categoria: 'Venda de animais', subcategoria: null, quantidade: null };
  }

  const match = descricao.trim().match(/^(\d+)/);
  const quantidade = match ? Number(match[1]) : null;

  return {
    categoria: 'Venda de animais',
    subcategoria: animaisEncontrados[0],
    quantidade,
  };
}

// ---------- Montagem dos lançamentos ----------

function montarLancamentos(ano, despesas, receitas) {
  const lancamentos = [];

  for (const { mes, itens } of despesas) {
    itens.forEach((item, i) => {
      const categoria = classificarDespesa(item.descricao);
      const dia = String(Math.min(i + 1, 28)).padStart(2, '0');
      lancamentos.push({
        tipo: 'despesa',
        categoriaNome: categoria,
        descricao: item.descricao,
        subcategoria: null,
        quantidade: null,
        valor: item.valor,
        data: `${ano}-${mes}-${dia}`,
        observacoes: `Importado do balanço histórico ${ano}`,
      });
    });
  }

  for (const { mes, itens } of receitas) {
    itens.forEach((item, i) => {
      const { categoria, subcategoria, quantidade } = classificarReceita(item.descricao);
      const dia = String(Math.min(i + 1, 28)).padStart(2, '0');
      lancamentos.push({
        tipo: 'receita',
        categoriaNome: categoria,
        descricao: item.descricao,
        subcategoria,
        quantidade,
        valor: item.valor,
        data: `${ano}-${mes}-${dia}`,
        observacoes: `Importado do balanço histórico ${ano}`,
      });
    });
  }

  return lancamentos;
}

// ---------- Validação contra os subtotais declarados na planilha ----------

function validarSubtotais(ano, tipo, meses) {
  let ok = true;
  for (const { mes, itens, subtotalDeclarado } of meses) {
    const somaCalculada = itens.reduce((acc, i) => acc + i.valor, 0);
    const diff = Math.abs(somaCalculada - (subtotalDeclarado ?? 0));
    if (diff > 0.01) {
      console.warn(
        `  ⚠️  ${ano} ${tipo} ${MESES[Number(mes) - 1]}: soma itens=${somaCalculada.toFixed(2)} vs subtotal declarado=${(subtotalDeclarado ?? 0).toFixed(2)}`
      );
      ok = false;
    }
  }
  return ok;
}

// ---------- Execução ----------

async function main() {
  const categoriasResp = await fetch(`${API}/categorias`);
  const categorias = await categoriasResp.json();
  const mapaCategorias = {};
  categorias.forEach((c) => (mapaCategorias[c.nome] = c));

  let totalLancamentos = 0;
  let totalCriados = 0;
  let totalFalhas = 0;
  const contagemPorCategoria = {};
  const semQuantidadeReceita = [];
  const outrasDespesas = [];

  for (const ano of ANOS) {
    console.log(`\n=== ${ano} ===`);
    const { despesas, receitas } = lerAno(ano);

    validarSubtotais(ano, 'Despesas', despesas);
    validarSubtotais(ano, 'Receitas', receitas);

    const lancamentos = montarLancamentos(ano, despesas, receitas);
    totalLancamentos += lancamentos.length;

    for (const l of lancamentos) {
      contagemPorCategoria[l.categoriaNome] = (contagemPorCategoria[l.categoriaNome] || 0) + 1;

      if (l.tipo === 'receita' && l.categoriaNome === 'Venda de animais' && !l.quantidade) {
        semQuantidadeReceita.push(`${ano}: "${l.descricao}"`);
      }
      if (l.tipo === 'despesa' && l.categoriaNome === 'Outras despesas') {
        outrasDespesas.push(`${ano}: "${l.descricao}" (R$ ${l.valor.toFixed(2)})`);
      }

      if (DRY_RUN) continue;

      const categoria = mapaCategorias[l.categoriaNome];
      if (!categoria) {
        console.error(`  Categoria não encontrada: ${l.categoriaNome}`);
        totalFalhas++;
        continue;
      }

      const corpo = {
        tipo: l.tipo,
        categoria_id: categoria.id,
        descricao: l.descricao,
        subcategoria: l.subcategoria,
        quantidade: l.quantidade,
        valor: l.valor,
        data: l.data,
        observacoes: l.observacoes,
      };

      const resposta = await fetch(`${API}/lancamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });

      if (resposta.ok) {
        totalCriados++;
      } else {
        totalFalhas++;
        console.error(`  Falha ao criar "${l.descricao}" (${ano}):`, await resposta.text());
      }
    }

    console.log(`  ${lancamentos.length} lançamentos processados.`);
  }

  console.log('\n=== Resumo geral ===');
  console.log('Total de lançamentos processados:', totalLancamentos);
  if (!DRY_RUN) {
    console.log('Criados com sucesso:', totalCriados);
    console.log('Falhas:', totalFalhas);
  }
  console.log('\nDistribuição por categoria:');
  Object.entries(contagemPorCategoria)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, n]) => console.log(`  ${cat}: ${n}`));

  console.log(`\nVendas de animais sem quantidade/subcategoria identificada (venda mista ou não reconhecida): ${semQuantidadeReceita.length}`);
  if (semQuantidadeReceita.length) {
    const destino = path.join(LOG_DIR, 'vendas-sem-classificacao.txt');
    fs.writeFileSync(destino, semQuantidadeReceita.join('\n'));
    console.log('  Lista salva em', destino);
  }

  console.log(`\nDespesas em "Outras despesas" (fallback): ${outrasDespesas.length}`);
  if (outrasDespesas.length) {
    const destino = path.join(LOG_DIR, 'outras-despesas.txt');
    fs.writeFileSync(destino, outrasDespesas.join('\n'));
    console.log('  Lista salva em', destino);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
