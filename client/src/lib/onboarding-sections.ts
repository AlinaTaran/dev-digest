import type { OnboardingSection } from '@devdigest/shared';

type SectionKind = OnboardingSection['kind'];

export interface OnboardingSectionMeta {
  kind: SectionKind;
  /** URL hash target (`#<anchor>`). */
  anchor: string;
  /** i18n key inside the `onboarding` namespace. */
  titleKey: string;
}

/** The five tour sections in page order. */
export const ONBOARDING_SECTIONS: readonly OnboardingSectionMeta[] = [
  { kind: 'architecture', anchor: 'architecture', titleKey: 'sections.architecture' },
  { kind: 'critical_paths', anchor: 'critical-paths', titleKey: 'sections.critical_paths' },
  { kind: 'run_locally', anchor: 'run-locally', titleKey: 'sections.run_locally' },
  { kind: 'reading_path', anchor: 'reading-path', titleKey: 'sections.reading_path' },
  { kind: 'first_tasks', anchor: 'first-tasks', titleKey: 'sections.first_tasks' },
];

export function anchorFor(kind: SectionKind): string {
  return ONBOARDING_SECTIONS.find((s) => s.kind === kind)!.anchor;
}

/** True only for the five section anchors; accepts the hash with or without `#`. */
export function isSectionAnchor(hash: string): boolean {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  return ONBOARDING_SECTIONS.some((s) => s.anchor === h);
}
