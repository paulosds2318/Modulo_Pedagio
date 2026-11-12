/**
 * Templates de comunicação da régua (alinhamento com o Financeiro). Os textos abaixo são provisórios:
 * serão substituídos pelos modelos oficiais de WhatsApp (aprovados na Meta) e de e-mail quando o Financeiro enviar.
 */
export type TemplateCobranca =
  | "COBRANCA_INICIAL"
  | "AVISO_DEBITO"
  | "NOVA_COBRANCA"
  | "ULTIMA_COBRANCA"
  | "COBRANCA_EXTRAJUDICIAL";

export const TEMPLATES: Record<TemplateCobranca, { numero: string; nome: string }> = {
  COBRANCA_INICIAL: { numero: "1", nome: "Cobrança inicial" },
  AVISO_DEBITO: { numero: "2/5", nome: "Aviso de débito no cartão" },
  NOVA_COBRANCA: { numero: "3", nome: "Nova cobrança" },
  ULTIMA_COBRANCA: { numero: "4", nome: "Última cobrança" },
  COBRANCA_EXTRAJUDICIAL: { numero: "6", nome: "Aviso de cobrança extrajudicial" },
};

export type DadosMensagem = {
  nomeCliente: string | null;
  numeroContrato: string;
  valorCentavos: number;
  link: string | null;
  prazo: Date | null;
};

const money = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
const quando = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d) : "";

/** Texto provisório do template (até os modelos oficiais chegarem). */
export function textoProvisorio(template: TemplateCobranca, d: DadosMensagem) {
  const ola = `Olá${d.nomeCliente ? `, ${d.nomeCliente.split(" ")[0]}` : ""}!`;
  const ref = `pedágios do contrato ${d.numeroContrato} (${money(d.valorCentavos)})`;
  const pague = d.link ? ` Pague pelo link até ${quando(d.prazo)}: ${d.link}` : "";
  switch (template) {
    case "COBRANCA_INICIAL":
      return `${ola} Identificamos ${ref}.${pague}`;
    case "AVISO_DEBITO":
      return `${ola} O valor dos ${ref} foi debitado no cartão cadastrado na sua locação.`;
    case "NOVA_COBRANCA":
      return `${ola} Não identificamos o pagamento dos ${ref}.${pague}`;
    case "ULTIMA_COBRANCA":
      return `${ola} Último aviso: os ${ref} continuam em aberto.${pague}`;
    case "COBRANCA_EXTRAJUDICIAL":
      return `${ola} Os ${ref} seguem sem pagamento após todas as tentativas. A cobrança será encaminhada para cobrança extrajudicial.`;
  }
}
