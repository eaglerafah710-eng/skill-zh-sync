import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { parseSkillFile, setChineseDescription } from "./frontmatter.js";
import type { Translator } from "./translators.js";

interface CacheEntry {
  sourceHash: string;
  translation: string;
  updatedAt: string;
}

interface TranslationCache {
  version: 1;
  entries: Record<string, CacheEntry>;
}

export interface SyncOptions {
  root: string;
  cachePath: string;
  translator: Translator;
  write: boolean;
  force?: boolean;
  skillNames?: string[];
}

interface ChangedSkill {
  path: string;
  diff: string;
}

interface ReportItem {
  path: string;
  reason: string;
}

export interface SyncReport {
  changed: ChangedSkill[];
  skipped: ReportItem[];
  failed: ReportItem[];
}

function hashDescription(description: string): string {
  return createHash("sha256").update(description).digest("hex");
}

function relativeKey(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

async function listSkillFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return listSkillFiles(entryPath);
      }
      return entry.isFile() && entry.name === "SKILL.md" ? [entryPath] : [];
    }),
  );
  return files.flat().sort();
}

async function readCache(cachePath: string): Promise<TranslationCache> {
  try {
    const parsed = JSON.parse(await readFile(cachePath, "utf8")) as TranslationCache;
    if (parsed.version !== 1 || typeof parsed.entries !== "object") {
      throw new Error("缓存格式不受支持");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, entries: {} };
    }
    throw error;
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

function makeDiff(
  filePath: string,
  oldTranslation: string | undefined,
  translation: string,
): string {
  const quoted = JSON.stringify(translation);
  const lines = [`--- ${filePath}`, `+++ ${filePath}`, "@@ frontmatter @@"];
  if (oldTranslation === translation) {
    lines.push(`~description_zh: ${quoted} (移动到 description 上方)`);
    return lines.join("\n");
  }
  if (oldTranslation !== undefined) {
    lines.push(`-description_zh: ${JSON.stringify(oldTranslation)}`);
  }
  lines.push(`+description_zh: ${quoted}`);
  return lines.join("\n");
}

export async function syncSkills(options: SyncOptions): Promise<SyncReport> {
  const report: SyncReport = { changed: [], skipped: [], failed: [] };
  const cache = await readCache(options.cachePath);
  const selected = new Set(options.skillNames ?? []);
  let cacheChanged = false;

  for (const filePath of await listSkillFiles(options.root)) {
    try {
      const directoryName = path.basename(path.dirname(filePath));
      if (selected.size > 0 && !selected.has(directoryName)) {
        continue;
      }

      const original = await readFile(filePath, "utf8");
      if (/AUTO-GENERATED|do not edit/i.test(original)) {
        report.skipped.push({
          path: filePath,
          reason: "跳过自动生成或禁止编辑的文件",
        });
        continue;
      }

      const parsed = parseSkillFile(original);
      const key = relativeKey(options.root, filePath);
      const cached = cache.entries[key];
      const sourceHash = hashDescription(parsed.description);

      if (parsed.descriptionZh && !cached && !options.force) {
        const updated = setChineseDescription(parsed, parsed.descriptionZh);
        if (updated === original) {
          report.skipped.push({
            path: filePath,
            reason: "保留未纳入缓存的人工翻译",
          });
        } else {
          report.changed.push({
            path: filePath,
            diff: makeDiff(filePath, parsed.descriptionZh, parsed.descriptionZh),
          });
          if (options.write) {
            await atomicWrite(filePath, updated);
          }
        }
        continue;
      }

      if (
        parsed.descriptionZh &&
        cached?.sourceHash === sourceHash &&
        !options.force
      ) {
        const updated = setChineseDescription(parsed, parsed.descriptionZh);
        if (updated === original) {
          report.skipped.push({ path: filePath, reason: "中文介绍已是最新" });
        } else {
          report.changed.push({
            path: filePath,
            diff: makeDiff(filePath, parsed.descriptionZh, parsed.descriptionZh),
          });
          if (options.write) {
            await atomicWrite(filePath, updated);
          }
        }
        continue;
      }

      const translation = (await options.translator(parsed.description)).trim();
      if (translation === "") {
        throw new Error("模型返回了空翻译");
      }
      const updated = setChineseDescription(parsed, translation);

      report.changed.push({
        path: filePath,
        diff: makeDiff(filePath, parsed.descriptionZh, translation),
      });

      if (options.write) {
        await atomicWrite(filePath, updated);
        cache.entries[key] = {
          sourceHash,
          translation,
          updatedAt: new Date().toISOString(),
        };
        cacheChanged = true;
      }
    } catch (error) {
      report.failed.push({
        path: filePath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (options.write && cacheChanged) {
    await atomicWrite(options.cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  }

  return report;
}
