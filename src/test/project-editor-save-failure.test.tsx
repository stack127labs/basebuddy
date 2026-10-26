import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectEditor } from "@/components/editor/project-editor";
import type { WorkspacePayload } from "@/components/editor/project-editor/types";
import {
  createDefaultContentPostSidebarConfig,
  type ContentPostEditorPayload,
} from "@/lib/content-runtime/shared";

const {
  editorPostPayload,
  emptyRelationOptions,
  postsPresencePayload,
  toastErrorMock,
  toastMessageMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  editorPostPayload: {
    authors: [],
    categories: [],
    editorOptionsState: "warm",
    post: {
      authorId: null,
      categoryIds: [],
      contentFields: {},
      contentFormat: "html",
      contentHtml: "<p>Hello</p>",
      contentJson: {},
      contentMarkdown: null,
      createdAt: "2026-04-08T00:00:00.000Z",
      customFields: {},
      editorPayloadReady: true,
      excerpt: null,
      featuredImageUrl: null,
      focusKeyword: null,
      id: "post-1",
      publishedAt: null,
      redirects: [],
      seoDescription: null,
      seoTitle: null,
      slug: "hello-world",
      status: "draft",
      tagIds: [],
      title: "Hello World",
      updatedAt: "2026-04-08T01:00:00.000Z",
    },
    tags: [],
  } satisfies ContentPostEditorPayload,
  emptyRelationOptions: [],
  postsPresencePayload: { sessions: [] },
  toastErrorMock: vi.fn(),
  toastMessageMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    message: toastMessageMock,
    success: toastSuccessMock,
  },
}));

