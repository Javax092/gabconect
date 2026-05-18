function requireEnv(key: "DATABASE_URL" | "JWT_SECRET" | "AUTH_SECRET") {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Variavel de ambiente ausente: ${key}`);
  }

  return value;
}

export const env = {
  get databaseUrl() {
    return requireEnv("DATABASE_URL");
  },
  get jwtSecret() {
    return requireEnv("JWT_SECRET");
  },
  get authSecret() {
    return requireEnv("AUTH_SECRET");
  },
  appUrl: process.env.APP_URL ?? "http://localhost:3000"
};
