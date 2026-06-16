function requireEnv(key: "DATABASE_URL" | "JWT_SECRET" | "AUTH_SECRET") {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Variavel de ambiente ausente: ${key}`);
  }

  return value;
}

function getAuthSecretValue() {
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const authSecret = process.env.AUTH_SECRET?.trim();

  return jwtSecret || authSecret || null;
}

function getAppUrl() {
  return process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export const env = {
  get databaseUrl() {
    return requireEnv("DATABASE_URL");
  },
  get jwtSecret() {
    const value = getAuthSecretValue();

    if (!value) {
      throw new Error("Variavel de ambiente ausente: JWT_SECRET ou AUTH_SECRET");
    }

    return value;
  },
  get authSecret() {
    const value = getAuthSecretValue();

    if (!value) {
      throw new Error("Variavel de ambiente ausente: AUTH_SECRET ou JWT_SECRET");
    }

    return value;
  },
  appUrl: getAppUrl()
};
