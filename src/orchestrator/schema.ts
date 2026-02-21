export function createTurnOutputSchema(nextAgentCandidates: string[]): Record<string, unknown> {
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
