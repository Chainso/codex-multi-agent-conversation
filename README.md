# Codex Multi-Agent Conversation Orchestrator

This project implements your model on top of `@openai/codex-sdk`:

- One Codex thread per agent.
- `nextAgent` is constrained per turn to other agents only (never the current speaker).
- Agent role/context instructions are provided on that agent's first turn, then subsequent turns are incremental updates.
- Every turn uses structured output with:
  - `answer`
  - `nextAgent`
  - `readyToConclude`
- Each agent receives only unseen final responses from other agents.
- After an agent runs, its unseen buffer is cleared.
- If an agent that previously set `readyToConclude=true` is asked to speak again, it is reset to `false` before speaking.
- Conversation ends when all agents have `readyToConclude=true`.

## Install

```bash
npm install
```

## Run Demo

```bash
npm run demo -- "Plan how we migrate a monolith to services with low risk"
```

Optional env vars:

- `CONVERSATION_LOG_PATH` (default: `./conversation.log.md`)

The log file is written incrementally while the conversation runs as readable Markdown
with clear speaker sections and turn delimiters.

## Core API

```ts
import { MultiAgentOrchestrator } from "./src/index.js";

const orchestrator = new MultiAgentOrchestrator(
  [
    { name: "AgentA", rolePrompt: "..." },
    { name: "AgentB", rolePrompt: "..." },
  ],
  {
    sharedInstructions: "Keep it concise.",
    logFilePath: "./conversation.log.md",
  },
);

const result = await orchestrator.runConversation({
  conversationGoal: "Solve X",
  firstSpeaker: "AgentA",
  maxTurns: 20,
});
```

Main implementation: `src/orchestrator.ts`.
