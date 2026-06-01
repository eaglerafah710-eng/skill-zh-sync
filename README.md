# skill-zh-sync

将 `SKILL.md` frontmatter 中的英文 `description` 翻译为简体中文，并在其上方定点插入或更新 `description_zh`。

默认只输出预览 diff。确认内容后，追加 `--write` 才会修改技能文件并更新外部缓存。

## 使用 Ollama

```powershell
npm install
npm run build
node dist/cli.js `
  --provider ollama `
  --model gemma4:e4b `
  --skill api-design `
  --skill gh-fix-ci `
  --skill chinese-paper-format
```

## 使用 OpenAI 兼容服务

```powershell
$env:SKILL_ZH_OPENAI_API_KEY = "<api-key>"
$env:SKILL_ZH_OPENAI_BASE_URL = "https://example.com"
$env:SKILL_ZH_OPENAI_MODEL = "<model-name>"
node dist/cli.js --provider openai-compatible --skill api-design
```

## 常用参数

```text
--root <path>        默认 %USERPROFILE%\.codex\skills
--skill <name>       仅处理指定技能，可重复传入
--cache-path <path>  默认 %USERPROFILE%\.skill-zh-sync\cache.json
--write              将预览内容写入文件
--force              覆盖已有中文介绍
```

工具默认跳过带有 `AUTO-GENERATED` 或 `do not edit` 标记的文件。已有但未被缓存记录的 `description_zh` 会被视为人工翻译并保留。
