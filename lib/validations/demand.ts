import { DemandPriority, DemandStatus } from "@prisma/client";
import { z } from "zod";

export const demandFiltersSchema = z.object({
  status: z.nativeEnum(DemandStatus).optional(),
  priority: z.nativeEnum(DemandPriority).optional(),
  categoryId: z.string().trim().cuid("Categoria inválida.").optional(),
  q: z.string().trim().optional()
});

export const demandUpdateSchema = z.object({
  title: z.string().trim().min(3, "Informe um título com pelo menos 3 caracteres."),
  description: z.string().trim().min(10, "Descreva a demanda com mais detalhes."),
  status: z.nativeEnum(DemandStatus),
  priority: z.nativeEnum(DemandPriority),
  categoryId: z.string().trim().cuid("Selecione uma categoria válida.")
});
