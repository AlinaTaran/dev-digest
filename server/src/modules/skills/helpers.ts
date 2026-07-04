import { basename } from 'node:path';
import { unzipSync } from 'fflate';
import { SkillType } from '@devdigest/shared';
import type { Skill } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import {
  DEFAULT_IMPORTED_SKILL_TYPE,
  MAX_SKILL_FILE_BYTES,
  MAX_ZIP_ENTRIES,
  SKILL_MD_FILENAME,
} from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the file-import
 * extraction logic. No I/O (the route/service own reading bytes from the
 * request); `extractSkillCore` only ever reads from the in-memory `Buffer` it
 * is given — it never executes, evals, shells out to, or writes any entry.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as Skill['type'],
    source: row.source as Skill['source'],
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** A single `skill_versions` row, mapped for the `/skills/:id/versions` response. */
export interface SkillVersionDto {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersionDto {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** The extracted, still-unsaved core of an imported skill file. */
export interface ExtractedSkillCore {
  name: string;
  description: string;
  type: Skill['type'];
  body: string;
  ignored: string[];
}

/** A minimal `---\nkey: value\n---` frontmatter block, parsed without a YAML lib. */
interface ParsedFrontmatter {
  meta: Record<string, string>;
  body: string;
}

function parseFrontmatter(raw: string): ParsedFrontmatter | undefined {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return undefined;

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return undefined;

  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[match[1]!.toLowerCase()] = value;
  }

  const bodyLines = lines.slice(end + 1);
  while (bodyLines.length && bodyLines[0]!.trim() === '') bodyLines.shift();
  return { meta, body: bodyLines.join('\n') };
}

/** Fallback: first `# Heading` line for the name, first paragraph after it for the description. */
function extractHeadingAndParagraph(text: string): { name?: string; description?: string } {
  const lines = text.split(/\r?\n/);
  let name: string | undefined;
  let idx = 0;
  for (; idx < lines.length; idx++) {
    const line = lines[idx]!.trim();
    if (line.startsWith('#')) {
      name = line.replace(/^#+\s*/, '').trim();
      idx++;
      break;
    }
    if (line !== '') break; // hit non-heading content before finding a heading
  }

  let start = idx;
  while (start < lines.length && lines[start]!.trim() === '') start++;
  const paragraph: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (lines[i]!.trim() === '') break;
    paragraph.push(lines[i]!.trim());
  }

  return { name, description: paragraph.length ? paragraph.join(' ') : undefined };
}

/** Parse a single Markdown file's content into name/description/type/body. */
function parseMarkdownCore(
  content: string,
): Pick<ExtractedSkillCore, 'name' | 'description' | 'type' | 'body'> {
  const frontmatter = parseFrontmatter(content);
  const body = frontmatter ? frontmatter.body : content;
  const fallback = extractHeadingAndParagraph(body);
  const meta = frontmatter?.meta ?? {};

  const name = meta.name ?? fallback.name ?? 'Untitled skill';
  const description = meta.description ?? fallback.description ?? '';
  const typeParsed = SkillType.safeParse(meta.type);
  const type = typeParsed.success ? typeParsed.data : DEFAULT_IMPORTED_SKILL_TYPE;

  return { name, description, type, body };
}

/**
 * Extract a skill's core fields from an uploaded file's raw bytes.
 * `.md` → parsed directly. `.zip` → the entry list is read WITHOUT decompressing
 * anything, then ONLY the target markdown entry (`SKILL.md` case-insensitive at
 * any depth, else the first `*.md`) is inflated. Every other entry path is
 * reported in `ignored` and never read as anything but bytes (never
 * executed/eval'd/shelled/written to disk).
 *
 * Decompression-bomb defense: the entry count and the target entry's declared
 * uncompressed size are checked against caps BEFORE any inflation, so a tiny
 * archive that would expand to GBs is rejected instead of exhausting memory /
 * blocking the event loop. Throws on a cap breach or a corrupt archive; callers
 * (the service) translate that into a 4xx client error.
 */
export function extractSkillCore(filename: string, buf: Buffer): ExtractedSkillCore {
  if (filename.toLowerCase().endsWith('.zip')) {
    const data = new Uint8Array(buf);

    // Pass 1: enumerate entries without inflating (filter always returns false),
    // capturing each entry's declared uncompressed size from the zip headers.
    const infos: { name: string; originalSize: number }[] = [];
    unzipSync(data, {
      filter: (file) => {
        infos.push({ name: file.name, originalSize: file.originalSize });
        return false;
      },
    });

    const entries = infos.filter((f) => !f.name.endsWith('/'));
    if (entries.length > MAX_ZIP_ENTRIES) {
      throw new Error(`Zip has too many entries (${entries.length} > ${MAX_ZIP_ENTRIES}).`);
    }

    const names = entries.map((e) => e.name);
    const skillKey = names.find((key) => basename(key).toLowerCase() === SKILL_MD_FILENAME);
    const mdKey = skillKey ?? names.find((key) => key.toLowerCase().endsWith('.md'));
    const ignored = names.filter((key) => key !== mdKey);

    if (!mdKey) {
      return { name: 'Untitled skill', description: '', type: DEFAULT_IMPORTED_SKILL_TYPE, body: '', ignored };
    }

    const target = entries.find((e) => e.name === mdKey)!;
    if (target.originalSize > MAX_SKILL_FILE_BYTES) {
      throw new Error(
        `Skill file "${mdKey}" is too large (${target.originalSize} bytes > ${MAX_SKILL_FILE_BYTES}).`,
      );
    }

    // Pass 2: inflate ONLY the target markdown entry. A lying (understated)
    // size header makes fflate error out mid-inflate, which the caller maps to 4xx.
    const unzipped = unzipSync(data, { filter: (file) => file.name === mdKey });
    const content = Buffer.from(unzipped[mdKey]!).toString('utf-8');
    return { ...parseMarkdownCore(content), ignored };
  }

  const content = buf.toString('utf-8');
  return { ...parseMarkdownCore(content), ignored: [] };
}
