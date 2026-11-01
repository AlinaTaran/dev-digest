import {
  PROJECT_CONTEXT_LIST_CAP,
  PROJECT_CONTEXT_MAX_DOCS,
  PROJECT_CONTEXT_MAX_FILE_BYTES,
  RepoDocsError,
  type AgentContextResponse,
  type ContextAttachedItem,
  type ContextDoc,
  type ContextDocDetail,
  type ContextDocSaveBody,
  type ContextDocSaveResult,
  type ContextInheritedItem,
  type ContextListing,
  type SkillContextResponse,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { ERR, EXCLUDED_DIRS, READ_BATCH, type MissingReason } from './constants.js';
import { resolveEffective, type EffectiveDoc } from './effective.js';
import { docType, matchesAnyGlob, splitPath, validateContextPath } from './paths.js';
import { ProjectContextRepository, type ContextRepo } from './repository.js';
import {
  contentHash,
  decodeUtf8Strict,
  estimateTokens,
  serializeBlock,
  skillSerializesAs,
  specEntry,
} from './serialize.js';

/** Minimal structured logger (satisfied by Fastify's `app.log`). Never receives doc content. */
export interface ContextLog {
  info(obj: Record<string, unknown>, msg: string): void;
  error?(obj: Record<string, unknown>, msg: string): void;
}

export interface ResolvedContext {
  /** Injectable docs in run order: `text` is the raw content, `tokens` = estimate(text). */
  entries: { path: string; text: string; tokens: number }[];
  missing: { path: string; reason: MissingReason }[];
  cloneSha: string | null;
}

/** Spec docs for the PR Brief (union across enabled agents). */
export interface BriefContext {
  entries: { path: string; text: string }[];
  skipped: { path: string; reason: MissingReason }[];
  moreAvailable: boolean;
}

/** Result of reading one doc for display/injection. */
type DocRead =
  | { ok: true; text: string; bytes: Uint8Array }
  | { ok: false; reason: MissingReason };

const encoder = new TextEncoder();

export class ProjectContextService {
  private repo: ProjectContextRepository;

  constructor(
    private container: Container,
    private log?: ContextLog,
  ) {
    this.repo = new ProjectContextRepository(container.db);
  }

  // ------------------------------------------------------------------ listing

  async listing(workspaceId: string, repoId: string): Promise<ContextListing> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const globs = await this.repo.getGlobs(workspaceId);
    const t0 = Date.now();
    const base = {
      repo_id: repo.id,
      globs,
      scanned_at: new Date().toISOString(),
      clone_sha: null as string | null,
      truncated: false,
      total_found: 0,
      docs: [] as ContextDoc[],
    };

    if (!(await this.isCloned(repo))) {
      return { ...base, degraded: true, reason: 'not_cloned' };
    }

    try {
      const files = await this.container.repoDocs.list(this.ref(repo), {
        match: (p) => p.endsWith('.md') && matchesAnyGlob(p, globs),
        excludeDirs: EXCLUDED_DIRS,
      });
      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      const listed = files.slice(0, PROJECT_CONTEXT_LIST_CAP);
      const usedBy = await this.repo.usedByForRepo(workspaceId, repo.id);

      const docs: ContextDoc[] = [];
      for (let i = 0; i < listed.length; i += READ_BATCH) {
        const batch = await Promise.all(
          listed.slice(i, i + READ_BATCH).map(async (f) => {
            const tooLarge = f.sizeBytes > PROJECT_CONTEXT_MAX_FILE_BYTES;
            let tokens = 0;
            if (!tooLarge) {
              const read = await this.readDoc(repo, f.path);
              if (!read.ok) return null; // unreadable / vanished / rejected -> not listed (EC-4)
              tokens = estimateTokens(read.text);
            }
            const { name, dir } = splitPath(f.path);
            const doc: ContextDoc = {
              path: f.path,
              name,
              dir,
              type: docType(f.path),
              size_bytes: f.sizeBytes,
              tokens,
              too_large: tooLarge,
              updated_at: f.mtime,
              used_by_agents: usedBy.get(f.path)?.length ?? 0,
            };
            return doc;
          }),
        );
        for (const d of batch) if (d) docs.push(d);
      }

      const cloneSha = await this.container.git.currentHead(this.ref(repo)).catch(() => null);
      this.log?.info(
        { repo_id: repo.id, found: files.length, listed: docs.length, ms: Date.now() - t0 },
        'project_context.scan',
      );
      return {
        ...base,
        clone_sha: cloneSha,
        truncated: files.length > PROJECT_CONTEXT_LIST_CAP,
        total_found: files.length,
        docs,
        degraded: false,
        reason: null,
      };
    } catch {
      return { ...base, degraded: true, reason: 'scan_failed' };
    }
  }

  // ---------------------------------------------------------------------- doc

  async getDoc(workspaceId: string, repoId: string, path: string): Promise<ContextDocDetail> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const globs = await this.repo.getGlobs(workspaceId);
    this.assertPath(path, globs);
    if (!(await this.isCloned(repo))) throw new AppError(ERR.notFound, 'Document not found', 404);

    const r = await this.container.repoDocs.read(this.ref(repo), path, PROJECT_CONTEXT_MAX_FILE_BYTES);
    const bytes = this.bytesOrThrow(r);
    const text = decodeUtf8Strict(bytes);
    if (text === null) throw new AppError(ERR.unreadable, 'Document is not readable UTF-8 text', 422);

    const usedBy = await this.repo.usedByForRepo(workspaceId, repo.id);
    return {
      path,
      content: text,
      content_hash: contentHash(bytes),
      tokens: estimateTokens(text),
      size_bytes: bytes.byteLength,
      type: docType(path),
      used_by_agents: usedBy.get(path) ?? [],
    };
  }

  async saveDoc(workspaceId: string, repoId: string, body: ContextDocSaveBody): Promise<ContextDocSaveResult> {
    const t0 = Date.now();
    const { path, content, base_hash } = body;
    const repo = await this.requireRepo(workspaceId, repoId);
    const globs = await this.repo.getGlobs(workspaceId);
    const outcome = (o: string, size = 0) =>
      this.log?.info(
        { repo_id: repo.id, path, size_bytes: size, ms: Date.now() - t0, outcome: o },
        'project_context.save',
      );
    try {
      this.assertPath(path, globs);
      if (!(await this.isCloned(repo))) throw new AppError(ERR.notFound, 'Document not found', 404);

      const current = await this.container.repoDocs.read(
        this.ref(repo),
        path,
        PROJECT_CONTEXT_MAX_FILE_BYTES,
      );
      const currentBytes = this.bytesOrThrow(current);

      const newBytes = encoder.encode(content);
      if (newBytes.byteLength > PROJECT_CONTEXT_MAX_FILE_BYTES) {
        throw new AppError(ERR.tooLarge, 'Document exceeds the 256 KB limit', 413);
      }
      if (newBytes.includes(0)) {
        throw new AppError(ERR.unreadable, 'Document must not contain NUL bytes', 422);
      }
      if (contentHash(currentBytes) !== base_hash) {
        throw new AppError(ERR.changedOnDisk, 'File changed on disk since it was loaded', 409);
      }

      try {
        await this.container.repoDocs.writeExisting(this.ref(repo), path, newBytes);
      } catch (err) {
        if (err instanceof RepoDocsError && err.kind === 'missing') {
          throw new AppError(ERR.notFound, 'Document not found', 404);
        }
        if (err instanceof RepoDocsError && err.kind === 'rejected_path') {
          throw new AppError(ERR.invalidPath, 'Path is not an allowed document', 400);
        }
        this.log?.error?.({ err, repoId: repo.id, path }, 'project_context.save_failed');
        const failure = new AppError(ERR.saveFailed, 'Could not save the document', 500);
        failure.cause = err;
        throw failure;
      }
      outcome('saved', newBytes.byteLength);
      return {
        path,
        content_hash: contentHash(newBytes),
        tokens: estimateTokens(content),
        size_bytes: newBytes.byteLength,
        saved_at: new Date().toISOString(),
      };
    } catch (err) {
      outcome(err instanceof AppError ? err.code : 'error');
      throw err;
    }
  }

  // ------------------------------------------------------- agent / skill sets

  async getAgentContext(workspaceId: string, agentId: string, repoId: string): Promise<AgentContextResponse> {
    await this.requireAgent(workspaceId, agentId);
    const repo = await this.requireRepo(workspaceId, repoId);
    return this.buildAgentResponse(workspaceId, agentId, repo);
  }

  async putAgentContext(
    workspaceId: string,
    agentId: string,
    repoId: string,
    paths: string[],
  ): Promise<AgentContextResponse> {
    await this.requireAgent(workspaceId, agentId);
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.validateAttachSet(workspaceId, repo, paths);
    await this.repo.replaceAgentPaths(agentId, repo.id, paths);
    return this.buildAgentResponse(workspaceId, agentId, repo);
  }

  async getSkillContext(workspaceId: string, skillId: string, repoId: string): Promise<SkillContextResponse> {
    await this.requireSkill(workspaceId, skillId);
    const repo = await this.requireRepo(workspaceId, repoId);
    return this.buildSkillResponse(workspaceId, skillId, repo);
  }

  async putSkillContext(
    workspaceId: string,
    skillId: string,
    repoId: string,
    paths: string[],
  ): Promise<SkillContextResponse> {
    await this.requireSkill(workspaceId, skillId);
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.validateAttachSet(workspaceId, repo, paths);
    await this.repo.replaceSkillPaths(skillId, repo.id, paths);
    return this.buildSkillResponse(workspaceId, skillId, repo);
  }

  // ------------------------------------------------------------- run-time API

  /**
   * Resolve + read the agent's effective docs for a run (consumed by the run
   * executor). Fresh read from the clone; NEVER throws — anything that goes wrong
   * lands in `missing` so a run never fails because of project context.
   */
  async resolveForRun(workspaceId: string, agentId: string, repo: ContextRepo): Promise<ResolvedContext> {
    let effective: EffectiveDoc[] = [];
    try {
      const [globs, agentPaths, linked] = await Promise.all([
        this.repo.getGlobs(workspaceId),
        this.repo.agentPaths(agentId, repo.id),
        this.repo.linkedSkillDocs(agentId, repo.id),
      ]);
      effective = resolveEffective(agentPaths, linked);
      if (effective.length === 0) return { entries: [], missing: [], cloneSha: null };

      const allMissing = (reason: MissingReason): ResolvedContext => ({
        entries: [],
        missing: effective.map((e) => ({ path: e.path, reason })),
        cloneSha: null,
      });
      if (!(await this.isCloned(repo))) return allMissing('not cloned');

      const cloneSha = await this.container.git.currentHead(this.ref(repo)).catch(() => null);
      const entries: ResolvedContext['entries'] = [];
      const missing: ResolvedContext['missing'] = [];
      for (const e of effective) {
        if (validateContextPath(e.path, globs) !== null) {
          missing.push({ path: e.path, reason: 'rejected path' });
          continue;
        }
        const read = await this.readDoc(repo, e.path);
        if (read.ok) entries.push({ path: e.path, text: read.text, tokens: estimateTokens(read.text) });
        else missing.push({ path: e.path, reason: read.reason });
      }
      return { entries, missing, cloneSha };
    } catch {
      return {
        entries: [],
        missing: effective.map((e) => ({ path: e.path, reason: 'unreadable' as const })),
        cloneSha: null,
      };
    }
  }

  /**
   * PR Brief specs: the union of docs attached to every ENABLED agent of the workspace (plus their
   * enabled linked skills), agents in creation order, deduped first-wins, capped at
   * PROJECT_CONTEXT_MAX_DOCS. Reads in order until `maxDocs` succeed. NEVER throws; never logs content.
   */
  async resolveForBrief(workspaceId: string, repoId: string, maxDocs = 5): Promise<BriefContext> {
    const empty: BriefContext = { entries: [], skipped: [], moreAvailable: false };
    let union: string[] = [];
    try {
      const repo = await this.repo.getRepo(workspaceId, repoId);
      if (!repo) return empty;
      const [globs, agentIds] = await Promise.all([
        this.repo.getGlobs(workspaceId),
        this.repo.enabledAgentIds(workspaceId),
      ]);
      const seen = new Set<string>();
      for (const agentId of agentIds) {
        const [agentPaths, linked] = await Promise.all([
          this.repo.agentPaths(agentId, repo.id),
          this.repo.linkedSkillDocs(agentId, repo.id),
        ]);
        for (const e of resolveEffective(agentPaths, linked)) {
          if (!seen.has(e.path)) {
            seen.add(e.path);
            union.push(e.path);
          }
        }
      }
      union = union.slice(0, PROJECT_CONTEXT_MAX_DOCS);
      if (union.length === 0) return empty;

      if (!(await this.isCloned(repo))) {
        return { entries: [], skipped: union.map((path) => ({ path, reason: 'not cloned' as const })), moreAvailable: false };
      }
      const entries: BriefContext['entries'] = [];
      const skipped: BriefContext['skipped'] = [];
      let i = 0;
      for (; i < union.length && entries.length < maxDocs; i += 1) {
        const path = union[i]!;
        if (validateContextPath(path, globs) !== null) {
          skipped.push({ path, reason: 'rejected path' });
          continue;
        }
        const read = await this.readDoc(repo, path);
        if (read.ok) entries.push({ path, text: read.text });
        else skipped.push({ path, reason: read.reason });
      }
      return { entries, skipped, moreAvailable: i < union.length };
    } catch {
      return { entries: [], skipped: union.map((path) => ({ path, reason: 'unreadable' as const })), moreAvailable: false };
    }
  }

  // ----------------------------------------------------------------- internals

  private ref(repo: ContextRepo) {
    return { owner: repo.owner, name: repo.name };
  }

  private async isCloned(repo: ContextRepo): Promise<boolean> {
    if (repo.clonePath == null) return false;
    return (await this.container.repoDocs.rootStatus(this.ref(repo))) === 'ok';
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ContextRepo> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async requireAgent(workspaceId: string, agentId: string) {
    const a = await this.repo.getAgent(workspaceId, agentId);
    if (!a) throw new NotFoundError('Agent not found');
    return a;
  }

  private async requireSkill(workspaceId: string, skillId: string) {
    const s = await this.repo.getSkill(workspaceId, skillId);
    if (!s) throw new NotFoundError('Skill not found');
    return s;
  }

  private assertPath(path: string, globs: readonly string[]): void {
    const problem = validateContextPath(path, globs);
    if (problem) throw new AppError(ERR.invalidPath, problem, 400, { paths: [path] });
  }

  /** Map a non-ok repoDocs read to the spec's HTTP error; returns the bytes when ok. */
  private bytesOrThrow(r: Awaited<ReturnType<Container['repoDocs']['read']>>): Uint8Array {
    if (r.kind === 'ok') return r.bytes;
    if (r.kind === 'missing') throw new AppError(ERR.notFound, 'Document not found', 404);
    if (r.kind === 'rejected_path') {
      throw new AppError(ERR.invalidPath, 'Path is not an allowed document', 400);
    }
    throw new AppError(ERR.tooLarge, 'Document exceeds the 256 KB limit', 413);
  }

  /** Read + strictly decode one doc, mapping every failure to a run-log reason. */
  private async readDoc(repo: ContextRepo, path: string): Promise<DocRead> {
    let r;
    try {
      r = await this.container.repoDocs.read(this.ref(repo), path, PROJECT_CONTEXT_MAX_FILE_BYTES);
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
    if (r.kind === 'missing') return { ok: false, reason: 'missing' };
    if (r.kind === 'rejected_path') return { ok: false, reason: 'rejected path' };
    if (r.kind === 'too_large') return { ok: false, reason: 'too large' };
    const text = decodeUtf8Strict(r.bytes);
    return text === null ? { ok: false, reason: 'unreadable' } : { ok: true, text, bytes: r.bytes };
  }

  /** AC-26/27 + EC-2: reject the WHOLE request (nothing persisted) on any bad path. */
  private async validateAttachSet(workspaceId: string, repo: ContextRepo, paths: string[]): Promise<void> {
    if (paths.length > PROJECT_CONTEXT_MAX_DOCS) {
      throw new AppError(
        ERR.tooMany,
        `At most ${PROJECT_CONTEXT_MAX_DOCS} documents can be attached`,
        422,
        { max: PROJECT_CONTEXT_MAX_DOCS, got: paths.length },
      );
    }
    const globs = await this.repo.getGlobs(workspaceId);
    const bad = paths.filter((p) => validateContextPath(p, globs) !== null);
    const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
    if (bad.length > 0 || dupes.length > 0) {
      throw new AppError(ERR.invalidPath, 'One or more paths are invalid', 400, {
        paths: [...new Set([...bad, ...dupes])],
      });
    }
    if (!(await this.isCloned(repo))) return; // nothing to inspect; paths stay attachable
    for (const p of paths) {
      const r = await this.container.repoDocs.read(this.ref(repo), p, PROJECT_CONTEXT_MAX_FILE_BYTES);
      if (r.kind === 'too_large') throw new AppError(ERR.tooLarge, `${p} exceeds the 256 KB limit`, 413, { paths: [p] });
      if (r.kind === 'rejected_path') throw new AppError(ERR.invalidPath, `${p} is not an allowed document`, 400, { paths: [p] });
    }
  }

  /** Per-request cache of doc state (missing/tokens/text) keyed by path. */
  private docInfoLoader(workspaceId: string, repo: ContextRepo) {
    const cache = new Map<string, Promise<{ missing: boolean; tokens: number | null; text: string | null }>>();
    const globsP = this.repo.getGlobs(workspaceId);
    return (path: string) => {
      let p = cache.get(path);
      if (!p) {
        p = (async () => {
          const gone = { missing: true, tokens: null, text: null };
          if (validateContextPath(path, await globsP) !== null) return gone; // EC-16
          if (!(await this.isCloned(repo))) return gone;
          const r = await this.readDoc(repo, path);
          return r.ok ? { missing: false, tokens: estimateTokens(r.text), text: r.text } : gone;
        })();
        cache.set(path, p);
      }
      return p;
    };
  }

  private async buildAgentResponse(
    workspaceId: string,
    agentId: string,
    repo: ContextRepo,
  ): Promise<AgentContextResponse> {
    const info = this.docInfoLoader(workspaceId, repo);
    const [agentPaths, linked] = await Promise.all([
      this.repo.agentPaths(agentId, repo.id),
      this.repo.linkedSkillDocs(agentId, repo.id),
    ]);
    const attachedSet = new Set(agentPaths);

    const attached: ContextAttachedItem[] = await Promise.all(
      agentPaths.map(async (path, position) => {
        const d = await info(path);
        return { path, position, missing: d.missing, tokens: d.tokens };
      }),
    );
    const inherited: ContextInheritedItem[] = [];
    for (const s of linked) {
      if (!s.enabled) continue;
      for (const path of s.paths) {
        const d = await info(path);
        inherited.push({
          path,
          skill_id: s.skillId,
          skill_name: s.skillName,
          missing: d.missing,
          tokens: d.tokens,
          duplicate_of_attached: attachedSet.has(path),
        });
      }
    }
    const effective = await Promise.all(
      resolveEffective(agentPaths, linked).map(async (e) => {
        const d = await info(e.path);
        return { path: e.path, source: e.source, missing: d.missing, tokens: d.tokens, text: d.text };
      }),
    );
    const total = estimateTokens(
      serializeBlock(effective.filter((e) => e.text !== null).map((e) => specEntry(e.path, e.text as string))),
    );
    return {
      repo_id: repo.id,
      attached,
      inherited,
      effective: effective.map(({ text: _text, ...rest }) => rest),
      total_tokens: total,
    };
  }

  private async buildSkillResponse(
    workspaceId: string,
    skillId: string,
    repo: ContextRepo,
  ): Promise<SkillContextResponse> {
    const info = this.docInfoLoader(workspaceId, repo);
    const paths = await this.repo.skillPaths(skillId, repo.id);
    const docs = await Promise.all(
      paths.map(async (path, position) => ({ path, position, d: await info(path) })),
    );
    const total = estimateTokens(
      serializeBlock(docs.filter((x) => x.d.text !== null).map((x) => specEntry(x.path, x.d.text as string))),
    );
    return {
      repo_id: repo.id,
      attached: docs.map((x) => ({
        path: x.path,
        position: x.position,
        missing: x.d.missing,
        tokens: x.d.tokens,
      })),
      total_tokens: total,
      serialized: skillSerializesAs(paths),
    };
  }
}
