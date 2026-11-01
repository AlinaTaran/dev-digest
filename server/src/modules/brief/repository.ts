import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrBrief } from '@devdigest/shared';

/** `pr_brief` data access (one row per PR). Reads return raw JSON so callers can `safeParse` it. */
export class BriefRepository {
  constructor(private db: Db) {}

  async getBriefJson(prId: string): Promise<unknown | undefined> {
    const [row] = await this.db.select({ json: t.prBrief.json }).from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row?.json;
  }

  async upsertBrief(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }

  /**
   * Upserts inside a transaction and commits only if `canCommit()` still holds at the last moment;
   * otherwise rolls back. Returns whether the brief was saved.
   */
  async upsertBriefUnless(prId: string, brief: PrBrief, canCommit: () => boolean): Promise<boolean> {
    class Abort extends Error {}
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .insert(t.prBrief)
          .values({ prId, json: brief })
          .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
        if (!canCommit()) throw new Abort();
      });
      return true;
    } catch (err) {
      if (err instanceof Abort) return false;
      throw err;
    }
  }
}
