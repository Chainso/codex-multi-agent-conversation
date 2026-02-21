import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type {
  ConversationResult,
  ConversationTurn,
  OrchestratorStateSnapshot,
  RunConversationInput,
} from "../orchestrator.js";

type ConversationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  conversation_goal: string;
  first_speaker: string;
  next_speaker: string;
  max_turns: number;
  warning_turns_before_max: number | null;
  warning_start_turn: number;
  turns_completed: number;
  concluded: number;
  stop_reason: string | null;
  orchestrator_state_json: string;
};

type TurnRow = {
  turn_number: number;
  timestamp: string;
  speaker: string;
  answer: string;
  next_agent: string;
  ready_to_conclude: number;
  structured_output_json: string | null;
  raw_response: string;
  unseen_messages_consumed: number;
  thread_id: string | null;
};

export type StoredConversation = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "completed";
  runInput: RunConversationInput;
  nextSpeaker: string;
  warningStartTurn: number;
  turnsCompleted: number;
  concluded: boolean;
  stopReason: ConversationResult["stopReason"] | null;
  orchestratorState: OrchestratorStateSnapshot;
  turns: ConversationTurn[];
};

export class SqliteConversationStore {
  private readonly db: DatabaseSync;

  constructor(dbPath = "./conversations.db") {
    this.db = new DatabaseSync(dbPath);
    this.ensureSchema();
  }

  createConversation(input: {
    id?: string;
    runInput: RunConversationInput;
    resolvedMaxTurns: number;
    startingTurnNumber: number;
    warningStartTurn: number;
    nextSpeaker: string;
    timestamp: string;
    stateSnapshot: OrchestratorStateSnapshot;
  }): string {
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO conversations (
          id, created_at, updated_at, status,
          conversation_goal, first_speaker, next_speaker,
          max_turns, warning_turns_before_max, warning_start_turn,
          turns_completed, concluded, stop_reason, orchestrator_state_json
        ) VALUES (
          :id, :created_at, :updated_at, 'active',
          :conversation_goal, :first_speaker, :next_speaker,
          :max_turns, :warning_turns_before_max, :warning_start_turn,
          :turns_completed, 0, NULL, :orchestrator_state_json
        )`,
      )
      .run({
        id,
        created_at: input.timestamp,
        updated_at: input.timestamp,
        conversation_goal: input.runInput.conversationGoal,
        first_speaker: input.runInput.firstSpeaker,
        next_speaker: input.nextSpeaker,
        max_turns: input.resolvedMaxTurns,
        warning_turns_before_max: input.runInput.warningTurnsBeforeMax ?? null,
        warning_start_turn: input.warningStartTurn,
        turns_completed: input.startingTurnNumber - 1,
        orchestrator_state_json: JSON.stringify(input.stateSnapshot),
      });
    return id;
  }

  markConversationActive(input: {
    conversationId: string;
    nextSpeaker: string;
    timestamp: string;
    stateSnapshot: OrchestratorStateSnapshot;
  }): void {
    this.db
      .prepare(
        `UPDATE conversations
         SET updated_at = :updated_at,
             status = 'active',
             next_speaker = :next_speaker,
             orchestrator_state_json = :orchestrator_state_json
         WHERE id = :id`,
      )
      .run({
        id: input.conversationId,
        updated_at: input.timestamp,
        next_speaker: input.nextSpeaker,
        orchestrator_state_json: JSON.stringify(input.stateSnapshot),
      });
  }

  saveBeforeTurn(input: {
    conversationId: string;
    turnNumber: number;
    speaker: string;
    timestamp: string;
    stateSnapshot: OrchestratorStateSnapshot;
  }): void {
    this.db
      .prepare(
        `UPDATE conversations
         SET updated_at = :updated_at,
             next_speaker = :next_speaker,
             orchestrator_state_json = :orchestrator_state_json
         WHERE id = :id`,
      )
      .run({
        id: input.conversationId,
        updated_at: input.timestamp,
        next_speaker: input.speaker,
        orchestrator_state_json: JSON.stringify(input.stateSnapshot),
      });
  }

  saveTurnCompleted(input: {
    conversationId: string;
    turn: ConversationTurn;
    timestamp: string;
    stateSnapshot: OrchestratorStateSnapshot;
  }): void {
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO conversation_turns (
            conversation_id, turn_number, timestamp, speaker, answer, next_agent,
            ready_to_conclude, structured_output_json, raw_response, unseen_messages_consumed, thread_id
          ) VALUES (
            :conversation_id, :turn_number, :timestamp, :speaker, :answer, :next_agent,
            :ready_to_conclude, :structured_output_json, :raw_response, :unseen_messages_consumed, :thread_id
          )`,
        )
        .run({
          conversation_id: input.conversationId,
          turn_number: input.turn.turnNumber,
          timestamp: input.timestamp,
          speaker: input.turn.speaker,
          answer: input.turn.answer,
          next_agent: input.turn.nextAgent,
          ready_to_conclude: input.turn.readyToConclude ? 1 : 0,
          structured_output_json:
            input.turn.structuredOutput === undefined
              ? null
              : JSON.stringify(input.turn.structuredOutput),
          raw_response: input.turn.rawResponse,
          unseen_messages_consumed: input.turn.unseenMessagesConsumed,
          thread_id: input.turn.threadId,
        });

