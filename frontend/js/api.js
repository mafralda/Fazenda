const API_BASE = '/api';

async function apiRequest(path, options = {}) {
  const resposta = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!resposta.ok) {
    const erro = await resposta.json().catch(() => ({ erro: 'Erro desconhecido' }));
    throw new Error(erro.erro || `Erro na requisição: ${resposta.status}`);
  }

  if (resposta.status === 204) return null;
  return resposta.json();
}

const api = {
  categorias: {
    listar: (tipo) => apiRequest(`/categorias${tipo ? `?tipo=${tipo}` : ''}`),
    criar: (dados) => apiRequest('/categorias', { method: 'POST', body: JSON.stringify(dados) }),
  },
  lancamentos: {
    listar: (filtros) => apiRequest(`/lancamentos?${new URLSearchParams(filtros)}`),
    resumo: (filtros) => apiRequest(`/lancamentos/resumo?${new URLSearchParams(filtros)}`),
    subcategorias: () => apiRequest('/lancamentos/subcategorias'),
    criar: (dados) => apiRequest('/lancamentos', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id, dados) => apiRequest(`/lancamentos/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    excluir: (id) => apiRequest(`/lancamentos/${id}`, { method: 'DELETE' }),
  },
  dashboard: {
    anos: () => apiRequest('/dashboard/anos'),
    anual: (ano) => apiRequest(`/dashboard/anual?${new URLSearchParams({ ano })}`),
    animais: (ano) => apiRequest(`/dashboard/animais?${new URLSearchParams({ ano })}`),
    mensal: (ano, mes) => apiRequest(`/dashboard/mensal?${new URLSearchParams({ ano, mes })}`),
  },
  rebanho: {
    anos: (especie) => apiRequest(`/rebanho/anos?${new URLSearchParams({ especie })}`),
    serie: (especie, ano) => apiRequest(`/rebanho/serie?${new URLSearchParams({ especie, ano })}`),
    mes: (especie, ano, mes) => apiRequest(`/rebanho/mes?${new URLSearchParams({ especie, ano, mes })}`),
    categoriasNascimento: (especie) =>
      apiRequest(`/rebanho/categorias-nascimento?${new URLSearchParams({ especie })}`),
    categorias: (especie) => apiRequest(`/rebanho/categorias?${new URLSearchParams({ especie })}`),
    registrarNascimento: (dados) =>
      apiRequest('/rebanho/nascimento', { method: 'POST', body: JSON.stringify(dados) }),
    atualizarNascimento: (id, dados) =>
      apiRequest(`/rebanho/nascimento/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    excluirNascimento: (id) => apiRequest(`/rebanho/nascimento/${id}`, { method: 'DELETE' }),
    registrarObito: (dados) => apiRequest('/rebanho/obito', { method: 'POST', body: JSON.stringify(dados) }),
    atualizarObito: (id, dados) =>
      apiRequest(`/rebanho/obito/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    excluirObito: (id) => apiRequest(`/rebanho/obito/${id}`, { method: 'DELETE' }),
    atualizarTransicao: (id, dados) =>
      apiRequest(`/rebanho/transicao/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    // filtros: { data_inicio, data_fim, evento } — valores vazios são omitidos
    historico: (especie, filtros = {}) => {
      const params = { especie };
      for (const [chave, valor] of Object.entries(filtros)) if (valor) params[chave] = valor;
      return apiRequest(`/rebanho/historico?${new URLSearchParams(params)}`);
    },
  },
};
