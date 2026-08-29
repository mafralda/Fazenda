# Controle Financeiro da Fazenda — Documentação de Arquitetura

## 1. Visão Geral

Aplicação web para controle financeiro de uma fazenda, permitindo o lançamento de
**custos (despesas)** e **receitas**, organizados em **tabelas** e **cards** que
facilitam a visão geral da saúde financeira da operação.

- **Uso**: uso único (uma pessoa/família), sem necessidade de login/autenticação por enquanto.
- **Persistência**: backend com banco de dados (dados acessíveis de qualquer dispositivo).
- **Formato inicial deste documento**: somente documentação (`.md`). Nenhum código será
  implementado nesta etapa.

---

## 2. Classificação de Despesas

> **Atualização:** o conceito de CAPEX/OPEX (classificação de despesas como
> investimento de capital vs. custo operacional) foi removido do produto — banco de
> dados, API e interface — por decisão do usuário. Despesas hoje são organizadas
> apenas por **categoria** (seção 3), sem uma segunda camada de classificação.

---

## 3. Categorias

### 3.1 Receitas
| Categoria | Observação |
|---|---|
| Venda de animais | Categoria inicial. Lista de categorias deve ser extensível pelo usuário. |
| Outras receitas | Categoria genérica para receitas não previstas. |

### 3.2 Despesas
| Categoria | Observação |
|---|---|
| Mão de obra (diaristas/terceiros) | |
| Salário (funcionários fixos) | |
| Insumos | Fertilizantes, sementes, defensivos, etc. |
| Ração | |
| Manutenção | Manutenção corretiva/preventiva de equipamentos e estruturas. |
| Combustível | |
| Medicamentos (veterinários) | |
| Maquinário / Equipamentos (compra) | |
| Benfeitorias / Construções | |
| Outras despesas | Categoria genérica. |

As categorias serão **configuráveis** (o usuário pode adicionar novas categorias de
receita/despesa além das listadas acima).

---

## 4. Modelo de Dados (rascunho conceitual)

### 4.1 Entidade: `Lancamento` (Entry)
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID / int | Identificador único |
| tipo | enum: `receita` \| `despesa` | Define se é entrada ou saída |
| categoria_id | FK → Categoria | Categoria do lançamento |
| descricao | string | Texto livre descrevendo o lançamento |
| subcategoria | string (opcional) | Etiqueta livre — ex.: tipo de animal numa venda |
| quantidade | number (opcional) | Ex.: quantidade de animais vendidos |
| valor | decimal | Valor em R$ |
| data | date | Data do lançamento/competência |
| forma_pagamento | string (opcional) | Ex.: dinheiro, PIX, boleto, cartão |
| observacoes | string (opcional) | Campo livre |
| criado_em / atualizado_em | timestamp | Auditoria simples |

### 4.2 Entidade: `Categoria`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID / int | Identificador único |
| nome | string | Nome da categoria |
| tipo | enum: `receita` \| `despesa` | A qual grupo pertence |
| ativo | boolean | Permite "desativar" categorias sem excluir histórico |

---

## 5. Telas / Componentes de Interface

### 5.1 Dashboard (Cards) — tela inicial da aplicação
Cards de resumo no topo da tela, com filtro por ano:
- **Receita total**
- **Despesa total**
- **Lucro** ou **Prejuízo** (Receita − Despesa) — o título do card muda dinamicamente
  conforme o saldo é positivo ou negativo.
- Gráficos: receita x despesa por mês, despesas por categoria, receitas por categoria,
  vendas por tipo de animal.
- Botão "+ Novo lançamento" disponível diretamente nesta tela.

### 5.2 Tabela de Lançamentos
Listagem de todos os lançamentos com:
- Colunas: Data | Tipo (Receita/Despesa) | Categoria | Subcategoria | Quantidade | Descrição | Valor
- Filtros: por período (com atalhos "Ano atual" / "Todos os anos"), tipo, categoria, subcategoria
- Ações: editar / excluir lançamento

### 5.3 Formulário de Novo Lançamento
- Campos conforme modelo de dados (seção 4.1)
- Disponível tanto na tela de Lançamentos quanto no Dashboard

### 5.4 Gestão de Categorias
- Tela simples para adicionar/editar/desativar categorias

---

## 6. Arquitetura Técnica

- **Frontend**: HTML + CSS + JavaScript, consumindo uma API backend via fetch/AJAX.
- **Backend**: API REST em Node.js + Express, responsável pelas regras de negócio e persistência.
- **Banco de dados**: SQLite para começar — simples, sem infraestrutura extra, roda em
  um único arquivo local — com possibilidade de migrar para Postgres no futuro caso
  seja necessário acesso remoto/multiusuário.
- **Hospedagem**: local (na máquina da fazenda) na primeira fase. Pode migrar para um
  serviço cloud simples depois, caso surja necessidade de acesso remoto.

> Esta é a stack padrão adotada para seguir a execução. Pode ser revista a qualquer
> momento caso surja um motivo específico para mudar.

---

## 7. Ideias de Features Extras (aguardando aprovação)

As ideias abaixo **não estão aprovadas** — são sugestões para discussão futura, uma vez que o pedido é claro: nada é implementado sem alinhamento prévio.

1. **Exportação de relatórios** (PDF/Excel) por período.
2. **Gráficos de evolução mensal** (receita, despesa, saldo ao longo do tempo).
3. **Lançamentos recorrentes** (ex.: salário mensal, gerado automaticamente todo mês).
4. **Multiusuário/login** — caso no futuro mais de uma pessoa da família precise lançar dados.
5. **Backup automático / exportação de dados** (JSON/CSV) para segurança.

> Itens removidos por decisão do usuário: metas/orçamento por categoria e anexos nos lançamentos.

---

## 8. Próximos Passos

1. ~~Validar este documento com o usuário (categorias, modelo de dados, telas).~~ ✅
2. ~~Definir stack técnica definitiva.~~ ✅ Node.js + Express + SQLite (seção 6).
3. Priorizar quais das "features extras" (seção 7) entram no escopo inicial — a definir junto com o usuário conforme o MVP avança.
4. Iniciar a implementação do MVP: cadastro de lançamentos + tabela + cards do dashboard.
