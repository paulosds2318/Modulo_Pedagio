# Integração Coral, Módulo de Pedágios e Adyen

## Contexto

O Módulo de Pedágios recebe do Coral os dados das passagens, agrupa as cobranças por contrato e acompanha sua régua de cobrança. A Adyen processa o pagamento. Hoje, a aplicação já possui uma rota para receber notificações de pagamento da Adyen e marcar o lote como pago após validar o evento. Para que o Coral também deixe de depender de atualização manual, será necessária uma comunicação de retorno: após a confirmação válida da Adyen, o módulo deve informar ao Coral que a cobrança foi paga.

Este documento descreve os dados e o fluxo desejados. Os contratos com os sistemas Coral e Adyen ainda precisam ser confirmados com seus responsáveis; a existência de uma rota no módulo não significa que a integração externa esteja configurada ou homologada.

## Dados que o Coral deve enviar

O Coral deve enviar uma passagem por registro, ou um lote de registros, com os campos abaixo:

| Campo | Obrigatório | Descrição e formato esperado |
| --- | --- | --- |
| `numeroContrato` | Sim | Número do contrato de locação ao qual a passagem será vinculada. |
| `cpfCliente` | Sim | CPF do cliente responsável pelo contrato, somente dígitos. Deve ser transmitido por canal autenticado e tratado como dado pessoal. |
| `placa` | Sim | Placa do veículo no momento da passagem. |
| `tag` | Sim | Identificação da tag utilizada na passagem. |
| `praca` | Sim | Nome ou código da praça de pedágio. |
| `rodovia` | Sim | Rodovia onde ocorreu a passagem. |
| `dataHora` | Sim | Data e hora da passagem, em formato ISO 8601 com fuso horário explícito. |
| `valorCentavos` | Sim | Valor inteiro em centavos. Exemplo: R$ 12,90 deve ser enviado como `1290`. |
| `lojaRetirada` | Sim | Loja/unidade associada à retirada do veículo. |
| `idCoral` | Sim | Identificador único e imutável da passagem no Coral. Deve ser o mesmo em todas as retransmissões daquela passagem. |

O contrato atual de importação também aceita `telefoneCliente` como campo opcional. O contrato de sincronização de locações recebe `numeroContrato`, `cpfCliente`, `telefoneCliente`, `placa`, `dataRetirada`, `dataDevolucao` e `lojaRetirada`.

### Exemplo de passagem

```json
{
  "idCoral": "PASSAGEM-987654321",
  "numeroContrato": "LOC-2026-1234",
  "cpfCliente": "12345678901",
  "telefoneCliente": "5511999999999",
  "placa": "ABC1D23",
  "tag": "TAG-445566",
  "praca": "Praça Exemplo",
  "rodovia": "SP-348",
  "dataHora": "2026-10-21T14:35:00-03:00",
  "valorCentavos": 1290,
  "lojaRetirada": "São Paulo - Centro"
}
```

## Envio das passagens ao módulo

A rota de importação é `POST /api/passagens`. Ela aceita de 1 a 500 registros por requisição e exige `Authorization: Bearer CORAL_PASSAGES_SYNC_SECRET`. O identificador `idCoral` é único: se o Coral retransmitir um registro, o módulo reconhece a duplicidade e não cria outra passagem.

Depois da importação, o módulo compila automaticamente as passagens pendentes recebidas naquela chamada, agrupando por número do contrato e CPF. A criação do lote inicia a etapa D+0 e grava as tarefas de integração na outbox. A resposta inclui `lotesCompilados`, `passagensCompiladas`, `idsLotesCompilados` e `falhasCompilacao`. Grupos com valor total zero, acima do limite ou envolvidos em conflito permanecem pendentes e podem ser tratados na tela `/compilacao`.

Como a compilação acontece na chegada, o Coral deve enviar juntas as passagens que devem fazer parte do mesmo lote. Se enviar cada passagem em uma chamada separada, cada chamada poderá gerar um lote separado para aquele contrato/CPF.

O Coral deve enviar datas com fuso horário, valores em centavos e o mesmo `idCoral` em todas as tentativas. A integração deve registrar falhas e permitir reenvio seguro. O segredo deve ser compartilhado por canal seguro e armazenado como variável de ambiente, nunca no código-fonte.

## Fluxo desejado para atualização automática do pagamento

1. O módulo cria e acompanha a cobrança do lote, associando-a a uma referência única, como `LOTE_<id-do-lote>`.
2. A Adyen envia uma notificação de pagamento para `POST /api/webhooks/adyen`.
3. O módulo valida a assinatura HMAC da Adyen e confere os dados da notificação com a cobrança: referência, moeda e valor. Somente uma confirmação válida de pagamento pode liquidar o lote.
4. Após confirmar o pagamento, o módulo grava o lote como `PAGO` e registra o evento de auditoria. O processamento da notificação deve ser idempotente para que reenvios da Adyen não dupliquem efeitos.
5. O módulo envia ao Coral uma solicitação autenticada para atualizar a cobrança/passagens relacionadas ao contrato como pagas, informando a referência da cobrança e os dados necessários para localizar os registros.
6. O Coral confirma a atualização. Se o Coral estiver indisponível, o módulo deve registrar a falha e tentar novamente sem cobrar o cliente novamente nem reverter o pagamento confirmado pela Adyen.

## Retorno que precisa ser disponibilizado pelo Coral

Para concluir a atualização automática, o Coral precisa disponibilizar um endpoint de atualização de status ou um mecanismo equivalente. O contrato final deve definir:

- URL e método HTTP do endpoint;
- autenticação entre os sistemas (por exemplo, token de serviço ou mTLS);
- identificador usado para localizar as passagens/cobrança no Coral;
- estados aceitos e transição permitida para `PAGO`;
- payload de atualização, incluindo referência da cobrança, valor, moeda e data/hora do pagamento;
- resposta de sucesso, erros recuperáveis e erros permanentes;
- chave de idempotência para reenvios;
- política de retentativa, prazo e conciliação de divergências.

Como proposta inicial, o retorno pode conter `idCoral` de cada passagem vinculada, `numeroContrato`, `status: "PAGO"`, `referenciaPagamento`, `valorCentavos`, `moeda: "BRL"` e `dataHoraPagamento`. O Coral deve confirmar se o status é controlado por passagem, por contrato ou por cobrança agregada; o módulo não deve presumir essa regra.

## Situação atual e próximos passos

- O módulo já importa passagens do Coral em `POST /api/passagens` e possui uma rota de webhook Adyen que atualiza o status local do lote quando a notificação é válida.
- O módulo também possui consulta manual do status do link Adyen na tela de detalhes, como recurso de conferência.
- O retorno de status pago ao Coral depende de endpoint e contrato fornecidos pelo Coral; esse envio não deve ser considerado ativo até ser implementado, configurado e homologado.
- Antes de usar dados reais, Coral e Adyen devem homologar payloads, autenticação, assinatura, idempotência, retentativas, valores e tratamento de eventos duplicados ou fora de ordem.
