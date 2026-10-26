import { NextResponse } from "next/server";

import { enforceRateLimit, parseJsonBody } from "@/lib/api/request-guards";
import {
  archiveContentPost,
  createContentCollectionEntry,
  createContentPost,
  deleteContentPosts,
  discardContentPost,
  deleteContentCollectionEntries,
  acquireContentPostEditSession,
  heartbeatContentPostEditSession,
  publishContentPost,
  releaseContentPostEditSession,
  restoreContentPostRevision,
  saveContentMappingRevision,
  unpublishContentPost,
  updateContentPost,
  updateContentCollectionEntry,
} from "@/lib/content-runtime/server";
import { handleContentRouteGetView } from "@/lib/content-runtime/route-queries";
import {
  getContentRouteErrorResponse,
} from "../shared";
import {
  contentActionSchema,
  type ContentActionPayload,
  getContentActionRateLimit,
} from "./content-route-actions";

export const handleContentRouteGet = async (request: Request, { projectId }: { projectId: string }) => {
  try {
    return await handleContentRouteGetView(request, { projectId });
  } catch (error) {
    return getContentRouteErrorResponse(error);
  }
};

export const handleContentRoutePost = async (request: Request, { projectId, user }: { projectId: string; user: { id: string } }) => {
  const payloadResult = await parseJsonBody(request, contentActionSchema, {
    maxBytes: 2 * 1024 * 1024,
  });

  if (payloadResult.errorResponse) {
    return payloadResult.errorResponse;
  }

  const payload = payloadResult.data as ContentActionPayload;
  const rateLimit = getContentActionRateLimit(payload.action);
  const rateLimitError = enforceRateLimit({
    bucket: `api:project-content:${payload.action}`,
    key: user.id,
    limit: rateLimit.limit,
    request,
    windowMs: rateLimit.windowMs,
  });

  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    if (payload.action === "create_post") {
      const post = await createContentPost(projectId);
      return NextResponse.json({ post });
    }

    if (payload.action === "discard_post") {
      if (!payload.postId) {
        return NextResponse.json({ error: "Select a post first." }, { status: 400 });
      }

      await discardContentPost({
        postId: payload.postId,
        projectId,
      });

      return NextResponse.json({ success: true });
    }

    if (payload.action === "delete_posts") {
      if (!payload.postIds?.length) {
        return NextResponse.json({ error: "Select a post first." }, { status: 400 });
      }

      await deleteContentPosts({
        postIds: payload.postIds,
        projectId,
      });

      return NextResponse.json({ success: true });
    }

    if (payload.action === "save_mapping_config") {
      if (!payload.mappingConfig) {
        return NextResponse.json({ error: "Mapping config is required." }, { status: 400 });
      }

      const mapping = await saveContentMappingRevision({
        bindingStatus: payload.bindingStatus,
        mappingConfig: payload.mappingConfig,
        mappingScope: payload.mappingScope ?? "full",
        projectId,
        source: payload.source ?? "manual",
      });

      return NextResponse.json({ mapping });
    }

    if (payload.action === "acquire_post_edit_session") {
      if (!payload.postId) {
        return NextResponse.json({ error: "Select a post first." }, { status: 400 });
      }

      const session = await acquireContentPostEditSession({
        force: Boolean(payload.force),
        postId: payload.postId,
        postTitle: payload.postTitle ?? null,
        projectId,
      });

      return NextResponse.json(session);
    }

    if (payload.action === "heartbeat_post_edit_session") {
      if (!payload.postId) {
        return NextResponse.json({ error: "Select a post first." }, { status: 400 });
      }

      const session = await heartbeatContentPostEditSession({
        postId: payload.postId,
        postTitle: payload.postTitle ?? null,
        projectId,
      });

      return NextResponse.json(session);
    }

    if (payload.action === "release_post_edit_session") {
      await releaseContentPostEditSession({
        postId: payload.postId ?? null,
        projectId,
      });

      return NextResponse.json({ success: true });
    }

    if (payload.action === "update_post") {
      if (!payload.postId) {
        return NextResponse.json({ error: "Select a post first." }, { status: 400 });
      }

      const post = await updateContentPost({
        authorId: payload.authorId,
        categoryIds: payload.categoryIds,
        contentFields: payload.contentFields,
        contentHtml: payload.contentHtml,
        contentJson: payload.contentJson,
        contentMarkdown: payload.contentMarkdown,
        customFields: payload.customFields,
        excerpt: payload.excerpt,
        focusKeyword: payload.focusKeyword,
        featuredImageUrl: payload.featuredImageUrl,
        parentPageId: payload.parentPageId,
        postId: payload.postId,
        publishedAt: payload.publishedAt,
        projectId,
        redirects: payload.redirects,
        seoDescription: payload.seoDescription,
        seoTitle: payload.seoTitle,
        slug: payload.slug,
        status: payload.status,
        tagIds: payload.tagIds,
        title: payload.title,
        expectedUpdatedAt: payload.expectedUpdatedAt,
        expectedVersion: payload.expectedVersion,
        updatedAt: payload.updatedAt,
      });

      return NextResponse.json({ post });
    }

    if (payload.action === "publish_post") {
      if (!payload.postId) {
        return NextResponse.json({ error: "Select a post first." }, { status: 400 });
      }

      const post = await publishContentPost({
        authorId: payload.authorId,
        categoryIds: payload.categoryIds,
        contentFields: payload.contentFields,
        contentHtml: payload.contentHtml,
        contentJson: payload.contentJson,
        contentMarkdown: payload.contentMarkdown,
        customFields: payload.customFields,
        excerpt: payload.excerpt,
        focusKeyword: payload.focusKeyword,
        featuredImageUrl: payload.featuredImageUrl,
        parentPageId: payload.parentPageId,
        postId: payload.postId,
        publishedAt: payload.publishedAt,
        projectId,
        redirects: payload.redirects,
        seoDescription: payload.seoDescription,
        seoTitle: payload.seoTitle,
        slug: payload.slug,
        tagIds: payload.tagIds,
        title: payload.title,
        expectedUpdatedAt: payload.expectedUpdatedAt,
        expectedVersion: payload.expectedVersion,
        updatedAt: payload.updatedAt,
      });

      return NextResponse.json({ post });
    }

    if (payload.action === "archive_post") {
      if (!payload.postId) {
        return NextResponse.json({ error: "Select a post first." }, { status: 400 });
      }

      const post = await archiveContentPost({
        authorId: payload.authorId,
        categoryIds: payload.categoryIds,
        contentFields: payload.contentFields,
        contentHtml: payload.contentHtml,
        contentJson: payload.contentJson,
        contentMarkdown: payload.contentMarkdown,
        customFields: payload.customFields,
        excerpt: payload.excerpt,
        focusKeyword: payload.focusKeyword,
        featuredImageUrl: payload.featuredImageUrl,
        parentPageId: payload.parentPageId,
        postId: payload.postId,
        projectId,
        redirects: payload.redirects,
        seoDescription: payload.seoDescription,
        seoTitle: payload.seoTitle,
        slug: payload.slug,
        tagIds: payload.tagIds,
        title: payload.title,
        expectedUpdatedAt: payload.expectedUpdatedAt,
        expectedVersion: payload.expectedVersion,
        updatedAt: payload.updatedAt,
      });

      return NextResponse.json({ post });
    }

    if (payload.action === "unpublish_post") {
      if (!payload.postId) {
        return NextResponse.json({ error: "Select a post first." }, { status: 400 });
      }

      const post = await unpublishContentPost({
        authorId: payload.authorId,
        categoryIds: payload.categoryIds,
        contentFields: payload.contentFields,
        contentHtml: payload.contentHtml,
        contentJson: payload.contentJson,
        contentMarkdown: payload.contentMarkdown,
        customFields: payload.customFields,
        excerpt: payload.excerpt,
        focusKeyword: payload.focusKeyword,
        featuredImageUrl: payload.featuredImageUrl,
        parentPageId: payload.parentPageId,
        postId: payload.postId,
        projectId,
        redirects: payload.redirects,
        seoDescription: payload.seoDescription,
        seoTitle: payload.seoTitle,
        slug: payload.slug,
        tagIds: payload.tagIds,
        title: payload.title,
        expectedUpdatedAt: payload.expectedUpdatedAt,
        expectedVersion: payload.expectedVersion,
        updatedAt: payload.updatedAt,
      });

      return NextResponse.json({ post });
    }

    if (payload.action === "restore_post_revision") {
      if (!payload.postId) {
        return NextResponse.json({ error: "Select a post first." }, { status: 400 });
      }

      if (!Number.isFinite(payload.revisionNumber) || (payload.revisionNumber ?? 0) < 1) {
        return NextResponse.json({ error: "Select a valid revision first." }, { status: 400 });
      }

      const post = await restoreContentPostRevision({
        postId: payload.postId,
        projectId,
        revisionNumber: payload.revisionNumber as number,
      });

      return NextResponse.json({ post });
    }

    if (payload.action === "create_collection_entry") {
      const name = payload.name?.trim() ?? "";

      if (!name) {
        return NextResponse.json({ error: "Name is required." }, { status: 400 });
      }

      const entry = await createContentCollectionEntry({
        collection: payload.collection,
        description: payload.description,
        name,
        parentCategoryId: payload.parentCategoryId,
        projectId,
        slug: payload.slug,
      });

      return NextResponse.json({ entry });
    }

    if (payload.action === "update_collection_entry") {
      const name = payload.name?.trim() ?? "";
      const entryId = payload.entryId?.trim() ?? "";

      if (!entryId) {
        return NextResponse.json({ error: "Select an entry first." }, { status: 400 });
      }

      if (!name) {
        return NextResponse.json({ error: "Name is required." }, { status: 400 });
      }

      const entry = await updateContentCollectionEntry({
        bio: payload.bio,
        collection: payload.collection,
        description: payload.description,
        email: payload.email,
        entryId,
        name,
        parentCategoryId: payload.parentCategoryId,
        projectId,
        slug: payload.slug,
      });

      return NextResponse.json({ entry });
    }

    if (payload.action === "delete_collection_entries") {
      if (!payload.entryIds?.length) {
        return NextResponse.json({ error: "Select an entry first." }, { status: 400 });
      }

      await deleteContentCollectionEntries({
        collection: payload.collection,
        entryIds: payload.entryIds,
        projectId,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unsupported content action." }, { status: 400 });
  } catch (error) {
    console.error(`[content-runtime-route][content.action:${payload.action}]`, {
      error,
      projectId,
    });
    return getContentRouteErrorResponse(error);
  }
};
