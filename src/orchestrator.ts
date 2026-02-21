import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { Codex } from "@openai/codex-sdk";
import type { ThreadOptions } from "@openai/codex-sdk";

import { formatConversationEndLog, formatConversationStartLog, formatTurnLog } from "./orchestrator/log-format.js";
import { parseAgentTurnOutput } from "./orchestrator/parsing.js";
import { buildTurnInput, resolveWarningStartTurn } from "./orchestrator/prompt.js";
import { createTurnOutputSchema } from "./orchestrator/schema.js";
import type {
  AgentDefinition,
  AgentRuntime,
  AgentRuntimeState,
  ConversationResult,
  ConversationTurn,
  MultiAgentOrchestratorOptions,
  OrchestratorStateSnapshot,
  RunConversationInput,
} from "./orchestrator/types.js";
import { nowIso, validateUniqueNames } from "./orchestrator/utils.js";

export type {
  AgentDefinition,
  AgentTurnOutput,
  ConversationEndHookContext,
  ConversationStartHookContext,
  BeforeTurnHookContext,
  TurnCompletedHookContext,
  ConversationResult,
  ConversationTurn,
  MultiAgentOrchestratorOptions,
  OrchestratorHooks,
  OrchestratorStateSnapshot,
  RunConversationInput,
} from "./orchestrator/types.js";

const DEFAULT_MAX_TURNS = 50;

export class MultiAgentOrchestrator {
  private readonly codex: Codex;
  private readonly agents = new Map<string, AgentRuntime>();
  private readonly agentNames: string[];
  private readonly allAgents: AgentDefinition[];
  private readonly sharedInstructions: string;
  private readonly logFilePath?: string;
  private readonly threadOptions: ThreadOptions;
  private readonly hooks;

  private logDirectoryReady = false;

  constructor(agentDefinitions: AgentDefinition[], options: MultiAgentOrchestratorOptions = {}) {
    if (agentDefinitions.length < 2) {
      throw new Error("At least two agents must be provided.");
    }

    this.allAgents = [...agentDefinitions];
    this.agentNames = agentDefinitions.map((agent) => agent.name);
    validateUniqueNames(this.agentNames);

    this.codex = options.codex ?? new Codex(options.codexOptions ?? {});
    this.sharedInstructions = options.sharedInstructions ?? "";
    this.logFilePath = options.logFilePath;
    this.threadOptions = {
      skipGitRepoCheck: true,
      ...options.threadOptions,
    };
    this.hooks = options.hooks;

    for (const definition of agentDefinitions) {
      const initialState = options.initialAgentStates?.[definition.name];
      const thread = initialState?.threadId
        ? this.codex.resumeThread(initialState.threadId, this.threadOptions)
        : this.codex.startThread(this.threadOptions);
      this.agents.set(definition.name, {
        definition,
        thread,
        unseenMessages: initialState ? [...initialState.unseenMessages] : [],
        readyToConclude: initialState?.readyToConclude ?? false,
        hasSpoken: initialState?.hasSpoken ?? false,
      });
    }
  }

  static fromStateSnapshot(
    snapshot: OrchestratorStateSnapshot,
    options: Omit<MultiAgentOrchestratorOptions, "sharedInstructions" | "threadOptions" | "initialAgentStates"> = {},
  ): MultiAgentOrchestrator {
    return new MultiAgentOrchestrator(snapshot.agentDefinitions, {
      ...options,
      sharedInstructions: snapshot.sharedInstructions,
      threadOptions: snapshot.threadOptions,
      initialAgentStates: snapshot.agentStates,
    });
  }

