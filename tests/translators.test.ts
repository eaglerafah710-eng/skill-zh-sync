import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { afterEach, describe, it } from "node:test";

import {
  createOllamaTranslator,
  createOpenAiCompatibleTranslator,
} from "../src/translators.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

async function startServer(
  handler: RequestListener,
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

describe("translation adapters", () => {
  it("calls Ollama chat API", async () => {
    const baseUrl = await startServer((request, response) => {
      assert.equal(request.url, "/api/chat");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ message: { content: '"中文介绍"' } }));
    });

    const translate = createOllamaTranslator({ baseUrl, model: "demo-model" });
    assert.equal(await translate("English"), "中文介绍");
  });

  it("calls an OpenAI-compatible chat completions API with bearer auth", async () => {
    const baseUrl = await startServer((request, response) => {
      assert.equal(request.url, "/v1/chat/completions");
      assert.equal(request.headers.authorization, "Bearer secret");
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({ choices: [{ message: { content: "中文介绍" } }] }),
      );
    });

    const translate = createOpenAiCompatibleTranslator({
      apiKey: "secret",
      baseUrl,
      model: "demo-model",
    });
    assert.equal(await translate("English"), "中文介绍");
  });
});
