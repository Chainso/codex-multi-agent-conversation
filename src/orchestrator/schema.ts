export const EMBEDDED_STRUCTURED_OUTPUT_KEY = "structuredOutput";

type EmbeddedTurnSchema = {
  schema: Record<string, unknown>;
  required: boolean;
};

export function createTurnOutputSchema(
  nextAgentCandidates: string[],
  embeddedStructuredOutput?: EmbeddedTurnSchema,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    answer: { type: "string" },
    nextAgent: { type: "string", enum: nextAgentCandidates },
    readyToConclude: { type: "boolean" },
  };
  const required = ["answer", "nextAgent", "readyToConclude"];

  if (embeddedStructuredOutput) {
    properties[EMBEDDED_STRUCTURED_OUTPUT_KEY] = embeddedStructuredOutput.schema;
    if (embeddedStructuredOutput.required) {
      required.push(EMBEDDED_STRUCTURED_OUTPUT_KEY);
    }
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}
