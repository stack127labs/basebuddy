import type {
  ContentCustomFieldMapping,
  ContentMappingEntityKey,
  ContentMediaStorageProvider,
} from "./mapping";
import type {
  ContentFieldEditabilityState,
  ContentFieldPatchMode,
  ContentFieldRelationMode,
  ContentFieldSemanticRole,
  ContentFieldStoragePrimitive,
  ContentFieldUiControl,
  ContentFieldValueKind,
} from "./field-contract";
import type {
  ContentPostSidebarConfig,
  ContentPostSidebarFieldKey,
} from "./post-sidebar-config";
export {
  areContentPostSidebarConfigsEqual,
  cloneContentPostSidebarConfig,
  createContentPostSidebarPageId,
  createDefaultContentPostSidebarConfig,
  contentPostSidebarFieldKeys,
  normalizeContentPostSidebarConfig,
} from "./post-sidebar-config";
export type {
  ContentBuiltinPostSidebarFieldKey,
  ContentPostSidebarConfig,
  ContentPostSidebarFieldNode,
  ContentPostSidebarFieldKey,
  ContentPostSidebarItem,
  ContentPostSidebarNode,
  ContentPostSidebarPage,
  ContentPostSidebarPageNode,
} from "./post-sidebar-config";

export type ContentPrimaryContentFormat = "html" | "markdown";

export type ContentSchemaOptions = {
  enableRevisions: boolean;
  enableRls: boolean;
  primaryContentFormat: ContentPrimaryContentFormat;
};

export const supportsContentFormatAwareSchema = (schemaVersion: number | null | undefined) =>
  (schemaVersion ?? 1) >= 5;

export const getContentSchemaOptions = (schemaVersion: number | null | undefined): ContentSchemaOptions => {
  const normalizedSchemaVersion = schemaVersion ?? 1;
  const primaryContentFormat: ContentPrimaryContentFormat =
    normalizedSchemaVersion >= 9 ? "markdown" : "html";
  const baseVersion =
    normalizedSchemaVersion >= 9
      ? normalizedSchemaVersion - 8
      : normalizedSchemaVersion >= 5
        ? normalizedSchemaVersion - 4
        : normalizedSchemaVersion;

  switch (baseVersion) {
    case 4:
      return { enableRevisions: true, enableRls: true, primaryContentFormat };
    case 3:
      return { enableRevisions: true, enableRls: false, primaryContentFormat };
    case 2:
      return { enableRevisions: false, enableRls: true, primaryContentFormat };
    default:
      return { enableRevisions: false, enableRls: false, primaryContentFormat };
  }
};

export const contentCollections = [
  "posts",
  "media",
  "files",
  "categories",
  "tags",
  "authors",
] as const;

export type ContentCollection = (typeof contentCollections)[number];

export type ContentWorkspaceState = "mapping_draft" | "ready";

export type ContentAuthor = {
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  email: string | null;
  id: string;
  name: string;
  slug: string;
};

export type ContentCategory = {
  createdAt: string;
  depth: number;
  description: string | null;
  hasChildren?: boolean;
  hierarchyPath: string;
  id: string;
  name: string;
  parentCategoryId: string | null;
  slug: string;
};

export type ContentTag = {
  createdAt: string;
  description: string | null;
  id: string;
  name: string;
  slug: string;
};

export const CONTENT_POST_RELATION_FIELD_KEY_VALUES = [
  "author",
  "categories",
  "tags",
  "parentPage",
] as const;

export type ContentPostRelationFieldKey =
  (typeof CONTENT_POST_RELATION_FIELD_KEY_VALUES)[number];

export type ContentRelationFieldKey =
  | ContentPostRelationFieldKey
  | `custom_field:${string}`;

export const isContentRelationFieldKey = (
  value: string | null | undefined,
): value is ContentRelationFieldKey => {
  const normalizedValue = value?.trim() ?? "";

  return (
    CONTENT_POST_RELATION_FIELD_KEY_VALUES.includes(
      normalizedValue as ContentPostRelationFieldKey,
    ) || normalizedValue.startsWith("custom_field:")
  );
};

export type ContentRelationOption = {
  id: string;
  label: string;
  metadata?: Record<string, unknown>;
};

export type ContentMedia = {
  altText: string | null;
  bucketName: string;
  createdAt: string;
  fileName: string;
  id: string;
  objectPath: string;
};

