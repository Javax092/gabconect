import { NextResponse } from "next/server";
import { z } from "zod";

export class ApiRouteError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "REQUEST_ERROR", details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const routeIdSchema = z.string().cuid("Identificador inválido.");

export function apiError(error: ApiRouteError | Error | unknown) {
  if (error instanceof ApiRouteError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details })
        }
      },
      { status: error.status }
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro interno do servidor."
      }
    },
    { status: 500 }
  );
}

export function apiSuccess<T extends Record<string, unknown>>(payload: T, status = 200) {
  return NextResponse.json(
    {
      success: true,
      ...payload
    },
    { status }
  );
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiRouteError(400, "Payload inválido.", "INVALID_JSON");
  }
}

export function parseRouteId(value: string) {
  const parsed = routeIdSchema.safeParse(value);

  if (!parsed.success) {
    throw new ApiRouteError(400, parsed.error.issues[0]?.message ?? "Identificador inválido.", "INVALID_ID");
  }

  return parsed.data;
}

export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown, fallbackMessage = "Dados inválidos.") {
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    throw new ApiRouteError(
      400,
      parsed.error.issues[0]?.message ?? fallbackMessage,
      "VALIDATION_ERROR"
    );
  }

  return parsed.data;
}
