/* Eval case editor (screenshot 8): Name, Input tabs (Diff / Files / PR meta), Expected-output
   JSON editor with live validity, last-run strip, Run on save, Cancel / Run case / Save.
   Props-only: the container owns the mutations (`onSave`, `onRun`). Everything user-authored is
   rendered as text. */
"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, CodeTextarea, FormField, Modal, Tabs, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { CreateEvalCaseBody, EvalCaseResult, EvalCaseView } from "@devdigest/shared";
import { DiffViewer } from "@/components/diff-viewer";
import { ApiError } from "@/lib/api";
import { caseState } from "@/lib/eval/case-state";
import { expectationWarnings, parseDiffFiles } from "@/lib/eval/diff-files";
import { FINDING_SKELETON, parseExpectationsJson } from "@/lib/eval/expectations-json";
import { formatCost } from "@/lib/format";
import { s } from "./styles";

export interface EvalCaseEditorModalProps {
  /** Omit for a new case; pass to edit (pre-fills every control, AC-18). */
  initialCase?: EvalCaseView;
  /** Under the title (skill mode passes "<skill> · simulate a PR…", T16). */
  subtitle?: string;
  /** Persist the draft (`existingId` is null until the case has been saved once); resolve with the saved
      case. Reject with an ApiError 400 to show the reason by the Diff tab. */
  onSave: (draft: CreateEvalCaseBody, existingId: string | null) => Promise<{ id: string }>;
  /** Run one case; resolve with its result to refresh the strip. */
  onRun: (caseId: string) => Promise<EvalCaseResult | void>;
  onClose: () => void;
}

type InputTab = "diff" | "files" | "meta";

const prettyExpected = (c?: EvalCaseView): string => JSON.stringify(c?.expected_output ?? [], null, 2);

