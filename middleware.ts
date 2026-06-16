import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getJwtSecretValue, isDemoModeEnabled, SESSION_COOKIE } from "@/lib/auth-config";

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const decoded = atob(`${normalized}${padding}`);

  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function decodePayload(tokenPart: string) {
  const payloadBytes = decodeBase64Url(tokenPart);
  const payload = new TextDecoder().decode(payloadBytes);

  return JSON.parse(payload) as { exp?: number };
}

async function verifyHs256Signature(token: string, secret: string) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return false;
  }

  const [header, payload, signature] = parts;
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), data);
}

async function hasValidSessionToken(token: string) {
  const secret = getJwtSecretValue();

  if (!secret) {
    console.warn("[middleware] JWT secret ausente", {
      demoMode: isDemoModeEnabled()
    });
    return false;
  }

  try {
    const [, payload] = token.split(".");

    if (!payload) {
      return false;
    }

    const claims = decodePayload(payload);

    if (claims.exp && claims.exp * 1000 < Date.now()) {
      return false;
    }

    return await verifyHs256Signature(token, secret);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicApiRoutes = [
    "/api/webhooks/whatsapp",
    "/api/whatsapp/webhook",
    "/api/health"
  ];

  if (publicApiRoutes.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const isProtectedRoute = pathname.startsWith("/admin");
  const isAuthRoute = pathname.startsWith("/login");
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const hasValidToken = token ? await hasValidSessionToken(token) : false;

  if (isProtectedRoute && !hasValidToken) {
    console.warn("[middleware] bloqueando acesso a rota protegida", {
      pathname,
      cookieName: SESSION_COOKIE
    });
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (isAuthRoute && hasValidToken) {
    console.info("[middleware] sessao valida em /login, redirecionando para /admin");
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (isAuthRoute && token && !hasValidToken) {
    console.warn("[middleware] limpando cookie invalido em rota de login", {
      pathname,
      cookieName: SESSION_COOKIE
    });
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login"]
};
