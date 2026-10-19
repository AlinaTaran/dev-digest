import type { FakeDevDigestApi } from '../../src/adapters/mocks';
import type {
  Agent,
  Convention,
  Finding,
  Pull,
  Repo,
  Review,
  RunSummary,
} from '../../src/domain/types';

export const REPO_ID = '11111111-1111-4111-8111-111111111111';
export const PR_ID = '22222222-2222-4222-8222-222222222222';
export const AGENT_ID = '33333333-3333-4333-8333-333333333333';
export const RUN_ID = '44444444-4444-4444-8444-444444444444';

export const makeAgent = (o: Partial<Agent> = {}): Agent => ({
  id: AGENT_ID,
  name: 'Security',
  description: 'Finds security bugs',
  enabled: true,
  ...o,
});

export const makeRepo = (o: Partial<Repo> = {}): Repo => ({
  id: REPO_ID,
  owner: 'acme',
  name: 'shop',
  full_name: 'acme/shop',
  ...o,
});

export const makePull = (o: Partial<Pull> = {}): Pull => ({
  id: PR_ID,
  number: 42,
  title: 'Add checkout',
  status: 'open',
  ...o,
});

export const makeRun = (o: Partial<RunSummary> = {}): RunSummary => ({
  run_id: RUN_ID,
  agent_id: AGENT_ID,
  agent_name: 'Security',
  status: 'done',
  error: null,
  ...o,
});

export const makeFinding = (o: Partial<Finding> = {}): Finding => ({
  severity: 'WARNING',
  category: 'bug',
  title: 'Something off',
  file: 'src/a.ts',
  start_line: 10,
  end_line: 14,
  rationale: 'because',
  suggestion: 'fix it',
  ...o,
});

export const makeReview = (o: Partial<Review> = {}): Review => ({
  id: '55555555-5555-4555-8555-555555555555',
  run_id: RUN_ID,
  agent_id: AGENT_ID,
  agent_name: 'Security',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'Needs work',
  score: 62,
  findings: [],
  ...o,
});

export const makeConvention = (o: Partial<Convention> = {}): Convention => ({
  id: '66666666-6666-4666-8666-666666666666',
  rule: 'Use named exports',
  category: 'style',
  evidence_path: 'src/index.ts',
  evidence_line_start: 3,
  evidence_line_end: 3,
  status: 'accepted',
  ...o,
});

/** Seeds one repo (acme/shop), one PR (#42), one enabled agent (Security) into the fake. */
export function seedWorld(api: FakeDevDigestApi): void {
  api.repos = [makeRepo()];
  api.pulls[REPO_ID] = [makePull()];
  api.agents = [makeAgent()];
}
