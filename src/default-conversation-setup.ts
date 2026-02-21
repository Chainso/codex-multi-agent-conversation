import type { AgentDefinition } from "./orchestrator.js";

export const DEFAULT_AGENTS: AgentDefinition[] = [
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
];

export const DEFAULT_FIRST_SPEAKER = "Planner";

export const DEFAULT_SHARED_INSTRUCTIONS =
  "Keep responses concise. Build on prior messages. Avoid repeating points already addressed.";
