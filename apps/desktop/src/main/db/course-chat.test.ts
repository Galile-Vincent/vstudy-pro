import { expect, it } from "vitest";
import { conversationSchema, messageSchema } from "../../shared/domain";
import { openStore } from "./index";
it("persists course conversations with strict scope constraints and cascades messages", () => {
  const store = openStore(":memory:");
  try {
    const courseId = "00000000-0000-4000-8000-000000000001";
    const id = "00000000-0000-4000-8000-000000000002";
    store.db.exec("INSERT INTO moodle_accounts VALUES ('a','cycu',1,'{}')");
    store.db
      .prepare("INSERT INTO moodle_courses VALUES (?,'a','{}')")
      .run(courseId);
    const conversation = conversationSchema.parse({
      id,
      scope: "course",
      courseId,
      providerId: "anthropic-api",
      modelId: "fake",
      createdAt: "2030-01-01T00:00:00Z",
    });
    store.conversations.insert(conversation);
    store.messages.insert(
      messageSchema.parse({
        id: "00000000-0000-4000-8000-000000000003",
        conversationId: id,
        role: "user",
        parts: [{ type: "text", text: "Plan my week" }],
        createdAt: "2030-01-01T00:00:00Z",
      }),
    );
    expect(store.conversations.get(conversation.id)).toEqual(conversation);
    expect(store.conversations.list({ scope: "course", courseId })).toEqual([
      conversation,
    ]);
    expect(
      store.conversations.list(
        "00000000-0000-4000-8000-000000000099" as import("../../shared/domain").Document["id"],
      ),
    ).toEqual([]);
    expect(() =>
      store.db
        .prepare("UPDATE conversations SET scope='document' WHERE id=?")
        .run(id),
    ).toThrow();
    expect(store.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    store.db.prepare("DELETE FROM moodle_courses WHERE id=?").run(courseId);
    expect(store.conversations.get(conversation.id)).toBeNull();
    expect(store.messages.list(conversation.id)).toEqual([]);
  } finally {
    store.close();
  }
});
