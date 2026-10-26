import "server-only";

import { Client, Pool } from "pg";

import { getProjectPostSidebarConfig } from "@/lib/control-plane/project-post-sidebar-config";
import { getConfigContentDatabaseSslConfig } from "@/lib/basebuddy-config/install";
import {
  canManageProjectTaxonomy,
  getAccessibleAuthorIdsForAction,
  hasProjectPermission,
  hasProjectContentPermission,
  type ProjectContentAction,
  type ProjectPermissionKey,
} from "@/lib/control-plane/permissions";

import {
  getContentAuthorOptions as getContentAuthorOptionsState,
  createContentCollectionEntry as createContentCollectionEntryState,
  deleteContentCollectionEntries as deleteContentCollectionEntriesState,
  getContentAuthorsPage as getContentAuthorsPageState,
  getContentCategoriesPage as getContentCategoriesPageState,
  getContentMediaPage as getContentMediaPageState,
  getContentTagsPage as getContentTagsPageState,
  updateContentCollectionEntry as updateContentCollectionEntryState,
} from "./server-collections";
import {
  createContentMediaFolder as createContentMediaFolderState,
  deleteContentMediaFolder as deleteContentMediaFolderState,
  deleteContentMediaImage as deleteContentMediaImageState,
  getContentMediaLibrary as getContentMediaLibraryState,
  getContentUploadedMediaFiles as getContentUploadedMediaFilesState,
  moveContentMediaFolder as moveContentMediaFolderState,
  moveContentMediaImage as moveContentMediaImageState,
  prepareContentMediaUploads as prepareContentMediaUploadsState,
  uploadContentMediaFiles as uploadContentMediaFilesState,
} from "./server-media";
import {
  createContentFilesFolder as createContentFilesFolderState,
  deleteContentFile as deleteContentFileState,
  deleteContentFilesFolder as deleteContentFilesFolderState,
  getContentFilesLibrary as getContentFilesLibraryState,
  getContentUploadedFiles as getContentUploadedFilesState,
  moveContentFile as moveContentFileState,
  moveContentFilesFolder as moveContentFilesFolderState,
  prepareContentFilesUploads as prepareContentFilesUploadsState,
  uploadContentFiles as uploadContentFilesState,
} from "./server-files";
import {
  acquireContentPostEditSessionAccess,
  getProjectPostAuthorAssignments,
  getProjectPostEditSessionSnapshot,
  heartbeatContentPostEditSessionAccess,
  releaseContentPostEditSessionAccess,
} from "./server-post-edit-sessions";
import {
  archiveContentPost as archiveContentPostState,
  createContentPost as createContentPostState,
  deleteContentPosts as deleteContentPostsState,
  discardContentPost as discardContentPostState,
  ensureContentPostWriteAccess as ensureContentPostWriteAccessState,
  getContentPostById as getContentPostByIdState,
  getContentPostEditorPayload as getContentPostEditorPayloadState,
  getContentPostRelationOptions as getContentPostRelationOptionsState,
  getContentPostsPage as getContentPostsPageState,
  publishContentPost as publishContentPostState,
  unpublishContentPost as unpublishContentPostState,
  updateContentPost as updateContentPostState,
} from "./server-posts";
import {
  getContentPostRevisions as getContentPostRevisionsState,
  restoreContentPostRevision as restoreContentPostRevisionState,
} from "./server-post-revisions";
import {
  getContentFilesStorageCredentialStatus,
  getContentMediaStorageCredentialStatus,
  getContentS3CompatibleFilesCredentials,
  getContentS3CompatibleMediaCredentials,
  getContentStorageServiceKey,
} from "./server-project-credentials";
import {
  getBootstrapContentProjectMapping as getBootstrapContentProjectMappingState,
  ensureContentMappingDraft as ensureContentMappingDraftState,
  getContentProjectSupabaseStorageBuckets as getContentProjectSupabaseStorageBucketsState,
  getContentProjectFilesStorageCredentialStatus as getContentProjectFilesStorageCredentialStatusState,
  getContentProjectMapping as getContentProjectMappingState,
  getContentProjectMappingDetection as getContentProjectMappingDetectionState,
  getContentProjectMappingTables as getContentProjectMappingTablesState,
  getContentProjectMediaStorageCredentialStatus as getContentProjectMediaStorageCredentialStatusState,
  getReadyContentProjectMapping as getReadyContentProjectMappingState,
  loadStoredContentProjectMapping as loadStoredContentProjectMappingState,
  refreshContentProjectMappingTables as refreshContentProjectMappingTablesState,
  saveContentMappingRevision as saveContentMappingRevisionState,
} from "./server-project-mapping";
import {
  ensureDirectConnectionForMappedRuntime,
  getContentProjectContext,
  type ContentProjectContext,
} from "./server-project-context";
import { bindContentProjectContext } from "./server-bound-context";
import {
  getContentSnapshot as getContentSnapshotState,
  getContentWorkspaceSummary as getContentWorkspaceSummaryState,
  getContentWorkspaceMeta as getContentWorkspaceMetaState,
} from "./server-workspace";
import {
  type ContentCategoriesPage,
  type ContentCollectionPage,
  slugifyContentValue,
  type ContentAuthor,
  type ContentFilesLibrary,
  type ContentMedia,
  type ContentMediaLibrary,
  type ContentPost,
  type ContentPostEditingSession,
  type ContentPostEditorPayload,
  type ContentRedirectEntryInput,
  type ContentRelationFieldKey,
  type ContentPostRevision,
  type ContentRelationOption,
  type ContentPostsPage,
  type ContentPostsSort,
  type ContentPostsStatusFilter,
  type ContentSnapshot,
  type ContentTag,
  type ContentWorkspaceSummary,
  type ContentWorkspaceMeta,
} from "./shared";
import { type ContentAutoMappingResult } from "./introspection";
import {
  type ContentBindingStatus,
  type ContentMappingConfig,
  type ContentMappingSaveScope,
  type ContentProjectMapping,
  type ContentMappingRevisionSource,
} from "./mapping";
import {
  type ContentPaginationInput,
} from "./server-support";
import {
  buildGeneratedContentUniqueSlugLookupQuery,
} from "./adapter/generated-query-builders";
import {
  getGeneratedContentTables,
} from "./server-project-schema-support";
import {
  markContentPostsProjectionStale,
} from "./server-content-post-projection";
import {
  refreshContentPostsProjection,
} from "./server-content-post-projection-builder";
import {
  assertContentDatabaseCircuitClosed,
  CONTENT_DATABASE_CONNECTION_TIMEOUT_MS,
  CONTENT_DATABASE_QUERY_TIMEOUT_MS,
  CONTENT_DATABASE_STATEMENT_TIMEOUT_MS,
  noteContentDatabaseFailure,
  noteContentDatabaseSuccess,
} from "./content-database-resilience";
import {
  getCachedProjectRuntimeValue,
  invalidateProjectRuntimeCacheGroups,
  invalidateProjectRuntimeCache,
  peekCachedProjectRuntimeValue,
  type ProjectRuntimeCacheGroup,
  projectRuntimeCacheGroups,
} from "./server-runtime-cache";
import {
  getContentPostPayloadCacheKey,
  getContentPostsPageCacheKey,
  getContentPostsPresenceCacheKey,
  getContentRelationOptionsCacheKey,
  getContentStorageLibraryCacheKey,
  getContentWorkspaceMetaCacheKey,
  getContentWorkspaceSummaryCacheKey,
} from "./server-runtime-cache-keys";
import { invalidateContentWorkspaceCountsCache } from "./server-workspace-mapped-content";
import { getContentWorkspaceRuntimeSignature } from "./server-workspace-mapped-content";
import {
  incrementContentRuntimeRequestMetric,
  measureContentRuntimeRequestSpan,
  setContentRuntimeRequestMetric,
} from "./request-observability";
import {
  applyPersistedContentWorkspaceSummaryCountDeltas,
  markPersistedContentWorkspaceSummaryInexact,
  type ContentWorkspaceSummaryCountDeltas,
} from "./server-runtime-summary";

