import { db } from "@/lib/db";
import { chargeStoredPaymentMethod, expirePaymentLink } from "@/lib/adyen";
import { getStoredPaymentMethod } from "@/lib/services/coral";
import { obterPrazosRegua } from "@/lib/services/config-regua";
import { gerarNovoLink } from "@/lib/services/novo-link";
import { notificarCliente } from "@/lib/services/notificacoes";
import { linkVencido, rotuloEtapa, type PrazosRegua } from "@/lib/regua-config";

/**
 * Régua de cobrança (alinhamento com o Financeiro):
 *   D+0  cobrança inicial com link de 48 h (template 1) — feita pela outbox, ao criar o lote.
 *   D+2  link vencido e não pago → débito no cartão. Aprovado: template 2. Não aprovado: novo link + template 3.
 *   D+5  link vencido e não pago → novo link + template 4 (última cobrança).
 *   D+7  link vencido e não pago → débito no cartão. Aprovado: template 5. Não aprovado: template 6
 *        (cobrança extrajudicial) e o lote vai para tratamento manual (INADIMPLENTE).
 * Internamente as etapas são D5, D7 e D10 (1ª tentativa, última cobrança, 2ª tentativa); os dias vêm da configuração.
 * Pago em qualquer momento sai da régua: só lotes EM_REGUA são processados e o status é conferido antes de cada ação.
 */

const DAY = 24 * 60 * 60 * 1000;

/**
 * PAGO: débito aprovado. NAO_APROVADO: recusado, sem cartão ou cobrança no cartão indisponível (segue a régua).
 * AGUARDAR: link ainda válido, débito pendente ou falha de comunicação (tenta de novo na próxima execução,
 * sem avançar, para não arriscar cobrança em dobro). JA_PAGO: o lote foi pago por outro canal.
 */
type Tentativa = "PAGO" | "NAO_APROVADO" | "AGUARDAR" | "JA_PAGO";

/**
 * Situações em que a régua tenta de novo na próxima execução. Com a rotina rodando de hora em hora,
 * a mesma situação só é registrada uma vez a cada 24 h por lote, etapa e ação.
 */
const RESULTADOS_REPETIDOS = new Set(["BLOQUEADO", "NAO_CONFIGURADO", "SEM_CARTAO", "PENDENTE", "FALHA", "AGUARDANDO"]);

async function addLog(
  loteId: number,
  etapa: string,
  acao: string,
  canal: string,
  resultado: string,
  detalhesResposta?: string,
  providerMessageId?: string
) {
  if (RESULTADOS_REPETIDOS.has(resultado)) {
    const recente = await db.logRegua.findFirst({
      where: { loteId, etapa, acao, resultado, dataHora: { gte: new Date(Date.now() - DAY) } },
      select: { id: true },
    });
    if (recente) return null;
  }
  return db.logRegua.create({ data: { loteId, etapa, acao, canal, resultado, detalhesResposta, providerMessageId } });
}