export type ContentMediaFolder = {
  imageCount: number;
  name: string;
  path: string;
  previewUrl: string | null;
};

export type ContentMediaImage = {
  createdAt: string;
  fileName: string;
  folderPath: string;
  id: string;
  objectPath: string;
  publicUrl: string;
  sizeBytes: number | null;
  updatedAt: string | null;
};

export type ContentFileItem = {
  createdAt: string;
  fileName: string;
  folderPath: string;
  id: string;
  objectPath: string;
  publicUrl: string;
  sizeBytes: number | null;
  updatedAt: string | null;
};

export type ContentUploadFileDescriptor = {
  contentType: string;
  name: string;
  size: number;
};

export type ContentUploadedFile = {
  objectPath: string;
  signedUrl: string;
};

export type ContentPreparedUpload =
  | {
      apiUrl: string;
      bucketName: string;
      contentType: string;
      objectPath: string;
      path: string;
      provider: "supabase_signed";
      publishableKey: string;
      token: string;
    }
  | {
      contentType: string;
      headers: Record<string, string>;
      objectPath: string;
      provider: "s3_compatible";
      uploadUrl: string;
    };

export type ContentStorageBucketOption = {
  id: string;
  isPublic: boolean;
  name: string;
};

export type ContentMediaBreadcrumb = {
  label: string;
  path: string;
};

export type ContentMediaLibrary = {
  breadcrumbs: ContentMediaBreadcrumb[];
  bucketName: string;
  canManage: boolean;
  currentPath: string;
  folderOptions: string[];
  folders: ContentMediaFolder[];
  images: ContentMediaImage[];
  nextCursor?: string | null;
  search: string;
  urlExpiresAt: string;
};

export type ContentFilesLibrary = {
  breadcrumbs: ContentMediaBreadcrumb[];
  bucketName: string;
  canManage: boolean;
  currentPath: string;
  fileCount: number;
  files: ContentFileItem[];
  folderOptions: string[];
  folders: ContentMediaFolder[];
  nextCursor?: string | null;
  search: string;
  urlExpiresAt: string;
};

export const CONTENT_POST_STATUS_VALUES = ["draft", "published", "archived"] as const;

export type ContentPostStatus = (typeof CONTENT_POST_STATUS_VALUES)[number];

export type ContentPostContentFieldValue = {
  contentHtml: string;
  contentJson: Record<string, unknown>;
};

export type ContentPostCustomFieldValues = Record<string, unknown>;

export type ContentRedirectEntry = {
  active: boolean | null;
  locale: string | null;
  source: string;
  statusCode: number | null;
};

export type ContentRedirectEntryInput =
  | string
  | {
      active?: boolean | null;
      locale?: string | null;
      source?: string | null;
      statusCode?: number | string | null;
    };

const normalizeContentRedirectSource = (value: unknown) => {
  const normalizedValue = typeof value === "string" ? value.trim() : "";
  return normalizedValue || null;
};

const normalizeContentRedirectStatusCode = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
};

export const createContentRedirectEntry = ({
  active = null,
  locale = null,
  source,
  statusCode = null,
}: {
  active?: boolean | null;
  locale?: string | null;
  source: string;
  statusCode?: number | null;
}): ContentRedirectEntry => ({
  active,
  locale: locale?.trim() ? locale.trim() : null,
  source,
  statusCode,
});

export const normalizeContentRedirectEntries = (
  value: unknown,
): ContentRedirectEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenSources = new Set<string>();
  const normalizedEntries: ContentRedirectEntry[] = [];

  for (const entry of value) {
    let redirectObject =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;

    if (!redirectObject && typeof entry === "string") {
      const trimmedEntry = entry.trim();

      if (trimmedEntry.startsWith("{")) {
        try {
          const parsedEntry = JSON.parse(trimmedEntry);

          if (parsedEntry && typeof parsedEntry === "object" && !Array.isArray(parsedEntry)) {
            redirectObject = parsedEntry as Record<string, unknown>;
          }
        } catch {
          // Keep treating the value as a plain redirect source.
        }
      }
    }

    const source =
      normalizeContentRedirectSource(
        redirectObject?.source ?? entry,
      );

    if (!source || seenSources.has(source)) {
      continue;
    }

    seenSources.add(source);
    normalizedEntries.push(
      createContentRedirectEntry({
        active: typeof redirectObject?.active === "boolean" ? redirectObject.active : null,
        locale:
          typeof redirectObject?.locale === "string" ? redirectObject.locale : null,
        source,
        statusCode: normalizeContentRedirectStatusCode(redirectObject?.statusCode),
      }),
    );
  }

  return normalizedEntries;
};

