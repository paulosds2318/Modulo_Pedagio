const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
async function main() {
  const now = new Date();
  const start = new Date(now.getTime() - 2 * 86400000);
  const end = new Date(now.getTime() + 86400000);
  await db.contratoLocacao.upsert({ where: { numeroContrato: "DEMO-2026-001" }, create: { numeroContrato: "DEMO-2026-001", cpfCliente: "00000000000", telefoneCliente: "5511999999999", placa: "ABC1D23", dataRetirada: start, dataDevolucao: end, lojaRetirada: "São Paulo - Centro" }, update: { dataRetirada: start, dataDevolucao: end } });
  for (const [id, plaza, cents] of [["DEMO-TOLL-001", "Bandeirantes", 1290], ["DEMO-TOLL-002", "Anhanguera", 875]]) {
    await db.passagemPedagio.upsert({ where: { idConectcar: id }, create: { idConectcar: id, numeroContrato: "DEMO-2026-001", cpfCliente: "00000000000", telefoneCliente: "5511999999999", placa: "ABC1D23", tag: "DEMO-TAG", praca: plaza, rodovia: "SP-348", dataHora: new Date(now.getTime() - 86400000), valorCentavos: cents, lojaRetirada: "São Paulo - Centro" }, update: { valorCentavos: cents } });
  }
  console.log("Dados demonstrativos inseridos.");
}
main().finally(() => db.$disconnect());
