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

## 2. Conceito Central: CAPEX x OPEX

Toda **despesa** lançada deve ser classificada como:

- **CAPEX (Capital Expenditure)** — investimentos que geram valor/ativo ao longo do
  tempo (ex.: compra de trator, construção de benfeitoria, reforma estrutural,
  aquisição de veículo).
- **OPEX (Operational Expenditure)** — custos operacionais recorrentes para manter a
  operação funcionando no dia a dia (ex.: combustível, ração, salários, manutenção
  corretiva simples).

Essa separação é fundamental para os relatórios e cards do dashboard, permitindo
enxergar quanto está sendo investido em ativos vs. quanto está sendo gasto para
operar a fazenda.

**Receitas** não são classificadas em CAPEX/OPEX (esse conceito é só para despesas),
mas podem ter categorias próprias (ex.: venda de animais, venda de produção).

---

## 3. Categorias

### 3.1 Receitas
| Categoria | Observação |
|---|---|
| Venda de animais | Categoria inicial. Lista de categorias deve ser extensível pelo usuário. |
| Outras receitas | Categoria genérica para receitas não previstas. |

### 3.2 Despesas
| Categoria | Classificação padrão sugerida | Observação |
|---|---|---|
| Mão de obra (diaristas/terceiros) | OPEX | |
| Salário (funcionários fixos) | OPEX | |
| Insumos | OPEX | Fertilizantes, sementes, defensivos, etc. |
| Ração | OPEX | |
| Manutenção | OPEX (regra geral) | Manutenção corretiva/preventiva de equipamentos e estruturas. Se for uma reforma que amplia/melhora um ativo, pode ser reclassificada como CAPEX no lançamento. |
| Combustível | OPEX | |
| Medicamentos (veterinários) | OPEX | |
| Maquinário / Equipamentos (compra) | CAPEX | Sugestão de categoria adicional para completar o conceito de CAPEX na prática. |
| Benfeitorias / Construções | CAPEX | Sugestão de categoria adicional. |
| Outras despesas | Configurável | Categoria genérica. |

> **Nota de design**: a classificação padrão (CAPEX/OPEX) é sugerida automaticamente
> pela categoria escolhida, mas pode ser **sobrescrita manualmente** em cada
> lançamento — por exemplo, uma "manutenção" que na prática é uma reforma estrutural
> grande pode ser marcada como CAPEX.

As categorias serão **configuráveis** (o usuário pode adicionar novas categorias de
receita/despesa além das listadas acima).

---

## 4. Modelo de Dados (rascunho conceitual)

### 4.1 Entidade: `Lancamento` (Entry)
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID / int | Identificador único |
| tipo | enum: `receita` \| `despesa` | Define se é entrada ou saída |
| classificacao | enum: `capex` \| `opex` \| `null` | Obrigatório apenas quando `tipo = despesa` |
| categoria_id | FK → Categoria | Categoria do lançamento |
| descricao | string | Texto livre descrevendo o lançamento |
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
| classificacao_padrao | enum: `capex` \| `opex` \| `null` | Sugestão padrão ao selecionar a categoria (só para despesas) |
| ativo | boolean | Permite "desativar" categorias sem excluir histórico |

---

## 5. Telas / Componentes de Interface

### 5.1 Dashboard (Cards)
Cards de resumo no topo da tela, com filtro de período (mês atual, últimos 12 meses,
ano, período customizado):
- **Receita total**
- **Despesa total**
- **Saldo (Receita − Despesa)**
- **Total CAPEX**
- **Total OPEX**
- Possível gráfico simples (ex.: pizza CAPEX x OPEX, barras receita x despesa por mês)

### 5.2 Tabela de Lançamentos
Listagem de todos os lançamentos com:
- Colunas: Data | Tipo (Receita/Despesa) | Classificação (CAPEX/OPEX) | Categoria | Descrição | Valor
- Filtros: por período, tipo, categoria, classificação
- Ordenação por coluna
- Ações: editar / excluir lançamento

### 5.3 Formulário de Novo Lançamento
- Campos conforme modelo de dados (seção 4.1)
- Categoria e classificação com sugestão automática (classificação pré-preenchida
  conforme a categoria escolhida, mas editável)

### 5.4 Gestão de Categorias
- Tela simples para adicionar/editar/desativar categorias

---

## 6. Arquitetura Técnica

- **Frontend**: HTML + CSS + JavaScript, consumindo uma API backend via fetch/AJAX.
- **Backend**: API REST em Node.js + Express, responsável pelas regras de negócio
  (ex.: sugestão automática de classificação CAPEX/OPEX por categoria) e persistência.
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
