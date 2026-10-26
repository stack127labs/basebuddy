import type {
  ContentAuthor,
  ContentCategoriesPage,
  ContentCollectionCounts,
  ContentCollectionPage,
  ContentFieldSpecSummary,
  ContentMedia,
  ContentRuntimeSummary,
  ContentPost,
  ContentPostCustomFieldValues,
  ContentPostEditorPayload,
  ContentRedirectEntryInput,
  ContentPostStatus,
  ContentPostsPage,
  ContentPostsSort,
  ContentPostsStatusFilter,
  ContentSidebarFieldSpecSummary,
  ContentSnapshot,
  ContentTag,
} from "@/lib/content-runtime/shared";
import type {
  ContentProjectMapping,
} from "@/lib/content-runtime/mapping";
import type {
  ContentSchemaIntrospection,
} from "@/lib/content-runtime/introspection";
import {
  CONTENT_FIELD_EDITABILITY_STATE_VALUES,
  CONTENT_FIELD_PATCH_MODE_VALUES,
  CONTENT_FIELD_RELATION_MODE_VALUES,
  CONTENT_FIELD_STORAGE_PRIMITIVE_VALUES,
  CONTENT_FIELD_UI_CONTROL_VALUES,
  CONTENT_FIELD_VALUE_KIND_VALUES,
  type ContentFieldEditabilityState,
  type ContentFieldPatchMode,
  type ContentFieldRelationMode,
  type ContentFieldStoragePrimitive,
  type ContentFieldUiControl,
  type ContentFieldValueKind,
} from "@/lib/content-runtime/field-contract";

export const CONTENT_ADAPTER_EDITABILITY_STATE_VALUES = CONTENT_FIELD_EDITABILITY_STATE_VALUES;
export type ContentAdapterEditabilityState = ContentFieldEditabilityState;

export const CONTENT_ADAPTER_PATCH_MODE_VALUES = CONTENT_FIELD_PATCH_MODE_VALUES;
export type ContentAdapterPatchMode = ContentFieldPatchMode;

export const CONTENT_ADAPTER_UI_CONTROL_VALUES = CONTENT_FIELD_UI_CONTROL_VALUES;
export type ContentAdapterUiControl = ContentFieldUiControl;

export const CONTENT_ADAPTER_VALUE_KIND_VALUES = CONTENT_FIELD_VALUE_KIND_VALUES;
export type ContentAdapterValueKind = ContentFieldValueKind;

export const CONTENT_ADAPTER_RELATION_MODE_VALUES = CONTENT_FIELD_RELATION_MODE_VALUES;
export type ContentAdapterRelationMode = ContentFieldRelationMode;

export const CONTENT_ADAPTER_STORAGE_PRIMITIVE_VALUES = CONTENT_FIELD_STORAGE_PRIMITIVE_VALUES;
export type ContentAdapterStoragePrimitive = ContentFieldStoragePrimitive;

export type ContentAdapterPost = ContentPost;

export type ContentAdapterPostListRow = {
  authorLabel: string | null;
  categoryLabels: string[];
  createdAt: string;
  id: string;
  publishedAt: string | null;
  slug: string;
  status: ContentPostStatus;
  tagLabels: string[];
  title: string;
  updatedAt: string;
};

export type ContentAdapterRelationOption = {
  id: string;
  label: string;
  metadata?: Record<string, unknown>;
};

export type ContentAdapterFieldSpec = ContentFieldSpecSummary;
export type ContentAdapterSidebarFieldSpec = ContentSidebarFieldSpecSummary;
export type ContentAdapterCustomFieldDefinition = ContentAdapterFieldSpec & {
  isCustomField: true;
};

export type ContentAdapterCapabilitySummary = ContentRuntimeSummary;

export type ContentAdapterCreatePostRequest = {
  accessibleAuthorIds?: string[] | null;
};

type ContentAdapterMutablePostFields = {
  authorId?: string | null;
  categoryIds?: string[];
  contentFields?: Record<string, { contentHtml: string; contentJson: Record<string, unknown> }>;
  contentHtml?: string;
  contentJson?: Record<string, unknown>;
  contentMarkdown?: string | null;
  customFields?: ContentPostCustomFieldValues;
  excerpt?: string | null;
  featuredImageUrl?: string | null;
  focusKeyword?: string | null;
  parentPageId?: string | null;
  postId: string;
  publishedAt?: string | null;
  redirects?: ContentRedirectEntryInput[];
  seoDescription?: string | null;
  seoTitle?: string | null;
  slug?: string;
  status?: ContentPostStatus;
  tagIds?: string[];
  title?: string;
  expectedUpdatedAt?: string | null;
  expectedVersion?: string;
  updatedAt?: string | null;
};

