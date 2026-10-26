import { randomUUID } from "node:crypto";

import {
  createEmptyContentRuntimeContent,
  contentRuntimeHtmlToMarkdown,
} from "./content-conversion";
import { loadMappedContentAuthors } from "./mapped-content-collections";
import {
  getEntityColumnMetadata,
  getEntityIdColumn,
  getMappedContentRuntime,
  getEntityTableName,
  getMappedPublishedAtColumn,
  getRequiredPrimaryKeyInsertValue,
  quoteIdentifier,
  type ContentDatabaseClient,
} from "./mapped-content-runtime-support";
import {
  applyMappedScalarFieldWrite,
  applyMappedRelationWrite,
  getCustomFieldDefaultValue,
  getStoredStatusValue,
  getUniqueSlugForMappedScalarSource,
  getUniqueSlugForMappedTable,
  lookupStoredRelationValuesForIds,
  serializeMappedRedirectValues,
} from "./mapped-content-post-support";
import {
  applyMappedArrayIndexWrite,
  applyMappedJsonPathWrite,
  deriveStoredContentValueForField,
  MAPPED_CONTENT_PATCHABLE_MUTABLE_FIELD_KEYS,
  flushPendingColumnWrites,
  getMappedCustomFieldWriteTarget,
  getMappedEditorFieldWriteTarget,
  getMappedFieldWriteTarget,
  loadMappedContentPatchFieldSourceRow,
  normalizeOptionalPostTimestamp,
} from "./mapped-content-post-write-support";
import { createContentAdapterOperationError } from "./adapter/error-mapping";
import {
  buildContentInsertReturningIdQuery,
  buildContentUpdateByIdQuery,
} from "./adapter/query-builders";
import { withContentAdapterTransaction } from "./adapter/transaction";
import { withPostgresPostWriteLock } from "./adapter/postgres/post-write-lock";
import { getMappedContentPostById } from "./mapped-content-post-reads";
import {
  createContentRedirectEntry,
  normalizeContentRedirectEntries,
  type ContentRedirectEntryInput,
  type ContentPost,
} from "./shared";
import type {
  ContentEntityMapping,
  ContentProjectMapping,
} from "./mapping";
import { getContentCustomFieldKey } from "./mapping";

type MappedContentUpdatePostInput = {
  authorId?: string | null;
  categoryIds?: string[];
  contentFields?: Record<string, { contentHtml: string; contentJson: Record<string, unknown> }>;
  contentHtml?: string;
  contentJson?: Record<string, unknown>;
  contentMarkdown?: string | null;
  customFields?: Record<string, unknown>;
  expectedUpdatedAt?: string | null;
  expectedVersion?: string;
  excerpt?: string | null;
  focusKeyword?: string | null;
  featuredImageUrl?: string | null;
  parentPageId?: string | null;
  postId: string;
  publishedAt?: string | null;
  redirects?: ContentRedirectEntryInput[];
  seoDescription?: string | null;
  seoTitle?: string | null;
  slug?: string;
  status?: ContentPost["status"];
  tagIds?: string[];
  title?: string;
  updatedAt?: string | null;
};

export {
  deleteMappedContentPosts,
  discardMappedContentPost,
} from "./mapped-content-post-delete";