type ContentDatabaseClientOptions = {
  connectionString: string;
};

type ContentDatabaseClient = Pick<Client, "query">;

type ContentCollectionEntryTable = "authors" | "categories" | "tags";

type SnapshotResponse = ContentSnapshot & {
  message?: string;
};

const CONTENT_RUNTIME_POOL_MAX_CLIENTS = 8;
const CONTENT_WORKSPACE_META_CACHE_TTL_MS = 15_000;
const CONTENT_WORKSPACE_META_STALE_WHILE_REVALIDATE_MS = 60_000;
const CONTENT_POSTS_PAGE_CACHE_TTL_MS = 10_000;
const CONTENT_POSTS_PAGE_STALE_WHILE_REVALIDATE_MS = 45_000;
const contentDatabasePools = new Map<string, Pool>();

type ContentObservedCacheState = "fresh" | "missing" | "stale" | "uncached";

const setContentRuntimeRequestScopeKey = (scopeKey: string) => {
  setContentRuntimeRequestMetric("scopeKey", scopeKey);
};

const setContentRuntimeRequestCacheState = (cacheState: ContentObservedCacheState) => {
  setContentRuntimeRequestMetric("cacheState", cacheState);
};

const setContentProjectContextMetrics = (_context: ContentProjectContext) => {};

const getContentWorkspaceMetaScopeKey = () => "workspace-meta";

const getContentWorkspaceSummaryScopeKey = () => "workspace-summary";

const getContentPostsPageScopeKey = ({
  cursor,
  page,
  pageSize,
  search,
  sort,
  status,
}: {
  cursor?: string | null;
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: ContentPostsSort;
  status?: ContentPostsStatusFilter;
}) =>
  [
    "posts-page",
    `page:${page ?? 1}`,
    `size:${pageSize ?? "default"}`,
    `sort:${sort ?? "updated_desc"}`,
    `status:${status ?? "all"}`,
    `search:${search?.trim() ? "query" : "none"}`,
    `cursor:${cursor?.trim() ? "keyset" : "offset"}`,
  ].join("|");

const getContentPostPayloadScopeKey = (includeEditorOptions: boolean) =>
  `post-payload|editor-options:${includeEditorOptions ? "full" : "warm"}`;

const getContentPostsPresenceScopeKey = () => "posts-presence";

const getContentPostRevisionsScopeKey = (limit: number) =>
  `post-revisions|limit:${limit}`;

const getContentDatabasePool = ({ connectionString }: ContentDatabaseClientOptions) => {
  const sslConfig = getConfigContentDatabaseSslConfig(connectionString);
  const existingPool = contentDatabasePools.get(connectionString);

  if (existingPool) {
    return existingPool;
  }

  const pool = new Pool({
    allowExitOnIdle: true,
    connectionString,
    connectionTimeoutMillis: CONTENT_DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 5_000,
    max: CONTENT_RUNTIME_POOL_MAX_CLIENTS,
    query_timeout: CONTENT_DATABASE_QUERY_TIMEOUT_MS,
    ssl: sslConfig,
    statement_timeout: CONTENT_DATABASE_STATEMENT_TIMEOUT_MS,
  });

  contentDatabasePools.set(connectionString, pool);
  return pool;
};

const withContentDatabaseClient = async <T>(
  connectionString: string,
  handler: (client: ContentDatabaseClient) => Promise<T>,
) => {
  incrementContentRuntimeRequestMetric("pgCallCount");

  return measureContentRuntimeRequestSpan("db", async () => {
    assertContentDatabaseCircuitClosed(connectionString);

    try {
      const pool = getContentDatabasePool({ connectionString });
      const client = await pool.connect();

      try {
        const value = await handler(client);
        noteContentDatabaseSuccess(connectionString);
        return value;
      } finally {
        client.release();
      }
    } catch (error) {
      noteContentDatabaseFailure(connectionString, error);
      throw error;
    }
  });
};

const getContentPermissionError = (action: ProjectContentAction) => {
  if (action === "read") {
    return "You do not have permission to view posts in this project.";
  }

  if (action === "write") {
    return "You do not have permission to edit posts in this project.";
  }

  return "You do not have permission to publish posts in this project.";
};

const ensureContentProjectPermission = (
  context: ContentProjectContext,
  permissionKey: ProjectPermissionKey,
  message: string,
) => {
  if (!hasProjectPermission(context.memberAccess, permissionKey)) {
    throw new Error(message);
  }
};

const ensureContentProjectManagementPermission = (
  context: ContentProjectContext,
  message: string,
) => {
  ensureContentProjectPermission(context, "project.update", message);
};

const ensureContentAuthorManagementPermission = (context: ContentProjectContext) => {
  const message = "You do not have permission to manage authors in this project.";

  ensureContentProjectManagementPermission(context, message);
  ensureContentProjectPermission(context, "author.scope.manage", message);
};

const ensureContentCollectionWritePermission = (
  context: ContentProjectContext,
  collection: ContentCollectionEntryTable,
) => {
  if (collection === "authors") {
    ensureContentAuthorManagementPermission(context);
    return;
  }

  if (!canManageProjectTaxonomy(context.memberAccess)) {
    throw new Error(
      collection === "categories"
        ? "You do not have permission to manage categories in this project."
        : "You do not have permission to manage tags in this project.",
    );
  }
};

const ensureContentActionPermission = (
  context: ContentProjectContext,
  action: ProjectContentAction,
) => {
  if (!hasProjectContentPermission(context.memberAccess, action)) {
    throw new Error(getContentPermissionError(action));
  }

  return getAccessibleAuthorIdsForAction(context.memberAccess, action);
};

const getContentPostsDependencies = () => ({
  ensureContentPermission: ensureContentActionPermission,
  ensureDirectConnectionForMappedRuntime,
  getBootstrapContentProjectMapping,
  getPermissionError: getContentPermissionError,
  getProjectContext: getContentProjectContext,
  getReadyContentProjectMapping,
  withContentDatabaseClient: withContentDatabaseClient,
});

const getBoundContentPostsDependencies = (context: ContentProjectContext) => {
  return bindContentProjectContext(getContentPostsDependencies(), context);
};

const getBoundContentWorkspaceDependencies = (context: ContentProjectContext) => {
  return bindContentProjectContext(getContentWorkspaceDependencies(), context);
};

const CONTENT_WORKSPACE_INVALIDATION_GROUPS = [
  projectRuntimeCacheGroups.workspaceMeta,
  projectRuntimeCacheGroups.workspaceSummary,
] as const;