export type ContentAdapterSavePostRequest = ContentAdapterMutablePostFields & {
  postId: string;
};

export type ContentAdapterPublishRequest = ContentAdapterSavePostRequest;

export type ContentAdapterUnpublishRequest = ContentAdapterSavePostRequest;

export type ContentAdapterArchiveRequest = ContentAdapterSavePostRequest;
export type ContentAdapterCustomFieldValues = ContentPostCustomFieldValues;

export type ContentAdapterSavePostResult = {
  errors?: ContentAdapterError[];
  ok: boolean;
  postId?: string;
};

export type ContentAdapterError = {
  code: string;
  fieldKey?: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type ContentProviderQueryRow = Record<string, unknown>;

export type ContentProviderQueryResult<T extends ContentProviderQueryRow = ContentProviderQueryRow> = {
  rowCount: number | null;
  rows: T[];
};

export type ContentAdapterPageReadRequest = {
  limit: number;
  search?: string;
  sort?: string;
};

export type ContentAdapterCursorReadRequest = ContentAdapterPageReadRequest & {
  cursor?: string | null;
};

export type ContentAdapterPagedReadResult<T> = {
  items: T[];
  nextCursor: string | null;
};

export type ContentAdapterLimitedSearchRequest = {
  limit: number;
  search: string;
};

export type ContentAdapterSelectedIdsHydrationRequest = {
  ids: string[];
};

export type ContentAdapterApproximateCountResult = {
  estimate: number;
};

export type ContentAdapterExactCountRequest = {
  maxRows?: number;
};

export type ContentAdapterExactCountResult = {
  count: number;
  reachedLimit: boolean;
};

export type ContentAdapterQueryCapabilitySummary = {
  approximateCounts: boolean;
  cursorPagination: boolean;
  exactCounts: "bounded" | "full" | "unsupported";
  prefixSearch: boolean;
  selectedIdHydration: boolean;
  trigramSearch: boolean;
};

export interface ContentProviderAdapter {
  executeQuery<T extends ContentProviderQueryRow = ContentProviderQueryRow>(
    query: string,
    params?: unknown[],
  ): Promise<ContentProviderQueryResult<T>>;
}

export type ContentDatabaseAdapterContext = {
  mapping: ContentProjectMapping;
  provider: ContentProviderAdapter;
};

export type ContentDatabaseAdapterReadContext = ContentDatabaseAdapterContext & {
  accessibleAuthorIds?: string[] | null;
  authorAssignmentsByAuthorId?: Map<string, { avatar_url: string | null }> | null;
  projectId?: string;
};

export type ContentDatabaseAdapterWriteContext = ContentDatabaseAdapterContext & {
  expectedUpdatedAt?: string | null;
};

export type ContentNativeTypeDescriptor = {
  arrayItemType?: string | null;
  isArray: boolean;
  nativeType: string;
  nullable: boolean;
};

export type ContentNativeTypeNormalizationResult = {
  storagePrimitive: ContentAdapterStoragePrimitive;
  valueKind: ContentAdapterValueKind;
};

export type ContentPatchWriteStrategyInput = {
  editabilityState: ContentAdapterEditabilityState;
  nativeType: ContentNativeTypeDescriptor;
  requestedPatchMode?: ContentAdapterPatchMode | null;
  storagePrimitive: ContentAdapterStoragePrimitive;
  valueKind: ContentAdapterValueKind;
};

export type ContentPatchWriteStrategyResult = {
  patchMode: ContentAdapterPatchMode;
  readOnly: boolean;
  unsupportedReason?: string;
};

export type ContentDatabaseTableCatalogEntry = {
  columns: string[];
  name: string;
  primaryKey: string | null;
  schema: string;
  sourceKind: "table" | "view";
};

export interface ContentDatabaseIntrospectionAdapter {
  getTableCatalog(
    context: ContentDatabaseAdapterContext,
  ): Promise<ContentDatabaseTableCatalogEntry[]>;
  introspectSchema(
    context: ContentDatabaseAdapterContext,
  ): Promise<ContentSchemaIntrospection>;
}

export interface ContentDatabaseReadAdapter {
  countPosts(
    context: ContentDatabaseAdapterReadContext & {
      search: string;
      status: ContentPostsStatusFilter;
    },
  ): Promise<number>;
  loadAuthorOptions(
    context: ContentDatabaseAdapterReadContext & {
      limit?: number;
    },
  ): Promise<Array<Pick<ContentAuthor, "id" | "name" | "slug">>>;
  loadAuthorsPage(
    context: ContentDatabaseAdapterReadContext & {
      page?: number;
      pageSize?: number;
      search?: string;
    },
  ): Promise<ContentCollectionPage<ContentAuthor>>;
  loadCategoriesPage(
    context: ContentDatabaseAdapterReadContext & {
      includeAllCategories?: boolean;
      page?: number;
      pageSize?: number;
      search?: string;
    },
  ): Promise<ContentCategoriesPage>;
  loadMediaPage(
    context: ContentDatabaseAdapterReadContext & {
      page?: number;
      pageSize?: number;
    },
  ): Promise<ContentCollectionPage<ContentMedia>>;
  loadPost(
    context: ContentDatabaseAdapterReadContext & {
      postId: string;
    },
  ): Promise<ContentAdapterPost>;
  loadPostAuthorId(
    context: ContentDatabaseAdapterReadContext & {
      postId: string;
    },
  ): Promise<string | null>;
  loadPostEditorPayload(
    context: ContentDatabaseAdapterReadContext & {
      includeEditorOptions?: boolean;
      postId: string;
    },
  ): Promise<ContentPostEditorPayload>;
  loadPostsPage(
    context: ContentDatabaseAdapterReadContext & {
      includeEditorOptions?: boolean;
      cursor?: string | null;
      page?: number;
      pageSize?: number;
      search?: string;
      sort?: ContentPostsSort;
      status?: ContentPostsStatusFilter;
      totalItems?: number;
      useWindowPagination?: boolean;
      writableAuthorIds?: string[] | null;
    },
  ): Promise<ContentPostsPage>;
  loadTagsPage(
    context: ContentDatabaseAdapterReadContext & {
      page?: number;
      pageSize?: number;
      search?: string;
    },
  ): Promise<ContentCollectionPage<ContentTag>>;
  loadWorkspaceCounts(
    context: ContentDatabaseAdapterReadContext & {
      approximateCounts?: boolean;
      postsCountOverride?: number;
    },
  ): Promise<ContentCollectionCounts>;
  loadWorkspaceSnapshot(
    context: ContentDatabaseAdapterReadContext,
  ): Promise<ContentSnapshot>;
}

export interface ContentDatabaseWriteAdapter {
  archivePost(
    context: ContentDatabaseAdapterWriteContext & ContentAdapterArchiveRequest,
  ): Promise<ContentAdapterPost>;
  createPost(
    context: ContentDatabaseAdapterWriteContext & ContentAdapterCreatePostRequest,
  ): Promise<ContentAdapterPost>;
  deletePosts(
    context: ContentDatabaseAdapterWriteContext & {
      postIds: string[];
    },
  ): Promise<void>;
  discardPost(
    context: ContentDatabaseAdapterWriteContext & {
      postId: string;
    },
  ): Promise<void>;
  publishPost(
    context: ContentDatabaseAdapterWriteContext & ContentAdapterPublishRequest,
  ): Promise<ContentAdapterPost>;
  savePost(
    context: ContentDatabaseAdapterWriteContext & ContentAdapterSavePostRequest,
  ): Promise<ContentAdapterPost>;
  unpublishPost(
    context: ContentDatabaseAdapterWriteContext & ContentAdapterUnpublishRequest,
  ): Promise<ContentAdapterPost>;
}

export interface ContentDatabaseRelationDiscoveryAdapter {
  searchAuthors(
    context: ContentDatabaseAdapterReadContext & {
      limit?: number;
      search: string;
    },
  ): Promise<ContentAdapterRelationOption[]>;
  searchCategories(
    context: ContentDatabaseAdapterReadContext & {
      limit?: number;
      search: string;
    },
  ): Promise<ContentAdapterRelationOption[]>;
  searchMedia(
    context: ContentDatabaseAdapterReadContext & {
      limit?: number;
      search: string;
    },
  ): Promise<ContentAdapterRelationOption[]>;
  searchParentPages(
    context: ContentDatabaseAdapterReadContext & {
      limit?: number;
      search: string;
    },
  ): Promise<ContentAdapterRelationOption[]>;
  searchTags(
    context: ContentDatabaseAdapterReadContext & {
      limit?: number;
      search: string;
    },
  ): Promise<ContentAdapterRelationOption[]>;
}

export interface ContentDatabaseNativeTypeAdapter {
  normalizeNativeType(
    descriptor: ContentNativeTypeDescriptor,
  ): ContentNativeTypeNormalizationResult;
}

export interface ContentDatabasePatchWriteStrategyAdapter {
  resolvePatchWriteStrategy(
    input: ContentPatchWriteStrategyInput,
  ): ContentPatchWriteStrategyResult;
}

export interface ContentDatabaseAdapter
  extends ContentDatabaseIntrospectionAdapter,
    ContentDatabaseReadAdapter,
    ContentDatabaseWriteAdapter,
    ContentDatabaseRelationDiscoveryAdapter,
    ContentDatabaseNativeTypeAdapter,
    ContentDatabasePatchWriteStrategyAdapter {
  id: string;
  label: string;
}