  async runConversation(input: RunConversationInput): Promise<ConversationResult> {
    if (!this.agents.has(input.firstSpeaker)) {
      throw new Error(`Unknown first speaker "${input.firstSpeaker}".`);
    }

    const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
    if (maxTurns <= 0) {
      throw new Error("maxTurns must be greater than 0.");
    }
    const startingTurnNumber = input.startingTurnNumber ?? 1;
    if (!Number.isInteger(startingTurnNumber) || startingTurnNumber < 1) {
      throw new Error("startingTurnNumber must be an integer greater than or equal to 1.");
    }
    if (startingTurnNumber > maxTurns + 1) {
      throw new Error("startingTurnNumber cannot be greater than maxTurns + 1.");
    }

    const warningStartTurn = resolveWarningStartTurn({
      maxTurns,
      agentCount: this.agentNames.length,
      warningTurnsBeforeMax: input.warningTurnsBeforeMax,
    });

    const turns: ConversationTurn[] = [];
    let speaker = input.firstSpeaker;
    let concluded = false;
    let stopReason: ConversationResult["stopReason"] = "max_turns_reached";
    const startTimestamp = nowIso();

    if (this.hooks?.onConversationStart) {
      await this.hooks.onConversationStart({
        conversationGoal: input.conversationGoal,
        firstSpeaker: input.firstSpeaker,
        maxTurns,
        warningTurnsBeforeMax: input.warningTurnsBeforeMax,
        warningStartTurn,
        startingTurnNumber,
        timestamp: startTimestamp,
        stateSnapshot: this.getStateSnapshot(),
      });
    }

    await this.appendMarkdown(
      formatConversationStartLog({
        timestamp: startTimestamp,
        conversationGoal: input.conversationGoal,
        firstSpeaker: input.firstSpeaker,
        maxTurns,
        warningStartTurn,
        agents: this.allAgents,
      }),
    );

    for (let turnNumber = startingTurnNumber; turnNumber <= maxTurns; turnNumber += 1) {
      const runtime = this.getAgentRuntime(speaker);

      if (runtime.readyToConclude) {
        runtime.readyToConclude = false;
      }

      const unseenSnapshot = [...runtime.unseenMessages];
      const warningMessage =
        turnNumber >= warningStartTurn
          ? `Final-turn warning: hard stop at turn ${maxTurns}. Wrap up and converge ASAP.`
          : null;
      const beforeTurnTimestamp = nowIso();

      if (this.hooks?.onBeforeTurn) {
        await this.hooks.onBeforeTurn({
          conversationGoal: input.conversationGoal,
          maxTurns,
          warningStartTurn,
          turnNumber,
          speaker,
          warningMessage,
          timestamp: beforeTurnTimestamp,
          stateSnapshot: this.getStateSnapshot(),
        });
      }

      const turnInput = buildTurnInput({
        agent: runtime.definition,
        allAgents: this.allAgents,
        sharedInstructions: this.sharedInstructions,
        isFirstTurnForAgent: !runtime.hasSpoken,
        conversationGoal: input.conversationGoal,
        unseenMessages: unseenSnapshot,
        warningMessage,
      });

      const allowedNextAgents = this.getAllowedNextAgents(speaker);
      const outputSchema = createTurnOutputSchema(allowedNextAgents);

      const turn = await runtime.thread.run(turnInput, { outputSchema });
      const parsed = parseAgentTurnOutput(turn.finalResponse, allowedNextAgents);

      runtime.unseenMessages = [];
      runtime.readyToConclude = parsed.readyToConclude;
      runtime.hasSpoken = true;

      const turnRecord: ConversationTurn = {
        turnNumber,
        speaker,
        answer: parsed.answer,
        nextAgent: parsed.nextAgent,
        readyToConclude: parsed.readyToConclude,
        rawResponse: turn.finalResponse,
        unseenMessagesConsumed: unseenSnapshot.length,
        threadId: runtime.thread.id,
      };
      turns.push(turnRecord);

      for (const otherRuntime of this.agents.values()) {
        if (otherRuntime.definition.name === speaker) {
          continue;
        }
        otherRuntime.unseenMessages.push({
          from: speaker,
          answer: parsed.answer,
          turnNumber,
        });
      }

      await this.appendMarkdown(
        formatTurnLog({
          timestamp: beforeTurnTimestamp,
          turnNumber,
          maxTurns,
          speaker,
          answer: parsed.answer,
          nextAgent: parsed.nextAgent,
          readyToConclude: parsed.readyToConclude,
          unseenMessagesConsumed: unseenSnapshot.length,
          threadId: runtime.thread.id,
        }),
      );

      if (this.hooks?.onTurnCompleted) {
        await this.hooks.onTurnCompleted({
          conversationGoal: input.conversationGoal,
          maxTurns,
          warningStartTurn,
          turn: turnRecord,
          timestamp: beforeTurnTimestamp,
          stateSnapshot: this.getStateSnapshot(),
        });
      }

      if (this.allAgentsReadyToConclude()) {
        concluded = true;
        stopReason = "all_agents_ready";
        break;
      }

      const nextRuntime = this.getAgentRuntime(parsed.nextAgent);
      if (nextRuntime.readyToConclude) {
        nextRuntime.readyToConclude = false;
      }
      speaker = parsed.nextAgent;
    }

    const endTimestamp = nowIso();
    await this.appendMarkdown(
      formatConversationEndLog({
        timestamp: endTimestamp,
        concluded,
        stopReason,
        turns: turns.length,
      }),
    );

    if (this.hooks?.onConversationEnd) {
      await this.hooks.onConversationEnd({
        conversationGoal: input.conversationGoal,
        maxTurns,
        warningStartTurn,
        concluded,
        stopReason,
        turnsCompleted: turns.length,
        timestamp: endTimestamp,
        stateSnapshot: this.getStateSnapshot(),
      });
    }

    return {
      turns,
      concluded,
      stopReason,
    };
  }

  getThreadIds(): Record<string, string | null> {
    const threadIds: Record<string, string | null> = {};
    for (const runtime of this.agents.values()) {
      threadIds[runtime.definition.name] = runtime.thread.id;
    }
    return threadIds;
  }

  getStateSnapshot(): OrchestratorStateSnapshot {
    const agentStates: Record<string, AgentRuntimeState> = {};
    for (const runtime of this.agents.values()) {
      agentStates[runtime.definition.name] = {
        threadId: runtime.thread.id,
        unseenMessages: runtime.unseenMessages.map((message) => ({ ...message })),
        readyToConclude: runtime.readyToConclude,
        hasSpoken: runtime.hasSpoken,
      };
    }
    return {
      agentDefinitions: this.allAgents.map((agent) => ({ ...agent })),
      sharedInstructions: this.sharedInstructions,
      threadOptions: { ...this.threadOptions },
      agentStates,
    };
  }

  private getAgentRuntime(name: string): AgentRuntime {
    const runtime = this.agents.get(name);
    if (!runtime) {
      throw new Error(`Unknown agent "${name}".`);
    }
    return runtime;
  }

  private getAllowedNextAgents(currentSpeaker: string): string[] {
    const allowed = this.agentNames.filter((name) => name !== currentSpeaker);
    if (allowed.length === 0) {
      throw new Error(`No valid next speaker options for "${currentSpeaker}".`);
    }
    return allowed;
  }

  private allAgentsReadyToConclude(): boolean {
    for (const runtime of this.agents.values()) {
      if (!runtime.readyToConclude) {
        return false;
      }
    }
    return true;
  }

  private async appendMarkdown(markdown: string): Promise<void> {
    if (!this.logFilePath) {
      return;
    }

    if (!this.logDirectoryReady) {
      await mkdir(dirname(this.logFilePath), { recursive: true });
      this.logDirectoryReady = true;
    }

    await appendFile(this.logFilePath, markdown, "utf8");
  }
}