const CONTENT_POST_INVALIDATION_GROUPS = [
  ...CONTENT_WORKSPACE_INVALIDATION_GROUPS,
  projectRuntimeCacheGroups.postDetail,
  projectRuntimeCacheGroups.postsCount,
  projectRuntimeCacheGroups.postsPage,
  projectRuntimeCacheGroups.postsSnapshot,
] as const;

const CONTENT_COLLECTION_INVALIDATION_GROUPS = [
  ...CONTENT_POST_INVALIDATION_GROUPS,
  projectRuntimeCacheGroups.taxonomyOptions,
] as const;

const CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS = [
  ...CONTENT_WORKSPACE_INVALIDATION_GROUPS,
  projectRuntimeCacheGroups.filesLibrary,
  projectRuntimeCacheGroups.mediaLibrary,
] as const;

const invalidateContentProjectRuntimeGroups = (
  projectId: string,
  groups: readonly ProjectRuntimeCacheGroup[],
) => {
  if (
    groups.includes(projectRuntimeCacheGroups.workspaceMeta) ||
    groups.includes(projectRuntimeCacheGroups.workspaceSummary)
  ) {
    invalidateContentWorkspaceCountsCache(projectId);
  }

  invalidateProjectRuntimeCacheGroups(projectId, [...groups]);
};

const invalidateAllContentProjectCaches = (projectId: string) => {
  invalidateContentWorkspaceCountsCache(projectId);
  invalidateProjectRuntimeCache(projectId);
};

const getRequiredContentProjectContext = async (projectId: string) => {
  const context = await measureContentRuntimeRequestSpan("context", () =>
    getContentProjectContext(projectId),
  );

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  setContentProjectContextMetrics(context);
  return context;
};

const getContentRuntimeSignatureForContext = async ({
  context,
  projectId,
}: {
  context: ContentProjectContext;
  projectId: string;
}) => {

  const readyMapping = await getReadyContentProjectMappingState({
    context,
    dependencies: getBoundContentMappingDependencies(context),
    projectId,
  });

  return readyMapping ? getContentWorkspaceRuntimeSignature({ readyMapping }) : null;
};

const updatePersistedContentWorkspaceSummaryForMutation = async ({
  context,
  deltas,
  projectId,
}: {
  context: ContentProjectContext;
  deltas: ContentWorkspaceSummaryCountDeltas;
  projectId: string;
}) => {
  const resolvedRuntimeSignature = await getContentRuntimeSignatureForContext({
    context,
    projectId,
  });

  if (!resolvedRuntimeSignature) {
    return;
  }

  await applyPersistedContentWorkspaceSummaryCountDeltas({
    deltas,
    projectId,
    runtimeSignature: resolvedRuntimeSignature,
  });
};

const markPersistedContentWorkspaceSummaryStoragePending = async ({
  context,
  projectId,
}: {
  context: ContentProjectContext;
  projectId: string;
}) => {
  const resolvedRuntimeSignature = await getContentRuntimeSignatureForContext({
    context,
    projectId,
  });

  if (!resolvedRuntimeSignature) {
    return;
  }

  await markPersistedContentWorkspaceSummaryInexact({
    projectId,
    runtimeSignature: resolvedRuntimeSignature,
  });
};

const queueContentPostsProjectionRefresh = ({
  context,
  mapping = null,
  markStale = false,
  projectId,
}: {
  context: ContentProjectContext;
  mapping?: ContentProjectMapping | null;
  markStale?: boolean;
  projectId: string;
}) => {
  if (!context.connectionString) {
    return;
  }

  void (async () => {
    const readyMapping =
      mapping ??
      (await getReadyContentProjectMapping({
        context,
        projectId,
      }));

    if (!readyMapping) {
      return;
    }

    if (markStale) {
      await markContentPostsProjectionStale({
        mapping: readyMapping,
        projectId,
      }).catch(() => undefined);
    }

    await withContentDatabaseClient(context.connectionString as string, async (client) =>
      refreshContentPostsProjection({
        client,
        mapping: readyMapping,
        projectId,
      }),
    );
  })().catch(() => undefined);
};

