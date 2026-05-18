import { z } from "zod";

export const mandateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da operação."),
  politicianName: z.string().trim().min(2, "Informe o nome público de referência."),
  city: z.string().trim().min(2, "Informe a cidade."),
  state: z
    .string()
    .trim()
    .length(2, "Use a sigla do estado com 2 letras.")
    .transform((value) => value.toUpperCase()),
  whatsappNumber: z.string().trim().min(8, "Informe o número de WhatsApp."),
  aiPrompt: z.string().trim().min(20, "Informe um prompt base mais completo.")
});

export type MandateFormValues = z.infer<typeof mandateSchema>;
