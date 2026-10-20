# Variáveis de ambiente

Este guia explica as variáveis do Toll Manager e quando configurá-las. Valores secretos devem ficar no arquivo local .env ou no gerenciador de secrets da plataforma. Não compartilhe esses valores nem faça commit do .env.

## Autenticação e aplicação

| Variável | O que configura | Quando usar |
|---|---|---|
| **BETTER_AUTH_SECRET** | Chave privada usada pelo Better Auth para assinar e proteger sessões. | Obrigatória. O Docker Compose não inicia o app sem ela. Use um valor aleatório forte. |
| **BETTER_AUTH_URL** | URL base pública usada pelo Better Auth, como https://pedagios.empresa.com. | Opcional localmente; configure em produção com a URL pública e HTTPS. Padrão local: http://localhost:3000. |
| **FRAME_ANCESTORS** | Origens autorizadas a exibir o app em iframe, pela política CSP frame-ancestors. | Opcional; padrão 'self'. Acrescente somente domínios confiáveis. No Docker, alterar exige reconstruir a imagem. |
| **NODE_ENV** | Modo de execução do Node.js. | O Compose define production no container; normalmente não precisa entrar no .env. |

## Banco de dados

| Variável | O que configura | Quando usar |
|---|---|---|
| **DATABASE_URL** | Conexão do Prisma com PostgreSQL. | Para executar o app diretamente no computador; o exemplo usa localhost:5432. No Compose, o app conecta ao host interno db:5432 usando POSTGRES_*; o DATABASE_URL do .env é ignorado pelo serviço app. |
| **POSTGRES_DB** | Nome do banco criado pelo container. | Opcional; padrão toll_manager. |
| **POSTGRES_USER** | Usuário criado para o banco. | Opcional; padrão toll_manager. |
| **POSTGRES_PASSWORD** | Senha desse usuário. | Troque o padrão de desenvolvimento por uma senha forte fora do ambiente local. |
| **DB_PORT** | Porta do computador encaminhada à porta 5432 do PostgreSQL no container. | Opcional; padrão 5432. O app continua usando db:5432 dentro do Compose. |

O banco usa volume persistente. Alterar POSTGRES_DB, POSTGRES_USER ou POSTGRES_PASSWORD no .env não altera automaticamente um banco que já foi inicializado no volume.

## Importação de dados

| Variável | O que configura | Quando usar |
|---|---|---|
| **CORAL_PASSAGES_SYNC_SECRET** | Segredo Bearer que autoriza uma origem a enviar passagens para POST /api/passagens. | Configure no Coral e no app. O Coral envia as passagens para POST /api/passagens usando Authorization: Bearer. Sem ele, a rota retorna 503. |
| **CORAL_RENTALS_SYNC_SECRET** | Segredo Bearer para o Coral enviar os contratos de locação para POST /api/locacoes/sincronizar. | Necessário se essa integração for usada. |

A integração recebe do Coral de 1 a 500 passagens por chamada. Cada registro deve conter idCoral (identificador único da passagem no Coral), numeroContrato, cpfCliente, placa, tag, praca, rodovia, dataHora, valorCentavos e lojaRetirada. telefoneCliente é opcional. Envie dataHora em formato ISO 8601 e valorCentavos como inteiro em centavos (por exemplo, R$ 12,34 = 1234). O banco possui uma restrição única para idCoral: reenvios são ignorados e contabilizados como duplicados, sem atualizar a passagem já recebida.

## Adyen

| Variável | O que configura | Quando usar |
|---|---|---|
| **ADYEN_API_KEY** | Credencial usada para criar links de pagamento e realizar cobranças. | Configure com a chave da Adyen. Vazia, desabilita as operações de pagamento Adyen. |
| **ADYEN_MERCHANT_ACCOUNT** | Conta de comerciante usada nas operações e validada nas notificações. | Necessária junto com ADYEN_API_KEY. |
| **ADYEN_ENVIRONMENT** | Ambiente da API: test ou live. | Padrão test. Somente live seleciona produção. |
| **ADYEN_API_VERSION** | Versão do endpoint Checkout API. | Opcional; padrão v71. |
| **ADYEN_LIVE_PREFIX** | Prefixo de região/endpoint da conta Live Adyen. | Obrigatório quando ADYEN_ENVIRONMENT=live. |
| **ADYEN_HMAC_KEY** | Chave HMAC que valida a assinatura dos webhooks de pagamento. | Configure no app e no webhook da Adyen; notificações sem assinatura válida são rejeitadas. |

## Coral

| Variável | O que configura | Quando usar |
|---|---|---|
| **CORAL_API_TOKEN** | Bearer enviado ao Coral para consultar o cartão tokenizado do contrato e CPF. | Necessário para consultar cartão tokenizado. |
| **CORAL_TOKEN_LOOKUP_URL** | Endpoint Coral que recebe numeroContrato e cpfCliente e retorna storedPaymentMethodId. | Necessário junto com CORAL_API_TOKEN para tentativas de cobrança no cartão. |

## WhatsApp

| Variável | O que configura | Quando usar |
|---|---|---|
| **WHATSAPP_API_URL** | URL do gateway de envio. O app envia to, text e reference. | Configure para habilitar os envios. Sem URL, mensagens não são enviadas pelo gateway. |
| **WHATSAPP_API_TOKEN** | Bearer enviado ao gateway de saída. | Use se o gateway exigir autenticação. |
| **WHATSAPP_WEBHOOK_TOKEN** | Segredo Bearer para autenticar retornos de entrega em POST /api/webhooks/whatsapp. | Configure no provedor e no app se receber status por webhook. |

## Rotina automática

| Variável | O que configura | Quando usar |
|---|---|---|
| **CRON_SECRET** | Bearer que protege GET/POST /api/cron/regua, a rotina automática de cobrança. | Configure quando um agendador externo chamar a rota. Envie como Authorization: Bearer <segredo>. |

## Seed de desenvolvimento

| Variável | O que configura | Quando usar |
|---|---|---|
| **SEED_ADMIN_PASSWORD** | Senha inicial do usuário administrador criado pelo seed. | Somente para npm run seed:dev; mínimo de 12 caracteres. |
| **SEED_VIEWER_PASSWORD** | Senha inicial do usuário viewer criado pelo seed. | Somente para npm run seed:dev; mínimo de 12 caracteres. |

As senhas de seed não criam usuários automaticamente em produção.

## Portas do Compose

| Variável | O que configura | Padrão |
|---|---|---|
| **PORT** | Porta do computador exposta para acessar o app. O container continua escutando na porta 3000. | 3000 |
| **DB_PORT** | Porta do computador exposta para acessar o PostgreSQL. | 5432 |

Por exemplo, PORT=3100 disponibiliza o app em http://localhost:3100. Em produção, ajuste também BETTER_AUTH_URL para a URL pública.

## Gerar segredos

No PowerShell, gere um valor aleatório com:

~~~powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
~~~

Use valores diferentes para BETTER_AUTH_SECRET, CORAL_PASSAGES_SYNC_SECRET, CRON_SECRET e tokens de webhook. Guarde-os no .env local ou no gerenciador de secrets da plataforma.