export const createMappedContentPost = async ({
  accessibleAuthorIds = null,
  client,
  mapping,
}: {
  accessibleAuthorIds?: string[] | null;
  client: ContentDatabaseClient;
  mapping: ContentProjectMapping;
}) => {
  const runtime = getMappedContentRuntime(mapping);
  const posts = runtime.posts;

  if (posts.source.kind !== "table") {
    throw new Error("This posts setup is read-only. Choose an editable posts source before creating posts.");
  }

  const tableName = getEntityTableName(posts);
  const postIdColumn = getEntityIdColumn(posts) || posts.source.primaryKey;

  if (!postIdColumn) {
    throw new Error("Posts setup is missing a stable ID field.");
  }

  const titleTarget = getMappedFieldWriteTarget(posts, "title");
  const slugTarget = getMappedFieldWriteTarget(posts, "slug");
  const excerptTarget = getMappedFieldWriteTarget(posts, "excerpt");
  const seoTitleTarget = getMappedFieldWriteTarget(posts, "seoTitle");
  const seoDescriptionTarget = getMappedFieldWriteTarget(posts, "seoDescription");
  const focusKeywordTarget = getMappedFieldWriteTarget(posts, "focusKeyword");
  const featuredImageUrlTarget = getMappedFieldWriteTarget(posts, "featuredImageUrl");
  const redirectsTarget = getMappedFieldWriteTarget(posts, "redirects");
  const createdAtTarget = getMappedFieldWriteTarget(posts, "createdAt");
  const updatedAtTarget = getMappedFieldWriteTarget(posts, "updatedAt");
  const authorRelation = posts.relations.authors;
  const generatedPrimaryKeyValue = await getRequiredPrimaryKeyInsertValue({
    client,
    entity: posts,
    primaryKeyColumn: postIdColumn,
  });
  const now = new Date().toISOString();
  const draftStatus = getStoredStatusValue({
    desiredStatus: "draft",
    posts,
  });
  const authors = await loadMappedContentAuthors({
    client,
    entity: runtime.authors,
    posts,
    relation: posts.relations.authors,
  });
  const candidateAuthors =
    accessibleAuthorIds === null
      ? authors
      : authors.filter((author) => accessibleAuthorIds.includes(author.id));
  const defaultAuthorId = candidateAuthors[0]?.id ?? null;

  if (accessibleAuthorIds !== null && !defaultAuthorId) {
    throw new Error("Add at least one valid author assignment before creating posts.");
  }

  const defaultAuthorStoredValue =
    defaultAuthorId && authorRelation
      ? (await lookupStoredRelationValuesForIds({
          client,
          entity: runtime.authors,
          ids: [defaultAuthorId],
          posts,
          relation: authorRelation,
        }))[0] ?? null
      : null;

  // If the user is author-scoped, they must get a valid author assignment on the new post.
  // Without it, the generic mapped relation read path returns no author id and the creator
  // is immediately locked out of the post they just made.
  if (accessibleAuthorIds !== null && defaultAuthorId !== null && defaultAuthorStoredValue === null) {
    throw new Error(
      "Could not assign an author to this post. Review the author setup and try again.",
    );
  }

  const insertColumns: string[] = [];
  const insertValues: unknown[] = [];
  const placeholders: string[] = [];
  const insertedColumns = new Set<string>();
  const pendingJsonPathInsertValues = new Map<string, unknown>();
  const pendingScalarRelationCreates: Array<{
    field: NonNullable<ReturnType<typeof getMappedFieldWriteTarget>>["field"];
    fieldKey: string;
    value: unknown;
  }> = [];
  let parameterIndex = 1;
  const pushValue = (column: string | null | undefined, value: unknown) => {
    if (!column) {
      return;
    }

    if (insertedColumns.has(column)) {
      return;
    }

    insertColumns.push(quoteIdentifier(column));
    insertValues.push(value);
    placeholders.push(`$${parameterIndex}`);
    insertedColumns.add(column);
    parameterIndex += 1;
  };
  const queueCreateFieldValue = (
    target: ReturnType<typeof getMappedFieldWriteTarget>,
    value: unknown,
  ) => {
    if (!target) {
      return;
    }

    if (target.path) {
      applyMappedJsonPathWrite({
        column: target.column,
        path: target.path,
        pendingColumnValues: pendingJsonPathInsertValues,
        sourceRow: {},
        value,
      });
      return;
    }

    if (target.arrayIndex != null) {
      applyMappedArrayIndexWrite({
        column: target.column,
        index: target.arrayIndex,
        pendingColumnValues: pendingJsonPathInsertValues,
        sourceRow: {},
        value,
      });
      return;
    }

    if (target.field?.sourceRelation) {
      pendingScalarRelationCreates.push({
        field: target.field,
        fieldKey: target.fieldKey,
        value,
      });
      return;
    }

    pushValue(target.column, value);
  };

  if (generatedPrimaryKeyValue !== undefined) {
    pushValue(postIdColumn, generatedPrimaryKeyValue);
  }
  queueCreateFieldValue(titleTarget, "");

  if (slugTarget) {
    // Derive slug from a fresh UUID to guarantee uniqueness without a separate
    // DB round-trip, eliminating the TOCTOU race that causes duplicate-key errors.
    const shortId = randomUUID().replace(/-/g, "").slice(0, 8);
    queueCreateFieldValue(slugTarget, `untitled-${shortId}`);
  }

  // Initialize all visible editor fields with empty content on create.
  {
    const emptyContent = createEmptyContentRuntimeContent();
    for (const editorField of posts.editorFields) {
      if (!editorField.visible || (!editorField.column && !editorField.sourceRelation)) continue;
      const emptyValue = deriveStoredContentValueForField({
        contentHtml: editorField.kind === "plain_text" ? "" : emptyContent.contentHtml,
        contentJson: emptyContent.contentJson,
        contentMarkdown: emptyContent.contentMarkdown,
        editorField,
        preferExplicitMarkdown: true,
      });
      const target = getMappedEditorFieldWriteTarget(editorField);

      if (target?.path) {
        applyMappedJsonPathWrite({
          column: target.column,
          path: target.path,
          pendingColumnValues: pendingJsonPathInsertValues,
          sourceRow: {},
          value: emptyValue,
        });
        continue;
      }

      if (target?.arrayIndex != null) {
        applyMappedArrayIndexWrite({
          column: target.column,
          index: target.arrayIndex,
          pendingColumnValues: pendingJsonPathInsertValues,
          sourceRow: {},
          value: emptyValue,
        });
        continue;
      }

      if (target?.sourceRelation && target.field) {
        pendingScalarRelationCreates.push({
          field: target.field,
          fieldKey: target.fieldKey,
          value: emptyValue,
        });
        continue;
      }

      pushValue(target?.column, emptyValue);
    }

    // Write to explicitly configured companion content columns
    for (const companion of posts.companionContentColumns) {
      if (!companion.column) continue;
      // Skip if already written by an editor field above.
      if (insertedColumns.has(companion.column)) continue;

      const companionValue =
        companion.kind === "markdown"
          ? emptyContent.contentMarkdown
          : companion.kind === "json"
            ? JSON.stringify(emptyContent.contentJson)
            : emptyContent.contentHtml;

      pushValue(companion.column, companionValue);
    }
  }

  queueCreateFieldValue(excerptTarget, null);
  queueCreateFieldValue(seoTitleTarget, null);
  queueCreateFieldValue(seoDescriptionTarget, null);
  queueCreateFieldValue(focusKeywordTarget, null);
  queueCreateFieldValue(featuredImageUrlTarget, null);

  if (redirectsTarget?.path) {
    applyMappedJsonPathWrite({
      column: redirectsTarget.column,
      path: redirectsTarget.path,
      pendingColumnValues: pendingJsonPathInsertValues,
      sourceRow: {},
      value: serializeMappedRedirectValues({
        field: posts.fields.redirects,
        redirects: [],
      }),
    });
  } else if (redirectsTarget?.arrayIndex != null) {
    applyMappedArrayIndexWrite({
      column: redirectsTarget.column,
      index: redirectsTarget.arrayIndex,
      pendingColumnValues: pendingJsonPathInsertValues,
      sourceRow: {},
      value: serializeMappedRedirectValues({
        field: posts.fields.redirects,
        redirects: [],
      }),
    });
  } else if (redirectsTarget?.column) {
    pushValue(
      redirectsTarget.column,
      serializeMappedRedirectValues({
        field: posts.fields.redirects,
        redirects: [],
      }),
    );
  }

  if (posts.workflow?.statusColumn) {
    pushValue(posts.workflow.statusColumn, draftStatus.statusValue ?? "draft");
  }

  if (posts.workflow?.publishedFlagColumn) {
    pushValue(posts.workflow.publishedFlagColumn, draftStatus.publishedFlagValue ?? false);
  }

  if (getMappedPublishedAtColumn(posts)) {
    pushValue(getMappedPublishedAtColumn(posts), null);
  }

  if (createdAtTarget?.path) {
    applyMappedJsonPathWrite({
      column: createdAtTarget.column,
      path: createdAtTarget.path,
      pendingColumnValues: pendingJsonPathInsertValues,
      sourceRow: {},
      value: now,
    });
  } else if (createdAtTarget?.arrayIndex != null) {
    applyMappedArrayIndexWrite({
      column: createdAtTarget.column,
      index: createdAtTarget.arrayIndex,
      pendingColumnValues: pendingJsonPathInsertValues,
      sourceRow: {},
      value: now,
    });
  } else if (createdAtTarget?.column) {
    pushValue(createdAtTarget.column, now);
  }

  if (updatedAtTarget?.path) {
    applyMappedJsonPathWrite({
      column: updatedAtTarget.column,
      path: updatedAtTarget.path,
      pendingColumnValues: pendingJsonPathInsertValues,
      sourceRow: {},
      value: now,
    });
  } else if (updatedAtTarget?.arrayIndex != null) {
    applyMappedArrayIndexWrite({
      column: updatedAtTarget.column,
      index: updatedAtTarget.arrayIndex,
      pendingColumnValues: pendingJsonPathInsertValues,
      sourceRow: {},
      value: now,
    });
  } else if (updatedAtTarget?.column) {
    pushValue(updatedAtTarget.column, now);
  }

  if (authorRelation?.strategy === "foreign_key" && authorRelation.sourceColumn) {
    if (defaultAuthorStoredValue !== null) {
      pushValue(authorRelation.sourceColumn, defaultAuthorStoredValue);
    } else {
      const authorColumnMetadata = await getEntityColumnMetadata({
        client,
        columnName: authorRelation.sourceColumn,
        entity: posts,
      });

      if (authorColumnMetadata && !authorColumnMetadata.isNullable && !authorColumnMetadata.defaultValue) {
        throw new Error("This posts setup requires an author before BaseBuddy can create posts.");
      }
    }
  }

  // Insert default values for enabled custom fields (especially NOT NULL ones)
  for (const cf of posts.customFields) {
    if (!cf.enabled) continue;
    const target = getMappedCustomFieldWriteTarget(cf);

    if (!target) {
      continue;
    }

    if (
      !target.path &&
      target.arrayIndex == null &&
      insertedColumns.has(target.column ?? cf.column)
    ) {
      continue;
    }

    const defaultValue = getCustomFieldDefaultValue(cf);
    if (!cf.isNullable && cf.defaultValue === null) {
      // NOT NULL with no default — must provide a value
      queueCreateFieldValue(target, defaultValue);
    }
  }

  flushPendingColumnWrites({
    pendingColumnValues: pendingJsonPathInsertValues,
    pushValue,
  });

  const insertPostRow = async () => {
    try {
      const result = await client.query<{ id: string }>(
        buildContentInsertReturningIdQuery({
          idColumn: postIdColumn,
          insertColumns,
          placeholders,
          tableName,
        }),
        insertValues,
      );

      return result.rows[0]?.id;
    } catch (error) {
      const pgMessage = error instanceof Error ? error.message : "";
      const pgError = error as { code?: string; column?: string };

      if (pgError.code === "23502") {
        const columnName = pgError.column ?? "unknown";
        const fieldLabel =
          posts.customFields.find((cf) => cf.column === columnName)?.label ?? columnName;
        throw new Error(
          `Cannot create post: the field "${fieldLabel}" is required. Add a default in setup or allow this field to be empty.`,
        );
      }

      if (pgError.code === "22P02" || pgError.code === "22003" || pgError.code === "22007") {
        const typeMatch = pgMessage.match(/column "([^"]+)"/)?.[1];
        const fieldLabel = typeMatch
          ? (posts.customFields.find((cf) => cf.column === typeMatch)?.label ?? typeMatch)
          : null;
        const hint = fieldLabel ? ` for "${fieldLabel}"` : "";
        throw new Error(`Invalid default value${hint}. Review the field setup and try again.`);
      }

      throw error;
    }
  };

  let createdPostId: string | undefined;

  if (pendingScalarRelationCreates.length) {
    await withContentAdapterTransaction(client, async () => {
      createdPostId = await insertPostRow();

      if (!createdPostId) {
        return;
      }

      const sourceRow = await loadMappedContentPatchFieldSourceRow({
        additionalFields: pendingScalarRelationCreates.map((entry) => entry.field),
        client,
        fieldKeys: pendingScalarRelationCreates.map((entry) => entry.fieldKey),
        postId: createdPostId,
        postIdColumn,
        posts,
        tableName,
      });

      for (const scalarWrite of pendingScalarRelationCreates) {
        await applyMappedScalarFieldWrite({
          client,
          field: scalarWrite.field,
          fieldKey: scalarWrite.fieldKey,
          postId: createdPostId,
          posts,
          sourceRow,
          value: scalarWrite.value,
        });
      }
    });
  } else {
    createdPostId = await insertPostRow();
  }

  if (!createdPostId) {
    throw new Error("Could not create the post right now.");
  }

  return getMappedContentPostById({
    client,
    mapping,
    postId: createdPostId,
  });
};

