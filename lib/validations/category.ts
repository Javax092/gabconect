import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres.").max(60),
  color: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{6})$/, "Informe uma cor hexadecimal válida, como #2563eb.")
});

export type CategoryFormValues = z.infer<typeof categorySchema>;
