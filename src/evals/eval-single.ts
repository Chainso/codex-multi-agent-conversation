import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { runConversationForPrompt } from "../conversation-runner.js";
import { createEvalReportPath, createRunStamp } from "../path-utils.js";
import { evaluateConversation } from "./qa-evaluator.js";

const prompt =
  process.argv.slice(2).join(" ").trim() ||
  "Plan how we migrate a monolith to services with low risk";

const runStamp = createRunStamp();
const conversationModel = process.env.CONVERSATION_MODEL;
const qaModel = process.env.QA_MODEL;
const codexPathOverride = process.env.CODEX_PATH_OVERRIDE;
const conversationRun = await runConversationForPrompt({
  prompt,
  runStamp,
  logLabel: "single",
  maxTurns: 50,
  model: conversationModel,
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
  conversationLogPath: conversationRun.logFilePath,
  turns: conversationRun.conversation.turns.length,
  concluded: conversationRun.conversation.concluded,
  stopReason: conversationRun.conversation.stopReason,
  conversationModel: conversationModel ?? null,
  qaModel: qaModel ?? null,
  codexPathOverride: codexPathOverride ?? null,
  qa,
};

const reportPath = createEvalReportPath({ runStamp, baseDir: "logs/evals" });
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(report, null, 2));
console.log(`Report file: ${reportPath}`);
