import { Intent, Risks, type Risk } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';
import { INTENT_SYSTEM, RISK_SYSTEM } from './prompts.js';
import { estimateTokens } from './signals.js';

/** Minimal logger shape so this module doesn't need a hard `fastify` dependency. */
export interface LoggerLike {
  info(msg: string, ...args: unknown[]): void;
}

export interface ClassifyIntentArgs {
  llm: LLMProvider;
  model: string;
  /** Pre-assembled cheap-signals user message (built once by the caller, shared with the risk classifier). */
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

export interface ClassifyRisksArgs {
  llm: LLMProvider;
  model: string;
  /** Same pre-assembled cheap-signals user block as the intent classifier. */
  input: string;
  logger: LoggerLike;
}

/**
 * Calls the cheap risk-classifier model with the SAME header-only signals as
 * the intent classifier (mirrors `classifyIntent`). No separate token-savings
 * log — the intent call above already logs it for the same input.
 */
export async function classifyRisks(args: ClassifyRisksArgs): Promise<Risk[]> {
  const { input } = args;

  // Same cheap-signals user block as the intent call (logged there); here we log
  // the risk system prompt + model so the separate risk_brief call is visible too.
  args.logger.info(
    `[intent] assembling PrRisks prompt (model=${args.model}, ~${estimateTokens(input)} tok, same cheap signals as PrIntent):\n` +
      `----- system -----\n${RISK_SYSTEM}\n----- end -----`,
  );

  const result = await args.llm.completeStructured({
    model: args.model,
    schema: Risks,
    schemaName: 'PrRisks',
    messages: [
      { role: 'system', content: RISK_SYSTEM },
      { role: 'user', content: input },
    ],
  });

  return result.data.risks;
}
