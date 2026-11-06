export function maskCpf(value: string | null | undefined) {
  if (!value) return value;
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 ? `${digits.slice(0, 3)}.***.***-${digits.slice(9)}` : "***";
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
