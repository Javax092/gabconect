export const SESSION_COOKIE = "gc_session";
export const DEMO_JWT_SECRET = "demo-mode-jwt-secret";

export function isDemoModeEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

function readSecret(name: "JWT_SECRET" | "AUTH_SECRET") {
  const value = process.env[name]?.trim();

  return value || null;
}

export function getJwtSecretValue() {
  if (isDemoModeEnabled()) {
    return DEMO_JWT_SECRET;
  }

  return readSecret("JWT_SECRET") ?? readSecret("AUTH_SECRET");
}
