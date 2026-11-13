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

## Consulta de passagens ConectCar no Coral

| Variável | O que configura | Quando usar |
|---|---|---|
| **CORAL_TOLL_DATA_URL** | URL do endpoint `GET /api/fleet/management/tag/public/events/conectcar/toll-data` do Coral. Pode ser só a base, como `https://homologservicescoral.aluguefoco.com.br`. | Liga a sincronização manual e no cron. Sem ela, a sincronização fica desligada. |
| **CORAL_TOLL_DATA_TOKEN** | Token fixo fornecido pelo Coral para a consulta de passagens, enviado como `Authorization: Bearer <token>`. | Opcional. Quando preenchido, o módulo não faz login; se o Coral recusar (401), a sincronização falha com aviso. Vazio, usa o login abaixo. |
| **CORAL_TOLL_DATA_LOGIN** / **CORAL_TOLL_DATA_PASSWORD** | Credenciais do `POST /api/auth/login` na mesma origem da URL acima. | Opcionais; quando ausentes, usa `CORAL_PAY_BY_LINK_LOGIN` e `CORAL_PAY_BY_LINK_PASSWORD`. |
| **CORAL_TOLL_DATA_LOOKBACK_DAYS** | Janela de dias enviada como `startDate`/`endDate` (`AAAA-MM-DD`). | Opcional; padrão 7, máximo 31 (limite do Coral). O Coral exige `startDate` e `endDate` juntos. |

A resposta deve seguir o mesmo contrato de `POST /api/passagens` (os 10 campos obrigatórios, `valorCentavos` inteiro, `dataHora` ISO 8601 com fuso e CPF somente dígitos). Registros fora do contrato são rejeitados individualmente e listados na resposta da sincronização. O `idCoral` é usado sem alteração, então reenvios pelos dois caminhos não duplicam passagens.

## Adyen

| Variável | O que configura | Quando usar |
|---|---|---|
| **ADYEN_API_KEY** | Credencial para consultar links criados direto na Adyen (o débito no cartão não usa mais a Adyen direta: vai pelo Coral). | Opcional. |
| **ADYEN_MERCHANT_ACCOUNT** | Conta de comerciante usada nas notificações e nas consultas Adyen. | Necessária junto com ADYEN_API_KEY. |
| **ADYEN_ENVIRONMENT** | Ambiente da API: test ou live. | Padrão test. Somente live seleciona produção. |
| **ADYEN_API_VERSION** | Versão do endpoint Checkout API. | Opcional; padrão v71. |
| **ADYEN_LIVE_PREFIX** | Prefixo de região/endpoint da conta Live Adyen. | Obrigatório quando ADYEN_ENVIRONMENT=live. |
| **ADYEN_HMAC_KEY** | Chave HMAC que valida a assinatura dos webhooks de pagamento. | Configure no app e no webhook da Adyen; notificações sem assinatura válida são rejeitadas. |

## Coral

| Variável | O que configura | Quando usar |
|---|---|---|
| **CORAL_WALLET_ENCODE** | Chave de criptografia (AES-256) do payload do débito no cartão salvo, pelo Coral (`/wallet-payment`). | Obrigatória para o débito automático do D+2 e do D+7; sem ela o débito não é tentado e a régua segue. Pedir ao time do Coral; use o valor do ambiente certo (homologação ou produção). Nunca publique. |

## WhatsApp

| Variável | O que configura | Quando usar |
|---|---|---|
| **WHATSAPP_API_URL** | URL do gateway de envio. O adaptador assume o payload to, text e reference. | A integração ainda não foi validada com o fornecedor. Para retentativas seguras, o gateway precisa deduplicar pelo valor estável de reference. Sem URL, a tarefa fica aguardando configuração. |
| **WHATSAPP_API_TOKEN** | Bearer enviado ao gateway de saída. | Use se o gateway exigir autenticação. |
| **WHATSAPP_WEBHOOK_TOKEN** | Segredo Bearer para autenticar retornos de entrega em POST /api/webhooks/whatsapp. | Configure no provedor e no app se receber status por webhook. |

## Rotina automática

A rotina busca passagens no Coral, avança a régua (tentativas no cartão, lembrete, inadimplência) e repete integrações com falha. Pode rodar de dois jeitos, que compartilham a mesma trava no banco (nunca duas execuções ao mesmo tempo):

| Variável | O que configura | Quando usar |
|---|---|---|
| **AGENDADOR_INTERNO** | `true` liga o agendador dentro do próprio módulo: a rotina roda sozinha enquanto o servidor estiver ligado. | Produção na AWS (ECS com container sempre ligado). No Render gratuito, que "dorme", só roda enquanto o app estiver acordado. |
| **AGENDADOR_INTERVALO_MIN** | Intervalo entre execuções, em minutos. | Opcional; padrão 60, mínimo 5. A primeira execução acontece 1 minuto depois de o servidor subir. |

Cada execução aparece no painel (cartão "Rotina automática"), com alerta se parar ou falhar.

### Chamada externa (opcional)

| Variável | O que configura | Quando usar |
|---|---|---|
| **CRON_SECRET** | Bearer que protege GET/POST /api/cron/regua, a rotina automática de cobrança. | Configure quando um agendador externo chamar a rota. Envie como Authorization: Bearer <segredo>. |

## Links de pagamento via Coral/Foco

| Variável | O que configura | Quando usar |
|---|---|---|
| **CORAL_PAY_BY_LINK_BASE_URL** | URL base da API de Pay By Link do Coral. | Sem ela, o padrão é a homologação (`https://homologservicescoral.aluguefoco.com.br`); só com `ADYEN_ENVIRONMENT=live` o padrão passa a ser produção (`https://servicescoral.aluguefoco.com.br`). Fora de `live`, uma URL de produção é recusada e o link precisa ser de teste (checkout `homologcheckout…` do Coral ou `test.adyen.link`); qualquer outro é descartado. |
| **CORAL_PAY_BY_LINK_LOGIN** | Login usado em `POST /api/auth/login`. | Obrigatório para gerar links de pagamento. |
| **CORAL_PAY_BY_LINK_PASSWORD** | Senha correspondente ao login. | Obrigatória; mantenha em segredo local ou no gerenciador de secrets do Render. |
| **CORAL_PAY_BY_LINK_VALIDADE_DIAS** | Validade do link de pagamento, em dias a partir da emissão (enviada em `dateInRA`). | Opcional; padrão 15, de 1 a 60. O checkout mostra "Reserva expirada" quando essa data passa; a régua gera links novos automaticamente no D+2 e no D+5. |
| **CORAL_PAY_BY_LINK_DATA_REFERENCIA** | Qual data vai em `dateInRA`: `validade` (emissão + validade), `emissao` ou `retirada` (data de retirada da locação, comportamento antigo). | Opcional; padrão `validade`. `retirada` faz links de pedágio nascerem expirados, porque a cobrança é posterior à locação. |

O módulo solicita um JWT ao endpoint de login, consulta o contrato em `GET /api/rentagreement/{numeroContrato}` e usa o token para chamar `POST /api/adyen-pay-by-link/v2/create`. O `reference` enviado é `LOTE_<id>`, e o valor em centavos é convertido para reais. O webhook da Adyen continua dependendo de `ADYEN_HMAC_KEY`. A API de criação informada retorna somente a URL; sem identificador do link, o módulo não consegue consultá-lo nem expirará-lo diretamente na Adyen.

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
