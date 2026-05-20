import { ContactStatus } from "@prisma/client";

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

export function isValidPhone(phone: string) {
  const normalized = normalizePhone(phone);
  return normalized.length >= 10 && normalized.length <= 15;
}

export function normalizeTagsInput(input: string | string[]) {
  const raw = Array.isArray(input) ? input.join(",") : input;

  return [...new Set(
    raw
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

export function resolveContactStatus(input: string | undefined, phone: string) {
  if (!phone) {
    return ContactStatus.INVALID;
  }

  const normalized = input?.trim().toUpperCase();
  if (normalized === ContactStatus.ACTIVE) return ContactStatus.ACTIVE;
  if (normalized === ContactStatus.UNSUBSCRIBED) return ContactStatus.UNSUBSCRIBED;
  if (normalized === ContactStatus.BLOCKED) return ContactStatus.BLOCKED;
  if (normalized === ContactStatus.INVALID) return ContactStatus.INVALID;

  return isValidPhone(phone) ? ContactStatus.ACTIVE : ContactStatus.INVALID;
}

export function parseCsvRows(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const delimiter = lines[0]?.includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0] ?? "", delimiter).map((item) => item.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = values[index]?.trim() ?? "";
      return record;
    }, {});
  });
}

function splitCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}