vi.mock("next/dynamic", async () => {
  const React = await import("react");

  return {
    default: () => (props: {
      onConfirmPostAction?: (() => Promise<void>) | null;
      pendingPostAction?: { confirmLabel: string } | null;
      selectedPost?: { id: string } | null;
      updatePost?: ((postId: string, updates: Record<string, unknown>) => void) | null;
    }) => {
      const { onConfirmPostAction, pendingPostAction, selectedPost, updatePost } = props;

      React.useEffect(() => {
        if (pendingPostAction && typeof onConfirmPostAction === "function") {
          void onConfirmPostAction();
        }
      }, [onConfirmPostAction, pendingPostAction]);

      if (!selectedPost || typeof updatePost !== "function") {
        return null;
      }

      return React.createElement(
        "button",
        {
          onClick: () => updatePost(selectedPost.id, { redirects: ["old-post", "older-post"] }),
          type: "button",
        },
        "Set Redirects",
      );
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/demo/posts/post-1",
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@tiptap/react", () => ({
  useEditor: () => null,
}));

vi.mock("@/components/editor/project-navigation-sidebar", () => ({
  ProjectNavigationSidebar: () => null,
}));

vi.mock("@/components/editor/project-editor/use-project-editor-navigation", () => ({
  useProjectEditorNavigation: () => ({
    buildProjectUrl: () => "/projects/demo",
    openProjectSettings: vi.fn(),
    projectSettingsHref: "/projects/demo/settings",
    projectSettingsSidebarItems: [],
    projectSidebarCollectionItems: [],
  }),
}));

vi.mock("@/components/editor/project-editor/external-navigation", () => ({
  requestProjectsNavigation: ({ navigate }: { navigate?: () => void }) => {
    navigate?.();
  },
}));

vi.mock("@/components/editor/navigation-link", () => ({
  shouldHandlePlainLinkNavigation: () => true,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarTrigger: () => null,
}));

vi.mock("@/components/editor/project-editor/editor-chrome", () => ({
  ProjectEditorChrome: ({
    canArchiveSelectedPost,
    canPublishSelectedPost,
    canRestoreSelectedPostToDraft,
    children,
    hasSelectedPostUnsavedChanges,
    isCurrentPostEditable,
    isPublishing,
    isSaving,
    onArchivePost,
    onPublish,
    onRestorePostToDraft,
    onSavePost,
    sidePanel,
  }: {
    canArchiveSelectedPost?: boolean;
    canPublishSelectedPost?: boolean;
    canRestoreSelectedPostToDraft?: boolean;
    children: React.ReactNode;
    hasSelectedPostUnsavedChanges: boolean;
    isCurrentPostEditable: boolean;
    isPublishing: boolean;
    isSaving: boolean;
    onArchivePost?: () => void;
    onPublish?: () => void;
    onRestorePostToDraft?: () => void;
    onSavePost: () => void;
    sidePanel?: React.ReactNode;
  }) => (
    <div>
      <button
        type="button"
        disabled={!isCurrentPostEditable || isSaving || isPublishing || !hasSelectedPostUnsavedChanges}
        onClick={onSavePost}
      >
        Save
      </button>
      {canPublishSelectedPost ? (
        <button type="button" onClick={onPublish}>
          Publish
        </button>
      ) : null}
      {canArchiveSelectedPost ? (
        <button type="button" onClick={onArchivePost}>
          Archive
        </button>
      ) : null}
      {canRestoreSelectedPostToDraft ? (
        <button type="button" onClick={onRestorePostToDraft}>
          Move to Draft
        </button>
      ) : null}
      {children}
      {sidePanel}
    </div>
  ),
}));

vi.mock("@/components/editor/project-editor/editor-link-popover", () => ({
  EditorLinkPopover: () => null,
  buildRelString: () => "",
}));

vi.mock("@/components/editor/project-editor/mapping-draft-view", () => ({
  ProjectEditorContentCollectionSetupCard: () => null,
  ProjectEditorPostsMappingDraftEntry: () => null,
}));

vi.mock("@/components/editor/project-editor/posts-collection-page", () => ({
  ProjectEditorPostsCollectionPage: () => null,
}));

vi.mock("@/components/editor/project-editor/collection-body", () => {
  const Null = () => null;

  return {
    ProjectEditorConnectionErrorState: Null,
    ProjectEditorEmptyCollectionState: Null,
    ProjectEditorMultiFieldEditorBody: ({
      onTitleChange,
      selectedPostTitle,
    }: {
      onTitleChange: React.ChangeEventHandler<HTMLTextAreaElement>;
      selectedPostTitle: string;
    }) => (
      <textarea aria-label="Title" onChange={onTitleChange} value={selectedPostTitle} />
    ),
    ProjectEditorPostBlockedState: Null,
    ProjectEditorPostEditorBody: ({
      onTitleChange,
      selectedPostTitle,
    }: {
      onTitleChange: React.ChangeEventHandler<HTMLTextAreaElement>;
      selectedPostTitle: string;
    }) => (
      <textarea aria-label="Title" onChange={onTitleChange} value={selectedPostTitle} />
    ),
    ProjectEditorPostEditorSkeleton: Null,
    ProjectEditorPostLoadErrorState: Null,
    ProjectEditorPostsListSkeleton: Null,
    ProjectEditorScrollPane: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    ProjectEditorSidebarEntriesList: Null,
    ProjectEditorStateCard: Null,
    ProjectEditorTablePageSkeleton: Null,
  };
});

vi.mock("@/components/editor/project-editor/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/components/editor/project-editor/queries")>(
      "@/components/editor/project-editor/queries",
    );

  return {
    ...actual,
    useProjectEditorPostPayloadQuery: () => ({
      data: editorPostPayload,
      error: null,
      isFetching: false,
      isPending: false,
    }),
    useProjectEditorPostRevisionsQuery: () => ({
      data: null,
      error: null,
      isFetching: false,
      isPending: false,
      refetch: vi.fn(async () => ({ data: null })),
    }),
    useProjectEditorPostsPageQuery: () => ({
      data: undefined,
      error: null,
      isFetching: false,
      isPending: false,
    }),
    useProjectEditorPostsPresenceQuery: () => ({
      data: postsPresencePayload,
      error: null,
      isFetching: false,
      isPending: false,
      refetch: vi.fn(async () => ({ data: postsPresencePayload })),
    }),
    useProjectEditorRelationOptionsQuery: () => ({
      data: emptyRelationOptions,
      error: null,
      isFetching: false,
      isPending: false,
    }),
    useProjectEditorWorkspaceQuery: () => ({
      data: undefined,
      error: null,
      isFetching: false,
      isPending: false,
    }),
  };
});

