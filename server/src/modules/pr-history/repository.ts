import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface PullSummaryRow {
  number: number;
  title: string;
  author: string;
  body: string | null;
}

/** pr-history data access. Always scoped by workspace AND repo (IDOR rule). */
export class PrHistoryRepository {
  constructor(private db: Db) {}

  async findPullsByNumbers(
    workspaceId: string,
    repoId: string,
    numbers: number[],
  ): Promise<PullSummaryRow[]> {
    if (numbers.length === 0) return [];
    return this.db
      .select({
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        body: t.pullRequests.body,
      })
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          inArray(t.pullRequests.number, numbers),
        ),
      );
  }
}
