import { readFile } from "node:fs/promises";

import { Codex } from "@openai/codex-sdk";
import type { CodexOptions, Input, ThreadOptions } from "@openai/codex-sdk";

export type QaEvaluation = {
  score: number;
  reason: string;
};

export type EvaluateConversationInput = {
  initialPrompt: string;
  conversationLogPath: string;
  codex?: Codex;
  codexOptions?: CodexOptions;
  threadOptions?: ThreadOptions;
};

type TextInput = {
  type: "text";
  text: string;
};

const QA_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number", minimum: 0, maximum: 10 },
    reason: { type: "string" },
  },
  required: ["score", "reason"],
  additionalProperties: false,
} as const;

export async function evaluateConversation(input: EvaluateConversationInput): Promise<QaEvaluation> {
  const codex = input.codex ?? new Codex(input.codexOptions ?? {});
  const logContent = await readFile(input.conversationLogPath, "utf8");
  const qaPrompt = buildQaPrompt({
    initialPrompt: input.initialPrompt,
    conversationLog: logContent,
  });

  const thread = codex.startThread({
    skipGitRepoCheck: true,
    ...input.threadOptions,
  });
  const turn = await thread.run(qaPrompt, { outputSchema: QA_SCHEMA });
  const parsed = parseQaOutput(turn.finalResponse);
  return parsed;
}

function buildQaPrompt(input: { initialPrompt: string; conversationLog: string }): Input {
  const instructions = [
    "You are grading a multi-agent conversation.",
    "Score the final conversation quality from 0 to 10 (higher is better).",
    "Use this rubric:",
    "1) Relevance to the original prompt.",
    "2) Whether multi-agent interaction added value (not just repetition).",
    "3) Concreteness and actionability of final result.",
    "4) Internal consistency and risk awareness.",
    "5) Efficiency (penalize wasted/redundant turns).",
    "Be strict. Penalize loops, repetition, and shallow agreement.",
  ].join("\n");

  return [
    toTextInput(instructions),
    toTextInput(`Original prompt:\n${input.initialPrompt}`),
    toTextInput(`Conversation log:\n${input.conversationLog}`),
  ];
}

function parseQaOutput(raw: string): QaEvaluation {
  const parsed = parsePossiblyWrappedJson(raw);
  if (!isRecord(parsed)) {
    throw new Error(`QA response must be an object. Received: ${raw}`);
  }
  const score = parsed.score;
  const reason = parsed.reason;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    throw new Error(`QA score must be a number. Received: ${raw}`);
  }
  if (score < 0 || score > 10) {
    throw new Error(`QA score must be between 0 and 10. Received: ${raw}`);
  }
  if (typeof reason !== "string") {
    throw new Error(`QA reason must be a string. Received: ${raw}`);
  }
  return { score, reason };
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
  throw new Error(`Could not parse QA JSON output: ${raw}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTextInput(text: string): TextInput {
  return { type: "text", text };
}
