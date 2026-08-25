// Importação única dos históricos de despesa/receita 2026 fornecidos em CSV.
const API = 'http://localhost:3000/api';

const despesasPorMes = {
  '01': [
    ['ração', 2080, 'Ração'],
    ['2 kg de prego', 28, 'Manutenção'],
    ['salário vaqueiro', 3000, 'Salário'],
    ['mão de obra', 2040, 'Mão de obra'],
    ['conserto motor', 170, 'Manutenção'],
    ['vacinas starvac e raiva gado', 470, 'Medicamentos'],
  ],
  '02': [
    ['ração', 1788, 'Ração'],
    ['sal comum', 150, 'Ração'],
    ['óleo diesel', 130, 'Combustível'],
    ['madeira (ripa e barrote)', 407, 'Manutenção'],
    ['salário vaqueiros', 3000, 'Salário'],
    ['mão de obra', 2880, 'Mão de obra'],
    ['cabo energia forrageira', 860, 'Manutenção'],
    ['erbicida galop', 480, 'Insumos'],
    ['1 bomix', 180, 'Ração'],
    ['cimento', 50, 'Manutenção'],
  ],
  '03': [
    ['bomix', 135, 'Ração'],
    ['pá/lâmina roçadeira', 210, 'Manutenção'],
    ['medicamentos', 205, 'Medicamentos'],
    ['ração', 112, 'Ração'],
    ['mão de obra', 2610, 'Mão de obra'],
    ['salário vaqueiros', 3000, 'Salário'],
    ['conserto bomba poço', 640, 'Manutenção'],
    ['serragem', 60, 'Insumos'],
    ['vacina brucelose', 320, 'Medicamentos'],
  ],
  '04': [
    ['sal comum', 48, 'Ração'],
    ['gerais', 103, 'Outras despesas'],
    ['milho', 105, 'Ração'],
    ['bomix', 180, 'Ração'],
    ['arame/corrente motosserra', 390, 'Manutenção'],
    ['salário vaqueiros', 3000, 'Salário'],
    ['40 sc serragem', 300, 'Insumos'],
    ['mão de obra', 2740, 'Mão de obra'],
  ],
  '05': [
    ['ração', 455, 'Ração'],
    ['sal comum', 80, 'Ração'],
    ['15 tambores para silagem', 2300, 'Insumos'],
    ['material irrigação', 200, 'Manutenção'],
    ['medicamentos', 213, 'Medicamentos'],
    ['salário vaqueiros', 3000, 'Salário'],
    ['cimento', 85, 'Manutenção'],
    ['mão de obra', 2000, 'Mão de obra'],
  ],
  '06': [
    ['ração', 370, 'Ração'],
    ['sal mineral/comum/bomix', 238, 'Ração'],
    ['medicamentos', 6, 'Medicamentos'],
    ['prego/arame/válvulas/aspersores', 130, 'Manutenção'],
    ['salário vaqueiros', 3000, 'Salário'],
    ['mão de obra', 1100, 'Mão de obra'],
    ['conserto motor', 400, 'Manutenção'],
  ],
  '07': [
    ['sal comum', 209, 'Ração'],
    ['núcleo bomix (2)', 300, 'Ração'],
    ['vacina starvac ovinos', 456, 'Medicamentos'],
    ['medicamentos', 50, 'Medicamentos'],
    ['14m mangueira', 322, 'Manutenção'],
    ['salário vaqueiros', 3000, 'Salário'],
    ['6 farelo milho + 3 farelo soja', 1020, 'Ração'],
    ['mão de obra', 720, 'Mão de obra'],
    ['óleo diesel', 150, 'Combustível'],
  ],
  '08': [
    ['1 cela', 1500, 'Outras despesas'],
    ['medicamentos', 25, 'Medicamentos'],
    ['sal proteinado', 88, 'Ração'],
  ],
};

