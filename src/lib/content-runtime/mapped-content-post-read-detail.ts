import {
  buildContentSingleValuePredicate,
} from "./adapter/query-builders";
import {
  getEntityColumnMetadata,
  getEntityIdColumn,
  getEntityTableName,
  getMappedContentRuntime,
  type ContentDatabaseClient,
} from "./mapped-content-runtime-support";
import {
  buildMappedContentPostEditorSelectClause,
  mapMappedContentPostRow,
} from "./mapped-content-post-support";
import {
  getCachedProjectRuntimeValue,
  projectRuntimeCacheGroups,
} from "./server-runtime-cache";
import { getContentPostCacheKey } from "./server-runtime-cache-keys";
import type { ContentPost } from "./shared";
import { createContentPostVersionToken } from "./adapter/version-token";
import type {
  ContentEntityMapping,
  ContentProjectMapping,
} from "./mapping";

const MAPPED_CONTENT_POST_CACHE_TTL_MS = 15_000;
const MAPPED_CONTENT_POST_CACHE_STALE_WHILE_REVALIDATE_MS = 60_000;

export const buildMappedContentPrimaryKeyPredicate = async ({
  client,
  columnName,
  entity,
  paramIndex,
}: {
  client: ContentDatabaseClient;
  columnName: string;
  entity: ContentEntityMapping;
  paramIndex: number;
}) => {
  const metadata = await getEntityColumnMetadata({
    client,
    columnName,
    entity,
  }).catch(() => null);

  return buildContentSingleValuePredicate({
    columnName,
    operator: "=",
    paramIndex,
    usesNativeComparison: Boolean(metadata),
  });
};

export const loadMappedContentHydratedPost = async ({
  client,
  mapping,
  postId,
  projectId,
}: {
  client: ContentDatabaseClient;
  mapping: ContentProjectMapping;
  postId: string;
  projectId?: string;
}): Promise<ContentPost> => {
  const runtime = getMappedContentRuntime(mapping);
  const idColumn = getEntityIdColumn(runtime.posts) || runtime.posts.source.primaryKey;

  if (!idColumn) {
    throw new Error("Posts setup is missing a stable ID field.");
  }

  const loadPost = async () => {
    const whereClause = await buildMappedContentPrimaryKeyPredicate({
      client,
      columnName: idColumn,
      entity: runtime.posts,
      paramIndex: 1,
    });
    const result = await client.query<Record<string, unknown>>(
      `
        select ${buildMappedContentPostEditorSelectClause(runtime.posts)}
        from ${getEntityTableName(runtime.posts)}
        where ${whereClause}
        limit 1
      `,
      [postId],
    );

    if (!result.rows.length) {
      throw new Error("Could not find that post in this project.");
    }

    const post = await mapMappedContentPostRow({
      client,
      postRow: result.rows[0] ?? {},
      runtime,
    });
    return { ...post, versionToken: createContentPostVersionToken(result.rows[0], post) };
  };

  if (!projectId) {
    return loadPost();
  }

  return getCachedProjectRuntimeValue({
    cacheKey: getContentPostCacheKey({
      mapping,
      postId,
      projectId,
    }),
    groups: [projectRuntimeCacheGroups.postDetail],
    load: loadPost,
    projectId,
    staleWhileRevalidateMs: MAPPED_CONTENT_POST_CACHE_STALE_WHILE_REVALIDATE_MS,
    ttlMs: MAPPED_CONTENT_POST_CACHE_TTL_MS,
  });
};
