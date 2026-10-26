import type { ContentProjectMapping } from "@/lib/content-runtime/mapping";

import type {
  ContentCompiledAdapterMapping,
  ContentCompiledScalarFieldInstruction,
} from "../compiler";
import type { ContentAdapterSavePostRequest } from "../contracts";
import { sanitizeAdapterContentWriteInput } from "./content-write-input";
import { sanitizeAdapterCustomFieldWriteInput } from "./custom-field-write-input";
import { sanitizeAdapterRedirectsWriteValue } from "./redirect-write-values";
import {
  sanitizeAdapterBuiltInRelationIdsValue,
  sanitizeAdapterSingleRelationValue,
} from "./relation-write-values";
import {
  coerceAdapterFieldWriteValue,
  isWritableEditabilityState,
} from "./write-value-coercion";
import type {
  ContentAdapterArchiveExecutionRequest,
  ContentAdapterPublishExecutionRequest,
  ContentAdapterSavePostExecutionRequest,
  ContentAdapterUnpublishExecutionRequest,
} from "./factory";

const sanitizeAdapterScalarWriteValue = ({
  fieldInstruction,
  value,
}: {
  fieldInstruction:
    | ContentCompiledScalarFieldInstruction
    | ContentCompiledAdapterMapping["workflowFields"][keyof ContentCompiledAdapterMapping["workflowFields"]]
    | undefined;
  value: unknown;
}) => {
  if (value === undefined || !fieldInstruction || !isWritableEditabilityState(fieldInstruction.editabilityState)) {
    return undefined;
  }

  const label =
    "label" in fieldInstruction
      ? fieldInstruction.label
      : fieldInstruction.fieldKey === "status"
        ? "Status"
        : fieldInstruction.fieldKey === "publishedAt"
          ? "Published At"
          : fieldInstruction.fieldKey;

  return coerceAdapterFieldWriteValue({
    fieldKey: fieldInstruction.fieldKey,
    label,
    nullable: !("required" in fieldInstruction) || !fieldInstruction.required,
    value,
    valueKind: fieldInstruction.valueKind,
  });
};

type ContentAdapterSanitizedSavePostExecutionRequest = ContentAdapterSavePostExecutionRequest & {
  expectedUpdatedAt?: string | null;
};

export const sanitizeAdapterSavePostRequest = ({
  compiled,
  request,
  forcedStatus,
  mapping,
}: {
  compiled: ContentCompiledAdapterMapping;
  forcedStatus?: ContentAdapterSavePostRequest["status"];
  mapping: ContentProjectMapping;
  request:
    | ContentAdapterSavePostExecutionRequest
    | ContentAdapterPublishExecutionRequest
    | ContentAdapterUnpublishExecutionRequest
    | ContentAdapterArchiveExecutionRequest;
}): ContentAdapterSanitizedSavePostExecutionRequest => {
  const titleInstruction = compiled.scalarFields.title;
  const slugInstruction = compiled.scalarFields.slug;
  const excerptInstruction = compiled.scalarFields.excerpt;
  const redirectsInstruction = compiled.scalarFields.redirects;
  const featuredImageInstruction = compiled.scalarFields.featuredImage;
  const seoTitleInstruction = compiled.scalarFields.seoTitle;
  const seoDescriptionInstruction = compiled.scalarFields.seoDescription;
  const focusKeywordInstruction = compiled.scalarFields.focusKeyword;
  const publishedAtInstruction = compiled.workflowFields.publishedAt ?? compiled.scalarFields.publishedAt;
  const updatedAtInstruction = compiled.scalarFields.updatedAt;
  const authorInstruction = compiled.relationFields.author;
  const categoriesInstruction = compiled.relationFields.categories;
  const parentPageInstruction = compiled.relationFields.parentPage;
  const tagsInstruction = compiled.relationFields.tags;
  const statusInstruction = compiled.workflowFields.status;
  const normalizedContentWriteInput = sanitizeAdapterContentWriteInput({
    compiled,
    mapping,
    request,
  });
  const expectedUpdatedAt = request.expectedUpdatedAt ?? (
    updatedAtInstruction && !isWritableEditabilityState(updatedAtInstruction.editabilityState)
      ? request.updatedAt
      : undefined
  );

  return {
    client: request.client,
    expectedVersion: request.expectedVersion,
    authorId: sanitizeAdapterSingleRelationValue({
      editabilityState: authorInstruction?.editabilityState,
      label: "Author",
      value: request.authorId,
    }),
    categoryIds: sanitizeAdapterBuiltInRelationIdsValue({
      editabilityState: categoriesInstruction?.editabilityState,
      fieldKey: "categories",
      label: "Categories",
      multiple: categoriesInstruction?.multiple ?? true,
      value: request.categoryIds,
    }),
    contentFields: normalizedContentWriteInput.contentFields,
    contentHtml: normalizedContentWriteInput.contentHtml,
    contentJson: normalizedContentWriteInput.contentJson,
    contentMarkdown: normalizedContentWriteInput.contentMarkdown,
    customFields: sanitizeAdapterCustomFieldWriteInput({
      compiled,
      customFieldValues: request.customFields,
      mapping,
      postId: request.postId,
    }),
    excerpt: sanitizeAdapterScalarWriteValue({
      fieldInstruction: excerptInstruction,
      value: request.excerpt,
    }),
    featuredImageUrl: sanitizeAdapterScalarWriteValue({
      fieldInstruction: featuredImageInstruction,
      value: request.featuredImageUrl,
    }),
    focusKeyword: sanitizeAdapterScalarWriteValue({
      fieldInstruction: focusKeywordInstruction,
      value: request.focusKeyword,
    }),
    parentPageId: sanitizeAdapterSingleRelationValue({
      editabilityState: parentPageInstruction?.editabilityState,
      label: "Parent Page",
      value: request.parentPageId,
    }),
    publishedAt: sanitizeAdapterScalarWriteValue({
      fieldInstruction: publishedAtInstruction,
      value: request.publishedAt,
    }),
    redirects: sanitizeAdapterRedirectsWriteValue({
      fieldInstruction: redirectsInstruction,
      value: request.redirects,
    }),
    seoDescription: sanitizeAdapterScalarWriteValue({
      fieldInstruction: seoDescriptionInstruction,
      value: request.seoDescription,
    }),
    seoTitle: sanitizeAdapterScalarWriteValue({
      fieldInstruction: seoTitleInstruction,
      value: request.seoTitle,
    }),
    slug: sanitizeAdapterScalarWriteValue({
      fieldInstruction: slugInstruction,
      value: request.slug,
    }),
    status:
      forcedStatus !== undefined
        ? forcedStatus
        : statusInstruction?.storagePrimitive === "boolean_mapping"
          ? undefined
          : sanitizeAdapterScalarWriteValue({
              fieldInstruction: statusInstruction,
              value: request.status,
            }),
    tagIds: sanitizeAdapterBuiltInRelationIdsValue({
      editabilityState: tagsInstruction?.editabilityState,
      fieldKey: "tags",
      label: "Tags",
      multiple: tagsInstruction?.multiple ?? true,
      value: request.tagIds,
    }),
    title: sanitizeAdapterScalarWriteValue({
      fieldInstruction: titleInstruction,
      value: request.title,
    }),
    postId: request.postId,
    ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
    updatedAt: sanitizeAdapterScalarWriteValue({
      fieldInstruction: updatedAtInstruction,
      value: request.updatedAt,
    }),
  } as ContentAdapterSanitizedSavePostExecutionRequest;
};
