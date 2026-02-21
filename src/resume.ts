import { resumeConversationById } from "./conversation-runner.js";

const conversationId = process.argv[2];
if (!conversationId) {
  throw new Error("Usage: npm run resume -- <conversation-id>");
}

const warningTurnsBeforeMax = parseNonNegativeInt(process.env.WARNING_TURNS_BEFORE_MAX);

const run = await resumeConversationById({
  conversationId,
  sqlitePath: process.env.CONVERSATIONS_DB_PATH,
  maxTurns: parsePositiveInt(process.env.MAX_TURNS_OVERRIDE),
  warningTurnsBeforeMax,
  model: process.env.CONVERSATION_MODEL,
  codexPathOverride: process.env.CODEX_PATH_OVERRIDE,
  logFilePath: process.env.CONVERSATION_LOG_PATH,
});

for (const turn of run.conversation.turns) {
  console.log(`Turn ${turn.turnNumber} | ${turn.speaker}`);
  console.log(`Answer: ${turn.answer}`);
  console.log(`Next: ${turn.nextAgent} | readyToConclude: ${turn.readyToConclude}`);
  console.log("");
}

console.log(`Concluded: ${run.conversation.concluded}`);
console.log(`Stop reason: ${run.conversation.stopReason}`);
console.log(`Conversation ID: ${run.conversationId}`);
console.log(`SQLite DB: ${run.sqlitePath}`);

function parseNonNegativeInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("WARNING_TURNS_BEFORE_MAX must be a non-negative integer.");
  }
  return parsed;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("MAX_TURNS_OVERRIDE must be a positive integer.");
  }
  return parsed;
}
