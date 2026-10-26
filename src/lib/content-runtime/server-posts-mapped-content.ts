import "server-only";

import {
  canAccessAuthorScopedContent,
  getAccessibleAuthorIdsForAction,
  hasProjectContentPermission,
} from "@/lib/control-plane/permissions";

import {
  createContentRuntimeAdapter,
  getRequiredContentRuntimeAdapterMethod,
} from "./adapter/factory";
import { getContentDatabaseReadAccessNotice } from "./database-access-notice";
import { resolvePagination } from "./mapped-content-runtime-support";
import { isDisposableContentPostDraft } from "@/lib/editor/post-editor-rules";
import {
  CONTENT_POSTS_QUERY_SNAPSHOT_MAX_ITEMS,
  getCachedContentPostsQuerySnapshot,
} from "./server-posts-query-cache";
import { getContentAccessScopeCacheSignature } from "./server-runtime-cache-keys";
import {
  assertContentPostEditSession,
  createEmptyContentPostsPage,
  type ContentProjectContext,
  type ContentPostsDependencies,
} from "./server-posts-shared";
import {
  getProjectPostAuthorAssignments,
  getProjectPostEditSessions,
} from "./server-post-edit-sessions";
import {
  getContentPostsProjectionPage,
  getContentPostsProjectionState,
  listContentPostProjectionPreviews,
} from "./server-content-post-projection";
import { refreshContentPostsProjection } from "./server-content-post-projection-builder";
import type {
  ContentPost,
  ContentPostEditorPayload,
  ContentRedirectEntryInput,
  ContentRelationFieldKey,
  ContentRelationOption,
  ContentPostsPage,
  ContentPostsSort,
  ContentPostsStatusFilter,
} from "./shared";
import type { ContentPaginationInput } from "./server-support";

const createContentPostExecutionAdapter = (
  mapping: import("./mapping").ContentProjectMapping,
) =>
  createContentRuntimeAdapter({
    hasFilesS3CompatibleCredentials: false,
    hasS3CompatibleCredentials: false,
    mapping,
  });

const loadContentPostsListAuthorsSafely = async ({
  adapter,
  client,
  visibleAuthorIds,
}: {
  adapter: ReturnType<typeof createContentPostExecutionAdapter>;
  client: import("./mapped-content-runtime-support").ContentDatabaseClient;
  visibleAuthorIds: string[];
}) => {
  if (!visibleAuthorIds.length) {
    return [];
  }

  try {
    const loadPostListAuthors = getRequiredContentRuntimeAdapterMethod(
      adapter,
      "loadPostListAuthors",
    );

    return await loadPostListAuthors({
      client,
      visibleAuthorIds,
    });
  } catch {
    return [];
  }
};

const ensureContentPostContextReady = (context: ContentProjectContext) => {

  if (!context.connectionString) {
    throw new Error("This project needs a working database connection before you can continue.");
  }
};

const isContentBootstrapMappingDriftError = (error: unknown) => {
  const pgError = error as { code?: string; message?: string } | null | undefined;
  const message = pgError?.message ?? "";

  return (
    pgError?.code === "42P01" ||
    pgError?.code === "42703" ||
    /relation .* does not exist/i.test(message) ||
    /column .* does not exist/i.test(message)
  );
};

type MappedContentPostMutationInput = {
  authorId?: string | null;
  categoryIds?: string[];
  contentFields?: Record<string, { contentHtml: string; contentJson: Record<string, unknown> }>;
  contentHtml?: string;
  contentJson?: Record<string, unknown>;
  contentMarkdown?: string | null;
  context: ContentProjectContext;
  customFields?: Record<string, unknown>;
  dependencies: ContentPostsDependencies;
  excerpt?: string | null;
  featuredImageUrl?: string | null;
  focusKeyword?: string | null;
  parentPageId?: string | null;
  postId: string;
  projectId: string;
  publishedAt?: string | null;
  redirects?: ContentRedirectEntryInput[];
  seoDescription?: string | null;
  seoTitle?: string | null;
  slug?: string;
  status?: ContentPost["status"];
  tagIds?: string[];
  title?: string;
  expectedUpdatedAt?: string | null;
  expectedVersion?: string;
  updatedAt?: string | null;
};

