import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultContentMappingConfig } from "@/lib/content-runtime/mapping";
import { createDefaultEditorDoc } from "@/lib/content-runtime/shared";

const {
  applyMappedRelationWriteMock,
  getMappedContentPostByIdMock,
  getUniqueSlugForMappedTableMock,
  loadMappedContentAuthorsMock,
  lookupStoredRelationValuesForIdsMock,
} = vi.hoisted(() => ({
  applyMappedRelationWriteMock: vi.fn(),
  getMappedContentPostByIdMock: vi.fn(),
  getUniqueSlugForMappedTableMock: vi.fn(),
  loadMappedContentAuthorsMock: vi.fn(),
  lookupStoredRelationValuesForIdsMock: vi.fn(),
}));

vi.mock("@/lib/content-runtime/mapped-content-collections", () => ({
  loadMappedContentAuthors: loadMappedContentAuthorsMock,
}));

vi.mock("@/lib/content-runtime/mapped-content-post-reads", () => ({
  getMappedContentPostById: getMappedContentPostByIdMock,
}));

vi.mock("@/lib/content-runtime/mapped-content-post-support", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/content-runtime/mapped-content-post-support")>(
      "@/lib/content-runtime/mapped-content-post-support",
    );

  return {
    ...actual,
    applyMappedRelationWrite: applyMappedRelationWriteMock,
    getUniqueSlugForMappedTable: getUniqueSlugForMappedTableMock,
    lookupStoredRelationValuesForIds: lookupStoredRelationValuesForIdsMock,
  };
});

import { createMappedContentPost, updateMappedContentPost } from "@/lib/content-runtime/mapped-content-post-writes";

let mappingCounter = 0;

const createMapping = () => {
  mappingCounter += 1;
  const mappingConfig = createDefaultContentMappingConfig();
  const posts = mappingConfig.entities.posts;

  posts.source = {
    kind: "table",
    primaryKey: "id",
    schema: "public",
    table: "posts",
  };
  posts.status = "mapped";
  posts.fields.id.column = "id";
  posts.editorFields = [
    {
      column: "body_html",
      id: "body_html",
      kind: "html",
      label: "Content",
      placeholder: null,
      required: true,
      visible: true,
    },
  ];

  return {
    bindingId: `binding-${mappingCounter}`,
    bindingMode: "mapped_content" as const,
    bindingStatus: "ready" as const,
    mappingConfig,
    revisionId: `revision-${mappingCounter}`,
    revisionVersion: mappingCounter,
  };
};

