import { ApiRouteError, apiError, apiSuccess, readJson, validateSchema } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth-config";
import { isDemoMode } from "@/lib/demo";
import {
  authenticateUser,
  createSessionToken,
  loginSchema,
  setSessionCookie
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = validateSchema(loginSchema, body);

    if (isDemoMode()) {
      const token = await createSessionToken({
        sub: "demo-user",
        email: parsed.email,
        role: "ADMIN"
      });

      await setSessionCookie(token);

      console.info("[auth/login] login concluido em modo demo", {
        userFound: true,
        role: "ADMIN",
        cookieName: SESSION_COOKIE
      });

      return apiSuccess({
        user: {
          id: "demo-user",
          name: "Marina Vieira",
          email: parsed.email,
          role: "ADMIN",
          mandateId: "demo-mandate"
        },
        message: "Modo demonstracao ativo."
      });
    }

    const user = await authenticateUser(parsed.email, parsed.password);

    if (!user) {
      console.warn("[auth/login] credenciais invalidas", {
        userFound: false,
        role: null,
        cookieName: SESSION_COOKIE
      });
      throw new ApiRouteError(401, "E-mail ou senha inválidos.", "INVALID_CREDENTIALS");
    }

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    await setSessionCookie(token);

    console.info("[auth/login] login concluido", {
      userFound: true,
      role: user.role,
      cookieName: SESSION_COOKIE
    });

    return apiSuccess({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mandateId: user.mandateId
      }
    });
  } catch (error) {
    console.error("[auth/login] falha no login", {
      reason: error instanceof Error ? error.message : "unknown"
    });
    return apiError(error);
  }
}
