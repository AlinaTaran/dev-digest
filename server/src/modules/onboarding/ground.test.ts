import { OnboardingArchitectureSection, OnboardingCriticalPathsSection } from '@devdigest/shared';
import { describe, expect, it } from 'vitest';
import type { CommandContext } from './commands.js';
import type { OnboardingDraft } from './draft-schema.js';
import { groundDraft, type GroundContext } from './ground.js';
import { PathIndex } from './paths.js';

const indexedFiles = ['src/real.ts', 'src/app.ts', 'src/api/public/index.ts', 'src/Привіт.ts'];
const trackedFiles = [...indexedFiles, 'package.json', 'specs/a.md', 'specs/b.md', 'src/api/public/other.ts'];
const commands: CommandContext = {
  tracked: new PathIndex(trackedFiles),
  readable: new Set(),
  manifests: new Map([['', new Set(['dev'])]]),
  makefiles: new Map(),
};
const ctx = (over: Partial<GroundContext> = {}): GroundContext => ({
  indexed: new PathIndex(indexedFiles),
  tracked: new PathIndex(trackedFiles),
  fanIn: new Map([['src/real.ts', 14]]),
  commands,
  ...over,
});
const empty: OnboardingDraft = {
  architecture: { summary_md: null, diagram: null },
  critical_paths: [],
  run_locally: [],
  reading_path: [],
  first_tasks: [],
};
const draft = (over: Partial<OnboardingDraft>): OnboardingDraft => ({ ...empty, ...over });
const node = (id: string, path: string | null = null, kind = 'module') => ({ id, label: id, kind, path });

describe('groundDraft: paths', () => {
  it('keeps only real files in every section (AC-17) and counts drops (AC-20)', () => {
    const r = groundDraft(
      draft({
        critical_paths: [{ path: 'src/real.ts', why: 'core' }, { path: 'src/ghost.ts', why: null }],
        reading_path: [{ path: 'src/real.ts', why: 'a' }, { path: 'src/ghost.ts', why: 'b' }],
        run_locally: [{ command: 'pnpm dev', source_path: 'package.json', note: null }, { command: 'pnpm dev', source_path: 'ghost.json', note: null }],
        architecture: { summary_md: null, diagram: { nodes: [node('a', 'src/real.ts'), node('b', 'src/ghost.ts')], edges: [] } },
      }),
      ctx(),
    );
    const [arch, crit, run, read] = r.sections;
    expect(crit.items.map((i) => i.path)).toEqual(['src/real.ts']);
    expect(read.steps.map((i) => i.path)).toEqual(['src/real.ts']);
    expect(run.steps).toHaveLength(1);
    expect(arch.diagram?.nodes.map((n) => n.path)).toEqual(['src/real.ts', null]);
    expect(r.droppedRefs).toBe(4);
  });

  it('accepts globs only when they match indexed files (AC-18)', () => {
    const r = groundDraft(draft({ architecture: { summary_md: 'See `src/api/*` and `src/nope/*`.', diagram: null } }), ctx());
    expect(r.sections[0].summary_md).toBe('See `src/api/*` and src/nope/*.');
    expect(r.droppedRefs).toBe(1);
  });

  it('unwraps ungrounded inline paths but keeps grounded ones and non-paths (AC-19, AC-22)', () => {
    const r = groundDraft(draft({ architecture: { summary_md: 'Uses `src/real.ts`, `src/ghost.ts`, `foo.bar` and `pnpm`.', diagram: null } }), ctx());
    expect(r.sections[0].summary_md).toBe('Uses `src/real.ts`, src/ghost.ts, foo.bar and `pnpm`.');
    expect(r.droppedRefs).toBe(2);
  });

  it('drops traversal, absolute, wrong-case and overlong paths; keeps ./ and Cyrillic (EC-8, 9, 20, 21)', () => {
    const r = groundDraft(
      draft({
        critical_paths: ['/etc/passwd', '../x', './Src/App.ts', 'src/app.ts'.padEnd(513, 'a'), './src/app.ts', 'src/Привіт.ts'].map((path) => ({ path, why: null })),
      }),
      ctx(),
    );
    expect(r.sections[1].items.map((i) => i.path)).toEqual(['src/app.ts', 'src/Привіт.ts']);
    expect(r.droppedRefs).toBe(4);
  });

  it('uses real fan-in, never the model number (AC-30), dedups and caps', () => {
    const r = groundDraft(
      draft({ critical_paths: [{ path: 'src/real.ts', why: 'x'.repeat(200), fan_in: 99 } as never, { path: 'src/real.ts', why: null }, { path: 'src/app.ts', why: null }] }),
      ctx(),
    );
    const items = r.sections[1].items;
    expect(items.map((i) => [i.path, i.fan_in])).toEqual([['src/real.ts', 14], ['src/app.ts', 0]]);
    expect(items[0]?.why?.length).toBe(120);
    expect(r.counts.critical_paths).toBe(2);
  });
});

