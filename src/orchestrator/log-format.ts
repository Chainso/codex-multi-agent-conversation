import type { AgentDefinition } from "./types.js";

export function formatConversationStartLog(input: {
  timestamp: string;
  conversationGoal: string;
  firstSpeaker: string;
  maxTurns: number;
  warningStartTurn: number;
  agents: AgentDefinition[];
}): string {
  const roles = input.agents
    .map((agent) => {
      const modelPart = agent.model ? ` (model: ${agent.model})` : "";
      if (agent.rolePrompt) {
        return `- **${agent.name}**${modelPart}: ${agent.rolePrompt}`;
      }
      return `- **${agent.name}**${modelPart}`;
    })
    .join("\n");

  return [
    "",
    "# Multi-Agent Conversation",
    "",
    `- Started: ${input.timestamp}`,
    `- Goal: ${input.conversationGoal}`,
    `- First speaker: ${input.firstSpeaker}`,
    `- Max turns: ${input.maxTurns}`,
    `- Wrap-up warning starts at turn: ${input.warningStartTurn}`,
    "",
    "## Participants",
    "",
    roles,
    "",
    "---",
    "",
  ].join("\n");
}

export function formatTurnLog(input: {
  timestamp: string;
  turnNumber: number;
  maxTurns: number;
  speaker: string;
  answer: string;
  nextAgent: string;
  readyToConclude: boolean;
  structuredOutput?: unknown;
  unseenMessagesConsumed: number;
  threadId: string | null;
}): string {
  const structuredOutputBlock =
    input.structuredOutput === undefined
      ? []
      : [
          "### Structured Output",
          "",
          "```json",
          stringifyStructuredOutput(input.structuredOutput),
          "```",
          "",
        ];

  return [
    `## Turn ${input.turnNumber}/${input.maxTurns} - ${input.speaker}`,
    "",
    `- Time: ${input.timestamp}`,
    `- Next speaker: ${input.nextAgent}`,
    `- ${input.speaker} ready to conclude: ${String(input.readyToConclude)}`,
    `- Unseen messages consumed: ${input.unseenMessagesConsumed}`,
    `- Thread ID: ${input.threadId ?? "(pending)"}`,
    "",
    "### Message",
    "",
    toBlockquote(input.answer),
    "",
    ...structuredOutputBlock,
    "---",
    "",
  ].join("\n");
}

export function formatConversationEndLog(input: {
  timestamp: string;
  concluded: boolean;
  stopReason: "all_agents_ready" | "max_turns_reached";
  turns: number;
}): string {
  return [
    "## Conversation Complete",
    "",
    `- Time: ${input.timestamp}`,
    `- Concluded: ${String(input.concluded)}`,
    `- Stop reason: ${input.stopReason}`,
    `- Total turns: ${input.turns}`,
    "",
    "---",
    "",
  ].join("\n");
}

function toBlockquote(text: string): string {
  if (text.trim().length === 0) {
    return "> ";
  }
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function stringifyStructuredOutput(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({ error: "Could not serialize structuredOutput." }, null, 2);
  }
}
