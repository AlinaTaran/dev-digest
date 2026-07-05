/** Constants for the skills module. */

/** Initial version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default skill type applied to an imported file when frontmatter doesn't name one. */
export const DEFAULT_IMPORTED_SKILL_TYPE = 'custom' as const;

/** Filename (case-insensitive) treated as the canonical skill file inside a `.zip`. */
export const SKILL_MD_FILENAME = 'skill.md';

/**
 * Hard caps on an imported `.zip`, enforced BEFORE any entry is decompressed, to
 * prevent a decompression-bomb DoS (a tiny archive that inflates to GBs). The
 * request bodyLimit only bounds the compressed upload; these bound what we
 * actually inflate.
 */
/** Reject archives declaring more than this many entries. */
export const MAX_ZIP_ENTRIES = 512;
/** Max uncompressed size (bytes) of the single skill markdown entry we decompress (~1 MB). */
export const MAX_SKILL_FILE_BYTES = 1_000_000;
