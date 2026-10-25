"use client";

import React from "react";
import { Icon, IconBtn, Badge } from "@devdigest/ui";
import type { ContextDoc, ContextAttachedItem, ContextInheritedItem } from "@devdigest/shared";
import { arrayMove, contextDocTypeTone, docsByPath, matchesFilter, splitPath, togglePath } from "./helpers";
import type { ContextAttachLabels } from "./types";
import { s } from "./styles";

interface Props {
  docs: readonly ContextDoc[];
  attached: readonly ContextAttachedItem[];
  inherited?: readonly ContextInheritedItem[];
  /** Server-computed total for the footer (AC-31). */
  totalTokens: number;
  /** Always receives the full ordered path list. */
  onChange: (paths: string[]) => void;
  onPreview: (path: string) => void;
  labels: ContextAttachLabels;
  disabled?: boolean;
  /** Header title; the counter pill and filter sit on the same row. */
  title: string;
  /** Hint line under the header; `backtick` spans render in mono. */
  hint: string;
  /** Preview as an eye icon button instead of a labelled button (skill tab). */
  compactPreview?: boolean;
}

/** Splits `text` on backtick spans so they render in the mono font. */
export function ContextHint({ text }: { text: string }) {
  return (
    <p style={s.hint}>
      {text.split("`").map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="mono">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

/** Shared attach list for the agent and skill Context tabs. Takes pre-formatted strings only. */
export function ContextAttachList({
  docs,
  attached,
  inherited = [],
  totalTokens,
  onChange,
  onPreview,
  labels,
  disabled,
  title,
  hint,
  compactPreview,
}: Props) {
  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [overPath, setOverPath] = React.useState<string | null>(null);

  const byPath = React.useMemo(() => docsByPath(docs), [docs]);
  const paths = React.useMemo(() => attached.map((a) => a.path), [attached]);
  const attachedSet = React.useMemo(() => new Set(paths), [paths]);

  const shownAttached = attached.filter((a) => matchesFilter(a.path, filter));
  const shownAvailable = docs.filter((d) => !attachedSet.has(d.path) && matchesFilter(d.path, filter));
  const shownInherited = inherited.filter((i) => matchesFilter(i.path, filter));

  const move = (path: string, to: number) => {
    if (disabled) return;
    const from = paths.indexOf(path);
    if (from === -1 || to < 0 || to >= paths.length || from === to) return;
    onChange(arrayMove(paths, from, to));
  };

  const drop = (target: string) => {
    const dragged = dragPath;
    setOverPath(null);
    setDragPath(null);
    if (!dragged || dragged === target) return;
    move(dragged, paths.indexOf(target));
  };

  const onHandleKey = (e: React.KeyboardEvent, path: string) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    move(path, paths.indexOf(path) + (e.key === "ArrowUp" ? -1 : 1));
  };

  const hasAny = shownAttached.length + shownAvailable.length + shownInherited.length > 0;

  const preview = (path: string, missing?: boolean) =>
    missing ? null : <PreviewButton path={path} labels={labels} compact={compactPreview} onPreview={onPreview} />;

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.h2}>{title}</h2>
        <span style={s.pill}>{labels.counter}</span>
        <label style={s.search}>
          <Icon.Search size={14} aria-hidden />
          <input
            type="text"
            style={s.searchInput}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={labels.filterPlaceholder}
            aria-label={labels.filterAria}
          />
        </label>
      </div>
      <ContextHint text={hint} />

      {/* A disabled fieldset natively disables every button/input inside, incl. IconBtn (no disabled prop). */}
      <fieldset disabled={disabled} style={{ ...s.group, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {attached.length === 0 && <div style={s.empty}>{labels.emptyAttached}</div>}
        {shownAttached.map((item) => {
          const doc = byPath.get(item.path);
          const { name, dir } = doc ?? splitPath(item.path);
          return (
            <div
              key={item.path}
              className="group"
              draggable={!disabled}
              onDragStart={() => setDragPath(item.path)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overPath !== item.path) setOverPath(item.path);
              }}
              onDragLeave={() => setOverPath((cur) => (cur === item.path ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                drop(item.path);
              }}
              onDragEnd={() => {
                setDragPath(null);
                setOverPath(null);
              }}
              style={s.row(overPath === item.path)}
              data-testid={`context-row-${item.path}`}
            >
              <button
                type="button"
                style={s.handle}
                aria-label={labels.dragHandle(item.path)}
                disabled={disabled}
                onKeyDown={(e) => onHandleKey(e, item.path)}
              >
                <Icon.Menu size={14} aria-hidden />
              </button>
              {item.missing ? (
                <IconBtn icon="X" label={labels.remove(item.path)} danger onClick={() => onChange(togglePath(paths, item.path, false))} />
              ) : (
                <input
                  type="checkbox"
                  checked
                  disabled={disabled}
                  aria-label={item.path}
                  onChange={() => onChange(togglePath(paths, item.path, false))}
                />
              )}
              <RowInfo name={name} dir={dir} />
              <div style={s.badges}>
                <span
                  className="flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <IconBtn icon="ArrowUp" label={labels.moveUp(item.path)} size={24} onClick={() => move(item.path, paths.indexOf(item.path) - 1)} />
                  <IconBtn icon="ArrowDown" label={labels.moveDown(item.path)} size={24} onClick={() => move(item.path, paths.indexOf(item.path) + 1)} />
                </span>
                {item.missing && <Badge color="var(--crit)" bg="var(--crit-bg)">{labels.missing}</Badge>}
                <span className="mono" style={s.tokens}>{labels.tokens(item.tokens)}</span>
                {doc && <Badge {...contextDocTypeTone(doc.type)}>{labels.typeLabel(doc.type)}</Badge>}
                {preview(item.path, item.missing)}
              </div>
            </div>
          );
        })}
        {shownAvailable.map((doc) => (
          <div key={doc.path} style={s.row(false)} data-testid={`context-row-${doc.path}`}>
            <span style={s.handleMuted} aria-hidden>
              <Icon.Menu size={14} />
            </span>
            <input
              type="checkbox"
              checked={false}
              disabled={disabled || doc.too_large}
              aria-label={doc.path}
              onChange={() => onChange(togglePath(paths, doc.path, true))}
            />
            <RowInfo name={doc.name} dir={doc.dir} />
            <div style={s.badges}>
              {doc.too_large && <Badge color="var(--crit)" bg="var(--crit-bg)">{labels.tooLarge}</Badge>}
              <span className="mono" style={s.tokens}>{labels.tokens(doc.tokens)}</span>
              <Badge {...contextDocTypeTone(doc.type)}>{labels.typeLabel(doc.type)}</Badge>
              {preview(doc.path)}
            </div>
          </div>
        ))}
      </fieldset>

      {shownInherited.length > 0 && (
        <>
          <div style={s.groupLabel}>{labels.inheritedGroup}</div>
          <div style={s.group}>
            {shownInherited.map((item) => {
              const { name, dir } = byPath.get(item.path) ?? splitPath(item.path);
              const type = byPath.get(item.path)?.type;
              return (
                <div key={`${item.skill_id}:${item.path}`} style={s.row(false, true)} data-testid={`context-inherited-${item.path}`}>
                  <RowInfo name={name} dir={dir} />
                  <div style={s.badges}>
                    <Badge>{labels.viaSkill(item.skill_name)}</Badge>
                    {item.duplicate_of_attached && <Badge>{labels.duplicate}</Badge>}
                    {item.missing && <Badge color="var(--crit)" bg="var(--crit-bg)">{labels.missing}</Badge>}
                    <span className="mono" style={s.tokens}>{labels.tokens(item.tokens)}</span>
                    {type && <Badge {...contextDocTypeTone(type)}>{labels.typeLabel(type)}</Badge>}
                    {preview(item.path, item.missing)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!hasAny && filter.trim() !== "" && <div style={s.empty}>{labels.emptyFiltered}</div>}

      <div style={s.footer}>
        <span className="mono" style={s.footerTokens}>{labels.footerTokens(totalTokens)}</span>
        <span style={s.caption}>{labels.caption}</span>
      </div>
    </div>
  );
}

function RowInfo({ name, dir }: { name: string; dir: string }) {
  return (
    <div style={s.info}>
      <span className="mono" style={s.name}>{name}</span>
      {dir && <span className="mono" style={s.meta}>{dir}/</span>}
    </div>
  );
}

function PreviewButton({
  path,
  labels,
  compact,
  onPreview,
}: {
  path: string;
  labels: ContextAttachLabels;
  compact?: boolean;
  onPreview: (path: string) => void;
}) {
  if (compact) return <IconBtn icon="Eye" label={labels.preview(path)} size={26} onClick={() => onPreview(path)} />;
  return (
    <button type="button" style={s.previewBtn} aria-label={labels.preview(path)} title={labels.preview(path)} onClick={() => onPreview(path)}>
      <Icon.Eye size={13} aria-hidden />
      {labels.previewText}
    </button>
  );
}