vi.mock("@/hooks/use-post-editor-session", async () => {
  const React = await import("react");

  return {
    usePostEditorSession: ({
      getComparablePostState,
      posts,
      routePostId,
    }: {
      getComparablePostState: (post: ContentPostEditorPayload["post"]) => Record<string, unknown>;
      posts: ContentPostEditorPayload["post"][];
      routePostId: string | null;
    }) => {
      const dirtyPostIdsRef = React.useRef(new Set<string>());
      const draftPostsRef = React.useRef<Record<string, ContentPostEditorPayload["post"]>>({});
      const persistedPostsRef = React.useRef<Record<string, ContentPostEditorPayload["post"]>>({});
      const autoSlugPostIdsRef = React.useRef(new Set<string>());
      const canEditCurrentPostRef = React.useRef(true);
      const pendingUnsavedChangesActionRef = React.useRef<(() => void | Promise<void>) | null>(null);
      const pendingUnsavedChangesCancelActionRef = React.useRef<(() => void) | null>(null);
      const postContentViewRef = React.useRef<"editor">("editor");
      const selectedCollectionRef = React.useRef<"Posts">("Posts");
      const selectedPostIdRef = React.useRef<string | null>(routePostId);
      const isEditingPostSlugRef = React.useRef(false);
      const postSlugDraftRef = React.useRef("");
      const activePostEditSessionPostIdRef = React.useRef<string | null>(routePostId);
      const selectedPost =
        routePostId ? posts.find((post) => post.id === routePostId) ?? null : null;

      selectedPostIdRef.current = routePostId;
      activePostEditSessionPostIdRef.current = routePostId;
      postSlugDraftRef.current = selectedPost?.slug ?? postSlugDraftRef.current;

      React.useEffect(() => {
        if (!selectedPost) {
          return;
        }

        persistedPostsRef.current[selectedPost.id] ??= selectedPost;
        draftPostsRef.current[selectedPost.id] = selectedPost;
      }, [selectedPost]);

      const hasComparableUnsavedPostChanges = ({
        draftPost,
        isEditingSlug,
        persistedPost,
        slugDraft,
      }: {
        draftPost: ContentPostEditorPayload["post"];
        isEditingSlug: boolean;
        persistedPost: ContentPostEditorPayload["post"] | null;
        slugDraft: string;
      }) => {
        if (!persistedPost) {
          return true;
        }

        const nextDraftState = {
          ...getComparablePostState(draftPost),
          slug: isEditingSlug ? slugDraft : draftPost.slug,
        };
        const nextPersistedState = {
          ...getComparablePostState(persistedPost),
          slug: persistedPost.slug,
        };

        return JSON.stringify(nextDraftState) !== JSON.stringify(nextPersistedState);
      };

      const markPostDirty = (postId: string) => {
        dirtyPostIdsRef.current.add(postId);
      };

      const markPostPersisted = (post: ContentPostEditorPayload["post"]) => {
        persistedPostsRef.current[post.id] = post;
        draftPostsRef.current[post.id] = post;
        dirtyPostIdsRef.current.delete(post.id);
      };

      return {
        acquiringPostEditSession: false,
        acknowledgeLostPostAccess: vi.fn(),
        activePostEditSessionPostIdRef,
        autoSlugPostIdsRef,
        beginPostEditSession: vi.fn(),
        canEditCurrentPost: true,
        canEditCurrentPostRef,
        clearStoredPostDraftState: vi.fn(async () => {}),
        closePostEditorSession: vi.fn(async () => {}),
        dirtyPostIdsRef,
        dismissPendingLostPostDraft: vi.fn(),
        dismissPendingPostTakeover: vi.fn(),
        dismissPendingStoredDraft: vi.fn(),
        draftPostsRef,
        getDisplayedSelectedPostSlug: (post: ContentPostEditorPayload["post"] | null) => post?.slug ?? "",
        getEditingSessionLabel: () => "editing",
        handlePostEditCapabilityError: vi.fn(async () => false),
        hasComparableUnsavedPostChanges,
        isEditingPostSlug: false,
        isEditingPostSlugRef,
        isPersistingLocalAutosave: false,
        isPostSlugAutoManaged: () => false,
        isRecoverablePostSessionError: () => false,
        loadingSelectedPost: false,
        lostPostAccessState: null,
        markPostDirty,
        markPostPersisted,
        pendingLostPostDraftRestore: null,
        pendingPostTakeover: null,
        pendingStoredDraftRestore: null,
        pendingUnsavedChangesAction: null,
        pendingUnsavedChangesActionRef,
        pendingUnsavedChangesCancelActionRef,
        persistedPostsRef,
        postContentView: "editor" as const,
        postContentViewRef,
        postEditCapability: selectedPost
          ? ({
              postId: selectedPost.id,
              state: "editable",
            } as const)
          : ({ state: "inactive" } as const),
        postSlugDraft: selectedPost?.slug ?? "",
        postSlugDraftRef,
        requestUnsavedChangesConfirmation: vi.fn(),
        resolvePostEditConflict: vi.fn(async () => {}),
        restorePendingLostPostDraft: vi.fn(),
        restorePendingStoredDraft: vi.fn(),
        retryCurrentPostEditAccess: vi.fn(async () => {}),
        selectedCollectionRef,
        selectedPost,
        selectedPostId: routePostId,
        selectedPostIdRef,
        selectedPostLoadError: null,
        setIsEditingPostSlug: vi.fn(),
        setLoadingSelectedPost: vi.fn(),
        setPendingUnsavedChangesAction: vi.fn(),
        setPostContentView: vi.fn(),
        setPostSlugDraft: vi.fn(),
        setSelectedPostId: vi.fn(),
        setSelectedPostLoadError: vi.fn(),
        takeOverPendingPostEditing: vi.fn(async () => {}),
      };
    },
  };
});

