function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function estimateReadingTime(text: string) {
  return clamp(Math.ceil(text.trim().length / 12) * 180, 600, 5000);
}

export function calculateHumanDelay(text: string) {
  const base = 1200;
  const readingTime = estimateReadingTime(text);
  const punctuationPause = (text.match(/[.,!?]/g) ?? []).length * 90;

  return clamp(base + readingTime + punctuationPause, 1500, 9000);
}

export function typingSimulation(text: string) {
  const chars = Math.max(text.trim().length, 1);
  return clamp(chars * 45, 900, 6000);
}

export function shouldSplitMessage(text: string) {
  return text.trim().length > 320;
}

export function normalizeAssistantReply(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return shouldSplitMessage(normalized) ? `${normalized.slice(0, 317).trim()}...` : normalized;
}

export function detectOverAutomation(intervalsMs: number[]) {
  if (intervalsMs.length < 3) {
    return false;
  }

  const average = intervalsMs.reduce((total, current) => total + current, 0) / intervalsMs.length;
  const nearlyIdentical = intervalsMs.every((value) => Math.abs(value - average) < 250);

  return average < 1500 || nearlyIdentical;
}

export function humanizeResponseTiming(text: string, contextPausesMs: number[] = []) {
  const normalized = normalizeAssistantReply(text);
  const humanDelay = calculateHumanDelay(normalized);
  const typingDelay = typingSimulation(normalized);
  const contextualPause = contextPausesMs.reduce((total, current) => total + current, 0);

  return clamp(humanDelay + typingDelay + contextualPause, 2000, 12000);
}
