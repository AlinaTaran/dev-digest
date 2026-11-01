import { Intent } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';
import { INTENT_SYSTEM } from './prompts.js';
import { estimateTokens } from './signals.js';

/** Minimal logger shape so this module doesn't need a hard `fastify` dependency. */
export interface LoggerLike {
  info(msg: string, ...args: unknown[]): void;
}

export interface ClassifyIntentArgs {
  llm: LLMProvider;
  model: string;
  /** Pre-assembled cheap-signals user message (built once by the caller, built by the caller). */
  input: string;
  /** The full diff's raw text — used ONLY to log token savings, never sent to the model. */
  diffRaw: string;
  logger: LoggerLike;
}

/**
 * Calls the cheap intent-classifier model with header-only signals (no diff
 * bodies). Logs the assembled prompt and the token savings vs. sending the full
 * diff, both via the injected logger (the RunLogger during a review run).
 */
export async function classifyIntent(args: ClassifyIntentArgs): Promise<Intent> {
  const { input } = args;
  const header = estimateTokens(input);

  // Log how the prompt is assembled (system + cheap-signals user block) so the
  // exact model input is verifiable in the server log / Live Log. No diff code
  // bodies are ever present here — that is the whole point of the classifier.
  args.logger.info(
    `[intent] assembling PrIntent prompt (model=${args.model}, ~${header} tok):\n` +
      `----- system -----\n${INTENT_SYSTEM}\n` +
      `----- user (cheap signals, no code bodies) -----\n${input}\n----- end -----`,
  );

  const result = await args.llm.completeStructured({
    model: args.model,
    schema: Intent,
    schemaName: 'PrIntent',
    messages: [
      { role: 'system', content: INTENT_SYSTEM },
      { role: 'user', content: input },
    ],
  });

  const full = estimateTokens(args.diffRaw);
  const saved = full - header;
  const pct = full > 0 ? Math.round((saved / full) * 100) : 0;
  args.logger.info(
    `intent: header-only ~${header} tok vs full diff ~${full} tok → saved ~${saved} (${pct}%)`,
  );

  return result.data;
}
