import { parseDocument } from "yaml";

export interface ParsedSkillFile {
  original: string;
  header: string;
  headerStart: number;
  headerEnd: number;
  name: string;
  description: string;
  descriptionZh?: string;
  newline: "\n" | "\r\n";
}

interface FieldSpan {
  start: number;
  end: number;
}

function getFieldSpan(header: string, fieldName: string): FieldSpan | undefined {
  const fields: { name: string; start: number }[] = [];
  const pattern = /^(?:([A-Za-z_][\w-]*)|"([^"]+)"|'([^']+)')\s*:/gm;

  for (const match of header.matchAll(pattern)) {
    fields.push({
      name: match[1] ?? match[2] ?? match[3],
      start: match.index,
    });
  }

  const index = fields.findIndex((field) => field.name === fieldName);
  if (index === -1) {
    return undefined;
  }

  return {
    start: fields[index].start,
    end: fields[index + 1]?.start ?? header.length,
  };
}

export function parseSkillFile(original: string): ParsedSkillFile {
  const match = original.match(
    /^(\uFEFF?---(\r?\n))([\s\S]*?)(\r?\n---(?:\r?\n|$))/,
  );
  if (!match) {
    throw new Error("文件缺少合法的 YAML frontmatter");
  }

  const newline = match[2] as "\n" | "\r\n";
  const header = match[3];
  const document = parseDocument(header);
  if (document.errors.length > 0) {
    throw new Error(`YAML 解析失败: ${document.errors[0].message}`);
  }

  const data = document.toJS() as Record<string, unknown>;
  if (typeof data.name !== "string" || data.name.trim() === "") {
    throw new Error("frontmatter 缺少 name");
  }
  if (typeof data.description !== "string" || data.description.trim() === "") {
    throw new Error("frontmatter 缺少 description");
  }
  if (
    data.description_zh !== undefined &&
    typeof data.description_zh !== "string"
  ) {
    throw new Error("description_zh 必须是字符串");
  }

  const headerStart = match[1].length;

  return {
    original,
    header,
    headerStart,
    headerEnd: headerStart + header.length,
    name: data.name,
    description: data.description.trim(),
    descriptionZh: data.description_zh?.trim(),
    newline,
  };
}

export function setChineseDescription(
  parsed: ParsedSkillFile,
  translation: string,
): string {
  const value = translation.trim();
  if (value === "") {
    throw new Error("中文介绍不能为空");
  }

  const line = `description_zh: ${JSON.stringify(value)}`;
  const existing = getFieldSpan(parsed.header, "description_zh");
  let headerWithoutChinese = parsed.header;
  if (existing) {
    let prefix = parsed.header.slice(0, existing.start);
    const suffix = parsed.header.slice(existing.end);
    if (suffix === "" && prefix.endsWith(parsed.newline)) {
      prefix = prefix.slice(0, -parsed.newline.length);
    }
    headerWithoutChinese = prefix + suffix;
  }
  const description = getFieldSpan(headerWithoutChinese, "description");
  if (!description) {
    throw new Error("无法定位 description 字段");
  }
  const header =
    headerWithoutChinese.slice(0, description.start) +
    line +
    parsed.newline +
    headerWithoutChinese.slice(description.start);

  return (
    parsed.original.slice(0, parsed.headerStart) +
    header +
    parsed.original.slice(parsed.headerEnd)
  );
}
