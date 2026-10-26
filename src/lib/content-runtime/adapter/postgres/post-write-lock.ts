import type { ContentProjectMapping } from "../../mapping";
import { getEntityIdColumn, getEntityTableName, getMappedContentRuntime, quoteIdentifier, type ContentDatabaseClient } from "../../mapped-content-runtime-support";
import { withContentAdapterTransaction } from "./transaction";

export const withPostgresPostWriteLock = async <T>({ client, mapping, postId }: {
  client: ContentDatabaseClient;
  mapping: ContentProjectMapping;
  postId: string;
}, work: () => Promise<T>): Promise<T> => {
  const posts = getMappedContentRuntime(mapping).posts;
  if (posts.source.kind !== "table") throw new Error("This posts setup is read-only. Choose an editable posts source before editing posts.");
  const idColumn = getEntityIdColumn(posts) || posts.source.primaryKey;
  if (!idColumn) throw new Error("Posts setup is missing a stable ID field.");
  return withContentAdapterTransaction(client, async () => {
    await client.query(`select ${quoteIdentifier(idColumn)} from ${getEntityTableName(posts)} where ${quoteIdentifier(idColumn)} = $1 for update`, [postId]);
    return work();
  });
};