export const acquireContentPostEditSession = async ({
  force = false,
  postId,
  postTitle,
  projectId,
}: {
  force?: boolean;
  postId: string;
  postTitle?: string | null;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const dependencies = getBoundContentPostsDependencies(context);

  return acquireContentPostEditSessionAccess({
    context,
    force,
    postId,
    postTitle,
    projectId,
    verifyPostWriteAccess: async () => {
      await withContentDatabaseClient(context.connectionString as string, async (client) => {
        await ensureContentPostWriteAccessState({
          client,
          context,
          dependencies,
          postId,
        });
      });
    },
  });
};

export const heartbeatContentPostEditSession = async ({
  postId,
  postTitle,
  projectId,
}: {
  postId: string;
  postTitle?: string | null;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const dependencies = getBoundContentPostsDependencies(context);

  return heartbeatContentPostEditSessionAccess({
    context,
    postId,
    postTitle,
    projectId,
    verifyPostWriteAccess: async () => {
      await withContentDatabaseClient(context.connectionString as string, async (client) => {
        await ensureContentPostWriteAccessState({
          client,
          context,
          dependencies,
          postId,
        });
      });
    },
  });
};

export const releaseContentPostEditSession = async ({
  postId,
  projectId,
}: {
  postId?: string | null;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  await releaseContentPostEditSessionAccess({
    context,
    postId,
    projectId,
  });
};

const getContentMappingDependencies = () => ({
  ensureProjectManagementPermission: ensureContentProjectManagementPermission,
  ensureProjectPermission: ensureContentProjectPermission,
  getFilesStorageCredentialStatus: getContentFilesStorageCredentialStatus,
  getMediaStorageCredentialStatus: getContentMediaStorageCredentialStatus,
  getProjectContext: getContentProjectContext,
  withContentDatabaseClient: withContentDatabaseClient,
});

const getBoundContentMappingDependencies = (context: ContentProjectContext) =>
  bindContentProjectContext(getContentMappingDependencies(), context);

const getReadyContentProjectMapping = ({
  client,
  context,
  projectId,
}: {
  client?: ContentDatabaseClient;
  context: ContentProjectContext;
  projectId: string;
}) =>
  getReadyContentProjectMappingState({
    client,
    context,
    dependencies: getBoundContentMappingDependencies(context),
    projectId,
  });

const getBootstrapContentProjectMapping = ({
  context,
  projectId,
}: {
  context: ContentProjectContext;
  projectId: string;
}) =>
  getBootstrapContentProjectMappingState({
    context,
    projectId,
  });

const getContentWorkspaceDependencies = () => ({
  ensureContentPermission: ensureContentActionPermission,
  ensureDirectConnectionForMappedRuntime,
  getBootstrapContentProjectMapping,
  getProjectContext: getContentProjectContext,
  getContentS3CompatibleFilesCredentials,
  getContentS3CompatibleMediaCredentials,
  getContentStorageServiceKey,
  getProjectPostSidebarConfig,
  getProjectPostAuthorAssignments,
  getReadyContentProjectMapping,
  withContentDatabaseClient: withContentDatabaseClient,
});

export const getContentWorkspaceMeta = async (
  projectId: string,
): Promise<ContentWorkspaceMeta> => {
  return measureContentRuntimeRequestSpan("workspace_meta", async () => {
    const context = await getRequiredContentProjectContext(projectId);
    const scopeKey = getContentWorkspaceMetaScopeKey();
    const cacheKey = getContentWorkspaceMetaCacheKey({ context, projectId });

    setContentRuntimeRequestScopeKey(scopeKey);
    setContentRuntimeRequestCacheState(peekCachedProjectRuntimeValue(cacheKey).state);

    return getCachedProjectRuntimeValue({
      cacheKey,
      groups: [projectRuntimeCacheGroups.workspaceMeta],
      load: () =>
        getContentWorkspaceMetaState({
          dependencies: getBoundContentWorkspaceDependencies(context),
          projectId,
      }),
      observability: {
        scopeKey,
      },
      projectId,
      staleWhileRevalidateMs: CONTENT_WORKSPACE_META_STALE_WHILE_REVALIDATE_MS,
      ttlMs: CONTENT_WORKSPACE_META_CACHE_TTL_MS,
    });
  });
};

export const getContentWorkspaceSummary = async (
  projectId: string,
): Promise<ContentWorkspaceSummary> => {
  return measureContentRuntimeRequestSpan("workspace_summary", async () => {
    const context = await getRequiredContentProjectContext(projectId);
    const scopeKey = getContentWorkspaceSummaryScopeKey();
    const cacheKey = getContentWorkspaceSummaryCacheKey({ context, projectId });

    setContentRuntimeRequestScopeKey(scopeKey);
    setContentRuntimeRequestCacheState(peekCachedProjectRuntimeValue(cacheKey).state);

    return getCachedProjectRuntimeValue({
      cacheKey,
      groups: [projectRuntimeCacheGroups.workspaceSummary],
      load: () =>
        getContentWorkspaceSummaryState({
          dependencies: getBoundContentWorkspaceDependencies(context),
          projectId,
        }),
      observability: {
        scopeKey,
      },
      projectId,
      staleWhileRevalidateMs: CONTENT_WORKSPACE_META_STALE_WHILE_REVALIDATE_MS,
      ttlMs: CONTENT_WORKSPACE_META_CACHE_TTL_MS,
    });
  });
};

export const getContentPostsPage = async ({
  cursor = null,
  page,
  pageSize,
  projectId,
  search = "",
  sort = "updated_desc",
  status = "all",
}: ContentPaginationInput & {
  cursor?: string | null;
  projectId: string;
  search?: string;
  sort?: ContentPostsSort;
  status?: ContentPostsStatusFilter;
}): Promise<ContentPostsPage> => {
  return measureContentRuntimeRequestSpan("posts_page", async () => {
    const context = await getRequiredContentProjectContext(projectId);
    const scopeKey = getContentPostsPageScopeKey({
      cursor,
      page,
      pageSize,
      search,
      sort,
      status,
    });
    const cacheKey = getContentPostsPageCacheKey({
      context,
      cursor,
      page,
      pageSize,
      projectId,
      search,
      sort,
      status,
    });

    setContentRuntimeRequestScopeKey(scopeKey);
    setContentRuntimeRequestCacheState(peekCachedProjectRuntimeValue(cacheKey).state);
    setContentRuntimeRequestMetric("hasSearch", search.trim().length > 0);
    setContentRuntimeRequestMetric("page", page ?? 1);
    setContentRuntimeRequestMetric("pageSize", pageSize ?? "default");
    setContentRuntimeRequestMetric("searchLength", search.trim().length);
    setContentRuntimeRequestMetric("sort", sort);
    setContentRuntimeRequestMetric("statusFilter", status);

    return getCachedProjectRuntimeValue({
      cacheKey,
      groups: [projectRuntimeCacheGroups.postsPage],
      load: () =>
        getContentPostsPageState({
          dependencies: getBoundContentPostsDependencies(context),
          cursor,
          page,
          pageSize,
          projectId,
          search,
          sort,
          status,
        }),
      observability: {
        scopeKey,
      },
      projectId,
      staleWhileRevalidateMs: CONTENT_POSTS_PAGE_STALE_WHILE_REVALIDATE_MS,
      ttlMs: CONTENT_POSTS_PAGE_CACHE_TTL_MS,
    });
  });
};

export const getContentPostEditorPayload = async ({
  includeEditorOptions = true,
  postId,
  projectId,
}: {
  includeEditorOptions?: boolean;
  postId: string;
  projectId: string;
}): Promise<ContentPostEditorPayload> => {
  return measureContentRuntimeRequestSpan("post_payload", async () => {
    const context = await getRequiredContentProjectContext(projectId);
    const scopeKey = getContentPostPayloadScopeKey(includeEditorOptions);

    setContentRuntimeRequestScopeKey(scopeKey);
    setContentRuntimeRequestMetric("includeEditorOptions", includeEditorOptions);

    if (includeEditorOptions) {
      setContentRuntimeRequestCacheState("uncached");

      return getContentPostEditorPayloadState({
        dependencies: getBoundContentPostsDependencies(context),
        includeEditorOptions,
        postId,
        projectId,
      });
    }

    const cacheKey = getContentPostPayloadCacheKey({
      context,
      includeEditorOptions,
      postId,
      projectId,
    });

    setContentRuntimeRequestCacheState(peekCachedProjectRuntimeValue(cacheKey).state);

    return getCachedProjectRuntimeValue({
      cacheKey,
      groups: [projectRuntimeCacheGroups.postDetail],
      load: () =>
        getContentPostEditorPayloadState({
          dependencies: getBoundContentPostsDependencies(context),
          includeEditorOptions,
          postId,
          projectId,
        }),
      observability: {
        scopeKey,
      },
      projectId,
      staleWhileRevalidateMs: CONTENT_POSTS_PAGE_STALE_WHILE_REVALIDATE_MS,
      ttlMs: CONTENT_POSTS_PAGE_CACHE_TTL_MS,
    });
  });
};

export const getContentPostRelationOptions = async ({
  fieldKey,
  limit = 100,
  projectId,
  search = "",
  selectedIds,
}: {
  fieldKey: ContentRelationFieldKey;
  limit?: number;
  projectId: string;
  search?: string;
  selectedIds?: string[];
}): Promise<ContentRelationOption[]> => {
  const context = await getRequiredContentProjectContext(projectId);
  const normalizedLimit = Math.max(1, Math.min(250, Math.floor(limit)));
  const cacheKey = getContentRelationOptionsCacheKey({
    context,
    fieldKey,
    limit: normalizedLimit,
    projectId,
    search,
    selectedIds,
  });

  return getCachedProjectRuntimeValue({
    cacheKey,
    groups: [projectRuntimeCacheGroups.taxonomyOptions],
    load: () =>
      getContentPostRelationOptionsState({
        dependencies: getBoundContentPostsDependencies(context),
        fieldKey,
        limit: normalizedLimit,
        projectId,
        search,
        selectedIds,
      }),
    projectId,
    staleWhileRevalidateMs: 30_000,
    ttlMs: 5_000,
  });
};

export const getContentPostsPresence = async (
  projectId: string,
): Promise<{
  sessions: Array<{ editingSession: ContentPostEditingSession; postId: string }>;
}> => {
  return measureContentRuntimeRequestSpan("posts_presence", async () => {
    const context = await getRequiredContentProjectContext(projectId);
    const scopeKey = getContentPostsPresenceScopeKey();
    const cacheKey = getContentPostsPresenceCacheKey({
      context,
      projectId,
    });

    setContentRuntimeRequestScopeKey(scopeKey);
    setContentRuntimeRequestCacheState(peekCachedProjectRuntimeValue(cacheKey).state);

    ensureContentActionPermission(context, "read");

    const sessionsByPostId = await getCachedProjectRuntimeValue({
      cacheKey,
      groups: [projectRuntimeCacheGroups.postsPresence],
      load: () => getProjectPostEditSessionSnapshot(projectId),
      observability: {
        scopeKey,
      },
      projectId,
      ttlMs: 3_000,
    });

    return {
      sessions: Array.from(sessionsByPostId.values()).map((editingSession) => ({
        editingSession: {
          ...editingSession,
          isCurrentUser: editingSession.userId === context.user.id,
        },
        postId: editingSession.postId,
      })),
    };
  });
};

const getContentPostRevisionDependencies = () => ({
  ensureDirectConnectionForMappedRuntime,
  getContentPermissionError,
  getPostById: (input: {
    client: ContentDatabaseClient;
    postId: string;
    projectSlug: string;
    schemaVersion: number | null | undefined;
  }) =>
    getContentPostByIdState({
      ...input,
    }),
  getProjectContext: getContentProjectContext,
  updatePost: updateContentPost,
  withContentDatabaseClient: withContentDatabaseClient,
});

const getBoundContentPostRevisionDependencies = (context: ContentProjectContext) =>
  {
    const dependencies = bindContentProjectContext(
      getContentPostRevisionDependencies(),
      context,
    );
    const postsDependencies = getBoundContentPostsDependencies(context);

    return {
      ...dependencies,
      updatePost: (input: {
        contentHtml?: string;
        contentJson?: Record<string, unknown>;
        contentMarkdown?: string | null;
        excerpt?: string | null;
        focusKeyword?: string | null;
        featuredImageUrl?: string | null;
        postId: string;
        publishedAt?: string | null;
        projectId: string;
        seoDescription?: string | null;
        seoTitle?: string | null;
        slug?: string;
        status?: ContentPost["status"];
        title?: string;
        expectedUpdatedAt?: string | null;
        expectedVersion?: string;
        updatedAt?: string | null;
      }) =>
        updateContentPostState({
          ...input,
          dependencies: postsDependencies,
        }),
    };
  };

export const getContentPostRevisions = async ({
  limit = 20,
  postId,
  projectId,
}: {
  limit?: number;
  postId: string;
  projectId: string;
}): Promise<ContentPostRevision[]> => {
  return measureContentRuntimeRequestSpan("post_revisions", async () => {
    const context = await getRequiredContentProjectContext(projectId);

    setContentRuntimeRequestScopeKey(getContentPostRevisionsScopeKey(limit));
    setContentRuntimeRequestCacheState("uncached");
    setContentRuntimeRequestMetric("limit", limit);

    return getContentPostRevisionsState({
      dependencies: getBoundContentPostRevisionDependencies(context),
      limit,
      postId,
      projectId,
    });
  });
};

export const restoreContentPostRevision = async ({
  postId,
  projectId,
  revisionNumber,
}: {
  postId: string;
  projectId: string;
  revisionNumber: number;
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const post = await restoreContentPostRevisionState({
    dependencies: getBoundContentPostRevisionDependencies(context),
    postId,
    projectId,
    revisionNumber,
  });

  invalidateContentProjectRuntimeGroups(projectId, CONTENT_POST_INVALIDATION_GROUPS);
  return post;
};

const getContentCollectionDependencies = () => ({
  ensureAuthorManagementPermission: ensureContentAuthorManagementPermission,
  ensureCollectionWritePermission: ensureContentCollectionWritePermission,
  ensureDirectConnectionForMappedRuntime,
  getProjectContext: getContentProjectContext,
  getProjectPostAuthorAssignments,
  getReadyContentProjectMapping,
  getUniqueSlugForTable,
  withContentDatabaseClient: withContentDatabaseClient,
});

const getBoundContentCollectionDependencies = (context: ContentProjectContext) =>
  bindContentProjectContext(getContentCollectionDependencies(), context);

export const getContentCategoriesPage = async ({
  includeAllCategories = false,
  page,
  pageSize,
  projectId,
  search,
}: ContentPaginationInput & {
  includeAllCategories?: boolean;
  projectId: string;
  search?: string;
}): Promise<ContentCategoriesPage> => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentCategoriesPageState({
    dependencies: getBoundContentCollectionDependencies(context),
    includeAllCategories,
    page,
    pageSize,
    projectId,
    search,
  });
};

export const getContentTagsPage = async ({
  page,
  pageSize,
  projectId,
  search,
}: ContentPaginationInput & {
  projectId: string;
  search?: string;
}): Promise<ContentCollectionPage<ContentTag>> => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentTagsPageState({
    dependencies: getBoundContentCollectionDependencies(context),
    page,
    pageSize,
    projectId,
    search,
  });
};

export const getContentAuthorsPage = async ({
  page,
  pageSize,
  projectId,
  search,
}: ContentPaginationInput & {
  projectId: string;
  search?: string;
}): Promise<ContentCollectionPage<ContentAuthor>> => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentAuthorsPageState({
    dependencies: getBoundContentCollectionDependencies(context),
    page,
    pageSize,
    projectId,
    search,
  });
};

export const getContentAuthorOptions = async ({
  limit = 100,
  projectId,
}: {
  limit?: number;
  projectId: string;
}): Promise<Array<Pick<ContentAuthor, "id" | "name" | "slug">>> => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentAuthorOptionsState({
    dependencies: getBoundContentCollectionDependencies(context),
    limit,
    projectId,
  });
};

