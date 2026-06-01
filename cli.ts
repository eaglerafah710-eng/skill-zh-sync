#!/usr/bin/env node
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { syncSkills } from "./src/sync.js";
import {
  createOllamaTranslator,
  createOpenAiCompatibleTranslator,
} from "./src/translators.js";

const help = `skill-zh-sync

翻译 SKILL.md frontmatter 中的 description，并预览或写入 description_zh。

Usage:
  node dist/cli.js [options]

Options:
  --provider <ollama|openai-compatible>  翻译服务，默认 ollama
  --model <name>                         模型名称
  --base-url <url>                       翻译服务地址
  --root <path>                          技能根目录
  --skill <name>                         仅处理指定技能，可重复传入
  --cache-path <path>                    外部缓存文件
  --write                                确认写入，默认仅预览
  --force                                覆盖已有中文介绍
  --help                                 显示帮助
`;

export async function main(args = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      provider: { type: "string", default: "ollama" },
      model: { type: "string" },
      "base-url": { type: "string" },
      root: { type: "string" },
      skill: { type: "string", multiple: true },
      "cache-path": { type: "string" },
      write: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(help);
    return 0;
  }

  const provider = values.provider;
  let translator;
  if (provider === "ollama") {
    const model = values.model;
    if (!model) {
      throw new Error("使用 Ollama 时必须传入 --model");
    }
    translator = createOllamaTranslator({
      model,
      baseUrl: values["base-url"] ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
    });
  } else if (provider === "openai-compatible") {
    const apiKey = process.env.SKILL_ZH_OPENAI_API_KEY;
    const model = values.model ?? process.env.SKILL_ZH_OPENAI_MODEL;
    if (!apiKey || !model) {
      throw new Error(
        "使用 OpenAI 兼容服务时必须设置 SKILL_ZH_OPENAI_API_KEY 和模型名",
      );
    }
    translator = createOpenAiCompatibleTranslator({
      apiKey,
      model,
      baseUrl:
        values["base-url"] ??
        process.env.SKILL_ZH_OPENAI_BASE_URL ??
        "https://api.openai.com",
    });
  } else {
    throw new Error(`不支持的 provider: ${provider}`);
  }

  const root = path.resolve(values.root ?? path.join(homedir(), ".codex", "skills"));
  const cachePath = path.resolve(
    values["cache-path"] ?? path.join(homedir(), ".skill-zh-sync", "cache.json"),
  );
  const report = await syncSkills({
    root,
    cachePath,
    translator,
    write: values.write,
    force: values.force,
    skillNames: values.skill,
  });

  for (const item of report.changed) {
    console.log(item.diff);
    console.log();
  }
  for (const item of report.skipped) {
    console.log(`[跳过] ${item.path}: ${item.reason}`);
  }
  for (const item of report.failed) {
    console.error(`[失败] ${item.path}: ${item.reason}`);
  }

  const mode = values.write ? "已写入" : "仅预览";
  console.log(
    `[汇总] ${mode}: ${report.changed.length} 个变更，${report.skipped.length} 个跳过，${report.failed.length} 个失败`,
  );
  return report.failed.length > 0 ? 1 : 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
