// Preenche a subcategoria (tipo de animal) dos lançamentos de "Venda de animais"
// já importados, lendo palavras-chave da descrição.
const API = 'http://localhost:3000/api';

const REGRAS = [
  [/marr[aã]/i, 'Marrã'],
  [/borrega/i, 'Borrega'],
  [/borrego/i, 'Borrego'],
  [/garrote/i, 'Garrote'],
  [/carneiro/i, 'Carneiro'],
  [/ovelha/i, 'Ovelha'],
  [/jumento/i, 'Jumento'],
  [/\bvaca\b/i, 'Vaca'],
];

function identificarAnimal(descricao) {
  for (const [regex, nome] of REGRAS) {
    if (regex.test(descricao)) return nome;
  }
  return null;
}

async function classificar() {
  const categorias = await (await fetch(`${API}/categorias`)).json();
  const categoriaVendaAnimais = categorias.find((c) => c.nome === 'Venda de animais');

  if (!categoriaVendaAnimais) {
    console.error('Categoria "Venda de animais" não encontrada.');
    return;
  }

  const lancamentos = await (
    await fetch(`${API}/lancamentos?categoria_id=${categoriaVendaAnimais.id}`)
  ).json();

  let atualizados = 0;
  let semCorrespondencia = 0;

  for (const l of lancamentos) {
    if (l.subcategoria) continue;

    const animal = identificarAnimal(l.descricao || '');
    if (!animal) {
      console.warn(`Sem correspondência para: "${l.descricao}" (id ${l.id})`);
      semCorrespondencia++;
      continue;
    }

    const resposta = await fetch(`${API}/lancamentos/${l.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subcategoria: animal }),
    });

    if (resposta.ok) {
      atualizados++;
    } else {
      console.error(`Falha ao atualizar id ${l.id}:`, await resposta.text());
    }
  }

  console.log(`Concluído. ${atualizados} lançamentos classificados, ${semCorrespondencia} sem correspondência.`);
}

classificar();
