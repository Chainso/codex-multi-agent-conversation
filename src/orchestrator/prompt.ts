import type { Input } from "@openai/codex-sdk";

import { EMBEDDED_STRUCTURED_OUTPUT_KEY } from "./schema.js";
import type { AgentDefinition, BufferedMessage, EmbeddedStructuredOutputConfig } from "./types.js";

type BuildTurnInputArgs = {
  agent: AgentDefinition;
  allAgents: AgentDefinition[];
  sharedInstructions: string;
  embeddedStructuredOutput?: EmbeddedStructuredOutputConfig;
  isFirstTurnForAgent: boolean;
  conversationGoal: string;
  unseenMessages: BufferedMessage[];
  warningMessage: string | null;
  enforceNoRepeatMode: boolean;
};

type TextInput = {
  type: "text";
  text: string;
};

export function buildTurnInput(args: BuildTurnInputArgs): Input {
  const unseenMessageEntries = buildUnseenEntries(args.unseenMessages);
  const structuredOutputProtocolLines = buildStructuredOutputProtocolLines(
    args.embeddedStructuredOutput,
  );
  const structuredOutputReminderLine = buildStructuredOutputReminderLine(args.embeddedStructuredOutput);

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
      ...structuredOutputProtocolLines,
      '- "nextAgent" chooses which other agent should speak next.',
      '- Set "readyToConclude" to true only when you have no further meaningful contribution right now.',
      "- If later asked to speak again, continue normally and set readyToConclude based on that turn.",
      "- Agents have independent internal context. Across agents, only final answers are shared.",
      "- Delta-only rule: answer with net-new information relative to the shared final answers already known to other agents.",
      "- Do not restate, reformat, or paraphrase already-shared information unless correcting it.",
      "- If you have no net-new information, provide a brief no-change update (one sentence) and set readyToConclude=true.",
    ].join("\n");

    const firstTurnNoUnseenBlock =
      unseenMessageEntries.length === 0
        ? [toTextInput("No unseen messages from other agents yet.")]
        : unseenMessageEntries.map((entry) => toTextInput(entry));

    return [
      toTextInput(setupParts.join("\n\n")),
      toTextInput(protocolBlock),
      ...(args.warningMessage ? [toTextInput(args.warningMessage)] : []),
      toTextInput("Only new final responses from other agents that you have not seen yet:"),
      ...firstTurnNoUnseenBlock,
    ];
  }

  const deltaOnlyReminder = toTextInput(
    "Delta-only reminder: other agents only see final answers, not your internal reasoning. Add only net-new information versus already-shared final answers.",
  );

  const repetitionGuardBlock = args.enforceNoRepeatMode
    ? [
        toTextInput(
          "No new unseen messages since your last turn. Do not repeat information other agents already know from shared final answers. Either add one net-new point (max 2 sentences) or provide a one-sentence no-change update and set readyToConclude=true.",
        ),
      ]
    : [];

  const unseenBlock =
    unseenMessageEntries.length === 0
      ? [toTextInput("No new unseen messages.")]
      : unseenMessageEntries.map((entry) => toTextInput(entry));

  return [
    ...(args.warningMessage ? [toTextInput(args.warningMessage)] : []),
    deltaOnlyReminder,
    ...(structuredOutputReminderLine ? [toTextInput(structuredOutputReminderLine)] : []),
    ...repetitionGuardBlock,
    ...unseenBlock,
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
    return [];
  }
  return messages.map((message) => `- [turn ${message.turnNumber}] ${message.from}: ${message.answer}`);
}

function toTextInput(text: string): TextInput {
  return { type: "text", text };
}

function buildStructuredOutputProtocolLines(
  embeddedStructuredOutput: EmbeddedStructuredOutputConfig | undefined,
): string[] {
  if (!embeddedStructuredOutput) {
    return [];
  }

  const required = embeddedStructuredOutput.required ?? true;
  const lines = [
    required
      ? `- Include "${EMBEDDED_STRUCTURED_OUTPUT_KEY}" and ensure it strictly matches the configured schema.`
      : `- "${EMBEDDED_STRUCTURED_OUTPUT_KEY}" is optional; when present, it must strictly match the configured schema.`,
  ];
  const instructions = embeddedStructuredOutput.instructions?.trim();
  if (instructions) {
    lines.push(`- "${EMBEDDED_STRUCTURED_OUTPUT_KEY}" guidance: ${instructions}`);
  }
  return lines;
}

function buildStructuredOutputReminderLine(
  embeddedStructuredOutput: EmbeddedStructuredOutputConfig | undefined,
): string | null {
  if (!embeddedStructuredOutput) {
    return null;
  }

  const required = embeddedStructuredOutput.required ?? true;
  if (required) {
    return `Reminder: include "${EMBEDDED_STRUCTURED_OUTPUT_KEY}" and keep it schema-valid on this turn.`;
  }
  return `Reminder: if you include "${EMBEDDED_STRUCTURED_OUTPUT_KEY}", keep it schema-valid on this turn.`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
