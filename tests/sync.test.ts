import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { syncSkills } from "../src/sync.js";

const makeTempRoot = () => mkdtemp(path.join(tmpdir(), "skill-zh-sync-"));

async function addSkill(
  root: string,
  name: string,
  description = "English description.",
  extra = "",
): Promise<string> {
  const directory = path.join(root, name);
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(directory, { recursive: true }),
  );
  const skillPath = path.join(directory, "SKILL.md");
  await writeFile(
    skillPath,
    `---\nname: ${name}\ndescription: ${description}\n---\n${extra}`,
    "utf8",
  );
  return skillPath;
}

describe("syncSkills", () => {
  it("previews changes without writing files or cache", async () => {
    const root = await makeTempRoot();
    const skillPath = await addSkill(root, "demo");
    const cachePath = path.join(root, "cache.json");

    const report = await syncSkills({
      root,
      cachePath,
      write: false,
      translator: async () => "中文介绍",
    });

    assert.equal(report.changed.length, 1);
    assert.match(report.changed[0].diff, /\+description_zh: "中文介绍"/);
    assert.doesNotMatch(await readFile(skillPath, "utf8"), /description_zh/);
    await assert.rejects(readFile(cachePath, "utf8"));
  });

  it("writes a translation and skips an unchanged managed translation", async () => {
    const root = await makeTempRoot();
    const skillPath = await addSkill(root, "demo");
    const cachePath = path.join(root, "cache.json");
    let translations = 0;
    const translator = async () => {
      translations += 1;
      return "中文介绍";
    };

    await syncSkills({ root, cachePath, write: true, translator });
    const first = await readFile(skillPath, "utf8");
    const secondReport = await syncSkills({ root, cachePath, write: true, translator });

    assert.match(first, /description_zh: "中文介绍"/);
    assert.equal(await readFile(skillPath, "utf8"), first);
    assert.equal(translations, 1);
    assert.equal(secondReport.skipped[0].reason, "中文介绍已是最新");
  });

  it("moves a managed Chinese description above English without translating again", async () => {
    const root = await makeTempRoot();
    const skillPath = await addSkill(root, "demo");
    const cachePath = path.join(root, "cache.json");
    await syncSkills({
      root,
      cachePath,
      write: true,
      translator: async () => "中文介绍",
    });
    await writeFile(
      skillPath,
      '---\nname: demo\ndescription: English description.\ndescription_zh: "中文介绍"\n---\n',
      "utf8",
    );
    let translations = 0;

    const report = await syncSkills({
      root,
      cachePath,
      write: true,
      translator: async () => {
        translations += 1;
        return "不应调用";
      },
    });

    assert.equal(translations, 0);
    assert.equal(report.changed.length, 1);
    assert.equal(
      await readFile(skillPath, "utf8"),
      '---\nname: demo\ndescription_zh: "中文介绍"\ndescription: English description.\n---\n',
    );
  });

  it("preserves an unmanaged Chinese translation unless forced", async () => {
    const root = await makeTempRoot();
    const skillPath = await addSkill(root, "demo");
    const cachePath = path.join(root, "cache.json");
    await writeFile(
      skillPath,
      '---\nname: demo\ndescription_zh: "人工翻译"\ndescription: English\n---\n',
      "utf8",
    );

    const skipped = await syncSkills({
      root,
      cachePath,
      write: true,
      translator: async () => "自动翻译",
    });
    assert.equal(skipped.skipped[0].reason, "保留未纳入缓存的人工翻译");

    await syncSkills({
      root,
      cachePath,
      write: true,
      force: true,
      translator: async () => "自动翻译",
    });
    assert.match(await readFile(skillPath, "utf8"), /description_zh: "自动翻译"/);
  });

  it("refreshes a managed translation after the English source changes", async () => {
    const root = await makeTempRoot();
    const skillPath = await addSkill(root, "demo");
    const cachePath = path.join(root, "cache.json");

    await syncSkills({
      root,
      cachePath,
      write: true,
      translator: async () => "第一版",
    });
    await writeFile(
      skillPath,
      (await readFile(skillPath, "utf8")).replace(
        "English description.",
        "Changed English description.",
      ),
      "utf8",
    );
    await syncSkills({
      root,
      cachePath,
      write: true,
      translator: async () => "第二版",
    });

    assert.match(await readFile(skillPath, "utf8"), /description_zh: "第二版"/);
  });

  it("skips generated skill files", async () => {
    const root = await makeTempRoot();
    const skillPath = await addSkill(
      root,
      "generated",
      "English.",
      "<!-- AUTO-GENERATED -->\n",
    );
    await writeFile(skillPath, `\uFEFF${await readFile(skillPath, "utf8")}`, "utf8");

    const report = await syncSkills({
      root,
      cachePath: path.join(root, "cache.json"),
      write: true,
      translator: async () => "不会使用",
    });

    assert.equal(report.skipped[0].reason, "跳过自动生成或禁止编辑的文件");
  });

  it("does not parse unrelated files when skill names limit the run", async () => {
    const root = await makeTempRoot();
    await addSkill(root, "selected");
    const unrelated = await addSkill(root, "unrelated");
    await writeFile(unrelated, "not frontmatter", "utf8");

    const report = await syncSkills({
      root,
      cachePath: path.join(root, "cache.json"),
      write: false,
      skillNames: ["selected"],
      translator: async () => "中文介绍",
    });

    assert.equal(report.changed.length, 1);
    assert.equal(report.failed.length, 0);
  });
});
