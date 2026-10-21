# Publicar no Render

O `render.yaml` cria um serviço web Docker e um PostgreSQL, configura a conexão entre eles, gera o segredo do Better Auth e usa `/api/health` para verificar a aplicação.

## Criar a publicação

1. Entre no [Render Dashboard](https://dashboard.render.com/) e conecte sua conta GitHub, se ainda não estiver conectada.
2. Selecione **New → Blueprint** e escolha o repositório `paulosds2318/Modulo_Pedagio`.
3. Revise os recursos identificados no `render.yaml` e confirme a criação.
4. Aguarde o deploy ficar saudável. O Render exibirá a URL pública `onrender.com` do serviço.

O deploy do app executa as migrações Prisma automaticamente antes de iniciar o servidor. Após o primeiro deploy bem-sucedido, o `initialDeployHook` executa `npm run seed:dev` uma vez e cria usuários e dados fictícios de demonstração. O Render pedirá `SEED_ADMIN_PASSWORD` e `SEED_VIEWER_PASSWORD` durante a criação do Blueprint; escolha senhas fortes com pelo menos 12 caracteres. O usuário administrador inicial é `admin@focoalugueldecarros.com.br` e o visualizador é `visualizador@focoalugueldecarros.com.br`. As senhas não são exibidas nem gravadas no repositório.

## Limites do plano de demonstração

Esta configuração usa recursos gratuitos para facilitar uma demonstração. O serviço web pode levar cerca de um minuto para acordar após ficar inativo. O PostgreSQL gratuito expira após 30 dias; após esse prazo, é necessário fazer upgrade dentro do período de recuperação para manter os dados. Não use este banco para dados reais de clientes ou operação. Para uso contínuo, altere os planos do app e do PostgreSQL para planos pagos antes de criar os recursos.

As credenciais Adyen, Coral, WhatsApp e CRON foram deixadas de fora porque as integrações ainda não foram configuradas. Adicione-as depois pelo painel do Render, sem colocá-las no `render.yaml`.
