import { runConversationForPrompt } from "./conversation-runner.js";
import { parseAgentModelsJson } from "./agent-models.js";

const conversationGoal =
  process.argv.slice(2).join(" ").trim() ||
  "Design a high-level rollout plan for introducing feature flags in a legacy web app.";
const warningTurnsBeforeMax = parseNonNegativeInt(process.env.WARNING_TURNS_BEFORE_MAX);
const agentModels = parseAgentModelsJson(process.env.AGENT_MODELS_JSON);

const run = await runConversationForPrompt({
  prompt: conversationGoal,
  sqlitePath: process.env.CONVERSATIONS_DB_PATH,
  logFilePath: process.env.CONVERSATION_LOG_PATH,
  maxTurns: 50,
  warningTurnsBeforeMax,
  model: process.env.CONVERSATION_MODEL ?? "gpt-5.1-codex-mini",
  agentModels,
  codexPathOverride: process.env.CODEX_PATH_OVERRIDE,
});

for (const turn of run.conversation.turns) {
  console.log(`Turn ${turn.turnNumber} | ${turn.speaker}`);
  console.log(`Answer: ${turn.answer}`);
  console.log(`Next: ${turn.nextAgent} | readyToConclude: ${turn.readyToConclude}`);
  if (turn.structuredOutput !== undefined) {
    console.log(`Structured output: ${JSON.stringify(turn.structuredOutput)}`);
  }
  console.log("");
}

console.log(`Concluded: ${run.conversation.concluded}`);
console.log(`Stop reason: ${run.conversation.stopReason}`);
console.log(`Conversation ID: ${run.conversationId}`);
console.log(`SQLite DB: ${run.sqlitePath}`);
console.log(`Log file: ${run.logFilePath}`);

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
