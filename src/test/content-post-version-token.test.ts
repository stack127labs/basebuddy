import { describe, expect, it } from "vitest";
import { createContentPostVersionToken } from "@/lib/content-runtime/adapter/version-token";

describe("content post version tokens", () => {
  it("changes when a field changes even when no timestamp is mapped", () => {
    expect(createContentPostVersionToken({ title: "Before" }, {} as never)).not.toBe(createContentPostVersionToken({ title: "After" }, {} as never));
  });
  it("includes mapped helper fields but ignores generated display timestamps and key order", () => {
    const first = createContentPostVersionToken({ a: 1, b: 2 }, { contentHtml: "Before", updatedAt: "one" } as never);
    expect(first).toBe(createContentPostVersionToken({ b: 2, a: 1 }, { updatedAt: "two", contentHtml: "Before" } as never));
    expect(first).not.toBe(createContentPostVersionToken({ a: 1, b: 2 }, { contentHtml: "After", updatedAt: "one" } as never));
  });
});
