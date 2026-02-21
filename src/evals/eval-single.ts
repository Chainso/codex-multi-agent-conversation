import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { runConversationForPrompt } from "../conversation-runner.js";
import { parseAgentModelsJson } from "../agent-models.js";
import { createEvalReportPath, createRunStamp } from "../path-utils.js";
import { evaluateConversation } from "./qa-evaluator.js";

const prompt =
  process.argv.slice(2).join(" ").trim() ||
  "Plan how we migrate a monolith to services with low risk";

const runStamp = createRunStamp();
const conversationModel = process.env.CONVERSATION_MODEL;
const qaModel = process.env.QA_MODEL;
const codexPathOverride = process.env.CODEX_PATH_OVERRIDE;
const warningTurnsBeforeMax = parseNonNegativeInt(process.env.WARNING_TURNS_BEFORE_MAX);
const sqlitePath = process.env.CONVERSATIONS_DB_PATH;
const agentModels = parseAgentModelsJson(process.env.AGENT_MODELS_JSON);
const conversationRun = await runConversationForPrompt({
  prompt,
  sqlitePath,
  runStamp,
  logLabel: "single",
  maxTurns: 50,
  warningTurnsBeforeMax,
  model: conversationModel,
  agentModels,
  codexPathOverride,
});

const qa = await evaluateConversation({
  initialPrompt: prompt,
  conversationLogPath: conversationRun.logFilePath,
  codexOptions: codexPathOverride
    ? {
        codexPathOverride,
      }
    : undefined,
  threadOptions: qaModel ? { model: qaModel } : undefined,
});

const report = {
  prompt,
  runStamp,
  conversationId: conversationRun.conversationId,
  sqlitePath: conversationRun.sqlitePath,
  conversationLogPath: conversationRun.logFilePath,
  turns: conversationRun.conversation.turns.length,
  concluded: conversationRun.conversation.concluded,
  stopReason: conversationRun.conversation.stopReason,
  conversationModel: conversationModel ?? null,
  agentModels: agentModels ?? null,
  qaModel: qaModel ?? null,
  codexPathOverride: codexPathOverride ?? null,
  warningTurnsBeforeMax: warningTurnsBeforeMax ?? null,
  qa,
};

const reportPath = createEvalReportPath({ runStamp, baseDir: "logs/evals" });
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(report, null, 2));
console.log(`Report file: ${reportPath}`);

function parseNonNegativeInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("WARNING_TURNS_BEFORE_MAX must be a non-negative integer.");
  }
  return parsed;
}