async function tentarDebito(loteId: number, etapa: "D5" | "D10", prazos: PrazosRegua, now: Date): Promise<Tentativa> {
  // 1. O lote ainda está em aberto? (pagamento por outro canal encerra a régua)
  const fresh = await db.loteCobranca.findUnique({ where: { id: loteId } });
  if (!fresh || fresh.status !== "EM_REGUA") return "JA_PAGO";

  // 2. Só debita com o link vencido: com o link válido, o cliente ainda pode pagar por ele (cobrança em dobro).
  if (!linkVencido(fresh, prazos.validadeLinkHoras, now)) {
    if (!fresh.adyenLinkId) {
      await addLog(loteId, etapa, "AGUARDAR_VENCIMENTO_LINK", "Sistema", "AGUARDANDO",
        `Débito no cartão aguardando o vencimento do link de pagamento (${fresh.linkExpiraEm?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "sem data"}).`);
      return "AGUARDAR";
    }
    // Link criado direto na Adyen (com identificador): expira antes de debitar.
    try {
      await expirePaymentLink(fresh.adyenLinkId, fresh.id);
      await addLog(loteId, etapa, "EXPIRAR_LINK_PREVENTIVO", "Adyen", "SUCESSO", `Link ${fresh.adyenLinkId} expirado antes do débito.`);
    } catch (error) {
      await addLog(loteId, etapa, "EXPIRAR_LINK_PREVENTIVO", "Adyen", "FALHA",
        `Não foi possível expirar o link ${fresh.adyenLinkId}: ${error instanceof Error ? error.message : "erro desconhecido"}. Débito adiado para evitar duplicidade.`);
      return "AGUARDAR";
    }
  }

  // 3. Débito no cartão indisponível (sem credenciais ou sem cartão) conta como não aprovado: a régua segue.
  if (!process.env.ADYEN_API_KEY || !process.env.ADYEN_MERCHANT_ACCOUNT) {
    await addLog(loteId, etapa, "COBRAR_CARTAO", "Adyen", "NAO_CONFIGURADO", "Credenciais Adyen ausentes; débito no cartão não realizado.");
    return "NAO_APROVADO";
  }
  let token: string | null;
  try {
    token = await getStoredPaymentMethod(fresh.numeroContrato, fresh.cpfCliente);
  } catch (error) {
    await addLog(loteId, etapa, "CONSULTAR_TOKEN", "Coral", "FALHA", error instanceof Error ? error.message : "Falha na comunicação com o Coral.");
    return "NAO_APROVADO";
  }
  if (!token) {
    await addLog(loteId, etapa, "CONSULTAR_TOKEN", "Coral", "SEM_CARTAO", "Cliente sem cartão tokenizado no Coral.");
    return "NAO_APROVADO";
  }

  // 4. Débito via Adyen (cartão salvo).
  try {
    const result = await chargeStoredPaymentMethod(fresh.id, etapa, fresh.valorFinalCentavos, fresh.numeroContrato, token);
    if (result?.resultCode === "Authorised") {
      const update = await db.loteCobranca.updateMany({
        where: { id: fresh.id, status: "EM_REGUA" },
        data: { status: "PAGO", dataPagamento: new Date(), adyenPspReference: result.pspReference, formaPagamento: "CARTAO", valorRecebidoCentavos: fresh.valorFinalCentavos },
      });
      if (update.count > 0) {
        await addLog(fresh.id, etapa, "COBRAR_CARTAO", "Adyen", "APROVADO", `Débito autorizado no cartão (PSP: ${result.pspReference}).`, result.pspReference);
        return "PAGO";
      }
      await addLog(fresh.id, etapa, "ALERTA_DUPLICIDADE_DEBITO", "Adyen", "ESTORNO_NECESSARIO",
        `Cartão autorizado (PSP: ${result.pspReference}), mas o lote já tinha sido pago por outro canal. Necessário estorno.`);
      return "JA_PAGO";
    }
    if (result?.resultCode === "Refused") {
      await addLog(fresh.id, etapa, "COBRAR_CARTAO", "Adyen", "RECUSADO",
        `Débito recusado: ${result.refusalReason || "não autorizado pelo emissor"} (PSP: ${result.pspReference || "N/A"}).`, result.pspReference);
      return "NAO_APROVADO";
    }
    await addLog(fresh.id, etapa, "COBRAR_CARTAO", "Adyen", "PENDENTE", `Resultado não conclusivo (${result?.resultCode ?? "sem resposta"}). Aguardando.`);
    return "AGUARDAR";
  } catch (error) {
    await addLog(fresh.id, etapa, "COBRAR_CARTAO", "Adyen", "FALHA", error instanceof Error ? error.message : "Falha na chamada de cobrança à Adyen.");
    return "AGUARDAR";
  }
}

/** Gera novo link e comunica o cliente com o template da etapa. */
async function novaCobrancaComLink(loteId: number, etapa: string, template: "NOVA_COBRANCA" | "ULTIMA_COBRANCA") {
  try {
    await gerarNovoLink(loteId, etapa, `Novo link para ${template === "NOVA_COBRANCA" ? "nova cobrança" : "última cobrança"}.`);
  } catch {
    // A falha fica registrada no histórico pelo próprio gerarNovoLink; a comunicação segue com o link atual.
  }
  const lote = await db.loteCobranca.findUnique({ where: { id: loteId } });
  if (lote && lote.status === "EM_REGUA") await notificarCliente(lote, template, etapa);
}

async function comunicar(loteId: number, etapa: string, template: "AVISO_DEBITO" | "COBRANCA_EXTRAJUDICIAL") {
  const lote = await db.loteCobranca.findUnique({ where: { id: loteId } });
  if (lote) await notificarCliente(lote, template, etapa);
}

