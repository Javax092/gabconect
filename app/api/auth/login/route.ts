import { ApiRouteError, apiError, apiSuccess, readJson, validateSchema } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth-config";
import { isDemoMode } from "@/lib/demo";
import {
  authenticateUser,
  createSessionToken,
  loginSchema,
  setSessionCookie
} from "@/lib/auth";
import { assertRateLimit, getClientIp, redactIdentifier } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = validateSchema(loginSchema, body);
    const rateLimitKey = `login:${getClientIp(request)}:${parsed.email}`;

    assertRateLimit({
      key: rateLimitKey,
      limit: 5,
      windowMs: 15 * 60_000
    });

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

    const normalizedEmail = parsed.email.trim().toLowerCase();
    const user = await authenticateUser(normalizedEmail, parsed.password);

    if (!user) {
      console.warn("[auth/login] credenciais invalidas", {
        credentialsAccepted: false,
        emailRef: redactIdentifier(normalizedEmail),
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
      userRef: redactIdentifier(user.id),
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
    console.error("[auth/login] erro completo:", error);
  
    if (error instanceof Error) {
      console.error("[auth/login] stack:", error.stack);
    }
  
    return apiError(error);
  }
}
