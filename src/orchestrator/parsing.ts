import type { AgentTurnOutput } from "./types.js";

export function parseAgentTurnOutput(raw: string, allowedNextAgents: string[]): AgentTurnOutput {
  const parsed = parsePossiblyWrappedJson(raw);
  if (!isRecord(parsed)) {
    throw new Error(`Structured output must be an object. Received: ${raw}`);
  }

  const answer = parsed.answer;
  const nextAgent = parsed.nextAgent;
  const readyToConclude = parsed.readyToConclude;

  if (typeof answer !== "string") {
    throw new Error(`"answer" must be a string. Received: ${raw}`);
  }

  if (typeof nextAgent !== "string") {
    throw new Error(`"nextAgent" must be a string. Received: ${raw}`);
  }

  if (!allowedNextAgents.includes(nextAgent)) {
    throw new Error(
      `"nextAgent" must be one of [${allowedNextAgents.join(", ")}]. Received: ${raw}`,
    );
  }

  if (typeof readyToConclude !== "boolean") {
    throw new Error(`"readyToConclude" must be a boolean. Received: ${raw}`);
  }

  return {
    answer,
    nextAgent,
    readyToConclude,
  };
}

function parsePossiblyWrappedJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      return JSON.parse(fenced[1]);
    }

    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    }
  }

  throw new Error(`Could not parse structured output JSON: ${raw}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
