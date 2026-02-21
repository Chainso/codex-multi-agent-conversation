import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { Codex } from "@openai/codex-sdk";
import type { CodexOptions, Input, Thread, ThreadOptions } from "@openai/codex-sdk";

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
};

export type MultiAgentOrchestratorOptions = {
  codex?: Codex;
  codexOptions?: CodexOptions;
  threadOptions?: ThreadOptions;
  sharedInstructions?: string;
  logFilePath?: string;
};

type BufferedMessage = {
  from: string;
  answer: string;
  turnNumber: number;
};

type AgentRuntime = {
  definition: AgentDefinition;
  thread: Thread;
  unseenMessages: BufferedMessage[];
  readyToConclude: boolean;
  hasSpoken: boolean;
};

type TextInput = {
  type: "text";
  text: string;
};

const DEFAULT_MAX_TURNS = 50;

export class MultiAgentOrchestrator {
  private readonly codex: Codex;
  private readonly agents = new Map<string, AgentRuntime>();
  private readonly agentNames: string[];
  private readonly sharedInstructions: string;
  private readonly logFilePath?: string;
  private readonly threadOptions: ThreadOptions;

  private logDirectoryReady = false;

  constructor(agentDefinitions: AgentDefinition[], options: MultiAgentOrchestratorOptions = {}) {
    if (agentDefinitions.length < 2) {
      throw new Error("At least two agents must be provided.");
    }

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

    const turns: ConversationTurn[] = [];
    let speaker = input.firstSpeaker;
    let concluded = false;
    let stopReason: ConversationResult["stopReason"] = "max_turns_reached";

    await this.appendConversationStart({
      timestamp: nowIso(),
      conversationGoal: input.conversationGoal,
      firstSpeaker: input.firstSpeaker,
      maxTurns,
    });

    for (let turnNumber = 1; turnNumber <= maxTurns; turnNumber += 1) {
      const runtime = this.getAgentRuntime(speaker);

      if (runtime.readyToConclude) {
        runtime.readyToConclude = false;
      }

      const unseenSnapshot = [...runtime.unseenMessages];
      const turnInput = this.buildTurnInput({
        agent: runtime.definition,
        isFirstTurnForAgent: !runtime.hasSpoken,
        conversationGoal: input.conversationGoal,
        unseenMessages: unseenSnapshot,
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

      await this.appendTurnLog({
        timestamp: nowIso(),
        turnNumber,
        maxTurns,
        speaker,
        answer: parsed.answer,
        nextAgent: parsed.nextAgent,
        readyToConclude: parsed.readyToConclude,
        unseenMessagesConsumed: unseenSnapshot.length,
        threadId: runtime.thread.id,
      });

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

    await this.appendConversationEnd({
      timestamp: nowIso(),
      concluded,
      stopReason,
      turns: turns.length,
    });

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

  private buildTurnInput(input: {
    agent: AgentDefinition;
    isFirstTurnForAgent: boolean;
    conversationGoal: string;
    unseenMessages: BufferedMessage[];
  }): Input {
    const unseenMessageEntries = buildUnseenBlock(input.unseenMessages);

    if (input.isFirstTurnForAgent) {
      const participantsBlock = this.agentNames
        .map((name) => {
          const rolePrompt = this.agents.get(name)?.definition.rolePrompt;
          if (!rolePrompt) {
            return `- ${name}`;
          }
          return `- ${name}: ${rolePrompt}`;
        })
        .join("\n");

      const sharedInstructionsBlock = this.sharedInstructions.trim();
      const setupParts = [
        `You are agent "${input.agent.name}".`,
        `Conversation goal:\n${input.conversationGoal}`,
        `All agents in this conversation:\n${participantsBlock}`,
      ];
      if (sharedInstructionsBlock.length > 0) {
        setupParts.push(`Shared instructions:\n${sharedInstructionsBlock}`);
      }

      const protocolBlock = [
        "Conversation protocol (apply on every turn):",
        '- Return a JSON object with keys: "answer", "nextAgent", "readyToConclude".',
        '- "nextAgent" chooses which other agent should speak next.',
        '- Set "readyToConclude" to true only when you have no further meaningful contribution right now.',
        "- If later asked to speak again, continue normally and set readyToConclude based on that turn.",
      ].join("\n");

      return [
        toTextInput(setupParts.join("\n\n")),
        toTextInput(protocolBlock),
        toTextInput("Only new final responses from other agents that you have not seen yet:"),
        ...unseenMessageEntries.map((entry) => toTextInput(entry)),
      ];
    }

    return [
      ...unseenMessageEntries.map((entry) => toTextInput(entry)),
    ];
  }

  private async appendConversationStart(input: {
    timestamp: string;
    conversationGoal: string;
    firstSpeaker: string;
    maxTurns: number;
  }): Promise<void> {
    if (!this.logFilePath) {
      return;
    }

    const roles = this.agentNames
      .map((name) => {
        const rolePrompt = this.agents.get(name)?.definition.rolePrompt;
        return rolePrompt ? `- **${name}**: ${rolePrompt}` : `- **${name}**`;
      })
      .join("\n");

    const body = [
      "",
      "# Multi-Agent Conversation",
      "",
      `- Started: ${input.timestamp}`,
      `- Goal: ${input.conversationGoal}`,
      `- First speaker: ${input.firstSpeaker}`,
      `- Max turns: ${input.maxTurns}`,
      "",
      "## Participants",
      "",
      roles,
      "",
      "---",
      "",
    ].join("\n");

    await this.appendMarkdown(body);
  }

  private async appendTurnLog(input: {
    timestamp: string;
    turnNumber: number;
    maxTurns: number;
    speaker: string;
    answer: string;
    nextAgent: string;
    readyToConclude: boolean;
    unseenMessagesConsumed: number;
    threadId: string | null;
  }): Promise<void> {
    if (!this.logFilePath) {
      return;
    }

    const body = [
      `## Turn ${input.turnNumber}/${input.maxTurns} - ${input.speaker}`,
      "",
      `- Time: ${input.timestamp}`,
      `- Next speaker: ${input.nextAgent}`,
      `- ${input.speaker} ready to conclude: ${String(input.readyToConclude)}`,
      `- Unseen messages consumed: ${input.unseenMessagesConsumed}`,
      `- Thread ID: ${input.threadId ?? "(pending)"}`,
      "",
      "### Message",
      "",
      toBlockquote(input.answer),
      "",
      "---",
      "",
    ].join("\n");

    await this.appendMarkdown(body);
  }

  private async appendConversationEnd(input: {
    timestamp: string;
    concluded: boolean;
    stopReason: "all_agents_ready" | "max_turns_reached";
    turns: number;
  }): Promise<void> {
    if (!this.logFilePath) {
      return;
    }

    const body = [
      "## Conversation Complete",
      "",
      `- Time: ${input.timestamp}`,
      `- Concluded: ${String(input.concluded)}`,
      `- Stop reason: ${input.stopReason}`,
      `- Total turns: ${input.turns}`,
      "",
      "---",
      "",
    ].join("\n");

    await this.appendMarkdown(body);
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

function createTurnOutputSchema(nextAgentCandidates: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      answer: { type: "string" },
      nextAgent: { type: "string", enum: nextAgentCandidates },
      readyToConclude: { type: "boolean" },
    },
    required: ["answer", "nextAgent", "readyToConclude"],
    additionalProperties: false,
  };
}

function validateUniqueNames(agentNames: string[]): void {
  const seen = new Set<string>();
  for (const name of agentNames) {
    if (seen.has(name)) {
      throw new Error(`Duplicate agent name "${name}".`);
    }
    seen.add(name);
  }
}

function parseAgentTurnOutput(raw: string, allowedNextAgents: string[]): AgentTurnOutput {
  const parsed = parsePossiblyWrappedJson(raw);
  if (!isRecord(parsed)) {
    throw new Error(`Structured output must be an object. Received: ${raw}`);
  }

  const answer = parsed.answer;
  const nextAgent = parsed.nextAgent;
  const readyToConclude = parsed.readyToConclude;

  if (typeof answer !== "string") {
    throw new Error(`"answer" must be a string. Received: ${raw}`);
  }

  if (typeof nextAgent !== "string") {
    throw new Error(`"nextAgent" must be a string. Received: ${raw}`);
  }

  if (!allowedNextAgents.includes(nextAgent)) {
    throw new Error(
      `"nextAgent" must be one of [${allowedNextAgents.join(", ")}]. Received: ${raw}`,
    );
  }

  if (typeof readyToConclude !== "boolean") {
    throw new Error(`"readyToConclude" must be a boolean. Received: ${raw}`);
  }

  return {
    answer,
    nextAgent,
    readyToConclude,
  };
}

function parsePossiblyWrappedJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      return JSON.parse(fenced[1]);
    }

    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    }
  }

  throw new Error(`Could not parse structured output JSON: ${raw}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function toBlockquote(text: string): string {
  if (text.trim().length === 0) {
    return "> ";
  }
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function toTextInput(text: string): TextInput {
  return { type: "text", text };
}

function buildUnseenBlock(messages: BufferedMessage[]): string[] {
  if (messages.length === 0) {
    return ["- (none)"];
  }
  return messages.map((message) => `- [turn ${message.turnNumber}] ${message.from}: ${message.answer}`);
}
