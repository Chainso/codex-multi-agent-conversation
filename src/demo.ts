import { runConversationForPrompt } from "./conversation-runner.js";

const conversationGoal =
  process.argv.slice(2).join(" ").trim() ||
  "Design a high-level rollout plan for introducing feature flags in a legacy web app.";

const run = await runConversationForPrompt({
  prompt: conversationGoal,
  logFilePath: process.env.CONVERSATION_LOG_PATH,
  maxTurns: 50,
  model: process.env.CONVERSATION_MODEL,
});

for (const turn of run.conversation.turns) {
  console.log(`Turn ${turn.turnNumber} | ${turn.speaker}`);
  console.log(`Answer: ${turn.answer}`);
  console.log(`Next: ${turn.nextAgent} | readyToConclude: ${turn.readyToConclude}`);
  console.log("");
}

console.log(`Concluded: ${run.conversation.concluded}`);
console.log(`Stop reason: ${run.conversation.stopReason}`);
console.log(`Log file: ${run.logFilePath}`);