describe("existing db runtime post writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUniqueSlugForMappedTableMock.mockImplementation(async ({ base }: { base: string }) => base);
    loadMappedContentAuthorsMock.mockResolvedValue([]);
    lookupStoredRelationValuesForIdsMock.mockResolvedValue([]);
    applyMappedRelationWriteMock.mockResolvedValue(undefined);
  });

  it("locks the post before reading the values used to construct a patch", async () => {
    const mapping = createMapping();
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    getMappedContentPostByIdMock.mockImplementationOnce(async () => {
      expect(client.query.mock.calls.some(([sql]) => /for update/i.test(sql))).toBe(true);
      throw new Error("snapshot read after row lock");
    });
    await expect(updateMappedContentPost({ client: client as never, mapping, postId: "post-1", title: "Changed" })).rejects.toThrow("snapshot read after row lock");
    expect(client.query).toHaveBeenLastCalledWith("rollback");
  });

  it("creates JSON-path-backed explicit fields without overwriting sibling values in the same JSON column", async () => {
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      column: "meta",
      path: "title",
    };
    mapping.mappingConfig.entities.posts.fields.slug = {
      ...mapping.mappingConfig.entities.posts.fields.slug,
      column: "meta",
      path: "route.slug",
    };
    mapping.mappingConfig.entities.posts.fields.excerpt = {
      ...mapping.mappingConfig.entities.posts.fields.excerpt,
      column: "meta",
      path: "seo.description",
    };
    mapping.mappingConfig.entities.posts.fields.createdAt = {
      ...mapping.mappingConfig.entities.posts.fields.createdAt,
      column: "meta",
      path: "timestamps.createdAt",
    };
    mapping.mappingConfig.entities.posts.fields.updatedAt = {
      ...mapping.mappingConfig.entities.posts.fields.updatedAt,
      column: "meta",
      path: "timestamps.updatedAt",
    };

    const createdPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p></p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p></p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "untitled-12345678",
      status: "draft" as const,
      tagIds: [],
      title: "",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const queryMock = vi.fn(async (sql: string) => {
      if (/^(begin|commit|rollback)$/i.test(sql) || /for update$/i.test(sql)) return { rows: [] };
        if (sql.includes("information_schema.columns")) {
          return {
            rows: [
              {
                column_default: "gen_random_uuid()",
                data_type: "uuid",
                is_nullable: "NO",
                udt_name: "uuid",
              },
            ],
          };
        }

        return {
          rows: [{ id: "post-1" }],
        };
      });
    const client = { query: queryMock } as never;

    getMappedContentPostByIdMock.mockResolvedValue(createdPost);

    await createMappedContentPost({
      client,
      mapping,
    });

    expect(queryMock).toHaveBeenCalledTimes(2);
    const insertCall = queryMock.mock.calls[1] as [string, unknown[]?] | undefined;
    const insertQuery = insertCall?.[0] ?? "";
    const insertValues = insertCall?.[1] ?? [];

    expect(insertQuery.match(/"meta"/g)?.length ?? 0).toBe(1);
    expect(insertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: {
            slug: expect.stringMatching(/^untitled-[a-f0-9]{8}$/),
          },
          seo: {
            description: null,
          },
          timestamps: {
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          },
          title: "",
        }),
      ]),
    );
  });

  it("creates array-index-backed explicit fields without sparse holes or sibling overwrites", async () => {
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.source.table = "posts_array_create";
    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      arrayIndex: 1,
      column: "title_parts",
    };
    mapping.mappingConfig.entities.posts.fields.excerpt = {
      ...mapping.mappingConfig.entities.posts.fields.excerpt,
      arrayIndex: 0,
      column: "title_parts",
    };

    const createdPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p></p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p></p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "untitled-12345678",
      status: "draft" as const,
      tagIds: [],
      title: "",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              column_default: "gen_random_uuid()",
              data_type: "uuid",
              is_nullable: "NO",
              udt_name: "uuid",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "post-1" }],
        }),
    };

    getMappedContentPostByIdMock.mockResolvedValue(createdPost);

    await createMappedContentPost({
      client,
      mapping,
    });

    expect(client.query).toHaveBeenCalledTimes(2);
    const insertQuery = client.query.mock.calls[1]?.[0] as string;
    const insertValues = client.query.mock.calls[1]?.[1] as unknown[];

    expect(insertQuery.match(/"title_parts"/g)?.length ?? 0).toBe(1);
    expect(insertValues).toEqual(
      expect.arrayContaining([
        [null, ""],
      ]),
    );
  });

  it("creates relation-backed built-in scalar fields through helper rows and related target rows", async () => {
    const mapping = createMapping();
    const posts = mapping.mappingConfig.entities.posts;

    mapping.mappingConfig.entities.authors.source = {
      kind: "table",
      primaryKey: "id",
      schema: "public",
      table: "authors",
    };
    mapping.mappingConfig.entities.authors.status = "mapped";
    posts.relations.authors = {
      fieldMap: {},
      junctionSourceColumn: null,
      junctionTable: null,
      junctionTargetColumn: null,
      multiple: false,
      sourceColumn: "author_id",
      status: "mapped",
      strategy: "foreign_key",
      targetColumn: "id",
      targetEntity: "authors",
      targetTable: "public.authors",
      valueColumn: null,
    };
    posts.fields.title = {
      ...posts.fields.title,
      column: null,
      sourceRelation: {
        junctionSourceColumn: "post_id",
        junctionTable: "public.post_title_helper",
        sourceColumn: null,
        strategy: "related_row_by_post_id",
        targetColumn: null,
        targetTable: null,
        valueColumn: "title_text",
      },
    };
    posts.fields.slug = {
      ...posts.fields.slug,
      column: null,
      sourceRelation: {
        junctionSourceColumn: "post_id",
        junctionTable: "public.post_slug_helper",
        sourceColumn: null,
        strategy: "join_row",
        targetColumn: null,
        targetTable: null,
        valueColumn: "slug_text",
      },
    };
    posts.fields.excerpt = {
      ...posts.fields.excerpt,
      column: null,
      sourceRelation: {
        junctionSourceColumn: null,
        junctionTable: null,
        sourceColumn: "author_id",
        strategy: "foreign_key",
        targetColumn: "id",
        targetTable: "public.author_profiles",
        valueColumn: "excerpt_text",
      },
    };
    posts.fields.seoTitle = {
      ...posts.fields.seoTitle,
      column: null,
      sourceRelation: {
        junctionSourceColumn: null,
        junctionTable: null,
        sourceColumn: "id",
        strategy: "value_match_relation",
        targetColumn: "post_id",
        targetTable: "public.post_meta_rows",
        valueColumn: "meta_title",
      },
    };
    posts.fields.seoDescription = {
      ...posts.fields.seoDescription,
      column: null,
      sourceRelation: {
        junctionSourceColumn: null,
        junctionTable: null,
        sourceColumn: "author_id",
        strategy: "foreign_key",
        targetColumn: "id",
        targetTable: "public.author_profiles",
        valueColumn: "meta_description",
      },
    };
    posts.fields.focusKeyword = {
      ...posts.fields.focusKeyword,
      column: null,
      sourceRelation: {
        junctionSourceColumn: null,
        junctionTable: null,
        sourceColumn: "author_id",
        strategy: "foreign_key",
        targetColumn: "id",
        targetTable: "public.author_profiles",
        valueColumn: "focus_keyword",
      },
    };
    posts.fields.featuredImageUrl = {
      ...posts.fields.featuredImageUrl,
      column: null,
      sourceRelation: {
        junctionSourceColumn: null,
        junctionTable: null,
        sourceColumn: "author_id",
        strategy: "foreign_key",
        targetColumn: "id",
        targetTable: "public.author_profiles",
        valueColumn: "featured_image_url",
      },
    };

    loadMappedContentAuthorsMock.mockResolvedValue([
      {
        id: "author-1",
        name: "Author One",
      },
    ]);
    lookupStoredRelationValuesForIdsMock.mockResolvedValue(["author-1"]);

    const createdPost = {
      authorId: "author-1",
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p></p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p></p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [],
      seoDescription: null,
      seoTitle: null,
      slug: "untitled-12345678",
      status: "draft" as const,
      tagIds: [],
      title: "",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const queryMock = vi.fn(async (sql: string) => {
      if (/^(begin|commit|rollback)$/i.test(sql) || /for update$/i.test(sql)) return { rows: [] };
        if (sql === "begin" || sql === "commit" || sql === "rollback") {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (sql.includes("information_schema.columns")) {
          return {
            rows: [
              {
                column_default: "gen_random_uuid()",
                data_type: "uuid",
                is_nullable: "NO",
                udt_name: "uuid",
              },
            ],
          };
        }

        if (sql.includes('insert into "public"."posts"')) {
          return {
            rows: [{ id: "post-1" }],
            rowCount: 1,
          };
        }

        if (
          sql.includes('select') &&
          sql.includes('from "public"."posts"') &&
          sql.includes('"author_id"') &&
          sql.includes('limit 1')
        ) {
          return {
            rows: [
              {
                author_id: "author-1",
                id: "post-1",
              },
            ],
            rowCount: 1,
          };
        }

        if (
          sql.includes('select') &&
          sql.includes('from "public"."post_title_helper"') &&
          sql.includes('"title_text" as related_value')
        ) {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (
          sql.includes('select') &&
          sql.includes('from "public"."post_slug_helper"') &&
          sql.includes('"slug_text" as related_value')
        ) {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (
          sql.includes('update "public"."post_title_helper"') ||
          sql.includes('delete from "public"."post_title_helper"') ||
          sql.includes('insert into "public"."post_title_helper"') ||
          sql.includes('delete from "public"."post_slug_helper"') ||
          sql.includes('insert into "public"."post_slug_helper"') ||
          sql.includes('update "public"."author_profiles"') ||
          sql.includes('update "public"."post_meta_rows"')
        ) {
          return {
            rows: [],
            rowCount: sql.includes('update "public"."post_title_helper"') ? 0 : 1,
          };
        }

        throw new Error(`Unexpected query in relation-backed scalar create test: ${sql}`);
      });
    const client = { query: queryMock } as never;

    getMappedContentPostByIdMock.mockResolvedValue(createdPost);

    const result = await createMappedContentPost({
      client,
      mapping,
    });

    expect(result).toEqual(createdPost);

    const insertCall = queryMock.mock.calls.find(([sql]) =>
      (sql as string).includes('insert into "public"."posts"'),
    ) as [string, unknown[]?] | undefined;
    expect(insertCall?.[1]).toEqual(expect.arrayContaining(["author-1"]));

    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('insert into "public"."post_title_helper"'),
    )).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('insert into "public"."post_slug_helper"'),
    )).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('update "public"."author_profiles"'),
    )).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('update "public"."post_meta_rows"'),
    )).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) => sql === "begin")).toBe(true);
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe("commit");
  });

  it("creates helper-row-backed content editor fields during mapped post creation", async () => {
    const mapping = createMapping();
    const posts = mapping.mappingConfig.entities.posts;

    posts.editorFields = [
      {
        column: null,
        id: "content_helper",
        kind: "html",
        label: "Content",
        placeholder: null,
        required: true,
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
    ];

    const createdPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        content_helper: {
          contentHtml: "<p></p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p></p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [],
      seoDescription: null,
      seoTitle: null,
      slug: "untitled-post-1",
      status: "draft" as const,
      tagIds: [],
      title: "",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const queryMock = vi.fn(async (sql: string) => {
      if (/^(begin|commit|rollback)$/i.test(sql) || /for update$/i.test(sql)) return { rows: [] };
        if (sql === "begin" || sql === "commit" || sql === "rollback") {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (sql.includes('insert into "public"."posts"')) {
          return {
            rows: [{ id: "post-1" }],
            rowCount: 1,
          };
        }

        if (
          sql.includes('from "public"."post_content_helper"') &&
          sql.includes('"body_html" as related_value')
        ) {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (
          sql.includes('update "public"."post_content_helper"') ||
          sql.includes('delete from "public"."post_content_helper"') ||
          sql.includes('insert into "public"."post_content_helper"')
        ) {
          return {
            rows: [],
            rowCount: sql.includes('update "public"."post_content_helper"') ? 0 : 1,
          };
        }

        throw new Error(`Unexpected query in helper-row content create test: ${sql}`);
      });
    const client = { query: queryMock } as never;

    getMappedContentPostByIdMock.mockResolvedValue(createdPost);

    await createMappedContentPost({
      client,
      mapping,
    });

    expect(queryMock.mock.calls.some(([sql]) => sql === "begin")).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('update "public"."post_content_helper"'),
    )).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('delete from "public"."post_content_helper"'),
    )).toBe(false);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('insert into "public"."post_content_helper"'),
    )).toBe(true);
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe("commit");
  });

  it("falls back to the primary mapped content column when stale content field ids no longer match the saved mapping", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        legacy_body: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      contentFields: {
        body_html: {
          contentHtml: "<p>Updated body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentHtml: "<p>Updated body</p>",
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      contentFields: {
        legacy_body: {
          contentHtml: "<p>Updated body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentHtml: "<p>Updated body</p>",
      contentJson: createDefaultEditorDoc(),
      mapping: createMapping(),
      postId: "post-1",
    });

    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('"body_html" = $'),
      expect.arrayContaining(["post-1", "<p>Updated body</p>"]),
    );
  });

  it("updates array-index-backed explicit fields while preserving sibling array items", async () => {
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      arrayIndex: 1,
      column: "title_parts",
    };
    mapping.mappingConfig.entities.posts.fields.updatedAt = {
      ...mapping.mappingConfig.entities.posts.fields.updatedAt,
      column: "updated_at",
    };

    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      parentPageId: null,
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Old title",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      title: "New title",
      updatedAt: "2026-03-31T00:00:00.000Z",
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              title_parts: ["keep-me", "Old title", "tail"],
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [],
        }),
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      mapping,
      postId: "post-1",
      title: "New title",
    });

    expect(client.query).toHaveBeenCalledTimes(5);
    expect(client.query.mock.calls[2]?.[0]).toContain(`select "title_parts"`);
    expect(client.query.mock.calls[2]?.[1]).toEqual(["post-1"]);
    expect(client.query.mock.calls[3]?.[1]).toEqual(
      expect.arrayContaining([
        "post-1",
        ["keep-me", "New title", "tail"],
      ]),
    );
  });

  it("updates json-path-backed and array-index-backed content fields without overwriting sibling values", async () => {
    const mapping = createMapping();
    mapping.mappingConfig.entities.posts.editorFields = [
      {
        column: "content_payload",
        id: "content_payload__body_main",
        kind: "html",
        label: "Main content",
        path: "body.main",
        placeholder: null,
        required: true,
        visible: true,
      } as never,
      {
        arrayIndex: 1,
        column: "body_blocks",
        id: "body_blocks__item_2",
        kind: "markdown",
        label: "Summary",
        placeholder: null,
        required: false,
        visible: true,
      } as never,
    ];

    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_blocks__item_2: {
          contentHtml: "<p>Old summary</p>",
          contentJson: createDefaultEditorDoc(),
        },
        content_payload__body_main: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      parentPageId: null,
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Old title",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      contentFields: {
        body_blocks__item_2: {
          contentHtml: "<p>New summary</p>",
          contentJson: createDefaultEditorDoc(),
        },
        content_payload__body_main: {
          contentHtml: "<p>New body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentHtml: "<p>New body</p>",
      contentMarkdown: "New summary",
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              body_blocks: ["keep-intro", "Old summary", "keep-tail"],
              content_payload: {
                body: {
                  main: "<p>Old body</p>",
                  sidebar: "Keep sidebar",
                },
                meta: {
                  keep: true,
                },
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [],
        }),
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      contentFields: {
        body_blocks__item_2: {
          contentHtml: "<p>New summary</p>",
          contentJson: createDefaultEditorDoc(),
        },
        content_payload__body_main: {
          contentHtml: "<p>New body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentHtml: "<p>New body</p>",
      contentJson: createDefaultEditorDoc(),
      mapping,
      postId: "post-1",
    });

    expect(client.query).toHaveBeenCalledTimes(5);
    expect(client.query.mock.calls[2]?.[0]).toContain(`select "content_payload", "body_blocks"`);
    expect(client.query.mock.calls[3]?.[1]).toEqual(
      expect.arrayContaining([
        "post-1",
        {
          body: {
            main: "<p>New body</p>",
            sidebar: "Keep sidebar",
          },
          meta: {
            keep: true,
          },
        },
        ["keep-intro", "New summary", "keep-tail"],
      ]),
    );
  });

  it("prefers the top-level primary content when the editor payload still carries a stale primary content field snapshot", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      contentFields: {
        body_html: {
          contentHtml: "<p>Updated body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentHtml: "<p>Updated body</p>",
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };
    const mapping = createMapping();
    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      column: "title",
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentHtml: "<p>Updated body</p>",
      contentJson: createDefaultEditorDoc(),
      mapping: createMapping(),
      postId: "post-1",
    });

    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('"body_html" = $'),
      expect.arrayContaining(["post-1", "<p>Updated body</p>"]),
    );
  });

  it("wraps post updates and relation writes in one transaction", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      categoryIds: ["category-1"],
      tagIds: ["tag-1"],
      title: "Updated title",
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };
    const mapping = createMapping();
    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      column: "title",
    };

    mapping.mappingConfig.entities.posts.relations.categories = {
      fieldMap: { name: "name" },
      junctionSourceColumn: "post_id",
      junctionTable: "post_categories",
      junctionTargetColumn: "category_id",
      multiple: true,
      sourceColumn: null,
      status: "mapped",
      strategy: "join_table",
      targetColumn: "id",
      targetEntity: "categories",
      targetTable: null,
      valueColumn: null,
    };
    mapping.mappingConfig.entities.posts.relations.tags = {
      fieldMap: { name: "name" },
      junctionSourceColumn: "post_id",
      junctionTable: "post_tags",
      junctionTargetColumn: "tag_id",
      multiple: true,
      sourceColumn: null,
      status: "mapped",
      strategy: "join_table",
      targetColumn: "id",
      targetEntity: "tags",
      targetTable: null,
      valueColumn: null,
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      categoryIds: ["category-1"],
      client,
      mapping,
      postId: "post-1",
      tagIds: ["tag-1"],
      title: "Updated title",
    });

    expect(client.query).toHaveBeenNthCalledWith(1, "begin");
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("update"),
      expect.arrayContaining(["post-1"]),
    );
    expect(client.query).toHaveBeenLastCalledWith("commit");
    expect(applyMappedRelationWriteMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        ids: ["category-1"],
        postId: "post-1",
      }),
    );
    expect(applyMappedRelationWriteMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ids: ["tag-1"],
        postId: "post-1",
      }),
    );
  });

  it("writes mapped parent page foreign keys through the post row update", async () => {
    const mapping = createMapping();
    mapping.mappingConfig.entities.posts.relations.posts = {
      fieldMap: {},
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
    };

    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      parentPageId: null,
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      parentPageId: "post-parent",
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };

    lookupStoredRelationValuesForIdsMock.mockResolvedValueOnce(["post-parent"]);
    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      mapping,
      parentPageId: "post-parent",
      postId: "post-1",
    });

    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[2]?.[0]).toContain('"parent_post_id" = $');
    expect(client.query.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining(["post-1", "post-parent"]),
    );
  });

  it("routes non-foreign-key author saves through applyMappedRelationWrite", async () => {
    const mapping = createMapping();
    mapping.mappingConfig.entities.authors.source = {
      kind: "table",
      primaryKey: "id",
      schema: "public",
      table: "authors",
    };
    mapping.mappingConfig.entities.authors.status = "mapped";
    mapping.mappingConfig.entities.posts.relations.authors = {
      fieldMap: {},
      junctionSourceColumn: "post_id",
      junctionTable: "post_author_helper",
      junctionTargetColumn: null,
      multiple: false,
      sourceColumn: null,
      status: "mapped",
      strategy: "join_row",
      targetColumn: "slug",
      targetEntity: "authors",
      targetTable: "public.authors",
      valueColumn: "author_slug",
    };

    const existingPost = {
      authorId: "author-1",
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      parentPageId: null,
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      authorId: "author-2",
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      authorId: "author-2",
      client,
      mapping,
      postId: "post-1",
    });

    expect(client.query).toHaveBeenNthCalledWith(1, "begin");
    expect(applyMappedRelationWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        ids: ["author-2"],
        postId: "post-1",
        relation: expect.objectContaining({
          strategy: "join_row",
          valueColumn: "author_slug",
        }),
      }),
    );
    expect(client.query).toHaveBeenLastCalledWith("commit");
  });

  it("writes single-storage category foreign keys directly onto the post row", async () => {
    const mapping = createMapping();
    mapping.mappingConfig.entities.categories.source = {
      kind: "table",
      primaryKey: "id",
      schema: "public",
      table: "categories",
    };
    mapping.mappingConfig.entities.categories.status = "mapped";
    mapping.mappingConfig.entities.posts.relations.categories = {
      fieldMap: {},
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
    };

    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      parentPageId: null,
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      categoryIds: ["category-1"],
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };

    lookupStoredRelationValuesForIdsMock.mockResolvedValueOnce(["category-1"]);
    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      categoryIds: ["category-1"],
      client,
      mapping,
      postId: "post-1",
    });

    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[2]?.[0]).toContain('"category_id" = $');
    expect(client.query.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining(["post-1", "category-1"]),
    );
    expect(applyMappedRelationWriteMock).not.toHaveBeenCalled();
  });

  it("writes custom relation fields through direct-row and relation-link paths", async () => {
    const mapping = createMapping();
    mapping.mappingConfig.entities.authors.source = {
      kind: "table",
      primaryKey: "id",
      schema: "public",
      table: "authors",
    };
    mapping.mappingConfig.entities.authors.status = "mapped";
    mapping.mappingConfig.entities.media.source = {
      kind: "table",
      primaryKey: "id",
      schema: "public",
      table: "media",
    };
    mapping.mappingConfig.entities.media.status = "mapped";
    mapping.mappingConfig.entities.files.source = {
      kind: "table",
      primaryKey: "id",
      schema: "public",
      table: "files",
    };
    mapping.mappingConfig.entities.files.status = "mapped";
    mapping.mappingConfig.entities.posts.customRelationFields = [
      {
        enabled: true,
        fieldKey: "sponsor_author_id",
        isNullable: true,
        kind: "single_relation",
        label: "Sponsor Author",
        relation: {
          fieldMap: {},
          junctionSourceColumn: null,
          junctionTable: null,
          junctionTargetColumn: null,
          multiple: false,
          sourceColumn: "sponsor_author_id",
          status: "mapped",
          strategy: "foreign_key",
          targetColumn: "id",
          targetEntity: "authors",
          targetTable: "public.authors",
          valueColumn: null,
        },
      },
      {
        enabled: true,
        fieldKey: "hero_media_id",
        isNullable: true,
        kind: "media_relation_single",
        label: "Hero Media",
        relation: {
          fieldMap: {},
          junctionSourceColumn: null,
          junctionTable: null,
          junctionTargetColumn: null,
          multiple: false,
          sourceColumn: "hero_media_id",
          status: "mapped",
          strategy: "foreign_key",
          targetColumn: "id",
          targetEntity: "media",
          targetTable: "public.media",
          valueColumn: null,
        },
      },
      {
        enabled: true,
        fieldKey: "gallery_media_ids",
        isNullable: true,
        kind: "media_relation_multi",
        label: "Gallery Media",
        relation: {
          fieldMap: {},
          junctionSourceColumn: "post_id",
          junctionTable: "post_media",
          junctionTargetColumn: "media_id",
          multiple: true,
          sourceColumn: null,
          status: "mapped",
          strategy: "join_table",
          targetColumn: "id",
          targetEntity: "media",
          targetTable: "public.media",
          valueColumn: null,
        },
      },
      {
        enabled: true,
        fieldKey: "attachment_file_id",
        isNullable: true,
        kind: "file_relation_single",
        label: "Attachment File",
        relation: {
          fieldMap: {},
          junctionSourceColumn: null,
          junctionTable: null,
          junctionTargetColumn: null,
          multiple: false,
          sourceColumn: "attachment_file_id",
          status: "mapped",
          strategy: "foreign_key",
          targetColumn: "id",
          targetEntity: "files",
          targetTable: "public.files",
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
          fieldMap: {},
          junctionSourceColumn: "post_id",
          junctionTable: "post_related_posts",
          junctionTargetColumn: "related_post_id",
          multiple: true,
          sourceColumn: null,
          status: "mapped",
          strategy: "join_table",
          targetColumn: "id",
          targetEntity: "posts",
          targetTable: "public.posts",
          valueColumn: null,
        },
      },
      {
        enabled: true,
        fieldKey: "reference_file_ids",
        isNullable: true,
        kind: "file_relation_multi",
        label: "Reference Files",
        relation: {
          fieldMap: {},
          junctionSourceColumn: "post_id",
          junctionTable: "post_files",
          junctionTargetColumn: "file_id",
          multiple: true,
          sourceColumn: null,
          status: "mapped",
          strategy: "join_table",
          targetColumn: "id",
          targetEntity: "files",
          targetTable: "public.files",
          valueColumn: null,
        },
      },
    ];

    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {
        attachment_file_id: null,
        gallery_media_ids: [],
        hero_media_id: null,
        related_post_ids: [],
        reference_file_ids: [],
        sponsor_author_id: null,
      },
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      parentPageId: null,
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      customFields: {
        attachment_file_id: "file-2",
        gallery_media_ids: ["media-3", "media-4"],
        hero_media_id: "media-2",
        related_post_ids: ["post-2"],
        reference_file_ids: ["file-3"],
        sponsor_author_id: "author-2",
      },
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };

    lookupStoredRelationValuesForIdsMock
      .mockResolvedValueOnce(["author-2"])
      .mockResolvedValueOnce(["media-2"])
      .mockResolvedValueOnce(["file-2"]);
    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      customFields: {
        attachment_file_id: "file-2",
        gallery_media_ids: ["media-3", "media-4"],
        hero_media_id: "media-2",
        related_post_ids: ["post-2", "post-1"],
        reference_file_ids: ["file-3"],
        sponsor_author_id: "author-2",
      },
      mapping,
      postId: "post-1",
    });

    expect(client.query).toHaveBeenNthCalledWith(1, "begin");
    expect(client.query.mock.calls[2]?.[0]).toContain('"sponsor_author_id" = $');
    expect(client.query.mock.calls[2]?.[0]).toContain('"hero_media_id" = $');
    expect(client.query.mock.calls[2]?.[0]).toContain('"attachment_file_id" = $');
    expect(client.query.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining(["post-1", "author-2", "media-2", "file-2"]),
    );
    expect(applyMappedRelationWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        ids: ["post-2"],
        postId: "post-1",
        relation: expect.objectContaining({
          junctionTable: "post_related_posts",
          strategy: "join_table",
        }),
      }),
    );
    expect(applyMappedRelationWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        ids: ["media-3", "media-4"],
        postId: "post-1",
        relation: expect.objectContaining({
          junctionTable: "post_media",
          strategy: "join_table",
        }),
      }),
    );
    expect(applyMappedRelationWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        ids: ["file-3"],
        postId: "post-1",
        relation: expect.objectContaining({
          junctionTable: "post_files",
          strategy: "join_table",
        }),
      }),
    );
    expect(client.query).toHaveBeenLastCalledWith("commit");
  });

  it("writes every mutable explicit built-in field through direct-column storage", async () => {
    const mapping = createMapping();
    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      column: "headline",
    };
    mapping.mappingConfig.entities.posts.fields.slug = {
      ...mapping.mappingConfig.entities.posts.fields.slug,
      column: "route_slug",
    };
    mapping.mappingConfig.entities.posts.fields.excerpt = {
      ...mapping.mappingConfig.entities.posts.fields.excerpt,
      column: "summary",
    };
    mapping.mappingConfig.entities.posts.fields.featuredImageUrl = {
      ...mapping.mappingConfig.entities.posts.fields.featuredImageUrl,
      column: "featured_image_url",
    };
    mapping.mappingConfig.entities.posts.fields.focusKeyword = {
      ...mapping.mappingConfig.entities.posts.fields.focusKeyword,
      column: "focus_keyword",
    };
    mapping.mappingConfig.entities.posts.fields.publishedAt = {
      ...mapping.mappingConfig.entities.posts.fields.publishedAt,
      column: "published_at",
    };
    mapping.mappingConfig.entities.posts.fields.seoDescription = {
      ...mapping.mappingConfig.entities.posts.fields.seoDescription,
      column: "seo_description",
    };
    mapping.mappingConfig.entities.posts.fields.seoTitle = {
      ...mapping.mappingConfig.entities.posts.fields.seoTitle,
      column: "seo_title",
    };
    mapping.mappingConfig.entities.posts.workflow = {
      archivedValues: ["archived"],
      customValues: [],
      draftValues: ["draft"],
      mode: "status",
      publishedAtColumn: "published_at",
      publishedFlagColumn: null,
      publishedValues: ["published"],
      statusColumn: "publication_state",
    };
    mapping.mappingConfig.entities.posts.relations.authors = {
      fieldMap: {},
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
    };
    mapping.mappingConfig.entities.posts.relations.categories = {
      fieldMap: {},
      junctionSourceColumn: "post_id",
      junctionTable: "post_categories",
      junctionTargetColumn: "category_id",
      multiple: true,
      sourceColumn: null,
      status: "mapped",
      strategy: "join_table",
      targetColumn: "id",
      targetEntity: "categories",
      targetTable: null,
      valueColumn: null,
    };
    mapping.mappingConfig.entities.posts.relations.posts = {
      fieldMap: {},
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
    };
    mapping.mappingConfig.entities.posts.relations.tags = {
      fieldMap: {},
      junctionSourceColumn: "post_id",
      junctionTable: "post_tags",
      junctionTargetColumn: "tag_id",
      multiple: true,
      sourceColumn: null,
      status: "mapped",
      strategy: "join_table",
      targetColumn: "id",
      targetEntity: "tags",
      targetTable: null,
      valueColumn: null,
    };

    const existingPost = {
      authorId: "author-1",
      categoryIds: ["category-1"],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: "Old excerpt",
      featuredImageUrl: "https://example.com/old.png",
      focusKeyword: "old-keyword",
      id: "post-1",
      parentPageId: "post-root",
      publishedAt: null,
      seoDescription: "Old SEO Description",
      seoTitle: "Old SEO Title",
      slug: "post-1",
      status: "draft" as const,
      tagIds: ["tag-1"],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      authorId: "author-2",
      categoryIds: ["category-2", "category-3"],
      contentFields: {
        body_html: {
          contentHtml: "<p>Updated body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentHtml: "<p>Updated body</p>",
      excerpt: "New excerpt",
      featuredImageUrl: "https://example.com/new.png",
      focusKeyword: "new-keyword",
      parentPageId: "post-parent",
      publishedAt: "2026-04-06T08:30:00.000Z",
      seoDescription: "New SEO Description",
      seoTitle: "New SEO Title",
      slug: "new-post-1",
      status: "published" as const,
      tagIds: ["tag-2", "tag-3"],
      title: "Updated title",
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };

    lookupStoredRelationValuesForIdsMock
      .mockResolvedValueOnce(["author-2"])
      .mockResolvedValueOnce(["post-parent"]);
    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      authorId: "author-2",
      categoryIds: ["category-2", "category-3"],
      client,
      contentHtml: "<p>Updated body</p>",
      contentJson: createDefaultEditorDoc(),
      excerpt: "New excerpt",
      featuredImageUrl: "https://example.com/new.png",
      focusKeyword: "new-keyword",
      mapping,
      parentPageId: "post-parent",
      postId: "post-1",
      publishedAt: "2026-04-06T08:30:00.000Z",
      seoDescription: "New SEO Description",
      seoTitle: "New SEO Title",
      slug: "new-post-1",
      status: "published",
      tagIds: ["tag-2", "tag-3"],
      title: "Updated title",
    });

    expect(client.query).toHaveBeenNthCalledWith(1, "begin");
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("update"),
      expect.arrayContaining([
        "post-1",
        "Updated title",
        "new-post-1",
        "New excerpt",
        "New SEO Title",
        "New SEO Description",
        "new-keyword",
        "https://example.com/new.png",
        "<p>Updated body</p>",
        "published",
        "2026-04-06T08:30:00.000Z",
        "author-2",
        "post-parent",
      ]),
    );
    expect(client.query).toHaveBeenLastCalledWith("commit");
    expect(applyMappedRelationWriteMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        ids: ["category-2", "category-3"],
        postId: "post-1",
      }),
    );
    expect(applyMappedRelationWriteMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ids: ["tag-2", "tag-3"],
        postId: "post-1",
      }),
    );
  });

  it("rolls back post updates when a relation write fails", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };
    const mapping = createMapping();
    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      column: "title",
    };

    mapping.mappingConfig.entities.posts.relations.categories = {
      fieldMap: { name: "name" },
      junctionSourceColumn: "post_id",
      junctionTable: "post_categories",
      junctionTargetColumn: "category_id",
      multiple: true,
      sourceColumn: null,
      status: "mapped",
      strategy: "join_table",
      targetColumn: "id",
      targetEntity: "categories",
      targetTable: null,
      valueColumn: null,
    };

    getMappedContentPostByIdMock.mockResolvedValue(existingPost);
    applyMappedRelationWriteMock.mockRejectedValueOnce(new Error("relation write failed"));

    await expect(
      updateMappedContentPost({
        categoryIds: ["category-1"],
        client,
        mapping,
        postId: "post-1",
        title: "Updated title",
      }),
    ).rejects.toThrow("relation write failed");

    expect(client.query).toHaveBeenNthCalledWith(1, "begin");
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("update"),
      expect.arrayContaining(["post-1"]),
    );
    expect(client.query).toHaveBeenLastCalledWith("rollback");
    expect(getMappedContentPostByIdMock).toHaveBeenCalledTimes(1);
  });

  it("rejects stale optimistic updatedAt tokens before writing", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };

    getMappedContentPostByIdMock.mockResolvedValue(existingPost);

    await expect(
      updateMappedContentPost({
        client,
        expectedUpdatedAt: "2026-03-29T00:00:00.000Z",
        mapping: createMapping(),
        postId: "post-1",
        title: "Updated title",
      }),
    ).rejects.toMatchObject({
      errors: [
        expect.objectContaining({
          code: "stale_row_conflict",
          fieldKey: "updatedAt",
          metadata: {
            currentUpdatedAt: "2026-03-30T00:00:00.000Z",
            expectedUpdatedAt: "2026-03-29T00:00:00.000Z",
          },
        }),
      ],
      message: "This post has changed since you loaded it. Reload and try again.",
    });

    expect(client.query.mock.calls.some(([sql]) => /^(update|insert|delete)\b/i.test(sql.trim()))).toBe(false);
  });

  it("accepts optimistic updatedAt tokens when the stored timestamp only differs by Postgres microseconds", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [],
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.123456+00:00",
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };
    const mapping = createMapping();
    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      column: "title",
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce({
        ...existingPost,
        title: "Updated title",
      });

    await expect(
      updateMappedContentPost({
        client,
        expectedUpdatedAt: "2026-03-30T00:00:00.123Z",
        mapping,
        postId: "post-1",
        title: "Updated title",
      }),
    ).resolves.toMatchObject({
      title: "Updated title",
    });

    expect(client.query).toHaveBeenCalled();
  });

  it("does not write the mapped updatedAt column when the field is read-only and only used as a save token", async () => {
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.fields.updatedAt = {
      ...mapping.mappingConfig.entities.posts.fields.updatedAt,
      column: "updated_at",
    };
    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      column: "title",
    };

    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [],
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const queryMock = vi.fn(async (sql: string) => {
      if (/^(begin|commit|rollback)$/i.test(sql) || /for update$/i.test(sql)) return { rows: [] };
      if (sql.includes('select') && sql.includes('from "public"."posts"') && sql.includes('limit 1')) {
        return {
          rows: [
            {
              body_html: "<p>Old body</p>",
              excerpt: null,
              featured_image_url: null,
              focus_keyword: null,
              seo_description: null,
              seo_title: null,
              slug: "post-1",
              title: "Post 1",
              updated_at: "2026-03-30T00:00:00.000Z",
            },
          ],
        };
      }

      if (sql.includes('update "public"."posts"')) {
        return {
          rows: [],
        };
      }

      throw new Error(`Unexpected query in read-only updatedAt save test: ${sql}`);
    });
    const client = { query: queryMock } as never;

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce({
        ...existingPost,
        title: "Updated title",
      });

    await expect(
      updateMappedContentPost({
        client,
        expectedUpdatedAt: "2026-03-30T00:00:00.000Z",
        mapping,
        postId: "post-1",
        title: "Updated title",
      }),
    ).resolves.toMatchObject({
      title: "Updated title",
    });

    const updateCall = queryMock.mock.calls.find(([sql]) =>
      (sql as string).includes('update "public"."posts"'),
    );

    expect(updateCall?.[0]).not.toContain('"updated_at"');
  });

  it("updates built-in scalar fields through helper rows and related target rows", async () => {
    const mapping = createMapping();
    const posts = mapping.mappingConfig.entities.posts;

    posts.fields.title = {
      ...posts.fields.title,
      column: null,
      sourceRelation: {
        junctionSourceColumn: "post_id",
        junctionTable: "public.post_title_helper",
        sourceColumn: null,
        strategy: "related_row_by_post_id",
        targetColumn: null,
        targetTable: null,
        valueColumn: "title_text",
      },
    };
    posts.fields.slug = {
      ...posts.fields.slug,
      column: null,
      sourceRelation: {
        junctionSourceColumn: "post_id",
        junctionTable: "public.post_slug_helper",
        sourceColumn: null,
        strategy: "join_row",
        targetColumn: null,
        targetTable: null,
        valueColumn: "slug_text",
      },
    };
    posts.fields.excerpt = {
      ...posts.fields.excerpt,
      column: null,
      sourceRelation: {
        junctionSourceColumn: null,
        junctionTable: null,
        sourceColumn: "excerpt_row_id",
        strategy: "foreign_key",
        targetColumn: "id",
        targetTable: "public.post_excerpt_rows",
        valueColumn: "excerpt_text",
      },
    };
    posts.fields.seoTitle = {
      ...posts.fields.seoTitle,
      column: null,
      sourceRelation: {
        junctionSourceColumn: null,
        junctionTable: null,
        sourceColumn: "meta_row_id",
        strategy: "foreign_key",
        targetColumn: "id",
        targetTable: "public.post_meta_rows",
        valueColumn: "meta_title",
      },
    };
    posts.fields.seoDescription = {
      ...posts.fields.seoDescription,
      column: null,
      sourceRelation: {
        junctionSourceColumn: null,
        junctionTable: null,
        sourceColumn: "meta_row_id",
        strategy: "foreign_key",
        targetColumn: "id",
        targetTable: "public.post_meta_rows",
        valueColumn: "meta_description",
      },
    };
    posts.fields.focusKeyword = {
      ...posts.fields.focusKeyword,
      column: null,
      sourceRelation: {
        junctionSourceColumn: null,
        junctionTable: null,
        sourceColumn: "meta_row_id",
        strategy: "foreign_key",
        targetColumn: "id",
        targetTable: "public.post_meta_rows",
        valueColumn: "focus_keyword",
      },
    };
    posts.fields.featuredImageUrl = {
      ...posts.fields.featuredImageUrl,
      column: null,
      sourceRelation: {
        junctionSourceColumn: null,
        junctionTable: null,
        sourceColumn: "meta_row_id",
        strategy: "foreign_key",
        targetColumn: "id",
        targetTable: "public.post_meta_rows",
        valueColumn: "featured_image_url",
      },
    };
    posts.fields.updatedAt = {
      ...posts.fields.updatedAt,
      column: "updated_at",
    };

    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: "Old excerpt",
      featuredImageUrl: "https://example.com/old.png",
      focusKeyword: "old keyword",
      id: "post-1",
      publishedAt: null,
      redirects: [],
      seoDescription: "Old meta description",
      seoTitle: "Old meta title",
      slug: "old-slug",
      status: "draft" as const,
      tagIds: [],
      title: "Old title",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      excerpt: "Fresh excerpt",
      featuredImageUrl: "https://example.com/fresh.png",
      focusKeyword: "fresh keyword",
      seoDescription: "Fresh meta description",
      seoTitle: "Fresh meta title",
      slug: "fresh-slug",
      title: "Fresh title",
      updatedAt: "2026-03-31T00:00:00.000Z",
    };
    const queryMock = vi.fn(async (sql: string) => {
      if (/^(begin|commit|rollback)$/i.test(sql) || /for update$/i.test(sql)) return { rows: [] };
        if (sql === "begin" || sql === "commit" || sql === "rollback") {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (
          sql.includes('select') &&
          sql.includes('from "public"."posts"') &&
          sql.includes('"excerpt_row_id"') &&
          sql.includes('"meta_row_id"')
        ) {
          return {
            rows: [
              {
                excerpt_row_id: "excerpt-row-1",
                meta_row_id: "meta-row-1",
              },
            ],
            rowCount: 1,
          };
        }

        if (
          sql.includes('select') &&
          sql.includes('from "public"."post_title_helper"') &&
          sql.includes('"title_text" as related_value')
        ) {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (
          sql.includes('select') &&
          sql.includes('from "public"."post_slug_helper"') &&
          sql.includes('"slug_text" as related_value')
        ) {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (sql.includes('from "public"."post_slug_helper"') && sql.includes('limit 1')) {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (sql.includes('update "public"."posts"')) {
          return {
            rows: [],
            rowCount: 1,
          };
        }

        if (
          sql.includes('update "public"."post_title_helper"') ||
          sql.includes('delete from "public"."post_title_helper"') ||
          sql.includes('insert into "public"."post_title_helper"') ||
          sql.includes('delete from "public"."post_slug_helper"') ||
          sql.includes('insert into "public"."post_slug_helper"') ||
          sql.includes('update "public"."post_excerpt_rows"') ||
          sql.includes('update "public"."post_meta_rows"')
        ) {
          return {
            rows: [],
            rowCount: 1,
          };
        }

        throw new Error(`Unexpected query in relation-backed scalar write test: ${sql}`);
      });
    const client = { query: queryMock } as never;

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    const result = await updateMappedContentPost({
      client,
      excerpt: "Fresh excerpt",
      featuredImageUrl: "https://example.com/fresh.png",
      focusKeyword: "fresh keyword",
      mapping,
      postId: "post-1",
      seoDescription: "Fresh meta description",
      seoTitle: "Fresh meta title",
      slug: "Fresh Slug",
      title: "Fresh title",
    });

    expect(result).toEqual(updatedPost);

    const updateCall = queryMock.mock.calls.find(([sql]) =>
      (sql as string).includes('update "public"."posts"'),
    );

    expect(updateCall).toBeUndefined();

    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('update "public"."post_title_helper"'),
    )).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('delete from "public"."post_title_helper"'),
    )).toBe(false);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('insert into "public"."post_title_helper"'),
    )).toBe(false);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('delete from "public"."post_slug_helper"'),
    )).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('insert into "public"."post_slug_helper"'),
    )).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('update "public"."post_excerpt_rows"'),
    )).toBe(true);
    expect(queryMock.mock.calls.filter(([sql]) =>
      (sql as string).includes('update "public"."post_meta_rows"'),
    )).toHaveLength(4);
  });

  it("patches related-row scalar helper columns without deleting sibling values", async () => {
    const mapping = createMapping();
    const posts = mapping.mappingConfig.entities.posts;

    posts.fields.seoTitle = {
      ...posts.fields.seoTitle,
      column: null,
      sourceRelation: {
        junctionSourceColumn: "story_id",
        junctionTable: "public.story_meta",
        sourceColumn: null,
        strategy: "related_row_by_post_id",
        targetColumn: null,
        targetTable: null,
        valueColumn: "seo_title",
      },
    };
    posts.fields.seoDescription = {
      ...posts.fields.seoDescription,
      column: null,
      sourceRelation: {
        junctionSourceColumn: "story_id",
        junctionTable: "public.story_meta",
        sourceColumn: null,
        strategy: "related_row_by_post_id",
        targetColumn: null,
        targetTable: null,
        valueColumn: "seo_description",
      },
    };

    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [],
      seoDescription: "Old helper description",
      seoTitle: "Old helper title",
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      seoDescription: "Fresh helper description",
      seoTitle: "Fresh helper title",
    };
    const queryMock = vi.fn(async (sql: string) => {
      if (/^(begin|commit|rollback)$/i.test(sql) || /for update$/i.test(sql)) return { rows: [] };
      if (sql === "begin" || sql === "commit" || sql === "rollback") {
        return {
          rows: [],
          rowCount: 0,
        };
      }

      if (
        sql.includes('select') &&
        sql.includes('from "public"."story_meta"') &&
        sql.includes('as related_value')
      ) {
        return {
          rows: [],
          rowCount: 0,
        };
      }

      if (sql.includes('update "public"."story_meta"')) {
        return {
          rows: [],
          rowCount: 1,
        };
      }

      if (sql.includes('insert into "public"."story_meta"')) {
        return {
          rows: [],
          rowCount: 1,
        };
      }

      throw new Error(`Unexpected query in helper-row sibling scalar write test: ${sql}`);
    });
    const client = { query: queryMock } as never;

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      mapping,
      postId: "post-1",
      seoDescription: "Fresh helper description",
      seoTitle: "Fresh helper title",
    });

    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('delete from "public"."story_meta"'),
    )).toBe(false);
    expect(queryMock.mock.calls.filter(([sql]) =>
      (sql as string).includes('update "public"."story_meta"'),
    )).toHaveLength(2);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('insert into "public"."story_meta"'),
    )).toBe(false);
  });

  it("updates helper-row-backed content editor fields through relation-backed writes", async () => {
    const mapping = createMapping();
    const posts = mapping.mappingConfig.entities.posts;
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        content_helper: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [],
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      contentFields: {
        content_helper: {
          contentHtml: "<p>Updated body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentHtml: "<p>Updated body</p>",
    };

    posts.editorFields = [
      {
        column: null,
        id: "content_helper",
        kind: "html",
        label: "Content",
        placeholder: null,
        required: true,
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
    ];

    const queryMock = vi.fn(async (sql: string) => {
      if (/^(begin|commit|rollback)$/i.test(sql) || /for update$/i.test(sql)) return { rows: [] };
        if (sql === "begin" || sql === "commit" || sql === "rollback") {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (
          sql.includes('from "public"."post_content_helper"') &&
          sql.includes('"body_html" as related_value')
        ) {
          return {
            rows: [],
            rowCount: 0,
          };
        }

        if (
          sql.includes('update "public"."post_content_helper"') ||
          sql.includes('delete from "public"."post_content_helper"') ||
          sql.includes('insert into "public"."post_content_helper"')
        ) {
          return {
            rows: [],
            rowCount: 1,
          };
        }

        throw new Error(`Unexpected query in helper-row content update test: ${sql}`);
      });
    const client = { query: queryMock } as never;

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      contentHtml: "<p>Updated body</p>",
      mapping,
      postId: "post-1",
    });

    expect(queryMock.mock.calls.some(([sql]) => sql === "begin")).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('update "public"."post_content_helper"'),
    )).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('delete from "public"."post_content_helper"'),
    )).toBe(false);
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe("commit");
  });

  it("patches JSON-path-backed explicit fields without replacing sibling JSON data", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: "Old excerpt",
      featuredImageUrl: "https://example.com/old.png",
      focusKeyword: "old-keyword",
      id: "post-1",
      publishedAt: null,
      seoDescription: "Old SEO Description",
      seoTitle: "Old SEO Title",
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      featuredImageUrl: "https://example.com/new.png",
      focusKeyword: "new-keyword",
      seoDescription: "New SEO Description",
      seoTitle: "New SEO Title",
      slug: "new-post-1",
      title: "Updated title",
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              meta_payload: {
                featured: {
                  url: "https://example.com/old.png",
                },
                seo: {
                  description: "Old SEO Description",
                  title: "Old SEO Title",
                  untouched: "keep-me",
                },
                title: "Post 1",
              },
              route_payload: {
                slug: {
                  current: "post-1",
                  previous: ["legacy-post-1"],
                },
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [],
        }),
    };
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      column: "meta_payload",
      path: "title",
    };
    mapping.mappingConfig.entities.posts.fields.featuredImageUrl = {
      ...mapping.mappingConfig.entities.posts.fields.featuredImageUrl,
      column: "meta_payload",
      path: "featured.url",
    };
    mapping.mappingConfig.entities.posts.fields.focusKeyword = {
      ...mapping.mappingConfig.entities.posts.fields.focusKeyword,
      column: "meta_payload",
      path: "seo.keyword",
    };
    mapping.mappingConfig.entities.posts.fields.seoDescription = {
      ...mapping.mappingConfig.entities.posts.fields.seoDescription,
      column: "meta_payload",
      path: "seo.description",
    };
    mapping.mappingConfig.entities.posts.fields.seoTitle = {
      ...mapping.mappingConfig.entities.posts.fields.seoTitle,
      column: "meta_payload",
      path: "seo.title",
    };
    mapping.mappingConfig.entities.posts.fields.slug = {
      ...mapping.mappingConfig.entities.posts.fields.slug,
      column: "route_payload",
      path: "slug.current",
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      featuredImageUrl: "https://example.com/new.png",
      focusKeyword: "new-keyword",
      mapping,
      postId: "post-1",
      seoDescription: "New SEO Description",
      seoTitle: "New SEO Title",
      slug: "new-post-1",
      title: "Updated title",
    });

    expect(client.query).toHaveBeenCalledTimes(5);
    expect(client.query.mock.calls[2]?.[0]).toContain('select "meta_payload", "route_payload"');
    expect(client.query.mock.calls[3]?.[0]).toContain("update");
    expect(client.query.mock.calls[3]?.[1]).toEqual(
      expect.arrayContaining([
        "post-1",
        expect.objectContaining({
          featured: {
            url: "https://example.com/new.png",
          },
          seo: {
            description: "New SEO Description",
            keyword: "new-keyword",
            title: "New SEO Title",
            untouched: "keep-me",
          },
          title: "Updated title",
        }),
        expect.objectContaining({
          slug: {
            current: "new-post-1",
            previous: ["legacy-post-1"],
          },
        }),
      ]),
    );
  });

  it("does not let unmapped dirty state overwrite a JSON-path title-only update", async () => {
    const existingPayload = {
      dates: {
        published: "2026-03-30T00:00:00.000Z",
      },
      headline: "Old JSON title",
      route: {
        slug: "old-json-title",
      },
      seo: {
        description: "Old description",
        focus: "old-focus",
        title: "Old SEO title",
      },
      summary: "Old summary",
    };
    const existingPost = {
      authorId: "json-author",
      categoryIds: [],
      contentFields: {
        content_html: {
          contentHtml: "<p>Old body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Old body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: "Old summary",
      featuredImageUrl: null,
      focusKeyword: "old-focus",
      id: "post-1",
      publishedAt: JSON.stringify(existingPayload),
      seoDescription: "Old description",
      seoTitle: "Old SEO title",
      slug: "old-json-title",
      status: "published" as const,
      tagIds: [],
      title: "Old JSON title",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      title: "New JSON title",
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              payload: existingPayload,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [],
        }),
    };
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.fields.title = {
      ...mapping.mappingConfig.entities.posts.fields.title,
      column: "payload",
      path: "headline",
    };
    mapping.mappingConfig.entities.posts.fields.slug = {
      ...mapping.mappingConfig.entities.posts.fields.slug,
      column: "payload",
      path: "route.slug",
    };
    mapping.mappingConfig.entities.posts.fields.excerpt = {
      ...mapping.mappingConfig.entities.posts.fields.excerpt,
      column: "payload",
      path: "summary",
    };
    mapping.mappingConfig.entities.posts.fields.seoTitle = {
      ...mapping.mappingConfig.entities.posts.fields.seoTitle,
      column: "payload",
      path: "seo.title",
    };
    mapping.mappingConfig.entities.posts.fields.seoDescription = {
      ...mapping.mappingConfig.entities.posts.fields.seoDescription,
      column: "payload",
      path: "seo.description",
    };
    mapping.mappingConfig.entities.posts.fields.focusKeyword = {
      ...mapping.mappingConfig.entities.posts.fields.focusKeyword,
      column: "payload",
      path: "seo.focus",
    };
    mapping.mappingConfig.entities.posts.fields.publishedAt = {
      ...mapping.mappingConfig.entities.posts.fields.publishedAt,
      column: "payload",
      path: "dates.published",
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      mapping,
      postId: "post-1",
      title: "New JSON title",
    });

    expect(client.query).toHaveBeenCalledTimes(5);
    expect(client.query.mock.calls[3]?.[0]).toContain("update");
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      "post-1",
      {
        ...existingPayload,
        headline: "New JSON title",
      },
    ]);
  });

  it("serializes redirects into JSON text columns during mapped updates", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: ["legacy-post-1"],
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      redirects: ["old-post", "older-post"],
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              redirect_history: '["legacy-post-1"]',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [],
        }),
    };
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.fields.redirects = {
      column: "redirect_history",
      kind: "plain_text",
      label: "Redirects",
      path: null,
      required: false,
      visible: true,
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      mapping,
      postId: "post-1",
      redirects: [" old-post ", "older-post", "old-post", ""],
    });

    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[2]?.[0]).toContain('set "redirect_history" = $2');
    expect(client.query.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining(["post-1", '["old-post","older-post"]']),
    );
  });

  it("serializes structured redirect rows into JSON text columns during mapped updates", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [{ source: "legacy-post-1" }],
      seoDescription: null,
      seoTitle: null,
      slug: "post-1",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      redirects: [
        {
          active: true,
          locale: "en",
          source: "old-post",
          statusCode: 301,
        },
      ],
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              redirect_history: '[{"source":"legacy-post-1"}]',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [],
        }),
    };
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.fields.redirects = {
      column: "redirect_history",
      kind: "plain_text",
      label: "Redirects",
      path: null,
      required: false,
      visible: true,
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      mapping,
      postId: "post-1",
      redirects: [
        {
          active: true,
          locale: "en",
          source: "old-post",
          statusCode: 301,
        },
      ],
    });

    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining([
        "post-1",
        '[{"source":"old-post","statusCode":301,"active":true,"locale":"en"}]',
      ]),
    );
  });

  it("auto-adds the previous slug to redirects when a mapped slug changes", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: ["legacy-post-1"],
      seoDescription: null,
      seoTitle: null,
      slug: "old-post",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      redirects: ["legacy-post-1", "old-post"],
      slug: "new-post",
    };
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
        rows: [],
      }),
    };
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.fields.slug = {
      ...mapping.mappingConfig.entities.posts.fields.slug,
      column: "slug",
    };
    mapping.mappingConfig.entities.posts.fields.redirects = {
      column: "redirect_history",
      kind: "plain_text",
      label: "Redirects",
      path: null,
      required: false,
      visible: true,
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      mapping,
      postId: "post-1",
      slug: "new-post",
    });

    expect(client.query).toHaveBeenCalledTimes(4);
    const updateCall = client.query.mock.calls.find(([sql]) =>
      (sql as string).includes('update "public"."posts"'),
    );
    expect(updateCall?.[0]).toContain('set "slug" = $2');
    expect(updateCall?.[0]).toContain('"redirect_history" = $3');
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining(["post-1", "new-post", '["legacy-post-1","old-post"]']),
    );
  });

  it("preserves manual redirects while auto-adding the previous slug when a mapped slug changes", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {},
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: ["legacy-post-1"],
      seoDescription: null,
      seoTitle: null,
      slug: "old-post",
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      redirects: ["manual-legacy", "old-post"],
      slug: "new-post",
    };
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
        rows: [],
      }),
    };
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.fields.slug = {
      ...mapping.mappingConfig.entities.posts.fields.slug,
      column: "slug",
    };
    mapping.mappingConfig.entities.posts.fields.redirects = {
      column: "redirect_history",
      kind: "plain_text",
      label: "Redirects",
      path: null,
      required: false,
      visible: true,
    };

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      mapping,
      postId: "post-1",
      redirects: ["manual-legacy"],
      slug: "new-post",
    });

    expect(client.query).toHaveBeenCalledTimes(4);
    const updateCall = client.query.mock.calls.find(([sql]) =>
      (sql as string).includes('update "public"."posts"'),
    );
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining(["post-1", "new-post", '["manual-legacy","old-post"]']),
    );
  });

  it("writes non-direct custom scalar fields without overwriting sibling JSON or array values", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {
        card_title: "Old title",
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
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      customFields: {
        card_title: "New title",
        secondary_tag: "delta",
      },
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.customFields = [
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
      } as never,
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
      } as never,
    ];

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      customFields: {
        card_title: "New title",
        secondary_tag: "delta",
      },
      mapping,
      postId: "post-1",
    });

    const updateCall = client.query.mock.calls.find(([sql]) =>
      (sql as string).includes('update "public"."posts"'),
    );

    expect(updateCall?.[0]).toContain('"metadata" = $');
    expect(updateCall?.[0]).toContain('"tag_slots" = $');
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining([
        "post-1",
        expect.objectContaining({
          card: {
            title: "New title",
          },
        }),
        [null, "delta"],
      ]),
    );
  });

  it("writes relation-backed custom scalar fields through the shared scalar relation path", async () => {
    const existingPost = {
      authorId: null,
      categoryIds: [],
      contentFields: {
        body_html: {
          contentHtml: "<p>Body</p>",
          contentJson: createDefaultEditorDoc(),
        },
      },
      contentFormat: "html" as const,
      contentHtml: "<p>Body</p>",
      contentJson: createDefaultEditorDoc(),
      contentMarkdown: null,
      createdAt: "2026-03-30T00:00:00.000Z",
      customFields: {
        helper_subtitle: "Old helper subtitle",
        subtitle_text: "Old related subtitle",
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
      status: "draft" as const,
      tagIds: [],
      title: "Post 1",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    const updatedPost = {
      ...existingPost,
      customFields: {
        helper_subtitle: "Fresh helper subtitle",
        subtitle_text: "Fresh related subtitle",
      },
    };
    const queryMock = vi.fn(async (sql: string) => {
      if (/^(begin|commit|rollback)$/i.test(sql) || /for update$/i.test(sql)) return { rows: [] };
        if (sql.includes('select "subtitle_lookup_id"')) {
          return {
            rows: [
              {
                subtitle_lookup_id: "subtitle-row-1",
              },
            ],
          };
        }

        return {
          rowCount: 1,
          rows: [],
        };
      });
    const client = { query: queryMock } as never;
    const mapping = createMapping();

    mapping.mappingConfig.entities.posts.customFields = [
      {
        allowedValues: null,
        column: "subtitle_lookup_id",
        dataType: "uuid",
        defaultValue: null,
        enabled: true,
        fieldKey: "subtitle_text",
        isNullable: true,
        kind: "text",
        label: "Subtitle",
        sampleValues: [],
        sourceRelation: {
          junctionSourceColumn: null,
          junctionTable: null,
          sourceColumn: "subtitle_lookup_id",
          strategy: "foreign_key",
          targetColumn: "id",
          targetTable: "public.post_subtitle_rows",
          valueColumn: "subtitle_text",
        },
      } as never,
      {
        allowedValues: null,
        column: "helper_subtitle",
        dataType: "text",
        defaultValue: null,
        enabled: true,
        fieldKey: "helper_subtitle",
        isNullable: true,
        kind: "text",
        label: "Helper Subtitle",
        sampleValues: [],
        sourceRelation: {
          junctionSourceColumn: "post_id",
          junctionTable: "public.post_subtitle_helper",
          sourceColumn: null,
          strategy: "related_row_by_post_id",
          targetColumn: null,
          targetTable: null,
          valueColumn: "subtitle_text",
        },
      } as never,
    ];

    getMappedContentPostByIdMock
      .mockResolvedValueOnce(existingPost)
      .mockResolvedValueOnce(updatedPost);

    await updateMappedContentPost({
      client,
      customFields: {
        helper_subtitle: "Fresh helper subtitle",
        subtitle_text: "Fresh related subtitle",
      },
      mapping,
      postId: "post-1",
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('from "public"."posts"'),
      ["post-1"],
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('update "public"."post_subtitle_rows"'),
      ["Fresh related subtitle", "subtitle-row-1"],
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('update "public"."post_subtitle_helper"'),
      ["Fresh helper subtitle", "post-1"],
    );
    expect(queryMock.mock.calls.some(([sql]) =>
      (sql as string).includes('delete from "public"."post_subtitle_helper"'),
    )).toBe(false);
  });
});
