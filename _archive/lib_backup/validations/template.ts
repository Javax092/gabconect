import { z } from "zod";

export const templateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do template."),
  category: z.string().trim().min(2, "Informe a categoria."),
  language: z.string().trim().min(2, "Informe o idioma."),
  templateId: z.string().trim().min(2, "Informe o templateId."),
  content: z.string().trim().min(5, "Informe o conteúdo."),
  approved: z.boolean().default(false)
});

export const templateUpdateSchema = templateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Informe ao menos um campo para atualização."
);

export const templateFiltersSchema = z.object({
  category: z.string().trim().optional(),
  language: z.string().trim().optional()
});
