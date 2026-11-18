"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiPostAs, CiTriggerEvent } from "@devdigest/shared";
import type { Wizard } from "./useExportCiWizard";
import { POST_AS_VALUES, SECRET_KEY, TRIGGERS } from "./constants";
import { s } from "./styles";

function TriggerChip({ trigger, w }: { trigger: CiTriggerEvent; w: Wizard }) {
  const [focused, setFocused] = useState(false);
  const on = w.state.triggers.includes(trigger);
  return (
    <label
      className="mono"
      style={{ ...s.chip, ...(on ? s.chipActive : null), ...(focused ? s.optionCardFocus : null) }}
    >
      <input
        type="checkbox"
        style={s.srOnly}
        checked={on}
        onChange={() => w.toggleTrigger(trigger)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {on && <Icon.Check size={13} />}
      {`pull_request:${trigger}`}
    </label>
  );
}

function PostAsRadio({ value, w, children }: { value: CiPostAs; w: Wizard; children: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  const on = w.state.postAs === value;
  return (
    <label style={s.radioRow}>
      <input
        type="radio"
        name="ci-post-as"
        style={s.srOnly}
        checked={on}
        onChange={() => w.setPostAs(value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <span style={{ ...s.radioDot, ...(on ? s.radioDotOn : null), ...(focused ? s.optionCardFocus : null) }}>
        {on && <span style={s.radioDotFill} />}
      </span>
      {children}
    </label>
  );
}

export function ConfigureStep({ w }: { w: Wizard }) {
  const t = useTranslations("ci");
  return (
    <>
      <div style={s.field}>
        {t("exportWizard.configure.triggerLabel")}
        <div style={s.chips}>
          {TRIGGERS.map((trigger) => (
            <TriggerChip key={trigger} trigger={trigger} w={w} />
          ))}
        </div>
      </div>

      <div style={s.field}>
        {t("exportWizard.configure.secretsTitle")}
        <div style={s.secretTable}>
          <div style={s.secretRow}>
            <code className="mono" style={s.secretName}>{SECRET_KEY}</code>
            <span style={s.cardDesc}>{t("exportWizard.configure.secretOpenrouter")}</span>
            <Badge dot color="var(--warn)" bg="var(--warn-bg)">{t("exportWizard.configure.secretRequired")}</Badge>
          </div>
          <div style={{ ...s.secretRow, ...s.secretRowDivider }}>
            <code className="mono" style={s.secretName}>GITHUB_TOKEN</code>
            <span style={s.cardDesc}>{t("exportWizard.configure.secretGithub")}</span>
            <Badge dot color="var(--ok)" bg="var(--ok-bg)">{t("exportWizard.configure.secretReady")}</Badge>
          </div>
        </div>
        <span style={s.hint}>{t("exportWizard.configure.secretsHint")}</span>
      </div>

      <div role="radiogroup" aria-label={t("exportWizard.configure.postResultsLabel")} style={s.field}>
        {t("exportWizard.configure.postResultsLabel")}
        {POST_AS_VALUES.map((v) => (
          <PostAsRadio key={v} value={v} w={w}>
            {t(`exportWizard.configure.postAs.${v}`)}
            {v === "github_review" && (
              <Badge color="var(--accent-text)" bg="var(--accent-bg)">{t("exportWizard.configure.recommended")}</Badge>
            )}
          </PostAsRadio>
        ))}
      </div>

      <div style={s.infoBlock}>
        <Icon.Info size={16} />
        <span>{t.rich("exportWizard.configure.blockMerge", { b: (chunks) => <b style={{ color: "var(--text-primary)" }}>{chunks}</b> })}</span>
      </div>
    </>
  );
}
