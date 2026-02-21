import { MultiAgentOrchestrator } from "./orchestrator.js";
import type { ThreadOptions } from "@openai/codex-sdk";
import {
  DEFAULT_AGENTS,
  DEFAULT_FIRST_SPEAKER,
  DEFAULT_SHARED_INSTRUCTIONS,
} from "./default-conversation-setup.js";
import { createConversationLogPath } from "./path-utils.js";

export type RunConversationForPromptInput = {
  prompt: string;
  maxTurns?: number;
  logFilePath?: string;
  runStamp?: string;
  logBaseDir?: string;
  logLabel?: string;
  model?: string;
  threadOptions?: ThreadOptions;
  codexPathOverride?: string;
};

export type RunConversationForPromptResult = {
  prompt: string;
  logFilePath: string;
  conversation: Awaited<ReturnType<MultiAgentOrchestrator["runConversation"]>>;
};

export async function runConversationForPrompt(
  input: RunConversationForPromptInput,
): Promise<RunConversationForPromptResult> {
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
  });

  return {
    prompt: input.prompt,
    logFilePath,
    conversation,
  };
}
