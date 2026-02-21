import type { Input } from "@openai/codex-sdk";

import type { AgentDefinition, BufferedMessage } from "./types.js";

type BuildTurnInputArgs = {
  agent: AgentDefinition;
  allAgents: AgentDefinition[];
  sharedInstructions: string;
  isFirstTurnForAgent: boolean;
  conversationGoal: string;
  unseenMessages: BufferedMessage[];
  warningMessage: string | null;
};

type TextInput = {
  type: "text";
  text: string;
};

export function buildTurnInput(args: BuildTurnInputArgs): Input {
  const unseenMessageEntries = buildUnseenEntries(args.unseenMessages);

  if (args.isFirstTurnForAgent) {
    const participantsBlock = args.allAgents
      .map((agent) => (agent.rolePrompt ? `- ${agent.name}: ${agent.rolePrompt}` : `- ${agent.name}`))
      .join("\n");

    const sharedInstructionsBlock = args.sharedInstructions.trim();
    const setupParts = [
      `You are agent "${args.agent.name}".`,
      `Conversation goal:\n${args.conversationGoal}`,
      `All agents in this conversation:\n${participantsBlock}`,
    ];
    if (sharedInstructionsBlock.length > 0) {
      setupParts.push(`Shared instructions:\n${sharedInstructionsBlock}`);
    }

    const protocolBlock = [
      "Conversation protocol (apply on every turn):",
      '- Return a JSON object with keys: "answer", "nextAgent", "readyToConclude".',
      '- "nextAgent" chooses which other agent should speak next.',
      '- Set "readyToConclude" to true only when you have no further meaningful contribution right now.',
      "- If later asked to speak again, continue normally and set readyToConclude based on that turn.",
    ].join("\n");

    return [
      toTextInput(setupParts.join("\n\n")),
      toTextInput(protocolBlock),
      ...(args.warningMessage ? [toTextInput(args.warningMessage)] : []),
      toTextInput("Only new final responses from other agents that you have not seen yet:"),
      ...unseenMessageEntries.map((entry) => toTextInput(entry)),
    ];
  }

  return [
    ...(args.warningMessage ? [toTextInput(args.warningMessage)] : []),
    ...unseenMessageEntries.map((entry) => toTextInput(entry)),
  ];
}

export function resolveWarningStartTurn(input: {
  maxTurns: number;
  agentCount: number;
  warningTurnsBeforeMax: number | undefined;
}): number {
  const warningTurnsBeforeMax = input.warningTurnsBeforeMax ?? input.agentCount;
  if (!Number.isInteger(warningTurnsBeforeMax) || warningTurnsBeforeMax < 0) {
    throw new Error("warningTurnsBeforeMax must be an integer greater than or equal to 0.");
  }
  return clamp(input.maxTurns - warningTurnsBeforeMax, 1, input.maxTurns);
}

function buildUnseenEntries(messages: BufferedMessage[]): string[] {
  if (messages.length === 0) {
    return ["- (none)"];
  }
  return messages.map((message) => `- [turn ${message.turnNumber}] ${message.from}: ${message.answer}`);
}

function toTextInput(text: string): TextInput {
  return { type: "text", text };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
