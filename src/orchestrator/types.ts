import type { Codex, CodexOptions, Thread, ThreadOptions } from "@openai/codex-sdk";

export type AgentDefinition = {
  name: string;
  rolePrompt?: string;
  model?: string;
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
  startingTurnNumber?: number;
};

export type MultiAgentOrchestratorOptions = {
  codex?: Codex;
  codexOptions?: CodexOptions;
  threadOptions?: ThreadOptions;
  sharedInstructions?: string;
  logFilePath?: string;
  initialAgentStates?: Record<string, AgentRuntimeState>;
  hooks?: OrchestratorHooks;
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
  lastAnswer: string | null;
};

export type AgentRuntimeState = {
  threadId: string | null;
  unseenMessages: BufferedMessage[];
  readyToConclude: boolean;
  hasSpoken: boolean;
  lastAnswer: string | null;
};

export type OrchestratorStateSnapshot = {
  agentDefinitions: AgentDefinition[];
  sharedInstructions: string;
  threadOptions: ThreadOptions;
  agentStates: Record<string, AgentRuntimeState>;
};

export type ConversationStartHookContext = {
  conversationGoal: string;
  firstSpeaker: string;
  maxTurns: number;
  warningTurnsBeforeMax?: number;
  warningStartTurn: number;
  startingTurnNumber: number;
  timestamp: string;
  stateSnapshot: OrchestratorStateSnapshot;
};

export type BeforeTurnHookContext = {
  conversationGoal: string;
  maxTurns: number;
  warningStartTurn: number;
  turnNumber: number;
  speaker: string;
  warningMessage: string | null;
  timestamp: string;
  stateSnapshot: OrchestratorStateSnapshot;
};

export type TurnCompletedHookContext = {
  conversationGoal: string;
  maxTurns: number;
  warningStartTurn: number;
  turn: ConversationTurn;
  timestamp: string;
  stateSnapshot: OrchestratorStateSnapshot;
};

export type ConversationEndHookContext = {
  conversationGoal: string;
  maxTurns: number;
  warningStartTurn: number;
  concluded: boolean;
  stopReason: ConversationResult["stopReason"];
  turnsCompleted: number;
  timestamp: string;
  stateSnapshot: OrchestratorStateSnapshot;
};

export type OrchestratorHooks = {
  onConversationStart?: (context: ConversationStartHookContext) => void | Promise<void>;
  onBeforeTurn?: (context: BeforeTurnHookContext) => void | Promise<void>;
  onTurnCompleted?: (context: TurnCompletedHookContext) => void | Promise<void>;
  onConversationEnd?: (context: ConversationEndHookContext) => void | Promise<void>;
};