export async function processBillingRule(now = new Date()) {
  const prazos = await obterPrazosRegua();
  const open = await db.loteCobranca.findMany({ where: { status: "EM_REGUA" }, orderBy: { dataCriacao: "asc" } });
  let processed = 0;

  for (const item of open) {
    // Trava de concorrência (5 minutos) para não processar o mesmo lote duas vezes ao mesmo tempo.
    const claimed = await db.loteCobranca.updateMany({
      where: { id: item.id, status: "EM_REGUA", OR: [{ processandoAte: null }, { processandoAte: { lt: now } }] },
      data: { processandoAte: new Date(now.getTime() + 5 * 60_000) },
    });
    if (!claimed.count) continue;

    try {
      const lot = await db.loteCobranca.findUnique({ where: { id: item.id } });
      if (!lot || lot.status !== "EM_REGUA") continue;
      const age = now.getTime() - lot.dataCriacao.getTime();
      processed++;

      // Uma etapa por execução e, entre etapas, pelo menos a validade do link (48 h): mesmo sem link
      // (falha ao gerar), o cliente nunca recebe várias mensagens seguidas.
      const espera = prazos.validadeLinkHoras * 60 * 60 * 1000;
      const cedoDemais = (anterior: Date | null) => Boolean(anterior && now.getTime() - anterior.getTime() < espera);

      // ===== D+2 (D5): 1ª tentativa no cartão =====
      if (!lot.d5TentativaAt) {
        if (age < prazos.diasPrimeiraTentativa * DAY) continue;
        if (lot.etapaRegua !== "D5") await db.loteCobranca.update({ where: { id: lot.id }, data: { etapaRegua: "D5" } });
        const r = await tentarDebito(lot.id, "D5", prazos, now);
        if (r === "AGUARDAR" || r === "JA_PAGO") continue;
        await db.loteCobranca.update({ where: { id: lot.id }, data: { d5TentativaAt: now } });
        if (r === "PAGO") await comunicar(lot.id, "D5", "AVISO_DEBITO");
        else await novaCobrancaComLink(lot.id, "D5", "NOVA_COBRANCA");
        continue;
      }

      // ===== D+5 (D7): última cobrança com novo link =====
      if (!lot.d7LembreteAt) {
        if (age < prazos.diasLembrete * DAY || cedoDemais(lot.d5TentativaAt)) continue;
        if (!linkVencido(lot, prazos.validadeLinkHoras, now)) {
          await addLog(lot.id, "D7", "AGUARDAR_VENCIMENTO_LINK", "Sistema", "AGUARDANDO", "Última cobrança aguardando o vencimento do link atual.");
          continue;
        }
        await db.loteCobranca.update({ where: { id: lot.id }, data: { etapaRegua: "D7", d7LembreteAt: now } });
        await novaCobrancaComLink(lot.id, "D7", "ULTIMA_COBRANCA");
        continue;
      }

      // ===== D+7 (D10): 2ª tentativa no cartão / cobrança extrajudicial =====
      if (!lot.d10TentativaAt) {
        if (age < prazos.diasSegundaTentativa * DAY || cedoDemais(lot.d7LembreteAt)) continue;
        if (lot.etapaRegua !== "D10") await db.loteCobranca.update({ where: { id: lot.id }, data: { etapaRegua: "D10" } });
        const r = await tentarDebito(lot.id, "D10", prazos, now);
        if (r === "AGUARDAR" || r === "JA_PAGO") continue;
        if (r === "PAGO") {
          await db.loteCobranca.update({ where: { id: lot.id }, data: { d10TentativaAt: now } });
          await comunicar(lot.id, "D10", "AVISO_DEBITO");
          continue;
        }
        const encerrado = await db.loteCobranca.updateMany({
          where: { id: lot.id, status: "EM_REGUA" },
          data: { d10TentativaAt: now, status: "INADIMPLENTE" },
        });
        if (!encerrado.count) continue;
        await addLog(lot.id, "D10", "ENCERRAR_REGUA", "Sistema", "INADIMPLENTE",
          `Sem pagamento após ${rotuloEtapa("D10", prazos)}. Lote encaminhado para tratamento manual (cobrança extrajudicial).`);
        await comunicar(lot.id, "D10", "COBRANCA_EXTRAJUDICIAL");
      }
    } catch (err) {
      await addLog(item.id, "REGUA", "ERRO_PROCESSAMENTO", "Sistema", "FALHA", err instanceof Error ? err.message : "Erro inesperado ao processar lote.");
    } finally {
      await db.loteCobranca.updateMany({ where: { id: item.id }, data: { processandoAte: null } });
    }
  }

  return { encontrados: open.length, processados: processed };
}
