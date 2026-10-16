/** Contrato esperado do endpoint interno: POST {numeroContrato,cpfCliente} -> {storedPaymentMethodId}. */
export async function getStoredPaymentMethod(numeroContrato: string, cpfCliente: string): Promise<string | null> {
  const url = process.env.CORAL_TOKEN_LOOKUP_URL;
  const token = process.env.CORAL_API_TOKEN;
  if (!url || !token) return null;
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ numeroContrato, cpfCliente }), cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Coral respondeu HTTP ${response.status} ao consultar token.`);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("storedPaymentMethodId" in result) || typeof result.storedPaymentMethodId !== "string") return null;
  return result.storedPaymentMethodId;
}
