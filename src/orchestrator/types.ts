import type { Codex, CodexOptions, Thread, ThreadOptions } from "@openai/codex-sdk";

export type AgentDefinition = {
  name: string;
  rolePrompt?: string;
};

export type AgentTurnOutput = {
  answer: string;
  nextAgent: string;
  readyToConclude: boolean;
};

export type ConversationTurn = AgentTurnOutput & {
  turnNumber: number;
  speaker: string;
  rawResponse: string;
  unseenMessagesConsumed: number;
  threadId: string | null;
};

export type ConversationResult = {
  turns: ConversationTurn[];
  concluded: boolean;
  stopReason: "all_agents_ready" | "max_turns_reached";
};

export type RunConversationInput = {
  conversationGoal: string;
  firstSpeaker: string;
  maxTurns?: number;
  warningTurnsBeforeMax?: number;
};

export type MultiAgentOrchestratorOptions = {
  codex?: Codex;
  codexOptions?: CodexOptions;
  threadOptions?: ThreadOptions;
  sharedInstructions?: string;
  logFilePath?: string;
};

export type BufferedMessage = {
  from: string;
  answer: string;
  turnNumber: number;
};

export type AgentRuntime = {
  definition: AgentDefinition;
  thread: Thread;
  unseenMessages: BufferedMessage[];
  readyToConclude: boolean;
  hasSpoken: boolean;
};