export const contentRedirectEntryHasMetadata = (entry: ContentRedirectEntry) =>
  entry.active !== null || entry.locale !== null || entry.statusCode !== null;

export const contentRedirectEntriesHaveMetadata = (entries: ContentRedirectEntry[]) =>
  entries.some((entry) => contentRedirectEntryHasMetadata(entry));

export type ContentPostFieldConflict = {
  code: "helper_row_ambiguity";
  helperRowCount: number;
  values: string[];
};

export type ContentPostFieldConflicts = Record<string, ContentPostFieldConflict>;

export type ContentPost = {
  versionToken?: string;
  authorId: string | null;
  canWrite?: boolean;
  categoryIds: string[];
  contentFields: Record<string, ContentPostContentFieldValue>;
  contentFormat: ContentPrimaryContentFormat;
  contentHtml: string;
  contentJson: Record<string, unknown>;
  contentMarkdown: string | null;
  createdAt: string;
  customFields: ContentPostCustomFieldValues;
  excerpt: string | null;
  fieldConflicts?: ContentPostFieldConflicts;
  focusKeyword: string | null;
  featuredImageUrl: string | null;
  id: string;
  parentPageId?: string | null;
  publishedAt: string | null;
  redirects: ContentRedirectEntry[];
  seoDescription: string | null;
  seoTitle: string | null;
  slug: string;
  status: ContentPostStatus;
  tagIds: string[];
  title: string;
  updatedAt: string;
  editorPayloadReady?: boolean;
  editingSession?: ContentPostEditingSession | null;
};

const getOrderedEditorFieldIds = (editorFields?: Array<{ id: string }> | null) =>
  (editorFields ?? []).map((field) => field.id.trim()).filter(Boolean);

export const getContentPrimaryEditorFieldId = (editorFields?: Array<{ id: string }> | null) =>
  getOrderedEditorFieldIds(editorFields)[0] ?? null;

export const getContentPostCombinedContentHtml = ({
  editorFields,
  post,
}: {
  editorFields?: Array<{ id: string }> | null;
  post: {
    contentFields?: Record<string, { contentHtml?: string | null } | null> | null;
    contentHtml?: string | null;
  };
}) => {
  const orderedFieldIds = getOrderedEditorFieldIds(editorFields);
  const fallbackContentHtml = typeof post.contentHtml === "string" ? post.contentHtml : "";

  if (!orderedFieldIds.length) {
    return fallbackContentHtml;
  }

  const contentSegments = orderedFieldIds
    .map((fieldId) => {
      const fieldContentHtml = post.contentFields?.[fieldId]?.contentHtml;
      return typeof fieldContentHtml === "string" ? fieldContentHtml.trim() : "";
    })
    .filter(Boolean);

  return contentSegments.length ? contentSegments.join("\n") : fallbackContentHtml;
};

export type ContentPostRevision = {
  contentFormat: ContentPrimaryContentFormat;
  contentHtml: string;
  contentJson: Record<string, unknown>;
  contentMarkdown: string | null;
  createdAt: string;
  editorEmail: string | null;
  excerpt: string | null;
  focusKeyword: string | null;
  featuredImageUrl: string | null;
  id: string;
  postId: string;
  publishedAt: string | null;
  revisionNumber: number;
  seoDescription: string | null;
  seoTitle: string | null;
  slug: string;
  status: ContentPostStatus;
  title: string;
};

export type ContentPostEditingSession = {
  avatarUrl: string | null;
  editorEmail: string | null;
  editorName: string | null;
  isCurrentUser: boolean;
  lastHeartbeatAt: string;
  postId: string;
  postTitle: string | null;
  userId: string;
};

export const CONTENT_POST_SORT_VALUES = [
  "updated_desc",
  "updated_asc",
  "created_desc",
  "created_asc",
  "title_asc",
  "title_desc",
] as const;

export type ContentPostsSort = (typeof CONTENT_POST_SORT_VALUES)[number];

export const CONTENT_POST_STATUS_FILTER_VALUES = ["all", ...CONTENT_POST_STATUS_VALUES] as const;

export type ContentPostsStatusFilter = (typeof CONTENT_POST_STATUS_FILTER_VALUES)[number];

