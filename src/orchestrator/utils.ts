export function validateUniqueNames(agentNames: string[]): void {
  const seen = new Set<string>();
  for (const name of agentNames) {
    if (seen.has(name)) {
      throw new Error(`Duplicate agent name "${name}".`);
    }
    seen.add(name);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function repetitionSimilarity(a: string, b: string): number {
  const aNorm = normalizeForRepetition(a);
  const bNorm = normalizeForRepetition(b);

  if (aNorm.length === 0 || bNorm.length === 0) {
    return 0;
  }

  if (aNorm === bNorm) {
    return 1;
  }

  const aTokens = new Set(aNorm.split(" "));
  const bTokens = new Set(bNorm.split(" "));
  let overlap = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1;
    }
  }

  const unionSize = aTokens.size + bTokens.size - overlap;
  if (unionSize === 0) {
    return 0;
  }

  return overlap / unionSize;
}

function normalizeForRepetition(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
