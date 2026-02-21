import type { AgentDefinition } from "./orchestrator.js";

export type AgentModelOverrides = Record<string, string>;

export function applyAgentModelOverrides(
  agents: AgentDefinition[],
  overrides: AgentModelOverrides | undefined,
): AgentDefinition[] {
  if (!overrides || Object.keys(overrides).length === 0) {
    return agents.map((agent) => ({ ...agent }));
  }

  const knownNames = new Set(agents.map((agent) => agent.name));
  for (const name of Object.keys(overrides)) {
    if (!knownNames.has(name)) {
      throw new Error(`Unknown agent in model override: "${name}".`);
    }
  }

  return agents.map((agent) => {
    const modelOverride = overrides[agent.name];
    if (!modelOverride) {
      return { ...agent };
    }
    return {
      ...agent,
      model: modelOverride,
    };
  });
}

export function parseAgentModelsJson(rawValue: string | undefined): AgentModelOverrides | undefined {
  if (!rawValue) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error("AGENT_MODELS_JSON must be valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("AGENT_MODELS_JSON must be a JSON object mapping agent names to model strings.");
  }

  const result: AgentModelOverrides = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`AGENT_MODELS_JSON value for "${name}" must be a non-empty string.`);
    }
    result[name] = value.trim();
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
