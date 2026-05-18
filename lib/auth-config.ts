export const SESSION_COOKIE = "gc_session";
export const DEMO_JWT_SECRET = "demo-mode-jwt-secret";

export function isDemoModeEnabled() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function getJwtSecretValue() {
  if (isDemoModeEnabled()) {
    return DEMO_JWT_SECRET;
  }

  return process.env.JWT_SECRET ?? null;
}
