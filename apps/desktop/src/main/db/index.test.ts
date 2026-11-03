import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  conversationSchema,
  documentSchema,
  messageSchema,
} from "../../shared";
import { openStore, type Store } from "./index";
const stores: Store[] = [];
const paths: string[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const store = openStore(":memory:");
  stores.push(store);
  const document = documentSchema.parse({
    id: randomUUID(),
    title: "Study's notes",
    sourceName: "x.md",
    sourceHash: "b".repeat(64),
    sourcePath: "/library/source.md",
    mime: "text/markdown",
    status: "converting",
    markdownPath: "/library/content.md",
    createdAt: new Date().toISOString(),
  });
  const conversation = conversationSchema.parse({
    id: randomUUID(),
    documentId: document.id,
    providerId: "openai-api",
    modelId: "test",
    createdAt: document.createdAt,
  });
  const message = messageSchema.parse({
    id: randomUUID(),
    conversationId: conversation.id,
    role: "user",
    parts: [{ type: "text", text: "hello '; DROP TABLE documents; --" }],
    createdAt: document.createdAt,
  });
  return { store, document, conversation, message };
}
describe("SQLite repositories", () => {
  it("round trips documents, conversations and structured messages; enforces cascades", () => {
    const { store, document, conversation, message } = fixture();
    expect(() => store.conversations.insert(conversation)).toThrow();
    store.documents.insert(document);
    expect(store.documents.get(document.id)).toEqual(document);
    expect(store.documents.findByHash(document.sourceHash)).toEqual(document);
    expect(store.documents.list()).toEqual([document]);
    store.conversations.insert(conversation);
    store.messages.insert(message);
    expect(store.conversations.get(conversation.id)).toEqual(conversation);
    expect(store.conversations.list(document.id)).toEqual([conversation]);
    expect(store.messages.list(conversation.id)).toEqual([message]);
    expect(
      store.documents.transition(document.id, {
        status: "failed",
        error: "broken",
      }).status,
    ).toBe("failed");
    expect(
      store.documents.transition(document.id, { status: "converting" }),
    ).not.toHaveProperty("error");
    store.documents.transition(document.id, { status: "ready" });
    expect(() =>
      store.documents.transition(document.id, { status: "converting" }),
    ).toThrow();
    store.documents.delete(document.id);
    expect(store.conversations.get(conversation.id)).toBeNull();
    expect(store.messages.list(conversation.id)).toEqual([]);
  });
  it("persists settings and applies migrations only once with WAL", () => {
    const path = mkdtempSync(join(tmpdir(), "vstudy-db-"));
    paths.push(path);
    const file = join(path, "store.sqlite");
    const first = openStore(file);
    expect(first.settings.get()).toEqual({
      chatSide: "left",
      lastProviderId: null,
      lastModelId: null,
    });
    first.settings.set({
      chatSide: "right",
      lastProviderId: "claude-cli",
      lastModelId: "test",
    });
    first.close();
    const second = openStore(file);
    stores.push(second);
    expect(second.settings.get().chatSide).toBe("right");
    const raw = new DatabaseSync(file);
    expect(raw.prepare("PRAGMA journal_mode").get()).toEqual({
      journal_mode: "wal",
    });
    expect(
      raw.prepare("SELECT count(*) AS count FROM migrations").get(),
    ).toEqual({ count: 1 });
    raw.close();
  });
  it("rejects duplicate content and invalid domain data", () => {
    const { store, document } = fixture();
    store.documents.insert(document);
    expect(() =>
      store.documents.insert({
        ...document,
        id: documentSchema.parse({ ...document, id: randomUUID() }).id,
      }),
    ).toThrow();
    expect(
      store.documents.get(
        documentSchema.parse({ ...document, id: randomUUID() }).id,
      ),
    ).toBeNull();
  });
});
