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
  ConversationResult,
  ConversationTurn,
  MultiAgentOrchestratorOptions,
  RunConversationInput,
} from "./orchestrator/types.js";
import { nowIso, validateUniqueNames } from "./orchestrator/utils.js";

export type {
  AgentDefinition,
  AgentTurnOutput,
  ConversationResult,
  ConversationTurn,
  MultiAgentOrchestratorOptions,
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

    for (const definition of agentDefinitions) {
      this.agents.set(definition.name, {
        definition,
        thread: this.codex.startThread(this.threadOptions),
        unseenMessages: [],
        readyToConclude: false,
        hasSpoken: false,
      });
    }
  }

  async runConversation(input: RunConversationInput): Promise<ConversationResult> {
    if (!this.agents.has(input.firstSpeaker)) {
      throw new Error(`Unknown first speaker "${input.firstSpeaker}".`);
    }

    const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
    if (maxTurns <= 0) {
      throw new Error("maxTurns must be greater than 0.");
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

    await this.appendMarkdown(
      formatConversationStartLog({
        timestamp: nowIso(),
        conversationGoal: input.conversationGoal,
        firstSpeaker: input.firstSpeaker,
        maxTurns,
        warningStartTurn,
        agents: this.allAgents,
      }),
    );

    for (let turnNumber = 1; turnNumber <= maxTurns; turnNumber += 1) {
      const runtime = this.getAgentRuntime(speaker);

      if (runtime.readyToConclude) {
        runtime.readyToConclude = false;
      }

      const unseenSnapshot = [...runtime.unseenMessages];
      const warningMessage =
        turnNumber >= warningStartTurn
          ? `Final-turn warning: hard stop at turn ${maxTurns}. Wrap up and converge ASAP.`
          : null;

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
          timestamp: nowIso(),
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

    await this.appendMarkdown(
      formatConversationEndLog({
        timestamp: nowIso(),
        concluded,
        stopReason,
        turns: turns.length,
      }),
    );

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
