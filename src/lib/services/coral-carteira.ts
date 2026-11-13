import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { loginToCoral, limparTokenCoral, resolverBaseCoral } from "./coral-pay-by-link.ts";

/**
 * Cobrança na carteira (cartão tokenizado) pelo Coral: busca o cartão salvo do contrato e debita o valor
 * (POST /api/payment/integration/adyen-ecommerce-payment/tokens e /wallet-payment). O payload financeiro vai
 * criptografado em AES-256-CBC no padrão CryptoJS/OpenSSL ("Salted__" + salt, chave derivada por EVP/MD5).
 */

type Objeto = Record<string, unknown>;

export type CartaoSalvo = { token: string; adyenCustomerId: string; bandeira?: string; finalCartao?: string };

export type ResultadoCobranca =
  | { resultado: "APROVADO"; transactionId: string }
  /** Recusado pelo emissor/Adyen: dinheiro não saiu. */
  | { resultado: "RECUSADO"; motivo: string }
  /** Erro antes de efetivar (validação, autenticação): dinheiro não saiu, pode tentar de novo. */
  | { resultado: "ERRO"; motivo: string }
  /** Sem resposta confiável (timeout, 5xx): o débito pode ter sido feito. NÃO tentar de novo sem conferir no Coral. */
  | { resultado: "INCERTO"; motivo: string };

function objeto(valor: unknown): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Objeto) : {};
}

