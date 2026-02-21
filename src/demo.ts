import { MultiAgentOrchestrator } from "./orchestrator.js";

const conversationGoal =
  process.argv.slice(2).join(" ").trim() ||
  "Design a high-level rollout plan for introducing feature flags in a legacy web app.";

const logFilePath = process.env.CONVERSATION_LOG_PATH ?? "./conversation.log.md";

const orchestrator = new MultiAgentOrchestrator(
  [
    {
      name: "Planner",
      rolePrompt: "Break work into practical phases, milestones, and owners.",
    },
    {
      name: "Skeptic",
      rolePrompt: "Stress test assumptions and identify edge cases and failure modes.",
    },
    {
      name: "Builder",
      rolePrompt: "Propose implementation details and concrete actions.",
    },
  ],
  {
    sharedInstructions:
      "Keep responses concise. Build on prior messages. Avoid repeating points already addressed.",
    logFilePath,
    threadOptions: {
      skipGitRepoCheck: true,
    },
  },
);

const result = await orchestrator.runConversation({
  conversationGoal,
  firstSpeaker: "Planner",
  maxTurns: 50,
});

for (const turn of result.turns) {
  console.log(`Turn ${turn.turnNumber} | ${turn.speaker}`);
  console.log(`Answer: ${turn.answer}`);
  console.log(`Next: ${turn.nextAgent} | readyToConclude: ${turn.readyToConclude}`);
  console.log("");
}

console.log(`Concluded: ${result.concluded}`);
console.log(`Stop reason: ${result.stopReason}`);
console.log(`Log file: ${logFilePath}`);
