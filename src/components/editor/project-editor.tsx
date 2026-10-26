"use client";

import React, {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEditor } from "@tiptap/react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Text,
  Underline,
} from "lucide-react";
import { toast } from "sonner";

import {
  collectionItems,
  defaultCollectionCounts,
  defaultCollectionPages,
  defaultPagination,
  postsPageSize,
  POST_EDIT_CAPABILITY_CHANGED_SENTINEL,
  POST_SESSION_RECOVERED_SENTINEL,
  relationOptionsRenderLimit,
} from "@/components/editor/project-editor/constants";
import { useProjectEditorDebouncedValue } from "@/components/editor/project-editor/use-debounced-value";
import { getProductionErrorMessage } from "@/lib/errors/user-facing";
import { ProjectEditorPostsCollectionPage } from "@/components/editor/project-editor/posts-collection-page";
import {
  ProjectEditorMultiFieldEditorBody,
  ProjectEditorPostBlockedState,
  ProjectEditorPostEditorBody,
  ProjectEditorPostsListSkeleton,
  ProjectEditorScrollPane,
} from "@/components/editor/project-editor/collection-body";
import {
  renderProjectEditorCollectionBody,
  renderProjectEditorSidePanel,
} from "@/components/editor/project-editor/render-surfaces";
import {
  fetchProjectEditorMappingDetection,
  fetchProjectEditorMappingTableCatalog,
  fetchProjectEditorContentCollectionPage,
  fetchProjectEditorStoredMapping,
  getProjectEditorFilesLibraryQueryOptions,
  getProjectEditorAuthorsPageQueryOptions,
  getProjectEditorCategoriesPageQueryOptions,
  getProjectEditorMediaLibraryQueryOptions,
  getProjectEditorPostRevisionsQueryOptions,
  getProjectEditorPostsQueryCacheToken,
  getProjectEditorPostsPageQueryOptions,
  getProjectEditorTagsPageQueryOptions,
  getProjectEditorWorkspaceQueryOptions,
  getProjectEditorWorkspaceSummaryQueryOptions,
  projectEditorLocalCacheKeys,
  projectEditorQueryKeys,
  useProjectEditorPostPayloadQuery,
  useProjectEditorPostRevisionsQuery,
  useProjectEditorPostsPageQuery,
  useProjectEditorPostsPresenceQuery,
  useProjectEditorRelationOptionsQuery,
  useProjectEditorWorkspaceQuery,
} from "@/components/editor/project-editor/queries";
import { ProjectEditorChrome } from "@/components/editor/project-editor/editor-chrome";
import {
  runProjectEditorLinkApply,
  runProjectEditorLinkUnlink,
} from "@/components/editor/project-editor/editor-link-actions";
import {
  runProjectEditorFileInsert,
  runProjectEditorImageAttributeUpdate,
  runProjectEditorImageInsert,
  runProjectEditorImageRemove,
} from "@/components/editor/project-editor/editor-asset-insert-actions";
import { ProjectEditorAssetPickerDialog } from "@/components/editor/project-editor/editor-asset-picker-dialog";
import {
  ProjectEditorImageSettingsPanel,
  type ProjectEditorSelectedImage,
} from "@/components/editor/project-editor/editor-image-settings-panel";
import {
  ProjectAuthorsManager,
  ProjectEditorDialogs,
  ProjectEditorPostsMappingWorkspace,
  ProjectEditorPostSidePanel,
  ProjectEditorTaxonomyCollectionPage,
  ProjectEditorTaxonomySidePanel,
  ProjectFilesManager,
  ProjectMediaManager,
  ProjectSettingsView,
} from "@/components/editor/project-editor/deferred-surfaces";
import {
  createDefaultWorkspaceSummaryState,
  getWorkspaceCollectionCount,
  WORKSPACE_SUMMARY_REFRESH_INTERVAL_MS,
} from "@/components/editor/project-editor/workspace-summary-state";
import {
  getProjectEditorKeyboardPlatform,
  getProjectEditorShortcutLabel,
} from "@/components/editor/project-editor/keyboard-shortcuts";
import { EditorLinkPopover, buildRelString, type EditorLinkState } from "@/components/editor/project-editor/editor-link-popover";
import { ProjectEditorSlashCommandMenu } from "@/components/editor/project-editor/slash-command-menu";
import {
  filterProjectEditorSlashCommands,
  PROJECT_EDITOR_SLASH_COMMANDS,
  type ProjectEditorSlashCommandItem,
} from "@/components/editor/project-editor/slash-commands";
import {
  getNextSelectedPostIds,
  getPendingPostsDeleteCandidate,
  getSelectablePostIds,
} from "@/components/editor/project-editor/post-selection";
import {
  runProjectEditorPostSaveAction,
  runProjectEditorPostSaveAndContinueAction,
} from "@/components/editor/project-editor/post-save-action";
import { buildProjectEditorPostSavePayloadFields } from "@/components/editor/project-editor/post-save-payload";
import {
  getNextSelectedTaxonomyIds,
  getNextTaxonomyDraftNameChange,
  getTaxonomySlugInputValue,
} from "@/components/editor/project-editor/taxonomy-selection";
import { getProjectEditorManagedStorageState } from "@/components/editor/project-editor/managed-storage-state";
import {
  deleteProjectMutation,
  requestProjectEditorContentAction,
  runProjectEditorContentAction,
  saveProjectPostSidebarConfigMutation,
  updateProjectSettingsMutation,
} from "@/components/editor/project-editor/mutations";
import {
  getProjectEditorSettingsState,
  runProjectEditorDeleteAction,
  runProjectEditorSettingsSaveAction,
} from "@/components/editor/project-editor/project-settings-state";
import {
  runProjectEditorPostStatusTransitionAction,
  type ProjectEditorPostStatusTransitionAction,
} from "@/components/editor/project-editor/post-status-transition";
import {
  buildProjectEditorSavedMappingPayloadState,
  type ProjectEditorSavedMappingPayload,
} from "@/components/editor/project-editor/saved-mapping-payload";
import {
  getProjectEditorSlashCommandMatch,
  type ProjectEditorSlashCommandMatch,
} from "@/components/editor/project-editor/slash-command-match";
import { useDiscardableNewPosts } from "@/components/editor/project-editor/use-discardable-new-posts";
import { useProjectEditorMappingDialogState } from "@/components/editor/project-editor/use-project-editor-mapping-dialog-state";
import { useProjectEditorAutosaveStatus } from "@/components/editor/project-editor/use-project-editor-autosave-status";
import { useProjectEditorPrefetch } from "@/components/editor/project-editor/use-project-editor-prefetch";
import { useProjectEditorQuerySync } from "@/components/editor/project-editor/use-project-editor-query-sync";
import type {
  CollectionLabel,
  CollectionPagePayload,
  CreateCollectionResponse,
  DeleteCollectionResponse,
  DiscardPostResponse,
  EditingTaxonomyEntry,
  PendingPostsDelete,
  PendingTaxonomyDelete,
  PostSidePanelView,
  PostsMediaStorageDraft,
  PostsPagePayload,
  ProjectEditorPostsListUiCapabilities,
  ProjectEditorToolbarGroup,
  ProjectEditorStorageBucketOption,
  SettingsTabKey,
  SidebarCollectionEntry,
  SidebarItem,
  TaxonomyCollectionLabel,
  UpdatePostResponse,
  WorkspacePayload,
  WorkspaceSummaryPayload,
  YoastResult,
} from "@/components/editor/project-editor/types";
import {
  getProjectEditorPostSidebarValidationError,
  runProjectEditorPostSidebarConfigSaveAction,
} from "@/components/editor/project-editor/post-sidebar-settings-support";
import {
  createProjectEditorDefaultPostSidebarConfig,
  getProjectEditorResolvedPostSidebarNodes,
} from "@/components/editor/project-editor/post-sidebar-support";
import {
  getAvatarUrl,
  getCollectionApiName,
  getProjectEditorAuthorOptionsFromRelationOptions,
  getProjectEditorCategoryOptionsFromRelationOptions,
  getProjectEditorCollectionAvailability,
  getProjectEditorMainFieldSpecs,
  getProjectEditorPostFieldStates,
  getProjectEditorParentPageOptionsFromRelationOptions,
  getProjectEditorTagOptionsFromRelationOptions,
  getProjectEditorMappingDialogEntryCollection,
  getProjectEditorPostsListUiCapabilities,
  isSelectedPostEditorHydrated,
  hasProjectEditorRemoteRelationSearch,
  shouldApplySelectedPostEditorOptionsPayload,
  getCollectionPromptLabel,
  getNormalizedSettingsTab,
  getProjectEditorRouteState,
  getProjectEditorTopBarStatusLabel,
  getPostTitle,
  getTaxonomyNoun,
  isProjectConnectionErrorMessage,
  resolveWorkspaceState,
  shouldShowUnresolvedPostsListSkeleton,
  type ProjectEditorCollectionAvailability,
} from "@/components/editor/project-editor/utils";
import {
  getUserDisplayName,
  normalizeProjectWebsiteUrl,
  type ProjectRole,
} from "@/lib/control-plane/utils";
import { normalizeContentRuntimePostForEditor } from "@/lib/content-runtime/content-conversion";
import { createContentRuntimeEditorExtensions } from "@/lib/content-runtime/editor-extensions";
import {
  completeContentRuntimeDirectUploads,
  prepareContentRuntimeDirectUploads,
} from "@/lib/content-runtime/client-upload-api";
import { uploadPreparedContentRuntimeFile } from "@/lib/content-runtime/client-direct-upload";
import {
  areContentPostSidebarConfigsEqual,
  DEFAULT_CONTENT_POSTS_QUERY,
  type ContentCategoriesPage,
  createDefaultContentPostSidebarConfig,
  type ContentCollection,
  type ContentCollectionCounts,
  type ContentDatabaseReadAccessNotice,
  type ContentPagination,
  type ContentPostEditorPayload,
  type ContentPostSidebarConfig,
  type ContentPostEditingSession,
  type ContentPostRevision,
  getContentPostCombinedContentHtml,
  getContentPrimaryEditorFieldId,
  hasFullContentEditorOptions,
  isContentPostEditorPayloadReady,
  slugifyContentValue,
  type ContentAuthor,
  type ContentCategory,
  type ContentFileItem,
  type ContentFilesLibrary,
  type ContentMedia,
  type ContentMediaImage,
  type ContentMediaLibrary,
  type ContentPost,
  type ContentPostsListIndexState,
  type ContentPostsSort,
  type ContentPostsStatusFilter,
  type ContentTag,
  type ContentWorkspaceMeta,
  type ContentWorkspaceSummary,
  type ContentWorkspaceState,
  normalizeContentPostsSearch,
} from "@/lib/content-runtime/shared";
import {
  createUnmappedContentMappingConfig,
  createDefaultContentMappingConfig,
  type ContentEntityMapping,
  type ContentMappingConfig,
  type ContentMappingSaveScope,
} from "@/lib/content-runtime/mapping";
import { createPostEditorPreviewStorage } from "@/lib/editor/post-editor-preview";
import { createPostEditorLocalSeoStorage } from "@/lib/editor/post-editor-local-seo";
import { getResolvedPostEditorContentJson } from "@/lib/editor/post-editor-content-sync";
import {
  getDisplayedPostSlug,
  hasPublishablePostTitle,
  shouldKeepAutoSlugSynced,
  type PostComparableState,
} from "@/lib/editor/post-editor-rules";
import {
  MAX_FILE_UPLOAD_BYTES,
  MAX_MEDIA_UPLOAD_BYTES,
  validateFileUpload,
  validateImageUploadFile,
} from "@/lib/security/upload-validation";
import { usePostEditorSession } from "@/hooks/use-post-editor-session";
import {
  filterProjectEditorYoastSeoResults,
  getProjectEditorSeoCapabilities,
  isProjectEditorYoastSeoResultActionable,
  mergePostWithLocalFocusKeyword,
} from "@/components/editor/project-editor/seo-support";

import {
  ProjectNavigationSidebar,
} from "@/components/editor/project-navigation-sidebar";
import { shouldHandlePlainLinkNavigation } from "@/components/editor/navigation-link";
import {
  shouldFallbackPendingPostEditorToList,
  type ProjectEditorSidebarCollectionSourceItem,
} from "@/components/editor/project-editor/navigation";
import { useProjectEditorNavigation } from "@/components/editor/project-editor/use-project-editor-navigation";
import { requestProjectsNavigation } from "@/components/editor/project-editor/external-navigation";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { SidebarProvider } from "@/components/ui/sidebar";

type ManagedStorageSectionState = {
  currentPath: string;
  searchQuery: string;
};

type ProjectEditorProps = {
  accountAvatarUrl: string | null;
  accountEmail: string | null;
  accountName: string;
  initialRequestedSettingsTab?: string | null;
  initialWorkspacePayload?: WorkspacePayload | null;
  projectId: string;
  projectName: string;
  projectRole: ProjectRole;
  projectSlug: string;
  projectWebsiteUrl: string | null;
};

type CollectionAccessNoticeState = Record<
  "Authors" | "Categories" | "Posts" | "Tags",
  ContentDatabaseReadAccessNotice | null
>;

const defaultCollectionAccessNotices: CollectionAccessNoticeState = {
  Authors: null,
  Categories: null,
  Posts: null,
  Tags: null,
};

