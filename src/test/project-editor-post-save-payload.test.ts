import { describe, expect, it } from "vitest";

import type { ContentPost } from "@/lib/content-runtime/shared";
import { buildProjectEditorPostSavePayloadFields } from "@/components/editor/project-editor/post-save-payload";

const createPost = (overrides: Partial<ContentPost> = {}): ContentPost => ({
  authorId: "author-1",
  categoryIds: ["category-1"],
  contentFields: {
    body: {
      contentHtml: "<p>Hello</p>",
      contentJson: { type: "doc", content: [{ type: "paragraph" }] },
    },
    hero: {
      contentHtml: "<p>Hero</p>",
      contentJson: { type: "doc", content: [{ type: "heading" }] },
    },
  },
  contentFormat: "html",
  contentHtml: "<p>Hello</p>",
  contentJson: { type: "doc", content: [{ type: "paragraph" }] },
  contentMarkdown: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  customFields: {
    subtitle: "Original subtitle",
    views: 10,
  },
  excerpt: "Original excerpt",
  featuredImageUrl: null,
  focusKeyword: null,
  id: "post-1",
  parentPageId: null,
  publishedAt: null,
  redirects: [],
  seoDescription: null,
  seoTitle: null,
  slug: "hello",
  status: "draft",
  tagIds: ["tag-1"],
  title: "Hello",
  updatedAt: "2026-04-01T00:00:00.000Z",
  ...overrides,
});

describe("project editor post save payload", () => {
  it("includes an edited timestamp as data without using it as the original conflict token", () => {
    const persistedPost = createPost();
    const currentPost = createPost({ updatedAt: "2026-04-02T00:00:00.000Z" });
    expect(buildProjectEditorPostSavePayloadFields({ action: "update_post", currentPost, persistedPost, primaryMultiFieldEditorId: "body" })).toEqual({ updatedAt: currentPost.updatedAt });
  });
  it("returns only changed scalar and nested fields for normal saves", () => {
    const persistedPost = createPost();
    const currentPost = createPost({
      contentFields: {
        ...persistedPost.contentFields,
        hero: {
          contentHtml: "<p>Updated hero</p>",
          contentJson: { type: "doc", content: [{ text: "Updated hero", type: "text" }] },
        },
      },
      customFields: {
        ...persistedPost.customFields,
        subtitle: "Updated subtitle",
      },
      excerpt: "Updated excerpt",
      title: "Updated title",
    });

    expect(
      buildProjectEditorPostSavePayloadFields({
        action: "update_post",
        currentPost,
        persistedPost,
        primaryMultiFieldEditorId: "body",
      }),
    ).toEqual({
      contentFields: {
        hero: currentPost.contentFields?.hero,
      },
      customFields: {
        subtitle: "Updated subtitle",
      },
      excerpt: "Updated excerpt",
      title: "Updated title",
    });
  });

  it("returns a full defined payload when a post has no persisted baseline", () => {
    const currentPost = createPost({
      contentFields: {
        body: {
          contentHtml: "<p>Hello</p>",
          contentJson: { type: "doc" },
        },
      },
    });

    expect(
      buildProjectEditorPostSavePayloadFields({
        action: "update_post",
        currentPost,
        persistedPost: null,
        primaryMultiFieldEditorId: "body",
      }),
    ).toMatchObject({
      authorId: "author-1",
      categoryIds: ["category-1"],
      contentHtml: "<p>Hello</p>",
      customFields: {
        subtitle: "Original subtitle",
        views: 10,
      },
      title: "Hello",
    });
  });

  it("does not send dirty fields for explicit workflow actions", () => {
    const persistedPost = createPost();
    const currentPost = createPost({
      title: "Dirty title",
    });

    expect(
      buildProjectEditorPostSavePayloadFields({
        action: "publish_post",
        currentPost,
        persistedPost,
        primaryMultiFieldEditorId: null,
      }),
    ).toEqual({});
  });
});