describe('groundDraft: diagram', () => {
  it('cuts 13 nodes / 21 edges and drops edges to cut or missing nodes (AC-23, AC-26)', () => {
    const nodes = Array.from({ length: 13 }, (_, i) => node(`n${i}`));
    const edges = [
      ...Array.from({ length: 21 }, (_, i) => ({ from: 'n0', to: `n${(i % 11) + 1}`, label: null })),
      { from: 'n0', to: 'n12', label: null },
      { from: 'n0', to: 'zzz', label: null },
    ];
    const d = groundDraft(draft({ architecture: { summary_md: null, diagram: { nodes, edges } } }), ctx()).sections[0].diagram;
    expect(d?.nodes).toHaveLength(12);
    expect(d?.edges).toHaveLength(20);
    const only = groundDraft(draft({ architecture: { summary_md: null, diagram: { nodes, edges: edges.slice(21) } } }), ctx()).sections[0].diagram;
    expect(only?.edges).toEqual([]);
  });

  it('normalises kinds, cuts labels, dedups ids, nulls under 2 nodes (AC-25, AC-27)', () => {
    const d = groundDraft(
      draft({ architecture: { summary_md: null, diagram: { nodes: [{ id: 'a', label: 'L'.repeat(50), kind: 'Weird', path: null }, node('a'), node('b', null, 'datastore')], edges: [{ from: 'a', to: 'b', label: 'e'.repeat(40) }] } } }),
      ctx(),
    ).sections[0].diagram;
    expect(d?.nodes.map((n) => n.kind)).toEqual(['module', 'datastore']);
    expect(d?.nodes[0]?.label).toHaveLength(40);
    expect(d?.edges[0]?.label).toHaveLength(30);
    const one = groundDraft(draft({ architecture: { summary_md: null, diagram: { nodes: [node('a')], edges: [] } } }), ctx());
    expect(one.sections[0].diagram).toBeNull();
    expect(one.sections[0].empty_reason).toBe('all_dropped');
  });

  it('nulls an overlong summary but keeps the diagram', () => {
    const r = groundDraft(draft({ architecture: { summary_md: 'a'.repeat(1201), diagram: { nodes: [node('a'), node('b')], edges: [] } } }), ctx());
    expect(r.sections[0].summary_md).toBeNull();
    expect(r.sections[0].diagram).not.toBeNull();
    expect(r.sections[0].empty_reason).toBeNull();
  });

  it('measures the summary cap in UTF-16 units and the output passes the contract', () => {
    // 700 code points (under 1200) but 1400 UTF-16 units (over 1200): must be nulled.
    const over = groundDraft(draft({ architecture: { summary_md: '😀'.repeat(700), diagram: null } }), ctx());
    expect(over.sections[0].summary_md).toBeNull();
    // 600 emoji = exactly 1200 units: kept, and parses.
    const fits = groundDraft(draft({ architecture: { summary_md: '😀'.repeat(600), diagram: { nodes: [{ id: 'a', label: '😀'.repeat(30), kind: 'module', path: null }, node('b')], edges: [{ from: 'a', to: 'b', label: '😀'.repeat(20) }] } } }), ctx());
    expect(fits.sections[0].summary_md).toHaveLength(1200);
    expect(OnboardingArchitectureSection.safeParse(fits.sections[0]).success).toBe(true);
  });

  it('cuts emoji-heavy why text so the critical-paths section still parses', () => {
    const r = groundDraft(draft({ critical_paths: [{ path: 'src/real.ts', why: '😀'.repeat(100) }] }), ctx());
    expect(OnboardingCriticalPathsSection.safeParse(r.sections[1]).success).toBe(true);
  });
});

describe('groundDraft: reading path and first tasks', () => {
  it('keeps first occurrence and caps reading path (AC-36, AC-37)', () => {
    const r = groundDraft(draft({ reading_path: [{ path: 'src/app.ts', why: 'a' }, { path: 'src/real.ts', why: 'b' }, { path: './src/app.ts', why: 'c' }] }), ctx());
    expect(r.sections[3].steps).toEqual([{ path: 'src/app.ts', why: 'a' }, { path: 'src/real.ts', why: 'b' }]);
  });

  it('classifies tasks against the tracked tree and keeps the first 3 survivors (AC-39, AC-40)', () => {
    const t = (path: string, complexity = 'low') => ({ title: `t ${path}`, path, complexity });
    const r = groundDraft(
      draft({ first_tasks: [t('src/ghost/x.ts'), t('src/real.ts'), t('src/api/public/health.ts'), t('specs/', 'medium'), t('src/app.ts'), t('README-new.md')] }),
      ctx(),
    );
    expect(r.sections[4].tasks.map((x) => [x.path, x.path_kind])).toEqual([
      ['src/real.ts', 'file'],
      ['src/api/public/health.ts', 'new_file'],
      ['specs/', 'dir'],
    ]);
    expect(r.sections[4].empty_reason).toBeNull();
  });

  it('drops high complexity without hurting other sections (AC-70) and sets empty reasons (AC-21)', () => {
    const r = groundDraft(draft({ critical_paths: [{ path: 'src/app.ts', why: null }], first_tasks: [{ title: 't', path: 'src/app.ts', complexity: 'high' }, { title: 't', path: 'src/ghost/a.ts', complexity: 'low' }] }), ctx());
    expect(r.sections[1].items).toHaveLength(1);
    expect(r.sections[4].tasks).toEqual([]);
    expect(r.sections[4].empty_reason).toBe('all_dropped');
    expect(r.sections[2].empty_reason).toBe('no_data');
  });

  it('drops all tasks when the tracked tree is unavailable and cuts titles', () => {
    const none = groundDraft(draft({ first_tasks: [{ title: 't', path: 'src/app.ts', complexity: 'low' }] }), ctx({ tracked: null }));
    expect(none.sections[4]).toMatchObject({ tasks: [], empty_reason: 'no_data' });
    const cut = groundDraft(draft({ first_tasks: [{ title: 'T'.repeat(100), path: 'src/app.ts', complexity: 'low' }] }), ctx());
    expect(cut.sections[4].tasks[0]?.title).toHaveLength(80);
  });
});
