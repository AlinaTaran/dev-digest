import type { BlastRadiusResult } from '../types';

export interface GetBlastRadiusInput {
  repo: string;
  pr: number;
}

export type GetBlastRadius = (input: GetBlastRadiusInput) => Promise<BlastRadiusResult>;

/** Stub: makes no API calls and never fails. */
export function createGetBlastRadius(): GetBlastRadius {
  return async ({ repo, pr }) => ({
    status: 'not_implemented',
    repo,
    pr,
    hint: { code: 'BLAST_STUB' },
  });
}