export function EvalCaseEditorModal({ initialCase, subtitle, onSave, onRun, onClose }: EvalCaseEditorModalProps) {
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const [name, setName] = useState(initialCase?.name ?? "");
  const [diff, setDiff] = useState(initialCase?.input_diff ?? "");
  const [title, setTitle] = useState(initialCase?.input_meta.title ?? "");
  const [body, setBody] = useState(initialCase?.input_meta.body ?? "");
  const [expected, setExpected] = useState(() => prettyExpected(initialCase));
  const [tab, setTab] = useState<InputTab>("diff");
  const [runOnSave, setRunOnSave] = useState(true);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [caseId, setCaseId] = useState(initialCase?.id ?? null);
  const [last, setLast] = useState<EvalCaseResult | null>(initialCase?.last_result ?? null);

  const parsed = useMemo(() => parseExpectationsJson(expected), [expected]);
  const files = useMemo(() => parseDiffFiles(diff), [diff]);
  const warnings = useMemo(() => (parsed.ok ? expectationWarnings(parsed.value, files) : []), [parsed, files]);
  const canSubmit = parsed.ok && name.trim().length > 0 && busy === null;

  const addSkeleton = () => {
    if (!parsed.ok) return;
    setExpected(JSON.stringify([...parsed.value, FINDING_SKELETON], null, 2));
  };

  const draft = (): CreateEvalCaseBody => ({
    name: name.trim(),
    input_diff: diff,
    input_meta: { title, body },
    expected_output: parsed.ok ? parsed.value : [],
  });

  const run = async (id: string) => {
    const res = await onRun(id);
    if (res) setLast(res);
  };

  /** Save (surfacing a 400 by the Diff tab), then optionally run. Returns the saved id or null. */
  const save = async (): Promise<string | null> => {
    setDiffError(null);
    try {
      const saved = await onSave(draft(), caseId);
      setCaseId(saved.id);
      return saved.id;
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setDiffError(e.message);
        setTab("diff");
      }
      return null;
    }
  };

  const onSaveClick = async () => {
    setBusy("save");
    try {
      const id = await save();
      if (id === null) return;
      if (runOnSave) await run(id);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  const onRunClick = async () => {
    setBusy("run");
    try {
      const id = await save();
      if (id !== null) await run(id);
    } finally {
      setBusy(null);
    }
  };

  const state = caseState(last);
  const secs = last?.duration_ms != null ? (last.duration_ms / 1000).toFixed(1) : null;

  return (
    <Modal
      width={1000}
      title={initialCase ? t("caseEditor.caseTitle", { name: initialCase.name }) : t("caseEditor.newCase")}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <label style={s.runOnSave}>
            <Toggle on={runOnSave} onChange={setRunOnSave} />
            {t("editor.runOnSave")}
          </label>
          <Button kind="secondary" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button kind="secondary" icon="Play" disabled={!canSubmit} loading={busy === "run"} onClick={onRunClick}>
            {busy === "run" ? t("caseEditor.running") : t("caseEditor.runCase")}
          </Button>
          <Button kind="primary" icon="Check" disabled={!canSubmit} loading={busy === "save"} onClick={onSaveClick}>
            {busy === "save" ? t("caseEditor.saving") : t("caseEditor.save")}
          </Button>
        </div>
      }
    >
      <div style={s.grid}>
        <div style={s.left}>
          <FormField label={t("caseEditor.nameLabel")} required>
            <TextInput
              value={name}
              onChange={setName}
              placeholder={t("caseEditor.namePlaceholder")}
              mono
              aria-label={t("caseEditor.nameLabel")}
              maxLength={120}
            />
          </FormField>
          <div style={s.sectionLabel}>{t("caseEditor.inputLabel")}</div>
          <Tabs
            pad="0"
            value={tab}
            onChange={(k) => setTab(k as InputTab)}
            tabs={[
              { key: "diff", label: t("caseEditor.tabs.diff") },
              { key: "files", label: t("caseEditor.tabs.files") },
              { key: "meta", label: t("caseEditor.tabs.prMeta") },
            ]}
          />
          {diffError && (
            <div role="alert" style={s.diffError}>
              {t("caseEditor.diffError", { message: diffError })}
            </div>
          )}
          {tab === "diff" && (
            <div style={{ marginTop: 12 }}>
              <CodeTextarea
                value={diff}
                onChange={setDiff}
                placeholder={t("caseEditor.diffPlaceholder")}
                rows={10}
                ariaLabel={t("caseEditor.diffAria")}
              />
              {files.length > 0 && (
                <div style={s.preview} aria-label={t("caseEditor.preview")}>
                  <DiffViewer files={files} />
                </div>
              )}
            </div>
          )}
          {tab === "files" && (
            <div style={{ marginTop: 12 }}>
              {files.length === 0 && <div style={s.fileRow}>{t("caseEditor.filesEmpty")}</div>}
              {files.map((f) => (
                <div key={f.path} style={s.fileRow}>
                  <span className="mono">{f.path}</span>
                  <span style={{ color: "var(--ok)" }}>+{f.additions}</span>
                  <span style={{ color: "var(--crit)" }}>−{f.deletions}</span>
                </div>
              ))}
            </div>
          )}
          {tab === "meta" && (
            <div style={{ marginTop: 12 }}>
              <FormField label={t("caseEditor.titleLabel")}>
                <TextInput
                  value={title}
                  onChange={setTitle}
                  placeholder={t("caseEditor.titlePlaceholder")}
                  aria-label={t("caseEditor.titleLabel")}
                  maxLength={300}
                />
              </FormField>
              <FormField label={t("caseEditor.bodyLabel")}>
                <Textarea value={body} onChange={setBody} placeholder={t("caseEditor.bodyPlaceholder")} rows={5} />
              </FormField>
            </div>
          )}
        </div>

        <div style={s.right}>
          <div style={s.jsonHeader}>
            <span style={{ ...s.sectionLabel, marginBottom: 0 }}>{t("caseEditor.expectedOutput")}</span>
            <span role="status" style={s.jsonState(parsed.ok)}>
              {parsed.ok ? t("editor.jsonValid") : t("editor.jsonInvalid")}
            </span>
            <span style={s.skeletonBtn}>
              <Button kind="secondary" size="sm" disabled={!parsed.ok} onClick={addSkeleton}>
                {t("editor.addSkeleton")}
              </Button>
            </span>
          </div>
          <CodeTextarea value={expected} onChange={setExpected} rows={14} ariaLabel={t("caseEditor.expectedAria")} />
          {!parsed.ok && (
            <div role="alert" style={s.jsonError}>
              {parsed.path
                ? t("editor.jsonErrorAt", { path: parsed.path, message: parsed.message })
                : parsed.message}
            </div>
          )}
          {warnings.length > 0 && (
            <ul style={s.warnings}>
              {warnings.map((w) => (
                <li key={`${w.index}-${w.kind}`}>
                  {`[${w.index}] `}
                  {w.kind === "file_not_in_diff" ? t("editor.warnFileNotInDiff") : t("editor.warnOutsideFragment")}
                </li>
              ))}
            </ul>
          )}
          {last && state !== "never" && (
            <div role="status" style={s.strip(state === "passed" ? "passed" : state === "failed" ? "failed" : "error")}>
              <span style={s.stripStrong}>
                {state === "passed"
                  ? t("caseEditor.lastRunPassed")
                  : state === "failed"
                    ? t("caseEditor.lastRunFailed")
                    : t("caseEditor.lastRunError")}
              </span>
              {last.error
                ? ` · ${t(`runDetails.errorReason.${last.error.reason}`)}`
                : ` · ${t("evalsTab.subtitleExpected", { expected: last.expected_count, got: last.got_count })}`}
              {secs !== null && ` · ${secs}s`}
              {` · ${formatCost(last.cost_usd)}`}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