export type ContentPostsQuery = {
  search: string;
  sort: ContentPostsSort;
  status: ContentPostsStatusFilter;
};

export const DEFAULT_CONTENT_POSTS_QUERY: ContentPostsQuery = {
  search: "",
  sort: "updated_desc",
  status: "all",
};

export const normalizeContentPostsSearch = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);

export const normalizeContentPostsSort = (value: string | null | undefined): ContentPostsSort =>
  CONTENT_POST_SORT_VALUES.includes((value ?? "") as ContentPostsSort)
    ? ((value ?? "") as ContentPostsSort)
    : DEFAULT_CONTENT_POSTS_QUERY.sort;

export const normalizeContentPostsStatusFilter = (
  value: string | null | undefined,
): ContentPostsStatusFilter =>
  CONTENT_POST_STATUS_FILTER_VALUES.includes((value ?? "") as ContentPostsStatusFilter)
    ? ((value ?? "") as ContentPostsStatusFilter)
    : DEFAULT_CONTENT_POSTS_QUERY.status;

export type ContentCollectionCounts = Record<ContentCollection, number>;

export type ContentWorkspaceSummary = {
  counts: ContentCollectionCounts;
  isDerived: boolean;
  isExact: boolean;
  pendingCollections: ContentCollection[];
  refreshedAt: string | null;
};

export type ContentPagination = {
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  nextCursor?: string | null;
  page: number;
  pageSize: number;
  totalItems: number;
  totalItemsExact?: boolean;
  totalPages: number;
};

export type ContentEditorFieldSummary = {
  id: string;
  label: string;
  required: boolean;
};

export type ContentFieldSpecEditabilityState = ContentFieldEditabilityState;

export type ContentFieldSpecPatchMode = ContentFieldPatchMode;

export type ContentFieldSpecUiControl = ContentFieldUiControl;

export type ContentFieldSpecValueKind = ContentFieldValueKind;

export type ContentRedirectMetadataSupport = "list_only" | "structured";

export type ContentFieldSpecRelationMode = ContentFieldRelationMode;

export type ContentFieldSpecSummary = {
  allowedValues: string[] | null;
  contentFormat: ContentPrimaryContentFormat | "json" | "plain_text" | "xml" | null;
  editabilityState: ContentFieldSpecEditabilityState;
  fieldKey: string;
  isCustomField?: boolean;
  label: string;
  multiple: boolean;
  nullable: boolean;
  patchMode: ContentFieldSpecPatchMode;
  readOnly: boolean;
  readOnlyReason?: "database_privilege" | "mapping" | "unsupported";
  redirectMetadataSupport?: ContentRedirectMetadataSupport;
  relationMode: ContentFieldSpecRelationMode;
  relationTargetEntity?: ContentMappingEntityKey | null;
  required: boolean;
  searchMode: "none" | "local" | "remote";
  semanticRole?: ContentFieldSemanticRole;
  storagePrimitive?: ContentFieldStoragePrimitive;
  uiControl: ContentFieldSpecUiControl;
  valueKind: ContentFieldSpecValueKind;
  visible: boolean;
};

export type ContentSidebarFieldSpecSummary = ContentFieldSpecSummary & {
  defaultParentId: string | null;
  description: string;
  sidebarFieldId: ContentPostSidebarFieldKey;
};

export type ContentPostFieldAvailability = {
  author: boolean;
  categories: boolean;
  customFields: boolean;
  excerpt: boolean;
  featuredImage: boolean;
  focusKeyword: boolean;
  publishedAt: boolean;
  seo: boolean;
  seoDescription: boolean;
  seoTitle: boolean;
  slug: boolean;
  status: boolean;
  tags: boolean;
  title: boolean;
  updatedAt: boolean;
};

export type ContentRuntimeSummary = {
  customFields: ContentCustomFieldMapping[];
  editorFields: ContentEditorFieldSummary[];
  fieldSpecs?: ContentFieldSpecSummary[];
  filesStorage: {
    bucketName: string | null;
    canManage: boolean;
    provider: ContentMediaStorageProvider;
    supportsLibrary: boolean;
  } | null;
  mediaStorage: {
    bucketName: string | null;
    canManage: boolean;
    provider: ContentMediaStorageProvider;
    supportsLibrary: boolean;
  } | null;
  sidebarFieldSpecs?: ContentSidebarFieldSpecSummary[];
};

