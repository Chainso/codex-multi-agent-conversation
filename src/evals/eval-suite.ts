import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { runConversationForPrompt } from "../conversation-runner.js";
import { BASE_PROMPT_TEST_CASES } from "./eval-test-cases.js";
import { createEvalReportPath, createRunStamp, slugify } from "../path-utils.js";
import { evaluateConversation } from "./qa-evaluator.js";

type EvalCaseResult = {
  id: string;
  prompt: string;
  conversationLogPath: string;
  turns: number;
  concluded: boolean;
  stopReason: "all_agents_ready" | "max_turns_reached";
  qa: {
    score: number;
    reason: string;
  };
};

const concurrency = parsePositiveInt(process.env.EVAL_CONCURRENCY, 3);
const runStamp = createRunStamp();
const suiteConversationDir = join("logs/conversations", `suite-${runStamp}`);
const conversationModel = process.env.CONVERSATION_MODEL;
const qaModel = process.env.QA_MODEL;
const codexPathOverride = process.env.CODEX_PATH_OVERRIDE;
const warningTurnsBeforeMax = parseNonNegativeInt(process.env.WARNING_TURNS_BEFORE_MAX);

const results = await runWithConcurrency(BASE_PROMPT_TEST_CASES, concurrency, async (testCase) => {
  const caseLabel = slugify(testCase.id);
  const conversationLogPath = join(suiteConversationDir, `${caseLabel}.md`);

  const conversationRun = await runConversationForPrompt({
    prompt: testCase.prompt,
    logFilePath: conversationLogPath,
    maxTurns: 50,
    warningTurnsBeforeMax,
    model: conversationModel,
    codexPathOverride,
  });

  const qa = await evaluateConversation({
    initialPrompt: testCase.prompt,
    conversationLogPath,
    codexOptions: codexPathOverride
      ? {
          codexPathOverride,
        }
      : undefined,
    threadOptions: qaModel ? { model: qaModel } : undefined,
  });

  const result: EvalCaseResult = {
    id: testCase.id,
    prompt: testCase.prompt,
    conversationLogPath,
    turns: conversationRun.conversation.turns.length,
    concluded: conversationRun.conversation.concluded,
    stopReason: conversationRun.conversation.stopReason,
    qa,
  };
  return result;
});

const sortedResults = [...results].sort((a, b) => a.id.localeCompare(b.id));
const averageScore =
  sortedResults.reduce((sum, item) => sum + item.qa.score, 0) / Math.max(sortedResults.length, 1);

const report = {
  runStamp,
  concurrency,
  conversationModel: conversationModel ?? null,
  qaModel: qaModel ?? null,
  codexPathOverride: codexPathOverride ?? null,
  warningTurnsBeforeMax: warningTurnsBeforeMax ?? null,
  cases: sortedResults.length,
  averageScore,
  results: sortedResults,
};

const reportPath = createEvalReportPath({ runStamp, baseDir: "logs/evals" });
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Suite run stamp: ${runStamp}`);
console.log(`Cases: ${sortedResults.length}`);
console.log(`Average QA score: ${averageScore.toFixed(2)} / 10`);
for (const result of sortedResults) {
  console.log(
    `${result.id}: score=${result.qa.score.toFixed(2)} turns=${result.turns} stop=${result.stopReason}`,
  );
  console.log(`  log=${result.conversationLogPath}`);
}
console.log(`Report file: ${reportPath}`);

async function runWithConcurrency<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  if (limit <= 0) {
    throw new Error("Concurrency limit must be > 0.");
  }

  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await worker(items[current], current);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseNonNegativeInt(rawValue: string | undefined): number | undefined {
  if (!rawValue) {
    return undefined;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("WARNING_TURNS_BEFORE_MAX must be a non-negative integer.");
  }
  return parsed;
}