const createWorkspacePayload = (overrides?: Partial<WorkspacePayload>): WorkspacePayload => ({
  capabilities: {
    canManageAuthors: true,
    canManageTaxonomy: true,
    ...(overrides?.capabilities ?? {}),
  },
  counts: {
    authors: 0,
    categories: 0,
    files: 0,
    media: 0,
    posts: 1,
    tags: 0,
    ...(overrides?.counts ?? {}),
  },
  contentRuntime: overrides?.contentRuntime ?? null,
  postSidebarConfig: overrides?.postSidebarConfig ?? createDefaultContentPostSidebarConfig(),
  primaryContentFormat: overrides?.primaryContentFormat ?? "html",
  workspaceState: overrides?.workspaceState ?? "ready",
  workspaceSummary: {
    counts: {
      authors: 0,
      categories: 0,
      files: 0,
      media: 0,
      posts: 1,
      tags: 0,
      ...(overrides?.workspaceSummary?.counts ?? {}),
    },
    isDerived: overrides?.workspaceSummary?.isDerived ?? false,
    isExact: overrides?.workspaceSummary?.isExact ?? true,
    pendingCollections: overrides?.workspaceSummary?.pendingCollections ?? [],
    refreshedAt: overrides?.workspaceSummary?.refreshedAt ?? "2026-04-08T00:00:00.000Z",
  },
  ...(overrides ?? {}),
});

const renderProjectEditor = (workspaceOverrides?: Partial<WorkspacePayload>) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectEditor
        accountAvatarUrl={null}
        accountEmail="owner@example.com"
        accountName="Owner"
        initialWorkspacePayload={createWorkspacePayload(workspaceOverrides)}
        projectId="project-1"
        projectName="Demo Project"
        projectRole="owner"
        projectSlug="demo"
        projectWebsiteUrl="https://example.com"
      />
    </QueryClientProvider>,
  );
};

afterEach(() => {
  vi.restoreAllMocks();
  toastErrorMock.mockReset();
  toastMessageMock.mockReset();
  toastSuccessMock.mockReset();
});

