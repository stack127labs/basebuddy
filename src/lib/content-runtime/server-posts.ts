import "server-only";

import { canAccessAuthorScopedContent } from "@/lib/control-plane/permissions";

import {
  archiveMappedContentPost,
  createMappedContentPost,
  deleteMappedContentPosts,
  discardMappedContentPost,
  getMappedContentRelationOptions,
  getMappedContentPostEditorPayload,
  getMappedContentPostsPage,
  publishMappedContentPost,
  unpublishMappedContentPost,
  updateMappedContentPost,
} from "./server-posts-mapped-content";
import {
  type ContentProjectContext,
  type ContentPostsDependencies,
} from "./server-posts-shared";
import {
  type ContentPost,
  type ContentPostEditorPayload,
  type ContentRedirectEntryInput,
  type ContentRelationFieldKey,
  type ContentRelationOption,
  type ContentPostsPage,
  type ContentPostsSort,
  type ContentPostsStatusFilter,
} from "./shared";
import { type ContentPaginationInput } from "./server-support";

export {
  ensureContentPostWriteAccess,
  getContentPostById,
} from "./server-posts-shared";

const withPostWriteAccess = ({
  context,
  post,
}: {
  context: ContentProjectContext;
  post: ContentPost;
}) => ({
  ...post,
  canWrite: canAccessAuthorScopedContent(context.memberAccess, "write", post.authorId),
});

type ContentPostMutationInput = {
  authorId?: string | null;
  categoryIds?: string[];
  contentFields?: Record<string, { contentHtml: string; contentJson: Record<string, unknown> }>;
  contentHtml?: string;
  contentJson?: Record<string, unknown>;
  contentMarkdown?: string | null;
  customFields?: Record<string, unknown>;
  dependencies: ContentPostsDependencies;
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
};

export const getContentPostsPage = async ({
  cursor = null,
  dependencies,
  page,
  pageSize,
  projectId,
  search = "",
  sort = "updated_desc",
  status = "all",
}: ContentPaginationInput & {
  cursor?: string | null;
  dependencies: ContentPostsDependencies;
  projectId: string;
  search?: string;
  sort?: ContentPostsSort;
  status?: ContentPostsStatusFilter;
}): Promise<ContentPostsPage> => {
  const context = await dependencies.getProjectContext(projectId);

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  const pageResult = await getMappedContentPostsPage({
    context,
    cursor,
    dependencies,
    page,
    pageSize,
    projectId,
    search,
    sort,
    status,
  });

  return {
    ...pageResult,
    posts: pageResult.posts.map((post) => withPostWriteAccess({ context, post })),
  };
};

export const getContentPostEditorPayload = async ({
  dependencies,
  includeEditorOptions = true,
  postId,
  projectId,
}: {
  dependencies: ContentPostsDependencies;
  includeEditorOptions?: boolean;
  postId: string;
  projectId: string;
}): Promise<ContentPostEditorPayload> => {
  const context = await dependencies.getProjectContext(projectId);

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  const payload = await getMappedContentPostEditorPayload({
    context,
    dependencies,
    includeEditorOptions,
    postId,
    projectId,
  });

  return {
    ...payload,
    post: withPostWriteAccess({ context, post: payload.post }),
  };
};

export const getContentPostRelationOptions = async ({
  dependencies,
  fieldKey,
  limit = 100,
  projectId,
  search = "",
  selectedIds,
}: {
  dependencies: ContentPostsDependencies;
  fieldKey: ContentRelationFieldKey;
  limit?: number;
  projectId: string;
  search?: string;
  selectedIds?: string[];
}): Promise<ContentRelationOption[]> => {
  const context = await dependencies.getProjectContext(projectId);

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  return getMappedContentRelationOptions({
    context,
    dependencies,
    fieldKey,
    limit,
    projectId,
    search,
    selectedIds,
  });
};

export const createContentPost = async ({
  dependencies,
  projectId,
}: {
  dependencies: ContentPostsDependencies;
  projectId: string;
}) => {
  const context = await dependencies.getProjectContext(projectId);

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  const post = await createMappedContentPost({
    context,
    dependencies,
    projectId,
  });

  return withPostWriteAccess({ context, post });
};

export const updateContentPost = async ({
  authorId,
  categoryIds,
  contentFields,
  contentHtml,
  contentJson,
  contentMarkdown,
  customFields,
  dependencies,
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
  dependencies: ContentPostsDependencies;
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
  const context = await dependencies.getProjectContext(projectId);

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  const post = await updateMappedContentPost({
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
  });

  return withPostWriteAccess({ context, post });
};

export const publishContentPost = async ({
  authorId,
  categoryIds,
  contentFields,
  contentHtml,
  contentJson,
  contentMarkdown,
  customFields,
  dependencies,
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
}: ContentPostMutationInput) => {
  const context = await dependencies.getProjectContext(projectId);

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  const post = await publishMappedContentPost({
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

  return withPostWriteAccess({ context, post });
};

export const unpublishContentPost = async ({
  authorId,
  categoryIds,
  contentFields,
  contentHtml,
  contentJson,
  contentMarkdown,
  customFields,
  dependencies,
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
}: ContentPostMutationInput) => {
  const context = await dependencies.getProjectContext(projectId);

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  const post = await unpublishMappedContentPost({
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

  return withPostWriteAccess({ context, post });
};

export const archiveContentPost = async ({
  authorId,
  categoryIds,
  contentFields,
  contentHtml,
  contentJson,
  contentMarkdown,
  customFields,
  dependencies,
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
}: ContentPostMutationInput) => {
  const context = await dependencies.getProjectContext(projectId);

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  const post = await archiveMappedContentPost({
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

  return withPostWriteAccess({ context, post });
};

export const discardContentPost = async ({
  dependencies,
  postId,
  projectId,
}: {
  dependencies: ContentPostsDependencies;
  postId: string;
  projectId: string;
}) => {
  const context = await dependencies.getProjectContext(projectId);

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  return discardMappedContentPost({
    context,
    dependencies,
    postId,
    projectId,
  });
};

export const deleteContentPosts = async ({
  dependencies,
  postIds,
  projectId,
}: {
  dependencies: ContentPostsDependencies;
  postIds: string[];
  projectId: string;
}) => {
  const context = await dependencies.getProjectContext(projectId);

  if (!context) {
    throw new Error("Could not load this project right now.");
  }

  return deleteMappedContentPosts({
    context,
    dependencies,
    postIds,
    projectId,
  });
};
