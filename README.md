# Toll Manager App

Aplicação TypeScript/Next.js para organizar passagens de pedágio, compilar lotes e acompanhar uma régua D+0/D+5/D+7/D+10. Usa Prisma e PostgreSQL, adequada para rodar em container ou hospedagem web.

## Rodar localmente

Requer Node.js 20.9+, npm e PostgreSQL. Para desenvolvimento sem instalar PostgreSQL diretamente, use Docker Compose.

```powershell
cd toll-manager-app
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Para dados locais de demonstracao, aplique as migracoes, defina `SEED_ADMIN_PASSWORD` e `SEED_VIEWER_PASSWORD` (minimo 12 caracteres) e execute `npm run seed:dev`. O seed nao possui senhas padrao.

### Rodar aplicação e banco com Docker

Copie `.env.example` para `.env`, configure o banco e gere um `BETTER_AUTH_SECRET` forte antes de executar:

```powershell
docker compose up --build -d
```

A aplicação ficará em `http://localhost:3000`. O banco usa volume persistente. Para parar: `docker compose down`; para apagar o banco local junto, `docker compose down -v`.

### Deploy web

O projeto gera uma build standalone do Next.js e inclui `Dockerfile` e `docker-compose.yml`. Em produção, use PostgreSQL gerenciado e configure `DATABASE_URL` no ambiente da plataforma com as credenciais do banco; não use o banco local do Compose como banco de produção. O container aplica `prisma migrate deploy` antes de iniciar o servidor.

Configure as variáveis de integração do `.env.example` como secrets da plataforma. Use HTTPS, senhas fortes, backups e um serviço de cron externo chamando `GET /api/cron/regua` diariamente com `Authorization: Bearer CRON_SECRET`. Configure `FRAME_ANCESTORS` com os domínios do Coral autorizados a embutir a aplicação, por exemplo: `'self' https://coral.suaempresa.com`. A política de iframe é incorporada durante o build; defina essa variável também no ambiente de build e faça novo deploy quando mudar os domínios. É uma lista de origens CSP, mantendo as aspas simples em torno de `'self'`.

O Docker Compose serve para desenvolvimento e validação do container. O deploy público ainda depende de escolher uma plataforma, provisionar PostgreSQL, cadastrar secrets e apontar os domínios/webhooks dos fornecedores.

## Páginas

- `/`: indicadores e lotes recentes.
- `/compilacao`: filtro por contrato/placa/praça/loja/período, seleção de passagens e compilação.
- `/lotes`: busca e filtro por status.
- `/lotes/[id]`: detalhes, passagens, link, eventos da régua e baixa manual.

## Integrações e contratos canônicos


- `POST /api/locacoes/sincronizar`: recebe `[{numeroContrato, cpfCliente, telefoneCliente?, placa, dataRetirada, dataDevolucao, lojaRetirada}]` do Coral; autenticação `Bearer CORAL_RENTALS_SYNC_SECRET`.
- `POST /api/passagens`: importa de 1 a 500 passagens no formato `{idOrigem, numeroContrato, cpfCliente, telefoneCliente?, placa, tag, praca, rodovia, dataHora, valorCentavos, lojaRetirada}`. Exige `Authorization: Bearer PASSAGES_IMPORT_SECRET`. O aplicativo nao consulta APIs de fornecedores de passagens; a origem escolhida pela operacao deve enviar os dados para esse endpoint.
- `POST /api/lotes/compilar`: cria o lote, tenta criar Pay-by-link Adyen e envia a notificação inicial pelo gateway WhatsApp.
- `GET` ou `POST /api/cron/regua`: executar diariamente com `Authorization: Bearer CRON_SECRET`. Processa D+5 (tentativa no cartão), D+7 (lembrete WhatsApp) e D+10 (segunda tentativa); requer que a consulta de token Coral esteja configurada.
- `POST /api/webhooks/adyen`: exige HMAC configurado em `ADYEN_HMAC_KEY`.
- `POST /api/webhooks/whatsapp`: contrato `{messageId,status,details?}` e `Authorization: Bearer WHATSAPP_WEBHOOK_TOKEN`.
- `GET /api/lotes/[id]`: retorna lote, passagens e auditoria.
- `PATCH /api/lotes/[id]`: baixa manual para `PAGO`/`INADIMPLENTE`; exige sessao de administrador e nota auditavel.

O gateway WhatsApp espera `POST {to,text,reference}` e pode retornar `{messageId}`. O endpoint Coral para token espera `POST {numeroContrato,cpfCliente}` e responde `{storedPaymentMethodId}`. Ajuste esses adaptadores ao contrato autenticado real. PAN e CVV não são armazenados.

## Configuração

Preencha `.env` local com as URLs, tokens e chaves. Nunca publique credenciais. A integração de cartão tokenizado depende de autorização, consentimento e disponibilidade do token no Coral. O cron deve ser invocado por um scheduler persistente; acessar a página não executa a régua.

Antes de publicar: confirme os contratos das integracoes, valide payloads e HMAC, configure retentativas, backups, observabilidade, HTTPS e politica de iframe do Coral. Rotas de dados exigem sessao Better Auth; rotas administrativas exigem perfil admin. O Docker Compose exige `BETTER_AUTH_SECRET` no `.env`.

