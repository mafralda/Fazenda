# Fazenda — controle financeiro e rebanho

<!-- Este arquivo é reenviado em TODA requisição. Mantenha-o abaixo de ~200 linhas.
     Só o essencial aqui; instruções de fluxos específicos vão para skills (.claude/skills/). -->

## Essencial
- Stack: Node 22 (CommonJS) + Express 4 + SQLite (better-sqlite3) no backend; HTML/CSS/JS puro no frontend (sem bundler; Chart.js em `frontend/js/vendor/`). Interface e textos em português.
- Comandos (o `package.json` fica em `backend/`, não na raiz):
  - rodar: `npm --prefix backend start` · dev com reload: `npm --prefix backend run dev` (http://localhost:3000)
  - testes: `npm --prefix backend test` (`node --test`, arquivos `*.test.js` em `backend/test/`: lancamentos, rebanho, parição, migração, série). Lint/build: **não existem**.
  - importar planilhas de `excel/`: `node backend/scripts/import-*.js` (também `classificar-*.js`)
  - imagem: `docker build .` · deploy: `fly deploy` (passo a passo em `DEPLOY.md`)
- Estrutura:
  - `backend/src/app.js` — monta o Express (`/api/{categorias,lancamentos,dashboard,rebanho}` + `frontend/` estático) e exporta o app; `server.js` só chama `listen`
  - `backend/src/db/` — conexão (`DB_PATH`, padrão `backend/data/fazenda.db`) e schema
  - `backend/src/routes/` — uma rota por domínio
  - `backend/scripts/` — importações pontuais das planilhas
  - `backend/test/` — testes `node:test` + `fetch` nativo; app em porta efêmera (`listen(0)`) com SQLite temporário
  - `frontend/*.html` + `frontend/js/` — uma página por tela; `api.js` centraliza as chamadas `fetch`
- Convenções que o Claude erra se ninguém avisar:
  - CAPEX/OPEX foi removido do produto (banco, API e UI); despesas só têm categoria.
  - `backend/data/`, `*.db` e `excel/` estão no `.gitignore`: nunca versionar nem apagar dados.
  - Em testes, defina `process.env.DB_PATH` (diretório temporário) **antes** do `require` do app: o banco abre ao carregar `db/index.js`. Feche servidor e banco no `after()`.
  - Contexto de produto e modelo de dados: `ARQUITETURA.md` (leia só quando precisar; não importado aqui).

## Como trabalhar neste repositório
- Para localizar código, use o agente Explore. Não leia arquivos inteiros na conversa principal.
- Para rodar testes, use o agente test-runner.
- Para consultar documentação externa, use o agente doc-fetcher.
- Antes de abrir PR, peça uma revisão ao agente reviewer.
- Chame o agente architect só para decisões de arquitetura ou bugs que resistiram a duas tentativas.
- Prefira CLIs (gh, fly, docker…) a servidores MCP quando houver as duas opções.

# Compact instructions
Ao compactar, preserve: decisões tomadas e o porquê, arquivos alterados, testes ainda falhando e próximos passos.
Descarte saídas de ferramentas já resolvidas e explorações que não levaram a nada.
