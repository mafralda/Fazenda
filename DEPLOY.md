# Deploy no Fly.io (gratuito, com dados persistentes)

Esses passos você roda no **PowerShell**, na pasta do projeto
(`c:\Users\hugoa\OneDrive\Documentos\Claudio\Fazenda`).

## 1. Instalar o flyctl (linha de comando do Fly.io)

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Depois feche e abra o PowerShell de novo (pra reconhecer o comando `fly`).

## 2. Criar conta / login

```powershell
fly auth signup
```

(ou `fly auth login` se já tiver conta). Isso abre o navegador — vai pedir os dados
do cartão pra verificação de identidade, mas **não cobra nada** dentro do limite
gratuito (3 VMs pequenas + 3GB de armazenamento).

## 3. Lançar o app

Na pasta do projeto (onde está o `Dockerfile`):

```powershell
fly launch --no-deploy
```

- Vai perguntar o **nome do app** — escolha algo único (ex: `fazenda-silva-financeiro`).
  Esse nome vira parte da URL: `https://<nome-do-app>.fly.dev`.
- Escolha a região mais próxima (ex: `gru` — São Paulo).
- Quando perguntar sobre banco de dados Postgres/Redis: **diga não** pra ambos
  (já usamos SQLite com arquivo).
- Isso vai gerar um arquivo `fly.toml` na pasta do projeto.

## 4. Criar o volume persistente (onde o banco de dados vai morar)

```powershell
fly volumes create fazenda_data --size 1 --region gru
```

(troque `gru` pela região que você escolheu no passo 3, se for diferente)

## 5. Editar o `fly.toml` gerado

Abra o `fly.toml` que foi criado e adicione este bloco no final do arquivo
(ajustando a região se necessário):

```toml
[mounts]
  source = "fazenda_data"
  destination = "/data"
```

Confirme também que existe (o `fly launch` já deve ter criado) um bloco parecido com:

```toml
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
```

> `auto_stop_machines = false` mantém a aplicação sempre ligada, sem "dormir" —
> importante pra que seu colega consiga acessar a qualquer hora sem esperar o
> servidor "acordar".

## 6. Deploy

```powershell
fly deploy
```

Isso builda a imagem Docker (usando o builder remoto do Fly, não precisa de Docker
instalado na sua máquina) e sobe o app.

## 7. Acessar

```powershell
fly open
```

Ou acesse direto: `https://<nome-do-app>.fly.dev`

Esse é o link que você compartilha com seu colega.

## Próximos deploys

Sempre que eu (ou você) alterar o código, é só rodar `fly deploy` de novo — o
banco de dados no volume `fazenda_data` **não é apagado** entre deploys.

## Comandos úteis

```powershell
fly logs          # ver logs em tempo real
fly status         # ver status do app
fly ssh console    # abrir um terminal dentro do servidor (debug)
```
