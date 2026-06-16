function parseBooleanEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (["0", "false", "off", "no"].includes(normalized)) {
    return false;
  }

  if (["1", "true", "on", "yes"].includes(normalized)) {
    return true;
  }

  return null;
}

export function isAudienceValidationBypassed() {
  const configured = parseBooleanEnv(process.env.SKIP_AUDIENCE_VALIDATION);

  // Bypass is enabled by default for campaign processing. Set
  // SKIP_AUDIENCE_VALIDATION=false to restore opt-in/status/suppression checks.
  return configured ?? true;
}