function texto(...valores: unknown[]): string | undefined {
  for (const v of valores) if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** Derivação de chave/IV do OpenSSL (EVP_BytesToKey com MD5), a mesma do CryptoJS. */
function derivarChaveEIv(senha: string, salt: Buffer) {
  let bloco = Buffer.alloc(0);
  let anterior = Buffer.alloc(0);
  while (bloco.length < 48) {
    anterior = createHash("md5").update(Buffer.concat([anterior, Buffer.from(senha, "utf8"), salt])).digest();
    bloco = Buffer.concat([bloco, anterior]);
  }
  return { chave: bloco.subarray(0, 32), iv: bloco.subarray(32, 48) };
}

export function criptografarPayloadCoral(payload: unknown, senha: string, salt: Buffer = randomBytes(8)): string {
  const { chave, iv } = derivarChaveEIv(senha, salt);
  const cifra = createCipheriv("aes-256-cbc", chave, iv);
  const dados = Buffer.concat([cifra.update(JSON.stringify(payload), "utf8"), cifra.final()]);
  return Buffer.concat([Buffer.from("Salted__"), salt, dados]).toString("base64");
}

export function descriptografarPayloadCoral(cifrado: string, senha: string): unknown {
  const bruto = Buffer.from(cifrado, "base64");
  if (bruto.subarray(0, 8).toString() !== "Salted__") throw new Error("Payload sem o prefixo Salted__.");
  const { chave, iv } = derivarChaveEIv(senha, bruto.subarray(8, 16));
  const decifra = createDecipheriv("aes-256-cbc", chave, iv);
  return JSON.parse(Buffer.concat([decifra.update(bruto.subarray(16)), decifra.final()]).toString("utf8"));
}

/** Chave de criptografia da carteira (CORAL_WALLET_ENCODE). Sem ela, não há débito no cartão. */
export function chaveCarteira(): string | null {
  return process.env.CORAL_WALLET_ENCODE?.trim() || null;
}

async function chamarCoral(caminho: string, corpo: unknown, timeoutMs: number): Promise<{ status: number; body: Objeto }> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const token = await loginToCoral(tentativa > 0);
    const resposta = await fetch(`${resolverBaseCoral()}${caminho}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (resposta.status === 401 && tentativa === 0) {
      limparTokenCoral();
      continue;
    }
    return { status: resposta.status, body: objeto(await resposta.json().catch(() => null)) };
  }
  throw new Error("Coral recusou a autenticação após renovar o token.");
}

/** Cartões tokenizados do cliente para o contrato (o primeiro da lista é o usado na cobrança). */
export async function buscarCartoes(contrato: string, cpf: string): Promise<CartaoSalvo[]> {
  const { status, body } = await chamarCoral(
    "/api/payment/integration/adyen-ecommerce-payment/tokens",
    { documentNumber: cpf.replace(/\D/g, ""), reservation: contrato },
    15_000
  );
  if (status < 200 || status >= 300) throw new Error(`Coral respondeu HTTP ${status} ao buscar o cartão salvo.`);
  const lista = Array.isArray(body.data) ? body.data : [];
  return lista
    .map(objeto)
    .filter((c) => texto(c.token) && texto(c.adyenCustomerId))
    .map((c) => ({
      token: texto(c.token)!,
      adyenCustomerId: texto(c.adyenCustomerId)!,
      bandeira: texto(c.cardFlag),
      finalCartao: texto(c.cardLastNumber),
    }));
}

/** Interpreta a resposta do wallet-payment: aprovado só com Authorised e transactionId numérico. */
export function interpretarRespostaCobranca(status: number, body: Objeto): ResultadoCobranca {
  const dados = objeto(body.data);
  const situacao = texto(body.status, body.result, dados.status, dados.result);
  const transacao = body.transactionId ?? dados.transactionId;
  const transactionId = typeof transacao === "number" || (typeof transacao === "string" && /^\d+$/.test(transacao)) ? String(transacao) : null;
  const recusa = texto(body.refusalReasonCode, dados.refusalReasonCode);
  const mensagem = texto(body.message, body.error, dados.message, dados.error);

  if (situacao?.toLowerCase() === "authorised" && transactionId) return { resultado: "APROVADO", transactionId };
  if (recusa || mensagem?.startsWith("ADYEN_") || situacao?.toLowerCase() === "refused") {
    return { resultado: "RECUSADO", motivo: recusa ?? mensagem ?? "não autorizado pelo emissor" };
  }
  if (status >= 400 && status < 500) return { resultado: "ERRO", motivo: mensagem ?? `Coral respondeu HTTP ${status}.` };
  return { resultado: "INCERTO", motivo: `Resposta sem confirmação (HTTP ${status}${situacao ? `, ${situacao}` : ""}).` };
}

/** Debita o valor no cartão salvo. Nunca lança: falha de rede vira INCERTO (o débito pode ter acontecido). */
export async function cobrarNaCarteira(input: {
  cpf: string;
  contrato: string;
  cartao: CartaoSalvo;
  valorCentavos: number;
  /** AAAA-MM-DD (dia de Brasília). */
  dia: string;
}): Promise<ResultadoCobranca> {
  const chave = chaveCarteira();
  if (!chave) return { resultado: "ERRO", motivo: "CORAL_WALLET_ENCODE não configurada." };
  const payload = {
    documentNumber: input.cpf.replace(/\D/g, ""),
    adyenCustomerId: input.cartao.adyenCustomerId,
    token: input.cartao.token,
    reservation: input.contrato,
    paymentCode: 0,
    value: Number((input.valorCentavos / 100).toFixed(2)),
    installments: 1,
    datePayment: `${input.dia}T00:00:00`,
    isWallet: true,
  };
  try {
    await loginToCoral(); // falha aqui = nada foi enviado, o débito não aconteceu
  } catch (error) {
    return { resultado: "ERRO", motivo: error instanceof Error ? error.message : "Falha ao autenticar no Coral." };
  }
  try {
    const { status, body } = await chamarCoral(
      "/api/payment/integration/adyen-ecommerce-payment/wallet-payment",
      { data: criptografarPayloadCoral(payload, chave) },
      30_000
    );
    return interpretarRespostaCobranca(status, body);
  } catch (error) {
    return { resultado: "INCERTO", motivo: error instanceof Error ? error.message : "Falha de comunicação com o Coral." };
  }
}
