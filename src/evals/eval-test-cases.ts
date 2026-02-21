export type EvalTestCase = {
  id: string;
  prompt: string;
};

export const BASE_PROMPT_TEST_CASES: EvalTestCase[] = [
  {
    id: "monolith-migration",
    prompt: "Plan how we migrate a monolith to services with low risk.",
  },
  {
    id: "incident-response",
    prompt:
      "Design an incident response protocol for a payments API that must reduce MTTR while meeting compliance.",
  },
  {
    id: "ai-support-rollout",
    prompt:
      "Create a staged rollout plan for adding an AI support assistant to a SaaS product without hurting support quality.",
  },
  {
    id: "fraud-controls",
    prompt:
      "Propose an anti-fraud architecture for high-traffic voting with strong abuse resistance and clear rollback controls.",
  },
  {
    id: "data-governance",
    prompt:
      "Design a practical data governance rollout for 12 engineering teams, with ownership model, metrics, and enforcement.",
  },
];