type ContentPostSaveMode = "save" | "publish" | "unpublish" | "archive";
type ContentRelationSearchMethodName =
  | "searchAuthors"
  | "searchCategories"
  | "searchFiles"
  | "searchMedia"
  | "searchParentPages"
  | "searchTags";

const normalizeContentRelationOptionsLimit = (limit?: number) => {
  if (!Number.isFinite(limit) || !limit) {
    return 100;
  }

  return Math.max(1, Math.min(250, Math.floor(limit)));
};

const normalizeContentRelationSelectedIds = (selectedIds?: string[] | null) =>
  [...new Set((selectedIds ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 250);

const getRelationOptionsSearchMethodName = ({
  fieldKey,
  mapping,
}: {
  fieldKey: ContentRelationFieldKey;
  mapping: import("./mapping").ContentProjectMapping;
}) => {
  switch (fieldKey) {
    case "author":
      return "searchAuthors" as const;
    case "categories":
      return "searchCategories" as const;
    case "parentPage":
      return "searchParentPages" as const;
    case "tags":
      return "searchTags" as const;
    default:
      break;
  }

  if (!fieldKey.startsWith("custom_field:")) {
    return null;
  }

  const customFieldKey = fieldKey.slice("custom_field:".length);
  const customRelationField = (mapping.mappingConfig.entities.posts.customRelationFields ?? []).find(
    (field) => field.enabled && field.fieldKey === customFieldKey,
  );
  const targetEntity = customRelationField?.relation.targetEntity;

  switch (targetEntity) {
    case "authors":
      return "searchAuthors" as const;
    case "categories":
      return "searchCategories" as const;
    case "files":
      return "searchFiles" as const;
    case "media":
      return "searchMedia" as const;
    case "posts":
      return "searchParentPages" as const;
    case "tags":
      return "searchTags" as const;
    default:
      return null;
  }
};

const searchContentRelationOptionsWithAdapter = async ({
  accessibleAuthorIds,
  adapter,
  client,
  limit,
  methodName,
  search,
  selectedIds,
}: {
  accessibleAuthorIds: string[] | null;
  adapter: ReturnType<typeof createContentPostExecutionAdapter>;
  client: import("./mapped-content-runtime-support").ContentDatabaseClient;
  limit: number;
  methodName: ContentRelationSearchMethodName;
  search: string;
  selectedIds?: string[];
}) => {
  const selectedIdsRequest = selectedIds?.length ? { selectedIds } : {};

  if (methodName === "searchAuthors") {
    const searchAuthors = getRequiredContentRuntimeAdapterMethod(adapter, "searchAuthors");

    return searchAuthors({
      accessibleAuthorIds,
      client,
      limit,
      search,
      ...selectedIdsRequest,
    });
  }

  if (methodName === "searchParentPages") {
    const searchParentPages = getRequiredContentRuntimeAdapterMethod(
      adapter,
      "searchParentPages",
    );

    return searchParentPages({
      accessibleAuthorIds,
      client,
      limit,
      search,
      ...selectedIdsRequest,
    });
  }

  const searchMethod = getRequiredContentRuntimeAdapterMethod(adapter, methodName);

  return searchMethod({
    client,
    limit,
    search,
    ...selectedIdsRequest,
  });
};

export const shouldUseContentAuthorFallbackPreviewSnapshot = ({
  accessibleAuthorIds,
  mapping,
}: {
  accessibleAuthorIds: string[] | null;
  mapping: import("./mapping").ContentProjectMapping;
}) => {
  if (accessibleAuthorIds === null) {
    return false;
  }

  const authorRelation = mapping.mappingConfig.entities.posts.relations.authors;
  return authorRelation?.strategy !== "foreign_key" && authorRelation?.strategy !== "join_table";
};

export const getCachedContentPostsPreviewSnapshot = async ({
  accessibleAuthorIds,
  adapter,
  cacheSignature,
  client,
  projectId,
  scopeKey,
  search,
  sort,
  status,
}: {
  accessibleAuthorIds: string[] | null;
  adapter: ReturnType<typeof createContentPostExecutionAdapter>;
  cacheSignature: string;
  client: import("./mapped-content-runtime-support").ContentDatabaseClient;
  projectId: string;
  scopeKey: string;
  search: string;
  sort: ContentPostsSort;
  status: ContentPostsStatusFilter;
}) =>
  getCachedContentPostsQuerySnapshot({
    cacheSignature,
    load: async () =>
      getRequiredContentRuntimeAdapterMethod(adapter, "loadPostsPreviewSnapshot")({
        accessibleAuthorIds,
        client,
        search,
        sort,
        status,
      }),
    projectId,
    scopeKey,
    search,
    sort,
    status,
  });

const getCachedContentPostsProjectionSnapshot = async ({
  accessibleAuthorIds,
  cacheSignature,
  mapping,
  projectId,
  scopeKey,
  search,
  sort,
  status,
}: {
  accessibleAuthorIds: string[] | null;
  cacheSignature: string;
  mapping: import("./mapping").ContentProjectMapping;
  projectId: string;
  scopeKey: string;
  search: string;
  sort: ContentPostsSort;
  status: ContentPostsStatusFilter;
}) =>
  getCachedContentPostsQuerySnapshot({
    cacheSignature,
    load: async () => {
      const posts = await listContentPostProjectionPreviews({
        accessibleAuthorIds,
        mapping,
        projectId,
        search,
        sort,
        status,
      });

      return {
        posts,
        totalItems: posts.length,
      };
    },
    projectId,
    scopeKey,
    search,
    sort,
    status,
  });

export const getMappedContentRelationOptions = async ({
  context,
  dependencies,
  fieldKey,
  limit = 100,
  projectId,
  search = "",
  selectedIds,
}: {
  context: ContentProjectContext;
  dependencies: ContentPostsDependencies;
  fieldKey: ContentRelationFieldKey;
  limit?: number;
  projectId: string;
  search?: string;
  selectedIds?: string[];
}): Promise<ContentRelationOption[]> => {
  ensureContentPostContextReady(context);

  const readyMapping = await dependencies.getReadyContentProjectMapping({
    context,
    projectId,
  });

  if (!readyMapping) {
    return [];
  }

  const accessibleAuthorIds = dependencies.ensureContentPermission(context, "write");
  const normalizedLimit = normalizeContentRelationOptionsLimit(limit);
  const normalizedSearch = search.trim();
  const normalizedSelectedIds = normalizeContentRelationSelectedIds(selectedIds);

  return dependencies.withContentDatabaseClient(context.connectionString as string, async (client) => {
    const adapter = createContentPostExecutionAdapter(readyMapping);
    const searchMethodName = getRelationOptionsSearchMethodName({
      fieldKey,
      mapping: readyMapping,
    });

    if (searchMethodName) {
      return searchContentRelationOptionsWithAdapter({
        accessibleAuthorIds,
        adapter,
        client,
        limit: normalizedLimit,
        methodName: searchMethodName,
        search: normalizedSearch,
        selectedIds: normalizedSelectedIds,
      });
    }

    return [];
  });
};

export const getMappedContentPostsPage = async ({
  context,
  cursor = null,
  dependencies,
  page,
  pageSize,
  projectId,
  search,
  sort,
  status,
}: ContentPaginationInput & {
  context: ContentProjectContext;
  cursor?: string | null;
  dependencies: ContentPostsDependencies;
  projectId: string;
  search: string;
  sort: ContentPostsSort;
  status: ContentPostsStatusFilter;
}): Promise<ContentPostsPage> => {
  ensureContentPostContextReady(context);

  const readyMapping = await dependencies.getReadyContentProjectMapping({
    context,
    projectId,
  });

  if (!readyMapping) {
    return createEmptyContentPostsPage({ page, pageSize });
  }

  const readableAuthorIds = dependencies.ensureContentPermission(context, "read");

  return dependencies.withContentDatabaseClient(context.connectionString as string, async (client) => {
    const adapter = createContentPostExecutionAdapter(readyMapping);
    const loadPostsPage = getRequiredContentRuntimeAdapterMethod(adapter, "loadPostsPage");
    let projectionState: Awaited<ReturnType<typeof getContentPostsProjectionState>> = null;

    try {
      projectionState = await getContentPostsProjectionState({
        mapping: readyMapping,
        projectId,
      });
    } catch {
      projectionState = null;
    }

    const postsListIndexState = projectionState?.status === "ready"
      ? ("ready" as const)
      : ("warming" as const);
    const loadLiveMappedContentPostsPage = ({
      totalItems,
      useWindowPagination = false,
    }: {
      totalItems?: number;
      useWindowPagination?: boolean;
    } = {}) =>
      loadPostsPage({
        accessibleAuthorIds: readableAuthorIds,
        client,
        cursor,
        page,
        pageSize,
        projectId,
        search,
        sort,
        status,
        totalItems,
        useWindowPagination,
      }).then(async (pageResult) => ({
        ...pageResult,
        accessNotice: await getContentDatabaseReadAccessNotice({
          client,
          collectionLabel: "posts",
          entity: readyMapping.mappingConfig.entities.posts,
          hasActiveFilters: Boolean(search.trim()) || status !== "all",
          visibleItemCount: pageResult.pagination.totalItems,
        }),
        postsListIndexState,
      }));

    const scheduleProjectionRefresh = () => {
      void dependencies
        .withContentDatabaseClient(context.connectionString as string, async (projectionClient) =>
          refreshContentPostsProjection({
            client: projectionClient,
            mapping: readyMapping,
            projectId,
          }),
        )
        .catch(() => undefined);
    };
    const loadLiveMappedContentPostsPageAndScheduleRefresh = async (
      input?: Parameters<typeof loadLiveMappedContentPostsPage>[0],
    ) => {
      const pageResult = await loadLiveMappedContentPostsPage(input);

      scheduleProjectionRefresh();

      return pageResult;
    };

    if (projectionState?.status === "ready") {
      try {
        if (readableAuthorIds !== null && !readableAuthorIds.length) {
          return createEmptyContentPostsPage({ page, pageSize });
        }

        const canUseProjectionStateTotal =
          readableAuthorIds === null && !search.trim() && status === "all";
        const totalItems = canUseProjectionStateTotal
          ? projectionState.totalItems
          : projectionState.totalItems;
        const useWindowPagination = !canUseProjectionStateTotal;

        if (canUseProjectionStateTotal && totalItems <= CONTENT_POSTS_QUERY_SNAPSHOT_MAX_ITEMS) {
          const snapshot = await getCachedContentPostsProjectionSnapshot({
            accessibleAuthorIds: readableAuthorIds,
            cacheSignature: getContentAccessScopeCacheSignature(context),
            mapping: readyMapping,
            projectId,
            scopeKey: `mapped_content_projection_snapshot:${readyMapping.revisionId ?? "none"}:${readyMapping.revisionVersion ?? 0}`,
            search,
            sort,
            status,
          });
          const pagination = resolvePagination({
            page,
            pageSize,
            totalItems: snapshot.totalItems,
          });
          const posts = snapshot.posts.slice(
            pagination.offset,
            pagination.offset + pagination.pageSize,
          );
          const visibleAuthorIds = [...new Set(posts.map((post) => post.authorId).filter(Boolean))] as string[];
          const authors = await loadContentPostsListAuthorsSafely({
            adapter,
            client,
            visibleAuthorIds,
          });

          return {
            authors,
            categories: [],
            editorOptionsState: "warm",
            pagination,
            posts,
            postsListIndexState: "ready",
            tags: [],
          };
        }

        const projectionPage = await getContentPostsProjectionPage({
          accessibleAuthorIds: readableAuthorIds,
          cursor,
          mapping: readyMapping,
          page,
          pageSize,
          projectId,
          search,
          sort,
          status,
          totalItems,
          useCursorPagination: Boolean(cursor?.trim()),
          useWindowPagination,
        });
        const visibleAuthorIds = [
          ...new Set(projectionPage.posts.map((post) => post.authorId).filter(Boolean)),
        ] as string[];
        const authors = await loadContentPostsListAuthorsSafely({
          adapter,
          client,
          visibleAuthorIds,
        });

        return {
          authors,
          categories: [],
          editorOptionsState: "warm",
          pagination: projectionPage.pagination,
          posts: projectionPage.posts,
          postsListIndexState: "ready",
          tags: [],
        };
      } catch {
        // Fall through to the bounded live path and warm the projection after the page returns.
      }
    }

    if (readableAuthorIds !== null) {
      if (!readableAuthorIds.length) {
        return createEmptyContentPostsPage({ page, pageSize });
      }

      return loadLiveMappedContentPostsPageAndScheduleRefresh({ useWindowPagination: true });
    }

    return loadLiveMappedContentPostsPageAndScheduleRefresh({ useWindowPagination: true });
  });
};

export const getMappedContentPostEditorPayload = async ({
  context,
  dependencies,
  includeEditorOptions = true,
  postId,
  projectId,
}: {
  context: ContentProjectContext;
  dependencies: ContentPostsDependencies;
  includeEditorOptions?: boolean;
  postId: string;
  projectId: string;
}): Promise<ContentPostEditorPayload> => {
  ensureContentPostContextReady(context);

  dependencies.ensureContentPermission(context, "read");
  const writableAuthorIds = hasProjectContentPermission(context.memberAccess, "write")
    ? getAccessibleAuthorIdsForAction(context.memberAccess, "write")
    : [];

  return dependencies.withContentDatabaseClient(context.connectionString as string, async (client) => {
    const authorAssignmentsByAuthorId = includeEditorOptions
      ? await getProjectPostAuthorAssignments(projectId)
      : null;
    const getPayloadForMapping = async (mapping: import("./mapping").ContentProjectMapping) => {
      const adapter = createContentPostExecutionAdapter(mapping);
      const loadPostEditorPayload = getRequiredContentRuntimeAdapterMethod(
        adapter,
        "loadPostEditorPayload",
      );

      return loadPostEditorPayload({
        accessibleAuthorIds: writableAuthorIds,
        authorAssignmentsByAuthorId,
        client,
        includeEditorOptions,
        postId,
        projectId,
      });
    };

    const bootstrapMapping = await (
      dependencies.getBootstrapContentProjectMapping ?? (async () => null)
    )({
      context,
      projectId,
    });
    const primaryMapping =
      bootstrapMapping ??
      (await dependencies.getReadyContentProjectMapping({
        client,
        context,
        projectId,
      }));

    if (!primaryMapping) {
      throw new Error("Finish posts setup before opening posts.");
    }

    let payload: ContentPostEditorPayload;

    try {
      payload = await getPayloadForMapping(primaryMapping);
    } catch (error) {
      if (
        !bootstrapMapping ||
        !isContentBootstrapMappingDriftError(error)
      ) {
        throw error;
      }

      const repairedMapping = await dependencies.getReadyContentProjectMapping({
        client,
        context,
        projectId,
      });

      if (!repairedMapping) {
        throw new Error("Finish posts setup before opening posts.");
      }

      payload = await getPayloadForMapping(repairedMapping);
    }

    if (!canAccessAuthorScopedContent(context.memberAccess, "read", payload.post.authorId)) {
      throw new Error(dependencies.getPermissionError("read"));
    }

    return {
      ...payload,
      post: {
        ...payload.post,
        editingSession: includeEditorOptions
          ? (await getProjectPostEditSessions(projectId, context.user.id)).get(payload.post.id) ?? null
          : null,
      },
    };
  });
};

export const createMappedContentPost = async ({
  context,
  dependencies,
  projectId,
}: {
  context: ContentProjectContext;
  dependencies: ContentPostsDependencies;
  projectId: string;
}): Promise<ContentPost> => {
  ensureContentPostContextReady(context);

  const readyMapping = await dependencies.getReadyContentProjectMapping({
    context,
    projectId,
  });

  if (!readyMapping) {
    throw new Error("Finish posts setup before creating posts.");
  }

  const writableAuthorIds = dependencies.ensureContentPermission(context, "write");

  return dependencies.withContentDatabaseClient(context.connectionString as string, async (client) =>
    {
      const adapter = createContentPostExecutionAdapter(readyMapping);
      const createPost = getRequiredContentRuntimeAdapterMethod(adapter, "createPost");
      const post = await createPost({
        accessibleAuthorIds: writableAuthorIds,
        client,
      });

      await refreshContentPostsProjection({
        client,
        mapping: readyMapping,
        postIds: [post.id],
        projectId,
      }).catch(() => undefined);

      return post;
    },
  );
};

export const updateMappedContentPost = async ({
  authorId,
  categoryIds,
  contentFields,
  contentHtml,
  contentJson,
  contentMarkdown,
  context,
  customFields,
  dependencies,
  excerpt,
  featuredImageUrl,
  focusKeyword,
  parentPageId,
  postId,
  publishedAt,
  projectId,
  redirects,
  seoDescription,
  seoTitle,
  slug,
  status,
  tagIds,
  title,
  expectedUpdatedAt,
  expectedVersion,
  updatedAt,
  saveMode = "save",
}: MappedContentPostMutationInput & {
  saveMode?: ContentPostSaveMode;
}): Promise<ContentPost> => {
  ensureContentPostContextReady(context);

  const readyMapping = await dependencies.getReadyContentProjectMapping({
    context,
    projectId,
  });

  if (!readyMapping) {
    throw new Error("Finish posts setup before updating posts.");
  }

  dependencies.ensureContentPermission(context, "write");

  return dependencies.withContentDatabaseClient(context.connectionString as string, async (client) => {
    const adapter = createContentPostExecutionAdapter(readyMapping);
    const loadPost = getRequiredContentRuntimeAdapterMethod(adapter, "loadPost");
    const existingPost = await loadPost({
      client,
      postId,
      projectId,
    });

    if (!canAccessAuthorScopedContent(context.memberAccess, "write", existingPost.authorId)) {
      throw new Error(dependencies.getPermissionError("write"));
    }

    await assertContentPostEditSession({
      client,
      context,
      dependencies,
      knownAuthorId: existingPost.authorId,
      postId,
      postTitle: existingPost.title,
      projectId,
    });

    const resolvedRequestedStatus =
      saveMode === "publish"
        ? "published"
        : saveMode === "unpublish"
          ? "draft"
          : saveMode === "archive"
            ? "archived"
            : status;
    const nextStatus = resolvedRequestedStatus ?? existingPost.status;
    const nextAuthorId =
      authorId === undefined ? existingPost.authorId : authorId?.trim() ? authorId.trim() : null;
    const isWorkflowAction = saveMode !== "save";
    const isStatusChange = resolvedRequestedStatus !== undefined && nextStatus !== existingPost.status;
    const requiresPublishAccess =
      isWorkflowAction ||
      isStatusChange ||
      (
        nextStatus === "published" &&
        (existingPost.status !== "published" || nextAuthorId !== existingPost.authorId)
      );

    if (requiresPublishAccess && !canAccessAuthorScopedContent(context.memberAccess, "publish", nextAuthorId)) {
      throw new Error(dependencies.getPermissionError("publish"));
    }

    if (nextAuthorId !== existingPost.authorId) {
      if (!canAccessAuthorScopedContent(context.memberAccess, "write", nextAuthorId)) {
        throw new Error(dependencies.getPermissionError("write"));
      }
    }

    const mutationRequest = {
      authorId,
      categoryIds,
      client,
      contentFields,
      contentHtml,
      contentJson,
      contentMarkdown,
      customFields,
      excerpt,
      featuredImageUrl,
      focusKeyword,
      parentPageId,
      postId,
      publishedAt,
      redirects,
      seoDescription,
      seoTitle,
      slug,
      status: resolvedRequestedStatus,
      tagIds,
      title,
      expectedUpdatedAt,
      expectedVersion,
      updatedAt,
    };
    const updatedPost =
      saveMode === "publish"
        ? await getRequiredContentRuntimeAdapterMethod(adapter, "publishPost")(mutationRequest)
        : saveMode === "unpublish"
          ? await getRequiredContentRuntimeAdapterMethod(adapter, "unpublishPost")(mutationRequest)
          : saveMode === "archive"
            ? await getRequiredContentRuntimeAdapterMethod(adapter, "archivePost")(mutationRequest)
            : await getRequiredContentRuntimeAdapterMethod(adapter, "savePost")(mutationRequest);

    await refreshContentPostsProjection({
      client,
      mapping: readyMapping,
      postIds: [postId],
      projectId,
    }).catch(() => undefined);

    return updatedPost;
  });
};

export const publishMappedContentPost = async (
  input: MappedContentPostMutationInput,
) =>
  updateMappedContentPost({
    ...input,
    saveMode: "publish",
  });

export const unpublishMappedContentPost = async (
  input: MappedContentPostMutationInput,
) =>
  updateMappedContentPost({
    ...input,
    saveMode: "unpublish",
  });

export const archiveMappedContentPost = async (
  input: MappedContentPostMutationInput,
) =>
  updateMappedContentPost({
    ...input,
    saveMode: "archive",
  });

export const discardMappedContentPost = async ({
  context,
  dependencies,
  postId,
  projectId,
}: {
  context: ContentProjectContext;
  dependencies: ContentPostsDependencies;
  postId: string;
  projectId: string;
}) => {
  ensureContentPostContextReady(context);

  const readyMapping = await dependencies.getReadyContentProjectMapping({
    context,
    projectId,
  });

  if (!readyMapping) {
    throw new Error("Finish posts setup before discarding posts.");
  }

  dependencies.ensureContentPermission(context, "write");

  return dependencies.withContentDatabaseClient(context.connectionString as string, async (client) => {
    const adapter = createContentPostExecutionAdapter(readyMapping);
    const loadPost = getRequiredContentRuntimeAdapterMethod(adapter, "loadPost");
    const existingPost = await loadPost({
      client,
      postId,
      projectId,
    });

    if (!canAccessAuthorScopedContent(context.memberAccess, "write", existingPost.authorId)) {
      throw new Error(dependencies.getPermissionError("write"));
    }

    if (!isDisposableContentPostDraft(existingPost)) {
      throw new Error("Only untouched empty drafts can be discarded.");
    }

    await getRequiredContentRuntimeAdapterMethod(adapter, "discardPost")({
      client,
      postId,
    });

    await refreshContentPostsProjection({
      client,
      mapping: readyMapping,
      postIds: [postId],
      projectId,
    }).catch(() => undefined);
  });
};

export const deleteMappedContentPosts = async ({
  context,
  dependencies,
  postIds,
  projectId,
}: {
  context: ContentProjectContext;
  dependencies: ContentPostsDependencies;
  postIds: string[];
  projectId: string;
}) => {
  ensureContentPostContextReady(context);

  const readyMapping = await dependencies.getReadyContentProjectMapping({
    context,
    projectId,
  });

  if (!readyMapping) {
    throw new Error("Finish posts setup before deleting posts.");
  }

  dependencies.ensureContentPermission(context, "write");

  const normalizedPostIds = Array.from(new Set(postIds.map((postId) => postId.trim()).filter(Boolean)));

  return dependencies.withContentDatabaseClient(context.connectionString as string, async (client) => {
    const adapter = createContentPostExecutionAdapter(readyMapping);
    const loadPost = getRequiredContentRuntimeAdapterMethod(adapter, "loadPost");

    for (const postId of normalizedPostIds) {
      const existingPost = await loadPost({
        client,
        postId,
        projectId,
      });

      if (!canAccessAuthorScopedContent(context.memberAccess, "write", existingPost.authorId)) {
        throw new Error(dependencies.getPermissionError("write"));
      }
    }

    await getRequiredContentRuntimeAdapterMethod(adapter, "deletePosts")({
      client,
      postIds: normalizedPostIds,
    });

    await refreshContentPostsProjection({
      client,
      mapping: readyMapping,
      postIds: normalizedPostIds,
      projectId,
    }).catch(() => undefined);
  });
};
