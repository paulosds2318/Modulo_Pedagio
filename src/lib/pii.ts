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
