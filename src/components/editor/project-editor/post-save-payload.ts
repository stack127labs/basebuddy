import type { ContentPost } from "@/lib/content-runtime/shared";

type ProjectEditorPostSaveAction =
  | "update_post"
  | "publish_post"
  | "archive_post"
  | "unpublish_post";

type ProjectEditorPostSaveFields = ReturnType<typeof buildPostSaveFields>;

type ProjectEditorPostSavePayloadInput = {
  action: ProjectEditorPostSaveAction;
  currentPost: ContentPost;
  persistedPost: ContentPost | null | undefined;
  primaryMultiFieldEditorId: string | null;
};

const buildComparableSaveFieldValue = (value: unknown) => (value === undefined ? null : value);

const areComparableSaveFieldValuesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(buildComparableSaveFieldValue(left)) ===
  JSON.stringify(buildComparableSaveFieldValue(right));

const getComparableContentFieldsForSave = (
  contentFields: ContentPost["contentFields"],
  primaryMultiFieldEditorId: string | null,
) => {
  if (!contentFields || Object.keys(contentFields).length === 0) {
    return undefined;
  }

  const filteredContentFields = Object.fromEntries(
    Object.entries(contentFields).filter(([fieldId]) => fieldId !== primaryMultiFieldEditorId),
  );

  return Object.keys(filteredContentFields).length > 0 ? filteredContentFields : undefined;
};

const getChangedRecordForSave = (
  currentRecord: Record<string, unknown> | null | undefined,
  persistedRecord: Record<string, unknown> | null | undefined,
) => {
  const currentEntries = currentRecord ? Object.entries(currentRecord) : [];
  const persistedEntries = persistedRecord ? Object.entries(persistedRecord) : [];
  const changedEntries = new Map<string, unknown>();

  for (const [key, value] of currentEntries) {
    if (!areComparableSaveFieldValuesEqual(value, persistedRecord?.[key])) {
      changedEntries.set(key, value);
    }
  }

  for (const [key] of persistedEntries) {
    if (currentRecord && Object.prototype.hasOwnProperty.call(currentRecord, key)) {
      continue;
    }

    if (currentRecord?.[key] === null && !areComparableSaveFieldValuesEqual(currentRecord[key], persistedRecord?.[key])) {
      changedEntries.set(key, null);
    }
  }

  if (changedEntries.size === 0) {
    return undefined;
  }

  return Object.fromEntries(changedEntries);
};

const buildPostSaveFields = (
  sourcePost: ContentPost,
  primaryMultiFieldEditorId: string | null,
) => ({
  authorId: sourcePost.authorId,
  categoryIds: sourcePost.categoryIds,
  contentFields: getComparableContentFieldsForSave(sourcePost.contentFields, primaryMultiFieldEditorId),
  contentHtml: sourcePost.contentHtml,
  contentJson: sourcePost.contentJson,
  contentMarkdown: sourcePost.contentMarkdown,
  customFields: sourcePost.customFields,
  excerpt: sourcePost.excerpt,
  featuredImageUrl: sourcePost.featuredImageUrl,
  focusKeyword: sourcePost.focusKeyword,
  parentPageId: sourcePost.parentPageId ?? null,
  publishedAt: sourcePost.publishedAt,
  redirects: sourcePost.redirects,
  seoDescription: sourcePost.seoDescription,
  seoTitle: sourcePost.seoTitle,
  slug: sourcePost.slug,
  status: sourcePost.status,
  tagIds: sourcePost.tagIds,
  title: sourcePost.title,
  updatedAt: sourcePost.updatedAt,
});

export const buildProjectEditorPostSavePayloadFields = ({
  action,
  currentPost,
  persistedPost,
  primaryMultiFieldEditorId,
}: ProjectEditorPostSavePayloadInput) => {
  const currentSaveFields = buildPostSaveFields(currentPost, primaryMultiFieldEditorId);
  const persistedSaveFields = persistedPost
    ? buildPostSaveFields(persistedPost, primaryMultiFieldEditorId)
    : null;

  if (action !== "update_post") {
    return {};
  }

  if (!persistedSaveFields) {
    return Object.fromEntries(
      Object.entries(currentSaveFields).filter(([, value]) => value !== undefined),
    );
  }

  return Object.fromEntries(
    Object.entries(currentSaveFields).flatMap(([fieldKey, value]) => {
      if (fieldKey === "contentFields" || fieldKey === "customFields") {
        const changedRecord = getChangedRecordForSave(
          value as Record<string, unknown> | null | undefined,
          persistedSaveFields[fieldKey as keyof ProjectEditorPostSaveFields] as Record<string, unknown> | null | undefined,
        );

        return changedRecord === undefined ? [] : [[fieldKey, changedRecord]];
      }

      return areComparableSaveFieldValuesEqual(
        value,
        persistedSaveFields[fieldKey as keyof ProjectEditorPostSaveFields],
      )
        ? []
        : [[fieldKey, value]];
    }),
  );
};