const receitasPorMes = {
  '01': [
    ['esterco', 600, 'Outras receitas'],
    ['9 ovelhas', 4104, 'Venda de animais'],
    ['1 marrã', 216, 'Venda de animais'],
    ['1 borrego', 1200, 'Venda de animais'],
    ['semente moringa', 80, 'Outras receitas'],
    ['10 marrãs', 10000, 'Venda de animais'],
    ['5 marrãs', 2500, 'Venda de animais'],
    ['1 borrego', 1400, 'Venda de animais'],
  ],
  '02': [
    ['semente moringa', 130, 'Outras receitas'],
    ['semente buffel', 100, 'Outras receitas'],
    ['esterco', 650, 'Outras receitas'],
    ['20 borregas', 19000, 'Venda de animais'],
    ['1 borrego', 1000, 'Venda de animais'],
    ['25 garrotes', 50000, 'Venda de animais'],
    ['1 carneiro', 570, 'Venda de animais'],
  ],
  '03': [
    ['5 marrãs', 2500, 'Venda de animais'],
    ['2 borregos', 2400, 'Venda de animais'],
  ],
  '04': [
    ['1 borrego', 1200, 'Venda de animais'],
    ['3 carneiros novos', 1200, 'Venda de animais'],
    ['6 carneiros', 3800, 'Venda de animais'],
    ['3 ovelhas', 1700, 'Venda de animais'],
    ['1 marrã queixo curto', 500, 'Venda de animais'],
    ['2 borregos', 2300, 'Venda de animais'],
    ['4 marrãs', 3500, 'Venda de animais'],
  ],
  '05': [
    ['1 ovelha', 550, 'Venda de animais'],
    ['3 carneiros', 1420, 'Venda de animais'],
    ['1 borrego', 1250, 'Venda de animais'],
  ],
  '06': [
    ['5 borregos', 6350, 'Venda de animais'],
    ['1 vaca', 3400, 'Venda de animais'],
    ['esterco', 640, 'Outras receitas'],
  ],
  '07': [
    ['2 ovelhas', 1300, 'Venda de animais'],
    ['1 jumento', 2000, 'Venda de animais'],
  ],
  '08': [
    ['3 borregos', 3700, 'Venda de animais'],
    ['1kg semente moringa', 100, 'Outras receitas'],
    ['esterco', 640, 'Outras receitas'],
  ],
};

async function buscarCategorias() {
  const resposta = await fetch(`${API}/categorias`);
  const categorias = await resposta.json();
  const mapa = {};
  categorias.forEach((c) => (mapa[c.nome] = c));
  return mapa;
}

function dataDoItem(mes, indice) {
  const dia = String(Math.min(indice + 1, 28)).padStart(2, '0');
  return `2026-${mes}-${dia}`;
}

async function importar() {
  const mapaCategorias = await buscarCategorias();
  let totalImportado = 0;

  for (const [tipo, porMes] of [
    ['despesa', despesasPorMes],
    ['receita', receitasPorMes],
  ]) {
    for (const [mes, itens] of Object.entries(porMes)) {
      for (let i = 0; i < itens.length; i++) {
        const [descricao, valor, nomeCategoria] = itens[i];
        const categoria = mapaCategorias[nomeCategoria];
        if (!categoria) {
          console.error(`Categoria não encontrada: ${nomeCategoria}`);
          continue;
        }

        const corpo = {
          tipo,
          classificacao: tipo === 'despesa' ? categoria.classificacao_padrao : null,
          categoria_id: categoria.id,
          descricao,
          valor,
          data: dataDoItem(mes, i),
          observacoes: 'Importado de planilha histórica 2026',
        };

        const resposta = await fetch(`${API}/lancamentos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
        });

        if (!resposta.ok) {
          console.error(`Falha ao importar "${descricao}" (${mes}):`, await resposta.text());
        } else {
          totalImportado++;
        }
      }
    }
  }

  console.log(`Importação concluída. ${totalImportado} lançamentos criados.`);
}

importar();