export function ProjectEditor({
  accountAvatarUrl,
  accountEmail,
  accountName,
  initialRequestedSettingsTab = null,
  initialWorkspacePayload = null,
  projectId,
  projectName,
  projectRole,
  projectSlug,
  projectWebsiteUrl,
}: ProjectEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const currentRouteUrl = searchParamsString ? `${pathname}?${searchParamsString}` : pathname;
  const routeSettingsTab = searchParams.get("tab");
  const { routePostId, routePostsPage, routeSection } = useMemo(
    () => getProjectEditorRouteState(pathname),
    [pathname],
  );
  const defaultCanManageAuthorDirectory = projectRole === "owner" || projectRole === "admin";
  const defaultCanManageTaxonomy =
    projectRole === "owner" || projectRole === "admin" || projectRole === "editor";
  const initialWorkspaceState = initialWorkspacePayload
    ? resolveWorkspaceState(initialWorkspacePayload)
    : null;
  const initialCanManageAuthorDirectory =
    initialWorkspacePayload?.capabilities?.canManageAuthors ?? defaultCanManageAuthorDirectory;
  const initialCanManageTaxonomy =
    initialWorkspacePayload?.capabilities?.canManageTaxonomy ?? defaultCanManageTaxonomy;
  const initialActiveSettingsTab = getNormalizedSettingsTab({
    canUpdateProject: defaultCanManageAuthorDirectory,
    value: initialRequestedSettingsTab,
  });
  const initialSidebarItem =
    routeSection === "Authors" && !defaultCanManageAuthorDirectory
      ? "Posts"
      : routeSection;
  const initialCollection = initialSidebarItem === "Settings" ? "Posts" : initialSidebarItem;
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [postsListIndexState, setPostsListIndexState] =
    useState<ContentPostsListIndexState>("ready");
  const [authors, setAuthors] = useState<ContentAuthor[]>([]);
  const [postAuthorOptions, setPostAuthorOptions] = useState<ContentAuthor[]>([]);
  const [postEditorOptionsReady, setPostEditorOptionsReady] = useState(false);
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<ContentCategory[]>([]);
  const [tags, setTags] = useState<ContentTag[]>([]);
  const [media, setMedia] = useState<ContentMedia[]>([]);
  const [collectionAccessNotices, setCollectionAccessNotices] =
    useState<CollectionAccessNoticeState>(defaultCollectionAccessNotices);
  const [collectionCounts, setCollectionCounts] = useState<ContentCollectionCounts>(
    initialWorkspacePayload?.counts ?? defaultCollectionCounts,
  );
  const [workspaceSummary, setWorkspaceSummary] = useState<ContentWorkspaceSummary>(
    initialWorkspacePayload?.workspaceSummary ??
      createDefaultWorkspaceSummaryState(initialWorkspacePayload?.counts ?? defaultCollectionCounts),
  );
  const [collectionPages, setCollectionPages] =
    useState<Record<CollectionLabel, number>>(defaultCollectionPages);
  const [collectionPagination, setCollectionPagination] = useState<ContentPagination>(defaultPagination);
  const [currentProjectName, setCurrentProjectName] = useState(projectName);
  const [currentProjectSlug, setCurrentProjectSlug] = useState(projectSlug);
  const [currentProjectWebsiteUrl, setCurrentProjectWebsiteUrl] = useState(projectWebsiteUrl ?? "");
  const [selectedSidebarItem, setSelectedSidebarItem] = useState<SidebarItem>(initialSidebarItem);
  const [selectedCollection, setSelectedCollection] = useState<CollectionLabel>(initialCollection);
  const [showSeoPanel, setShowSeoPanel] = useState(
    Boolean(routePostId) || initialCollection === "Categories" || initialCollection === "Tags",
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(!initialWorkspacePayload);
  const [loadingCollection, setLoadingCollection] = useState(!initialWorkspacePayload);
  const [refreshingWorkspace, setRefreshingWorkspace] = useState(false);
  const [refreshingCollection, setRefreshingCollection] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(initialWorkspacePayload?.message ?? null);
  const [projectConnectionError, setProjectConnectionError] = useState<string | null>(null);
  const [workspaceState, setWorkspaceState] = useState<ContentWorkspaceState | null>(initialWorkspaceState);
  const [contentRuntime, setContentRuntime] =
    useState<ContentWorkspaceMeta["contentRuntime"]>(initialWorkspacePayload?.contentRuntime ?? null);
  const {
    hasMountedPostsMappingWorkspace,
    loadingMappingDetection,
    loadingMappingTableCatalog,
    mappingDetection,
    mappingDetectionError,
    mappingDetectionMode,
    mappingDialogEntryCollection,
    mappingManualTableRef,
    mappingSelectedTableRef,
    mappingTableCatalog,
    mappingTableCatalogError,
    postsMappingStepIndex,
    prepareMappingDialog,
    resetMappingDetectionState,
    savingPostsMapping,
    setHasMountedPostsMappingWorkspace,
    setLoadingMappingDetection,
    setLoadingMappingTableCatalog,
    setMappingDetection,
    setMappingDetectionError,
    setMappingDetectionMode,
    setMappingManualTableRef,
    setMappingSelectedTableRef,
    setMappingTableCatalog,
    setMappingTableCatalogError,
    setPostsMappingStepIndex,
    setSavingPostsMapping,
    setShowMappingConfirmDialog,
    setShowPostsMappingDialog,
    showMappingConfirmDialog,
    showPostsMappingDialog,
  } = useProjectEditorMappingDialogState();
  const handlePostsMappingFinishRef = useRef<(() => Promise<void>) | null>(null);
  const [creatingCollectionEntry, setCreatingCollectionEntry] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [pendingDiscardablePostRouteId, setPendingDiscardablePostRouteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPostRevisionsSheet, setShowPostRevisionsSheet] = useState(false);
  const [loadingPostRevisions, setLoadingPostRevisions] = useState(false);
  const [postRevisions, setPostRevisions] = useState<ContentPostRevision[]>([]);
  const [postRevisionsLoadError, setPostRevisionsLoadError] = useState<string | null>(null);
  const [pendingRevisionRestore, setPendingRevisionRestore] = useState<ContentPostRevision | null>(null);
  const [restoringRevisionNumber, setRestoringRevisionNumber] = useState<number | null>(null);
  const [collectionReloadToken, setCollectionReloadToken] = useState(0);
  const [postsPageCursors, setPostsPageCursors] = useState<Record<number, string>>({});
  const [postsSearchQuery, setPostsSearchQuery] = useState(DEFAULT_CONTENT_POSTS_QUERY.search);
  const deferredPostsSearchQuery = useDeferredValue(postsSearchQuery);
  const [postsStatusFilter, setPostsStatusFilter] =
    useState<ContentPostsStatusFilter>(DEFAULT_CONTENT_POSTS_QUERY.status);
  const [postsSort, setPostsSort] = useState<ContentPostsSort>(DEFAULT_CONTENT_POSTS_QUERY.sort);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [newCategoryParentId, setNewCategoryParentId] = useState<string>("none");
  const [newTagName, setNewTagName] = useState("");
  const [newTagSlug, setNewTagSlug] = useState("");
  const [newTagDescription, setNewTagDescription] = useState("");
  const [editingTaxonomyEntry, setEditingTaxonomyEntry] = useState<EditingTaxonomyEntry | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pendingPostsDelete, setPendingPostsDelete] = useState<PendingPostsDelete | null>(null);
  const [pendingTaxonomyDelete, setPendingTaxonomyDelete] = useState<PendingTaxonomyDelete | null>(null);
  const [pendingPostAction, setPendingPostAction] = useState<{
    confirmLabel: string;
    description: string;
    title: string;
    type: "archive" | "publish" | "save" | "unpublish";
  } | null>(null);
  const [isDeletingPosts, setIsDeletingPosts] = useState(false);
  const [isDeletingCollectionEntry, setIsDeletingCollectionEntry] = useState(false);
  const [settingsNameDraft, setSettingsNameDraft] = useState(projectName);
  const [settingsSlugDraft, setSettingsSlugDraft] = useState(projectSlug);
  const [settingsWebsiteUrlDraft, setSettingsWebsiteUrlDraft] = useState(projectWebsiteUrl ?? "");
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabKey>(initialActiveSettingsTab);
  const [savedPostSidebarConfig, setSavedPostSidebarConfig] = useState<ContentPostSidebarConfig>(
    initialWorkspacePayload?.postSidebarConfig ?? createDefaultContentPostSidebarConfig(),
  );
  const [postSidebarConfigDraft, setPostSidebarConfigDraft] = useState<ContentPostSidebarConfig>(
    initialWorkspacePayload?.postSidebarConfig ?? createDefaultContentPostSidebarConfig(),
  );
  const [isSavingProjectSettings, setIsSavingProjectSettings] = useState(false);
  const [isSavingPostSidebarConfig, setIsSavingPostSidebarConfig] = useState(false);
  const [loadingSettingsMappingCollection, setLoadingSettingsMappingCollection] =
    useState<CollectionLabel | null>(null);
  const [unmappingSettingsTarget, setUnmappingSettingsTarget] =
    useState<CollectionLabel | "all" | null>(null);
  const [loadingSavedMapping, setLoadingSavedMapping] = useState(false);
  const [settingsMappingError, setSettingsMappingError] = useState<string | null>(null);
  const [savedMappingError, setSavedMappingError] = useState<string | null>(null);
  const [settingsAvailableSupabaseBuckets, setSettingsAvailableSupabaseBuckets] = useState<
    ProjectEditorStorageBucketOption[]
  >([]);
  const [settingsSavedFilesStorage, setSettingsSavedFilesStorage] = useState<PostsMediaStorageDraft | null>(null);
  const [settingsSavedMappingConfig, setSettingsSavedMappingConfig] = useState<ContentMappingConfig | null>(
    null,
  );
  const [settingsSavedPostsEntity, setSettingsSavedPostsEntity] = useState<ContentEntityMapping | null>(null);
  const [settingsSavedMediaStorage, setSettingsSavedMediaStorage] = useState<PostsMediaStorageDraft | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [isProjectSlugLocked, setIsProjectSlugLocked] = useState(true);
  const [showProjectSlugUnlockDialog, setShowProjectSlugUnlockDialog] = useState(false);
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);
  const [showKeyboardShortcutsDialog, setShowKeyboardShortcutsDialog] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkPopoverAnchor, setLinkPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const [linkPopoverAutoFocusInput, setLinkPopoverAutoFocusInput] = useState(true);
  const [linkPopoverInitial, setLinkPopoverInitial] = useState<{
    href: string;
    target: string | null;
    rel: string | null;
    isEditing: boolean;
  }>({ href: "", target: null, rel: null, isEditing: false });
  const [assetPickerKind, setAssetPickerKind] = useState<"media" | "files" | null>(null);
  const [assetPickerMediaLibrary, setAssetPickerMediaLibrary] = useState<ContentMediaLibrary | null>(null);
  const [assetPickerFilesLibrary, setAssetPickerFilesLibrary] = useState<ContentFilesLibrary | null>(null);
  const [assetPickerLoading, setAssetPickerLoading] = useState(false);
  const [assetPickerPath, setAssetPickerPath] = useState("");
  const [assetPickerUploading, setAssetPickerUploading] = useState(false);
  const [selectedEditorImage, setSelectedEditorImage] = useState<ProjectEditorSelectedImage | null>(null);
  const [slashCommandMatch, setSlashCommandMatch] = useState<ProjectEditorSlashCommandMatch | null>(null);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const [deleteProjectConfirmation, setDeleteProjectConfirmation] = useState("");
  const [postSidePanelView, setPostSidePanelView] = useState<PostSidePanelView>("details");
  const [yoastSeoResults, setYoastSeoResults] = useState<YoastResult[]>([]);
  const [yoastReadabilityResults, setYoastReadabilityResults] = useState<YoastResult[]>([]);
  const [yoastSeoScore, setYoastSeoScore] = useState<number | null>(null);
  const [yoastReadabilityScore, setYoastReadabilityScore] = useState<number | null>(null);
  const [isYoastAnalyzing, setIsYoastAnalyzing] = useState(false);
  const [postAuthorsSearchQuery, setPostAuthorsSearchQuery] = useState("");
  const [postCategoriesSearchQuery, setPostCategoriesSearchQuery] = useState("");
  const [postParentPageSearchQuery, setPostParentPageSearchQuery] = useState("");
  const [postTagsSearchQuery, setPostTagsSearchQuery] = useState("");
  const deferredPostAuthorsSearchQuery = useProjectEditorDebouncedValue(postAuthorsSearchQuery, 300);
  const deferredPostCategoriesSearchQuery = useProjectEditorDebouncedValue(postCategoriesSearchQuery, 300);
  const deferredPostParentPageSearchQuery = useProjectEditorDebouncedValue(postParentPageSearchQuery, 300);
  const deferredPostTagsSearchQuery = useProjectEditorDebouncedValue(postTagsSearchQuery, 300);
  const [resolvedWorkspace, setResolvedWorkspace] = useState(Boolean(initialWorkspacePayload));
  const [resolvedCollectionCacheKeys, setResolvedCollectionCacheKeys] = useState<string[]>([]);
  const [externalPageLoading, setExternalPageLoading] = useState(false);
  const [mediaSectionState, setMediaSectionState] = useState<ManagedStorageSectionState>({
    currentPath: "",
    searchQuery: "",
  });
  const [filesSectionState, setFilesSectionState] = useState<ManagedStorageSectionState>({
    currentPath: "",
    searchQuery: "",
  });
  const [uploadingFeaturedImage, setUploadingFeaturedImage] = useState(false);
  const [featuredImageDragActive, setFeaturedImageDragActive] = useState(false);
  const featuredImageInputRef = useRef<HTMLInputElement | null>(null);
  const assetPickerEditorRef = useRef<TiptapEditor | null>(null);
  const assetPickerSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const selectedEditorImageRef = useRef<TiptapEditor | null>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const collectionRequestSignatureRef = useRef<string | null>(null);
  const prepareForNavigationAwayFromPostEditorRef = useRef<() => Promise<boolean>>(async () => true);
  const isSettingsView = selectedSidebarItem === "Settings";
  const canUpdateProject = defaultCanManageAuthorDirectory;
  const canDeleteProject = projectRole === "owner";
  const [canManageAuthorDirectory, setCanManageAuthorDirectory] = useState(initialCanManageAuthorDirectory);
  const [canManageTaxonomy, setCanManageTaxonomy] = useState(initialCanManageTaxonomy);
  const canForcePostTakeover =
    projectRole === "owner" || projectRole === "admin" || projectRole === "editor";
  const isPostsCollection = !isSettingsView && selectedCollection === "Posts";
  const currentPostsListPage = routePostsPage ?? collectionPages.Posts;
  const currentPostsListCursor = postsPageCursors[currentPostsListPage] ?? null;
  const currentCollectionPage =
    selectedCollection === "Posts" ? currentPostsListPage : collectionPages[selectedCollection];
  const isContentReady = workspaceState === "ready";
  const canAccessContent = isContentReady && !projectConnectionError;
  const {
    acquiringPostEditSession,
    acknowledgeLostPostAccess,
    autoSlugPostIdsRef,
    canEditCurrentPost,
    canEditCurrentPostRef,
    clearStoredPostDraftState,
    closePostEditorSession,
    dismissPendingLostPostDraft,
    dismissPendingStoredDraft,
    dirtyPostIdsRef,
    dismissPendingPostTakeover,
    draftPostsRef,
    getDisplayedSelectedPostSlug,
    getEditingSessionLabel,
    handlePostEditCapabilityError,
    hasComparableUnsavedPostChanges,
    isPersistingLocalAutosave,
    isEditingPostSlug,
    isEditingPostSlugRef,
    isRecoverablePostSessionError,
    isPostSlugAutoManaged,
    loadingSelectedPost,
    lostPostAccessState,
    markPostDirty,
    markPostPersisted,
    pendingLostPostDraftRestore,
    pendingPostTakeover,
    pendingStoredDraftRestore,
    pendingUnsavedChangesAction,
    pendingUnsavedChangesCancelActionRef,
    pendingUnsavedChangesActionRef,
    activePostEditSessionPostIdRef,
    persistedPostsRef,
    postEditCapability,
    postContentView,
    postSlugDraft,
    postSlugDraftRef,
    requestUnsavedChangesConfirmation,
    restorePendingLostPostDraft,
    restorePendingStoredDraft,
    resolvePostEditConflict,
    retryCurrentPostEditAccess,
    selectedPost,
    selectedPostId,
    selectedPostIdRef,
    selectedPostLoadError,
    setIsEditingPostSlug,
    setLoadingSelectedPost,
    setPendingUnsavedChangesAction,
    setPostContentView,
    setPostSlugDraft,
    setSelectedPostId,
    setSelectedPostLoadError,
    takeOverPendingPostEditing,
  } = usePostEditorSession({
    getComparablePostState,
    isContentReady: canAccessContent,
    isSaving,
    onSessionError: (message) => toast.error(message),
    onStoredDraftRestored: () => {
      setPostSidePanelView("details");
      setShowSeoPanel(true);
      toast.message("Restored unsaved draft.");
    },
    pathname,
    prepareForNavigationAwayFromPostEditor: () => prepareForNavigationAwayFromPostEditorRef.current(),
    posts,
    projectId,
    refreshPostsPresence,
    routePostId,
    searchParamsString,
    selectedCollection,
    setPosts,
  });
  const showTopBarAutosaveStatus = useProjectEditorAutosaveStatus(isPersistingLocalAutosave);
  const selectedCollectionConfig =
    collectionItems.find((item) => item.label === selectedCollection) ?? collectionItems[0];
  const activeSectionLabel = isSettingsView ? "Settings" : selectedCollection;
  const hasSelectedPost = Boolean(selectedPost);
  const isMacKeyboardPlatform = useMemo(() => getProjectEditorKeyboardPlatform(), []);
  const isLoadingCollection = loadingWorkspace || loadingCollection;
  const isPostEditorView = isPostsCollection && postContentView === "editor" && hasSelectedPost;
  const isPublishedPost = Boolean(isPostEditorView && selectedPost?.status === "published");
  const isArchivedPost = Boolean(isPostEditorView && selectedPost?.status === "archived");
  const isCurrentPostBlocked = postEditCapability.state === "blocked";
  const isCurrentPostEditable = postEditCapability.state === "editable";
  const isCurrentPostReadOnly = postEditCapability.state === "read_only";
  const currentPostReadOnlyMessage =
    postEditCapability.state === "read_only" ? postEditCapability.message : null;
  const authorsById = useMemo(
    () =>
      new Map(
        authors.map((author) => [
          author.id,
          {
            avatarUrl: getAvatarUrl(author.avatarUrl),
            displayName: author.name.trim() || getUserDisplayName(author.email, author.name),
            email: author.email,
          },
        ]),
      ),
    [authors],
  );
  const hasSelectedPostUnsavedChanges = Boolean(
    selectedPost &&
      hasComparableUnsavedPostChanges({
        draftPost: draftPostsRef.current[selectedPost.id] ?? selectedPost,
        isEditingSlug: isEditingPostSlug,
        persistedPost: persistedPostsRef.current[selectedPost.id] ?? null,
        slugDraft: postSlugDraft,
      }),
  );
  const shouldShowPostRouteLoadingState = Boolean(
    postContentView === "editor" &&
      !selectedPost &&
      !selectedPostLoadError &&
      Boolean(routePostId || selectedPostId) &&
      loadingSelectedPost,
  );
  const canPublishSelectedPost = Boolean(
    selectedPost &&
      isCurrentPostEditable &&
      !isSaving &&
      !isPublishing &&
      hasPublishablePostTitle(selectedPost.title),
  );
  const canArchiveSelectedPost = Boolean(
    selectedPost &&
      selectedPost.status !== "archived" &&
      isCurrentPostEditable &&
      !isSaving &&
      !isPublishing,
  );
  const canDeleteSelectedPost = Boolean(
    selectedPost &&
      isPostEditorView &&
      selectedPost.canWrite !== false &&
      isCurrentPostEditable &&
      !isSaving &&
      !isPublishing &&
      !isDeletingPosts,
  );
  const canRestoreSelectedPostToDraft = Boolean(
    selectedPost &&
      (selectedPost.status === "archived" || selectedPost.status === "published") &&
      isCurrentPostEditable &&
      !isSaving &&
      !isPublishing,
  );
  // Preview and Revisions are read-safe actions — available to any member whose post access
  // is in a stable state (editable or read_only). Acquiring, blocked, taken_over, and inactive
  // states all indicate the post is not yet in a safe/accessible position.
  const canOpenSelectedPostPreview = Boolean(
    selectedPost && !shouldShowPostRouteLoadingState && (isCurrentPostEditable || isCurrentPostReadOnly),
  );
  const isContentProject = true;
  const {
    canUploadFeaturedImage,
    usesManagedFilesLibrary,
    usesManagedMediaLibrary,
  } = useMemo(
    () => getProjectEditorManagedStorageState({ contentRuntime }),
    [contentRuntime],
  );
  const supportsPostRevisions = false;
  const canOpenSelectedPostRevisions = Boolean(
    supportsPostRevisions &&
      selectedPost &&
      !shouldShowPostRouteLoadingState &&
      (isCurrentPostEditable || isCurrentPostReadOnly),
  );
  const primaryContentFormat = initialWorkspacePayload?.primaryContentFormat ?? "html";
  const multiFieldEditorFields = useMemo(
    () => contentRuntime?.editorFields ?? [],
    [contentRuntime?.editorFields],
  );
  const mainFieldSpecs = useMemo(
    () =>
      getProjectEditorMainFieldSpecs({
        contentRuntime,
        isContentProject,
        primaryContentFormat,
      }),
    [contentRuntime, isContentProject, primaryContentFormat],
  );
  const isMultiFieldEditor = useMemo(
    () => mainFieldSpecs.filter((fieldSpec) => fieldSpec.valueKind === "content").length > 1,
    [mainFieldSpecs],
  );
  const primaryMultiFieldEditorId = getContentPrimaryEditorFieldId(multiFieldEditorFields);
  const selectedPostYoastInput = useMemo(() => {
    if (!selectedPost) {
      return null;
    }

    return {
      contentHtml: getContentPostCombinedContentHtml({
        editorFields: multiFieldEditorFields,
        post: selectedPost,
      }),
      excerpt: selectedPost.excerpt ?? "",
      focusKeyword: selectedPost.focusKeyword ?? "",
      id: selectedPost.id,
      seoDescription: selectedPost.seoDescription ?? "",
      seoTitle: selectedPost.seoTitle ?? "",
      slug: selectedPost.slug ?? "",
      title: selectedPost.title ?? "",
    };
  }, [multiFieldEditorFields, selectedPost]);
  const postFieldStates = useMemo(
    () =>
      getProjectEditorPostFieldStates({
        contentRuntime,
        isContentProject,
      }),
    [contentRuntime, isContentProject],
  );
  const postsListUiCapabilities = useMemo<ProjectEditorPostsListUiCapabilities>(
    () =>
      getProjectEditorPostsListUiCapabilities({
        contentRuntime,
        isContentProject,
      }),
    [contentRuntime, isContentProject],
  );
  const normalizedProjectWebsiteUrl = normalizeProjectWebsiteUrl(currentProjectWebsiteUrl);
  const localSeoStorage = useMemo(() => createPostEditorLocalSeoStorage(projectId), [projectId]);
  const seoCapabilities = useMemo(
    () =>
      getProjectEditorSeoCapabilities({
        hasWebsiteUrl: Boolean(normalizedProjectWebsiteUrl),
        postFieldStates,
      }),
    [normalizedProjectWebsiteUrl, postFieldStates],
  );
  const resolvePostSeoFallbacks = useCallback(
    (post: ContentPost) => {
      const normalizedPost = normalizeContentRuntimePostForEditor({
        editorFields: multiFieldEditorFields,
        post: mergePostWithLocalFocusKeyword({
          focusKeyword: localSeoStorage.readFocusKeyword(post.id),
          post,
        }),
      });

      if (postFieldStates.focusKeyword.mapped && normalizedPost.focusKeyword?.trim()) {
        localSeoStorage.clearFocusKeyword(post.id);
      }

      return {
        ...normalizedPost,
        id: post.id,
      };
    },
    [localSeoStorage, multiFieldEditorFields, postFieldStates.focusKeyword.mapped],
  );
  const collectionAvailabilityByLabel = useMemo<Record<CollectionLabel, ProjectEditorCollectionAvailability>>(
    () =>
      collectionItems.reduce(
        (acc, item) => ({
          ...acc,
          [item.label]: getProjectEditorCollectionAvailability({
            canManageAuthorDirectory,
            collection: item.label,
            contentRuntime,
            isContentProject,
            workspaceState,
          }),
        }),
        {} as Record<CollectionLabel, ProjectEditorCollectionAvailability>,
      ),
    [canManageAuthorDirectory, contentRuntime, isContentProject, workspaceState],
  );
  const visibleCollectionItems = collectionItems.filter(
    (item) => collectionAvailabilityByLabel[item.label] !== "hidden",
  );
  const selectedCollectionAvailability = collectionAvailabilityByLabel[selectedCollection];
  const isSelectedCollectionVisible = selectedCollectionAvailability !== "hidden";
  const isSelectedCollectionMapped = selectedCollectionAvailability === "ready";
  const shouldForcePostsRouteSection =
    resolvedWorkspace &&
    routeSection !== "Posts" &&
    routeSection !== "Settings" &&
    collectionAvailabilityByLabel[routeSection] === "hidden";
  const sidebarCollectionItems: ProjectEditorSidebarCollectionSourceItem[] = resolvedWorkspace
    ? visibleCollectionItems.map((item) => ({
        ...item,
        status:
          collectionAvailabilityByLabel[item.label] === "ready"
            ? ("ready" as const)
            : ("unmapped" as const),
      }))
    : collectionItems
        .filter((item) => item.label === "Posts")
        .map((item) => ({
          ...item,
          status: "ready" as const,
        }));
  const showEditorToolbar = isPostEditorView && !isCurrentPostBlocked && !shouldShowPostRouteLoadingState;
  const {
    hasProjectSettingsChanges,
    isDeleteProjectConfirmationValid,
    nextProjectUrl,
    normalizedSettingsSlug,
  } = getProjectEditorSettingsState({
    currentProjectName,
    currentProjectSlug,
    currentProjectWebsiteUrl,
    deleteProjectConfirmation,
    settingsNameDraft,
    settingsSlugDraft,
    settingsWebsiteUrlDraft,
  });
  const normalizedPostsSearchQuery = normalizeContentPostsSearch(deferredPostsSearchQuery);
  const hasRoutePostInMemory = Boolean(
    routePostId &&
      posts.some((post) => post.id === routePostId && isContentPostEditorPayloadReady(post)),
  );
  const postsQueryCacheToken = getProjectEditorPostsQueryCacheToken({
    search: normalizedPostsSearchQuery,
    sort: postsSort,
    status: postsStatusFilter,
  });
  const previousPostsQueryCacheTokenRef = useRef(postsQueryCacheToken);
  const hasPostsQueryControlsActive =
    normalizedPostsSearchQuery.length > 0 ||
    postsStatusFilter !== DEFAULT_CONTENT_POSTS_QUERY.status ||
    postsSort !== DEFAULT_CONTENT_POSTS_QUERY.sort;
  const canOptimisticallySyncPostsList =
    normalizedPostsSearchQuery.length === 0 &&
    postsStatusFilter === DEFAULT_CONTENT_POSTS_QUERY.status &&
    postsSort === DEFAULT_CONTENT_POSTS_QUERY.sort;
  const hasPostSidebarConfigChanges = !areContentPostSidebarConfigsEqual(
    savedPostSidebarConfig,
    postSidebarConfigDraft,
  );
  const editorExtensions = useMemo(() => createContentRuntimeEditorExtensions(), []);
  const defaultMappingConfig = useMemo(() => createDefaultContentMappingConfig(), []);
  const [activeBodyEditor, setActiveBodyEditor] = useState<TiptapEditor | null>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  const activeEditorRef = useRef<TiptapEditor | null>(null);
  const multiFieldEditorsRef = useRef<Record<string, TiptapEditor | null>>({});
  const hasPostSidebarConfigChangesRef = useRef(hasPostSidebarConfigChanges);
  const hasSelectedPostRef = useRef(hasSelectedPost);
  const hasSelectedPostUnsavedChangesRef = useRef(hasSelectedPostUnsavedChanges);
  const isSavingRef = useRef(isSaving);
  const isPublishingRef = useRef(isPublishing);
  const linkPopoverSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const savePostShortcutRef = useRef<(() => void | Promise<void>) | null>(null);
  const slashCommandMatchRef = useRef<ProjectEditorSlashCommandMatch | null>(null);
  const filteredSlashCommandItemsRef = useRef<ProjectEditorSlashCommandItem[]>([]);
  const selectedSlashCommandIndexRef = useRef(0);
  const isPostRoute = Boolean(routePostId);
  const postsDetectedCandidate = mappingDetection?.candidates.posts?.[0] ?? null;
  const postsDetectedMapping =
    postsDetectedCandidate?.mapping ??
    mappingDetection?.suggestedMappingConfig.entities.posts ??
    defaultMappingConfig.entities.posts;

  const getCollectionRequestSignature = useCallback(
    (collection: CollectionLabel, page: number) =>
      collection === "Posts" ? `${collection}:${page}:${postsQueryCacheToken}` : `${collection}:${page}`,
    [postsQueryCacheToken],
  );

  useEffect(() => {
    collectionRequestSignatureRef.current = getCollectionRequestSignature(
      selectedCollection,
      currentCollectionPage,
    );
  }, [currentCollectionPage, getCollectionRequestSignature, selectedCollection]);

  function getComparablePostState(post: ContentPost): PostComparableState {
    return {
      authorId: post.authorId,
      categoryIds: post.categoryIds,
      contentFields: post.contentFields ?? {},
      contentFormat: post.contentFormat,
      contentHtml: post.contentHtml,
      contentJson: post.contentJson,
      contentMarkdown: post.contentMarkdown,
      customFields: post.customFields,
      excerpt: post.excerpt,
      focusKeyword: post.focusKeyword,
      featuredImageUrl: post.featuredImageUrl,
      parentPageId: post.parentPageId ?? null,
      publishedAt: post.publishedAt,
      redirects: post.redirects ?? [],
      seoDescription: post.seoDescription,
      seoTitle: post.seoTitle,
      slug: post.slug,
      status: post.status,
      tagIds: post.tagIds,
      title: post.title,
      updatedAt: post.updatedAt,
    };
  }

  const getPrimaryContentEditor = useCallback(() => {
    if (!isMultiFieldEditor) {
      return editorRef.current;
    }

    return (
      (primaryMultiFieldEditorId ? multiFieldEditorsRef.current[primaryMultiFieldEditorId] ?? null : null) ??
      activeEditorRef.current ??
      activeBodyEditor
    );
  }, [activeBodyEditor, isMultiFieldEditor, primaryMultiFieldEditorId]);

  const getActiveCommandEditor = useCallback(() => {
    if (!isMultiFieldEditor) {
      return editorRef.current;
    }

    return activeEditorRef.current ?? activeBodyEditor ?? getPrimaryContentEditor();
  }, [activeBodyEditor, getPrimaryContentEditor, isMultiFieldEditor]);

  const getEditorFieldId = useCallback(
    (currentEditor: TiptapEditor | null) => {
      if (!currentEditor || !isMultiFieldEditor) {
        return primaryMultiFieldEditorId;
      }

      for (const [fieldId, editorInstance] of Object.entries(multiFieldEditorsRef.current)) {
        if (editorInstance === currentEditor) {
          return fieldId;
        }
      }

      return primaryMultiFieldEditorId;
    },
    [isMultiFieldEditor, primaryMultiFieldEditorId],
  );

  const getCollectionCacheKey = useCallback((collection: CollectionLabel, page: number) => {
    const pageSize = collection === "Posts" ? postsPageSize : defaultPagination.pageSize;
    return projectEditorLocalCacheKeys.collectionSnapshot({
      collection,
      page,
      pageSize,
      postsQueryCacheToken: collection === "Posts" ? postsQueryCacheToken : undefined,
      projectId,
    });
  }, [projectId, postsQueryCacheToken]);

  const currentCollectionCacheKey = getCollectionCacheKey(selectedCollection, currentCollectionPage);
  const workspaceQuery = useProjectEditorWorkspaceQuery({
    initialData: initialWorkspacePayload,
    projectId,
  });
  const shouldQueryPostsPage =
    !loadingWorkspace &&
    canAccessContent &&
    !isSettingsView &&
    selectedCollection === "Posts" &&
    postContentView !== "editor";
  const postsPageQuery = useProjectEditorPostsPageQuery({
    cursor: currentPostsListCursor,
    enabled: shouldQueryPostsPage,
    page: currentPostsListPage,
    projectId,
    search: normalizedPostsSearchQuery,
    sort: postsSort,
    status: postsStatusFilter,
  });
  const shouldQueryPostsPresence =
    canAccessContent &&
    !isSettingsView &&
    selectedCollection === "Posts" &&
    (postContentView === "list" || (postContentView === "editor" && Boolean(routePostId)));
  const postsPresenceQuery = useProjectEditorPostsPresenceQuery({
    enabled: shouldQueryPostsPresence,
    projectId,
  });
  const shouldQuerySelectedPost =
    Boolean(routePostId) &&
    selectedCollection === "Posts" &&
    postContentView === "editor" &&
    !projectConnectionError;
  const selectedPostCoreQuery = useProjectEditorPostPayloadQuery({
    enabled: shouldQuerySelectedPost,
    includeEditorOptions: false,
    postId: routePostId,
    projectId,
  });
  const shouldQuerySelectedPostOptions =
    shouldQuerySelectedPost &&
    !postEditorOptionsReady &&
    ((selectedPostCoreQuery.data?.post?.id ?? null) === routePostId ||
      (selectedPost?.id ?? null) === routePostId);
  const selectedPostOptionsQuery = useProjectEditorPostPayloadQuery({
    enabled: shouldQuerySelectedPostOptions,
    includeEditorOptions: true,
    postId: routePostId,
    projectId,
  });
  const shouldQueryRemotePostAuthorOptions =
    shouldQuerySelectedPost &&
    hasProjectEditorRemoteRelationSearch({
      contentRuntime,
      fieldKey: "author",
    });
  const shouldQueryRemoteCategoryOptions =
    shouldQuerySelectedPost &&
    hasProjectEditorRemoteRelationSearch({
      contentRuntime,
      fieldKey: "categories",
    });
  const shouldQueryRemoteParentPageOptions =
    shouldQuerySelectedPost &&
    hasProjectEditorRemoteRelationSearch({
      contentRuntime,
      fieldKey: "parentPage",
    });
  const shouldQueryRemoteTagOptions =
    shouldQuerySelectedPost &&
    hasProjectEditorRemoteRelationSearch({
      contentRuntime,
      fieldKey: "tags",
    });
  const postAuthorRelationOptionsQuery = useProjectEditorRelationOptionsQuery({
    enabled: shouldQueryRemotePostAuthorOptions,
    fieldKey: "author",
    limit: relationOptionsRenderLimit,
    projectId,
    search: deferredPostAuthorsSearchQuery,
    selectedIds: selectedPost?.authorId ? [selectedPost.authorId] : [],
  });
  const postCategoryRelationOptionsQuery = useProjectEditorRelationOptionsQuery({
    enabled: shouldQueryRemoteCategoryOptions,
    fieldKey: "categories",
    limit: relationOptionsRenderLimit,
    projectId,
    search: deferredPostCategoriesSearchQuery,
    selectedIds: selectedPost?.categoryIds ?? [],
  });
  const postParentPageRelationOptionsQuery = useProjectEditorRelationOptionsQuery({
    enabled: shouldQueryRemoteParentPageOptions,
    fieldKey: "parentPage",
    limit: relationOptionsRenderLimit,
    projectId,
    search: deferredPostParentPageSearchQuery,
    selectedIds: selectedPost?.parentPageId ? [selectedPost.parentPageId] : [],
  });
  const postTagRelationOptionsQuery = useProjectEditorRelationOptionsQuery({
    enabled: shouldQueryRemoteTagOptions,
    fieldKey: "tags",
    limit: relationOptionsRenderLimit,
    projectId,
    search: deferredPostTagsSearchQuery,
    selectedIds: selectedPost?.tagIds ?? [],
  });
  const postRevisionsQuery = useProjectEditorPostRevisionsQuery({
    enabled: showPostRevisionsSheet && Boolean(selectedPost),
    postId: selectedPost?.id ?? null,
    projectId,
  });
  const displayedPostAuthorOptions = useMemo(
    () =>
      shouldQueryRemotePostAuthorOptions
        ? getProjectEditorAuthorOptionsFromRelationOptions({
            fallbackOptions: postAuthorOptions,
            relationOptions: postAuthorRelationOptionsQuery.data,
            selectedAuthorId: selectedPost?.authorId ?? null,
          })
        : postAuthorOptions,
    [
      postAuthorOptions,
      postAuthorRelationOptionsQuery.data,
      selectedPost?.authorId,
      shouldQueryRemotePostAuthorOptions,
    ],
  );
  const displayedCategoryOptions = useMemo(
    () =>
      shouldQueryRemoteCategoryOptions
        ? getProjectEditorCategoryOptionsFromRelationOptions({
            fallbackOptions: categoryOptions,
            relationOptions: postCategoryRelationOptionsQuery.data,
            selectedCategoryIds: selectedPost?.categoryIds ?? [],
          })
        : categoryOptions,
    [
      categoryOptions,
      postCategoryRelationOptionsQuery.data,
      selectedPost?.categoryIds,
      shouldQueryRemoteCategoryOptions,
    ],
  );
  const displayedParentPageOptions = useMemo(
    () =>
      shouldQueryRemoteParentPageOptions
        ? getProjectEditorParentPageOptionsFromRelationOptions({
            relationOptions: postParentPageRelationOptionsQuery.data,
            selectedParentPageId: selectedPost?.parentPageId ?? null,
            selectedPostId: selectedPost?.id ?? null,
          })
        : [],
    [
      postParentPageRelationOptionsQuery.data,
      selectedPost?.id,
      selectedPost?.parentPageId,
      shouldQueryRemoteParentPageOptions,
    ],
  );
  const displayedTagOptions = useMemo(
    () =>
      shouldQueryRemoteTagOptions
        ? getProjectEditorTagOptionsFromRelationOptions({
            fallbackOptions: tags,
            relationOptions: postTagRelationOptionsQuery.data,
            selectedTagIds: selectedPost?.tagIds ?? [],
          })
        : tags,
    [
      postTagRelationOptionsQuery.data,
      selectedPost?.tagIds,
      shouldQueryRemoteTagOptions,
      tags,
    ],
  );
  const hasCurrentCollectionSnapshot = resolvedCollectionCacheKeys.includes(currentCollectionCacheKey);
  const shouldShowInitialPostsListSkeleton = shouldShowUnresolvedPostsListSkeleton({
    hasResolvedCollectionSnapshot: hasCurrentCollectionSnapshot,
    postsPageDataReady: Boolean(postsPageQuery.data),
    postsPageLoadFailed: Boolean(postsPageQuery.error),
    shouldQueryPostsPage,
  });
  const showTopBarSpinner =
    loadingWorkspace ||
    refreshingWorkspace ||
    (workspaceState === "mapping_draft" && loadingMappingDetection) ||
    (isSelectedCollectionMapped &&
      (selectedCollection !== "Authors" &&
      (selectedCollection !== "Files" || !usesManagedFilesLibrary) &&
      (selectedCollection !== "Media" || !usesManagedMediaLibrary)) &&
      (refreshingCollection || (isLoadingCollection && !hasCurrentCollectionSnapshot))) ||
    (isPostsCollection && postContentView === "editor" && loadingSelectedPost);
  const topBarStatusLabel = getProjectEditorTopBarStatusLabel({
    externalPageLoading,
    selectedSidebarItem,
    showTopBarAutosaveStatus,
    showTopBarSpinner,
  });

  const {
    forgetDiscardableNewPostId,
    hasDiscardableNewPostId,
    readDiscardableNewPostIds,
    rememberDiscardableNewPostId,
  } = useDiscardableNewPosts(projectId);

  const displayedSelectedPostSlug = getDisplayedSelectedPostSlug(selectedPost);

  const {
    invalidateCollectionCache,
    invalidateWorkspaceCache,
    invalidateWorkspaceSummaryCache,
    prefetchPostPayloadQueryData,
    rememberResolvedCollectionSnapshot,
    removePostPayloadQueryData,
    syncPostPayloadQueryData,
    syncPostsPageQueryData,
    syncWorkspaceQueryData,
    syncWorkspaceSummaryQueryData,
  } = useProjectEditorQuerySync({
    normalizedPostsSearchQuery,
    postsSort,
    postsStatusFilter,
    projectId,
    queryClient,
    setResolvedCollectionCacheKeys,
  });

  const markPersistedPost = (post: ContentPost) => {
    markPostPersisted(post, {
      invalidatePostsCache: () => invalidateCollectionCache("Posts"),
    });
  };

  const mergePostListPreviewWithEditorPayload = useCallback(
    (previewPost: ContentPost, editorPost: ContentPost) => ({
      ...editorPost,
      authorId: previewPost.authorId,
      createdAt: previewPost.createdAt,
      editingSession: previewPost.editingSession ?? null,
      excerpt: previewPost.excerpt,
      publishedAt: previewPost.publishedAt,
      slug: previewPost.slug,
      status: previewPost.status,
      title: previewPost.title,
      updatedAt: previewPost.updatedAt,
    }),
    [],
  );

  const primePostEditorCache = ({
    post,
    postId,
  }: {
    post?: ContentPost | null;
    postId: string;
  }) => {
    const shellPostSource =
      (post && isContentPostEditorPayloadReady(post) ? post : null) ??
      (isContentPostEditorPayloadReady(draftPostsRef.current[postId]) ? draftPostsRef.current[postId] : null) ??
      (isContentPostEditorPayloadReady(persistedPostsRef.current[postId]) ? persistedPostsRef.current[postId] : null) ??
      (() => {
        const matchingPost = posts.find((entry) => entry.id === postId) ?? null;
        return isContentPostEditorPayloadReady(matchingPost) ? matchingPost : null;
      })();
    const shellPost = shellPostSource ? resolvePostSeoFallbacks(shellPostSource) : null;

    if (shellPost) {
      persistedPostsRef.current[postId] ??= shellPost;
      draftPostsRef.current[postId] ??= shellPost;
      syncPostPayloadQueryData({
        authors: postEditorOptionsReady ? postAuthorOptions : [],
        categories: postEditorOptionsReady ? categories : [],
        editorOptionsState: postEditorOptionsReady ? "full" : "warm",
        post: draftPostsRef.current[postId],
        tags: postEditorOptionsReady ? tags : [],
      } satisfies ContentPostEditorPayload);
    }
    return shellPost;
  };

  const syncLoadedEditorPost = useCallback(
    (post: ContentPost) => {
      const resolvedPost = resolvePostSeoFallbacks(post);
      const currentDraftPost = draftPostsRef.current[resolvedPost.id] ?? null;

      if (dirtyPostIdsRef.current.has(resolvedPost.id) && currentDraftPost) {
        persistedPostsRef.current[resolvedPost.id] = {
          ...resolvedPost,
          editingSession: resolvedPost.editingSession ?? null,
        };
        draftPostsRef.current[resolvedPost.id] = {
          ...currentDraftPost,
          editingSession: resolvedPost.editingSession ?? null,
        };
        return draftPostsRef.current[resolvedPost.id];
      }

      persistedPostsRef.current[resolvedPost.id] = resolvedPost;
      draftPostsRef.current[resolvedPost.id] = resolvedPost;
      return resolvedPost;
    },
    [dirtyPostIdsRef, draftPostsRef, persistedPostsRef, resolvePostSeoFallbacks],
  );

  const applySelectedPostPayload = useCallback(
    (payload: ContentPostEditorPayload) => {
      const resolvedPost = syncLoadedEditorPost(payload.post);
      const nextEditorOptionsState: ContentPostEditorPayload["editorOptionsState"] =
        postEditorOptionsReady ? "full" : "warm";
      const nextCachedPayload = hasFullContentEditorOptions(payload)
        ? {
            ...payload,
            post: resolvedPost,
          }
        : {
            authors: postEditorOptionsReady ? postAuthorOptions : payload.authors ?? [],
            categories: postEditorOptionsReady ? categories : payload.categories ?? [],
            editorOptionsState: nextEditorOptionsState,
            post: resolvedPost,
            tags: postEditorOptionsReady ? tags : payload.tags ?? [],
          };

      if (hasFullContentEditorOptions(payload) && !postEditorOptionsReady) {
        queryClient.setQueryData(
          projectEditorQueryKeys.post({
            includeEditorOptions: false,
            postId: payload.post.id,
            projectId,
          }),
          nextCachedPayload satisfies ContentPostEditorPayload,
        );
      }
      setPosts((currentPosts) => {
        if (currentPosts.some((post) => post.id === payload.post.id)) {
          return currentPosts.map((post) => (post.id === payload.post.id ? resolvedPost : post));
        }

        return [resolvedPost, ...currentPosts];
      });

      if (hasFullContentEditorOptions(nextCachedPayload)) {
        setPostAuthorOptions(nextCachedPayload.authors ?? []);
        setCategories(nextCachedPayload.categories ?? []);
        setCategoryOptions(nextCachedPayload.categories ?? []);
        setTags(nextCachedPayload.tags ?? []);
        setPostEditorOptionsReady(true);
      }

      setProjectConnectionError(null);
      setSelectedPostId(payload.post.id);
      setSelectedSidebarItem("Posts");
      setSelectedCollection("Posts");
      setPostContentView("editor");
      setShowSeoPanel(true);
      setSelectedPostLoadError(null);
      setLoadingSelectedPost(false);
      return resolvedPost;
    },
    [
      categories,
      postAuthorOptions,
      postEditorOptionsReady,
      projectId,
      queryClient,
      setLoadingSelectedPost,
      setPostContentView,
      setSelectedPostId,
      setSelectedPostLoadError,
      syncLoadedEditorPost,
      tags,
    ],
  );

  const applyPersistedPostUpdate = (post: ContentPost) => {
    const resolvedPost = resolvePostSeoFallbacks(post);
    forgetDiscardableNewPostId(resolvedPost.id);

    markPersistedPost(resolvedPost);
    syncPostPayloadQueryData({
      authors: postEditorOptionsReady ? postAuthorOptions : [],
      categories: postEditorOptionsReady ? categories : [],
      editorOptionsState: postEditorOptionsReady ? "full" : "warm",
      post: resolvedPost,
      tags: postEditorOptionsReady ? tags : [],
    } satisfies ContentPostEditorPayload);
    setPosts((currentPosts) =>
      currentPosts.map((currentPost) => (currentPost.id === resolvedPost.id ? resolvedPost : currentPost)),
    );
    void queryClient.invalidateQueries({
      exact: true,
      queryKey: projectEditorQueryKeys.postRevisions(projectId, resolvedPost.id),
    });
    invalidateCollectionCache("Posts");
    invalidateWorkspaceCache();

    if (resolvedPost.id === selectedPostIdRef.current) {
      setPostSlugDraft(resolvedPost.slug);
      setIsEditingPostSlug(false);
    }
  };

  const applyWorkspacePayload = useCallback((payload: WorkspacePayload) => {
    const nextPostSidebarConfig =
      payload.postSidebarConfig ?? createDefaultContentPostSidebarConfig();

    setWorkspaceState(resolveWorkspaceState(payload));
    setCanManageAuthorDirectory(payload.capabilities?.canManageAuthors ?? defaultCanManageAuthorDirectory);
    setCanManageTaxonomy(payload.capabilities?.canManageTaxonomy ?? defaultCanManageTaxonomy);
    const nextSummary =
      payload.workspaceSummary ??
      createDefaultWorkspaceSummaryState(payload.counts ?? defaultCollectionCounts);
    setCollectionCounts(nextSummary.counts);
    setWorkspaceSummary(nextSummary);
    setContentRuntime(payload.contentRuntime ?? null);
    setLoadingMessage(payload.message ?? null);
    setSavedPostSidebarConfig(nextPostSidebarConfig);
    setPostSidebarConfigDraft((currentDraft) =>
      hasPostSidebarConfigChangesRef.current ? currentDraft : nextPostSidebarConfig,
    );
    setProjectConnectionError(null);
    setResolvedWorkspace(true);
  }, [
    defaultCanManageAuthorDirectory,
    defaultCanManageTaxonomy,
    hasPostSidebarConfigChangesRef,
  ]);

  const applyWorkspaceSummaryPayload = useCallback((payload: WorkspaceSummaryPayload) => {
    setCollectionCounts(payload.counts ?? defaultCollectionCounts);
    setWorkspaceSummary(
      payload.counts
        ? {
            counts: payload.counts,
            isDerived: payload.isDerived ?? false,
            isExact: payload.isExact ?? false,
            pendingCollections: payload.pendingCollections ?? [],
            refreshedAt: payload.refreshedAt ?? null,
          }
        : createDefaultWorkspaceSummaryState(),
    );
  }, []);

  const applyPostsPagePayload = useCallback((payload: PostsPagePayload) => {
    const mergedPosts = (payload.posts ?? []).map((post) => {
      const resolvedPost = resolvePostSeoFallbacks(post);
      const persistedPost = persistedPostsRef.current[post.id] ?? null;
      const draftPost = draftPostsRef.current[post.id] ?? null;
      const incomingPostIsEditorReady = isContentPostEditorPayloadReady(resolvedPost);
      const persistedPostIsEditorReady = isContentPostEditorPayloadReady(persistedPost);
      const draftPostIsEditorReady = isContentPostEditorPayloadReady(draftPost);

      if (dirtyPostIdsRef.current.has(post.id) && draftPost) {
        const nextPersistedBase = persistedPost ?? resolvedPost;
        const nextPersistedPost = {
          ...nextPersistedBase,
          editingSession: resolvedPost.editingSession ?? null,
          updatedAt: resolvedPost.updatedAt,
        };
        const nextDraftPost = {
          ...draftPost,
          editingSession: resolvedPost.editingSession ?? null,
        };
        persistedPostsRef.current[post.id] = nextPersistedPost;
        draftPostsRef.current[post.id] = nextDraftPost;
        return nextDraftPost;
      }

      if (!incomingPostIsEditorReady && (draftPostIsEditorReady || persistedPostIsEditorReady)) {
        const nextEditorPost = mergePostListPreviewWithEditorPayload(
          resolvedPost,
          draftPostIsEditorReady ? (draftPost as ContentPost) : (persistedPost as ContentPost),
        );
        persistedPostsRef.current[post.id] = nextEditorPost;
        draftPostsRef.current[post.id] = nextEditorPost;
        return nextEditorPost;
      }

      if (!incomingPostIsEditorReady) {
        delete persistedPostsRef.current[post.id];
        delete draftPostsRef.current[post.id];
        return resolvedPost;
      }

      // Keep the client-side auto-slug flag until a manual save or slug save freezes it.
      persistedPostsRef.current[post.id] = resolvedPost;
      draftPostsRef.current[post.id] = resolvedPost;
      return resolvedPost;
    });

    setPosts(mergedPosts);
    setCollectionAccessNotices((currentNotices) => ({
      ...currentNotices,
      Posts: payload.accessNotice ?? null,
    }));
    setAuthors(payload.authors ?? []);
    setPostsListIndexState(payload.postsListIndexState ?? "ready");
    if (hasFullContentEditorOptions(payload)) {
      setPostAuthorOptions(payload.authors ?? []);
      setCategories(payload.categories ?? []);
      setCategoryOptions(payload.categories ?? []);
      setTags(payload.tags ?? []);
      setPostEditorOptionsReady(true);
    }
    setCollectionPagination(payload.pagination ?? defaultPagination);
    setPostsPageCursors((currentCursors) => {
      const pagination = payload.pagination;
      const nextPage = (pagination?.page ?? 1) + 1;
      const nextCursor = pagination?.nextCursor?.trim() ?? "";

      if (!nextCursor) {
        if (!currentCursors[nextPage]) {
          return currentCursors;
        }

        const remainingCursors = { ...currentCursors };
        delete remainingCursors[nextPage];
        return remainingCursors;
      }

      return currentCursors[nextPage] === nextCursor
        ? currentCursors
        : {
            ...currentCursors,
            [nextPage]: nextCursor,
          };
    });
    setCollectionPages((currentPages) =>
      currentPages.Posts === (payload.pagination?.page ?? 1)
        ? currentPages
        : {
            ...currentPages,
            Posts: payload.pagination?.page ?? 1,
          },
    );
    setSelectedPostId((currentSelectedPostId) => {
      if (!currentSelectedPostId) {
        return null;
      }

      // Keep the selected post ID if the post is in the fetched page or
      // there is an active edit session — a background presence refresh
      // should never discard the user's currently selected/editing post.
      if (
        (payload.posts ?? []).some((post) => post.id === currentSelectedPostId) ||
        activePostEditSessionPostIdRef.current === currentSelectedPostId
      ) {
        return currentSelectedPostId;
      }

      return null;
    });
  }, [
    activePostEditSessionPostIdRef,
    dirtyPostIdsRef,
    draftPostsRef,
    persistedPostsRef,
    mergePostListPreviewWithEditorPayload,
    setSelectedPostId,
    resolvePostSeoFallbacks,
  ]);

  const applyPostsPresencePayload = (payload: {
    sessions?: Array<{ editingSession: ContentPostEditingSession; postId: string }>;
  }) => {
    const editingSessionByPostId = new Map(
      (payload.sessions ?? []).map((session) => [session.postId, session.editingSession]),
    );

    setPosts((currentPosts) =>
      currentPosts.map((post) => {
        const nextEditingSession = editingSessionByPostId.get(post.id) ?? null;
        const currentEditingSession = post.editingSession ?? null;

        if (
          currentEditingSession?.userId === nextEditingSession?.userId &&
          currentEditingSession?.lastHeartbeatAt === nextEditingSession?.lastHeartbeatAt &&
          currentEditingSession?.postTitle === nextEditingSession?.postTitle
        ) {
          return post;
        }

        const nextPost = {
          ...post,
          editingSession: nextEditingSession,
        };

        if (persistedPostsRef.current[post.id]) {
          persistedPostsRef.current[post.id] = {
            ...persistedPostsRef.current[post.id],
            editingSession: nextEditingSession,
          };
        }

        if (draftPostsRef.current[post.id]) {
          draftPostsRef.current[post.id] = {
            ...draftPostsRef.current[post.id],
            editingSession: nextEditingSession,
          };
        }

        return nextPost;
      }),
    );
  };

  const applyCategoriesPagePayload = useCallback((payload: ContentCategoriesPage & { error?: string }) => {
    setCategories(payload.items ?? []);
    setCollectionAccessNotices((currentNotices) => ({
      ...currentNotices,
      Categories: payload.accessNotice ?? null,
    }));
    if (payload.allCategories) {
      setCategoryOptions(payload.allCategories);
    }
    setCollectionPagination(payload.pagination ?? defaultPagination);
    setCollectionPages((currentPages) =>
      currentPages.Categories === (payload.pagination?.page ?? 1)
        ? currentPages
        : {
            ...currentPages,
            Categories: payload.pagination?.page ?? 1,
          },
    );
  }, []);

  const applyTagsPagePayload = useCallback((payload: CollectionPagePayload<ContentTag>) => {
    setTags(payload.items ?? []);
    setCollectionAccessNotices((currentNotices) => ({
      ...currentNotices,
      Tags: payload.accessNotice ?? null,
    }));
    setCollectionPagination(payload.pagination ?? defaultPagination);
    setCollectionPages((currentPages) =>
      currentPages.Tags === (payload.pagination?.page ?? 1)
        ? currentPages
        : {
            ...currentPages,
            Tags: payload.pagination?.page ?? 1,
          },
    );
  }, []);

  const applyAuthorsPagePayload = useCallback((payload: CollectionPagePayload<ContentAuthor>) => {
    setAuthors(payload.items ?? []);
    setCollectionAccessNotices((currentNotices) => ({
      ...currentNotices,
      Authors: payload.accessNotice ?? null,
    }));
    setCollectionPagination(payload.pagination ?? defaultPagination);
    setCollectionPages((currentPages) =>
      currentPages.Authors === (payload.pagination?.page ?? 1)
        ? currentPages
        : {
            ...currentPages,
            Authors: payload.pagination?.page ?? 1,
          },
    );
  }, []);

  const applyMediaPagePayload = useCallback((payload: CollectionPagePayload<ContentMedia>) => {
    setMedia(payload.items ?? []);
    setCollectionPagination(payload.pagination ?? defaultPagination);
    setCollectionPages((currentPages) =>
      currentPages.Media === (payload.pagination?.page ?? 1)
        ? currentPages
        : {
            ...currentPages,
            Media: payload.pagination?.page ?? 1,
          },
    );
  }, []);

  const setPageForCollection = (collection: CollectionLabel, page: number) => {
    const nextPage = Math.max(1, page);

    setCollectionPages((currentPages) =>
      currentPages[collection] === nextPage
        ? currentPages
        : {
            ...currentPages,
            [collection]: nextPage,
          },
    );
  };

  const navigateToCollectionPage = (collection: CollectionLabel, page: number) => {
    const nextPage = Math.max(1, page);

    if (collection === "Posts") {
      const nextUrl = buildProjectUrl({ page: nextPage });

      if (nextUrl !== pathname) {
        setExternalPageLoading(true);
        router.push(nextUrl);
      }

      return;
    }

    setPageForCollection(collection, nextPage);
  };

  const loadWorkspaceMeta = useCallback(async (options?: { force?: boolean }) => {
    try {
      const payload = await queryClient.fetchQuery({
        ...getProjectEditorWorkspaceQueryOptions({
          projectId,
        }),
        ...(options?.force ? { staleTime: 0 } : {}),
      });
      syncWorkspaceQueryData(payload);
      applyWorkspacePayload(payload);
    } catch (error) {
      const message =
        getProductionErrorMessage(error, "Could not load this project.");
      if (isProjectConnectionErrorMessage(message)) {
        setProjectConnectionError(message);
        setLoadingMessage(message);
      }
      if (options?.force ?? false) {
        toast.error(message);
      }
    }
  }, [applyWorkspacePayload, projectId, queryClient, syncWorkspaceQueryData]);

  const workspaceSummaryRefreshAttemptedAtRef = useRef(0);

  const loadWorkspaceSummary = useCallback(async () => {
    try {
      const payload = await queryClient.fetchQuery({
        ...getProjectEditorWorkspaceSummaryQueryOptions({
          projectId,
        }),
        staleTime: 0,
      });

      applyWorkspaceSummaryPayload(payload);
      setProjectConnectionError(null);

      const cachedWorkspacePayload = queryClient.getQueryData<WorkspacePayload>(
        projectEditorQueryKeys.workspace(projectId),
      );
      syncWorkspaceQueryData({
        ...(cachedWorkspacePayload ?? {
          capabilities: {
            canManageAuthors: canManageAuthorDirectory,
            canManageTaxonomy,
          },
          counts: payload.counts,
          contentRuntime,
          message: loadingMessage ?? undefined,
          postSidebarConfig: savedPostSidebarConfig,
          primaryContentFormat: initialWorkspacePayload?.primaryContentFormat ?? "html",
          workspaceState: workspaceState ?? "ready",
          workspaceSummary: payload,
        }),
        counts: payload.counts,
        workspaceSummary: payload,
      } satisfies WorkspacePayload);
    } catch (error) {
      const message =
        getProductionErrorMessage(error, "Could not refresh workspace counts right now.");
      if (isProjectConnectionErrorMessage(message)) {
        setProjectConnectionError(message);
      }
    }
  }, [
    applyWorkspaceSummaryPayload,
    canManageAuthorDirectory,
    canManageTaxonomy,
    contentRuntime,
    initialWorkspacePayload?.primaryContentFormat,
    loadingMessage,
    projectId,
    queryClient,
    savedPostSidebarConfig,
    syncWorkspaceQueryData,
    workspaceState,
  ]);

  const refreshWorkspaceSummaryForManagedCollection = useCallback(async (
    collection: Extract<ContentCollection, "files" | "media">,
  ) => {
    syncWorkspaceSummaryQueryData({
      ...workspaceSummary,
      isExact: false,
      pendingCollections: workspaceSummary.pendingCollections.includes(collection)
        ? workspaceSummary.pendingCollections
        : [...workspaceSummary.pendingCollections, collection],
    });
    setWorkspaceSummary((currentSummary) => ({
      ...currentSummary,
      isExact: false,
      pendingCollections: currentSummary.pendingCollections.includes(collection)
        ? currentSummary.pendingCollections
        : [...currentSummary.pendingCollections, collection],
    }));
    void loadWorkspaceSummary();
  }, [loadWorkspaceSummary, syncWorkspaceSummaryQueryData, workspaceSummary]);

  const loadCollectionData = useCallback(async (
    collection: CollectionLabel,
    page: number,
    options?: { force?: boolean },
  ) => {
    if (collection === "Posts") {
      try {
        const payload = await queryClient.fetchQuery({
          ...getProjectEditorPostsPageQueryOptions({
            page,
            projectId,
            search: normalizedPostsSearchQuery,
            sort: postsSort,
            status: postsStatusFilter,
          }),
          ...(options?.force ? { staleTime: 0 } : {}),
        });

        syncPostsPageQueryData(page, payload);
        applyPostsPagePayload(payload);
        rememberResolvedCollectionSnapshot(getCollectionCacheKey(collection, page));
        setProjectConnectionError(null);
      } catch (error) {
        const message =
          getProductionErrorMessage(error, "Could not load this collection right now.");
        if (isProjectConnectionErrorMessage(message)) {
          setProjectConnectionError(message);
        }
        if (options?.force ?? false) {
          toast.error(message);
        }
      } finally {
        setLoadingCollection(false);
        setRefreshingCollection(false);
      }
      return;
    }

    const cacheKey = getCollectionCacheKey(collection, page);
    const requestSignature = getCollectionRequestSignature(collection, page);
    const force = options?.force ?? false;

    const isCurrentRequest = () => collectionRequestSignatureRef.current === requestSignature;

    let usedCachedPayload = false;

    if (!force) {
      if (collection === "Categories") {
        const cachedPayload = queryClient.getQueryData<ContentCategoriesPage>(
          projectEditorQueryKeys.categoriesPage({
            page,
            pageSize: defaultPagination.pageSize,
            projectId,
          }),
        );

        if (cachedPayload) {
          applyCategoriesPagePayload(cachedPayload);
          rememberResolvedCollectionSnapshot(cacheKey);
          usedCachedPayload = true;
        }
      } else if (collection === "Tags") {
        const cachedPayload = queryClient.getQueryData<CollectionPagePayload<ContentTag>>(
          projectEditorQueryKeys.tagsPage({
            page,
            pageSize: defaultPagination.pageSize,
            projectId,
          }),
        );

        if (cachedPayload) {
          applyTagsPagePayload(cachedPayload);
          rememberResolvedCollectionSnapshot(cacheKey);
          usedCachedPayload = true;
        }
      } else if (collection === "Authors") {
        const cachedPayload = queryClient.getQueryData<CollectionPagePayload<ContentAuthor>>(
          projectEditorQueryKeys.authorsPage({
            page,
            pageSize: defaultPagination.pageSize,
            projectId,
          }),
        );

        if (cachedPayload) {
          applyAuthorsPagePayload(cachedPayload);
          rememberResolvedCollectionSnapshot(cacheKey);
          usedCachedPayload = true;
        }
      }
    }

    setLoadingCollection(!usedCachedPayload);
    setRefreshingCollection(false);

    try {
      const pageSize = defaultPagination.pageSize;

      if (collection === "Categories") {
        const payload = await queryClient.fetchQuery({
          ...getProjectEditorCategoriesPageQueryOptions({
            page,
            pageSize,
            projectId,
          }),
          ...(force ? { staleTime: 0 } : {}),
        });

        if (!isCurrentRequest()) {
          return;
        }

        setProjectConnectionError(null);
        applyCategoriesPagePayload(payload);
        rememberResolvedCollectionSnapshot(cacheKey);
        return;
      }

      if (collection === "Tags") {
        const payload = await queryClient.fetchQuery({
          ...getProjectEditorTagsPageQueryOptions({
            page,
            pageSize,
            projectId,
          }),
          ...(force ? { staleTime: 0 } : {}),
        });

        if (!isCurrentRequest()) {
          return;
        }

        setProjectConnectionError(null);
        applyTagsPagePayload(payload);
        rememberResolvedCollectionSnapshot(cacheKey);
        return;
      }

      if (collection === "Authors") {
        const payload = await queryClient.fetchQuery({
          ...getProjectEditorAuthorsPageQueryOptions({
            page,
            pageSize,
            projectId,
          }),
          ...(force ? { staleTime: 0 } : {}),
        });

        if (!isCurrentRequest()) {
          return;
        }

        setProjectConnectionError(null);
        applyAuthorsPagePayload(payload);
        rememberResolvedCollectionSnapshot(cacheKey);
        return;
      }

      const payload = await fetchProjectEditorContentCollectionPage<ContentMedia>({
        page,
        pageSize,
        projectId,
        view: collection.toLowerCase(),
      });

      if (!isCurrentRequest()) {
        return;
      }

      setProjectConnectionError(null);
      applyMediaPagePayload(payload);
      rememberResolvedCollectionSnapshot(cacheKey);
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }

      const message =
        getProductionErrorMessage(error, "Could not load this collection right now.");
      if (isProjectConnectionErrorMessage(message)) {
        setProjectConnectionError(message);
      }
      if (!usedCachedPayload) {
        toast.error(message);
      }
    } finally {
      setLoadingCollection(false);
      setRefreshingCollection(false);
    }
  }, [
    applyAuthorsPagePayload,
    applyCategoriesPagePayload,
    applyMediaPagePayload,
    applyPostsPagePayload,
    applyTagsPagePayload,
    getCollectionCacheKey,
    getCollectionRequestSignature,
    normalizedPostsSearchQuery,
    postsSort,
    postsStatusFilter,
    projectId,
    queryClient,
    rememberResolvedCollectionSnapshot,
    syncPostsPageQueryData,
  ]);

  const clearSavedMappingValues = useCallback(() => {
    setSettingsSavedFilesStorage(null);
    setSettingsSavedMappingConfig(null);
    setSettingsSavedPostsEntity(null);
    setSettingsSavedMediaStorage(null);
  }, []);

  const applySavedMappingPayload = useCallback((mappingPayload: ProjectEditorSavedMappingPayload) => {
      const savedMappingState = buildProjectEditorSavedMappingPayloadState(mappingPayload);

      setSettingsSavedMappingConfig(savedMappingState.mappingConfig);
      setSettingsAvailableSupabaseBuckets(savedMappingState.availableSupabaseBuckets);
      setSettingsSavedPostsEntity(savedMappingState.postsEntity);
      setSettingsSavedFilesStorage(savedMappingState.filesStorage);
      setSettingsSavedMediaStorage(savedMappingState.mediaStorage);
    },
    [],
  );

  const getMappingScopeForCollection = useCallback(
    (collection: CollectionLabel): ContentMappingSaveScope =>
      collection === "Posts"
        ? "posts"
        : collection === "Authors"
          ? "authors"
          : collection === "Categories"
            ? "categories"
            : collection === "Tags"
              ? "tags"
              : collection === "Media"
                ? "media"
                : "files",
    [],
  );

  const savePostsMapping = useCallback(
    async ({
      mappingConfig,
    }: {
      mappingConfig: ContentMappingConfig;
    }) => {
      const nextCollection = mappingDialogEntryCollection;
      const nextMappingScope = getMappingScopeForCollection(mappingDialogEntryCollection);
      const nextBindingStatus =
        workspaceState === "mapping_draft" &&
        (mappingDialogEntryCollection === "Media" || mappingDialogEntryCollection === "Files")
          ? "draft"
          : "ready";
      setSavingPostsMapping(true);

      try {
        await runProjectEditorContentAction({
          action: {
            action: "save_mapping_config",
            bindingStatus: nextBindingStatus,
            mappingConfig,
            mappingScope: nextMappingScope,
            source: "manual",
          },
          fallbackMessage: "Could not save the mapping right now.",
          projectId,
        });

        invalidateWorkspaceCache();
        invalidateCollectionCache();

        await closePostEditorSession();

        setPosts([]);
        setAuthors([]);
        setPostAuthorOptions([]);
        setPostEditorOptionsReady(false);
        setCategories([]);
        setCategoryOptions([]);
        setTags([]);
        setMedia([]);
        setCollectionCounts(defaultCollectionCounts);
        setWorkspaceSummary(createDefaultWorkspaceSummaryState());
        setCollectionPages(defaultCollectionPages);
        setCollectionPagination(defaultPagination);
        draftPostsRef.current = {};
        persistedPostsRef.current = {};
        setPostRevisions([]);
        setPostsSearchQuery(DEFAULT_CONTENT_POSTS_QUERY.search);
        setPostsStatusFilter(DEFAULT_CONTENT_POSTS_QUERY.status);
        setPostsSort(DEFAULT_CONTENT_POSTS_QUERY.sort);

        await loadWorkspaceMeta({ force: true });
        setPostsMappingStepIndex(0);
        setHasMountedPostsMappingWorkspace(false);
        setShowPostsMappingDialog(false);
        setSavedMappingError(null);
        setLoadingSavedMapping(false);
        setLoadingSettingsMappingCollection(null);
        clearSavedMappingValues();

        setSelectedSidebarItem(nextCollection);
        setSelectedCollection(nextCollection);
        setSelectedPostId(null);
        setPostContentView("list");
        setPostSidePanelView("details");
        setShowSeoPanel(nextCollection === "Categories" || nextCollection === "Tags");

        if (nextCollection === "Posts") {
          await loadCollectionData("Posts", 1, { force: true });
        }

        toast.success("Mapping saved.");
      } catch (error) {
        toast.error(getProductionErrorMessage(error, "Could not save the mapping right now."));
      } finally {
        setSavingPostsMapping(false);
      }
    },
    [
      clearSavedMappingValues,
      closePostEditorSession,
      draftPostsRef,
      invalidateCollectionCache,
      invalidateWorkspaceCache,
      loadCollectionData,
      loadWorkspaceMeta,
      mappingDialogEntryCollection,
      getMappingScopeForCollection,
      persistedPostsRef,
      projectId,
      setHasMountedPostsMappingWorkspace,
      setPostContentView,
      setPostsMappingStepIndex,
      setSavingPostsMapping,
      setSelectedPostId,
      setShowPostsMappingDialog,
      workspaceState,
    ],
  );

  const handleUnmapSettingsMapping = useCallback(
    async (target: CollectionLabel | "all") => {
      setSettingsMappingError(null);
      setUnmappingSettingsTarget(target);

      try {
        let nextMappingConfig = createDefaultContentMappingConfig();

        if (target === "all") {
          nextMappingConfig = createUnmappedContentMappingConfig({
            mappingConfig: createDefaultContentMappingConfig(),
            target: "all",
          });
        } else {
          const mappingPayload = await fetchProjectEditorStoredMapping(projectId);

          nextMappingConfig = createUnmappedContentMappingConfig({
            mappingConfig: mappingPayload.mappingConfig,
            target: getMappingScopeForCollection(target),
          });
        }

        await runProjectEditorContentAction({
          action: {
            action: "save_mapping_config",
            bindingStatus: nextMappingConfig.entities.posts.status === "unmapped" ? "draft" : "ready",
            mappingConfig: nextMappingConfig,
            mappingScope: target === "all" ? "full" : getMappingScopeForCollection(target),
            source: "manual",
          },
          fallbackMessage: "Could not update the mapping right now.",
          projectId,
        });

        invalidateWorkspaceCache();
        invalidateCollectionCache();
        clearSavedMappingValues();
        setLoadingSavedMapping(false);
        setLoadingSettingsMappingCollection(null);
        await loadWorkspaceMeta({ force: true });

        toast.success(
          target === "all" ? "All mapping sections were unmapped." : `${target} mapping was unmapped.`,
        );
      } catch (error) {
        const message = getProductionErrorMessage(error, "Could not update the mapping right now.");
        setSettingsMappingError(message);
        toast.error(message);
        throw error;
      } finally {
        setUnmappingSettingsTarget(null);
      }
    },
    [
      clearSavedMappingValues,
      getMappingScopeForCollection,
      invalidateCollectionCache,
      invalidateWorkspaceCache,
      loadWorkspaceMeta,
      projectId,
    ],
  );

  async function refreshPostsPresence() {
    if (!canAccessContent) {
      return;
    }

    try {
      const result = await postsPresenceQuery.refetch();
      const payload = result.data;

      if (!payload) {
        throw result.error ?? new Error("Could not refresh post activity right now.");
      }

      setProjectConnectionError(null);
      applyPostsPresencePayload(payload);
    } catch (error) {
      const message =
        getProductionErrorMessage(error, "Could not refresh post activity right now.");
      if (isProjectConnectionErrorMessage(message)) {
        setProjectConnectionError(message);
      }
      return;
    }
  }

  useEffect(() => {
    setLoadingWorkspace(workspaceQuery.isPending && !workspaceQuery.data);
    setRefreshingWorkspace(workspaceQuery.isFetching && Boolean(workspaceQuery.data));
  }, [workspaceQuery.data, workspaceQuery.isFetching, workspaceQuery.isPending]);

  useEffect(() => {
    if (!workspaceQuery.data) {
      return;
    }

    applyWorkspacePayload(workspaceQuery.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceQuery.data]);

  useEffect(() => {
    const message = workspaceQuery.error?.message;

    if (!message) {
      return;
    }

    if (isProjectConnectionErrorMessage(message)) {
      setProjectConnectionError(message);
      setLoadingMessage(message);
    }

    if (!workspaceQuery.data) {
      setLoadingMessage(message);
      toast.error(message);
    }
  }, [workspaceQuery.data, workspaceQuery.error?.message]);

  useEffect(() => {
    if (!shouldQueryPostsPage) {
      return;
    }

    setLoadingCollection(postsPageQuery.isPending && !postsPageQuery.data);
    setRefreshingCollection(postsPageQuery.isFetching && Boolean(postsPageQuery.data));
  }, [
    postsPageQuery.data,
    postsPageQuery.isFetching,
    postsPageQuery.isPending,
    shouldQueryPostsPage,
  ]);

  useEffect(() => {
    if (!postsPageQuery.data || !shouldQueryPostsPage) {
      return;
    }

    setProjectConnectionError(null);
    applyPostsPagePayload(postsPageQuery.data);
    rememberResolvedCollectionSnapshot(getCollectionCacheKey("Posts", currentPostsListPage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPostsListPage,
    getCollectionCacheKey,
    postsPageQuery.data,
    rememberResolvedCollectionSnapshot,
    shouldQueryPostsPage,
  ]);

  useEffect(() => {
    const message = postsPageQuery.error?.message;

    if (!message || !shouldQueryPostsPage) {
      return;
    }

    if (isProjectConnectionErrorMessage(message)) {
      setProjectConnectionError(message);
    }

    if (!postsPageQuery.data) {
      toast.error(message);
    }
  }, [postsPageQuery.data, postsPageQuery.error?.message, shouldQueryPostsPage]);

  useEffect(() => {
    if (!postsPresenceQuery.data || !shouldQueryPostsPresence) {
      return;
    }

    setProjectConnectionError(null);
    applyPostsPresencePayload(postsPresenceQuery.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postsPresenceQuery.data, shouldQueryPostsPresence]);

  useEffect(() => {
    const message = postsPresenceQuery.error?.message;

    if (!message || !shouldQueryPostsPresence) {
      return;
    }

    if (isProjectConnectionErrorMessage(message)) {
      setProjectConnectionError(message);
    }
  }, [postsPresenceQuery.error?.message, shouldQueryPostsPresence]);

  useEffect(() => {
    if (!canAccessContent || !resolvedWorkspace) {
      return;
    }

    const hasPendingCollections = workspaceSummary.pendingCollections.length > 0;
    const refreshedAtTimestamp = workspaceSummary.refreshedAt
      ? Date.parse(workspaceSummary.refreshedAt)
      : Number.NaN;
    const isStaleSummary =
      !Number.isFinite(refreshedAtTimestamp) ||
      Date.now() - refreshedAtTimestamp > WORKSPACE_SUMMARY_REFRESH_INTERVAL_MS;

    if (!hasPendingCollections && !isStaleSummary) {
      return;
    }

    if (Date.now() - workspaceSummaryRefreshAttemptedAtRef.current < 5_000) {
      return;
    }

    workspaceSummaryRefreshAttemptedAtRef.current = Date.now();
    void loadWorkspaceSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canAccessContent,
    resolvedWorkspace,
    workspaceSummary.pendingCollections,
    workspaceSummary.refreshedAt,
  ]);

  useEffect(() => {
    setExternalPageLoading(false);
  }, [pathname, searchParamsString]);

  useEffect(() => {
    if (!canUpdateProject) {
      resetMappingDetectionState();
      return;
    }

    if (!showPostsMappingDialog) {
      setLoadingMappingDetection(false);
      return;
    }

    if (mappingDetectionMode !== "auto") {
      setLoadingMappingDetection(false);
      return;
    }

    if (mappingDetection && !mappingDetectionError && !mappingSelectedTableRef) {
      setLoadingMappingDetection(false);
      return;
    }

    let cancelled = false;

    const loadMappingDetection = async () => {
      setLoadingMappingDetection(true);
      setMappingDetectionError(null);

      try {
        const payload = await fetchProjectEditorMappingDetection(projectId);

        if (cancelled) {
          return;
        }

        setMappingDetection(payload);
        setMappingSelectedTableRef(null);
        setMappingManualTableRef((currentValue) => {
          if (currentValue.trim()) {
            return currentValue;
          }

          const source = payload.suggestedMappingConfig.entities.posts.source;
          return source.schema && source.table ? `${source.schema}.${source.table}` : currentValue;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          getProductionErrorMessage(error, "Could not load the detected mapping right now.");
        setMappingDetection(null);
        setMappingDetectionError(message);
        setMappingDetectionMode("manual");
      } finally {
        if (!cancelled) {
          setLoadingMappingDetection(false);
        }
      }
    };

    void loadMappingDetection();

    return () => {
      cancelled = true;
    };
  }, [
    canUpdateProject,
    mappingDetection,
    mappingDetectionError,
    mappingDetectionMode,
    mappingSelectedTableRef,
    projectId,
    resetMappingDetectionState,
    setLoadingMappingDetection,
    setMappingDetection,
    setMappingDetectionError,
    setMappingDetectionMode,
    setMappingManualTableRef,
    setMappingSelectedTableRef,
    showPostsMappingDialog,
  ]);

  const loadMappingTableCatalog = useCallback(async (options: { refresh?: boolean } = {}) => {
    setLoadingMappingTableCatalog(true);
    setMappingTableCatalogError(null);

    try {
      const payload = await fetchProjectEditorMappingTableCatalog(projectId, options);
      setMappingTableCatalog(payload);
    } catch (error) {
      setMappingTableCatalog([]);
      setMappingTableCatalogError(
        getProductionErrorMessage(error, "Could not load the available tables right now."),
      );
    } finally {
      setLoadingMappingTableCatalog(false);
    }
  }, [
    projectId,
    setLoadingMappingTableCatalog,
    setMappingTableCatalog,
    setMappingTableCatalogError,
  ]);

  useEffect(() => {
    if (loadingWorkspace) {
      return;
    }

    if (!canAccessContent) {
      setLoadingCollection(false);
      setRefreshingCollection(false);
      return;
    }

    if (!isSelectedCollectionMapped) {
      setLoadingCollection(false);
      setRefreshingCollection(false);
      return;
    }

    if (
      selectedCollection === "Authors" ||
      selectedCollection === "Files" ||
      selectedCollection === "Media"
    ) {
      setLoadingCollection(false);
      setRefreshingCollection(false);
      return;
    }

    if (selectedCollection === "Posts") {
      setLoadingCollection(false);
      setRefreshingCollection(false);
      return;
    }

    void loadCollectionData(selectedCollection, currentCollectionPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectId,
    selectedCollection,
    currentCollectionPage,
    loadingWorkspace,
    canAccessContent,
    isSelectedCollectionMapped,
    collectionReloadToken,
  ]);

  useEffect(() => {
    if (selectedCollection !== "Posts") {
      previousPostsQueryCacheTokenRef.current = postsQueryCacheToken;
      return;
    }

    if (routePostId || postContentView !== "list") {
      previousPostsQueryCacheTokenRef.current = postsQueryCacheToken;
      return;
    }

    if (previousPostsQueryCacheTokenRef.current === postsQueryCacheToken) {
      return;
    }

    previousPostsQueryCacheTokenRef.current = postsQueryCacheToken;
    setPostsPageCursors({});

    setCollectionPages((currentPages) =>
      currentPages.Posts === 1
        ? currentPages
        : {
            ...currentPages,
            Posts: 1,
          },
    );

    if ((routePostsPage ?? 1) > 1) {
      setExternalPageLoading(true);
      router.replace(`/projects/${currentProjectSlug}/posts`);
    }
  }, [currentProjectSlug, postContentView, postsQueryCacheToken, routePostId, routePostsPage, router, selectedCollection]);

  useEffect(() => {
    if (!routePostId || selectedCollection !== "Posts" || postContentView !== "editor") {
      setLoadingSelectedPost(false);
      setSelectedPostLoadError(null);
      return;
    }

    if (
      isSelectedPostEditorHydrated({
        post: selectedPost,
        postEditorOptionsReady,
        routePostId,
      })
    ) {
      setLoadingSelectedPost(false);
      setSelectedPostLoadError(null);
      return;
    }

    if (
      shouldApplySelectedPostEditorOptionsPayload({
        payloadEditorOptionsReady:
          selectedPostOptionsQuery.data
            ? hasFullContentEditorOptions(selectedPostOptionsQuery.data)
            : false,
        payloadPostId: selectedPostOptionsQuery.data?.post?.id,
        post: selectedPost,
        postEditorOptionsReady,
        routePostId,
      })
    ) {
      applySelectedPostPayload(selectedPostOptionsQuery.data as ContentPostEditorPayload);
      return;
    }

    if (selectedPost?.id === routePostId && isContentPostEditorPayloadReady(selectedPost)) {
      setLoadingSelectedPost(false);
      setSelectedPostLoadError(null);
      return;
    }

    if (selectedPostOptionsQuery.data?.post?.id === routePostId) {
      applySelectedPostPayload(selectedPostOptionsQuery.data);
      return;
    }

    if (selectedPostCoreQuery.data?.post?.id === routePostId) {
      applySelectedPostPayload(selectedPostCoreQuery.data);
      return;
    }

    setLoadingSelectedPost(
      !selectedPostCoreQuery.data &&
        !selectedPostCoreQuery.error &&
        (selectedPostCoreQuery.isPending || (loadingWorkspace && !canAccessContent)),
    );
    setSelectedPostLoadError(null);
  }, [
    applySelectedPostPayload,
    canAccessContent,
    loadingWorkspace,
    postContentView,
    postEditorOptionsReady,
    routePostId,
    selectedCollection,
    selectedPost,
    selectedPostCoreQuery.data,
    selectedPostCoreQuery.error,
    selectedPostCoreQuery.isPending,
    selectedPostOptionsQuery.data,
    setLoadingSelectedPost,
    setSelectedPostLoadError,
  ]);

  useEffect(() => {
    if (!routePostId || selectedCollection !== "Posts" || postContentView !== "editor") {
      return;
    }

    const message = selectedPostCoreQuery.error?.message;

    if (!message || selectedPostCoreQuery.data) {
      return;
    }

    if (isProjectConnectionErrorMessage(message)) {
      setProjectConnectionError(message);
    }

    setSelectedPostLoadError(message);
    setLoadingSelectedPost(false);
  }, [
    postContentView,
    routePostId,
    selectedCollection,
    selectedPostCoreQuery.data,
    selectedPostCoreQuery.error?.message,
    setLoadingSelectedPost,
    setSelectedPostLoadError,
  ]);

  useEffect(() => {
    if (!routePostId || selectedCollection !== "Posts" || postContentView !== "editor") {
      return;
    }

    const message = selectedPostOptionsQuery.error?.message;

    if (!message || selectedPostOptionsQuery.data || !selectedPostCoreQuery.data) {
      return;
    }

    if (isProjectConnectionErrorMessage(message)) {
      setProjectConnectionError(message);
    }
  }, [
    postContentView,
    routePostId,
    selectedCollection,
    selectedPostCoreQuery.data,
    selectedPostOptionsQuery.data,
    selectedPostOptionsQuery.error?.message,
  ]);

  useEffect(() => {
    setSelectedPostIds((currentIds) =>
      currentIds.filter((id) => posts.some((post) => post.id === id && post.canWrite !== false)),
    );
  }, [posts]);

  useEffect(() => {
    setSelectedCategoryIds((currentIds) =>
      currentIds.filter((id) => categories.some((category) => category.id === id)),
    );
  }, [categories]);

  useEffect(() => {
    setSelectedTagIds((currentIds) => currentIds.filter((id) => tags.some((tag) => tag.id === id)));
  }, [tags]);

  useEffect(() => {
    if (selectedCollection === "Categories" || selectedCollection === "Tags") {
      setShowSeoPanel(true);
    }
  }, [selectedCollection]);

  useEffect(() => {
    setSelectedPostIds([]);
    setSelectedCategoryIds([]);
    setSelectedTagIds([]);
  }, [selectedCollection, currentCollectionPage]);

  useEffect(() => {
    setIsEditingPostSlug(false);
  }, [selectedPost?.id, setIsEditingPostSlug]);

  useEffect(() => {
    setPostAuthorsSearchQuery("");
    setPostCategoriesSearchQuery("");
    setPostParentPageSearchQuery("");
    setPostTagsSearchQuery("");
  }, [selectedPost?.id]);

  useEffect(() => {
    setPostSidePanelView("details");
  }, [selectedCollection, selectedPost?.id]);

  useEffect(() => {
    setShowPostRevisionsSheet(false);
    setLoadingPostRevisions(false);
    setPostRevisions([]);
    setPostRevisionsLoadError(null);
    setPendingRevisionRestore(null);
    setRestoringRevisionNumber(null);
  }, [selectedPost?.id]);

  useEffect(() => {
    if (!showPostRevisionsSheet || !selectedPost) {
      return;
    }

    setLoadingPostRevisions(postRevisionsQuery.isPending && !postRevisionsQuery.data);
    setPostRevisionsLoadError(null);

    if (postRevisionsQuery.data && selectedPostIdRef.current === selectedPost.id) {
      setPostRevisions(postRevisionsQuery.data.revisions ?? []);
      setLoadingPostRevisions(false);
    }
  }, [
    postRevisionsQuery.data,
    postRevisionsQuery.isPending,
    selectedPost,
    selectedPostIdRef,
    showPostRevisionsSheet,
  ]);

  useEffect(() => {
    if (!showPostRevisionsSheet || !selectedPost) {
      return;
    }

    const message = postRevisionsQuery.error?.message;

    if (!message || postRevisionsQuery.data || selectedPostIdRef.current !== selectedPost.id) {
      return;
    }

    setPostRevisions([]);
    setPostRevisionsLoadError(message);
    setLoadingPostRevisions(false);
  }, [
    postRevisionsQuery.data,
    postRevisionsQuery.error?.message,
    selectedPost,
    selectedPostIdRef,
    showPostRevisionsSheet,
  ]);

  useEffect(() => {
    if (
      shouldFallbackPendingPostEditorToList({
        postContentView,
        routePostId,
        selectedCollection,
        selectedPostId,
        selectedPostResolved: Boolean(selectedPost),
      })
    ) {
      setPostContentView("list");
    }
  }, [postContentView, routePostId, selectedCollection, selectedPost, selectedPostId, setPostContentView]);

  useEffect(() => {
    if (!isEditingPostSlug) {
      setPostSlugDraft(selectedPost?.slug ?? "");
    }
  }, [isEditingPostSlug, selectedPost?.slug, setPostSlugDraft]);

  const persistPost = async (
    post: ContentPost,
    action: "update_post" | "publish_post" | "archive_post" | "unpublish_post" = "update_post",
  ) => {
    const savePayloadFields = buildProjectEditorPostSavePayloadFields({
      action,
      currentPost: post,
      persistedPost: persistedPostsRef.current[post.id] ?? null,
      primaryMultiFieldEditorId,
    });
    const {
      ok,
      payload,
      status,
    } = await requestProjectEditorContentAction<UpdatePostResponse>({
      action: {
        action,
        postId: post.id,
        expectedUpdatedAt: (persistedPostsRef.current[post.id] ?? post).updatedAt,
        expectedVersion: (persistedPostsRef.current[post.id] ?? post).versionToken,
        ...savePayloadFields,
      },
      projectId,
    });

    if (!ok || !payload.post) {
      const message =
        payload.error ??
        (action === "publish_post"
          ? "Could not publish the post right now."
          : action === "archive_post"
            ? "Could not archive the post right now."
            : action === "unpublish_post"
              ? "Could not move the post back to draft right now."
              : "Could not save the post right now.");

      if (isRecoverablePostSessionError(message)) {
        await resolvePostEditConflict(post);
        throw new Error(POST_SESSION_RECOVERED_SENTINEL);
      }

      const handledCapabilityChange = await handlePostEditCapabilityError({
        message,
        post,
        source: "save",
        status,
      });

      if (handledCapabilityChange) {
        throw new Error(POST_EDIT_CAPABILITY_CHANGED_SENTINEL);
      }

      throw new Error(message);
    }

    return resolvePostSeoFallbacks(payload.post);
  };

  const updatePost = useCallback((
    postId: string,
    updates: Partial<ContentPost>,
    options?: {
      skipSync?: boolean;
    },
  ) => {
    if (!canEditCurrentPostRef.current && postId === selectedPostIdRef.current) {
      return;
    }

    const currentPost = draftPostsRef.current[postId] ?? posts.find((post) => post.id === postId) ?? null;
    let nextPost = currentPost
      ? {
          ...currentPost,
          ...updates,
        }
      : null;

    if (
      nextPost &&
      currentPost &&
      primaryMultiFieldEditorId &&
      ("contentHtml" in updates || "contentJson" in updates) &&
      !("contentFields" in updates)
    ) {
      nextPost = {
        ...nextPost,
        contentFields: {
          ...(currentPost.contentFields ?? {}),
          [primaryMultiFieldEditorId]: {
            contentHtml: nextPost.contentHtml,
            contentJson: nextPost.contentJson,
          },
        },
      };
    }

    if (!nextPost) {
      return;
    }

    if (
      JSON.stringify(getComparablePostState(currentPost)) ===
      JSON.stringify(getComparablePostState(nextPost))
    ) {
      return;
    }

    if ("focusKeyword" in updates && !postFieldStates.focusKeyword.mapped) {
      localSeoStorage.writeFocusKeyword(postId, nextPost.focusKeyword);
    }

    draftPostsRef.current[postId] = nextPost;
    setPosts((currentPosts) => currentPosts.map((post) => (post.id === postId ? nextPost : post)));

    if (nextPost && !options?.skipSync && isContentReady) {
      const persistedPost = persistedPostsRef.current[postId] ?? null;
      const hasUnsavedChanges = hasComparableUnsavedPostChanges({
        draftPost: nextPost,
        isEditingSlug: postId === selectedPostIdRef.current ? isEditingPostSlugRef.current : false,
        persistedPost,
        slugDraft: postId === selectedPostIdRef.current ? postSlugDraftRef.current : nextPost.slug,
      });

      if (hasUnsavedChanges) {
        markPostDirty(postId);
      } else {
        dirtyPostIdsRef.current.delete(postId);
      }
    }
  }, [
    canEditCurrentPostRef,
    dirtyPostIdsRef,
    draftPostsRef,
    hasComparableUnsavedPostChanges,
    isContentReady,
    isEditingPostSlugRef,
    localSeoStorage,
    markPostDirty,
    persistedPostsRef,
    postSlugDraftRef,
    postFieldStates.focusKeyword.mapped,
    posts,
    primaryMultiFieldEditorId,
    selectedPostIdRef,
  ]);

  const updatePostCustomField = useCallback((
    postId: string,
    fieldKey: string,
    value: unknown,
  ) => {
    const currentPost =
      draftPostsRef.current[postId] ??
      posts.find((post) => post.id === postId) ??
      null;

    updatePost(postId, {
      customFields: {
        ...(currentPost?.customFields ?? {}),
        [fieldKey]: value,
      },
    });
  }, [draftPostsRef, posts, updatePost]);

  const getResolvedSelectedPostForSave = (status?: ContentPost["status"]) => {
    const currentPostId = selectedPostIdRef.current;
    const currentPost = currentPostId ? draftPostsRef.current[currentPostId] ?? selectedPost : selectedPost;

    if (!currentPost) {
      return null;
    }

    const hasPendingSlugDraft =
      currentPost.id === selectedPostIdRef.current &&
      isEditingPostSlugRef.current &&
      postSlugDraftRef.current !== currentPost.slug;
    const resolvedPost = {
      ...currentPost,
      slug: hasPendingSlugDraft ? slugifyContentValue(postSlugDraftRef.current) || "untitled" : currentPost.slug,
      status: status ?? currentPost.status,
    };
    const persistedPost = persistedPostsRef.current[resolvedPost.id] ?? null;
    const hasUnsavedChanges = hasComparableUnsavedPostChanges({
      draftPost: resolvedPost,
      isEditingSlug: false,
      persistedPost,
      slugDraft: resolvedPost.slug,
    });

    return {
      hasPendingSlugDraft,
      hasUnsavedChanges,
      post: resolvedPost,
    };
  };

  const flushPostSave = async (
    post: ContentPost,
    options?: {
      action?: "update_post" | "publish_post" | "archive_post" | "unpublish_post";
    },
  ) => {
    setIsSaving(true);

    try {
      const savedPost = await persistPost(post, options?.action ?? "update_post");

      applyPersistedPostUpdate(savedPost);
      return savedPost;
    } finally {
      setIsSaving(false);
    }
  };

  const loadPostRevisions = async (postId: string) => {
    setLoadingPostRevisions(true);
    setPostRevisionsLoadError(null);

    try {
      const payload =
        selectedPostIdRef.current === postId
          ? (await postRevisionsQuery.refetch()).data
          : await queryClient.fetchQuery(
              getProjectEditorPostRevisionsQueryOptions({
                postId,
                projectId,
              }),
            );

      if (!payload) {
        throw new Error("Could not load revision history right now.");
      }

      if (selectedPostIdRef.current !== postId) {
        return;
      }

      setPostRevisions(payload.revisions ?? []);
    } catch (error) {
      if (selectedPostIdRef.current !== postId) {
        return;
      }

      setPostRevisions([]);
      setPostRevisionsLoadError(
        getProductionErrorMessage(error, "Could not load revision history right now."),
      );
    } finally {
      if (selectedPostIdRef.current === postId) {
        setLoadingPostRevisions(false);
      }
    }
  };

  const handleOpenPostPreview = () => {
    if (!selectedPost || !canOpenSelectedPostPreview) {
      return;
    }

    const resolvedPreview = getResolvedSelectedPostForSave();
    const previewPostSource = resolvedPreview?.post ?? selectedPost;
    const previewPost = {
      ...previewPostSource,
      contentHtml: getContentPostCombinedContentHtml({
        editorFields: multiFieldEditorFields,
        post: previewPostSource,
      }),
    };

    try {
      const previewStorage = createPostEditorPreviewStorage(window.localStorage);
      const token = previewStorage.writeSnapshot({
        hasUnsavedChanges: resolvedPreview?.hasUnsavedChanges ?? false,
        post: previewPost,
        projectName: currentProjectName,
        projectSlug: currentProjectSlug,
      });
      const previewWindow = window.open(
        previewStorage.createPreviewUrl(token),
        "content-runtime-post-preview",
      );

      if (!previewWindow) {
        toast.error("Allow pop-ups for this site to open preview.");
        return;
      }

      previewWindow.focus();
    } catch (error) {
      toast.error(getProductionErrorMessage(error, "Could not open preview right now."));
    }
  };

  const handleOpenPostRevisions = () => {
    if (!selectedPost || !canOpenSelectedPostRevisions) {
      return;
    }

    setShowPostRevisionsSheet(true);
  };

  const handleRestorePostRevision = async () => {
    if (!selectedPost || !pendingRevisionRestore || !canEditCurrentPost) {
      return;
    }

    const revisionNumber = pendingRevisionRestore.revisionNumber;
    setRestoringRevisionNumber(revisionNumber);

    try {
      const {
        ok,
        payload,
        status,
      } = await requestProjectEditorContentAction<UpdatePostResponse>({
        action: {
          action: "restore_post_revision",
          postId: selectedPost.id,
          revisionNumber,
        },
        projectId,
      });

      if (!ok || !payload.post) {
        const message = payload.error ?? "Could not restore that revision right now.";

        if (isRecoverablePostSessionError(message)) {
          await resolvePostEditConflict(selectedPost);
          throw new Error(POST_SESSION_RECOVERED_SENTINEL);
        }

        const handledCapabilityChange = await handlePostEditCapabilityError({
          message,
          post: selectedPost,
          source: "save",
          status,
        });

        if (handledCapabilityChange) {
          throw new Error(POST_EDIT_CAPABILITY_CHANGED_SENTINEL);
        }

        throw new Error(message);
      }

      applyPersistedPostUpdate(payload.post);
      setPendingRevisionRestore(null);
      toast.success(`Restored revision #${revisionNumber}.`);
      void loadPostRevisions(selectedPost.id);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === POST_SESSION_RECOVERED_SENTINEL ||
          error.message === POST_EDIT_CAPABILITY_CHANGED_SENTINEL)
      ) {
        return;
      }

      toast.error(getProductionErrorMessage(error, "Could not restore that revision right now."));
    } finally {
      setRestoringRevisionNumber(null);
    }
  };

  const focusEditorToolbar = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }

    const firstToolbarButton = document.querySelector<HTMLButtonElement>(
      "[data-project-editor-toolbar] button:not(:disabled)",
    );

    firstToolbarButton?.focus();
  }, []);

  const isPrimaryShortcutPressed = useCallback(
    (event: KeyboardEvent | ReactKeyboardEvent) => (isMacKeyboardPlatform ? event.metaKey : event.ctrlKey),
    [isMacKeyboardPlatform],
  );

  const syncSelectedEditorImageState = useCallback((currentEditor: TiptapEditor | null) => {
    if (!currentEditor?.isActive("image")) {
      if (!currentEditor || selectedEditorImageRef.current === currentEditor) {
        selectedEditorImageRef.current = null;
        setSelectedEditorImage(null);
      }
      return;
    }

    const attrs = currentEditor.getAttributes("image") as {
      align?: unknown;
      alt?: unknown;
      height?: unknown;
      linkHref?: unknown;
      src?: unknown;
      width?: unknown;
    };
    const src = typeof attrs.src === "string" ? attrs.src : "";

    if (!src) {
      selectedEditorImageRef.current = null;
      setSelectedEditorImage(null);
      return;
    }

    selectedEditorImageRef.current = currentEditor;
    setSelectedEditorImage({
      align: attrs.align === "left" || attrs.align === "center" || attrs.align === "right" ? attrs.align : "",
      alt: typeof attrs.alt === "string" ? attrs.alt : "",
      height: typeof attrs.height === "string" || typeof attrs.height === "number" ? String(attrs.height) : "",
      linkHref: typeof attrs.linkHref === "string" ? attrs.linkHref : "",
      src,
      width: typeof attrs.width === "string" || typeof attrs.width === "number" ? String(attrs.width) : "",
    });
  }, []);

  const openEditorLinkPrompt = useCallback((options?: {
    autoFocusInput?: boolean;
    editor?: TiptapEditor | null;
  }) => {
    const currentEditor = options?.editor ?? getActiveCommandEditor();

    if (!currentEditor || !hasSelectedPostRef.current || !canEditCurrentPostRef.current) {
      return false;
    }

    const linkAttrs = currentEditor.getAttributes("link");
    const isEditing = currentEditor.isActive("link");

    // Position the popover near the current selection or cursor
    const { view } = currentEditor;
    const { from, to } = view.state.selection;
    const coords = view.coordsAtPos(from);

    linkPopoverSelectionRef.current = { from, to };
    setLinkPopoverInitial({
      href: linkAttrs.href ?? "",
      target: linkAttrs.target ?? null,
      rel: linkAttrs.rel ?? null,
      isEditing,
    });
    setLinkPopoverAnchor({ x: coords.left, y: coords.bottom });
    setLinkPopoverAutoFocusInput(options?.autoFocusInput ?? true);
    setLinkPopoverOpen(true);

    return true;
  }, [canEditCurrentPostRef, getActiveCommandEditor, hasSelectedPostRef]);

  const commitEditorContentFromInstance = useCallback((currentEditor: TiptapEditor) => {
    if (!selectedPostIdRef.current || !isContentReady) {
      return;
    }

    const contentHtml = currentEditor.getHTML();
    const contentJson = currentEditor.getJSON() as Record<string, unknown>;
    const activeFieldId = getEditorFieldId(currentEditor);

    if (!activeFieldId) {
      updatePost(selectedPostIdRef.current, {
        contentHtml,
        contentJson,
      });
      return;
    }

    const currentPost =
      draftPostsRef.current[selectedPostIdRef.current] ??
      posts.find((post) => post.id === selectedPostIdRef.current) ??
      null;

    if (!currentPost) {
      return;
    }

    const contentFields = {
      ...(currentPost.contentFields ?? {}),
      [activeFieldId]: { contentHtml, contentJson },
    };
    const updates: Partial<ContentPost> = { contentFields };

    if (activeFieldId === primaryMultiFieldEditorId) {
      updates.contentHtml = contentHtml;
      updates.contentJson = contentJson;
    }

    updatePost(selectedPostIdRef.current, updates);
  }, [
    draftPostsRef,
    getEditorFieldId,
    isContentReady,
    posts,
    primaryMultiFieldEditorId,
    selectedPostIdRef,
    updatePost,
  ]);

  const handleLinkPopoverApply = useCallback((state: EditorLinkState) => {
    const currentEditor = getActiveCommandEditor();

    if (!currentEditor) {
      return;
    }

    const rel = buildRelString(state.relFlags, state.openInNewTab);
    const target = state.openInNewTab ? "_blank" : null;
    const selection = linkPopoverSelectionRef.current;

    runProjectEditorLinkApply(currentEditor, {
      href: state.href,
      target,
      rel: rel || null,
    }, {
      extendExistingLink: linkPopoverInitial.isEditing,
      selection,
    });

    commitEditorContentFromInstance(currentEditor);
    linkPopoverSelectionRef.current = null;
    setLinkPopoverOpen(false);
  }, [commitEditorContentFromInstance, getActiveCommandEditor, linkPopoverInitial.isEditing]);

  const handleLinkPopoverUnlink = useCallback(() => {
    const currentEditor = getActiveCommandEditor();

    if (!currentEditor) {
      return;
    }

    runProjectEditorLinkUnlink(currentEditor, {
      selection: linkPopoverSelectionRef.current,
    });
    commitEditorContentFromInstance(currentEditor);
    linkPopoverSelectionRef.current = null;
    setLinkPopoverOpen(false);
  }, [commitEditorContentFromInstance, getActiveCommandEditor]);

  const handleLinkPopoverClose = useCallback(() => {
    linkPopoverSelectionRef.current = null;
    setLinkPopoverOpen(false);
    getActiveCommandEditor()?.commands.focus();
  }, [getActiveCommandEditor]);

  const syncSlashCommandState = useCallback((currentEditor: TiptapEditor | null) => {
    const nextMatch =
      hasSelectedPostRef.current && canEditCurrentPostRef.current
        ? getProjectEditorSlashCommandMatch(currentEditor)
        : null;

    slashCommandMatchRef.current = nextMatch;
    setSlashCommandMatch((previousMatch) => {
      if (
        previousMatch?.from === nextMatch?.from &&
        previousMatch?.to === nextMatch?.to &&
        previousMatch?.query === nextMatch?.query
      ) {
        return previousMatch;
      }

      return nextMatch;
    });
  }, [canEditCurrentPostRef, hasSelectedPostRef]);

  const handleMultiFieldEditorFocus = useCallback(
    (currentEditor: TiptapEditor) => {
      activeEditorRef.current = currentEditor;
      setActiveBodyEditor((previousEditor) =>
        previousEditor === currentEditor ? previousEditor : currentEditor,
      );
      syncSlashCommandState(currentEditor);
      syncSelectedEditorImageState(currentEditor);
    },
    [syncSelectedEditorImageState, syncSlashCommandState],
  );

  const handleMultiFieldEditorStateChange = useCallback(
    (currentEditor: TiptapEditor) => {
      if (activeEditorRef.current !== currentEditor) {
        activeEditorRef.current = currentEditor;
        setActiveBodyEditor((previousEditor) =>
          previousEditor === currentEditor ? previousEditor : currentEditor,
        );
      }

      syncSlashCommandState(currentEditor);
      syncSelectedEditorImageState(currentEditor);
    },
    [syncSelectedEditorImageState, syncSlashCommandState],
  );

  const handleMultiFieldEditorLinkClick = useCallback(
    (currentEditor: TiptapEditor) => {
      activeEditorRef.current = currentEditor;
      setActiveBodyEditor((previousEditor) =>
        previousEditor === currentEditor ? previousEditor : currentEditor,
      );
      openEditorLinkPrompt({
        autoFocusInput: false,
        editor: currentEditor,
      });
    },
    [openEditorLinkPrompt],
  );

  const handleMultiFieldEditorInstanceChange = useCallback(
    (fieldId: string, currentEditor: TiptapEditor | null) => {
      if (currentEditor) {
        multiFieldEditorsRef.current[fieldId] = currentEditor;

        if (fieldId === primaryMultiFieldEditorId && !activeEditorRef.current) {
          activeEditorRef.current = currentEditor;
          setActiveBodyEditor(currentEditor);
          syncSlashCommandState(currentEditor);
          syncSelectedEditorImageState(currentEditor);
        }

        return;
      }

      delete multiFieldEditorsRef.current[fieldId];
    },
    [primaryMultiFieldEditorId, syncSelectedEditorImageState, syncSlashCommandState],
  );

  const runSlashCommandItem = useCallback(
    (item: ProjectEditorSlashCommandItem | null | undefined) => {
      const currentEditor = getActiveCommandEditor();
      const activeSlashCommandMatch =
        slashCommandMatchRef.current ?? getProjectEditorSlashCommandMatch(currentEditor);

      if (
        !item ||
        !currentEditor ||
        !activeSlashCommandMatch ||
        !hasSelectedPostRef.current ||
        !canEditCurrentPostRef.current
      ) {
        return false;
      }

      currentEditor
        .chain()
        .focus()
        .deleteRange({
          from: activeSlashCommandMatch.from,
          to: activeSlashCommandMatch.to,
        })
        .run();
      item.run();
      syncSlashCommandState(currentEditor);
      syncSelectedEditorImageState(currentEditor);
      return true;
    },
    [canEditCurrentPostRef, getActiveCommandEditor, hasSelectedPostRef, syncSelectedEditorImageState, syncSlashCommandState],
  );

  const handlePostEditorShortcut = useCallback(
    (event: KeyboardEvent | ReactKeyboardEvent, source: "body" | "title") => {
      if ("isComposing" in event && event.isComposing) {
        return false;
      }

      const currentEditor = getActiveCommandEditor();
      const isPrimaryShortcut = isPrimaryShortcutPressed(event);
      const hasExactPrimaryModifier = isPrimaryShortcut && !event.altKey && !event.shiftKey;
      const isMacHeadingShortcut = isMacKeyboardPlatform && event.metaKey && event.altKey && !event.shiftKey;
      const isWindowsHeadingShortcut = !isMacKeyboardPlatform && !event.ctrlKey && !event.metaKey && event.altKey && event.shiftKey;

      if (event.altKey && event.key === "F10") {
        event.preventDefault();
        focusEditorToolbar();
        return true;
      }

      if (isPrimaryShortcut && event.code === "Slash") {
        event.preventDefault();
        setShowKeyboardShortcutsDialog(true);
        return true;
      }

      if (hasExactPrimaryModifier && event.code === "KeyS") {
        event.preventDefault();

        if (
          hasSelectedPostRef.current &&
          canEditCurrentPostRef.current &&
          !isSavingRef.current &&
          !isPublishingRef.current &&
          hasSelectedPostUnsavedChangesRef.current
        ) {
          void savePostShortcutRef.current?.();
        }

        return true;
      }

      if (source !== "body" || !currentEditor) {
        return false;
      }

      if (!hasSelectedPostRef.current || !canEditCurrentPostRef.current) {
        return false;
      }

      const activeSlashCommandMatch = slashCommandMatchRef.current;
      const visibleSlashCommands = filteredSlashCommandItemsRef.current;

      if (activeSlashCommandMatch && visibleSlashCommands.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedSlashCommandIndex(
            (currentIndex) => (currentIndex + 1) % visibleSlashCommands.length,
          );

          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedSlashCommandIndex(
            (currentIndex) =>
              (currentIndex - 1 + visibleSlashCommands.length) % visibleSlashCommands.length,
          );

          return true;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          return runSlashCommandItem(
            visibleSlashCommands[selectedSlashCommandIndexRef.current] ?? visibleSlashCommands[0],
          );
        }
      }

      if (event.key === "Tab") {
        const isListSelection = currentEditor.isActive("bulletList") || currentEditor.isActive("orderedList");

        if (!isListSelection) {
          return false;
        }

        event.preventDefault();

        if (event.shiftKey) {
          currentEditor.chain().focus().liftListItem("listItem").run();
          return true;
        }

        currentEditor.chain().focus().sinkListItem("listItem").run();
        return true;
      }

      if (hasExactPrimaryModifier && event.code === "KeyB") {
        event.preventDefault();
        currentEditor.chain().focus().toggleBold().run();
        return true;
      }

      if (hasExactPrimaryModifier && event.code === "KeyI") {
        event.preventDefault();
        currentEditor.chain().focus().toggleItalic().run();
        return true;
      }

      if (hasExactPrimaryModifier && event.code === "KeyU") {
        event.preventDefault();
        currentEditor.chain().focus().toggleUnderline().run();
        return true;
      }

      if (hasExactPrimaryModifier && event.code === "KeyK") {
        event.preventDefault();
        return openEditorLinkPrompt();
      }

      if (hasExactPrimaryModifier && event.code === "Backslash") {
        event.preventDefault();
        currentEditor.chain().focus().unsetAllMarks().clearNodes().run();
        return true;
      }

      if (isPrimaryShortcut && event.shiftKey && event.code === "Digit7") {
        event.preventDefault();
        currentEditor.chain().focus().toggleOrderedList().run();
        return true;
      }

      if (isPrimaryShortcut && event.shiftKey && event.code === "Digit8") {
        event.preventDefault();
        currentEditor.chain().focus().toggleBulletList().run();
        return true;
      }

      if ((isMacHeadingShortcut || isWindowsHeadingShortcut) && event.code === "Digit0") {
        event.preventDefault();
        currentEditor.chain().focus().setParagraph().run();
        return true;
      }

      if ((isMacHeadingShortcut || isWindowsHeadingShortcut) && event.code === "Digit1") {
        event.preventDefault();
        currentEditor.chain().focus().toggleHeading({ level: 1 }).run();
        return true;
      }

      if ((isMacHeadingShortcut || isWindowsHeadingShortcut) && event.code === "Digit2") {
        event.preventDefault();
        currentEditor.chain().focus().toggleHeading({ level: 2 }).run();
        return true;
      }

      if ((isMacHeadingShortcut || isWindowsHeadingShortcut) && event.code === "Digit3") {
        event.preventDefault();
        currentEditor.chain().focus().toggleHeading({ level: 3 }).run();
        return true;
      }

      if (!event.ctrlKey && !event.metaKey && event.altKey && event.shiftKey && event.code === "Digit5") {
        event.preventDefault();
        currentEditor.chain().focus().toggleStrike().run();
        return true;
      }

      if (hasExactPrimaryModifier && event.code === "KeyA") {
        event.preventDefault();
        currentEditor.commands.selectAll();
        return true;
      }

      if (hasExactPrimaryModifier && event.code === "KeyZ") {
        event.preventDefault();
        currentEditor.chain().focus().undo().run();
        return true;
      }

      if (isPrimaryShortcut && event.shiftKey && event.code === "KeyZ") {
        event.preventDefault();
        currentEditor.chain().focus().redo().run();
        return true;
      }

      if (!isMacKeyboardPlatform && isPrimaryShortcut && event.code === "KeyY") {
        event.preventDefault();
        currentEditor.chain().focus().redo().run();
        return true;
      }

      return false;
    },
    [
      canEditCurrentPostRef,
      focusEditorToolbar,
      getActiveCommandEditor,
      hasSelectedPostRef,
      hasSelectedPostUnsavedChangesRef,
      isMacKeyboardPlatform,
      isPublishingRef,
      isPrimaryShortcutPressed,
      isSavingRef,
      openEditorLinkPrompt,
      runSlashCommandItem,
    ],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: editorExtensions,
    content: getResolvedPostEditorContentJson(selectedPost?.contentJson),
    editorProps: {
      attributes: {
        class: "outline-none min-h-[320px]",
      },
      handleKeyDown(_, event) {
        return handlePostEditorShortcut(event, "body");
      },
      handleClick(_, __, event) {
        const target = event.target instanceof Element ? event.target : null;

        if (!target?.closest("a[href]")) {
          return false;
        }

        requestAnimationFrame(() => {
          openEditorLinkPrompt({
            autoFocusInput: false,
            editor: getActiveCommandEditor(),
          });
        });

        return false;
      },
    },
    onSelectionUpdate({ editor: currentEditor }) {
      syncSlashCommandState(currentEditor);
      syncSelectedEditorImageState(currentEditor);
    },
    onUpdate({ editor: currentEditor, transaction }) {
      syncSlashCommandState(currentEditor);
      syncSelectedEditorImageState(currentEditor);

      if (!selectedPostIdRef.current || !isContentReady) {
        return;
      }

      // Ignore editor hydration/normalization updates until the user is actively editing the body.
      if (!transaction.docChanged || !currentEditor.isFocused) {
        return;
      }

      updatePost(selectedPostIdRef.current, {
        contentHtml: currentEditor.getHTML(),
        contentJson: currentEditor.getJSON() as Record<string, unknown>,
      });
    },
  }, [getActiveCommandEditor, handlePostEditorShortcut, openEditorLinkPrompt, syncSelectedEditorImageState, syncSlashCommandState]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextContent = getResolvedPostEditorContentJson(selectedPost?.contentJson);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(nextContent)) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, selectedPost?.contentJson, selectedPost?.id]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(Boolean(canEditCurrentPost));
  }, [canEditCurrentPost, editor]);

  useEffect(() => {
    editorRef.current = editor;
    if (!isMultiFieldEditor) {
      activeEditorRef.current = editor;
    }
  }, [editor, isMultiFieldEditor]);

  useEffect(() => {
    if (!isMultiFieldEditor) {
      setActiveBodyEditor(null);
      multiFieldEditorsRef.current = {};
      return;
    }

    activeEditorRef.current = null;
    setActiveBodyEditor(null);
    multiFieldEditorsRef.current = {};
    syncSlashCommandState(null);
  }, [isMultiFieldEditor, selectedPost?.id, syncSlashCommandState]);

  useEffect(() => {
    canEditCurrentPostRef.current = canEditCurrentPost;
    hasPostSidebarConfigChangesRef.current = hasPostSidebarConfigChanges;
    hasSelectedPostRef.current = hasSelectedPost;
    hasSelectedPostUnsavedChangesRef.current = hasSelectedPostUnsavedChanges;
    isSavingRef.current = isSaving;
    isPublishingRef.current = isPublishing;
  }, [
    canEditCurrentPost,
    canEditCurrentPostRef,
    hasPostSidebarConfigChangesRef,
    hasPostSidebarConfigChanges,
    hasSelectedPost,
    hasSelectedPostRef,
    hasSelectedPostUnsavedChanges,
    hasSelectedPostUnsavedChangesRef,
    isPublishing,
    isPublishingRef,
    isSaving,
    isSavingRef,
  ]);

  useEffect(() => {
    syncSlashCommandState(getActiveCommandEditor());
  }, [canEditCurrentPost, editor, getActiveCommandEditor, selectedPost?.id, syncSlashCommandState]);

  const handleContentFieldChange = useCallback(
    (fieldId: string, contentHtml: string, contentJson: Record<string, unknown>) => {
      if (!selectedPostIdRef.current || !isContentReady) return;

      const currentPost = draftPostsRef.current[selectedPostIdRef.current] ??
        posts.find((post) => post.id === selectedPostIdRef.current) ?? null;
      if (!currentPost) return;

      const nextContentFields = {
        ...(currentPost.contentFields ?? {}),
        [fieldId]: { contentHtml, contentJson },
      };

      // Keep primary contentHtml/contentJson in sync with the first editor field.
      const firstFieldId = primaryMultiFieldEditorId;
      const primaryUpdate: Partial<ContentPost> = { contentFields: nextContentFields };
      if (fieldId === firstFieldId) {
        primaryUpdate.contentHtml = contentHtml;
        primaryUpdate.contentJson = contentJson;
      }

      updatePost(selectedPostIdRef.current, primaryUpdate);
    },
    [draftPostsRef, isContentReady, posts, primaryMultiFieldEditorId, selectedPostIdRef, updatePost],
  );

  const handleMultiFieldEditorKeyDown = useCallback(
    (event: KeyboardEvent) => handlePostEditorShortcut(event, "body"),
    [handlePostEditorShortcut],
  );

  useEffect(() => {
    setSelectedSlashCommandIndex(0);
  }, [slashCommandMatch?.from, slashCommandMatch?.query]);

  useEffect(() => {
    if (!selectedPostYoastInput) {
      setIsYoastAnalyzing(false);
      setYoastSeoScore(null);
      setYoastReadabilityScore(null);
      setYoastSeoResults([]);
      setYoastReadabilityResults([]);
      return;
    }

    setIsYoastAnalyzing(true);

    let cancelled = false;

    const run = async () => {
      try {
        const [yoastseo, ResearcherMod, htmlParserMod] = await Promise.all([
          import("yoastseo"),
          import("yoastseo/build/languageProcessing/languages/_default/Researcher"),
          import("yoastseo/build/languageProcessing/helpers/html/htmlParser"),
        ]);

        if (cancelled) return;

        const { Paper, SeoAssessor, ContentAssessor } = yoastseo;
        const Researcher = ResearcherMod.default;
        const htmlParser = htmlParserMod.default;

        const sanitizeResultText = (value: string) =>
          value
            .replace(/<[^>]*>/g, " ")
            .replace(/&[a-z#0-9]+;/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
        const resolvedSeoTitle = selectedPostYoastInput.seoTitle || selectedPostYoastInput.title || "";
        const resolvedSeoDescription =
          selectedPostYoastInput.seoDescription || selectedPostYoastInput.excerpt || "";
        const normalizedYoastLocale =
          typeof navigator === "undefined"
            ? "en_US"
            : (navigator.language || "en-US").replace(/-/g, "_");
        const normalizedContentHtml = htmlParser(selectedPostYoastInput.contentHtml);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- yoastseo helpers not in published types
        const yoastHelpers = (yoastseo as any).helpers;
        const titleWidth = yoastHelpers?.measureTextWidth
          ? (yoastHelpers.measureTextWidth(resolvedSeoTitle) as number)
          : resolvedSeoTitle.length * 8;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- titleWidth exists at runtime but not in published types
        const paper = new Paper(normalizedContentHtml, {
          keyword: selectedPostYoastInput.focusKeyword,
          title: resolvedSeoTitle,
          titleWidth,
          description: resolvedSeoDescription,
          slug: selectedPostYoastInput.slug,
          locale: normalizedYoastLocale,
          permalink: normalizedProjectWebsiteUrl ?? "",
        } as Record<string, unknown>);

        const researcher = new Researcher(paper);

        const seoAssessor = new SeoAssessor(researcher);
        const seoAssessments = (
          seoAssessor as {
            _assessments?: Array<{
              identifier?: string;
            }>;
          }
        )._assessments;

        if (Array.isArray(seoAssessments)) {
          (
            seoAssessor as {
              _assessments?: Array<{
                identifier?: string;
              }>;
            }
          )._assessments = seoAssessments.filter((assessment) =>
            isProjectEditorYoastSeoResultActionable({
              capabilities: seoCapabilities,
              resultId: assessment.identifier ?? "",
            }),
          );
        }

        seoAssessor.assess(paper);

        const contentAssessor = new ContentAssessor(researcher);
        contentAssessor.assess(paper);

        const toResults = (results: import("yoastseo").YoastAssessmentResult[]) =>
          results.flatMap((result) => {
            const text = result.getText();

            if (!text) {
              return [];
            }

            return [
              {
                id: result._identifier ?? "",
                score: result.getScore(),
                text: sanitizeResultText(text),
              },
            ];
          });

        if (cancelled) return;

        setYoastSeoScore(seoAssessor.calculateOverallScore());
        setYoastReadabilityScore(contentAssessor.calculateOverallScore());
        setYoastSeoResults(
          filterProjectEditorYoastSeoResults({
            capabilities: seoCapabilities,
            results: toResults(seoAssessor.getValidResults()),
          }),
        );
        setYoastReadabilityResults(toResults(contentAssessor.getValidResults()));
      } catch (err) {
        console.error("[Yoast analysis error]", err);
        if (!cancelled) {
          setYoastSeoScore(null);
          setYoastReadabilityScore(null);
          setYoastSeoResults([]);
          setYoastReadabilityResults([]);
        }
      } finally {
        if (!cancelled) setIsYoastAnalyzing(false);
      }
    };

    const timer = setTimeout(() => void run(), 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedProjectWebsiteUrl, selectedPostYoastInput, seoCapabilities]);

  const setLink = useCallback(() => {
    openEditorLinkPrompt();
  }, [openEditorLinkPrompt]);

  const getActiveEditor = useCallback(
    () => getActiveCommandEditor(),
    [getActiveCommandEditor],
  );

  const loadEditorAssetPickerLibrary = useCallback(async (
    kind: "media" | "files",
    options?: { path?: string; search?: string },
  ) => {
    const path = options?.path ?? assetPickerPath;
    const search = options?.search?.trim() ?? "";
    setAssetPickerLoading(true);

    try {
      if (kind === "media") {
        const payload = await queryClient.fetchQuery({
          ...getProjectEditorMediaLibraryQueryOptions({
            includeFolderOptions: false,
            path,
            projectId,
            search,
          }),
          staleTime: 0,
        });
        setAssetPickerMediaLibrary(payload);
        return;
      }

      const payload = await queryClient.fetchQuery({
        ...getProjectEditorFilesLibraryQueryOptions({
          includeFolderOptions: false,
          path,
          projectId,
          search,
        }),
        staleTime: 0,
      });
      setAssetPickerFilesLibrary(payload);
    } catch (error) {
      toast.error(
        getProductionErrorMessage(
          error,
          kind === "media"
            ? "Could not load the media library right now."
            : "Could not load the files library right now.",
        ),
      );
    } finally {
      setAssetPickerLoading(false);
    }
  }, [assetPickerPath, projectId, queryClient]);

  const changeEditorAssetPickerPath = useCallback((path: string) => {
    const kind = assetPickerKind;

    if (!kind) {
      return;
    }

    setAssetPickerPath(path);
    void loadEditorAssetPickerLibrary(kind, { path });
  }, [assetPickerKind, loadEditorAssetPickerLibrary]);

  const openEditorAssetPicker = useCallback((kind: "media" | "files") => {
    const currentEditor = getActiveEditor();
    if (!currentEditor || !hasSelectedPost || !canEditCurrentPost) {
      return;
    }

    if (kind === "media" && !usesManagedMediaLibrary) {
      toast.error("Set up the media library before adding images.");
      return;
    }

    if (kind === "files" && !usesManagedFilesLibrary) {
      toast.error("Set up the files library before adding files.");
      return;
    }

    const { from, to } = currentEditor.view.state.selection;
    assetPickerEditorRef.current = currentEditor;
    assetPickerSelectionRef.current = { from, to };
    setAssetPickerPath("");
    setAssetPickerKind(kind);
    void loadEditorAssetPickerLibrary(kind, { path: "" });
  }, [
    canEditCurrentPost,
    getActiveEditor,
    hasSelectedPost,
    loadEditorAssetPickerLibrary,
    usesManagedFilesLibrary,
    usesManagedMediaLibrary,
  ]);

  const closeEditorAssetPicker = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    assetPickerEditorRef.current = null;
    assetPickerSelectionRef.current = null;
    setAssetPickerKind(null);
  }, []);

  const insertSelectedImageAsset = useCallback((image: ContentMediaImage) => {
    const currentEditor = assetPickerEditorRef.current ?? getActiveEditor();

    if (!currentEditor) {
      return;
    }

    runProjectEditorImageInsert(currentEditor, {
      alt: image.fileName,
      src: image.publicUrl,
    }, {
      selection: assetPickerSelectionRef.current,
    });
    commitEditorContentFromInstance(currentEditor);
    closeEditorAssetPicker(false);
  }, [closeEditorAssetPicker, commitEditorContentFromInstance, getActiveEditor]);

  const insertSelectedFileAsset = useCallback((file: ContentFileItem) => {
    const currentEditor = assetPickerEditorRef.current ?? getActiveEditor();

    if (!currentEditor) {
      return;
    }

    runProjectEditorFileInsert(currentEditor, {
      fileName: file.fileName,
      href: file.publicUrl,
    }, {
      selection: assetPickerSelectionRef.current,
    });
    commitEditorContentFromInstance(currentEditor);
    closeEditorAssetPicker(false);
  }, [closeEditorAssetPicker, commitEditorContentFromInstance, getActiveEditor]);

  const uploadEditorAssetPickerFiles = useCallback(async (files: File[], path = assetPickerPath) => {
    const kind = assetPickerKind;
    const currentEditor = assetPickerEditorRef.current ?? getActiveEditor();

    if (!kind || !currentEditor || !files.length) {
      return;
    }

    const endpoint = `/api/projects/${projectId}/${kind === "media" ? "media" : "files"}`;
    const filesForUpload = kind === "media" ? files.filter((file) => file.type.startsWith("image/")) : files;

    if (!filesForUpload.length) {
      toast.error(kind === "media" ? "Choose image files to upload." : "Choose files to upload.");
      return;
    }

    setAssetPickerUploading(true);

    try {
      const validatedFiles = await Promise.all(
        filesForUpload.map(async (file) => ({
          file,
          validation:
            kind === "media"
              ? await validateImageUploadFile({
                  file,
                  label: file.name || "Image upload",
                  maxBytes: MAX_MEDIA_UPLOAD_BYTES,
                })
              : await validateFileUpload({
                  file,
                  label: file.name || "File upload",
                  maxBytes: MAX_FILE_UPLOAD_BYTES,
                }),
        })),
      );
      const uploads = await prepareContentRuntimeDirectUploads({
        endpoint,
        files: validatedFiles.map(({ file, validation }) => ({
          contentType: validation.contentType,
          name: file.name,
          size: file.size,
        })),
        path,
      });

      if (uploads.length !== validatedFiles.length) {
        throw new Error("Could not prepare those uploads right now.");
      }

      await Promise.all(
        uploads.map((upload, index) =>
          uploadPreparedContentRuntimeFile({
            file: validatedFiles[index]!.file,
            upload,
          }),
        ),
      );

      const uploadedFiles = await completeContentRuntimeDirectUploads({
        endpoint,
        objectPaths: uploads.map((upload) => upload.objectPath),
      });

      uploadedFiles.forEach((uploadedFile, index) => {
        const sourceFile = validatedFiles[index]!.file;

        if (kind === "media") {
          runProjectEditorImageInsert(currentEditor, {
            alt: sourceFile.name,
            src: uploadedFile.signedUrl,
          }, {
            selection: index === 0 ? assetPickerSelectionRef.current : null,
          });
          return;
        }

        runProjectEditorFileInsert(currentEditor, {
          fileName: sourceFile.name,
          href: uploadedFile.signedUrl,
        }, {
          selection: index === 0 ? assetPickerSelectionRef.current : null,
        });
      });

      commitEditorContentFromInstance(currentEditor);
      await loadEditorAssetPickerLibrary(kind, { path });
      await refreshWorkspaceSummaryForManagedCollection(kind === "media" ? "media" : "files");
      toast.success(
        filesForUpload.length === 1
          ? (kind === "media" ? "Image inserted." : "File inserted.")
          : (kind === "media" ? "Images inserted." : "Files inserted."),
      );
      closeEditorAssetPicker(false);
    } catch (error) {
      toast.error(
        getProductionErrorMessage(
          error,
          kind === "media"
            ? "Could not upload those images right now."
            : "Could not upload those files right now.",
        ),
      );
    } finally {
      setAssetPickerUploading(false);
    }
  }, [
    assetPickerKind,
    closeEditorAssetPicker,
    commitEditorContentFromInstance,
    getActiveEditor,
    assetPickerPath,
    loadEditorAssetPickerLibrary,
    projectId,
    refreshWorkspaceSummaryForManagedCollection,
  ]);

  const insertImage = useCallback(() => {
    openEditorAssetPicker("media");
  }, [openEditorAssetPicker]);

  const insertFile = useCallback(() => {
    openEditorAssetPicker("files");
  }, [openEditorAssetPicker]);

  const updateSelectedEditorImage = useCallback((
    updates: Partial<ProjectEditorSelectedImage> & {
      align?: ProjectEditorSelectedImage["align"] | null;
      height?: string | null;
      linkHref?: string | null;
      width?: string | null;
    },
  ) => {
    const currentEditor = selectedEditorImageRef.current ?? getActiveEditor();

    if (!currentEditor || !selectedEditorImage) {
      return;
    }

    runProjectEditorImageAttributeUpdate(currentEditor, updates);
    commitEditorContentFromInstance(currentEditor);
    setSelectedEditorImage({
      ...selectedEditorImage,
      ...updates,
      align: updates.align === null ? "" : updates.align ?? selectedEditorImage.align,
      height: updates.height === null ? "" : updates.height ?? selectedEditorImage.height,
      linkHref: updates.linkHref === null ? "" : updates.linkHref ?? selectedEditorImage.linkHref,
      width: updates.width === null ? "" : updates.width ?? selectedEditorImage.width,
    });
  }, [commitEditorContentFromInstance, getActiveEditor, selectedEditorImage]);

  const removeSelectedEditorImage = useCallback(() => {
    const currentEditor = selectedEditorImageRef.current ?? getActiveEditor();

    if (!currentEditor) {
      return;
    }

    runProjectEditorImageRemove(currentEditor);
    commitEditorContentFromInstance(currentEditor);
    selectedEditorImageRef.current = null;
    setSelectedEditorImage(null);
  }, [commitEditorContentFromInstance, getActiveEditor]);

  const slashCommandItems = useMemo<ProjectEditorSlashCommandItem[]>(
    () => [
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "paragraph")!,
        run: () => getActiveEditor()?.chain().focus().setParagraph().run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "heading1")!,
        run: () => getActiveEditor()?.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "heading2")!,
        run: () => getActiveEditor()?.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "heading3")!,
        run: () => getActiveEditor()?.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "bold")!,
        run: () => getActiveEditor()?.chain().focus().toggleBold().run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "italic")!,
        run: () => getActiveEditor()?.chain().focus().toggleItalic().run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "underline")!,
        run: () => getActiveEditor()?.chain().focus().toggleUnderline().run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "strikethrough")!,
        run: () => getActiveEditor()?.chain().focus().toggleStrike().run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "clearFormatting")!,
        run: () => getActiveEditor()?.chain().focus().unsetAllMarks().clearNodes().run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "bulletList")!,
        run: () => getActiveEditor()?.chain().focus().toggleBulletList().run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "numberedList")!,
        run: () => getActiveEditor()?.chain().focus().toggleOrderedList().run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "quote")!,
        run: () => getActiveEditor()?.chain().focus().toggleBlockquote().run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "codeBlock")!,
        run: () => getActiveEditor()?.chain().focus().toggleCodeBlock().run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "alignLeft")!,
        run: () => getActiveEditor()?.chain().focus().setTextAlign("left").run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "alignCenter")!,
        run: () => getActiveEditor()?.chain().focus().setTextAlign("center").run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "alignRight")!,
        run: () => getActiveEditor()?.chain().focus().setTextAlign("right").run(),
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "link")!,
        run: setLink,
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "image")!,
        run: insertImage,
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "file")!,
        run: insertFile,
      },
      {
        ...PROJECT_EDITOR_SLASH_COMMANDS.find((command) => command.id === "divider")!,
        run: () => getActiveEditor()?.chain().focus().setHorizontalRule().run(),
      },
    ],
    [getActiveEditor, insertFile, insertImage, setLink],
  );
  const filteredSlashCommandItems = useMemo(
    () => filterProjectEditorSlashCommands(slashCommandItems, slashCommandMatch?.query ?? ""),
    [slashCommandItems, slashCommandMatch?.query],
  );
  const showSlashCommandMenu = Boolean(slashCommandMatch);

  useEffect(() => {
    filteredSlashCommandItemsRef.current = filteredSlashCommandItems;
  }, [filteredSlashCommandItems]);

  useEffect(() => {
    selectedSlashCommandIndexRef.current = selectedSlashCommandIndex;
  }, [selectedSlashCommandIndex]);

  useEffect(() => {
    if (!filteredSlashCommandItems.length) {
      setSelectedSlashCommandIndex(0);
      return;
    }

    setSelectedSlashCommandIndex((currentIndex) =>
      currentIndex >= filteredSlashCommandItems.length ? 0 : currentIndex,
    );
  }, [filteredSlashCommandItems.length]);

  const toolbarGroups: ProjectEditorToolbarGroup[] = [
    [
      {
        icon: Text,
        label: "Paragraph",
        run: () => getActiveEditor()?.chain().focus().setParagraph().run(),
        shortcutId: "paragraph",
        shortcutLabel: getProjectEditorShortcutLabel("paragraph", isMacKeyboardPlatform),
      },
      {
        icon: Heading1,
        label: "H1",
        run: () => getActiveEditor()?.chain().focus().toggleHeading({ level: 1 }).run(),
        shortcutId: "heading1",
        shortcutLabel: getProjectEditorShortcutLabel("heading1", isMacKeyboardPlatform),
      },
      {
        icon: Heading2,
        label: "H2",
        run: () => getActiveEditor()?.chain().focus().toggleHeading({ level: 2 }).run(),
        shortcutId: "heading2",
        shortcutLabel: getProjectEditorShortcutLabel("heading2", isMacKeyboardPlatform),
      },
      {
        icon: Heading3,
        label: "H3",
        run: () => getActiveEditor()?.chain().focus().toggleHeading({ level: 3 }).run(),
        shortcutId: "heading3",
        shortcutLabel: getProjectEditorShortcutLabel("heading3", isMacKeyboardPlatform),
      },
    ],
    [
      {
        icon: Bold,
        label: "Bold",
        run: () => getActiveEditor()?.chain().focus().toggleBold().run(),
        shortcutId: "bold",
        shortcutLabel: getProjectEditorShortcutLabel("bold", isMacKeyboardPlatform),
      },
      {
        icon: Italic,
        label: "Italic",
        run: () => getActiveEditor()?.chain().focus().toggleItalic().run(),
        shortcutId: "italic",
        shortcutLabel: getProjectEditorShortcutLabel("italic", isMacKeyboardPlatform),
      },
      {
        icon: Underline,
        label: "Underline",
        run: () => getActiveEditor()?.chain().focus().toggleUnderline().run(),
        shortcutId: "underline",
        shortcutLabel: getProjectEditorShortcutLabel("underline", isMacKeyboardPlatform),
      },
      {
        icon: Strikethrough,
        label: "Strikethrough",
        run: () => getActiveEditor()?.chain().focus().toggleStrike().run(),
        shortcutId: "strikethrough",
        shortcutLabel: getProjectEditorShortcutLabel("strikethrough", isMacKeyboardPlatform),
      },
    ],
    [
      {
        icon: List,
        label: "Bullet List",
        run: () => getActiveEditor()?.chain().focus().toggleBulletList().run(),
        shortcutId: "bulletList",
        shortcutLabel: getProjectEditorShortcutLabel("bulletList", isMacKeyboardPlatform),
      },
      {
        icon: ListOrdered,
        label: "Numbered List",
        run: () => getActiveEditor()?.chain().focus().toggleOrderedList().run(),
        shortcutId: "numberedList",
        shortcutLabel: getProjectEditorShortcutLabel("numberedList", isMacKeyboardPlatform),
      },
      { icon: Quote, label: "Quote", run: () => getActiveEditor()?.chain().focus().toggleBlockquote().run() },
      { icon: Code, label: "Code", run: () => getActiveEditor()?.chain().focus().toggleCodeBlock().run() },
    ],
    [
      { icon: AlignLeft, label: "Left", run: () => getActiveEditor()?.chain().focus().setTextAlign("left").run() },
      { icon: AlignCenter, label: "Center", run: () => getActiveEditor()?.chain().focus().setTextAlign("center").run() },
      { icon: AlignRight, label: "Right", run: () => getActiveEditor()?.chain().focus().setTextAlign("right").run() },
    ],
    [
      {
        icon: LinkIcon,
        label: "Link",
        run: setLink,
        shortcutId: "link",
        shortcutLabel: getProjectEditorShortcutLabel("link", isMacKeyboardPlatform),
      },
      { icon: ImageIcon, label: "Image", run: insertImage },
      { icon: FileText, label: "File", run: insertFile },
      { icon: Minus, label: "Divider", run: () => getActiveEditor()?.chain().focus().setHorizontalRule().run() },
    ],
  ];

  const collectionCount = (label: CollectionLabel) => {
    return getWorkspaceCollectionCount({
      counts: collectionCounts,
      label,
      summary: workspaceSummary,
    });
  };
  const collectionCountIsExact = () => workspaceSummary.isExact;
  const navigateProject = useCallback((url: string) => {
    if (url === currentRouteUrl) {
      return;
    }

    setExternalPageLoading(true);
    router.push(url);
  }, [currentRouteUrl, router]);
  const replaceProjectRoute = useCallback((url: string) => {
    if (url === currentRouteUrl) {
      return;
    }

    setExternalPageLoading(true);
    router.replace(url);
  }, [currentRouteUrl, router]);
  const {
    prefetchProjectSettings,
    prefetchSidebarCollection,
  } = useProjectEditorPrefetch({
    collectionAvailabilityByLabel,
    collectionPages,
    filesSectionState,
    mediaSectionState,
    projectId,
    queryClient,
    usesManagedFilesLibrary,
    usesManagedMediaLibrary,
  });
  const discardDisposableNewPostById = useCallback(async (postId: string | null | undefined) => {
    const currentPostId = postId?.trim() ?? "";

    if (!currentPostId || !hasDiscardableNewPostId(currentPostId)) {
      return true;
    }

    try {
      const { ok, payload } = await requestProjectEditorContentAction<DiscardPostResponse>({
        action: {
          action: "discard_post",
          postId: currentPostId,
        },
        projectId,
      });

      if (!ok || !payload.success) {
        const isSafeToForgetCandidate =
          /Only untouched empty drafts can be discarded|Could not find that post/i.test(payload.error ?? "");

        if (isSafeToForgetCandidate) {
          forgetDiscardableNewPostId(currentPostId);
          return true;
        }

        throw new Error(payload.error ?? "Could not discard the empty post right now.");
      }

      forgetDiscardableNewPostId(currentPostId);
      autoSlugPostIdsRef.current.delete(currentPostId);
      dirtyPostIdsRef.current.delete(currentPostId);
      delete draftPostsRef.current[currentPostId];
      delete persistedPostsRef.current[currentPostId];
      removePostPayloadQueryData(currentPostId);
      localSeoStorage.clearFocusKeyword(currentPostId);
      invalidateWorkspaceCache();
      await clearStoredPostDraftState(currentPostId);

      const nextPosts = posts.filter((post) => post.id !== currentPostId);
      const nextPostsCount = Math.max(0, collectionCounts.posts - 1);
      const nextPostsPagination: ContentPagination = {
        ...collectionPagination,
        page: Math.min(
          collectionPagination.page,
          Math.max(1, Math.ceil(nextPostsCount / collectionPagination.pageSize)),
        ),
        totalItems: nextPostsCount,
        totalPages: Math.max(1, Math.ceil(nextPostsCount / collectionPagination.pageSize)),
      };

      const nextWorkspaceSummary: ContentWorkspaceSummary = {
        ...workspaceSummary,
        counts: {
          ...workspaceSummary.counts,
          posts: nextPostsCount,
        },
        pendingCollections: workspaceSummary.pendingCollections.filter((value) => value !== "posts"),
      };
      setPosts(nextPosts);
      setCollectionCounts((currentCounts) => ({
        ...currentCounts,
        posts: Math.max(0, currentCounts.posts - 1),
      }));
      setWorkspaceSummary(nextWorkspaceSummary);
      syncWorkspaceQueryData({
        ...(queryClient.getQueryData<WorkspacePayload>(projectEditorQueryKeys.workspace(projectId)) ?? {
          capabilities: {
            canManageAuthors: canManageAuthorDirectory,
            canManageTaxonomy,
          },
          counts: nextWorkspaceSummary.counts,
          contentRuntime,
          message: loadingMessage ?? undefined,
          postSidebarConfig: savedPostSidebarConfig,
          primaryContentFormat: initialWorkspacePayload?.primaryContentFormat ?? "html",
          workspaceState: workspaceState ?? "ready",
          workspaceSummary: nextWorkspaceSummary,
        }),
        counts: nextWorkspaceSummary.counts,
        workspaceSummary: nextWorkspaceSummary,
      });
      syncWorkspaceSummaryQueryData(nextWorkspaceSummary);
      setCollectionPagination(nextPostsPagination);
        if (canOptimisticallySyncPostsList) {
          syncPostsPageQueryData(currentPostsListPage, {
            authors: postEditorOptionsReady ? postAuthorOptions : authors,
            categories: postEditorOptionsReady ? categories : [],
            editorOptionsState: postEditorOptionsReady ? "full" : "warm",
            pagination: nextPostsPagination,
            posts: nextPosts,
            tags: postEditorOptionsReady ? tags : [],
        } satisfies PostsPagePayload);
      } else {
        invalidateCollectionCache("Posts");
      }
      setPostRevisions([]);
      setPostRevisionsLoadError(null);
      setPostSlugDraft("");
      setIsEditingPostSlug(false);
      return true;
    } catch (error) {
      toast.error(getProductionErrorMessage(error, "Could not discard the empty post right now."));
      return false;
    }
  }, [
    autoSlugPostIdsRef,
    clearStoredPostDraftState,
    collectionCounts.posts,
    collectionPagination,
    currentPostsListPage,
    dirtyPostIdsRef,
    draftPostsRef,
    forgetDiscardableNewPostId,
    hasDiscardableNewPostId,
    invalidateCollectionCache,
    invalidateWorkspaceCache,
    localSeoStorage,
    postAuthorOptions,
    postEditorOptionsReady,
    posts,
    persistedPostsRef,
    projectId,
    queryClient,
    removePostPayloadQueryData,
    syncPostsPageQueryData,
    syncWorkspaceQueryData,
    syncWorkspaceSummaryQueryData,
    tags,
    categories,
    authors,
    canOptimisticallySyncPostsList,
    canManageAuthorDirectory,
    canManageTaxonomy,
    contentRuntime,
    initialWorkspacePayload?.primaryContentFormat,
    loadingMessage,
    savedPostSidebarConfig,
    setIsEditingPostSlug,
    setPostSlugDraft,
    workspaceState,
    workspaceSummary,
  ]);
  const discardCurrentDisposableNewPost = useCallback(() => {
    const currentPostId = routePostId ?? selectedPostIdRef.current;

    if (!currentPostId) {
      return Promise.resolve(true);
    }

    return discardDisposableNewPostById(currentPostId);
  }, [discardDisposableNewPostById, routePostId, selectedPostIdRef]);
  prepareForNavigationAwayFromPostEditorRef.current = discardCurrentDisposableNewPost;

  useEffect(() => {
    if (!pendingDiscardablePostRouteId) {
      return;
    }

    if (routePostId === pendingDiscardablePostRouteId || !hasDiscardableNewPostId(pendingDiscardablePostRouteId)) {
      setPendingDiscardablePostRouteId(null);
    }
  }, [hasDiscardableNewPostId, pendingDiscardablePostRouteId, routePostId]);

  const requestPostEditorNavigation = useCallback(
    (
      action: () => void | Promise<void>,
      proceedLabel = "Discard and Continue",
      onCancel?: () => void,
    ) => {
      requestUnsavedChangesConfirmation(async () => {
        const discarded = await discardCurrentDisposableNewPost();

        if (!discarded) {
          onCancel?.();
          return;
        }

        await action();
      }, proceedLabel, onCancel);
    },
    [discardCurrentDisposableNewPost, requestUnsavedChangesConfirmation],
  );

  useEffect(() => {
    if (!canAccessContent) {
      return;
    }

    const pendingDiscardIds = Array.from(readDiscardableNewPostIds()).filter(
      (postId) => postId !== routePostId && postId !== pendingDiscardablePostRouteId,
    );

    if (!pendingDiscardIds.length) {
      return;
    }

    let cancelled = false;

    void (async () => {
      for (const postId of pendingDiscardIds) {
        const discarded = await discardDisposableNewPostById(postId);

        if (cancelled || !discarded) {
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    canAccessContent,
    discardDisposableNewPostById,
    pendingDiscardablePostRouteId,
    readDiscardableNewPostIds,
    routePostId,
  ]);

  const {
    buildProjectUrl,
    openProjectSettings,
    projectSettingsHref,
    projectSettingsSidebarItems,
    projectSidebarCollectionItems,
  } = useProjectEditorNavigation({
    activeSettingsTab,
    canUpdateProject,
    collectionCount,
    collectionCountIsExact,
    currentPostsListPage,
    currentProjectSlug,
    currentRouteUrl,
    externalPageLoading,
    hasRoutePostInMemory,
    isPostRoute,
    isSelectedCollectionVisible,
    isSettingsView,
    collectionPages,
    navigatePush: navigateProject,
    navigateReplace: replaceProjectRoute,
    pathname,
    postContentView,
    requestUnsavedChangesConfirmation: requestPostEditorNavigation,
    resolvedWorkspace,
    routePostId,
    routePostsPage,
    routeSection,
    routeSettingsTab,
    selectedCollection,
    selectedPostId,
    selectedSidebarItem,
    setActiveSettingsTab,
    setCollectionPages,
    setLoadingSelectedPost,
    setPostContentView,
    setPostSidePanelView,
    setSelectedCollection,
    setSelectedPostId,
    setSelectedPostLoadError,
    setSelectedSidebarItem,
    setShowSeoPanel,
    shouldForcePostsRouteSection,
    sidebarCollectionItems,
    prefetchCollection: prefetchSidebarCollection,
    prefetchSettings: prefetchProjectSettings,
  });
  const handleOpenProjects = useCallback(() => {
    requestProjectsNavigation({
      navigate: () => {
        router.push("/projects");
      },
      requestUnsavedChangesConfirmation: requestPostEditorNavigation,
      setExternalPageLoading,
    });
  }, [requestPostEditorNavigation, router]);

  const sidebarEntries = useMemo<Record<Exclude<CollectionLabel, "Posts">, SidebarCollectionEntry[]>>(
    () => ({
      Authors: authors.map((author) => ({
        id: author.id,
        label: author.name,
        meta: author.email ?? author.slug,
      })),
      Categories: categories.map((category) => ({
        id: category.id,
        label: category.name,
        meta: category.slug,
      })),
      Files: [],
      Media: media.map((item) => ({
        id: item.id,
        label: item.fileName,
        meta: item.objectPath,
      })),
      Tags: tags.map((tag) => ({
        id: tag.id,
        label: tag.name,
        meta: tag.slug,
      })),
    }),
    [authors, categories, media, tags],
  );

  const getSelectedTaxonomyIds = (collection: TaxonomyCollectionLabel) =>
    collection === "Categories" ? selectedCategoryIds : selectedTagIds;

  const setSelectedTaxonomyIds = (collection: TaxonomyCollectionLabel, ids: string[]) => {
    if (collection === "Categories") {
      setSelectedCategoryIds(ids);
      return;
    }

    setSelectedTagIds(ids);
  };

  const handleTaxonomyNameChange = (collection: TaxonomyCollectionLabel, value: string) => {
    if (collection === "Categories") {
      const nextDraft = getNextTaxonomyDraftNameChange({
        currentName: newCategoryName,
        currentSlug: newCategorySlug,
        nextName: value,
      });

      setNewCategoryName(nextDraft.nextName);

      if (nextDraft.nextSlug !== null) {
        setNewCategorySlug(nextDraft.nextSlug);
      }

      return;
    }

    const nextDraft = getNextTaxonomyDraftNameChange({
      currentName: newTagName,
      currentSlug: newTagSlug,
      nextName: value,
    });

    setNewTagName(nextDraft.nextName);

    if (nextDraft.nextSlug !== null) {
      setNewTagSlug(nextDraft.nextSlug);
    }
  };

  const handleTaxonomySlugChange = (collection: TaxonomyCollectionLabel, value: string) => {
    const normalizedSlug = getTaxonomySlugInputValue(value);

    if (collection === "Categories") {
      setNewCategorySlug(normalizedSlug);
      return;
    }

    setNewTagSlug(normalizedSlug);
  };

  const togglePostSelection = (postId: string, checked: boolean) => {
    setSelectedPostIds((currentIds) =>
      getNextSelectedPostIds({
        checked,
        postId,
        posts,
        selectedPostIds: currentIds,
      }),
    );
  };

  const toggleAllPostSelection = (checked: boolean) => {
    setSelectedPostIds(checked ? getSelectablePostIds(posts) : []);
  };

  const requestDeletePosts = (postIds: string[]) => {
    const { pendingDelete, permissionDenied } = getPendingPostsDeleteCandidate({
      formatPostTitle: getPostTitle,
      postIds,
      posts,
    });

    if (!pendingDelete && !permissionDenied) {
      return;
    }

    if (permissionDenied) {
      toast.error("You do not have permission to delete one or more selected posts.");
      return;
    }

    setPendingPostsDelete(pendingDelete);
  };

  const requestDeleteSelectedPost = () => {
    if (!selectedPost) {
      return;
    }

    if (selectedPost.canWrite === false || !isCurrentPostEditable) {
      toast.error("You do not have permission to delete this post.");
      return;
    }

    setPendingPostsDelete({
      ids: [selectedPost.id],
      label: getPostTitle(selectedPost.title),
    });
  };

  const toggleTaxonomySelection = (
    collection: TaxonomyCollectionLabel,
    entryId: string,
    checked: boolean,
  ) => {
    setSelectedTaxonomyIds(
      collection,
      getNextSelectedTaxonomyIds({
        checked,
        currentIds: getSelectedTaxonomyIds(collection),
        entryId,
      }),
    );
  };

  const toggleAllTaxonomySelection = (
    collection: TaxonomyCollectionLabel,
    entryIds: string[],
    checked: boolean,
  ) => {
    setSelectedTaxonomyIds(collection, checked ? entryIds : []);
  };

  const resetTaxonomyEditor = (collection: TaxonomyCollectionLabel) => {
    if (collection === "Categories") {
      setNewCategoryName("");
      setNewCategorySlug("");
      setNewCategoryDescription("");
      setNewCategoryParentId("none");
    } else {
      setNewTagName("");
      setNewTagSlug("");
      setNewTagDescription("");
    }

    setEditingTaxonomyEntry((current) => (current?.collection === collection ? null : current));
  };

  const applyUpdatedTaxonomyEntry = (
    collection: TaxonomyCollectionLabel,
    entry: ContentCategory | ContentTag,
  ) => {
    if (collection === "Categories") {
      const nextCategory = entry as ContentCategory;
      setCategories((currentCategories) =>
        currentCategories.map((category) => (category.id === nextCategory.id ? nextCategory : category)),
      );
      setCategoryOptions((currentCategories) =>
        currentCategories.map((category) => (category.id === nextCategory.id ? nextCategory : category)),
      );
      return;
    }

    const nextTag = entry as ContentTag;
    setTags((currentTags) => currentTags.map((tag) => (tag.id === nextTag.id ? nextTag : tag)));
  };

  const startEditingTaxonomyEntry = (
    collection: TaxonomyCollectionLabel,
    entry: ContentCategory | ContentTag,
  ) => {
    setEditingTaxonomyEntry({
      collection,
      entryId: entry.id,
    });

    if (collection === "Categories") {
      const category = entry as ContentCategory;
      setNewCategoryName(category.name);
      setNewCategorySlug(category.slug);
      setNewCategoryDescription(category.description ?? "");
      setNewCategoryParentId(category.parentCategoryId ?? "none");
    } else {
      const tag = entry as ContentTag;
      setNewTagName(tag.name);
      setNewTagSlug(tag.slug);
      setNewTagDescription(tag.description ?? "");
    }

    setShowSeoPanel(true);
  };

  const createPost = async () => {
    if (!isContentReady) {
      return;
    }

    setCreatingPost(true);

    try {
      const payload = await runProjectEditorContentAction<UpdatePostResponse>({
        action: {
          action: "create_post",
        },
        fallbackMessage: "Could not create the post right now.",
        projectId,
      });

      if (!payload.post) {
        throw new Error(payload.error ?? "Could not create the post right now.");
      }

      const nextPost = payload.post;
      const nextPostAuthorOptions = postAuthorOptions;
      const nextCategories = categories;
      const nextTags = tags;
      const nextPostEditorOptionsReady = postEditorOptionsReady;

      rememberDiscardableNewPostId(nextPost.id);
      setPendingDiscardablePostRouteId(nextPost.id);
      markPersistedPost(nextPost);
      const nextPostsCount = collectionCounts.posts + 1;
      const nextPostsPagination: ContentPagination = {
        page: 1,
        pageSize: postsPageSize,
        totalItems: nextPostsCount,
        totalPages: Math.max(1, Math.ceil(nextPostsCount / postsPageSize)),
      };
      const nextWorkspacePayload: WorkspacePayload = {
        capabilities: {
          canManageAuthors: canManageAuthorDirectory,
          canManageTaxonomy,
        },
        counts: {
          ...collectionCounts,
          posts: nextPostsCount,
        },
        contentRuntime,
        message: loadingMessage ?? undefined,
        postSidebarConfig: savedPostSidebarConfig,
        primaryContentFormat: nextPost.contentFormat,
        workspaceSummary: {
          counts: {
            ...collectionCounts,
            posts: nextPostsCount,
          },
          isDerived: workspaceSummary.isDerived,
          isExact: workspaceSummary.isExact,
          pendingCollections: workspaceSummary.pendingCollections.filter((value) => value !== "posts"),
          refreshedAt: workspaceSummary.refreshedAt,
        },
        workspaceState: workspaceState ?? "ready",
      };
      const nextPostsPayload: PostsPagePayload = {
        authors: nextPostEditorOptionsReady ? nextPostAuthorOptions : authors,
        categories: nextPostEditorOptionsReady ? nextCategories : [],
        editorOptionsState: nextPostEditorOptionsReady ? "full" : "warm",
        pagination: nextPostsPagination,
        posts: [nextPost, ...posts.filter((post) => post.id !== nextPost.id)].slice(0, postsPageSize),
        tags: nextPostEditorOptionsReady ? nextTags : [],
      };

      setSelectedCollection("Posts");
      setSelectedSidebarItem("Posts");
      setPageForCollection("Posts", 1);
      setCollectionCounts(nextWorkspacePayload.counts);
      setWorkspaceSummary({
        counts: nextWorkspacePayload.counts,
        isDerived: workspaceSummary.isDerived,
        isExact: workspaceSummary.isExact,
        pendingCollections: workspaceSummary.pendingCollections.filter((value) => value !== "posts"),
        refreshedAt: workspaceSummary.refreshedAt,
      });
      setCollectionPagination((currentPagination) =>
        canOptimisticallySyncPostsList ? nextPostsPagination : currentPagination,
      );
      setPosts((currentPosts) => [
        nextPost,
        ...currentPosts.filter((post) => post.id !== nextPost.id),
      ]);
      if (shouldKeepAutoSlugSynced({ autoManaged: true, event: "create" })) {
        autoSlugPostIdsRef.current.add(nextPost.id);
      }
      primePostEditorCache({
        post: nextPost,
        postId: nextPost.id,
      });
      if (!nextPostEditorOptionsReady) {
        prefetchPostPayloadQueryData(nextPost.id);
      }
      syncWorkspaceQueryData(nextWorkspacePayload);
      syncWorkspaceSummaryQueryData(nextWorkspacePayload.workspaceSummary);
      if (canOptimisticallySyncPostsList) {
        syncPostsPageQueryData(1, nextPostsPayload);
      } else {
        invalidateCollectionCache("Posts");
      }
      navigateProject(buildProjectUrl({ postId: nextPost.id }));
    } catch (error) {
      toast.error(getProductionErrorMessage(error, "Could not create the post right now."));
    } finally {
      setCreatingPost(false);
    }
  };

  const createCollectionEntry = async (collection: Extract<CollectionLabel, "Authors" | "Categories" | "Tags">) => {
    const apiCollection = getCollectionApiName(collection);

    if (!apiCollection || !isContentReady) {
      return;
    }

    if (collection !== "Authors" && !canManageTaxonomy) {
      toast.error("Only project owners, admins, and editors can manage categories and tags.");
      return;
    }

    const label = getCollectionPromptLabel(collection);
    const inlineName =
      collection === "Categories" ? newCategoryName : collection === "Tags" ? newTagName : "";
    const inlineSlug =
      collection === "Categories" ? newCategorySlug : collection === "Tags" ? newTagSlug : "";
    const inlineDescription =
      collection === "Categories"
        ? newCategoryDescription
        : collection === "Tags"
          ? newTagDescription
          : "";
    const parentCategoryId =
      collection === "Categories" && newCategoryParentId !== "none" ? newCategoryParentId : null;
    const promptedName =
      collection === "Authors" ? (window.prompt(`Enter ${label} name`) ?? "") : inlineName;
    const name = promptedName.trim();
    const slug = inlineSlug.trim() || null;
    const description = inlineDescription.trim() || null;

    if (!name) {
      return;
    }

    setCreatingCollectionEntry(true);

    try {
      const payload = await runProjectEditorContentAction<CreateCollectionResponse>({
        action: {
          action: "create_collection_entry",
          collection: apiCollection,
          description,
          name,
          parentCategoryId,
          slug,
        },
        fallbackMessage: `Could not create the ${label} right now.`,
        projectId,
      });

      if (!payload.entry) {
        throw new Error(payload.error ?? `Could not create the ${label} right now.`);
      }

      if (apiCollection === "categories") {
        resetTaxonomyEditor("Categories");
      }

      if (apiCollection === "tags") {
        resetTaxonomyEditor("Tags");
      }

      invalidateWorkspaceCache();
      invalidateCollectionCache(collection);

      if (collection === "Categories" || collection === "Tags") {
        invalidateCollectionCache("Posts");
      }

      setPageForCollection(collection, collection === "Categories" ? currentCollectionPage : 1);
      await loadWorkspaceMeta({ force: true });
      setCollectionReloadToken((current) => current + 1);
    } catch (error) {
      toast.error(getProductionErrorMessage(error, `Could not create the ${label} right now.`));
    } finally {
      setCreatingCollectionEntry(false);
    }
  };

  const updateCollectionEntry = async (collection: TaxonomyCollectionLabel) => {
    if (!editingTaxonomyEntry || editingTaxonomyEntry.collection !== collection || !isContentReady) {
      return;
    }

    if (!canManageTaxonomy) {
      toast.error("Only project owners, admins, and editors can manage categories and tags.");
      return;
    }

    const apiCollection = getCollectionApiName(collection);

    if (!apiCollection) {
      return;
    }

    const label = getCollectionPromptLabel(collection);
    const name = (collection === "Categories" ? newCategoryName : newTagName).trim();
    const slug = (collection === "Categories" ? newCategorySlug : newTagSlug).trim() || null;
    const description =
      (collection === "Categories" ? newCategoryDescription : newTagDescription).trim() || null;
    const parentCategoryId =
      collection === "Categories" && newCategoryParentId !== "none" ? newCategoryParentId : null;

    if (!name) {
      toast.error(`Enter ${label} name first.`);
      return;
    }

    setCreatingCollectionEntry(true);

    try {
      const payload = await runProjectEditorContentAction<CreateCollectionResponse>({
        action: {
          action: "update_collection_entry",
          collection: apiCollection,
          description,
          entryId: editingTaxonomyEntry.entryId,
          name,
          parentCategoryId,
          slug,
        },
        fallbackMessage: `Could not update the ${label} right now.`,
        projectId,
      });

      if (!payload.entry) {
        throw new Error(payload.error ?? `Could not update the ${label} right now.`);
      }

      applyUpdatedTaxonomyEntry(collection, payload.entry as ContentCategory | ContentTag);
      resetTaxonomyEditor(collection);
      invalidateWorkspaceCache();
      invalidateCollectionCache(collection);
      invalidateCollectionCache("Posts");
      toast.success(`${collection === "Categories" ? "Category" : "Tag"} updated.`);
    } catch (error) {
      toast.error(getProductionErrorMessage(error, `Could not update the ${label} right now.`));
    } finally {
      setCreatingCollectionEntry(false);
    }
  };

  const deleteCollectionEntries = async () => {
    if (!pendingTaxonomyDelete || !isContentReady) {
      return;
    }

    if (!canManageTaxonomy) {
      toast.error("Only project owners, admins, and editors can manage categories and tags.");
      return;
    }

    const apiCollection = getCollectionApiName(pendingTaxonomyDelete.collection);

    if (!apiCollection) {
      return;
    }

    setIsDeletingCollectionEntry(true);

    try {
      const payload = await runProjectEditorContentAction<DeleteCollectionResponse>({
        action: {
          action: "delete_collection_entries",
          collection: apiCollection,
          entryIds: pendingTaxonomyDelete.ids,
        },
        fallbackMessage: "Could not delete that entry right now.",
        projectId,
      });

      if (!payload.success) {
        throw new Error(payload.error ?? "Could not delete that entry right now.");
      }

      const deletedIdSet = new Set(pendingTaxonomyDelete.ids);

      if (pendingTaxonomyDelete.collection === "Categories") {
        setCategories((currentCategories) =>
          currentCategories.filter((category) => !deletedIdSet.has(category.id)),
        );
        setSelectedCategoryIds((currentIds) => currentIds.filter((id) => !deletedIdSet.has(id)));
        setPosts((currentPosts) => {
          const nextPosts = currentPosts.map((post) => {
            if (!post.categoryIds.some((id) => deletedIdSet.has(id))) {
              return post;
            }

            const nextPost = {
              ...post,
              categoryIds: post.categoryIds.filter((value) => !deletedIdSet.has(value)),
            };
            const persistedPost = persistedPostsRef.current[nextPost.id];

            draftPostsRef.current[nextPost.id] = nextPost;
            if (persistedPost) {
              persistedPostsRef.current[nextPost.id] = {
                ...persistedPost,
                categoryIds: persistedPost.categoryIds.filter((value) => !deletedIdSet.has(value)),
              };
            }
            return nextPost;
          });

          return nextPosts;
        });
      } else {
        setTags((currentTags) => currentTags.filter((tag) => !deletedIdSet.has(tag.id)));
        setSelectedTagIds((currentIds) => currentIds.filter((id) => !deletedIdSet.has(id)));
        setPosts((currentPosts) => {
          const nextPosts = currentPosts.map((post) => {
            if (!post.tagIds.some((id) => deletedIdSet.has(id))) {
              return post;
            }

            const nextPost = {
              ...post,
              tagIds: post.tagIds.filter((value) => !deletedIdSet.has(value)),
            };
            const persistedPost = persistedPostsRef.current[nextPost.id];

            draftPostsRef.current[nextPost.id] = nextPost;
            if (persistedPost) {
              persistedPostsRef.current[nextPost.id] = {
                ...persistedPost,
                tagIds: persistedPost.tagIds.filter((value) => !deletedIdSet.has(value)),
              };
            }
            return nextPost;
          });

          return nextPosts;
        });
      }

      invalidateWorkspaceCache();
      invalidateCollectionCache(pendingTaxonomyDelete.collection);

      if (pendingTaxonomyDelete.collection === "Categories" || pendingTaxonomyDelete.collection === "Tags") {
        invalidateCollectionCache("Posts");
      }

      await loadWorkspaceMeta({ force: true });
      setCollectionReloadToken((current) => current + 1);
      setPendingTaxonomyDelete(null);
    } catch (error) {
      toast.error(getProductionErrorMessage(error, "Could not delete that entry right now."));
    } finally {
      setIsDeletingCollectionEntry(false);
    }
  };

  const deletePosts = async () => {
    if (!pendingPostsDelete || !isContentReady) {
      return;
    }

    const normalizedPostIds = Array.from(
      new Set(pendingPostsDelete.ids.map((postId) => postId.trim()).filter(Boolean)),
    );

    if (!normalizedPostIds.length) {
      return;
    }

    const nonWritablePost = posts.find(
      (post) => normalizedPostIds.includes(post.id) && post.canWrite === false,
    );

    if (nonWritablePost) {
      toast.error("You do not have permission to delete one or more selected posts.");
      return;
    }

    setIsDeletingPosts(true);

    try {
      const payload = await runProjectEditorContentAction<DeleteCollectionResponse>({
        action: {
          action: "delete_posts",
          postIds: normalizedPostIds,
        },
        fallbackMessage: "Could not delete the selected posts right now.",
        projectId,
      });

      if (!payload.success) {
        throw new Error(payload.error ?? "Could not delete the selected posts right now.");
      }

      const deletedIdSet = new Set(normalizedPostIds);
      const didDeleteOpenPost = Boolean(
        (selectedPostIdRef.current && deletedIdSet.has(selectedPostIdRef.current)) ||
          (routePostId && deletedIdSet.has(routePostId)),
      );

      for (const postId of normalizedPostIds) {
        forgetDiscardableNewPostId(postId);
        autoSlugPostIdsRef.current.delete(postId);
        dirtyPostIdsRef.current.delete(postId);
        delete draftPostsRef.current[postId];
        delete persistedPostsRef.current[postId];
        removePostPayloadQueryData(postId);
        localSeoStorage.clearFocusKeyword(postId);
      }

      await Promise.all(
        normalizedPostIds.map((postId) => clearStoredPostDraftState(postId).catch(() => undefined)),
      );

      const nextPosts = posts.filter((post) => !deletedIdSet.has(post.id));
      const nextPostsCount = Math.max(0, collectionCounts.posts - normalizedPostIds.length);
      const nextTotalPages = Math.max(1, Math.ceil(nextPostsCount / collectionPagination.pageSize));
      const nextPage = Math.min(currentPostsListPage, nextTotalPages);
      const nextPostsPagination: ContentPagination = {
        ...collectionPagination,
        page: nextPage,
        totalItems: nextPostsCount,
        totalPages: nextTotalPages,
      };
      const nextWorkspaceSummary: ContentWorkspaceSummary = {
        ...workspaceSummary,
        counts: {
          ...workspaceSummary.counts,
          posts: nextPostsCount,
        },
        pendingCollections: workspaceSummary.pendingCollections.filter((value) => value !== "posts"),
      };

      invalidateWorkspaceCache();
      setPendingPostsDelete(null);
      setSelectedPostIds((currentIds) => currentIds.filter((id) => !deletedIdSet.has(id)));
      setPosts(nextPosts);
      setCollectionCounts((currentCounts) => ({
        ...currentCounts,
        posts: nextPostsCount,
      }));
      setWorkspaceSummary(nextWorkspaceSummary);
      syncWorkspaceQueryData({
        ...(queryClient.getQueryData<WorkspacePayload>(projectEditorQueryKeys.workspace(projectId)) ?? {
          capabilities: {
            canManageAuthors: canManageAuthorDirectory,
            canManageTaxonomy,
          },
          counts: nextWorkspaceSummary.counts,
          contentRuntime,
          message: loadingMessage ?? undefined,
          postSidebarConfig: savedPostSidebarConfig,
          primaryContentFormat: initialWorkspacePayload?.primaryContentFormat ?? "html",
          workspaceState: workspaceState ?? "ready",
          workspaceSummary: nextWorkspaceSummary,
        }),
        counts: nextWorkspaceSummary.counts,
        workspaceSummary: nextWorkspaceSummary,
      });
      syncWorkspaceSummaryQueryData(nextWorkspaceSummary);

      if (nextPage === currentPostsListPage) {
        setCollectionPagination(nextPostsPagination);

        if (canOptimisticallySyncPostsList) {
          syncPostsPageQueryData(currentPostsListPage, {
            authors: postEditorOptionsReady ? postAuthorOptions : authors,
            categories: postEditorOptionsReady ? categories : [],
            editorOptionsState: postEditorOptionsReady ? "full" : "warm",
            pagination: nextPostsPagination,
            posts: nextPosts,
            tags: postEditorOptionsReady ? tags : [],
          } satisfies PostsPagePayload);
        } else {
          invalidateCollectionCache("Posts");
        }
      } else {
        invalidateCollectionCache("Posts");
      }

      if (didDeleteOpenPost) {
        setSelectedPostLoadError(null);
        setSelectedPostId(null);
        setPostContentView("list");
        navigateToCollectionPage("Posts", nextPage);
      } else if (nextPage !== currentPostsListPage) {
        navigateToCollectionPage("Posts", nextPage);
      }

      toast.success(normalizedPostIds.length === 1 ? "Post deleted." : "Posts deleted.");
    } catch (error) {
      toast.error(
        getProductionErrorMessage(error, "Could not delete the selected posts right now."),
      );
    } finally {
      setIsDeletingPosts(false);
    }
  };

  const handleTitleChange = (value: string) => {
    if (!selectedPost || !canEditCurrentPost) {
      return;
    }

    updatePost(selectedPost.id, {
      slug: getDisplayedPostSlug({
        autoManaged: isPostSlugAutoManaged(selectedPost.id),
        persistedSlug: selectedPost.slug,
        title: value,
      }),
      title: value,
    });
  };

  const startPostSlugEdit = () => {
    if (!selectedPost || !canEditCurrentPost) {
      return;
    }

    setPostSlugDraft(displayedSelectedPostSlug);
    setIsEditingPostSlug(true);
  };

  const cancelPostSlugEdit = () => {
    setPostSlugDraft(selectedPost?.slug ?? "");
    setIsEditingPostSlug(false);
  };

  const savePostSlugEdit = () => {
    const currentPostId = selectedPostIdRef.current;
    const currentPost = currentPostId ? draftPostsRef.current[currentPostId] ?? selectedPost : selectedPost;

    if (!currentPost || !canEditCurrentPost) {
      return;
    }

    const nextSlug = slugifyContentValue(postSlugDraft) || "untitled";

    updatePost(currentPost.id, { slug: nextSlug }, { skipSync: true });

    if (
      !shouldKeepAutoSlugSynced({
        autoManaged: isPostSlugAutoManaged(currentPost.id),
        event: "manual_slug_save",
      })
    ) {
      autoSlugPostIdsRef.current.delete(currentPost.id);
    }

    setPostSlugDraft(nextSlug);
    setIsEditingPostSlug(false);
  };

  const uploadFeaturedImage = async (file: File) => {
    if (!selectedPost || !canEditCurrentPost) return;
    if (!canUploadFeaturedImage) {
      toast.error("Media uploads are not configured for this project.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported.");
      return;
    }

    setUploadingFeaturedImage(true);

    try {
      const validation = await validateImageUploadFile({
        file,
        label: file.name || "Image upload",
        maxBytes: MAX_MEDIA_UPLOAD_BYTES,
      });
      const uploads = await prepareContentRuntimeDirectUploads({
        endpoint: `/api/projects/${projectId}/media`,
        files: [
          {
            contentType: validation.contentType,
            name: file.name,
            size: file.size,
          },
        ],
        path: "",
      });
      const upload = uploads[0];

      if (!upload) {
        throw new Error("Could not prepare the image upload right now.");
      }

      await uploadPreparedContentRuntimeFile({
        file,
        upload,
      });

      const uploadedFiles = await completeContentRuntimeDirectUploads({
        endpoint: `/api/projects/${projectId}/media`,
        objectPaths: [upload.objectPath],
      });
      const signedUrl = uploadedFiles[0]?.signedUrl;

      if (signedUrl) {
        updatePost(selectedPost.id, { featuredImageUrl: signedUrl });
      }
    } catch (error) {
      toast.error(getProductionErrorMessage(error, "Could not upload the image right now."));
    } finally {
      setUploadingFeaturedImage(false);
    }
  };

  const paginationPages = useMemo(() => {
    if (collectionPagination.totalItemsExact === false || collectionPagination.totalPages <= 1) {
      return [];
    }

    const pages = new Set<number>([
      1,
      collectionPagination.totalPages,
      collectionPagination.page,
      collectionPagination.page - 1,
      collectionPagination.page + 1,
    ]);

    return Array.from(pages)
      .filter((page) => page >= 1 && page <= collectionPagination.totalPages)
      .sort((left, right) => left - right);
  }, [
    collectionPagination.page,
    collectionPagination.totalItemsExact,
    collectionPagination.totalPages,
  ]);

  const renderCollectionPagination = (className?: string) => {
    const hasPreviousPage =
      collectionPagination.hasPreviousPage ?? collectionPagination.page > 1;
    const hasNextPage =
      collectionPagination.hasNextPage ??
      collectionPagination.page < collectionPagination.totalPages;
    const hasExactTotals = collectionPagination.totalItemsExact !== false;

    if (hasExactTotals && collectionPagination.totalPages <= 1) {
      return null;
    }

    if (!hasExactTotals && !hasPreviousPage && !hasNextPage) {
      return null;
    }

    return (
      <Pagination className={className}>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={selectedCollection === "Posts" ? buildProjectUrl({ page: collectionPagination.page - 1 }) : undefined}
              onClick={(event) => {
                if (!shouldHandlePlainLinkNavigation(event)) {
                  return;
                }

                event.preventDefault();

                if (hasPreviousPage) {
                  navigateToCollectionPage(selectedCollection, collectionPagination.page - 1);
                }
              }}
              className={!hasPreviousPage ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
          {hasExactTotals
            ? paginationPages.map((page, index) => {
                const previousPage = paginationPages[index - 1];
                const showEllipsis = previousPage && page - previousPage > 1;

                return (
                  <Fragment key={page}>
                    {showEllipsis ? (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : null}
                    <PaginationItem>
                      <PaginationLink
                        href={selectedCollection === "Posts" ? buildProjectUrl({ page }) : undefined}
                        isActive={page === collectionPagination.page}
                        onClick={(event) => {
                          if (!shouldHandlePlainLinkNavigation(event)) {
                            return;
                          }

                          event.preventDefault();
                          navigateToCollectionPage(selectedCollection, page);
                        }}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  </Fragment>
                );
              })
            : (
              <PaginationItem>
                <span className="px-4 text-sm text-muted-foreground">
                  Page {collectionPagination.page}
                </span>
              </PaginationItem>
            )}
          <PaginationItem>
            <PaginationNext
              href={selectedCollection === "Posts" ? buildProjectUrl({ page: collectionPagination.page + 1 }) : undefined}
              onClick={(event) => {
                if (!shouldHandlePlainLinkNavigation(event)) {
                  return;
                }

                event.preventDefault();

                if (hasNextPage) {
                  navigateToCollectionPage(selectedCollection, collectionPagination.page + 1);
                }
              }}
              className={!hasNextPage ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  const runSelectedPostStatusTransition = async ({
    action,
    status,
  }: {
    action: ProjectEditorPostStatusTransitionAction;
    status: ContentPost["status"];
  }) => {
    await runProjectEditorPostStatusTransitionAction({
      action,
      canEditCurrentPost,
      contentRuntime,
      flushPostSave,
      focusMissingRequiredField: (fieldKey) => {
        if (fieldKey) {
          const missingFieldKey = `custom_field:${fieldKey}` as const;
          const missingSidebarNode = getProjectEditorResolvedPostSidebarNodes({
            config: savedPostSidebarConfig,
            contentRuntime,
            supportsPostRevisions,
          }).find((node) => node.kind === "field" && node.id === missingFieldKey && node.visible);

          setPostSidePanelView(
            missingSidebarNode?.parentId ? `page:${missingSidebarNode.parentId}` : "details",
          );
          return;
        }

        setPostSidePanelView("details");
      },
      getErrorMessage: getProductionErrorMessage,
      getResolvedSelectedPostForSave,
      isExpectedSessionError: (error) =>
        error instanceof Error &&
        (error.message === POST_SESSION_RECOVERED_SENTINEL ||
          error.message === POST_EDIT_CAPABILITY_CHANGED_SENTINEL),
      setIsPublishing,
      status,
      toastError: toast.error,
      toastSuccess: toast.success,
    });
  };

  const executePublish = async () => {
    await runSelectedPostStatusTransition({
      action: "publish_post",
      status: "published",
    });
  };

  const executeArchivePost = async () => {
    await runSelectedPostStatusTransition({
      action: "archive_post",
      status: "archived",
    });
  };

  const executeRestorePostToDraft = async () => {
    await runSelectedPostStatusTransition({
      action: "unpublish_post",
      status: "draft",
    });
  };

  const executeSavePost = async () => {
    await runProjectEditorPostSaveAction({
      canEditCurrentPost,
      flushPostSave,
      getErrorMessage: getProductionErrorMessage,
      getResolvedSelectedPostForSave,
      isExpectedSessionError: (error) =>
        error instanceof Error &&
        (error.message === POST_SESSION_RECOVERED_SENTINEL ||
          error.message === POST_EDIT_CAPABILITY_CHANGED_SENTINEL),
      toastError: toast.error,
      toastSuccess: toast.success,
    });
  };

  const handleConfirmPostAction = async () => {
    const action = pendingPostAction?.type;

    if (!action) {
      return;
    }

    if (action === "save") {
      await executeSavePost();
    } else if (action === "publish") {
      await executePublish();
    } else if (action === "unpublish") {
      await executeRestorePostToDraft();
    } else {
      await executeArchivePost();
    }

    setPendingPostAction(null);
  };

  const handleSavePost = () =>
    setPendingPostAction({
      confirmLabel: "Save post",
      description: "BaseBuddy will update the changed fields in this post.",
      title: "Save this post?",
      type: "save",
    });

  const handlePublish = () =>
    setPendingPostAction({
      confirmLabel: "Publish post",
      description: "BaseBuddy will apply the publish fields from this mapping.",
      title: "Publish this post?",
      type: "publish",
    });

  const handleArchivePost = () =>
    setPendingPostAction({
      confirmLabel: "Archive post",
      description: "BaseBuddy will move this post to the archived state.",
      title: "Archive this post?",
      type: "archive",
    });

  const handleRestorePostToDraft = () =>
    setPendingPostAction({
      confirmLabel: "Move to draft",
      description: "BaseBuddy will move this post back to draft.",
      title: "Move this post to draft?",
      type: "unpublish",
    });

  useLayoutEffect(() => {
    savePostShortcutRef.current = handleSavePost;
  });

  const clearPendingUnsavedChangesConfirmation = (options?: { invokeCancel?: boolean }) => {
    const cancelAction = pendingUnsavedChangesCancelActionRef.current;

    pendingUnsavedChangesActionRef.current = null;
    pendingUnsavedChangesCancelActionRef.current = null;
    setPendingUnsavedChangesAction(null);

    if (options?.invokeCancel) {
      cancelAction?.();
    }
  };

  const continuePendingUnsavedChangesAction = async () => {
    const action = pendingUnsavedChangesActionRef.current;
    clearPendingUnsavedChangesConfirmation();

    if (action) {
      await action();
    }
  };

  const handleProceedWithoutSaving = async () => {
    let restoredSlug: string | null = null;

    if (selectedPost) {
      const persistedPost = persistedPostsRef.current[selectedPost.id];

      if (persistedPost) {
        draftPostsRef.current[persistedPost.id] = persistedPost;
        setPosts((currentPosts) =>
          currentPosts.map((post) => (post.id === persistedPost.id ? persistedPost : post)),
        );
      }

      dirtyPostIdsRef.current.delete(selectedPost.id);
      await clearStoredPostDraftState(selectedPost.id);

      if (persistedPost) {
        restoredSlug = persistedPost.slug;
      }
    }

    if (restoredSlug !== null) {
      setPostSlugDraft(restoredSlug);
      setIsEditingPostSlug(false);
    } else if (isEditingPostSlug) {
      cancelPostSlugEdit();
    }

    await continuePendingUnsavedChangesAction();
  };

  const handleSaveAndContinue = async () => {
    await runProjectEditorPostSaveAndContinueAction({
      canEditCurrentPost,
      continuePendingUnsavedChangesAction,
      flushPostSave,
      getErrorMessage: getProductionErrorMessage,
      getResolvedSelectedPostForSave,
      isExpectedSessionError: (error) =>
        error instanceof Error &&
        (error.message === POST_SESSION_RECOVERED_SENTINEL ||
          error.message === POST_EDIT_CAPABILITY_CHANGED_SENTINEL),
      toastError: toast.error,
    });
  };

  const openPostEditor = (postId: string) => {
    requestPostEditorNavigation(async () => {
      const nextPost =
        draftPostsRef.current[postId] ?? persistedPostsRef.current[postId] ?? posts.find((post) => post.id === postId) ?? null;
      const hasReadyPostShell = isContentPostEditorPayloadReady(nextPost);

      if (nextPost) {
        primePostEditorCache({
          post: nextPost,
          postId,
        });
      }

      if (!hasReadyPostShell || !postEditorOptionsReady) {
        prefetchPostPayloadQueryData(postId);
      }

      if (!isPostRoute || selectedPostIdRef.current !== postId) {
        setSelectedSidebarItem("Posts");
        setSelectedCollection("Posts");
        setSelectedPostId(postId);
        setPostContentView("editor");
        setPostSidePanelView("details");
        setShowSeoPanel(true);
        setSelectedPostLoadError(null);
        setLoadingSelectedPost(!hasReadyPostShell);
        navigateProject(buildProjectUrl({ postId }));
      }
    }, "Discard and Open Post");
  };

  const handleTakeOverPostEditing = async () => {
    if (!canForcePostTakeover) {
      toast.error("Only owners, admins, and editors can take over an active post editing session.");
      return;
    }

    try {
      const result = await takeOverPendingPostEditing();

      if (!result?.payload.acquired || !result.post) {
        throw new Error("Could not take over this post right now.");
      }

      setSelectedSidebarItem("Posts");
      setSelectedCollection("Posts");
      setPostSidePanelView("details");
      setShowSeoPanel(true);

      if (selectedPostIdRef.current !== result.post.id || !isPostRoute) {
        navigateProject(buildProjectUrl({ postId: result.post.id }));
      }
    } catch (error) {
      toast.error(getProductionErrorMessage(error, "Could not take over this post right now."));
    }
  };

  const handleGoBackFromTakeover = () => {
    dismissPendingPostTakeover();

    if (isPostRoute) {
      navigateProject(buildProjectUrl({ page: currentPostsListPage }));
    }
  };

  const handleLostPostAccessAcknowledge = () => {
    acknowledgeLostPostAccess();

    if (isPostRoute) {
      navigateProject(buildProjectUrl({ page: currentPostsListPage }));
      return;
    }

    setSelectedSidebarItem("Posts");
    setSelectedCollection("Posts");
  };

  const handleRestoreStoredDraft = () => {
    const restoredDraft = restorePendingStoredDraft();

    if (!restoredDraft) {
      return;
    }

    setSelectedSidebarItem("Posts");
    setSelectedCollection("Posts");
    setPostSidePanelView("details");
    setShowSeoPanel(true);

    if (!isPostRoute || selectedPostIdRef.current !== restoredDraft.postId) {
      navigateProject(buildProjectUrl({ postId: restoredDraft.postId }));
    }
  };

  const handleRestoreLostPostDraft = () => {
    const restoredDraft = restorePendingLostPostDraft();

    if (!restoredDraft) {
      return;
    }

    setSelectedSidebarItem("Posts");
    setSelectedCollection("Posts");
    setPostSidePanelView("details");
    setShowSeoPanel(true);

    if (!isPostRoute || selectedPostIdRef.current !== restoredDraft.postId) {
      navigateProject(buildProjectUrl({ postId: restoredDraft.postId }));
    }

    toast.message(`Restoring the preserved takeover draft for ${restoredDraft.postTitle}.`);
  };

  const handleDiscardStoredDraft = async () => {
    const dismissedDraft = await dismissPendingStoredDraft();

    if (!dismissedDraft) {
      return;
    }

    toast.message(`Discarded the local recovery draft for ${dismissedDraft.postTitle}.`);
  };

  const handleDiscardLostPostDraft = async () => {
    const dismissedDraft = await dismissPendingLostPostDraft();

    if (!dismissedDraft) {
      return;
    }

    toast.message(`Discarded the preserved takeover draft for ${dismissedDraft.postTitle}.`);
  };

  const handleProjectSlugUnlock = () => {
    if (!canUpdateProject || isSavingProjectSettings) {
      return;
    }

    setShowProjectSlugUnlockDialog(true);
  };

  const handleProjectSlugUnlockProceed = () => {
    setShowProjectSlugUnlockDialog(false);
    setIsProjectSlugLocked(false);
  };

  const handlePostSidebarConfigRestoreSaved = () => {
    setPostSidebarConfigDraft(savedPostSidebarConfig);
  };

  const handlePostSidebarConfigResetToDefault = () => {
    setPostSidebarConfigDraft(
      createProjectEditorDefaultPostSidebarConfig({
        contentRuntime,
        supportsPostRevisions,
      }),
    );
  };

  const handlePostSidebarConfigSave = async () => {
    await runProjectEditorPostSidebarConfigSaveAction({
      canUpdateProject,
      getErrorMessage: getProductionErrorMessage,
      hasChanges: hasPostSidebarConfigChanges,
      invalidateWorkspaceCache,
      postSidebarConfigDraft,
      projectId,
      saveProjectPostSidebarConfig: saveProjectPostSidebarConfigMutation,
      setIsSavingPostSidebarConfig,
      setPostSidebarConfigDraft,
      setSavedPostSidebarConfig,
      syncPostSidebarWorkspacePayload: (postSidebarConfig) => {
        syncWorkspaceQueryData({
          ...(queryClient.getQueryData<WorkspacePayload>(projectEditorQueryKeys.workspace(projectId)) ?? {
            capabilities: {
              canManageAuthors: canManageAuthorDirectory,
              canManageTaxonomy,
            },
            counts: collectionCounts,
            contentRuntime,
            message: loadingMessage ?? undefined,
            postSidebarConfig,
            primaryContentFormat: initialWorkspacePayload?.primaryContentFormat ?? "html",
            workspaceState: workspaceState ?? "ready",
            workspaceSummary,
          }),
          postSidebarConfig,
        } satisfies WorkspacePayload);
      },
      toastError: toast.error,
      toastSuccess: toast.success,
      validationError: getProjectEditorPostSidebarValidationError(postSidebarConfigDraft),
    });
  };

  const handleProjectSettingsSave = async () => {
    await runProjectEditorSettingsSaveAction({
      buildProjectUrl,
      canUpdateProject,
      currentPostsListPage,
      currentProjectSlug,
      getErrorMessage: getProductionErrorMessage,
      isPostRoute,
      projectId,
      replaceProjectRoute,
      selectedCollection,
      selectedPostId: selectedPostIdRef.current,
      selectedSidebarItem,
      setIsSavingProjectSettings,
      settingsNameDraft,
      settingsSlugDraft,
      settingsWebsiteUrlDraft,
      syncProjectSettings: (project) => {
        setCurrentProjectName(project.name);
        setCurrentProjectSlug(project.slug);
        setCurrentProjectWebsiteUrl(project.websiteUrl ?? "");
        setSettingsNameDraft(project.name);
        setSettingsSlugDraft(project.slug);
        setSettingsWebsiteUrlDraft(project.websiteUrl ?? "");
        setIsProjectSlugLocked(true);
      },
      toastError: toast.error,
      toastSuccess: toast.success,
      updateProjectSettings: updateProjectSettingsMutation,
    });
  };

  const openMappedContentMappingDialog = useCallback(
    async (collection: CollectionLabel) => {
      if (!canUpdateProject) {
        toast.error("You do not have permission to update this project.");
        return;
      }

      const entryCollection = getProjectEditorMappingDialogEntryCollection({
        collection,
        workspaceState,
      });
      prepareMappingDialog(entryCollection);
      setSettingsMappingError(null);
      setSavedMappingError(null);
      setLoadingSettingsMappingCollection(collection);
      setLoadingSavedMapping(true);
      setSettingsAvailableSupabaseBuckets([]);
      clearSavedMappingValues();
      resetMappingDetectionState();

      setLoadingMappingDetection(true);
      void loadMappingTableCatalog();

      if (workspaceState === "mapping_draft" && entryCollection === "Posts") {
        setLoadingSavedMapping(false);
        return;
      }

      try {
        const mappingPayload = (await fetchProjectEditorStoredMapping(projectId)) as ProjectEditorSavedMappingPayload & {
          error?: string;
        };

        applySavedMappingPayload(mappingPayload);
      } catch (error) {
        const message = getProductionErrorMessage(error, "Could not load mapping data.");
        setSettingsMappingError(message);
        setSavedMappingError(message);
        setSettingsAvailableSupabaseBuckets([]);
        setLoadingMappingDetection(false);
      } finally {
        setLoadingSavedMapping(false);
        setLoadingSettingsMappingCollection(null);
      }
    },
    [
      applySavedMappingPayload,
      canUpdateProject,
      clearSavedMappingValues,
      loadMappingTableCatalog,
      prepareMappingDialog,
      projectId,
      resetMappingDetectionState,
      setLoadingMappingDetection,
      workspaceState,
    ],
  );

  const handleRequestManualMappingDetection = useCallback(
    async (tableRef?: string) => {
      const normalizedTableRef = tableRef?.trim() || mappingManualTableRef.trim();

      if (!normalizedTableRef) {
        toast.error("Select a table first.");
        return;
      }

      setMappingDetectionMode("manual");
      setLoadingMappingDetection(true);
      setMappingDetection(null);
      setMappingDetectionError(null);
      setMappingManualTableRef(normalizedTableRef);
      setMappingSelectedTableRef(normalizedTableRef);

      try {
        const payload = await fetchProjectEditorMappingDetection(projectId, {
          tableRef: normalizedTableRef,
        });

        setMappingDetection(payload);
        setMappingSelectedTableRef(normalizedTableRef);
      } catch (error) {
        setMappingDetection(null);
        setMappingDetectionError(
          getProductionErrorMessage(
            error,
            "Could not detect fields for the selected table right now.",
          ),
        );
      } finally {
        setLoadingMappingDetection(false);
      }
    },
    [
      mappingManualTableRef,
      projectId,
      setLoadingMappingDetection,
      setMappingDetection,
      setMappingDetectionError,
      setMappingDetectionMode,
      setMappingManualTableRef,
      setMappingSelectedTableRef,
    ],
  );

  const handleOpenSettingsMapping = async (collection: CollectionLabel) => {
    if (!canUpdateProject) {
      toast.error("You do not have permission to update this project.");
      return;
    }

    await openMappedContentMappingDialog(collection);
  };

  const handleDeleteProject = async () => {
    await runProjectEditorDeleteAction({
      canDeleteProject,
      deleteProject: deleteProjectMutation,
      getErrorMessage: getProductionErrorMessage,
      isDeleteProjectConfirmationValid,
      isDeletingProject,
      navigateAfterDelete: () => {
        router.push("/projects");
        router.refresh();
      },
      projectId,
      resetDeleteProjectConfirmation: () => setDeleteProjectConfirmation(""),
      setExternalPageLoading,
      setIsDeletingProject,
      setShowDeleteProjectDialog,
      toastError: toast.error,
      toastSuccess: toast.success,
    });
  };

  const renderPostsCollectionPage = () => {
    return (
      <ProjectEditorScrollPane>
        <ProjectEditorPostsCollectionPage
          accessNotice={collectionAccessNotices.Posts}
          authorsById={authorsById}
          collectionPagination={collectionPagination}
          creatingPost={creatingPost}
          currentProjectName={currentProjectName}
          getPostHref={(postId) => buildProjectUrl({ postId })}
          hasPostsQueryControlsActive={hasPostsQueryControlsActive}
          onClearSelection={() => setSelectedPostIds([])}
          onCreatePost={createPost}
          onOpenPostEditor={openPostEditor}
          onRequestDeletePost={(postId) => requestDeletePosts([postId])}
          onRequestDeleteSelection={() => requestDeletePosts(selectedPostIds)}
          onResetView={() => {
            setPostsSearchQuery(DEFAULT_CONTENT_POSTS_QUERY.search);
            setPostsStatusFilter(DEFAULT_CONTENT_POSTS_QUERY.status);
            setPostsSort(DEFAULT_CONTENT_POSTS_QUERY.sort);
          }}
          onSearchQueryChange={setPostsSearchQuery}
          onSortChange={setPostsSort}
          onStatusFilterChange={setPostsStatusFilter}
          onToggleAllSelection={toggleAllPostSelection}
          onToggleSelection={togglePostSelection}
          pagination={renderCollectionPagination("mt-8 justify-start")}
          posts={posts}
          postsListIndexState={postsListIndexState}
          postsSearchQuery={postsSearchQuery}
          showAuthorColumn={postsListUiCapabilities.showAuthorColumn}
          showSlugColumn={postsListUiCapabilities.showSlugColumn}
          showStatusControls={postsListUiCapabilities.showStatusControls}
          postsSort={postsSort}
          postsStatusFilter={postsStatusFilter}
          selectedPostIds={selectedPostIds}
        />
      </ProjectEditorScrollPane>
    );
  };

  const renderSettingsView = () => (
    <ProjectEditorScrollPane>
      <ProjectSettingsView
        activeSettingsTab={activeSettingsTab}
        canDeleteProject={canDeleteProject}
        canUpdateProject={canUpdateProject}
        contentRuntime={contentRuntime}
        handleOpenSettingsMapping={handleOpenSettingsMapping}
        handlePostSidebarConfigResetToDefault={handlePostSidebarConfigResetToDefault}
        handlePostSidebarConfigRestoreSaved={handlePostSidebarConfigRestoreSaved}
        handlePostSidebarConfigSave={handlePostSidebarConfigSave}
        handleUnmapSettingsMapping={handleUnmapSettingsMapping}
        handleProjectSlugUnlock={handleProjectSlugUnlock}
        handleProjectSettingsSave={handleProjectSettingsSave}
        hasPostSidebarConfigChanges={hasPostSidebarConfigChanges}
        hasProjectSettingsChanges={hasProjectSettingsChanges}
        isDeletingProject={isDeletingProject}
        isProjectSlugLocked={isProjectSlugLocked}
        isSavingPostSidebarConfig={isSavingPostSidebarConfig}
        isSavingProjectSettings={isSavingProjectSettings}
        loadingSettingsMappingCollection={loadingSettingsMappingCollection}
        nextProjectUrl={nextProjectUrl}
        normalizedSettingsSlug={normalizedSettingsSlug}
        postSidebarConfigDraft={postSidebarConfigDraft}
        projectId={projectId}
        setPostSidebarConfigDraft={setPostSidebarConfigDraft}
        setIsProjectSlugLocked={setIsProjectSlugLocked}
        setSettingsNameDraft={setSettingsNameDraft}
        setSettingsSlugDraft={setSettingsSlugDraft}
        setSettingsWebsiteUrlDraft={setSettingsWebsiteUrlDraft}
        setShowDeleteProjectDialog={setShowDeleteProjectDialog}
        settingsMappingError={settingsMappingError}
        settingsNameDraft={settingsNameDraft}
        settingsSlugDraft={settingsSlugDraft}
        settingsWebsiteUrlDraft={settingsWebsiteUrlDraft}
        supportsPostRevisions={supportsPostRevisions}
        unmappingSettingsTarget={unmappingSettingsTarget}
        workspaceState={workspaceState}
      />
    </ProjectEditorScrollPane>
  );

  const registerPostsMappingFinishHandler = useCallback((handler: (() => Promise<void>) | null) => {
    handlePostsMappingFinishRef.current = handler;
  }, []);

  const renderPostsMappingDraftWorkspace = () => (
    <ProjectEditorPostsMappingWorkspace
      currentProjectName={currentProjectName}
      loadingMappingDetection={loadingMappingDetection}
      loadingMappingTableCatalog={loadingMappingTableCatalog}
      loadingSavedMapping={loadingSavedMapping}
      manualMappingTableRef={mappingManualTableRef}
      mappingDetection={mappingDetection}
      mappingDetectionError={mappingDetectionError}
      mappingDetectionMode={mappingDetectionMode}
      mappingEntryCollection={mappingDialogEntryCollection}
      mappingSelectedTableRef={mappingSelectedTableRef}
      mappingTableCatalog={mappingTableCatalog}
      mappingTableCatalogError={mappingTableCatalogError}
      onManualMappingTableRefChange={setMappingManualTableRef}
      onPostsMappingStepIndexChange={setPostsMappingStepIndex}
      onRegisterFinishHandler={registerPostsMappingFinishHandler}
      onRequestManualMappingDetection={(tableRef) => {
        void handleRequestManualMappingDetection(tableRef);
      }}
      onRequestMappingConfirm={() => {
        setShowMappingConfirmDialog(true);
      }}
      onRefreshMappingTableCatalog={() => {
        void loadMappingTableCatalog({ refresh: true });
      }}
      onSaveMapping={savePostsMapping}
      postsMappingStepIndex={postsMappingStepIndex}
      savingPostsMapping={savingPostsMapping}
      savedMappingError={savedMappingError}
      selectedDetectedMapping={postsDetectedMapping}
      settingsAvailableSupabaseBuckets={settingsAvailableSupabaseBuckets}
      settingsSavedFilesStorage={settingsSavedFilesStorage}
      settingsSavedMappingConfig={settingsSavedMappingConfig}
      settingsSavedMediaStorage={settingsSavedMediaStorage}
      settingsSavedPostsEntity={settingsSavedPostsEntity}
    />
  );

  const renderPostEditorBody = () => {
    if (!selectedPost) {
      return null;
    }

    const titleChangeHandler = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleTitleChange(event.target.value);
      event.target.style.height = "auto";
      event.target.style.height = `${event.target.scrollHeight}px`;
    };
    const titleKeyDownHandler = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (handlePostEditorShortcut(event, "title")) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        getPrimaryContentEditor()?.chain().focus("start").run();
      }
    };
    const titlePasteHandler = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      const lines = text.split(/\r?\n/);
      const firstLine = lines[0] ?? "";
      const remainingLines = lines.slice(1);
      const el = event.currentTarget;
      const newTitle = el.value.slice(0, el.selectionStart) + firstLine + el.value.slice(el.selectionEnd);
      handleTitleChange(newTitle);
      setTimeout(() => {
        const t = titleTextareaRef.current;
        if (t) {
          t.style.height = "auto";
          t.style.height = `${t.scrollHeight}px`;
        }
      }, 0);
      const currentEditor = getPrimaryContentEditor();
      if (remainingLines.some((line) => line.trim()) && currentEditor) {
        const newParagraphs = remainingLines.map((line) => ({
          type: "paragraph" as const,
          content: line.trim() ? [{ type: "text" as const, text: line }] : [],
        }));
        const currentDoc = currentEditor.getJSON();
        const currentContent = Array.isArray(currentDoc.content) ? currentDoc.content : [];
        const newDoc = { ...currentDoc, content: [...newParagraphs, ...currentContent] };
        currentEditor.commands.setContent(newDoc, { emitUpdate: false });
        const nextContentHtml = currentEditor.getHTML();
        const activeFieldId = getEditorFieldId(currentEditor);

        if (activeFieldId) {
          handleContentFieldChange(activeFieldId, nextContentHtml, newDoc as Record<string, unknown>);
        } else {
          updatePost(selectedPost.id, {
            contentHtml: nextContentHtml,
            contentJson: newDoc as Record<string, unknown>,
          });
        }
        currentEditor.commands.focus("start");
      }
    };
    const titleRefHandler = (el: HTMLTextAreaElement | null) => {
      titleTextareaRef.current = el;
      if (el) {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    };

    if (isMultiFieldEditor) {
      return (
        <ProjectEditorMultiFieldEditorBody
          canEditCurrentPost={canEditCurrentPost}
          contentFields={selectedPost.contentFields ?? {}}
          currentPostReadOnlyMessage={currentPostReadOnlyMessage}
          floatingMenu={
            <ProjectEditorSlashCommandMenu
              editor={getActiveEditor()}
              items={filteredSlashCommandItems}
              onSelect={runSlashCommandItem}
              open={showSlashCommandMenu}
              selectedIndex={selectedSlashCommandIndex}
            />
          }
          isCurrentPostReadOnly={isCurrentPostReadOnly}
          mainFieldSpecs={mainFieldSpecs}
          onContentFieldChange={handleContentFieldChange}
          onEditorFocus={handleMultiFieldEditorFocus}
          onEditorInstanceChange={handleMultiFieldEditorInstanceChange}
          onEditorKeyDown={handleMultiFieldEditorKeyDown}
          onEditorLinkClick={handleMultiFieldEditorLinkClick}
          onEditorStateChange={handleMultiFieldEditorStateChange}
          onRetryCurrentPostEditAccess={() => {
            void retryCurrentPostEditAccess();
          }}
          onTitleChange={titleChangeHandler}
          onTitleKeyDown={titleKeyDownHandler}
          onTitlePaste={titlePasteHandler}
          selectedPostId={selectedPost.id}
          selectedPostTitle={selectedPost.title}
          titleTextareaRef={titleRefHandler}
        />
      );
    }

    return (
      <ProjectEditorPostEditorBody
        canEditCurrentPost={canEditCurrentPost}
        currentPostReadOnlyMessage={currentPostReadOnlyMessage}
        editor={editor}
        floatingMenu={
          <ProjectEditorSlashCommandMenu
            editor={editor}
            items={filteredSlashCommandItems}
            onSelect={runSlashCommandItem}
            open={showSlashCommandMenu}
            selectedIndex={selectedSlashCommandIndex}
          />
        }
        isCurrentPostReadOnly={isCurrentPostReadOnly}
        mainFieldSpecs={mainFieldSpecs}
        onRetryCurrentPostEditAccess={() => {
          void retryCurrentPostEditAccess();
        }}
        onTitleChange={titleChangeHandler}
        onTitleKeyDown={titleKeyDownHandler}
        onTitlePaste={titlePasteHandler}
        selectedPostId={selectedPost.id}
        selectedPostTitle={selectedPost.title}
        titleTextareaRef={titleRefHandler}
      />
    );
  };

  const authorsPage = (
    <ProjectAuthorsManager
      canManageAuthors={canManageAuthorDirectory}
      initialPage={collectionPages.Authors}
      onLoadingStateChange={setExternalPageLoading}
      onPageChange={(page) => {
        setPageForCollection("Authors", page);
      }}
      projectId={projectId}
      onAuthorsChanged={async () => {
        invalidateCollectionCache("Posts");
        invalidateCollectionCache("Authors");
        invalidateWorkspaceSummaryCache();
        await loadWorkspaceSummary();
      }}
    />
  );
  const mediaPage = usesManagedMediaLibrary ? (
    <ProjectMediaManager
      initialPath={mediaSectionState.currentPath}
      initialSearch={mediaSectionState.searchQuery}
      onLoadingStateChange={setExternalPageLoading}
      onMediaChanged={async () => {
        await refreshWorkspaceSummaryForManagedCollection("media");
      }}
      onStateChange={setMediaSectionState}
      projectId={projectId}
    />
  ) : (
    <ProjectEditorPostsListSkeleton />
  );
  const filesPage = usesManagedFilesLibrary ? (
    <ProjectFilesManager
      initialPath={filesSectionState.currentPath}
      initialSearch={filesSectionState.searchQuery}
      onFilesChanged={async () => {
        await refreshWorkspaceSummaryForManagedCollection("files");
      }}
      onLoadingStateChange={setExternalPageLoading}
      onStateChange={setFilesSectionState}
      projectId={projectId}
    />
  ) : (
    <ProjectEditorPostsListSkeleton />
  );
  const categoriesPage = (
    <ProjectEditorScrollPane>
      <ProjectEditorTaxonomyCollectionPage
        accessNotice={collectionAccessNotices.Categories}
        canManageTaxonomy={canManageTaxonomy}
        collection="Categories"
        emptyMessage="Create your first category to organize posts in this project."
        entries={categories}
        helperText="Categories help group related posts together. New categories appear immediately in the post editor."
        isContentReady={isContentReady}
        onDeleteEntry={(entry) =>
          setPendingTaxonomyDelete({
            collection: "Categories",
            ids: [entry.id],
            label: entry.name,
          })
        }
        onEditEntry={(entry) => startEditingTaxonomyEntry("Categories", entry as ContentCategory)}
        onToggleAllSelection={(checked) =>
          toggleAllTaxonomySelection(
            "Categories",
            categories.map((entry) => entry.id),
            checked,
          )
        }
        onToggleSelection={(entryId, checked) =>
          toggleTaxonomySelection("Categories", entryId, checked)
        }
        pagination={renderCollectionPagination("mt-8 justify-start")}
        selectedEntryIds={selectedCategoryIds}
        title="Categories"
      />
    </ProjectEditorScrollPane>
  );
  const tagsPage = (
    <ProjectEditorScrollPane>
      <ProjectEditorTaxonomyCollectionPage
        accessNotice={collectionAccessNotices.Tags}
        canManageTaxonomy={canManageTaxonomy}
        collection="Tags"
        emptyMessage="Create your first tag to label content with finer detail."
        entries={tags}
        helperText="Tags work best for smaller descriptors like topics, formats, or campaign labels."
        isContentReady={isContentReady}
        onDeleteEntry={(entry) =>
          setPendingTaxonomyDelete({
            collection: "Tags",
            ids: [entry.id],
            label: entry.name,
          })
        }
        onEditEntry={(entry) => startEditingTaxonomyEntry("Tags", entry as ContentTag)}
        onToggleAllSelection={(checked) =>
          toggleAllTaxonomySelection(
            "Tags",
            tags.map((entry) => entry.id),
            checked,
          )
        }
        onToggleSelection={(entryId, checked) => toggleTaxonomySelection("Tags", entryId, checked)}
        pagination={renderCollectionPagination("mt-8 justify-start")}
        selectedEntryIds={selectedTagIds}
        title="Tags"
      />
    </ProjectEditorScrollPane>
  );
  const postBlockedState = (
    <ProjectEditorPostBlockedState
      acquiringPostEditSession={acquiringPostEditSession}
      canForcePostTakeover={canForcePostTakeover}
      description={
        pendingPostTakeover
          ? `${getEditingSessionLabel(pendingPostTakeover.blockingSession)} is already working on ${pendingPostTakeover.postTitle}.`
          : "Another member is already working on this post."
      }
      onGoBack={handleGoBackFromTakeover}
      onTakeOver={() => void handleTakeOverPostEditing()}
    />
  );
  const collectionBody = renderProjectEditorCollectionBody({
    authorsPage,
    canUpdateProject,
    categoriesPage,
    entries: sidebarEntries[selectedCollection],
    filesPage,
    hasCurrentCollectionSnapshot,
    isContentProject,
    isContentReady,
    isCurrentPostBlocked,
    isLoadingCollection,
    isPostsCollection,
    isSelectedCollectionVisible,
    isSettingsView,
    loadingMessage,
    mediaPage,
    onOpenMappedContentMappingDialog: (collection) => {
      void openMappedContentMappingDialog(collection);
    },
    postBlockedState,
    postContentView,
    postEditorBody: renderPostEditorBody(),
    postsCollectionPage: renderPostsCollectionPage(),
    projectConnectionError,
    resolvedWorkspace,
    selectedCollection,
    selectedCollectionAvailability,
    selectedCollectionIcon: selectedCollectionConfig.icon,
    selectedPost,
    selectedPostLoadError,
    settingsView: renderSettingsView(),
    shouldShowInitialPostsListSkeleton,
    shouldShowPostRouteLoadingState,
    sidebarEntriesPagination: renderCollectionPagination("mt-8 justify-start"),
    tagsPage,
    workspaceState,
  });

  const postSidePanel = (
    <ProjectEditorPostSidePanel
      canEditCurrentPost={canEditCurrentPost}
      canOpenSelectedPostPreview={canOpenSelectedPostPreview}
      canOpenSelectedPostRevisions={canOpenSelectedPostRevisions}
      canUploadFeaturedImage={canUploadFeaturedImage}
      categoryOptions={displayedCategoryOptions}
      displayedSelectedPostSlug={displayedSelectedPostSlug}
      contentRuntime={contentRuntime}
      featuredImageDragActive={featuredImageDragActive}
      featuredImageInputRef={featuredImageInputRef}
      isEditingPostSlug={isEditingPostSlug}
      isYoastAnalyzing={isYoastAnalyzing}
      onCancelPostSlugEdit={cancelPostSlugEdit}
      onClose={() => setShowSeoPanel(false)}
      onHandleOpenPostPreview={handleOpenPostPreview}
      onHandleOpenPostRevisions={handleOpenPostRevisions}
      onPostCustomFieldChange={updatePostCustomField}
      onPostSidePanelViewChange={setPostSidePanelView}
      onPostAuthorsSearchQueryChange={setPostAuthorsSearchQuery}
      onPostCategoriesSearchQueryChange={setPostCategoriesSearchQuery}
      onPostParentPageSearchQueryChange={setPostParentPageSearchQuery}
      onPostSlugDraftChange={setPostSlugDraft}
      onPostTagsSearchQueryChange={setPostTagsSearchQuery}
      onSavePostSlugEdit={savePostSlugEdit}
      onStartPostSlugEdit={startPostSlugEdit}
      onToggleFeaturedImageDragActive={setFeaturedImageDragActive}
      parentPageOptions={displayedParentPageOptions}
      postAuthorOptions={displayedPostAuthorOptions}
      postSidebarConfig={savedPostSidebarConfig}
      postSidePanelView={postSidePanelView}
      postSlugDraft={postSlugDraft}
      postAuthorsSearchQuery={postAuthorsSearchQuery}
      postCategoriesSearchQuery={postCategoriesSearchQuery}
      postParentPageSearchQuery={postParentPageSearchQuery}
      postTagsSearchQuery={postTagsSearchQuery}
      projectId={projectId}
      selectedPost={selectedPost}
      supportsPostRevisions={supportsPostRevisions}
      tags={displayedTagOptions}
      updatePost={updatePost}
      uploadFeaturedImage={uploadFeaturedImage}
      uploadingFeaturedImage={uploadingFeaturedImage}
      yoastReadabilityResults={yoastReadabilityResults}
      yoastReadabilityScore={yoastReadabilityScore}
      yoastSeoResults={yoastSeoResults}
      yoastSeoScore={yoastSeoScore}
    />
  );
  const taxonomySidePanel =
    selectedCollection === "Categories" || selectedCollection === "Tags" ? (
      <ProjectEditorTaxonomySidePanel
        canManageTaxonomy={canManageTaxonomy}
        categoryOptions={categoryOptions}
        collection={selectedCollection}
        creatingCollectionEntry={creatingCollectionEntry}
        currentDescription={selectedCollection === "Categories" ? newCategoryDescription : newTagDescription}
        currentName={selectedCollection === "Categories" ? newCategoryName : newTagName}
        currentSlug={selectedCollection === "Categories" ? newCategorySlug : newTagSlug}
        editingTaxonomyEntry={editingTaxonomyEntry}
        icon={selectedCollectionConfig.icon}
        isContentReady={isContentReady}
        onClearSelection={() => setSelectedTaxonomyIds(selectedCollection, [])}
        onClose={() => setShowSeoPanel(false)}
        onDescriptionChange={(value) =>
          selectedCollection === "Categories"
            ? setNewCategoryDescription(value)
            : setNewTagDescription(value)
        }
        onNameChange={(value) => handleTaxonomyNameChange(selectedCollection, value)}
        onParentCategoryChange={setNewCategoryParentId}
        onRequestDeleteSelection={() => {
          const selectedIds = getSelectedTaxonomyIds(selectedCollection);
          setPendingTaxonomyDelete({
            collection: selectedCollection,
            ids: selectedIds,
            label:
              selectedIds.length === 1
                ? `${selectedIds.length} selected ${getTaxonomyNoun(selectedCollection)}`
                : `${selectedIds.length} selected ${getTaxonomyNoun(selectedCollection, true)}`,
          });
        }}
        onReset={() => resetTaxonomyEditor(selectedCollection)}
        onSlugChange={(value) => handleTaxonomySlugChange(selectedCollection, value)}
        onSubmit={() => {
          if (editingTaxonomyEntry?.collection === selectedCollection) {
            void updateCollectionEntry(selectedCollection);
            return;
          }

          void createCollectionEntry(selectedCollection);
        }}
        parentCategoryId={newCategoryParentId}
        selectedIds={getSelectedTaxonomyIds(selectedCollection)}
      />
    ) : null;
  const imageSettingsSidePanel = selectedEditorImage ? (
    <ProjectEditorImageSettingsPanel
      image={selectedEditorImage}
      onChange={updateSelectedEditorImage}
      onClose={() => {
        selectedEditorImageRef.current = null;
        setSelectedEditorImage(null);
      }}
      onRemove={removeSelectedEditorImage}
    />
  ) : null;
  const sidePanel = imageSettingsSidePanel ?? renderProjectEditorSidePanel({
    isContentReady,
    isPostsCollection,
    isSettingsView,
    postContentView,
    postSidePanel,
    selectedCollection,
    showSeoPanel,
    taxonomySidePanel,
  });
  const canToggleSidePanel =
    !isSettingsView &&
    ((isPostsCollection && postContentView === "editor") ||
      selectedCollection === "Categories" ||
      selectedCollection === "Tags");
  const shouldRenderDialogs =
    showPostRevisionsSheet ||
    Boolean(pendingRevisionRestore) ||
    Boolean(pendingPostsDelete) ||
    Boolean(pendingTaxonomyDelete) ||
    Boolean(pendingPostAction) ||
    showMappingConfirmDialog ||
    Boolean(pendingPostTakeover) ||
    Boolean(lostPostAccessState) ||
    Boolean(
      isPostsCollection &&
        postContentView === "editor" &&
        selectedPost?.id &&
        (pendingStoredDraftRestore?.postId === selectedPost.id ||
          pendingLostPostDraftRestore?.postId === selectedPost.id),
    ) ||
    showPostsMappingDialog ||
    showProjectSlugUnlockDialog ||
    showDeleteProjectDialog ||
    Boolean(pendingUnsavedChangesAction);

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-svh overflow-hidden overscroll-none bg-background"
    >
      <ProjectNavigationSidebar
        accountAvatarUrl={accountAvatarUrl}
        accountEmail={accountEmail}
        accountName={accountName}
        isSettingsView={isSettingsView}
        onOpenSettings={openProjectSettings}
        settingsHref={projectSettingsHref}
        settingsItems={projectSettingsSidebarItems}
        sidebarCollectionItems={projectSidebarCollectionItems}
      />
      <ProjectEditorChrome
        activeSectionLabel={activeSectionLabel}
        canArchiveSelectedPost={canArchiveSelectedPost}
        canDeleteSelectedPost={canDeleteSelectedPost}
        canPublishSelectedPost={canPublishSelectedPost}
        canRestoreSelectedPostToDraft={canRestoreSelectedPostToDraft}
        canToggleSidePanel={canToggleSidePanel}
        currentProjectName={currentProjectName}
        hasSelectedPostUnsavedChanges={hasSelectedPostUnsavedChanges}
        isArchivedPost={isArchivedPost}
        isCurrentPostEditable={isCurrentPostEditable}
        isDeletingSelectedPost={Boolean(
          isDeletingPosts && selectedPost && pendingPostsDelete?.ids.includes(selectedPost.id),
        )}
        isPostsCollection={isPostsCollection}
        isPublishedPost={isPublishedPost}
        isPublishing={isPublishing}
        isSaving={isSaving}
        isMacKeyboardPlatform={isMacKeyboardPlatform}
        onArchivePost={handleArchivePost}
        onDeletePost={requestDeleteSelectedPost}
        onKeyboardShortcutsOpenChange={setShowKeyboardShortcutsDialog}
        onNavigateProjects={handleOpenProjects}
        onOpenSidePanel={() => setShowSeoPanel(true)}
        onPublish={handlePublish}
        onRestorePostToDraft={handleRestorePostToDraft}
        onSavePost={handleSavePost}
        selectedCollection={selectedCollection}
        showKeyboardShortcuts={showKeyboardShortcutsDialog}
        showEditorToolbar={showEditorToolbar}
        showSeoPanel={showSeoPanel}
        sidePanel={sidePanel}
        sidePanelToggleIcon={selectedCollectionConfig.icon}
        supportsWorkflowActions={postFieldStates.status.editable}
        toolbarDisabled={!isPostsCollection || !hasSelectedPost || !canEditCurrentPost}
        toolbarGroups={toolbarGroups}
        topBarStatusLabel={topBarStatusLabel}
      >
        {collectionBody}
      </ProjectEditorChrome>

      {assetPickerKind === "media" ? (
        <ProjectEditorAssetPickerDialog
          kind="media"
          library={assetPickerMediaLibrary}
          loading={assetPickerLoading}
          onOpenChange={closeEditorAssetPicker}
          onPathChange={changeEditorAssetPickerPath}
          onRefresh={(search) => void loadEditorAssetPickerLibrary("media", { search })}
          onSelectImage={insertSelectedImageAsset}
          onUpload={uploadEditorAssetPickerFiles}
          open
          uploading={assetPickerUploading}
        />
      ) : null}

      {assetPickerKind === "files" ? (
        <ProjectEditorAssetPickerDialog
          kind="files"
          library={assetPickerFilesLibrary}
          loading={assetPickerLoading}
          onOpenChange={closeEditorAssetPicker}
          onPathChange={changeEditorAssetPickerPath}
          onRefresh={(search) => void loadEditorAssetPickerLibrary("files", { search })}
          onSelectFile={insertSelectedFileAsset}
          onUpload={uploadEditorAssetPickerFiles}
          open
          uploading={assetPickerUploading}
        />
      ) : null}

      {shouldRenderDialogs ? (
        <ProjectEditorDialogs
          acquiringPostEditSession={acquiringPostEditSession}
          canEditCurrentPost={canEditCurrentPost}
          canForcePostTakeover={canForcePostTakeover}
          clearPendingUnsavedChangesConfirmation={clearPendingUnsavedChangesConfirmation}
          currentProjectName={currentProjectName}
          deleteProjectConfirmation={deleteProjectConfirmation}
          getEditingSessionLabel={getEditingSessionLabel}
          handleDeleteCollectionEntries={deleteCollectionEntries}
          handleDeletePosts={deletePosts}
          handleDeleteProject={handleDeleteProject}
          handleDiscardLostPostDraft={handleDiscardLostPostDraft}
          handleDiscardStoredDraft={handleDiscardStoredDraft}
          handleGoBackFromTakeover={handleGoBackFromTakeover}
          handleLostPostAccessAcknowledge={handleLostPostAccessAcknowledge}
          onConfirmSaveMapping={() => {
            setShowMappingConfirmDialog(false);
            void handlePostsMappingFinishRef.current?.();
          }}
          onConfirmPostAction={handleConfirmPostAction}
          handleProceedWithoutSaving={handleProceedWithoutSaving}
          handleProjectSlugUnlockProceed={handleProjectSlugUnlockProceed}
          handleRestoreLostPostDraft={handleRestoreLostPostDraft}
          handleRestorePostRevision={handleRestorePostRevision}
          handleRestoreStoredDraft={handleRestoreStoredDraft}
          handleSaveAndContinue={handleSaveAndContinue}
          handleTakeOverPostEditing={handleTakeOverPostEditing}
          isDeleteProjectConfirmationValid={isDeleteProjectConfirmationValid}
          isDeletingCollectionEntry={isDeletingCollectionEntry}
          isDeletingPosts={isDeletingPosts}
          isDeletingProject={isDeletingProject}
          isPostsCollection={isPostsCollection}
          isSaving={isSaving}
          isPublishing={isPublishing}
          isSavingProjectSettings={isSavingProjectSettings}
          loadPostRevisions={loadPostRevisions}
          loadingPostRevisions={loadingPostRevisions}
          lostPostAccessState={lostPostAccessState}
          onDeleteProjectConfirmationChange={setDeleteProjectConfirmation}
          onPendingPostsDeleteChange={setPendingPostsDelete}
          onPendingRevisionRestoreChange={setPendingRevisionRestore}
          onPendingTaxonomyDeleteChange={setPendingTaxonomyDelete}
          onPendingPostActionChange={setPendingPostAction}
          onPostsMappingDialogOpenChange={(open) => {
            if (!open) {
              setLoadingSavedMapping(false);
              setLoadingSettingsMappingCollection(null);
              setSavedMappingError(null);
            }
            setShowPostsMappingDialog(open);
          }}
          onProjectSlugUnlockDialogOpenChange={setShowProjectSlugUnlockDialog}
          onRevisionSheetOpenChange={setShowPostRevisionsSheet}
          onShowDeleteProjectDialogChange={(open) => {
            if (!isDeletingProject) {
              if (!open) {
                setDeleteProjectConfirmation("");
              }

              setShowDeleteProjectDialog(open);
            }
          }}
          pendingLostPostDraftRestore={pendingLostPostDraftRestore}
          pendingPostTakeover={pendingPostTakeover}
          pendingPostAction={pendingPostAction}
          pendingPostsDelete={pendingPostsDelete}
          pendingRevisionRestore={pendingRevisionRestore}
          pendingStoredDraftRestore={pendingStoredDraftRestore}
          pendingTaxonomyDelete={pendingTaxonomyDelete}
          pendingUnsavedChangesAction={pendingUnsavedChangesAction}
          postContentView={postContentView}
          postRevisions={postRevisions}
          postRevisionsLoadError={postRevisionsLoadError}
          postsMappingDialogContent={
            hasMountedPostsMappingWorkspace || showPostsMappingDialog
              ? renderPostsMappingDraftWorkspace()
              : null
          }
          restoringRevisionNumber={restoringRevisionNumber}
          savingPostsMapping={savingPostsMapping}
          selectedPost={selectedPost}
          showDeleteProjectDialog={showDeleteProjectDialog}
          showMappingConfirmDialog={showMappingConfirmDialog}
          showPostRevisionsSheet={showPostRevisionsSheet}
          showPostsMappingDialog={showPostsMappingDialog}
          showProjectSlugUnlockDialog={showProjectSlugUnlockDialog}
          onShowMappingConfirmDialogChange={setShowMappingConfirmDialog}
          onUnsavedChangesDialogOpenChange={(open) => {
            if (!open && !isSaving) {
              clearPendingUnsavedChangesConfirmation({ invokeCancel: true });
            }
          }}
        />
      ) : null}

      <EditorLinkPopover
        autoFocusInput={linkPopoverAutoFocusInput}
        anchorRect={linkPopoverAnchor}
        initialHref={linkPopoverInitial.href}
        initialRel={linkPopoverInitial.rel}
        initialTarget={linkPopoverInitial.target}
        isEditing={linkPopoverInitial.isEditing}
        onApply={handleLinkPopoverApply}
        onClose={handleLinkPopoverClose}
        onUnlink={handleLinkPopoverUnlink}
        open={linkPopoverOpen}
      />
    </SidebarProvider>
  );
}