export type ContentVisibleCollections = {
  authors: boolean;
  categories: boolean;
  files: boolean;
  media: boolean;
  tags: boolean;
};

const CONTENT_BUILTIN_FIELD_KEYS_BY_SEMANTIC_ROLE = {
  author: "author",
  categories: "categories",
  excerpt: "excerpt",
  featuredImage: "featuredImage",
  focusKeyword: "focusKeyword",
  publishedAt: "publishedAt",
  seoDescription: "seoDescription",
  seoTitle: "seoTitle",
  slug: "slug",
  status: "status",
  tags: "tags",
  title: "title",
  updatedAt: "updatedAt",
} as const satisfies Partial<Record<ContentFieldSemanticRole, string>>;

export const contentFieldSpecMatchesSemanticRole = ({
  fieldSpec,
  semanticRole,
}: {
  fieldSpec: ContentFieldSpecSummary;
  semanticRole: ContentFieldSemanticRole;
}) =>
  fieldSpec.semanticRole === semanticRole ||
  CONTENT_BUILTIN_FIELD_KEYS_BY_SEMANTIC_ROLE[semanticRole] === fieldSpec.fieldKey;

export const findContentFieldSpecBySemanticRole = ({
  fieldSpecs,
  semanticRole,
}: {
  fieldSpecs: ContentFieldSpecSummary[];
  semanticRole: ContentFieldSemanticRole;
}) => fieldSpecs.find((fieldSpec) => contentFieldSpecMatchesSemanticRole({ fieldSpec, semanticRole }));

export const hasVisibleContentFieldSpecForSemanticRole = ({
  fieldSpecs,
  semanticRole,
}: {
  fieldSpecs: ContentFieldSpecSummary[];
  semanticRole: ContentFieldSemanticRole;
}) =>
  fieldSpecs.some(
    (fieldSpec) =>
      fieldSpec.visible && contentFieldSpecMatchesSemanticRole({ fieldSpec, semanticRole }),
  );

export const hasVisibleWritableContentFieldSpecForSemanticRole = ({
  fieldSpecs,
  semanticRole,
}: {
  fieldSpecs: ContentFieldSpecSummary[];
  semanticRole: ContentFieldSemanticRole;
}) =>
  fieldSpecs.some(
    (fieldSpec) =>
      fieldSpec.visible &&
      fieldSpec.editabilityState !== "read_only" &&
      fieldSpec.editabilityState !== "unsupported" &&
      contentFieldSpecMatchesSemanticRole({ fieldSpec, semanticRole }),
  );

export const getContentPostFieldAvailabilityFromFieldSpecs = ({
  customFields,
  fieldSpecs,
}: {
  customFields?: Array<unknown> | null;
  fieldSpecs: ContentFieldSpecSummary[];
}): ContentPostFieldAvailability => {
  const hasVisibleCustomField = fieldSpecs.some(
    (fieldSpec) => fieldSpec.visible && fieldSpec.isCustomField === true,
  );
  const hasVisibleSeoField =
    hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "seoTitle" }) ||
    hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "seoDescription" }) ||
    hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "focusKeyword" });

  return {
    author: hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "author" }),
    categories: hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "categories" }),
    customFields: hasVisibleCustomField || (customFields?.length ?? 0) > 0,
    excerpt: hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "excerpt" }),
    featuredImage: hasVisibleContentFieldSpecForSemanticRole({
      fieldSpecs,
      semanticRole: "featuredImage",
    }),
    focusKeyword: hasVisibleContentFieldSpecForSemanticRole({
      fieldSpecs,
      semanticRole: "focusKeyword",
    }),
    publishedAt: hasVisibleContentFieldSpecForSemanticRole({
      fieldSpecs,
      semanticRole: "publishedAt",
    }),
    seo: hasVisibleSeoField,
    seoDescription: hasVisibleContentFieldSpecForSemanticRole({
      fieldSpecs,
      semanticRole: "seoDescription",
    }),
    seoTitle: hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "seoTitle" }),
    slug: hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "slug" }),
    status: hasVisibleWritableContentFieldSpecForSemanticRole({
      fieldSpecs,
      semanticRole: "status",
    }),
    tags: hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "tags" }),
    title: hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "title" }),
    updatedAt: hasVisibleContentFieldSpecForSemanticRole({
      fieldSpecs,
      semanticRole: "updatedAt",
    }),
  };
};

