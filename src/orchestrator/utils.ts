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