export const getContentMediaPage = async ({
  page,
  pageSize,
  projectId,
}: ContentPaginationInput & {
  projectId: string;
}): Promise<ContentCollectionPage<ContentMedia>> => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentMediaPageState({
    dependencies: getBoundContentCollectionDependencies(context),
    page,
    pageSize,
    projectId,
  });
};

const getContentMediaDependencies = () => ({
  getProjectContext: getContentProjectContext,
  getContentS3CompatibleFilesCredentials,
  getContentS3CompatibleMediaCredentials,
  getContentStorageServiceKey,
  getReadyContentProjectMapping,
  withContentDatabaseClient: withContentDatabaseClient,
});

const getBoundContentMediaDependencies = (context: ContentProjectContext) =>
  bindContentProjectContext(getContentMediaDependencies(), context);

export const getContentMediaLibrary = async ({
  currentPath,
  cursor = null,
  includeFolderOptions = false,
  projectId,
  search,
}: {
  currentPath?: string | null;
  cursor?: string | null;
  includeFolderOptions?: boolean;
  projectId: string;
  search?: string | null;
}): Promise<ContentMediaLibrary> => {
  const context = await getRequiredContentProjectContext(projectId);
  const cacheKey = getContentStorageLibraryCacheKey({
    context,
    currentPath,
    cursor,
    includeFolderOptions,
    kind: "media",
    projectId,
    search,
  });

  return getCachedProjectRuntimeValue({
    cacheKey,
    groups: [projectRuntimeCacheGroups.mediaLibrary],
    load: () =>
      getContentMediaLibraryState({
        currentPath,
        cursor,
        dependencies: getBoundContentMediaDependencies(context),
        includeFolderOptions,
        projectId,
        search,
      }),
    observability: {
      mode: "media-library",
      scopeKey: "storage-library",
    },
    projectId,
    staleWhileRevalidateMs: 30_000,
    ttlMs: 5_000,
  });
};

