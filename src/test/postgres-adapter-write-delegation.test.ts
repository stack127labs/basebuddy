import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  createMappedContentPostMock,
  updateMappedContentPostMock,
} = vi.hoisted(() => ({
  createMappedContentPostMock: vi.fn(),
  updateMappedContentPostMock: vi.fn(),
}));

vi.mock("@/lib/content-runtime/mapped-content-post-writes", () => ({
  createMappedContentPost: createMappedContentPostMock,
  deleteMappedContentPosts: vi.fn(),
  discardMappedContentPost: vi.fn(),
  updateMappedContentPost: updateMappedContentPostMock,
}));

import { createContentRuntimeAdapter } from "@/lib/content-runtime/adapter/factory";
import {
  createContentAdapterArrayPatchError,
  createContentAdapterJsonPatchError,
} from "@/lib/content-runtime/adapter/error-mapping";
import {
  normalizeContentRuntimeContent,
  normalizeContentRuntimePostContentFieldValue,
} from "@/lib/content-runtime/content-conversion";
import type {
  ContentCustomFieldMapping,
  ContentCustomRelationFieldMapping,
} from "@/lib/content-runtime/mapping";
import { normalizeContentProjectMapping } from "@/lib/content-runtime/mapping";

const createMappedProjectMapping = ({
  customFields = [],
  customRelationFields = [],
  fieldOverrides,
  workflowOverride,
}: {
  customFields?: ContentCustomFieldMapping[];
  customRelationFields?: ContentCustomRelationFieldMapping[];
  fieldOverrides?: Record<string, unknown>;
  workflowOverride?: Record<string, unknown>;
} = {}) =>
  normalizeContentProjectMapping({
    bindingId: "binding-1",
    bindingMode: "mapped_content",
    bindingStatus: "ready",
    mappingConfig: {
      entities: {
        authors: {
          source: { kind: "table", primaryKey: "id", schema: "public", table: "authors" },
          status: "mapped",
        },
        categories: {
          source: { kind: "table", primaryKey: "id", schema: "public", table: "categories" },
          status: "mapped",
        },
        posts: {
          customFields,
          customRelationFields,
          editorFields: [],
          fields: {
            excerpt: { column: "summary", kind: "plain_text", label: "Excerpt" },
            publishedAt: { column: "published_at", kind: "datetime", label: "Published At" },
            title: { column: "headline", kind: "text", label: "Title", required: true },
            updatedAt: { column: "updated_at", kind: "datetime", label: "Updated At" },
            ...(fieldOverrides ?? {}),
          },
          relations: {
            authors: {
              fieldMap: { name: "name" },
              junctionSourceColumn: null,
              junctionTable: null,
              junctionTargetColumn: null,
              multiple: false,
              sourceColumn: "author_id",
              status: "mapped",
              strategy: "foreign_key",
              targetColumn: "id",
              targetEntity: "authors",
              targetTable: null,
              valueColumn: null,
            },
          },
          source: { kind: "table", primaryKey: "id", schema: "public", table: "posts" },
          status: "mapped",
          workflow: {
            archivedValues: ["archived"],
            customValues: [],
            draftValues: ["draft"],
            mode: "status",
            publishedAtColumn: "published_at",
            publishedFlagColumn: null,
            publishedValues: ["published"],
            statusColumn: "publication_state",
            ...(workflowOverride ?? {}),
          },
        },
        tags: {
          source: { kind: "table", primaryKey: "id", schema: "public", table: "tags" },
          status: "mapped",
        },
      },
      mediaStorage: null,
      version: 1,
    },
    revisionId: "revision-1",
    revisionVersion: 1,
  });

