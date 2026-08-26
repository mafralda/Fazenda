// Preenche a quantidade dos lançamentos de "Venda de animais" já importados,
// lendo o número que abre a descrição (ex: "9 ovelhas" -> 9).
const API = process.env.API_BASE || 'http://localhost:3000/api';

function extrairQuantidade(descricao) {
  const match = (descricao || '').trim().match(/^(\d+)\s*(kg)?/i);
  if (!match) return null;
  if (match[2]) return null; // ex: "1kg semente moringa" não é quantidade de animal
  return Number(match[1]);
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
    if (l.quantidade) continue;

    const quantidade = extrairQuantidade(l.descricao);
    if (!quantidade) {
      console.warn(`Sem quantidade identificada para: "${l.descricao}" (id ${l.id})`);
      semCorrespondencia++;
      continue;
    }

    const resposta = await fetch(`${API}/lancamentos/${l.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantidade }),
    });

    if (resposta.ok) {
      atualizados++;
    } else {
      console.error(`Falha ao atualizar id ${l.id}:`, await resposta.text());
    }
  }

  console.log(`Concluído. ${atualizados} lançamentos com quantidade preenchida, ${semCorrespondencia} sem correspondência.`);
}

classificar();
