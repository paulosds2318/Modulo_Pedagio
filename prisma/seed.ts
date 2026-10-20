import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const db = new PrismaClient();

async function main() {
  const adminPasswordValue = process.env.SEED_ADMIN_PASSWORD;
  const viewerPasswordValue = process.env.SEED_VIEWER_PASSWORD;
  if (!adminPasswordValue || !viewerPasswordValue) {
    throw new Error("Defina SEED_ADMIN_PASSWORD e SEED_VIEWER_PASSWORD para executar o seed de desenvolvimento.");
  }
  if (adminPasswordValue.length < 12 || viewerPasswordValue.length < 12) {
    throw new Error("As senhas de seed devem ter pelo menos 12 caracteres.");
  }

  const now = new Date();
  const start = new Date(now.getTime() - 2 * 86400000);
  const end = new Date(now.getTime() + 86400000);

  // 1. Criar Usuário Administrador (Perfil ADMIN)
  const adminPassword = await hashPassword(adminPasswordValue);
  const adminUser = await db.user.upsert({
    where: { email: "admin@focoalugueldecarros.com.br" },
    create: {
      id: "usr_admin_foco",
      name: "Administrador Foco",
      email: "admin@focoalugueldecarros.com.br",
      emailVerified: true,
      role: "admin",
      createdAt: now,
      updatedAt: now,
    },
    update: {
      role: "admin",
    },
  });

  await db.account.upsert({
    where: { id: "acc_admin_foco" },
    create: {
      id: "acc_admin_foco",
      accountId: adminUser.id,
      providerId: "credential",
      userId: adminUser.id,
      password: adminPassword,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      password: adminPassword,
    },
  });

  // 2. Criar Usuário de Visualização (Perfil VISUALIZAÇÃO)
  const viewerPassword = await hashPassword(viewerPasswordValue);
  const viewerUser = await db.user.upsert({
    where: { email: "visualizador@focoalugueldecarros.com.br" },
    create: {
      id: "usr_viewer_foco",
      name: "Operador de Consulta",
      email: "visualizador@focoalugueldecarros.com.br",
      emailVerified: true,
      role: "viewer",
      createdAt: now,
      updatedAt: now,
    },
    update: {
      role: "viewer",
    },
  });

  await db.account.upsert({
    where: { id: "acc_viewer_foco" },
    create: {
      id: "acc_viewer_foco",
      accountId: viewerUser.id,
      providerId: "credential",
      userId: viewerUser.id,
      password: viewerPassword,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      password: viewerPassword,
    },
  });

  // 3. Dados Demonstrativos de Contrato e Pedágio
  await db.contratoLocacao.upsert({
    where: { numeroContrato: "DEMO-2026-001" },
    create: {
      numeroContrato: "DEMO-2026-001",
      cpfCliente: "00000000000",
      telefoneCliente: "5511999999999",
      placa: "ABC1D23",
      dataRetirada: start,
      dataDevolucao: end,
      lojaRetirada: "São Paulo - Centro",
    },
    update: {
      dataRetirada: start,
      dataDevolucao: end,
    },
  });

  for (const [id, plaza, cents] of [
    ["DEMO-TOLL-001", "Bandeirantes", 1290],
    ["DEMO-TOLL-002", "Anhanguera", 875],
  ] as const) {
    await db.passagemPedagio.upsert({
      where: { idCoral: id },
      create: {
        idCoral: id,
        numeroContrato: "DEMO-2026-001",
        cpfCliente: "00000000000",
        telefoneCliente: "5511999999999",
        placa: "ABC1D23",
        tag: "DEMO-TAG",
        praca: plaza,
        rodovia: "SP-348",
        dataHora: new Date(now.getTime() - 86400000),
        valorCentavos: cents,
        lojaRetirada: "São Paulo - Centro",
      },
      update: {
        valorCentavos: cents,
      },
    });
  }

  console.log("--------------------------------------------------");
  console.log("Carga inicial de dados e perfis Better Auth concluída!");
  console.log("Development users created; credentials are not displayed.");
  console.log("--------------------------------------------------");
}

main()
  .catch((e) => {
    console.error("Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

