import { ApiError } from "@/lib/api";

export type SaveErrorKind = "conflict" | "tooLarge" | "unreadable" | "invalid" | "failed";

/** Map a failed save to its i18n key under `saveError.*` (spec codes + status). */
export function classifySaveError(err: unknown): SaveErrorKind {
  if (!(err instanceof ApiError)) return "failed";
  if (err.status === 409 || err.code === "doc_changed_on_disk") return "conflict";
  if (err.status === 413 || err.code === "doc_too_large") return "tooLarge";
  if (err.status === 422 || err.code === "doc_unreadable") return "unreadable";
  if (err.status === 400 || err.status === 404) return "invalid";
  return "failed";
}
