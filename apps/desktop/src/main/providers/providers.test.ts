import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiAdapter, validateBaseUrl } from "./api";
import { cliArgs, cliEnvironment, findCli, runCli } from "./cli";
import { createProviderRegistry } from "./index";
import { chatRequestSchema } from "../../shared/domain";
const request = {
  ...chatRequestSchema.parse({
    requestId: "00000000-0000-4000-8000-000000000001",
    conversationId: "00000000-0000-4000-8000-000000000002",
    documentId: "00000000-0000-4000-8000-000000000003",
    providerId: "openai-api",
    modelId: "custom-model",
    userMessage: "Question",
  }),
  prompt: "Selected passage",
};
afterEach(() => vi.unstubAllEnvs());
it("rejects insecure remote endpoints and credential-bearing URLs", () => {
  for (const url of [
    "http://example.com/v1",
    "https://key@example.com",
    "file:///tmp",
    "http://localhost.evil/v1",
  ])
    expect(() => validateBaseUrl(url)).toThrow();
  expect(validateBaseUrl("http://localhost:123/v1/")).toBe(
    "http://localhost:123/v1",
  );
  expect(validateBaseUrl("https://example.com/v1")).toBe(
    "https://example.com/v1",
  );
});
it("scrubs inherited tokens and supplies shell-free restricted CLI argv", () => {
  const env = cliEnvironment({
    HOME: "/home/test",
    PATH: "/usr/bin",
    OPENAI_API_KEY: "secret",
    NODE_OPTIONS: "--require evil",
    CLAUDECODE: "nested",
  });
  expect(env.HOME).toBe("/home/test");
  expect(env.OPENAI_API_KEY).toBeUndefined();
  expect(env.NODE_OPTIONS).toBeUndefined();
  expect(cliArgs("claude", "default")).toContain("--tools");
  expect(cliArgs("codex", "default")).toContain("read-only");
});
it("sends assembled prompt and key only in main HTTP request and lists custom model ids", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "custom-model" }] })),
    )
    .mockResolvedValueOnce(
      new Response(
        'data: {"choices":[{"delta":{"content":"yes"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
  const adapter = createApiAdapter(
    () => ({ id: "openai-api", kind: "api", enabled: true }),
    { getInMainOnly: () => "private-key" },
    fetcher,
  );
  expect(await adapter.listModels()).toEqual([
    { id: "custom-model", name: "custom-model" },
  ]);
  expect(
    await collect(adapter.stream(request, new AbortController().signal)),
  ).toEqual([{ type: "text-delta", text: "yes" }, { type: "done" }]);
  expect(fetcher.mock.calls[1]?.[1]?.body).toContain("Selected passage");
});
it("rejects truncated HTTP streams", async () => {
  const adapter = createApiAdapter(
    () => ({ id: "openai-api", kind: "api", enabled: true }),
    { getInMainOnly: () => "key" },
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('data: {"choices":[]}\n\n')),
  );
  await expect(
    collect(adapter.stream(request, new AbortController().signal)),
  ).rejects.toThrow("unexpectedly");
});
it("only enables fake in explicit E2E mode", async () => {
  const secrets = {
    getInMainOnly: () => null,
    has: () => false,
    set: () => {},
    delete: () => {},
  };
  vi.stubEnv("VSTUDY_FAKE_PROVIDER", "0");
  expect(
    await createProviderRegistry(secrets).get("anthropic-api").detect(),
  ).toEqual({ available: false, reason: "Add an API key" });
  vi.stubEnv("VSTUDY_FAKE_PROVIDER", "1");
  const fake = createProviderRegistry(secrets).get("anthropic-api");
  const events = await collect(
    fake.stream(request, new AbortController().signal),
  );
  expect(events).toContainEqual({
    type: "text-delta",
    text: "Selected passage",
  });
});
it("kills a real subprocess on abort and on timeout", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "vstudy-cli-test-"));
  try {
    const controller = new AbortController();
    const aborted = collect(
      runCli(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000)"],
        "",
        cwd,
        "codex",
        controller.signal,
      ),
    );
    setTimeout(() => controller.abort(), 50);
    await expect(aborted).rejects.toThrow();
    await expect(
      collect(
        runCli(
          process.execPath,
          ["-e", "setInterval(() => {}, 1000)"],
          "",
          cwd,
          "codex",
          new AbortController().signal,
          50,
        ),
      ),
    ).rejects.toThrow("CLI request failed");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
for (const kind of ["claude", "codex"] as const)
  it.skipIf(process.env.VSTUDY_REAL_CLI_SMOKE !== "1")(
    `real ${kind} smoke`,
    async () => {
      const binary = await findCli(kind);
      if (!binary) return;
      const cwd = await mkdtemp(join(tmpdir(), `vstudy-${kind}-smoke-`));
      try {
        const events = await collect(
          runCli(
            binary,
            cliArgs(kind, "default"),
            "Reply with exactly VSTUDY_OK. Do not use any tools.",
            cwd,
            kind,
            new AbortController().signal,
          ),
        );
        expect(
          events
            .flatMap((e) => (e.type === "text-delta" ? [e.text] : []))
            .join(""),
        ).toContain("VSTUDY_OK");
        expect(events.at(-1)).toEqual({ type: "done" });
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
    140_000,
  );

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of source) result.push(value);
  return result;
}
