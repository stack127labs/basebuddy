import { createHash } from "node:crypto";
import type { ContentPost } from "../shared";

export const createContentPostVersionToken = (row: Record<string, unknown>, post: ContentPost) => {
  const { createdAt, updatedAt, versionToken, canWrite, editorPayloadReady, editingSession, ...content } = post;
  const snapshot = JSON.stringify({ row, content }, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
      : value,
  );
  return createHash("sha256").update(snapshot).digest("hex");
};