export const getContentVisibleCollectionsFromRuntimeSummary = ({
  runtime,
}: {
  runtime: ContentRuntimeSummary | null | undefined;
}): ContentVisibleCollections => {
  const fieldSpecs = runtime?.fieldSpecs ?? [];

  return {
    authors: hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "author" }),
    categories: hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "categories" }),
    files: Boolean(runtime?.filesStorage?.supportsLibrary),
    media: Boolean(runtime?.mediaStorage?.supportsLibrary),
    tags: hasVisibleContentFieldSpecForSemanticRole({ fieldSpecs, semanticRole: "tags" }),
  };
};

export type ContentWorkspaceMeta = {
  capabilities: {
    canManageAuthors: boolean;
    canManageTaxonomy: boolean;
  };
  counts: ContentCollectionCounts;
  contentRuntime: ContentRuntimeSummary | null;
  message?: string;
  postSidebarConfig: ContentPostSidebarConfig;
  primaryContentFormat: ContentPrimaryContentFormat;
  workspaceSummary: ContentWorkspaceSummary;
  workspaceState: ContentWorkspaceState;
};

export type ContentCollectionPage<T> = {
  accessNotice?: ContentDatabaseReadAccessNotice | null;
  items: T[];
  pagination: ContentPagination;
};

export type ContentEditorOptionsState = "warm" | "full";
export type ContentPostsListIndexState = "ready" | "warming";

export type ContentCategoriesPage = {
  accessNotice?: ContentDatabaseReadAccessNotice | null;
  allCategories?: ContentCategory[];
  items: ContentCategory[];
  pagination: ContentPagination;
};

export type ContentPostsPage = {
  accessNotice?: ContentDatabaseReadAccessNotice | null;
  authors: ContentAuthor[];
  categories: ContentCategory[];
  editorOptionsState: ContentEditorOptionsState;
  pagination: ContentPagination;
  posts: ContentPost[];
  postsListIndexState?: ContentPostsListIndexState;
  tags: ContentTag[];
};

export type ContentDatabaseReadAccessNotice = {
  estimatedRows: number | null;
  kind: "database_read_access_limited";
  message: string;
  tableRef: string;
};

export type ContentPostEditorPayload = {
  authors: ContentAuthor[];
  categories: ContentCategory[];
  editorOptionsState: ContentEditorOptionsState;
  post: ContentPost;
  tags: ContentTag[];
};

export type ContentPostRevisionsPayload = {
  revisions: ContentPostRevision[];
};

export type ContentSnapshot = {
  authors: ContentAuthor[];
  categories: ContentCategory[];
  media: ContentMedia[];
  primaryContentFormat: ContentPrimaryContentFormat;
  posts: ContentPost[];
  tags: ContentTag[];
  workspaceState: ContentWorkspaceState;
};

export const slugifyContentValue = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const isValidContentSlug = (value: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export const createDefaultEditorDoc = () =>
  ({
    content: [{ type: "paragraph" }],
    type: "doc",
  }) satisfies Record<string, unknown>;

export const createContentPostListPreview = ({
  authorId,
  createdAt,
  editingSession = null,
  excerpt,
  id,
  publishedAt = null,
  slug,
  status,
  title,
  updatedAt,
}: Pick<
  ContentPost,
  "authorId" | "createdAt" | "excerpt" | "id" | "publishedAt" | "slug" | "status" | "title" | "updatedAt"
> & {
  editingSession?: ContentPost["editingSession"];
}): ContentPost => ({
  authorId,
  categoryIds: [],
  contentFields: {},
  contentFormat: "html",
  contentHtml: "",
  contentJson: createDefaultEditorDoc(),
  contentMarkdown: null,
  createdAt,
  customFields: {},
  editorPayloadReady: false,
  editingSession,
  excerpt,
  featuredImageUrl: null,
  focusKeyword: null,
  id,
  parentPageId: null,
  publishedAt,
  redirects: [],
  seoDescription: null,
  seoTitle: null,
  slug,
  status,
  tagIds: [],
  title,
  updatedAt,
});

export const isContentPostEditorPayloadReady = (
  post: Pick<ContentPost, "editorPayloadReady"> | null | undefined,
) => post !== null && post !== undefined && post.editorPayloadReady !== false;

export const hasFullContentEditorOptions = (
  payload:
    | Pick<ContentPostsPage, "editorOptionsState">
    | Pick<ContentPostEditorPayload, "editorOptionsState">,
) => payload.editorOptionsState === "full";