export const getContentFilesLibrary = async ({
  currentPath,
  cursor = null,
  includeFolderOptions = false,
  projectId,
  search,
}: {
  currentPath?: string | null;
  cursor?: string | null;
  includeFolderOptions?: boolean;
  projectId: string;
  search?: string | null;
}): Promise<ContentFilesLibrary> => {
  const context = await getRequiredContentProjectContext(projectId);
  const cacheKey = getContentStorageLibraryCacheKey({
    context,
    currentPath,
    cursor,
    includeFolderOptions,
    kind: "files",
    projectId,
    search,
  });

  return getCachedProjectRuntimeValue({
    cacheKey,
    groups: [projectRuntimeCacheGroups.filesLibrary],
    load: () =>
      getContentFilesLibraryState({
        currentPath,
        cursor,
        dependencies: getBoundContentMediaDependencies(context),
        includeFolderOptions,
        projectId,
        search,
      }),
    observability: {
      mode: "files-library",
      scopeKey: "storage-library",
    },
    projectId,
    staleWhileRevalidateMs: 30_000,
    ttlMs: 5_000,
  });
};

export const createContentMediaFolder = async ({
  folderName,
  parentPath,
  projectId,
}: {
  folderName: string;
  parentPath?: string | null;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const result = await createContentMediaFolderState({
    dependencies: getBoundContentMediaDependencies(context),
    folderName,
    parentPath,
    projectId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return result;
};

export const uploadContentMediaFiles = async ({
  files,
  projectId,
  targetPath,
}: {
  files: File[];
  projectId: string;
  targetPath?: string | null;
}): Promise<{ objectPath: string; signedUrl: string }[]> => {
  const context = await getRequiredContentProjectContext(projectId);

  const uploadedFiles = await uploadContentMediaFilesState({
    dependencies: getBoundContentMediaDependencies(context),
    files,
    projectId,
    targetPath,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return uploadedFiles;
};

export const prepareContentMediaUploads = async ({
  files,
  projectId,
  targetPath,
  userId,
}: {
  files: { contentType: string; name: string; size: number }[];
  projectId: string;
  targetPath?: string | null;
  userId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  return prepareContentMediaUploadsState({
    dependencies: getBoundContentMediaDependencies(context),
    files,
    projectId,
    targetPath,
    userId,
  });
};

export const getContentUploadedMediaFiles = async ({
  objectPaths,
  projectId,
  userId,
}: {
  objectPaths: string[];
  projectId: string;
  userId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const uploadedFiles = await getContentUploadedMediaFilesState({
    dependencies: getBoundContentMediaDependencies(context),
    objectPaths,
    projectId,
    userId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return uploadedFiles;
};

export const createContentFilesFolder = async ({
  folderName,
  parentPath,
  projectId,
}: {
  folderName: string;
  parentPath?: string | null;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const result = await createContentFilesFolderState({
    dependencies: getBoundContentMediaDependencies(context),
    folderName,
    parentPath,
    projectId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return result;
};

export const uploadContentFiles = async ({
  files,
  projectId,
  targetPath,
}: {
  files: File[];
  projectId: string;
  targetPath?: string | null;
}): Promise<{ objectPath: string; signedUrl: string }[]> => {
  const context = await getRequiredContentProjectContext(projectId);

  const uploadedFiles = await uploadContentFilesState({
    dependencies: getBoundContentMediaDependencies(context),
    files,
    projectId,
    targetPath,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return uploadedFiles;
};

export const prepareContentFilesUploads = async ({
  files,
  projectId,
  targetPath,
  userId,
}: {
  files: { contentType: string; name: string; size: number }[];
  projectId: string;
  targetPath?: string | null;
  userId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  return prepareContentFilesUploadsState({
    dependencies: getBoundContentMediaDependencies(context),
    files,
    projectId,
    targetPath,
    userId,
  });
};

export const getContentUploadedFiles = async ({
  objectPaths,
  projectId,
  userId,
}: {
  objectPaths: string[];
  projectId: string;
  userId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const uploadedFiles = await getContentUploadedFilesState({
    dependencies: getBoundContentMediaDependencies(context),
    objectPaths,
    projectId,
    userId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return uploadedFiles;
};

export const moveContentMediaImage = async ({
  destinationPath,
  objectPath,
  projectId,
}: {
  destinationPath?: string | null;
  objectPath: string;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const nextObjectPath = await moveContentMediaImageState({
    dependencies: getBoundContentMediaDependencies(context),
    destinationPath,
    objectPath,
    projectId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return nextObjectPath;
};

export const moveContentMediaFolder = async ({
  destinationPath,
  folderPath,
  projectId,
}: {
  destinationPath?: string | null;
  folderPath: string;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const nextFolderPath = await moveContentMediaFolderState({
    dependencies: getBoundContentMediaDependencies(context),
    destinationPath,
    folderPath,
    projectId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return nextFolderPath;
};

export const deleteContentMediaImage = async ({
  objectPath,
  projectId,
}: {
  objectPath: string;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const result = await deleteContentMediaImageState({
    dependencies: getBoundContentMediaDependencies(context),
    objectPath,
    projectId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return result;
};

export const deleteContentMediaFolder = async ({
  folderPath,
  projectId,
}: {
  folderPath: string;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const result = await deleteContentMediaFolderState({
    dependencies: getBoundContentMediaDependencies(context),
    folderPath,
    projectId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return result;
};

export const moveContentFile = async ({
  destinationPath,
  objectPath,
  projectId,
}: {
  destinationPath?: string | null;
  objectPath: string;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const nextObjectPath = await moveContentFileState({
    dependencies: getBoundContentMediaDependencies(context),
    destinationPath,
    objectPath,
    projectId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return nextObjectPath;
};

export const moveContentFilesFolder = async ({
  destinationPath,
  folderPath,
  projectId,
}: {
  destinationPath?: string | null;
  folderPath: string;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const nextFolderPath = await moveContentFilesFolderState({
    dependencies: getBoundContentMediaDependencies(context),
    destinationPath,
    folderPath,
    projectId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return nextFolderPath;
};

export const deleteContentFile = async ({
  objectPath,
  projectId,
}: {
  objectPath: string;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const result = await deleteContentFileState({
    dependencies: getBoundContentMediaDependencies(context),
    objectPath,
    projectId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return result;
};

export const deleteContentFilesFolder = async ({
  folderPath,
  projectId,
}: {
  folderPath: string;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);

  const result = await deleteContentFilesFolderState({
    dependencies: getBoundContentMediaDependencies(context),
    folderPath,
    projectId,
  });

  await markPersistedContentWorkspaceSummaryStoragePending({
    context,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_MANAGED_STORAGE_INVALIDATION_GROUPS);
  return result;
};

const getUniqueSlugForTable = async ({
  base,
  client,
  excludeId,
  tableName,
}: {
  base: string;
  client: ContentDatabaseClient;
  excludeId?: string;
  tableName:
    | ReturnType<typeof getGeneratedContentTables>["authors"]
    | ReturnType<typeof getGeneratedContentTables>["categories"]
    | ReturnType<typeof getGeneratedContentTables>["posts"]
    | ReturnType<typeof getGeneratedContentTables>["tags"];
}) => {
  const normalizedBase = slugifyContentValue(base) || "untitled";
  let candidate = normalizedBase;
  let suffix = 2;

  while (true) {
    const result = await client.query<{ id: string }>(
      buildGeneratedContentUniqueSlugLookupQuery({
        tableName,
      }),
      [candidate, excludeId ?? null],
    );

    if (!result.rows.length) {
      return candidate;
    }

    candidate = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }
};

export const getContentSnapshot = async (projectId: string): Promise<SnapshotResponse> => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentSnapshotState({
    dependencies: getBoundContentWorkspaceDependencies(context),
    projectId,
  });
};

export const createContentPost = async (projectId: string) => {
  const context = await getRequiredContentProjectContext(projectId);
  const post = await createContentPostState({
    dependencies: getBoundContentPostsDependencies(context),
    projectId,
  });

  await updatePersistedContentWorkspaceSummaryForMutation({
    context,
    deltas: {
      posts: 1,
    },
    projectId,
  }).catch(() => undefined);
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_POST_INVALIDATION_GROUPS);
  return post;
};

export const discardContentPost = async ({
  postId,
  projectId,
}: {
  postId: string;
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const result = await discardContentPostState({
    dependencies: getBoundContentPostsDependencies(context),
    postId,
    projectId,
  });

  await updatePersistedContentWorkspaceSummaryForMutation({
    context,
    deltas: {
      posts: -1,
    },
    projectId,
  }).catch(() => undefined);
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_POST_INVALIDATION_GROUPS);
  return result;
};

export const deleteContentPosts = async ({
  postIds,
  projectId,
}: {
  postIds: string[];
  projectId: string;
}) => {
  const normalizedPostIds = Array.from(new Set(postIds.map((postId) => postId.trim()).filter(Boolean)));
  const context = await getRequiredContentProjectContext(projectId);

  await deleteContentPostsState({
    dependencies: getBoundContentPostsDependencies(context),
    postIds: normalizedPostIds,
    projectId,
  });

  await updatePersistedContentWorkspaceSummaryForMutation({
    context,
    deltas: {
      posts: -normalizedPostIds.length,
    },
    projectId,
  }).catch(() => undefined);
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_POST_INVALIDATION_GROUPS);
};

export const updateContentPost = async ({
  authorId,
  categoryIds,
  contentFields,
  contentHtml,
  contentJson,
  contentMarkdown,
  customFields,
  excerpt,
  focusKeyword,
  featuredImageUrl,
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
}: {
  authorId?: string | null;
  categoryIds?: string[];
  contentFields?: Record<string, { contentHtml: string; contentJson: Record<string, unknown> }>;
  contentHtml?: string;
  contentJson?: Record<string, unknown>;
  contentMarkdown?: string | null;
  customFields?: Record<string, unknown>;
  excerpt?: string | null;
  focusKeyword?: string | null;
  featuredImageUrl?: string | null;
  parentPageId?: string | null;
  postId: string;
  publishedAt?: string | null;
  projectId: string;
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
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const post = await updateContentPostState({
    authorId,
    categoryIds,
    contentFields,
    contentHtml,
    contentJson,
    contentMarkdown,
    customFields,
    dependencies: getBoundContentPostsDependencies(context),
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
  });

  invalidateContentProjectRuntimeGroups(projectId, CONTENT_POST_INVALIDATION_GROUPS);
  return post;
};

export const publishContentPost = async ({
  authorId,
  categoryIds,
  contentFields,
  contentHtml,
  contentJson,
  contentMarkdown,
  customFields,
  excerpt,
  focusKeyword,
  featuredImageUrl,
  parentPageId,
  postId,
  publishedAt,
  projectId,
  redirects,
  seoDescription,
  seoTitle,
  slug,
  tagIds,
  title,
  expectedUpdatedAt,
  expectedVersion,
  updatedAt,
}: {
  authorId?: string | null;
  categoryIds?: string[];
  contentFields?: Record<string, { contentHtml: string; contentJson: Record<string, unknown> }>;
  contentHtml?: string;
  contentJson?: Record<string, unknown>;
  contentMarkdown?: string | null;
  customFields?: Record<string, unknown>;
  excerpt?: string | null;
  focusKeyword?: string | null;
  featuredImageUrl?: string | null;
  parentPageId?: string | null;
  postId: string;
  publishedAt?: string | null;
  projectId: string;
  redirects?: ContentRedirectEntryInput[];
  seoDescription?: string | null;
  seoTitle?: string | null;
  slug?: string;
  tagIds?: string[];
  title?: string;
  expectedUpdatedAt?: string | null;
  expectedVersion?: string;
  updatedAt?: string | null;
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const post = await publishContentPostState({
    authorId,
    categoryIds,
    contentFields,
    contentHtml,
    contentJson,
    contentMarkdown,
    customFields,
    dependencies: getBoundContentPostsDependencies(context),
    excerpt,
    featuredImageUrl,
    focusKeyword,
    parentPageId,
    postId,
    projectId,
    publishedAt,
    redirects,
    seoDescription,
    seoTitle,
    slug,
    tagIds,
    title,
    expectedUpdatedAt,
    expectedVersion,
    updatedAt,
  });

  invalidateContentProjectRuntimeGroups(projectId, CONTENT_POST_INVALIDATION_GROUPS);
  return post;
};

export const unpublishContentPost = async ({
  authorId,
  categoryIds,
  contentFields,
  contentHtml,
  contentJson,
  contentMarkdown,
  customFields,
  excerpt,
  focusKeyword,
  featuredImageUrl,
  parentPageId,
  postId,
  projectId,
  redirects,
  seoDescription,
  seoTitle,
  slug,
  tagIds,
  title,
  expectedUpdatedAt,
  expectedVersion,
  updatedAt,
}: {
  authorId?: string | null;
  categoryIds?: string[];
  contentFields?: Record<string, { contentHtml: string; contentJson: Record<string, unknown> }>;
  contentHtml?: string;
  contentJson?: Record<string, unknown>;
  contentMarkdown?: string | null;
  customFields?: Record<string, unknown>;
  excerpt?: string | null;
  focusKeyword?: string | null;
  featuredImageUrl?: string | null;
  parentPageId?: string | null;
  postId: string;
  projectId: string;
  redirects?: ContentRedirectEntryInput[];
  seoDescription?: string | null;
  seoTitle?: string | null;
  slug?: string;
  tagIds?: string[];
  title?: string;
  expectedUpdatedAt?: string | null;
  expectedVersion?: string;
  updatedAt?: string | null;
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const post = await unpublishContentPostState({
    authorId,
    categoryIds,
    contentFields,
    contentHtml,
    contentJson,
    contentMarkdown,
    customFields,
    dependencies: getBoundContentPostsDependencies(context),
    excerpt,
    featuredImageUrl,
    focusKeyword,
    parentPageId,
    postId,
    projectId,
    redirects,
    seoDescription,
    seoTitle,
    slug,
    tagIds,
    title,
    expectedUpdatedAt,
    expectedVersion,
    updatedAt,
  });

  invalidateContentProjectRuntimeGroups(projectId, CONTENT_POST_INVALIDATION_GROUPS);
  return post;
};

export const archiveContentPost = async ({
  authorId,
  categoryIds,
  contentFields,
  contentHtml,
  contentJson,
  contentMarkdown,
  customFields,
  excerpt,
  focusKeyword,
  featuredImageUrl,
  parentPageId,
  postId,
  projectId,
  redirects,
  seoDescription,
  seoTitle,
  slug,
  tagIds,
  title,
  expectedUpdatedAt,
  expectedVersion,
  updatedAt,
}: {
  authorId?: string | null;
  categoryIds?: string[];
  contentFields?: Record<string, { contentHtml: string; contentJson: Record<string, unknown> }>;
  contentHtml?: string;
  contentJson?: Record<string, unknown>;
  contentMarkdown?: string | null;
  customFields?: Record<string, unknown>;
  excerpt?: string | null;
  focusKeyword?: string | null;
  featuredImageUrl?: string | null;
  parentPageId?: string | null;
  postId: string;
  projectId: string;
  redirects?: ContentRedirectEntryInput[];
  seoDescription?: string | null;
  seoTitle?: string | null;
  slug?: string;
  tagIds?: string[];
  title?: string;
  expectedUpdatedAt?: string | null;
  expectedVersion?: string;
  updatedAt?: string | null;
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const post = await archiveContentPostState({
    authorId,
    categoryIds,
    contentFields,
    contentHtml,
    contentJson,
    contentMarkdown,
    customFields,
    dependencies: getBoundContentPostsDependencies(context),
    excerpt,
    featuredImageUrl,
    focusKeyword,
    parentPageId,
    postId,
    projectId,
    redirects,
    seoDescription,
    seoTitle,
    slug,
    tagIds,
    title,
    expectedUpdatedAt,
    expectedVersion,
    updatedAt,
  });

  invalidateContentProjectRuntimeGroups(projectId, CONTENT_POST_INVALIDATION_GROUPS);
  return post;
};

export const createContentCollectionEntry = async ({
  bio,
  collection,
  description,
  email,
  name,
  parentCategoryId,
  projectId,
  slug,
}: {
  bio?: string | null;
  collection: ContentCollectionEntryTable;
  description?: string | null;
  email?: string | null;
  name: string;
  parentCategoryId?: string | null;
  projectId: string;
  slug?: string | null;
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const entry = await createContentCollectionEntryState({
    bio,
    collection,
    dependencies: getBoundContentCollectionDependencies(context),
    description,
    email,
    name,
    parentCategoryId,
    projectId,
    slug,
  });

  await updatePersistedContentWorkspaceSummaryForMutation({
    context,
    deltas: {
      [collection]: 1,
    },
    projectId,
  }).catch(() => undefined);
  queueContentPostsProjectionRefresh({
    context,
    markStale: true,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_COLLECTION_INVALIDATION_GROUPS);
  return entry;
};

export const updateContentCollectionEntry = async ({
  bio,
  collection,
  description,
  email,
  entryId,
  name,
  parentCategoryId,
  projectId,
  slug,
}: {
  bio?: string | null;
  collection: ContentCollectionEntryTable;
  description?: string | null;
  email?: string | null;
  entryId: string;
  name: string;
  parentCategoryId?: string | null;
  projectId: string;
  slug?: string | null;
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const entry = await updateContentCollectionEntryState({
    bio,
    collection,
    dependencies: getBoundContentCollectionDependencies(context),
    description,
    email,
    entryId,
    name,
    parentCategoryId,
    projectId,
    slug,
  });

  queueContentPostsProjectionRefresh({
    context,
    markStale: true,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_COLLECTION_INVALIDATION_GROUPS);
  return entry;
};

export const deleteContentCollectionEntries = async ({
  collection,
  entryIds,
  projectId,
}: {
  collection: ContentCollectionEntryTable;
  entryIds: string[];
  projectId: string;
}) => {
  const context = await getRequiredContentProjectContext(projectId);
  const result = await deleteContentCollectionEntriesState({
    collection,
    dependencies: getBoundContentCollectionDependencies(context),
    entryIds,
    projectId,
  });

  await updatePersistedContentWorkspaceSummaryForMutation({
    context,
    deltas: {
      [collection]: -new Set(entryIds.map((value) => value.trim()).filter(Boolean)).size,
    },
    projectId,
  }).catch(() => undefined);
  queueContentPostsProjectionRefresh({
    context,
    markStale: true,
    projectId,
  });
  invalidateContentProjectRuntimeGroups(projectId, CONTENT_COLLECTION_INVALIDATION_GROUPS);
  return result;
};

export const getContentProjectMapping = async (
  projectId: string,
): Promise<ContentProjectMapping> => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentProjectMappingState({
    dependencies: getBoundContentMappingDependencies(context),
    projectId,
  });
};

export const getStoredContentProjectMapping = async (
  projectId: string,
): Promise<ContentProjectMapping> => {
  const context = await getRequiredContentProjectContext(projectId);
  const { mapping } = await loadStoredContentProjectMappingState({
    context,
    enforceReadPermission: true,
    projectId,
    dependencies: getBoundContentMappingDependencies(context),
  });

  return mapping;
};

export const getContentProjectMediaStorageCredentialStatus = async (
  projectId: string,
 ) => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentProjectMediaStorageCredentialStatusState({
    dependencies: getBoundContentMappingDependencies(context),
    projectId,
  });
};

export const getContentProjectFilesStorageCredentialStatus = async (
  projectId: string,
) => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentProjectFilesStorageCredentialStatusState({
    dependencies: getBoundContentMappingDependencies(context),
    projectId,
  });
};

export const getContentProjectSupabaseStorageBuckets = async (
  projectId: string,
) => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentProjectSupabaseStorageBucketsState({
    dependencies: getBoundContentMappingDependencies(context),
    projectId,
  });
};

export const getContentProjectMappingDetection = async (
  projectId: string,
  options?: {
    tableRef?: string | null;
  },
): Promise<ContentAutoMappingResult> => {
  const context = await getRequiredContentProjectContext(projectId);

  return getContentProjectMappingDetectionState({
    dependencies: getBoundContentMappingDependencies(context),
    projectId,
    tableRef: options?.tableRef ?? null,
  });
};

export const getContentProjectMappingTables = async (
  projectId: string,
  options: {
    refresh?: boolean;
  } = {},
) => {
  const context = await getRequiredContentProjectContext(projectId);
  const dependencies = getBoundContentMappingDependencies(context);

  if (options.refresh) {
    return refreshContentProjectMappingTablesState({
      dependencies,
      projectId,
    });
  }

  return getContentProjectMappingTablesState({
    dependencies,
    projectId,
  });
};

export const saveContentMappingRevision = async ({
  bindingStatus,
  mappingConfig,
  mappingScope = "full",
  projectId,
  source = "manual",
}: {
  bindingStatus?: ContentBindingStatus | null;
  mappingConfig: ContentMappingConfig;
  mappingScope?: ContentMappingSaveScope;
  projectId: string;
  source?: ContentMappingRevisionSource;
}): Promise<ContentProjectMapping> => {
  const context = await getRequiredContentProjectContext(projectId);
  const mapping = await saveContentMappingRevisionState({
    bindingStatus,
    dependencies: getBoundContentMappingDependencies(context),
    mappingConfig,
    mappingScope,
    projectId,
    source,
  });

  queueContentPostsProjectionRefresh({
    context,
    mapping,
    projectId,
  });
  invalidateAllContentProjectCaches(projectId);
  return mapping;
};

export const ensureContentMappingDraft = async (
  projectId: string,
): Promise<ContentProjectMapping> => {
  const context = await getRequiredContentProjectContext(projectId);

  return ensureContentMappingDraftState({
    dependencies: getBoundContentMappingDependencies(context),
    projectId,
  });
};
