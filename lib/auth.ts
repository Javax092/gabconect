import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { ApiRouteError } from "@/lib/api";
import { getJwtSecretValue, SESSION_COOKIE } from "@/lib/auth-config";
import { getDemoAuthUser, isDemoMode } from "@/lib/demo";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const SESSION_DURATION = 60 * 60 * 24 * 7;

export const loginSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres.")
});

type SessionPayload = {
  sub: string;
  email: string;
  role: Role;
};

const authenticatedUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  mandateId: true,
  createdAt: true,
  mandate: true
} satisfies Prisma.UserSelect;

export type AuthenticatedUser = Prisma.UserGetPayload<{
  select: typeof authenticatedUserSelect;
}>;

function getJwtSecret() {
  const secret = getJwtSecretValue();

  if (secret) {
    return new TextEncoder().encode(secret);
  }

  return new TextEncoder().encode(env.jwtSecret);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getJwtSecret());

  return payload as SessionPayload;
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    console.info("[auth] getSession: cookie ausente", {
      cookieName: SESSION_COOKIE
    });
    return null;
  }

  try {
    const session = await verifySessionToken(token);

    console.info("[auth] getSession: sessao valida", {
      cookieName: SESSION_COOKIE,
      userId: session.sub,
      role: session.role
    });

    return session;
  } catch (error) {
    console.warn("[auth] getSession: token invalido", {
      cookieName: SESSION_COOKIE,
      reason: error instanceof Error ? error.message : "unknown"
    });
    return null;
  }
}

export async function authenticateUser(email: string, password: string) {
  if (isDemoMode()) {
    if (email.trim() && password.trim()) {
      return getDemoAuthUser();
    }

    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      email: email.toLowerCase()
    }
  });

  if (!user) {
    return null;
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  return user;
}

export const getCurrentUser = cache(async () => {
  if (isDemoMode()) {
    return getDemoAuthUser();
  }

  const session = await getSession();

  if (!session?.sub) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.sub },
    select: authenticatedUserSelect
  });
});

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    console.warn("[auth] requireUser: usuario ausente, redirecionando para /login");
    redirect("/login");
  }

  console.info("[auth] requireUser: usuario autenticado", {
    userId: user.id,
    role: user.role,
    mandateId: user.mandateId
  });

  return user;
}

export async function requireAuth() {
  if (isDemoMode()) {
    return getDemoAuthUser();
  }

  const user = await getCurrentUser();

  if (!user) {
    throw new ApiRouteError(401, "Não autenticado.", "UNAUTHORIZED");
  }

  return user;
}

export function getMandateContext(user: AuthenticatedUser) {
  return {
    user,
    userId: user.id,
    mandateId: user.mandateId,
    role: user.role
  };
}