describe("Postgres runtime adapter write delegation", () => {
  it("keeps the original conflict timestamp separate from an editable timestamp", async () => {
    const adapter = createContentRuntimeAdapter({ hasFilesS3CompatibleCredentials: false, hasS3CompatibleCredentials: false, mapping: createMappedProjectMapping() });
    await adapter.savePost({ client: {} as never, postId: "post-1", expectedUpdatedAt: "2026-04-01T00:00:00.000Z", updatedAt: "2026-04-02T00:00:00.000Z", title: "Changed" });
    expect(updateMappedContentPostMock).toHaveBeenCalledWith(expect.objectContaining({ expectedUpdatedAt: "2026-04-01T00:00:00.000Z", updatedAt: "2026-04-02T00:00:00.000Z" }));
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates createPost through the mapped mapped-content write helper", async () => {
    const mapping = createMappedProjectMapping();
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    createMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "",
      updatedAt: "2026-04-05T00:00:00.000Z",
    });

    await adapter.createPost?.({
      accessibleAuthorIds: ["author-1"],
      client,
    });

    expect(createMappedContentPostMock).toHaveBeenCalledWith({
      accessibleAuthorIds: ["author-1"],
      client,
      mapping,
    });
  });

  it("delegates savePost through the mapped mapped-content write helper", async () => {
    const mapping = createMappedProjectMapping();
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    updateMappedContentPostMock.mockResolvedValue({
      authorId: "author-1",
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p>Hello</p>",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: "Excerpt",
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      authorId: "author-1",
      client,
      excerpt: "Excerpt",
      featuredImageUrl: "/hero.png",
      postId: "post-1",
      publishedAt: "2026-04-06T00:00:00.000Z",
      status: "published",
      title: "Hello",
      updatedAt: "2026-04-06T01:00:00.000Z",
    });

    const delegatedRequest = updateMappedContentPostMock.mock.calls[0]?.[0];

    expect(delegatedRequest).toEqual(
      expect.objectContaining({
        authorId: "author-1",
        client,
        excerpt: "Excerpt",
        mapping,
        postId: "post-1",
        publishedAt: "2026-04-06T00:00:00.000Z",
        status: "published",
        title: "Hello",
        updatedAt: "2026-04-06T01:00:00.000Z",
      }),
    );
    expect(delegatedRequest.createdAt).toBeUndefined();
    expect(delegatedRequest.featuredImageUrl).toBeUndefined();
  });

  it("does not delegate workflow status on a normal save for published-flag mappings", async () => {
    const mapping = createMappedProjectMapping({
      workflowOverride: {
        mode: "published_flag",
        publishedAtColumn: null,
        publishedFlagColumn: "is_published",
        publishedValues: ["true"],
        statusColumn: null,
      },
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    updateMappedContentPostMock.mockResolvedValue({
      authorId: "author-1",
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p>Hello</p>",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: "Excerpt",
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client,
      excerpt: "Excerpt",
      postId: "post-1",
      status: "draft",
      title: "Hello",
      updatedAt: "2026-04-06T01:00:00.000Z",
    });

    const delegatedRequest = updateMappedContentPostMock.mock.calls[0]?.[0];

    expect(delegatedRequest).toEqual(
      expect.objectContaining({
        client,
        excerpt: "Excerpt",
        mapping,
        postId: "post-1",
        title: "Hello",
        updatedAt: "2026-04-06T01:00:00.000Z",
      }),
    );
    expect(delegatedRequest.status).toBeUndefined();
  });

  it("drops unsupported featured image writes before delegating", async () => {
    const mapping = createMappedProjectMapping({
      fieldOverrides: {
        featuredImageUrl: { column: "media_payload", kind: "json", label: "Featured Image" },
      },
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p>Hello</p>",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: "{\"id\":\"media-1\"}",
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client,
      featuredImageUrl: "https://example.com/hero.png",
      postId: "post-1",
      title: "Hello",
    });

    const delegatedRequest = updateMappedContentPostMock.mock.calls[0]?.[0];

    expect(delegatedRequest).toEqual(
      expect.objectContaining({
        client,
        mapping,
        postId: "post-1",
        title: "Hello",
      }),
    );
    expect(delegatedRequest.featuredImageUrl).toBeUndefined();
  });

  it("normalizes array-backed explicit field writes before delegating", async () => {
    const mapping = createMappedProjectMapping({
      fieldOverrides: {
        excerpt: { column: "summary_tokens", kind: "array", label: "Excerpt" },
      },
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p>Hello</p>",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: ["first", "second"],
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client,
      excerpt: ["first", "second"] as unknown as string,
      postId: "post-1",
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        excerpt: ["first", "second"],
        mapping,
        postId: "post-1",
      }),
    );
  });

  it("normalizes custom relation field writes before delegating", async () => {
    const mapping = createMappedProjectMapping({
      customRelationFields: [
        {
          enabled: true,
          fieldKey: "sponsor_author_id",
          isNullable: true,
          kind: "single_relation",
          label: "Sponsor Author",
          relation: {
            fieldMap: { name: "name" },
            junctionSourceColumn: null,
            junctionTable: null,
            junctionTargetColumn: null,
            multiple: false,
            sourceColumn: "sponsor_author_id",
            status: "mapped",
            strategy: "foreign_key",
            targetColumn: "id",
            targetEntity: "authors",
            targetTable: null,
            valueColumn: null,
          },
        },
        {
          enabled: true,
          fieldKey: "related_post_ids",
          isNullable: true,
          kind: "self_reference_multi",
          label: "Related Posts",
          relation: {
            fieldMap: { title: "title" },
            junctionSourceColumn: "post_id",
            junctionTable: "post_related_posts",
            junctionTargetColumn: "related_post_id",
            multiple: true,
            sourceColumn: null,
            status: "mapped",
            strategy: "join_table",
            targetColumn: "id",
            targetEntity: "posts",
            targetTable: null,
            valueColumn: null,
          },
        },
      ],
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p>Hello</p>",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {
        related_post_ids: ["post-2"],
        sponsor_author_id: "author-2",
      },
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [],
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client,
      customFields: {
        related_post_ids: ["post-2", "post-2", "post-1", "  "],
        sponsor_author_id: " author-2 ",
      },
      postId: "post-1",
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        customFields: {
          related_post_ids: ["post-2"],
          sponsor_author_id: "author-2",
        },
        mapping,
        postId: "post-1",
        title: "Hello",
      }),
    );
  });

  it("normalizes redirects before delegating savePost writes", async () => {
    const mapping = createMappedProjectMapping({
      fieldOverrides: {
        redirects: { column: "redirect_history", kind: "array", label: "Redirects" },
      },
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p>Hello</p>",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: ["old-post", "older-post"],
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client,
      postId: "post-1",
      redirects: [" old-post ", "older-post", "old-post", ""],
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        mapping,
        postId: "post-1",
        redirects: [
          {
            active: null,
            locale: null,
            source: "old-post",
            statusCode: null,
          },
          {
            active: null,
            locale: null,
            source: "older-post",
            statusCode: null,
          },
        ],
      }),
    );
  });

  it("normalizes structured redirect rows before delegating savePost writes", async () => {
    const mapping = createMappedProjectMapping({
      fieldOverrides: {
        redirects: { column: "redirect_history", kind: "json", label: "Redirects" },
      },
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p>Hello</p>",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [
        {
          active: true,
          locale: "en",
          source: "old-post",
          statusCode: 301,
        },
      ],
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client,
      postId: "post-1",
      redirects: [
        {
          active: true,
          locale: " en ",
          source: " old-post ",
          statusCode: "301",
        },
        {
          source: "older-post",
        },
        {
          source: "old-post",
        },
      ],
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        redirects: [
          {
            active: true,
            locale: "en",
            source: "old-post",
            statusCode: 301,
          },
          {
            active: null,
            locale: null,
            source: "older-post",
            statusCode: null,
          },
        ],
      }),
    );
  });

  it("rejects structured redirect metadata on list-only redirect storage", async () => {
    const mapping = createMappedProjectMapping({
      fieldOverrides: {
        redirects: {
          arrayIndex: 0,
          column: "redirect_history",
          kind: "array",
          label: "Redirects",
        },
      },
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    await expect(
      adapter.savePost?.({
        client: { query: vi.fn() },
        postId: "post-1",
        redirects: [
          {
            source: "old-post",
            statusCode: 301,
          },
        ],
        title: "Hello",
      }),
    ).rejects.toThrow("Redirects can't be edited here yet. Review the field setup and try again.");
  });

  it("delegates parent page ids through savePost", async () => {
    const baseMapping = createMappedProjectMapping();
    const mapping = normalizeContentProjectMapping({
      ...baseMapping,
      mappingConfig: {
        ...baseMapping.mappingConfig,
        entities: {
          ...baseMapping.mappingConfig.entities,
          posts: {
            ...baseMapping.mappingConfig.entities.posts,
            relations: {
              ...baseMapping.mappingConfig.entities.posts.relations,
              posts: {
                fieldMap: { title: "title" },
                junctionSourceColumn: null,
                junctionTable: null,
                junctionTargetColumn: null,
                multiple: false,
                sourceColumn: "parent_post_id",
                status: "mapped",
                strategy: "foreign_key",
                targetColumn: "id",
                targetEntity: "posts",
                targetTable: null,
                valueColumn: null,
              },
            },
          },
        },
      },
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      parentPageId: "post-2",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client,
      parentPageId: " post-2 ",
      postId: "post-1",
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        mapping,
        parentPageId: "post-2",
        postId: "post-1",
      }),
    );
  });

  it("rejects invalid array-backed explicit field payloads before delegating", async () => {
    const mapping = createMappedProjectMapping({
      fieldOverrides: {
        excerpt: { column: "summary_tokens", kind: "array", label: "Excerpt" },
      },
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    await expect(
      adapter.savePost?.({
        client: { query: vi.fn() },
        excerpt: "not-an-array" as unknown as string,
        postId: "post-1",
        title: "Hello",
      }),
    ).rejects.toThrow('Invalid value for "Excerpt"');

    expect(updateMappedContentPostMock).not.toHaveBeenCalled();
  });

  it("coerces supported custom scalar field values before delegating writes", async () => {
    const mapping = createMappedProjectMapping({
      customFields: [
        {
          allowedValues: null,
          column: "reading_time_minutes",
          dataType: "integer",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "number",
          label: "Reading time",
          sampleValues: [],
        },
        {
          allowedValues: null,
          column: "is_featured",
          dataType: "boolean",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "boolean",
          label: "Featured",
          sampleValues: [],
        },
        {
          allowedValues: null,
          column: "publish_on",
          dataType: "date",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "date",
          label: "Publish On",
          sampleValues: [],
        },
        {
          allowedValues: null,
          column: "event_at",
          dataType: "timestamp with time zone",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "datetime",
          label: "Event At",
          sampleValues: [],
        },
        {
          allowedValues: ["everyone", "members"],
          column: "audience",
          dataType: "text",
          defaultValue: null,
          enabled: true,
          isNullable: false,
          kind: "enum",
          label: "Audience",
          sampleValues: [],
        },
        {
          allowedValues: null,
          column: "metadata",
          dataType: "jsonb",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "json",
          label: "Metadata",
          sampleValues: [],
        },
        {
          allowedValues: null,
          column: "aliases",
          dataType: "text[]",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "array",
          label: "Aliases",
          sampleValues: [],
        },
        {
          allowedValues: null,
          column: "scores",
          dataType: "integer[]",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "array",
          label: "Scores",
          sampleValues: [],
        },
        {
          allowedValues: null,
          column: "publish_windows",
          dataType: "date[]",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "array",
          label: "Publish Windows",
          sampleValues: [],
        },
        {
          allowedValues: null,
          column: "notes",
          dataType: "text",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "plain_text",
          label: "Notes",
          sampleValues: [],
        },
      ],
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    updateMappedContentPostMock.mockResolvedValue({
      authorId: "author-1",
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p>Hello</p>",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: "Excerpt",
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client,
      customFields: {
        aliases: ["first", "second"],
        audience: "members",
        event_at: "2026-04-06T08:30:00.000Z",
        is_featured: "true",
        metadata: { hero: true },
        notes: 123,
        publish_on: "2026-04-06T08:30:00.000Z",
        publish_windows: ["2026-04-06T08:30:00.000Z", new Date("2026-04-07T08:30:00.000Z")],
        reading_time_minutes: "7",
        scores: ["7", 8],
      },
      postId: "post-1",
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        customFields: {
          aliases: ["first", "second"],
          audience: "members",
        event_at: "2026-04-06T08:30:00.000Z",
        is_featured: true,
        metadata: { hero: true },
        notes: "123",
        publish_on: "2026-04-06",
        publish_windows: ["2026-04-06", "2026-04-07"],
        reading_time_minutes: 7,
        scores: [7, 8],
      },
      mapping,
      postId: "post-1",
      title: "Hello",
      }),
    );
  });

  it("rejects invalid custom array field payloads before delegating writes", async () => {
    const mapping = createMappedProjectMapping({
      customFields: [
        {
          allowedValues: null,
          column: "scores",
          dataType: "integer[]",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "array",
          label: "Scores",
          sampleValues: [],
        },
      ],
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    await expect(
      adapter.savePost?.({
        client: { query: vi.fn() },
        customFields: {
          scores: ["7", "oops"],
        },
        postId: "post-1",
        title: "Hello",
      }),
    ).rejects.toThrow('Invalid value for "Scores"');

    expect(updateMappedContentPostMock).not.toHaveBeenCalled();
  });

  it("passes custom range field values through as range strings before delegating writes", async () => {
    const mapping = createMappedProjectMapping({
      customFields: [
        {
          allowedValues: null,
          column: "audience_score_range",
          dataType: "int4range",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "number",
          label: "Audience Score Range",
          sampleValues: [],
        },
      ],
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "",
      contentJson: {},
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client: { query: vi.fn() },
      customFields: {
        audience_score_range: "[1,10)",
      },
      postId: "post-1",
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customFields: {
          audience_score_range: "[1,10)",
        },
      }),
    );
  });

  it("preserves exact numeric custom field strings before delegating writes", async () => {
    const mapping = createMappedProjectMapping({
      customFields: [
        {
          allowedValues: null,
          column: "sku_numeric_code",
          dataType: "numeric",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "number",
          label: "SKU Numeric Code",
          sampleValues: [],
        },
        {
          allowedValues: null,
          column: "legacy_bigint_ids",
          dataType: "bigint[]",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "array",
          label: "Legacy Bigint IDs",
          sampleValues: [],
        },
      ],
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "",
      contentJson: {},
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client: { query: vi.fn() },
      customFields: {
        legacy_bigint_ids: ["9007199254740993", "9007199254740995"],
        sku_numeric_code: "12345678901234567890.123456789",
      },
      postId: "post-1",
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customFields: {
          legacy_bigint_ids: ["9007199254740993", "9007199254740995"],
          sku_numeric_code: "12345678901234567890.123456789",
        },
      }),
    );
  });

  it("rejects invalid custom enum-multi field payloads before delegating writes", async () => {
    const mapping = createMappedProjectMapping({
      customFields: [
        {
          allowedValues: ["everyone", "members"],
          column: "audience_segments",
          dataType: "text[]",
          defaultValue: null,
          enabled: true,
          isNullable: true,
          kind: "array",
          label: "Audience Segments",
          sampleValues: [],
        },
      ],
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    await expect(
      adapter.savePost?.({
        client: { query: vi.fn() },
        customFields: {
          audience_segments: ["everyone", "admins"],
        },
        postId: "post-1",
        title: "Hello",
      }),
    ).rejects.toThrow('Invalid value for "Audience Segments"');

    expect(updateMappedContentPostMock).not.toHaveBeenCalled();
  });

  it("keeps custom scalar field keys stable when delegating non-direct custom field writes", async () => {
    const mapping = createMappedProjectMapping({
      customFields: [
        {
          allowedValues: null,
          column: "metadata",
          dataType: "jsonb",
          defaultValue: null,
          enabled: true,
          fieldKey: "card_title",
          isNullable: true,
          kind: "text",
          label: "Card Title",
          path: "card.title",
          sampleValues: [],
        } as ContentCustomFieldMapping,
        {
          allowedValues: null,
          arrayIndex: 1,
          column: "tag_slots",
          dataType: "text[]",
          defaultValue: null,
          enabled: true,
          fieldKey: "secondary_tag",
          isNullable: true,
          kind: "text",
          label: "Secondary Tag",
          sampleValues: [],
        } as ContentCustomFieldMapping,
      ],
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p>Hello</p>",
      contentJson: { type: "doc" },
      contentMarkdown: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {
        card_title: "Welcome",
        secondary_tag: "beta",
      },
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [],
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client,
      customFields: {
        card_title: " Welcome ",
        secondary_tag: " beta ",
      },
      postId: "post-1",
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customFields: {
          card_title: " Welcome ",
          secondary_tag: " beta ",
        },
      }),
    );
  });

  it("rejects invalid custom scalar field payloads before delegating writes", async () => {
    const mapping = createMappedProjectMapping({
      customFields: [
        {
          allowedValues: ["everyone", "members"],
          column: "audience",
          dataType: "text",
          defaultValue: null,
          enabled: true,
          isNullable: false,
          kind: "enum",
          label: "Audience",
          sampleValues: [],
        },
      ],
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    await expect(
      adapter.savePost?.({
        client: { query: vi.fn() },
        customFields: {
          audience: "admins",
        },
        postId: "post-1",
        title: "Hello",
      }),
    ).rejects.toThrow('Invalid value for "Audience"');

    expect(updateMappedContentPostMock).not.toHaveBeenCalled();
  });

  it("rejects writes to unsupported exotic custom scalar fields before delegating", async () => {
    const mapping = createMappedProjectMapping({
      customFields: [
        {
          allowedValues: null,
          column: "raw_blob",
          dataType: "bytea",
          defaultValue: null,
          enabled: true,
          fieldKey: "raw_blob",
          isNullable: true,
          kind: "text",
          label: "Raw Blob",
          sampleValues: [],
        },
      ],
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    await expect(
      adapter.savePost?.({
        client: { query: vi.fn() },
        customFields: {
          raw_blob: "SGVsbG8=",
        },
        postId: "post-1",
        title: "Hello",
      }),
    ).rejects.toThrow('The field "Raw Blob" can\'t be edited here yet. Review the field setup and try again.');

    expect(updateMappedContentPostMock).not.toHaveBeenCalled();
  });

  it("maps postgres field errors into structured adapter save errors", async () => {
    const mapping = normalizeContentProjectMapping({
      bindingId: "binding-1",
      bindingMode: "mapped_content",
      bindingStatus: "ready",
      mappingConfig: {
        entities: {
          authors: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "authors" },
            status: "mapped",
          },
          categories: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "categories" },
            status: "mapped",
          },
          posts: {
            customFields: [],
            editorFields: [],
            fields: {
              slug: { column: "slug", kind: "slug", label: "Slug", required: true },
              title: { column: "headline", kind: "text", label: "Title", required: true },
            },
            relations: {},
            source: { kind: "table", primaryKey: "id", schema: "public", table: "posts" },
            status: "mapped",
            workflow: null,
          },
          tags: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "tags" },
            status: "mapped",
          },
        },
        mediaStorage: null,
        version: 1,
      },
      revisionId: "revision-1",
      revisionVersion: 1,
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    updateMappedContentPostMock.mockRejectedValue({
      code: "23505",
      constraint: "posts_slug_key",
      detail: "Key (slug)=(hello-world) already exists.",
      message: 'duplicate key value violates unique constraint "posts_slug_key"',
    });

    await expect(
      adapter.savePost?.({
        client: { query: vi.fn() },
        postId: "post-1",
        slug: "hello-world",
      }),
    ).rejects.toMatchObject({
      errors: [
        expect.objectContaining({
          code: "uniqueness_violation",
          fieldKey: "slug",
        }),
      ],
      message: "A unique value is already in use.",
    });
  });

  it("maps structured JSON and array patch failures into adapter save errors", async () => {
    const mapping = createMappedProjectMapping({
      fieldOverrides: {
        excerpt: { column: "meta_payload", kind: "plain_text", label: "Excerpt", path: "seo.description" },
      },
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    updateMappedContentPostMock.mockRejectedValueOnce(
      createContentAdapterJsonPatchError({
        fieldKey: "excerpt",
        path: "seo.description",
        reason: "missing_parent_container",
        sourceColumn: "meta_payload",
      }),
    );

    await expect(
      adapter.savePost?.({
        client: { query: vi.fn() },
        excerpt: "Updated excerpt",
        postId: "post-1",
        title: "Hello",
      }),
    ).rejects.toMatchObject({
      errors: [
        expect.objectContaining({
          code: "json_patch_failure",
          fieldKey: "excerpt",
          metadata: {
            path: "seo.description",
            reason: "missing_parent_container",
            sourceColumn: "meta_payload",
          },
        }),
      ],
      message: 'Could not update the JSON path "seo.description".',
    });

    updateMappedContentPostMock.mockRejectedValueOnce(
      createContentAdapterArrayPatchError({
        fieldKey: "categories",
        reason: "invalid_array_target",
        sourceColumn: "category_ids",
        target: "whole_array",
      }),
    );

    await expect(
      adapter.savePost?.({
        categoryIds: ["category-1"],
        client: { query: vi.fn() },
        postId: "post-1",
        title: "Hello",
      }),
    ).rejects.toMatchObject({
      errors: [
        expect.objectContaining({
          code: "array_patch_failure",
          fieldKey: "categories",
          metadata: {
            reason: "invalid_array_target",
            sourceColumn: "category_ids",
            target: "whole_array",
          },
        }),
      ],
      message: 'Could not update the array target "whole_array".',
    });
  });

  it("normalizes core scalar, content, workflow, and relation payloads before delegating writes", async () => {
    const mapping = normalizeContentProjectMapping({
      bindingId: "binding-1",
      bindingMode: "mapped_content",
      bindingStatus: "ready",
      mappingConfig: {
        entities: {
          authors: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "authors" },
            status: "mapped",
          },
          categories: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "categories" },
            status: "mapped",
          },
          posts: {
            customFields: [],
            editorFields: [
              {
                column: "body_html",
                id: "content",
                kind: "html",
                label: "Body",
                placeholder: null,
                required: false,
                visible: true,
              },
              {
                column: "sidebar_json",
                id: "sidebar",
                kind: "json",
                label: "Sidebar",
                placeholder: null,
                required: false,
                visible: true,
              },
            ],
            fields: {
              excerpt: { column: "summary", kind: "plain_text", label: "Excerpt" },
              publishedAt: { column: "published_at", kind: "datetime", label: "Published At" },
              title: { column: "headline", kind: "text", label: "Title", required: true },
            },
            relations: {
              authors: {
                fieldMap: { name: "name" },
                junctionSourceColumn: null,
                junctionTable: null,
                junctionTargetColumn: null,
                multiple: false,
                sourceColumn: "author_id",
                status: "mapped",
                strategy: "foreign_key",
                targetColumn: "id",
                targetEntity: "authors",
                targetTable: null,
                valueColumn: null,
              },
              categories: {
                fieldMap: { name: "name" },
                junctionSourceColumn: null,
                junctionTable: null,
                junctionTargetColumn: null,
                multiple: true,
                sourceColumn: "category_ids",
                status: "mapped",
                strategy: "array",
                targetColumn: "id",
                targetEntity: "categories",
                targetTable: null,
                valueColumn: null,
              },
              tags: {
                fieldMap: { name: "name" },
                junctionSourceColumn: null,
                junctionTable: null,
                junctionTargetColumn: null,
                multiple: true,
                sourceColumn: "tag_ids",
                status: "mapped",
                strategy: "array",
                targetColumn: "id",
                targetEntity: "tags",
                targetTable: null,
                valueColumn: null,
              },
            },
            source: { kind: "table", primaryKey: "id", schema: "public", table: "posts" },
            status: "mapped",
            workflow: {
              archivedValues: ["archived"],
              customValues: [],
              draftValues: ["draft"],
              mode: "status",
              publishedAtColumn: "published_at",
              publishedFlagColumn: null,
              publishedValues: ["published"],
              statusColumn: "publication_state",
            },
          },
          tags: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "tags" },
            status: "mapped",
          },
        },
        mediaStorage: null,
        version: 1,
      },
      revisionId: "revision-1",
      revisionVersion: 1,
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };
    const normalizedPrimaryContent = normalizeContentRuntimeContent({
      contentJson: {
        content: [
          {
            content: [{ text: "Hello adapter", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      },
      primaryContentFormat: "html",
    });
    const normalizedSidebarContent = normalizeContentRuntimePostContentFieldValue({
      contentHtml: "<p>Sidebar</p>",
    });

    updateMappedContentPostMock.mockResolvedValue({
      authorId: "author-1",
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: normalizedPrimaryContent.contentHtml,
      contentJson: normalizedPrimaryContent.contentJson,
      contentMarkdown: normalizedPrimaryContent.contentMarkdown,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: "456",
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: "2026-04-06T08:30:00.000Z",
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "published",
      tagIds: ["tag-1", "tag-2"],
      title: "123",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      authorId: 42 as unknown as string,
      categoryIds: [" category-1 ", "category-1", 7 as unknown as string, ""],
      client,
      contentFields: {
        ignored: {
          contentHtml: "<p>Ignored</p>",
          contentJson: { type: "doc" },
        },
        sidebar: {
          contentHtml: "<p>Sidebar</p>",
          contentJson: {
            content: [
              {
                content: [{ text: "Sidebar", type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          },
        },
      },
      contentJson: {
        content: [
          {
            content: [{ text: "Hello adapter", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      },
      excerpt: 456 as unknown as string,
      postId: "post-1",
      publishedAt: new Date("2026-04-06T08:30:00.000Z") as unknown as string,
      status: "published",
      tagIds: ["tag-1", " tag-2 ", "tag-1"],
      title: 123 as unknown as string,
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: "42",
        categoryIds: ["category-1", "7"],
        client,
        contentFields: {
          sidebar: normalizedSidebarContent,
        },
        contentHtml: normalizedPrimaryContent.contentHtml,
        contentJson: normalizedPrimaryContent.contentJson,
        contentMarkdown: normalizedPrimaryContent.contentMarkdown,
        excerpt: "456",
        mapping,
        postId: "post-1",
        publishedAt: "2026-04-06T08:30:00.000Z",
        status: "published",
        tagIds: ["tag-1", "tag-2"],
        title: "123",
      }),
    );
  });

  it("delegates helper-row-backed content editor fields through normalized content payloads", async () => {
    const mapping = normalizeContentProjectMapping({
      bindingId: "binding-1",
      bindingMode: "mapped_content",
      bindingStatus: "ready",
      mappingConfig: {
        entities: {
          authors: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "authors" },
            status: "mapped",
          },
          categories: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "categories" },
            status: "mapped",
          },
          posts: {
            customFields: [],
            editorFields: [
              {
                column: null,
                id: "content_helper",
                kind: "html",
                label: "Body",
                placeholder: null,
                required: false,
                sourceRelation: {
                  junctionSourceColumn: "post_id",
                  junctionTable: "public.post_content_helper",
                  sourceColumn: null,
                  strategy: "related_row_by_post_id",
                  targetColumn: null,
                  targetTable: null,
                  valueColumn: "body_html",
                },
                visible: true,
              } as never,
            ],
            fields: {
              title: { column: "headline", kind: "text", label: "Title", required: true },
            },
            relations: {},
            source: { kind: "table", primaryKey: "id", schema: "public", table: "posts" },
            status: "mapped",
            workflow: null,
          },
          tags: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "tags" },
            status: "mapped",
          },
        },
        mediaStorage: null,
        version: 1,
      },
      revisionId: "revision-1",
      revisionVersion: 1,
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });
    const client = { query: vi.fn() };
    const normalizedPrimaryContent = normalizeContentRuntimeContent({
      contentHtml: "<p>Helper content</p>",
      primaryContentFormat: "html",
    });

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: normalizedPrimaryContent.contentHtml,
      contentJson: normalizedPrimaryContent.contentJson,
      contentMarkdown: normalizedPrimaryContent.contentMarkdown,
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: [],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      client,
      contentHtml: "<p>Helper content</p>",
      postId: "post-1",
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        contentHtml: normalizedPrimaryContent.contentHtml,
        contentJson: normalizedPrimaryContent.contentJson,
        contentMarkdown: normalizedPrimaryContent.contentMarkdown,
        mapping,
        postId: "post-1",
        title: "Hello",
      }),
    );
  });

  it("rejects invalid relation list payloads before delegating writes", async () => {
    const mapping = normalizeContentProjectMapping({
      bindingId: "binding-1",
      bindingMode: "mapped_content",
      bindingStatus: "ready",
      mappingConfig: {
        entities: {
          authors: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "authors" },
            status: "mapped",
          },
          categories: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "categories" },
            status: "mapped",
          },
          posts: {
            customFields: [],
            editorFields: [],
            fields: {
              title: { column: "headline", kind: "text", label: "Title", required: true },
            },
            relations: {
              categories: {
                fieldMap: { name: "name" },
                junctionSourceColumn: null,
                junctionTable: null,
                junctionTargetColumn: null,
                multiple: true,
                sourceColumn: "category_ids",
                status: "mapped",
                strategy: "array",
                targetColumn: "id",
                targetEntity: "categories",
                targetTable: null,
                valueColumn: null,
              },
            },
            source: { kind: "table", primaryKey: "id", schema: "public", table: "posts" },
            status: "mapped",
            workflow: null,
          },
          tags: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "tags" },
            status: "mapped",
          },
        },
        mediaStorage: null,
        version: 1,
      },
      revisionId: "revision-1",
      revisionVersion: 1,
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    await expect(
      adapter.savePost?.({
        categoryIds: "category-1" as unknown as string[],
        client: { query: vi.fn() },
        postId: "post-1",
        title: "Hello",
      }),
    ).rejects.toThrow('Invalid value for "Categories"');

    expect(updateMappedContentPostMock).not.toHaveBeenCalled();
  });

  it("delegates single-storage taxonomy mappings through single selected ids", async () => {
    const mapping = normalizeContentProjectMapping({
      bindingId: "binding-1",
      bindingMode: "mapped_content",
      bindingStatus: "ready",
      mappingConfig: {
        entities: {
          authors: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "authors" },
            status: "mapped",
          },
          categories: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "categories" },
            status: "mapped",
          },
          posts: {
            customFields: [],
            editorFields: [],
            fields: {
              title: { column: "headline", kind: "text", label: "Title", required: true },
            },
            relations: {
              categories: {
                fieldMap: { name: "name" },
                junctionSourceColumn: null,
                junctionTable: null,
                junctionTargetColumn: null,
                multiple: true,
                sourceColumn: "category_id",
                status: "mapped",
                strategy: "foreign_key",
                targetColumn: "id",
                targetEntity: "categories",
                targetTable: null,
                valueColumn: null,
              },
              tags: {
                fieldMap: { name: "name" },
                junctionSourceColumn: "post_id",
                junctionTable: "public.post_tag_helper",
                junctionTargetColumn: null,
                multiple: true,
                sourceColumn: null,
                status: "mapped",
                strategy: "join_row",
                targetColumn: "id",
                targetEntity: "tags",
                targetTable: null,
                valueColumn: "tag_id",
              },
            },
            source: { kind: "table", primaryKey: "id", schema: "public", table: "posts" },
            status: "mapped",
            workflow: null,
          },
          tags: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "tags" },
            status: "mapped",
          },
        },
        mediaStorage: null,
        version: 1,
      },
      revisionId: "revision-1",
      revisionVersion: 1,
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    updateMappedContentPostMock.mockResolvedValue({
      authorId: null,
      categoryIds: ["category-1"],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p></p>",
      contentJson: { type: "doc", content: [] },
      contentMarkdown: "",
      createdAt: "2026-04-05T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft",
      tagIds: ["tag-1"],
      title: "Hello",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    await adapter.savePost?.({
      categoryIds: ["category-1"],
      client: { query: vi.fn() },
      postId: "post-1",
      tagIds: ["tag-1"],
      title: "Hello",
    });

    expect(updateMappedContentPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryIds: ["category-1"],
        mapping,
        postId: "post-1",
        tagIds: ["tag-1"],
        title: "Hello",
      }),
    );
  });

  it("rejects multiple selected ids for single-storage taxonomy mappings", async () => {
    const mapping = normalizeContentProjectMapping({
      bindingId: "binding-1",
      bindingMode: "mapped_content",
      bindingStatus: "ready",
      mappingConfig: {
        entities: {
          authors: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "authors" },
            status: "mapped",
          },
          categories: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "categories" },
            status: "mapped",
          },
          posts: {
            customFields: [],
            editorFields: [],
            fields: {
              title: { column: "headline", kind: "text", label: "Title", required: true },
            },
            relations: {
              categories: {
                fieldMap: { name: "name" },
                junctionSourceColumn: null,
                junctionTable: null,
                junctionTargetColumn: null,
                multiple: true,
                sourceColumn: "category_id",
                status: "mapped",
                strategy: "foreign_key",
                targetColumn: "id",
                targetEntity: "categories",
                targetTable: null,
                valueColumn: null,
              },
            },
            source: { kind: "table", primaryKey: "id", schema: "public", table: "posts" },
            status: "mapped",
            workflow: null,
          },
          tags: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "tags" },
            status: "mapped",
          },
        },
        mediaStorage: null,
        version: 1,
      },
      revisionId: "revision-1",
      revisionVersion: 1,
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    await expect(
      adapter.savePost?.({
        categoryIds: ["category-1", "category-2"],
        client: { query: vi.fn() },
        postId: "post-1",
        title: "Hello",
      }),
    ).rejects.toThrow('Invalid value for "Categories"');

    expect(updateMappedContentPostMock).not.toHaveBeenCalled();
  });

  it("rejects invalid content JSON payloads before delegating writes", async () => {
    const mapping = normalizeContentProjectMapping({
      bindingId: "binding-1",
      bindingMode: "mapped_content",
      bindingStatus: "ready",
      mappingConfig: {
        entities: {
          authors: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "authors" },
            status: "mapped",
          },
          categories: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "categories" },
            status: "mapped",
          },
          posts: {
            customFields: [],
            editorFields: [
              {
                column: "body_html",
                id: "content",
                kind: "html",
                label: "Body",
                placeholder: null,
                required: false,
                visible: true,
              },
            ],
            fields: {
              title: { column: "headline", kind: "text", label: "Title", required: true },
            },
            relations: {},
            source: { kind: "table", primaryKey: "id", schema: "public", table: "posts" },
            status: "mapped",
            workflow: null,
          },
          tags: {
            source: { kind: "table", primaryKey: "id", schema: "public", table: "tags" },
            status: "mapped",
          },
        },
        mediaStorage: null,
        version: 1,
      },
      revisionId: "revision-1",
      revisionVersion: 1,
    });
    const adapter = createContentRuntimeAdapter({
      hasFilesS3CompatibleCredentials: false,
      hasS3CompatibleCredentials: false,
      mapping,
    });

    await expect(
      adapter.savePost?.({
        client: { query: vi.fn() },
        contentJson: "not-json" as unknown as Record<string, unknown>,
        postId: "post-1",
        title: "Hello",
      }),
    ).rejects.toThrow('Invalid value for "Content"');

    expect(updateMappedContentPostMock).not.toHaveBeenCalled();
  });
});