const updateLockedMappedContentPost = async ({
  client,
  mapping,
  authorId,
  categoryIds,
  contentFields,
  contentHtml,
  contentJson,
  contentMarkdown,
  customFields,
  expectedUpdatedAt,
  expectedVersion,
  excerpt,
  focusKeyword,
  featuredImageUrl,
  parentPageId,
  postId,
  publishedAt,
  redirects,
  seoDescription,
  seoTitle,
  slug,
  status,
  tagIds,
  title,
  updatedAt,
}: {
  client: ContentDatabaseClient;
  mapping: ContentProjectMapping;
} & MappedContentUpdatePostInput) => {
  const runtime = getMappedContentRuntime(mapping);
  const posts = runtime.posts;

  if (posts.source.kind !== "table") {
    throw new Error("This posts setup is read-only. Choose an editable posts source before editing posts.");
  }

  const existingPost = await getMappedContentPostById({
    client,
    mapping,
    postId,
  });
  const tableName = getEntityTableName(posts);
  const postIdColumn = getEntityIdColumn(posts) || posts.source.primaryKey;

  if (!postIdColumn) {
    throw new Error("Posts setup is missing a stable ID field.");
  }

  const titleTarget = getMappedFieldWriteTarget(posts, "title");
  const slugTarget = getMappedFieldWriteTarget(posts, "slug");
  const excerptTarget = getMappedFieldWriteTarget(posts, "excerpt");
  const seoTitleTarget = getMappedFieldWriteTarget(posts, "seoTitle");
  const seoDescriptionTarget = getMappedFieldWriteTarget(posts, "seoDescription");
  const focusKeywordTarget = getMappedFieldWriteTarget(posts, "focusKeyword");
  const featuredImageUrlTarget = getMappedFieldWriteTarget(posts, "featuredImageUrl");
  const publishedAtTarget = getMappedFieldWriteTarget(posts, "publishedAt");
  const updatedAtTarget = getMappedFieldWriteTarget(posts, "updatedAt");
  const redirectsTarget = getMappedFieldWriteTarget(posts, "redirects");
  const nextStatus = status ?? existingPost.status;
  const nextTitle = typeof title === "string" ? title : existingPost.title;
  const slugColumn = slugTarget?.column ?? null;
  const contentFieldSourceColumns = Array.from(
    new Set(
      posts.editorFields
        .filter((editorField) => editorField.visible && editorField.column && (editorField.path || editorField.arrayIndex != null))
        .map((editorField) => editorField.column as string),
    ),
  );
  const customFieldSourceColumns = Array.from(
    new Set(
      posts.customFields
        .filter((customField) => customField.enabled)
        .flatMap((customField) => {
          const target = getMappedCustomFieldWriteTarget(customField);

          return target
            ? [
                target.path || target.arrayIndex != null ? target.column : null,
                target.sourceRelation?.sourceColumn ?? null,
              ]
            : [];
        })
        .filter(Boolean) as string[],
    ),
  );
  const existingFieldSourceRow = await loadMappedContentPatchFieldSourceRow({
    additionalColumns: [...contentFieldSourceColumns, ...customFieldSourceColumns],
    client,
    fieldKeys: MAPPED_CONTENT_PATCHABLE_MUTABLE_FIELD_KEYS,
    postId,
    postIdColumn,
    posts,
    tableName,
  });
  const nextSlug =
    typeof slug === "string"
      ? slug
      : existingPost.slug;
  const normalizedSlug =
    slugColumn
      ? await getUniqueSlugForMappedTable({
          base: nextSlug || nextTitle || "untitled",
          client,
          entity: posts,
          excludeId: postId,
          idColumn: postIdColumn,
          slugColumn,
          tableName,
        })
      : slugTarget?.field?.sourceRelation
        ? await getUniqueSlugForMappedScalarSource({
            base: nextSlug || nextTitle || "untitled",
            client,
            field: slugTarget.field,
            postId,
            posts,
            sourceRow: existingFieldSourceRow,
          })
      : nextSlug;
  const contentField = posts.editorFields[0];
  const nextPrimaryContentHtml = contentHtml ?? existingPost.contentHtml;
  const nextPrimaryContentJson = contentJson ?? existingPost.contentJson;
  const nextExcerpt = excerpt === undefined ? existingPost.excerpt : excerpt?.trim() || null;
  const nextSeoTitle = seoTitle === undefined ? existingPost.seoTitle : seoTitle?.trim() || null;
  const nextSeoDescription =
    seoDescription === undefined ? existingPost.seoDescription : seoDescription?.trim() || null;
  const nextFocusKeyword =
    focusKeyword === undefined ? existingPost.focusKeyword : focusKeyword?.trim() || null;
  const nextFeaturedImageUrl =
    featuredImageUrl === undefined ? existingPost.featuredImageUrl : featuredImageUrl?.trim() || null;
  const slugChanged = normalizedSlug.trim() !== existingPost.slug.trim();
  const previousSlugRedirect =
    redirectsTarget?.column && slugChanged && existingPost.slug.trim() && existingPost.slug.trim() !== normalizedSlug.trim()
      ? createContentRedirectEntry({ source: existingPost.slug })
      : null;
  const nextRedirects = normalizeContentRedirectEntries([
    ...(redirects === undefined ? existingPost.redirects ?? [] : redirects),
    previousSlugRedirect,
  ]).filter((entry) => entry.source !== normalizedSlug.trim());
  const expectedUpdatedAtToken = normalizeOptionalPostTimestamp(expectedUpdatedAt);
  const currentUpdatedAtToken = normalizeOptionalPostTimestamp(existingPost.updatedAt);

  if ((expectedVersion !== undefined && expectedVersion !== existingPost.versionToken) ||
      (expectedVersion === undefined && expectedUpdatedAtToken !== undefined && expectedUpdatedAtToken !== currentUpdatedAtToken)) {
    throw createContentAdapterOperationError([
      {
        code: "stale_row_conflict",
        fieldKey: "updatedAt",
        message: "This post has changed since you loaded it. Reload and try again.",
        metadata: {
          currentUpdatedAt: currentUpdatedAtToken,
          expectedUpdatedAt: expectedUpdatedAtToken,
        },
      },
    ]);
  }

  const requestedPublishedAt = normalizeOptionalPostTimestamp(publishedAt);
  const requestedUpdatedAt = normalizeOptionalPostTimestamp(updatedAt);
  const shouldWriteUpdatedAt = requestedUpdatedAt !== undefined;
  const nextUpdatedAt =
    shouldWriteUpdatedAt && requestedUpdatedAt !== existingPost.updatedAt
      ? requestedUpdatedAt
      : new Date().toISOString();
  const nextAuthorId =
    authorId === undefined ? existingPost.authorId : authorId?.trim() ? authorId.trim() : null;
  const nextCategoryId =
    categoryIds === undefined
      ? (existingPost.categoryIds[0] ?? null)
      : (categoryIds[0]?.trim() ? categoryIds[0].trim() : null);
  const nextTagId =
    tagIds === undefined ? (existingPost.tagIds[0] ?? null) : (tagIds[0]?.trim() ? tagIds[0].trim() : null);
  const nextParentPageId =
    parentPageId === undefined ? existingPost.parentPageId ?? null : parentPageId?.trim() ? parentPageId.trim() : null;

  if (nextParentPageId === postId) {
    throw new Error("A post cannot be its own parent page.");
  }

  const nextStatusValues = getStoredStatusValue({
    desiredStatus: nextStatus,
    posts,
  });
  const updates: string[] = [];
  const params: unknown[] = [postId];
  const updatedColumns = new Set<string>();
  const pendingJsonPathUpdateValues = new Map<string, unknown>();
  const pendingScalarRelationWrites: Array<{
    field: NonNullable<NonNullable<ReturnType<typeof getMappedFieldWriteTarget>>["field"]>;
    fieldKey: string;
    value: unknown;
  }> = [];
  let parameterIndex = 2;
  const pushUpdate = (column: string | null | undefined, value: unknown) => {
    if (!column) {
      return;
    }

    if (updatedColumns.has(column)) {
      return;
    }

    updates.push(`${quoteIdentifier(column)} = $${parameterIndex}`);
    params.push(value);
    updatedColumns.add(column);
    parameterIndex += 1;
  };

  const queueFieldUpdate = (
    target: ReturnType<typeof getMappedFieldWriteTarget>,
    value: unknown,
  ) => {
    if (!target) {
      return;
    }

    if (target.sourceRelation && target.field) {
      pendingScalarRelationWrites.push({
        field: target.field,
        fieldKey: target.fieldKey,
        value,
      });
      return;
    }

    if (!target.column) {
      return;
    }

    if (target.path) {
      applyMappedJsonPathWrite({
        column: target.column,
        path: target.path,
        pendingColumnValues: pendingJsonPathUpdateValues,
        sourceRow: existingFieldSourceRow,
        value,
      });
      return;
    }

    if (target.arrayIndex != null) {
      applyMappedArrayIndexWrite({
        column: target.column,
        index: target.arrayIndex,
        pendingColumnValues: pendingJsonPathUpdateValues,
        sourceRow: existingFieldSourceRow,
        value,
      });
      return;
    }

    if (target.sourceRelation && target.field) {
      pendingScalarRelationWrites.push({
        field: target.field,
        fieldKey: target.fieldKey,
        value,
      });
      return;
    }

    pushUpdate(target.column, value);
  };

  const queueContentFieldUpdate = (
    editorField: ContentEntityMapping["editorFields"][number],
    value: unknown,
  ) => {
    const target = getMappedEditorFieldWriteTarget(editorField);

    if (!target) {
      return;
    }

    if (target.path) {
      applyMappedJsonPathWrite({
        column: target.column,
        path: target.path,
        pendingColumnValues: pendingJsonPathUpdateValues,
        sourceRow: existingFieldSourceRow,
        value,
      });
      return;
    }

    if (target.arrayIndex != null) {
      applyMappedArrayIndexWrite({
        column: target.column,
        index: target.arrayIndex,
        pendingColumnValues: pendingJsonPathUpdateValues,
        sourceRow: existingFieldSourceRow,
        value,
      });
      return;
    }

    if (target.sourceRelation && target.field) {
      pendingScalarRelationWrites.push({
        field: target.field,
        fieldKey: target.fieldKey,
        value,
      });
      return;
    }

    pushUpdate(target.column, value);
  };

  if (title !== undefined) {
    queueFieldUpdate(titleTarget, nextTitle);
  }
  if (slug !== undefined) {
    queueFieldUpdate(slugTarget, normalizedSlug);
  }
  if (excerpt !== undefined) {
    queueFieldUpdate(excerptTarget, nextExcerpt);
  }
  if (seoTitle !== undefined) {
    queueFieldUpdate(seoTitleTarget, nextSeoTitle);
  }
  if (seoDescription !== undefined) {
    queueFieldUpdate(seoDescriptionTarget, nextSeoDescription);
  }
  if (focusKeyword !== undefined) {
    queueFieldUpdate(focusKeywordTarget, nextFocusKeyword);
  }
  if (featuredImageUrl !== undefined) {
    queueFieldUpdate(featuredImageUrlTarget, nextFeaturedImageUrl);
  }
  if (redirectsTarget?.column && (redirects !== undefined || previousSlugRedirect)) {
    queueFieldUpdate(
      redirectsTarget,
      serializeMappedRedirectValues({
        field: posts.fields.redirects,
        redirects: nextRedirects,
      }),
    );
  }

  const hasPrimaryContentInput =
    contentHtml !== undefined || contentJson !== undefined || contentMarkdown !== undefined;

  if (hasPrimaryContentInput && contentField && (contentField.column || contentField.sourceRelation)) {
    // Treat the top-level content state as the canonical source for the primary mapped
    // editor column. This keeps saves correct when the client still carries a stale
    // contentFields snapshot from an earlier mapping revision or editor session.
    queueContentFieldUpdate(
      contentField,
      deriveStoredContentValueForField({
        contentHtml: nextPrimaryContentHtml,
        contentJson: nextPrimaryContentJson,
        contentMarkdown,
        editorField: contentField,
        preferExplicitMarkdown: true,
      }),
    );
  }

  // Write content for secondary editor fields when contentFields is provided (multi-field mode).
  if (contentFields && Object.keys(contentFields).length > 0) {
    for (const editorField of posts.editorFields) {
      if (
        !editorField.visible ||
        (!editorField.column && !editorField.sourceRelation) ||
        editorField.id === contentField?.id
      ) {
        continue;
      }
      const fieldValue = contentFields[editorField.id];
      if (!fieldValue) continue;
      queueContentFieldUpdate(
        editorField,
        deriveStoredContentValueForField({
          contentHtml: fieldValue.contentHtml,
          contentJson: fieldValue.contentJson,
          editorField,
        }),
      );
    }
  }

  // Write to explicitly configured companion content columns
  for (const companion of hasPrimaryContentInput ? posts.companionContentColumns : []) {
    if (!companion.column || companion.column === contentField?.column) continue;

    const companionValue = (() => {
      if (companion.kind === "markdown") {
        return contentRuntimeHtmlToMarkdown(contentHtml ?? existingPost.contentHtml);
      }
      if (companion.kind === "json") {
        return JSON.stringify(contentJson ?? existingPost.contentJson);
      }
      return contentHtml ?? existingPost.contentHtml;
    })();

    pushUpdate(companion.column, companionValue);
  }

  if (status !== undefined && posts.workflow?.statusColumn) {
    pushUpdate(posts.workflow.statusColumn, nextStatusValues.statusValue ?? nextStatus);
  }

  if (status !== undefined && posts.workflow?.publishedFlagColumn) {
    pushUpdate(posts.workflow.publishedFlagColumn, nextStatusValues.publishedFlagValue ?? false);
  }

  if (publishedAt !== undefined || status !== undefined) {
    const nextPublishedAtValue =
      requestedPublishedAt === undefined
        ? nextStatus === "published"
          ? existingPost.publishedAt ?? nextStatusValues.publishedAtValue
          : null
        : requestedPublishedAt;
    const workflowPublishedAtColumn = posts.workflow?.publishedAtColumn?.trim();

    if (workflowPublishedAtColumn) {
      pushUpdate(workflowPublishedAtColumn, nextPublishedAtValue);
    } else if (getMappedPublishedAtColumn(posts)) {
      queueFieldUpdate(publishedAtTarget, nextPublishedAtValue);
    }
  }

  if (shouldWriteUpdatedAt) {
    queueFieldUpdate(updatedAtTarget, nextUpdatedAt);
  }

  const authorRelation = posts.relations.authors;
  const parentPageRelation = posts.relations.posts;
  const customRelationWrites: Array<{
    entity: NonNullable<typeof runtime.authors | typeof runtime.categories | typeof runtime.tags | typeof runtime.posts>;
    fieldKey: string;
    ids: string[];
    relation: NonNullable<(typeof posts.customRelationFields)[number]["relation"]>;
  }> = [];
  const normalizeCustomRelationIds = (value: unknown, multiple: boolean) => {
    const rawValues = multiple ? (Array.isArray(value) ? value : []) : [value];
    const seen = new Set<string>();
    const normalizedValues: string[] = [];

    for (const rawValue of rawValues) {
      const normalizedValue = String(rawValue ?? "").trim();

      if (!normalizedValue || normalizedValue === postId || seen.has(normalizedValue)) {
        continue;
      }

      seen.add(normalizedValue);
      normalizedValues.push(normalizedValue);
    }

    return normalizedValues;
  };

  if (
    authorId !== undefined &&
    (authorRelation?.strategy === "foreign_key" ||
      (authorRelation?.strategy === "value_match_relation" && authorRelation.sourceColumn)) &&
    authorRelation.sourceColumn
  ) {
    const storedAuthorValue =
      nextAuthorId && runtime.authors
        ? (await lookupStoredRelationValuesForIds({
            client,
            entity: runtime.authors,
            ids: [nextAuthorId],
            posts,
            relation: authorRelation,
          }))[0] ?? null
        : null;
    pushUpdate(authorRelation.sourceColumn, storedAuthorValue);
  }

  if (parentPageId !== undefined && parentPageRelation?.strategy === "foreign_key" && parentPageRelation.sourceColumn) {
    const storedParentPageValue =
      nextParentPageId
        ? (await lookupStoredRelationValuesForIds({
            client,
            entity: runtime.posts,
            ids: [nextParentPageId],
            posts,
            relation: parentPageRelation,
          }))[0] ?? null
        : null;
    pushUpdate(parentPageRelation.sourceColumn, storedParentPageValue);
  }

  const categoryRelation = posts.relations.categories;
  if (categoryIds !== undefined && categoryRelation?.strategy === "foreign_key" && categoryRelation.sourceColumn) {
    const storedCategoryValue =
      nextCategoryId && runtime.categories
        ? (await lookupStoredRelationValuesForIds({
            client,
            entity: runtime.categories,
            ids: [nextCategoryId],
            posts,
            relation: categoryRelation,
          }))[0] ?? null
        : null;
    pushUpdate(categoryRelation.sourceColumn, storedCategoryValue);
  }

  const tagRelation = posts.relations.tags;
  if (tagIds !== undefined && tagRelation?.strategy === "foreign_key" && tagRelation.sourceColumn) {
    const storedTagValue =
      nextTagId && runtime.tags
        ? (await lookupStoredRelationValuesForIds({
            client,
            entity: runtime.tags,
            ids: [nextTagId],
            posts,
            relation: tagRelation,
          }))[0] ?? null
        : null;
    pushUpdate(tagRelation.sourceColumn, storedTagValue);
  }

  if (customFields) {
    for (const cf of posts.customFields) {
      const customFieldKey = getContentCustomFieldKey(cf);

      if (!cf.enabled || !(customFieldKey in customFields)) {
        continue;
      }

      const target = getMappedCustomFieldWriteTarget(cf);

      if (!target) {
        continue;
      }

      queueFieldUpdate(target, customFields[customFieldKey] ?? null);
    }

    for (const relationField of posts.customRelationFields ?? []) {
      if (!relationField.enabled || !(relationField.fieldKey in customFields)) {
        continue;
      }

      const relation = relationField.relation;
      const ids = normalizeCustomRelationIds(
        customFields[relationField.fieldKey],
        relation.multiple,
      );
      const targetEntity =
        relation.targetEntity === "authors"
          ? runtime.authors
          : relation.targetEntity === "categories"
            ? runtime.categories
            : relation.targetEntity === "files"
              ? runtime.files
            : relation.targetEntity === "media"
              ? runtime.media
            : relation.targetEntity === "tags"
              ? runtime.tags
              : relation.targetEntity === "posts"
                ? runtime.posts
                : null;

      if (!targetEntity) {
        continue;
      }

      if (
        (relation.strategy === "foreign_key" ||
          (relation.strategy === "value_match_relation" && relation.sourceColumn && !relation.multiple)) &&
        relation.sourceColumn
      ) {
        const storedValue =
          ids.length
            ? (await lookupStoredRelationValuesForIds({
                client,
                entity: targetEntity,
                ids: [ids[0] ?? null].filter((entry): entry is string => Boolean(entry)),
                posts,
                relation,
              }))[0] ?? null
            : null;

        pushUpdate(relation.sourceColumn, storedValue);
        continue;
      }

      customRelationWrites.push({
        entity: targetEntity,
        fieldKey: relationField.fieldKey,
        ids,
        relation,
      });
    }
  }

  flushPendingColumnWrites({
    pendingColumnValues: pendingJsonPathUpdateValues,
    pushValue: pushUpdate,
  });

  const applyPostRowUpdate = async () => {
    if (!updates.length) {
      return;
    }

    try {
      await client.query(
        buildContentUpdateByIdQuery({
          idColumn: postIdColumn,
          tableName,
          updates,
        }),
        params,
      );
    } catch (error) {
      const pgMessage = error instanceof Error ? error.message : "";
      const pgError = error as { code?: string; column?: string; constraint?: string };

      if (pgError.code === "23502") {
        const columnName = pgError.column ?? "unknown";
        const fieldLabel = posts.customFields.find((cf) => cf.column === columnName)?.label ?? columnName;
        throw new Error(`The field "${fieldLabel}" is required and cannot be empty.`);
      }

      if (pgError.code === "23514") {
        throw new Error("A field value does not match the rules for this setup. Check your custom field values.");
      }

      if (pgError.code === "22P02" || pgError.code === "22003" || pgError.code === "22007") {
        const typeMatch = pgMessage.match(/column "([^"]+)"/)?.[1];
        const fieldLabel = typeMatch
          ? (posts.customFields.find((cf) => cf.column === typeMatch)?.label ?? typeMatch)
          : null;
        const hint = fieldLabel ? ` for "${fieldLabel}"` : "";
        throw new Error(`Invalid value${hint}. Please check the field type and try again.`);
      }

      if (pgError.code === "22001") {
        throw new Error("A field value is too long. Please shorten it and try again.");
      }

      throw error;
    }
  };

  const hasRelationWrites =
    pendingScalarRelationWrites.length > 0 ||
    (authorId !== undefined &&
      Boolean(authorRelation) &&
      authorRelation?.strategy !== "foreign_key" &&
      !(authorRelation?.strategy === "value_match_relation" && authorRelation.sourceColumn)) ||
    (categoryIds !== undefined && categoryRelation?.strategy !== "foreign_key") ||
    (tagIds !== undefined && tagRelation?.strategy !== "foreign_key") ||
    (parentPageId !== undefined && parentPageRelation?.strategy !== "foreign_key") ||
    customRelationWrites.length > 0;

  if (hasRelationWrites) {
    await (async () => {
      await applyPostRowUpdate();

      for (const scalarWrite of pendingScalarRelationWrites) {
        await applyMappedScalarFieldWrite({
          client,
          field: scalarWrite.field,
          fieldKey: scalarWrite.fieldKey,
          postId,
          posts,
          sourceRow: existingFieldSourceRow,
          value: scalarWrite.value,
        });
      }

      if (
        authorId !== undefined &&
        authorRelation?.strategy !== "foreign_key" &&
        !(authorRelation?.strategy === "value_match_relation" && authorRelation.sourceColumn)
      ) {
        await applyMappedRelationWrite({
          client,
          entity: runtime.authors,
          fieldKey: "author",
          ids: nextAuthorId ? [nextAuthorId] : [],
          postId,
          posts,
          relation: authorRelation,
        });
      }

      if (categoryIds !== undefined && categoryRelation?.strategy !== "foreign_key") {
        await applyMappedRelationWrite({
          client,
          entity: runtime.categories,
          fieldKey: "categories",
          ids: categoryIds,
          postId,
          posts,
          relation: categoryRelation,
        });
      }

      if (tagIds !== undefined && tagRelation?.strategy !== "foreign_key") {
        await applyMappedRelationWrite({
          client,
          entity: runtime.tags,
          fieldKey: "tags",
          ids: tagIds,
          postId,
          posts,
          relation: tagRelation,
        });
      }

      if (parentPageId !== undefined && parentPageRelation?.strategy !== "foreign_key") {
        await applyMappedRelationWrite({
          client,
          entity: runtime.posts,
          fieldKey: "parentPage",
          ids: nextParentPageId ? [nextParentPageId] : [],
          postId,
          posts,
          relation: parentPageRelation,
        });
      }

      for (const relationWrite of customRelationWrites) {
        await applyMappedRelationWrite({
          client,
          entity: relationWrite.entity,
          fieldKey: relationWrite.fieldKey,
          ids: relationWrite.ids,
          postId,
          posts,
          relation: relationWrite.relation,
        });
      }
    })();
  } else {
    await applyPostRowUpdate();
  }

  return getMappedContentPostById({
    client,
    mapping,
    postId,
  });
};

export const updateMappedContentPost = async (input: Parameters<typeof updateLockedMappedContentPost>[0]) =>
  withPostgresPostWriteLock(input, () => updateLockedMappedContentPost(input));
