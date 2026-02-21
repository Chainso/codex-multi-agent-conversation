# AGENTS Guide

This file is a quick orientation for agents working in this repository.

## Purpose

This project orchestrates multi-agent conversations using `@openai/codex-sdk`:
- one Codex thread per agent
- structured turn routing (`answer`, `nextAgent`, `readyToConclude`)
- Markdown transcript logging
- SQLite-backed conversation persistence and resume

## Repo map (lightweight)

- `src/orchestrator.ts`
  - Main `MultiAgentOrchestrator` coordination loop.
- `src/orchestrator/`
  - Orchestration helpers (prompt building, schema, parsing, log formatting, types).
- `src/conversation-runner.ts`
  - High-level run/resume entrypoints, orchestration wiring, persistence hookup.
- `src/conversations/`
  - SQLite store + persistence hooks.
- `src/demo.ts`
  - Demo CLI entrypoint.
- `src/resume.ts`
  - Resume CLI entrypoint.
- `src/evals/`
  - QA evaluator, single eval, and suite eval scripts.
- `src/default-conversation-setup.ts`
  - Default agents/instructions used by demo/evals.
- `codex-sdk/typescript/`
  - Local workspace copy of the SDK. This project depends on it via npm workspaces.

## Build and run

- Install: `npm install`
- Type-check: `npm run check`
- Build all (default): `npm run build`
- Demo: `npm run demo -- "your prompt"`
- Resume: `npm run resume -- <conversation-id>`
- Eval single: `npm run eval:single -- "your prompt"`
- Eval suite: `npm run eval:suite`

## Working agreements for agents

- Keep orchestrator logic modular.
  - If `src/orchestrator.ts` grows, move helpers into `src/orchestrator/`.
- Preserve structured output contracts.
  - Conversation agent schema includes `answer`, `nextAgent`, `readyToConclude`.
  - QA schema remains `{ score, reason }`.
- Prefer message arrays over newline-joined mega-prompts when composing turn inputs.
- Keep logs human-readable Markdown (not JSON dumps).
- Keep persistence resumable.
  - Conversation state in SQLite must be sufficient to reconstruct orchestrator state.
- Respect max-turn behavior.
  - Warning window logic should stay configurable.
  - Hard stop at max turns should remain deterministic.

## Editing guidance

- Make focused changes; avoid broad rewrites unless needed.
- Run `npm run check` after code changes.
- Update `README.md` when behavior or CLI/config changes.
- If you change `codex-sdk/typescript`, ensure workspace build still works with `npm run build`.

## Common env vars

- `CONVERSATION_MODEL`
- `QA_MODEL`
- `CODEX_PATH_OVERRIDE`
- `CONVERSATIONS_DB_PATH`
- `CONVERSATION_LOG_PATH`
- `WARNING_TURNS_BEFORE_MAX`
- `MAX_TURNS_OVERRIDE`
- `EVAL_CONCURRENCY`

