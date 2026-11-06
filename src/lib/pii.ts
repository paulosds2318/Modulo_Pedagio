/** CPF completo formatado para exibição: "123.456.789-01". */
export function formatCpf(value: string | null | undefined) {
  if (!value) return value;
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` : value;
}

export function maskCpf(value: string | null | undefined) {
  if (!value) return value;
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 ? `${digits.slice(0, 3)}.***.***-${digits.slice(9)}` : "***";
}

/** Formata telefone brasileiro para exibição: "+55 (81) 98738-5401". Aceita o formato do Coral ("0" + 55 + DDD + número). */
export function formatPhone(value: string | null | undefined) {
  if (!value) return value;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("055")) digits = digits.slice(1);
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (!digits.startsWith("55") || (digits.length !== 12 && digits.length !== 13)) return value;
  const ddd = digits.slice(2, 4);
  const number = digits.slice(4);
  const split = number.length - 4;
  return `+55 (${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
}

export function maskPhone(value: string | null | undefined) {
  if (!value) return value;
  const digits = value.replace(/\D/g, "");
  return digits.length < 3 ? "***" : `***${digits.slice(-2)}`;
}

/** Primeiro nome + inicial do último sobrenome (ex.: "Kelly S."), para perfis sem acesso a dados completos. */
export function maskName(value: string | null | undefined) {
  if (!value) return value;
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return value;
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first;
}
