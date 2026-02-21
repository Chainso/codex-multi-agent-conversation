import { randomUUID } from "node:crypto";
import { join } from "node:path";

export function createRunStamp(date = new Date()): string {
  const iso = date.toISOString().replace(/[:.]/g, "-");
  const shortUuid = randomUUID().slice(0, 8);
  return `${iso}-${shortUuid}`;
}

export function slugify(input: string, maxLength = 48): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned.length === 0) {
    return "prompt";
  }
  return cleaned.slice(0, maxLength);
}

export function createConversationLogPath(input: {
  prompt: string;
  runStamp?: string;
  baseDir?: string;
  label?: string;
}): string {
  const baseDir = input.baseDir ?? "logs/conversations";
  const runStamp = input.runStamp ?? createRunStamp();
  const promptSlug = slugify(input.prompt);
  const label = input.label ? `${slugify(input.label)}-` : "";
  return join(baseDir, `${runStamp}-${label}${promptSlug}.md`);
}

export function createEvalReportPath(input: { runStamp?: string; baseDir?: string }): string {
  const baseDir = input.baseDir ?? "logs/evals";
  const runStamp = input.runStamp ?? createRunStamp();
  return join(baseDir, `${runStamp}-eval-report.json`);
}
