# Publicar no Render

O arquivo render.yaml define um serviço web Docker e um banco PostgreSQL, configura a conexão entre eles, gera o segredo do Better Auth e usa /api/health para verificar a aplicação.

## Criar a publicação

1. Acesse o Render Dashboard e crie um Blueprint.
2. Conecte o repositório paulosds2318/Modulo_Pedagio. Se ele não aparecer na lista do GitHub, autorize o aplicativo Render para esse repositório ou use a opção Public Git Repository com a URL https://github.com/paulosds2318/Modulo_Pedagio.
3. Use a branch main e o arquivo render.yaml na raiz do repositório.
4. Informe SEED_ADMIN_PASSWORD e SEED_VIEWER_PASSWORD com senhas fortes, diferentes e com pelo menos 12 caracteres.
5. Revise os recursos e confirme o deploy. Aguarde o serviço web ficar Live e verifique /api/health.

O Dockerfile aplica as migrações Prisma antes de iniciar o servidor. A migração de autenticação cria as tabelas do Better Auth antes da execução do seed. Após o primeiro deploy bem-sucedido, initialDeployHook executa npm run seed:dev uma única vez. Os usuários de demonstração são admin@focoalugueldecarros.com.br e visualizador@focoalugueldecarros.com.br. As senhas não são gravadas no repositório.

## Atualizar a aplicação

Faça commit e push das alterações para a branch main. Se o serviço estiver conectado pela opção Public Git Repository, abra o serviço no Render e use Manual Deploy > Deploy latest commit. Para deploy automático, conecte o GitHub como provedor de deploy, autorize o repositório e configure Auto-Deploy como On Commit.

## Limites do plano de demonstração

Esta configuração usa recursos gratuitos para facilitar uma demonstração. O serviço web pode levar cerca de um minuto para acordar após ficar inativo. O PostgreSQL gratuito tem prazo de expiração definido pelo Render; confira a data no painel. Não use esse banco para dados reais de clientes ou operação. Para uso contínuo, avalie planos pagos e configure backups.

As credenciais Adyen, Coral, WhatsApp e CRON não estão configuradas porque as integrações ainda não foram conectadas. Adicione-as depois pelo painel do Render, sem colocá-las no render.yaml.