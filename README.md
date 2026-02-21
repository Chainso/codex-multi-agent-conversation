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

This repo uses npm workspaces and consumes the local SDK package from
`codex-sdk/typescript` (`@openai/codex-sdk` via `workspace:*`).

## Run Demo

```bash
npm run demo -- "Plan how we migrate a monolith to services with low risk"
```

Optional env vars:

- `CONVERSATION_LOG_PATH` (optional fixed path; if omitted, a unique per-run file is created under `logs/conversations/`)
- `CONVERSATION_MODEL` (optional model override for multi-agent conversation turns)
- `WARNING_TURNS_BEFORE_MAX` (optional non-negative integer; default is number of agents, so warning starts at `maxTurns - agentCount`)
- `CODEX_PATH_OVERRIDE` (optional absolute path to `codex` binary; useful with local SDK forks)

The log file is written incrementally while the conversation runs as readable Markdown
with clear speaker sections and turn delimiters.

## Evaluate One Prompt

This runs:
1. Multi-agent conversation generation.
2. A single Codex QA pass over the initial prompt + generated conversation log.
3. Structured QA output: `{ "score": number, "reason": string }`.

```bash
npm run eval:single -- "Plan how we migrate a monolith to services with low risk"
```

Outputs:
- A per-run conversation log in `logs/conversations/...`
- A structured evaluation report in `logs/evals/...-eval-report.json`

## Evaluate Test Suite In Parallel

```bash
npm run eval:suite
```

Optional env vars:

- `EVAL_CONCURRENCY` (default: `3`)
- `CONVERSATION_MODEL` (optional model override for conversation generation)
- `QA_MODEL` (optional model override for QA scoring pass)
- `WARNING_TURNS_BEFORE_MAX` (optional warning window size before max-turn hard stop)
- `CODEX_PATH_OVERRIDE` (optional absolute path to `codex` binary)

This runs the base prompt set from `src/evals/eval-test-cases.ts` in parallel, runs QA scoring for each case, and writes an aggregated structured report to `logs/evals/...-eval-report.json`.

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
  maxTurns: 50,
});
```

Main implementation: `src/orchestrator.ts`.