      this.db
        .prepare(
          `UPDATE conversations
           SET updated_at = :updated_at,
               next_speaker = :next_speaker,
               turns_completed = :turns_completed,
               orchestrator_state_json = :orchestrator_state_json
           WHERE id = :id`,
        )
        .run({
          id: input.conversationId,
          updated_at: input.timestamp,
          next_speaker: input.turn.nextAgent,
          turns_completed: input.turn.turnNumber,
          orchestrator_state_json: JSON.stringify(input.stateSnapshot),
        });

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  saveConversationEnd(input: {
    conversationId: string;
    concluded: boolean;
    stopReason: ConversationResult["stopReason"];
    turnsCompleted: number;
    timestamp: string;
    stateSnapshot: OrchestratorStateSnapshot;
  }): void {
    this.db
      .prepare(
        `UPDATE conversations
         SET updated_at = :updated_at,
             status = 'completed',
             concluded = :concluded,
             stop_reason = :stop_reason,
             turns_completed = :turns_completed,
             orchestrator_state_json = :orchestrator_state_json
         WHERE id = :id`,
      )
      .run({
        id: input.conversationId,
        updated_at: input.timestamp,
        concluded: input.concluded ? 1 : 0,
        stop_reason: input.stopReason,
        turns_completed: input.turnsCompleted,
        orchestrator_state_json: JSON.stringify(input.stateSnapshot),
      });
  }

  getConversation(id: string): StoredConversation | null {
    const conversationRow = this.db
      .prepare(
        `SELECT
          id, created_at, updated_at, status,
          conversation_goal, first_speaker, next_speaker,
          max_turns, warning_turns_before_max, warning_start_turn,
          turns_completed, concluded, stop_reason, orchestrator_state_json
         FROM conversations
         WHERE id = ?`,
      )
      .get(id) as ConversationRow | undefined;

    if (!conversationRow) {
      return null;
    }

    const turnRows = this.db
      .prepare(
        `SELECT
          turn_number, timestamp, speaker, answer, next_agent, ready_to_conclude,
          structured_output_json, raw_response, unseen_messages_consumed, thread_id
         FROM conversation_turns
         WHERE conversation_id = ?
         ORDER BY turn_number ASC`,
      )
      .all(id) as TurnRow[];

    return {
      id: conversationRow.id,
      createdAt: conversationRow.created_at,
      updatedAt: conversationRow.updated_at,
      status: conversationRow.status === "completed" ? "completed" : "active",
      runInput: {
        conversationGoal: conversationRow.conversation_goal,
        firstSpeaker: conversationRow.first_speaker,
        maxTurns: conversationRow.max_turns,
        warningTurnsBeforeMax: conversationRow.warning_turns_before_max ?? undefined,
      },
      nextSpeaker: conversationRow.next_speaker,
      warningStartTurn: conversationRow.warning_start_turn,
      turnsCompleted: conversationRow.turns_completed,
      concluded: conversationRow.concluded === 1,
      stopReason: (conversationRow.stop_reason as ConversationResult["stopReason"] | null) ?? null,
      orchestratorState: JSON.parse(conversationRow.orchestrator_state_json) as OrchestratorStateSnapshot,
      turns: turnRows.map((row) => ({
        turnNumber: row.turn_number,
        speaker: row.speaker,
        answer: row.answer,
        nextAgent: row.next_agent,
        readyToConclude: row.ready_to_conclude === 1,
        structuredOutput: parseStructuredOutputJson(row.structured_output_json, row.turn_number),
        rawResponse: row.raw_response,
        unseenMessagesConsumed: row.unseen_messages_consumed,
        threadId: row.thread_id,
      })),
    };
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        status TEXT NOT NULL,
        conversation_goal TEXT NOT NULL,
        first_speaker TEXT NOT NULL,
        next_speaker TEXT NOT NULL,
        max_turns INTEGER NOT NULL,
        warning_turns_before_max INTEGER NULL,
        warning_start_turn INTEGER NOT NULL,
        turns_completed INTEGER NOT NULL,
        concluded INTEGER NOT NULL,
        stop_reason TEXT NULL,
        orchestrator_state_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_turns (
        conversation_id TEXT NOT NULL,
        turn_number INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        speaker TEXT NOT NULL,
        answer TEXT NOT NULL,
        next_agent TEXT NOT NULL,
        ready_to_conclude INTEGER NOT NULL,
        structured_output_json TEXT NULL,
        raw_response TEXT NOT NULL,
        unseen_messages_consumed INTEGER NOT NULL,
        thread_id TEXT NULL,
        PRIMARY KEY (conversation_id, turn_number)
      );
    `);

    this.ensureColumn("conversation_turns", "structured_output_json", "TEXT NULL");
  }

  private ensureColumn(tableName: string, columnName: string, columnDefinition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }
    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

function parseStructuredOutputJson(raw: string | null, turnNumber: number): unknown {
  if (raw === null) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `Failed to parse persisted structured_output_json for turn ${turnNumber}. Data may be corrupted.`,
    );
  }
}
