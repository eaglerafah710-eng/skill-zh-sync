import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSkillFile, setChineseDescription } from "../src/frontmatter.js";

describe("frontmatter", () => {
  const cases = [
    ["plain", "description: Translate a short sentence.\n"],
    ["quoted", 'description: "Translate a quoted sentence."\n'],
    ["literal block", "description: |\n  Translate a literal\n  block sentence.\n"],
    ["folded block", "description: >\n  Translate a folded\n  block sentence.\n"],
  ] as const;

  for (const [label, description] of cases) {
    it(`reads and updates a ${label} description without reformatting it`, () => {
      const original = `---\nname: demo\n${description}license: MIT\n---\n\n# Demo\n`;
      const parsed = parseSkillFile(original);
      const updated = setChineseDescription(parsed, "中文介绍");

      assert.match(parsed.description, /^Translate a/);
      assert.equal(
        updated,
        original.replace(description, `description_zh: "中文介绍"\n${description}`),
      );
    });
  }

  it("replaces an existing Chinese field without changing surrounding fields", () => {
    const original =
      '---\nname: demo\ndescription: English\ndescription_zh: "旧内容"\nlicense: MIT\n---\n';

    assert.equal(
      setChineseDescription(parseSkillFile(original), "新内容"),
      '---\nname: demo\ndescription_zh: "新内容"\ndescription: English\nlicense: MIT\n---\n',
    );
  });

  it("accepts a UTF-8 BOM before frontmatter", () => {
    const original = "\uFEFF---\nname: demo\ndescription: English\n---\n";

    assert.equal(parseSkillFile(original).description, "English");
  });

  it("updates a final folded description when the body uses different newlines", () => {
    const original =
      "---\nname: demo\ndescription: >\n  Folded description.\n---\r\n\r\n# Demo\r\n";

    assert.equal(
      setChineseDescription(parseSkillFile(original), "中文介绍"),
      '---\nname: demo\ndescription_zh: "中文介绍"\ndescription: >\n  Folded description.\n---\r\n\r\n# Demo\r\n',
    );
  });
});
