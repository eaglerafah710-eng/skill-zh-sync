export type Translator = (english: string) => Promise<string>;

interface OllamaOptions {
  baseUrl: string;
  model: string;
}

interface OpenAiCompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const systemPrompt =
  "将英文 skill 功能介绍翻译为简洁、准确的简体中文。保留技术术语、命令名和产品名。只返回翻译结果，不要解释。";

function endpoint(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${pathname}`;
}

function cleanTranslation(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("模型返回内容不是字符串");
  }

  let translation = value.trim();
  if (
    translation.length >= 2 &&
    ((translation.startsWith('"') && translation.endsWith('"')) ||
      (translation.startsWith("'") && translation.endsWith("'")))
  ) {
    translation = translation.slice(1, -1).trim();
  }
  if (translation === "") {
    throw new Error("模型返回了空翻译");
  }
  return translation;
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`翻译服务请求失败: HTTP ${response.status}`);
  }
  return response.json();
}

export function createOllamaTranslator(options: OllamaOptions): Translator {
  return async (english) => {
    const response = (await postJson(endpoint(options.baseUrl, "/api/chat"), {
      model: options.model,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: english },
      ],
    })) as { message?: { content?: unknown } };

    return cleanTranslation(response.message?.content);
  };
}

export function createOpenAiCompatibleTranslator(
  options: OpenAiCompatibleOptions,
): Translator {
  return async (english) => {
    const response = (await postJson(
      endpoint(options.baseUrl, "/v1/chat/completions"),
      {
        model: options.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: english },
        ],
      },
      { authorization: `Bearer ${options.apiKey}` },
    )) as { choices?: { message?: { content?: unknown } }[] };

    return cleanTranslation(response.choices?.[0]?.message?.content);
  };
}