describe("project editor save failures", () => {
  it("keeps the edited draft dirty when a save request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "transaction aborted" }), {
          headers: {
            "Content-Type": "application/json",
          },
          status: 500,
        }),
      ),
    );

    renderProjectEditor();

    const titleField = await screen.findByLabelText("Title");

    fireEvent.change(titleField, {
      target: {
        value: "Hello Again",
      },
    });

    const saveButton = screen.getByRole("button", { name: "Save" });

    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Could not save the post right now.");
    });

    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("Hello Again");
    expect(saveButton).toBeEnabled();
  });

  it("treats redirect edits as dirty and includes them in save requests", async () => {
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          post: {
            ...editorPostPayload.post,
            redirects: ["old-post", "older-post"],
          },
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderProjectEditor();

    const saveButton = screen.getByRole("button", { name: "Save" });

    expect(saveButton).toBeDisabled();

    fireEvent.click(await screen.findByRole("button", { name: "Set Redirects" }));

    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const saveRequest = fetchMock.mock.calls.find((call) => {
      const request = call[1] as RequestInit | undefined;
      return typeof request?.body === "string" && request.body.includes('"action":"update_post"');
    });
    const request = saveRequest?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(request?.body ?? "{}")) as {
      redirects?: string[];
    };

    expect(body.redirects).toEqual(["old-post", "older-post"]);
  });

  it("sends only dirty fields and the concurrency token in normal save requests", async () => {
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          post: {
            ...editorPostPayload.post,
            title: "Hello Again",
          },
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderProjectEditor();

    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Hello Again" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const saveRequest = fetchMock.mock.calls.find((call) => {
      const request = call[1] as RequestInit | undefined;
      return typeof request?.body === "string" && request.body.includes('"action":"update_post"');
    });
    const request = saveRequest?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(request?.body ?? "{}")) as Record<string, unknown>;

    expect(body).toMatchObject({
      action: "update_post",
      postId: "post-1",
      title: "Hello Again",
      expectedUpdatedAt: "2026-04-08T01:00:00.000Z",
    });
    expect(body).not.toHaveProperty("updatedAt");
    expect(body).not.toHaveProperty("authorId");
    expect(body).not.toHaveProperty("categoryIds");
    expect(body).not.toHaveProperty("contentFields");
    expect(body).not.toHaveProperty("contentHtml");
    expect(body).not.toHaveProperty("contentJson");
    expect(body).not.toHaveProperty("contentMarkdown");
    expect(body).not.toHaveProperty("customFields");
    expect(body).not.toHaveProperty("excerpt");
    expect(body).not.toHaveProperty("featuredImageUrl");
    expect(body).not.toHaveProperty("focusKeyword");
    expect(body).not.toHaveProperty("parentPageId");
    expect(body).not.toHaveProperty("publishedAt");
    expect(body).not.toHaveProperty("redirects");
    expect(body).not.toHaveProperty("seoDescription");
    expect(body).not.toHaveProperty("seoTitle");
    expect(body).not.toHaveProperty("slug");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("tagIds");
  });

  it("omits unchanged multi-field content entries from dirty save requests", async () => {
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          post: {
            ...editorPostPayload.post,
            contentFields: {
              body_html: {
                contentHtml: "<p>Hello</p>",
                contentJson: {},
              },
              sidebar_notes: {
                contentHtml: "<p>Notes</p>",
                contentJson: {},
              },
            },
          },
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      ),
    );

    editorPostPayload.post.contentFields = {
      body_html: {
        contentHtml: "<p>Hello</p>",
        contentJson: {},
      },
      sidebar_notes: {
        contentHtml: "<p>Notes</p>",
        contentJson: {},
      },
    };

    vi.stubGlobal("fetch", fetchMock);

    renderProjectEditor({
      contentRuntime: {
        editorFields: [
          {
            id: "body_html",
            kind: "html",
            label: "Body",
            placeholder: null,
            required: true,
            visible: true,
          },
          {
            id: "sidebar_notes",
            kind: "html",
            label: "Sidebar Notes",
            placeholder: null,
            required: false,
            visible: true,
          },
        ],
        filesStorage: null,
        mediaStorage: null,
      } as never,
    });

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Hello Again" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const saveRequest = fetchMock.mock.calls.find((call) => {
      const request = call[1] as RequestInit | undefined;
      return typeof request?.body === "string" && request.body.includes('"action":"update_post"');
    });
    const request = saveRequest?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(request?.body ?? "{}")) as {
      contentFields?: Record<string, unknown>;
    };

    expect(body).not.toHaveProperty("contentFields");
  });

  it("blocks explicit publish actions until dirty edits are saved", async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    renderProjectEditor();

    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Hello Again" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Save changes before publishing.");
    });

    const publishRequests = fetchMock.mock.calls.filter((call) => {
      const request = call[1] as RequestInit | undefined;
      return typeof request?.body === "string" && request.body.includes('"action":"publish_post"');
    });

    expect(publishRequests).toHaveLength(0);
  });

  const workflowActionCases: Array<{
    action: "publish_post" | "archive_post" | "unpublish_post";
    buttonLabel: string;
    nextStatus: ContentPostEditorPayload["post"]["status"];
    successMessage: string;
  }> = [
    { action: "publish_post", buttonLabel: "Publish", nextStatus: "published", successMessage: "Post published." },
    { action: "archive_post", buttonLabel: "Archive", nextStatus: "archived", successMessage: "Post archived." },
    {
      action: "unpublish_post",
      buttonLabel: "Move to Draft",
      nextStatus: "draft",
      successMessage: "Post moved back to draft.",
    },
  ];

  it.each(workflowActionCases)(
    "sends only the explicit workflow action payload for $action",
    async ({ action, buttonLabel, nextStatus, successMessage }) => {
      const previousStatus = editorPostPayload.post.status;
      const previousPublishedAt = editorPostPayload.post.publishedAt;
      const mutableEditorPost = editorPostPayload.post as ContentPostEditorPayload["post"];

      try {
        if (action === "unpublish_post") {
          mutableEditorPost.status = "archived";
          mutableEditorPost.publishedAt = "2026-04-08T01:30:00.000Z";
        }

        const fetchMock = vi.fn(async (input?: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input ?? "");

          if (url.includes("/workspace-counts")) {
            return new Response(
              JSON.stringify({
                counts: {
                  authors: 0,
                  categories: 0,
                  files: 0,
                  media: 0,
                  posts: 1,
                  tags: 0,
                },
              }),
              {
                headers: {
                  "Content-Type": "application/json",
                },
                status: 200,
              },
            );
          }

          const requestBody = JSON.parse(String(init?.body ?? "{}")) as { action?: string };

          return new Response(
            JSON.stringify({
              post: {
                ...editorPostPayload.post,
                status: requestBody.action === action ? nextStatus : editorPostPayload.post.status,
              },
            }),
            {
              headers: {
                "Content-Type": "application/json",
              },
              status: 200,
            },
          );
        });

        vi.stubGlobal("fetch", fetchMock);

        renderProjectEditor();

        fireEvent.click(await screen.findByRole("button", { name: buttonLabel }));

        await waitFor(() => {
          expect(fetchMock).toHaveBeenCalled();
        });

        await waitFor(() => {
          expect(toastSuccessMock).toHaveBeenCalledWith(successMessage);
        });

        const actionRequest = fetchMock.mock.calls.find((call) => {
          const request = call[1] as RequestInit | undefined;
          return typeof request?.body === "string" && request.body.includes(`"action":"${action}"`);
        });
        const request = actionRequest?.[1] as RequestInit | undefined;
        const body = JSON.parse(String(request?.body ?? "{}")) as Record<string, unknown>;

        expect(body).toEqual({
          action,
          postId: "post-1",
          expectedUpdatedAt: "2026-04-08T01:00:00.000Z",
        });
      } finally {
        mutableEditorPost.status = previousStatus;
        mutableEditorPost.publishedAt = previousPublishedAt;
      }
    },
  );
});
