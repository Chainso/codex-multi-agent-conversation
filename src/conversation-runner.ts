import { randomUUID } from "node:crypto";

import { MultiAgentOrchestrator } from "./orchestrator.js";
import type { ThreadOptions } from "@openai/codex-sdk";
import {
  DEFAULT_AGENTS,
  DEFAULT_FIRST_SPEAKER,
  DEFAULT_SHARED_INSTRUCTIONS,
} from "./default-conversation-setup.js";
import { createPersistenceHooks } from "./conversations/persistence-hooks.js";
import { SqliteConversationStore } from "./conversations/sqlite-conversation-store.js";
import { createConversationLogPath } from "./path-utils.js";

export type RunConversationForPromptInput = {
  prompt: string;
  maxTurns?: number;
  warningTurnsBeforeMax?: number;
  conversationId?: string;
  sqlitePath?: string;
  logFilePath?: string;
  runStamp?: string;
  logBaseDir?: string;
  logLabel?: string;
  model?: string;
  threadOptions?: ThreadOptions;
  codexPathOverride?: string;
};

export type RunConversationForPromptResult = {
  conversationId: string;
  sqlitePath: string;
  prompt: string;
  logFilePath: string;
  conversation: Awaited<ReturnType<MultiAgentOrchestrator["runConversation"]>>;
};

export async function runConversationForPrompt(
  input: RunConversationForPromptInput,
): Promise<RunConversationForPromptResult> {
  const sqlitePath = input.sqlitePath ?? "./conversations.db";
  const conversationId = input.conversationId ?? randomUUID();
  const store = new SqliteConversationStore(sqlitePath);

  const logFilePath =
    input.logFilePath ??
    createConversationLogPath({
      prompt: input.prompt,
      runStamp: input.runStamp,
      baseDir: input.logBaseDir,
      label: input.logLabel,
    });

  const orchestrator = new MultiAgentOrchestrator(DEFAULT_AGENTS, {
    codexOptions: input.codexPathOverride
      ? {
          codexPathOverride: input.codexPathOverride,
        }
      : undefined,
    sharedInstructions: DEFAULT_SHARED_INSTRUCTIONS,
    logFilePath,
    hooks: createPersistenceHooks({
      store,
      conversationId,
      mode: "create",
    }),
    threadOptions: {
      skipGitRepoCheck: true,
      ...input.threadOptions,
      ...(input.model ? { model: input.model } : {}),
    },
  });

  const conversation = await orchestrator.runConversation({
    conversationGoal: input.prompt,
    firstSpeaker: DEFAULT_FIRST_SPEAKER,
    maxTurns: input.maxTurns,
    warningTurnsBeforeMax: input.warningTurnsBeforeMax,
  });

  return {
    conversationId,
    sqlitePath,
    prompt: input.prompt,
    logFilePath,
    conversation,
  };
}

export type ResumeConversationByIdInput = {
  conversationId: string;
  sqlitePath?: string;
  maxTurns?: number;
  warningTurnsBeforeMax?: number;
  model?: string;
  threadOptions?: ThreadOptions;
  codexPathOverride?: string;
  logFilePath?: string;
};

export type ResumeConversationByIdResult = {
  conversationId: string;
  sqlitePath: string;
  prompt: string;
  logFilePath: string | undefined;
  turnsCompletedBeforeRun: number;
  conversation: Awaited<ReturnType<MultiAgentOrchestrator["runConversation"]>>;
};

export async function resumeConversationById(
  input: ResumeConversationByIdInput,
): Promise<ResumeConversationByIdResult> {
  const sqlitePath = input.sqlitePath ?? "./conversations.db";
  const store = new SqliteConversationStore(sqlitePath);
  const persisted = store.getConversation(input.conversationId);
  if (!persisted) {
    throw new Error(`Conversation "${input.conversationId}" not found in ${sqlitePath}.`);
  }

  const snapshot = {
    ...persisted.orchestratorState,
    threadOptions: {
      ...persisted.orchestratorState.threadOptions,
      ...input.threadOptions,
      ...(input.model ? { model: input.model } : {}),
    },
  };

  const orchestrator = MultiAgentOrchestrator.fromStateSnapshot(snapshot, {
    codexOptions: input.codexPathOverride
      ? {
          codexPathOverride: input.codexPathOverride,
        }
      : undefined,
    logFilePath: input.logFilePath,
    hooks: createPersistenceHooks({
      store,
      conversationId: input.conversationId,
      mode: "resume",
    }),
  });

  const conversation = await orchestrator.runConversation({
    conversationGoal: persisted.runInput.conversationGoal,
    firstSpeaker: persisted.nextSpeaker,
    maxTurns: input.maxTurns ?? persisted.runInput.maxTurns,
    warningTurnsBeforeMax: input.warningTurnsBeforeMax ?? persisted.runInput.warningTurnsBeforeMax,
    startingTurnNumber: persisted.turnsCompleted + 1,
  });

  return {
    conversationId: input.conversationId,
    sqlitePath,
    prompt: persisted.runInput.conversationGoal,
    logFilePath: input.logFilePath,
    turnsCompletedBeforeRun: persisted.turnsCompleted,
    conversation,
  };
}
