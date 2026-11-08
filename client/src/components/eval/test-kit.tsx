/* Test-only provider for the eval components. Merges the keys T6 needs but T4 did not add to
   messages/en/eval.json (see the T6 report) so tests don't depend on their final copy. */
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../messages/en/eval.json";
import common from "../../../messages/en/common.json";
import shell from "../../../messages/en/shell.json";

export const EXTRA_EVAL_KEYS = {
  history: {
    selectRun: "Select run {version}, {date}",
    detailsAria: "Details for run {version}",
  },
  runDetails: {
    unmatchedHeading: "Unmatched expectations",
    falsePositivesHeading: "False-positive findings",
    droppedHeading: "Dropped by grounding",
    noResults: "No case results",
  },
};

const merged = {
  ...evalMessages,
  history: { ...evalMessages.history, ...EXTRA_EVAL_KEYS.history },
  runDetails: { ...evalMessages.runDetails, ...EXTRA_EVAL_KEYS.runDetails },
};

export function EvalIntl({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={{ eval: merged, common, shell }}>
      {children}
    </NextIntlClientProvider>
  );
}

export { merged as evalMessages };
