import { CampaignMode } from "@prisma/client";

function parsePositiveInt(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function isMassCampaignEnabled() {
  return process.env.WHATSAPP_MASS_CAMPAIGN_ENABLED === "true";
}

export function getSendLimitConfig() {
  return {
    perMinute: parsePositiveInt("MAX_SENDS_PER_MINUTE", 10),
    perHour: parsePositiveInt("MAX_SENDS_PER_HOUR", 200),
    perDay: parsePositiveInt("MAX_SENDS_PER_DAY", 500),
    delayMinSeconds: parsePositiveInt("WHATSAPP_SEND_DELAY_MIN_SECONDS", 25),
    delayMaxSeconds: parsePositiveInt("WHATSAPP_SEND_DELAY_MAX_SECONDS", 90),
    alertErrorRatePercent: parsePositiveInt("ALERT_ERROR_RATE_PERCENT", 5),
    alertOptOutRatePercent: parsePositiveInt("ALERT_OPT_OUT_RATE_PERCENT", 2),
  };
}

export function getCampaignModeDailyCap(mode: CampaignMode) {
  if (mode === CampaignMode.TEST) {
    return 50;
  }

  if (mode === CampaignMode.BIRTHDAY) {
    return 500;
  }

  // AUDIENCE mode: use full configured limit
  return getSendLimitConfig().perDay;
}

export function getMassCampaignTestLimit() {
  return parsePositiveInt("MASS_CAMPAIGN_TEST_LIMIT", 3);
}

export function getRandomSendDelaySeconds() {
  const { delayMinSeconds, delayMaxSeconds } = getSendLimitConfig();
  const min = Math.min(delayMinSeconds, delayMaxSeconds);
  const max = Math.max(delayMinSeconds, delayMaxSeconds);

  return min + Math.floor(Math.random() * (max - min + 1));
}

export function getEstimatedCampaignCapacityPerHour() {
  const config = getSendLimitConfig();
  const delayCapacity = Math.floor(3600 / Math.max(1, config.delayMinSeconds));

  return Math.max(
    0,
    Math.min(config.perHour, config.perMinute * 60, delayCapacity),
  );
}
