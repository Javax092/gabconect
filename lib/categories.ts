import { prisma } from "@/lib/prisma";

export const DEFAULT_MANDATE_CATEGORIES = [
  { name: "Saúde", color: "#ef4444" },
  { name: "Educação", color: "#2563eb" },
  { name: "Infraestrutura", color: "#f59e0b" },
  { name: "Iluminação pública", color: "#eab308" },
  { name: "Limpeza urbana", color: "#14b8a6" },
  { name: "Segurança", color: "#7c3aed" },
  { name: "Transporte", color: "#0f766e" },
  { name: "Assistência social", color: "#10b981" },
  { name: "Geral", color: "#64748b" }
] as const;

export function normalizeCategoryName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export async function ensureDefaultCategoriesForMandate(mandateId: string) {
  await prisma.category.createMany({
    data: DEFAULT_MANDATE_CATEGORIES.map((category) => ({
      mandateId,
      name: category.name,
      color: category.color
    })),
    skipDuplicates: true
  });

  return prisma.category.findMany({
    where: {
      mandateId
    },
    orderBy: {
      name: "asc"
    }
  });
}
