import type { OrchestratorHooks } from "../orchestrator.js";
import type { RunConversationInput } from "../orchestrator.js";
import { SqliteConversationStore } from "./sqlite-conversation-store.js";

export function createPersistenceHooks(input: {
  store: SqliteConversationStore;
  conversationId: string;
  mode: "create" | "resume";
}): OrchestratorHooks {
  return {
    onConversationStart: (context) => {
      if (input.mode === "create") {
        input.store.createConversation({
          id: input.conversationId,
          runInput: toRunInput(context),
          resolvedMaxTurns: context.maxTurns,
          startingTurnNumber: context.startingTurnNumber,
          warningStartTurn: context.warningStartTurn,
          nextSpeaker: context.firstSpeaker,
          timestamp: context.timestamp,
          stateSnapshot: context.stateSnapshot,
        });
        return;
      }

      input.store.markConversationActive({
        conversationId: input.conversationId,
        nextSpeaker: context.firstSpeaker,
        timestamp: context.timestamp,
        stateSnapshot: context.stateSnapshot,
      });
    },
    onBeforeTurn: (context) => {
      input.store.saveBeforeTurn({
        conversationId: input.conversationId,
        turnNumber: context.turnNumber,
        speaker: context.speaker,
        timestamp: context.timestamp,
        stateSnapshot: context.stateSnapshot,
      });
    },
    onTurnCompleted: (context) => {
      input.store.saveTurnCompleted({
        conversationId: input.conversationId,
        turn: context.turn,
        timestamp: context.timestamp,
        stateSnapshot: context.stateSnapshot,
      });
    },
    onConversationEnd: (context) => {
      input.store.saveConversationEnd({
        conversationId: input.conversationId,
        concluded: context.concluded,
        stopReason: context.stopReason,
        turnsCompleted: context.turnsCompleted,
        timestamp: context.timestamp,
        stateSnapshot: context.stateSnapshot,
      });
    },
  };
}

function toRunInput(context: {
  conversationGoal: string;
  firstSpeaker: string;
  maxTurns: number;
  warningTurnsBeforeMax?: number;
}): RunConversationInput {
  return {
    conversationGoal: context.conversationGoal,
    firstSpeaker: context.firstSpeaker,
    maxTurns: context.maxTurns,
    warningTurnsBeforeMax: context.warningTurnsBeforeMax,
  };
}
