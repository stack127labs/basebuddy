import { z } from "zod";

import type {
  ContentBindingStatus,
  ContentMappingConfig,
  ContentMappingRevisionSource,
  ContentMappingSaveScope,
} from "@/lib/content-runtime/mapping";
import {
  CONTENT_BINDING_STATUS_VALUES,
  CONTENT_MAPPING_REVISION_SOURCE_VALUES,
  CONTENT_MAPPING_SAVE_SCOPE_VALUES,
} from "@/lib/content-runtime/mapping";
import type {
  ContentPostStatus,
  ContentRedirectEntryInput,
} from "@/lib/content-runtime/shared";
import {
  CONTENT_POST_STATUS_VALUES,
} from "@/lib/content-runtime/shared";

export type ContentActionPayload =
  | {
      action: "create_collection_entry";
      bio?: string | null;
      collection: "authors" | "categories" | "tags";
      description?: string | null;
      name?: string;
      parentCategoryId?: string | null;
      slug?: string | null;
    }
  | {
      action: "update_collection_entry";
      bio?: string | null;
      collection: "authors" | "categories" | "tags";
      description?: string | null;
      email?: string | null;
      entryId?: string;
      name?: string;
      parentCategoryId?: string | null;
      slug?: string | null;
    }
  | {
      action: "delete_collection_entries";
      collection: "authors" | "categories" | "tags";
      entryIds?: string[];
    }
  | {
      action: "acquire_post_edit_session";
      force?: boolean;
      postId?: string;
      postTitle?: string | null;
    }
  | {
      action: "heartbeat_post_edit_session";
      postId?: string;
      postTitle?: string | null;
    }
  | {
      action: "release_post_edit_session";
      postId?: string | null;
    }
  | {
      action: "create_post";
    }
  | {
      action: "discard_post";
      postId?: string;
    }
  | {
      action: "delete_posts";
      postIds?: string[];
    }
  | {
      action: "save_mapping_config";
      bindingStatus?: ContentBindingStatus | null;
      mappingConfig?: ContentMappingConfig;
      mappingScope?: ContentMappingSaveScope | null;
      source?: ContentMappingRevisionSource;
    }
  | {
      action: "archive_post";
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
      postId?: string;
      redirects?: ContentRedirectEntryInput[];
      seoDescription?: string | null;
      seoTitle?: string | null;
      slug?: string;
      tagIds?: string[];
      title?: string;
      expectedUpdatedAt?: string | null;
      expectedVersion?: string;
      updatedAt?: string | null;
    }
  | {
      action: "publish_post";
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
      postId?: string;
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
    }
  | {
      action: "unpublish_post";
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
      postId?: string;
      redirects?: ContentRedirectEntryInput[];
      seoDescription?: string | null;
      seoTitle?: string | null;
      slug?: string;
      tagIds?: string[];
      title?: string;
      expectedUpdatedAt?: string | null;
      expectedVersion?: string;
      updatedAt?: string | null;
    }
  | {
      action: "restore_post_revision";
      postId?: string;
      revisionNumber?: number;
    }
  | {
      action: "update_post";
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
      postId?: string;
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

export type ContentRouteView =
  | "authors"
  | "categories"
  | "mapping_detection"
  | "mapping_tables"
  | "mapping"
  | "media"
  | "post"
  | "relation_options"
  | "posts_presence"
  | "post_revisions"
  | "posts"
  | "tags"
  | "workspace_counts"
  | "workspace";

const contentIdSchema = z.string().trim().min(1).max(200);
const contentOptionalIdSchema = z.string().trim().max(200).nullable().optional();
const contentOptionalStringSchema = z.string().trim().optional();
const contentOptionalNullableStringSchema = z.string().trim().nullable().optional();
const contentOptionalNullableDateTimeSchema = z.string().datetime({ offset: true }).nullable().optional();
const contentIdArraySchema = z.array(contentIdSchema).optional();
const contentRedirectRowSchema = z.object({
  active: z.boolean().nullable().optional(),
  locale: z.string().trim().max(120).nullable().optional(),
  source: z.string().trim().min(1).max(500),
  statusCode: z.number().int().min(100).max(999).nullable().optional(),
});
const contentRedirectsSchema = z
  .array(z.union([z.string().trim().min(1).max(500), contentRedirectRowSchema]))
  .max(250)
  .optional();
const contentObjectSchema = z.object({}).passthrough();
const contentCollectionSchema = z.enum(["authors", "categories", "tags"]);

const contentFieldValueSchema = z.object({
  contentHtml: z.string().max(500_000),
  contentJson: contentObjectSchema,
});

const contentPostMutationFields = {
  authorId: contentOptionalIdSchema,
  categoryIds: contentIdArraySchema,
  contentFields: z.record(z.string(), contentFieldValueSchema).optional(),
  contentHtml: z.string().max(500_000).optional(),
  contentJson: contentObjectSchema.optional(),
  contentMarkdown: z.string().max(500_000).nullable().optional(),
  customFields: contentObjectSchema.optional(),
  excerpt: contentOptionalNullableStringSchema,
  featuredImageUrl: contentOptionalNullableStringSchema,
  focusKeyword: contentOptionalNullableStringSchema,
  parentPageId: contentOptionalIdSchema,
  postId: contentIdSchema,
  publishedAt: contentOptionalNullableDateTimeSchema,
  redirects: contentRedirectsSchema,
  seoDescription: contentOptionalNullableStringSchema,
  seoTitle: contentOptionalNullableStringSchema,
  slug: contentOptionalStringSchema,
  status: z.enum(CONTENT_POST_STATUS_VALUES).optional(),
  tagIds: contentIdArraySchema,
  title: contentOptionalStringSchema,
  expectedUpdatedAt: contentOptionalNullableDateTimeSchema,
  expectedVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  updatedAt: contentOptionalNullableDateTimeSchema,
} satisfies Record<string, z.ZodTypeAny>;

export const contentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_post") }),
  z.object({
    action: z.literal("discard_post"),
    postId: contentIdSchema,
  }),
  z.object({
    action: z.literal("delete_posts"),
    postIds: z.array(contentIdSchema).min(1, "Select a post first.").max(50, "Too many posts were selected."),
  }),
  z.object({
    action: z.literal("save_mapping_config"),
    bindingStatus: z.enum(CONTENT_BINDING_STATUS_VALUES).nullable().optional(),
    mappingConfig: contentObjectSchema,
    mappingScope: z.enum(CONTENT_MAPPING_SAVE_SCOPE_VALUES).nullable().optional(),
    source: z.enum(CONTENT_MAPPING_REVISION_SOURCE_VALUES).optional(),
  }),
  z.object({
    action: z.literal("acquire_post_edit_session"),
    force: z.boolean().optional(),
    postId: contentIdSchema,
    postTitle: contentOptionalNullableStringSchema,
  }),
  z.object({
    action: z.literal("heartbeat_post_edit_session"),
    postId: contentIdSchema,
    postTitle: contentOptionalNullableStringSchema,
  }),
  z.object({
    action: z.literal("release_post_edit_session"),
    postId: contentOptionalIdSchema,
  }),
  z.object({
    action: z.literal("update_post"),
    ...contentPostMutationFields,
  }),
  z.object({
    action: z.literal("archive_post"),
    ...contentPostMutationFields,
  }),
  z.object({
    action: z.literal("publish_post"),
    ...contentPostMutationFields,
  }),
  z.object({
    action: z.literal("unpublish_post"),
    ...contentPostMutationFields,
  }),
  z.object({
    action: z.literal("restore_post_revision"),
    postId: contentIdSchema,
    revisionNumber: z.number().int().min(1, "Select a valid revision first."),
  }),
  z.object({
    action: z.literal("create_collection_entry"),
    bio: contentOptionalNullableStringSchema,
    collection: contentCollectionSchema,
    description: contentOptionalNullableStringSchema,
    name: z.string().trim().min(1, "Name is required."),
    parentCategoryId: contentOptionalIdSchema,
    slug: contentOptionalNullableStringSchema,
  }),
  z.object({
    action: z.literal("update_collection_entry"),
    bio: contentOptionalNullableStringSchema,
    collection: contentCollectionSchema,
    description: contentOptionalNullableStringSchema,
    email: z.string().trim().email("Enter a valid email address.").nullable().optional(),
    entryId: contentIdSchema,
    name: z.string().trim().min(1, "Name is required."),
    parentCategoryId: contentOptionalIdSchema,
    slug: contentOptionalNullableStringSchema,
  }),
  z.object({
    action: z.literal("delete_collection_entries"),
    collection: contentCollectionSchema,
    entryIds: z.array(contentIdSchema).min(1, "Select an entry first.").max(50, "Too many entries were selected."),
  }),
]);

export const getContentActionRateLimit = (action: ContentActionPayload["action"]) => {
  switch (action) {
    case "heartbeat_post_edit_session":
      return { limit: 120, windowMs: 60_000 };
    case "acquire_post_edit_session":
    case "release_post_edit_session":
      return { limit: 60, windowMs: 60_000 };
    case "update_post":
      return { limit: 60, windowMs: 60_000 };
    case "archive_post":
    case "publish_post":
    case "unpublish_post":
      return { limit: 20, windowMs: 60_000 };
    case "save_mapping_config":
      return { limit: 10, windowMs: 60_000 };
    default:
      return { limit: 20, windowMs: 60_000 };
  }
};
