# Codex Multi-Agent Conversation Orchestrator

A TypeScript orchestrator for running multi-agent conversations on top of `@openai/codex-sdk`, with resumable state persistence in SQLite.

## Features

- One Codex thread per agent.
- Structured turn output: `answer`, `nextAgent`, `readyToConclude`.
- `nextAgent` is constrained to other agents (no self-loop routing).
- Per-agent unseen-message buffers from other agents only.
- Resumable conversations via SQLite (`conversationId` + full orchestrator snapshot).
- Streaming Markdown conversation logs.
- Optional warning window before hard max-turn stop.
- Single-prompt and suite-based QA evaluation scripts.

## Requirements

- Node.js (project is currently tested with Node 24).
- `codex` CLI available (or set `CODEX_PATH_OVERRIDE`).

## Installation

```bash
npm install
```

This repository uses npm workspaces and resolves `@openai/codex-sdk` from the local workspace package at `codex-sdk/typescript`.

## Quick Start

Run a conversation:

```bash
npm run demo -- "Plan how we migrate a monolith to services with low risk"
```

The run prints:
- `conversationId` (for resume)
- SQLite DB path
- Markdown log path

## Resume a Conversation

```bash
npm run resume -- <conversation-id>
```

The orchestrator resumes using persisted state (thread IDs, unseen buffers, readiness flags, and turn progress).

## Evaluation

Single prompt:

```bash
npm run eval:single -- "Plan how we migrate a monolith to services with low risk"
```

Suite (parallel):

```bash
npm run eval:suite
```

Base test cases are in `src/evals/eval-test-cases.ts`.

## Configuration

Common environment variables:

- `CONVERSATION_MODEL`: conversation model override.
- `AGENT_MODELS_JSON`: per-agent model overrides for scripts as JSON, e.g. `{"Planner":"gpt-5.1-codex-mini","Skeptic":"gpt-5.1-codex"}`.
- `QA_MODEL`: QA evaluation model override.
- `CODEX_PATH_OVERRIDE`: absolute path to `codex` binary.
- `CONVERSATIONS_DB_PATH`: SQLite file path (default `./conversations.db`).
- `CONVERSATION_LOG_PATH`: fixed log path (otherwise auto-generated under `logs/conversations/`).
- `WARNING_TURNS_BEFORE_MAX`: warning window before max turns; default is number of agents.
- `MAX_TURNS_OVERRIDE`: resume-only max-turn override.
- `EVAL_CONCURRENCY`: suite concurrency (default `3`).

## Core API

```ts
import { MultiAgentOrchestrator } from "./src/index.js";

const orchestrator = new MultiAgentOrchestrator(
  [
    {
      name: "Planner",
      rolePrompt: "Break work into practical phases.",
      model: "gpt-5.1-codex-mini",
    },
    { name: "Skeptic", rolePrompt: "Stress test assumptions." },
    { name: "Builder", rolePrompt: "Propose implementation details." },
  ],
  {
    sharedInstructions: "Keep responses concise.",
    logFilePath: "./conversation.log.md",
  },
);

const result = await orchestrator.runConversation({
  conversationGoal: "Solve X",
  firstSpeaker: "Planner",
  maxTurns: 50,
});
```

`AgentDefinition.model` overrides the global thread model for that specific agent.

Main orchestration entrypoint: `src/orchestrator.ts`.
