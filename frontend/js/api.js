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
};
