# Deploy na Hostinger

Este projeto deve rodar como App Node.js, com PostgreSQL separado e dominio HTTPS.

## Pedido para a Hostinger

Envie este texto ao suporte/provisionamento:

> Preciso hospedar um sistema Node.js/Express com frontend React/Vite e Prisma/PostgreSQL. O backend roda em TypeScript compilado para `dist/server.js`, expoe APIs em `/api`, serve o frontend compilado em producao e precisa de PostgreSQL. Por favor, criem um App Node.js com Node 20+, um banco PostgreSQL dedicado e me enviem os dados de conexao para a variavel `DATABASE_URL`. Tambem preciso configurar variaveis de ambiente, HTTPS no dominio, porta dinamica da plataforma e storage persistente para arquivos de audio, relatorios e logs.

Confirme tambem:

- Processo Node.js sempre ativo.
- Suporte a webhooks externos HTTPS.
- Storage persistente para `storage/` e `logs/`.
- Binarios necessarios para audio/FFmpeg, se o recurso for usado.

## Configuracao do App Node.js

Use a raiz `ozapteconta` como diretorio do app, porque o backend precisa servir o build do frontend.

- Node.js: `20` ou superior.
- Install command: `npm run hostinger:install`
- Build command: `npm run hostinger:build`
- Start command: `npm start`
- Health check: `/api/health`

Se a Hostinger exigir o diretorio `backend` como raiz do app, execute antes o build do frontend na raiz do projeto e mantenha `frontend/dist` publicado junto do deploy.

## Variaveis de Ambiente

Use `.env.hostinger.example` como checklist no painel da Hostinger.

Obrigatorias:

- `NODE_ENV=production`
- `PORT=<porta definida pela Hostinger>`
- `DATABASE_URL=postgresql://USUARIO:SENHA@HOST:PORTA/NOME_DO_BANCO`
- `JWT_SECRET=<string aleatoria com pelo menos 32 caracteres>`
- `FRONTEND_URL=https://seudominio.com.br`

Recomendadas:

- `AUDIO_STORAGE_PATH=./storage/audios`
- `REPORTS_STORAGE_PATH=./storage/reports`
- `LOG_LEVEL=info`
- `LOG_FILE=./logs/app.log`

Valide as variaveis com:

```bash
npm run hostinger:validate-env
```

## Banco de Dados

O reposititorio ainda nao contem migrations Prisma versionadas em `backend/prisma/migrations`. Para o primeiro deploy na Hostinger, a estrategia configurada e sincronizar o schema atual com `prisma db push`.

Execute uma vez apos criar o PostgreSQL e configurar `DATABASE_URL`:

```bash
npm run hostinger:db:push
```

Para tambem executar o seed inicial:

```bash
RUN_PRISMA_SEED=true npm run hostinger:db:push
```

Depois que o sistema estiver em producao, prefira criar migrations versionadas com `npm run prisma:migrate:dev --prefix backend` em desenvolvimento e usar `npm run prisma:migrate --prefix backend` em producao.

## Build e Start

Instalacao:

```bash
npm run hostinger:install
```

Build:

```bash
npm run hostinger:build
```

Start:

```bash
npm start
```

O backend Express serve `frontend/dist` automaticamente quando `NODE_ENV=production`, entao API e frontend podem ficar no mesmo dominio. O frontend chama a API por `/api`.

## Validacao Pos-Deploy

Validacao automatica basica:

```bash
DEPLOY_URL=https://seudominio.com.br npm run hostinger:validate-deploy
```

Checklist manual:

1. Acesse `https://seudominio.com.br/api/health` e confirme `status: ok`.
2. Acesse `https://seudominio.com.br` e confirme que o painel React abriu.
3. Teste login/admin.
4. Confirme que o backend conectou no PostgreSQL sem erro.
5. Configure webhooks externos com URL HTTPS, por exemplo `https://seudominio.com.br/api/webhook`.
6. Reinicie o App Node.js e confirme que arquivos em `storage/` e `logs/` permanecem.
