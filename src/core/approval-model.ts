export const CODEX_AUTO_REVIEW_PROVIDER = "openai-codex";
export const CODEX_AUTO_REVIEW_ID = "codex-auto-review";
export const CODEX_AUTO_REVIEW_MODEL_KEY = `${CODEX_AUTO_REVIEW_PROVIDER}/${CODEX_AUTO_REVIEW_ID}`;
export const CODEX_RESPONSES_API = "openai-codex-responses";

export interface ApprovalModelLike {
  readonly provider: string;
  readonly id: string;
  readonly name?: string;
  readonly api?: string;
}

const isCodexAutoReview = (model: ApprovalModelLike): boolean =>
  model.provider === CODEX_AUTO_REVIEW_PROVIDER && model.id === CODEX_AUTO_REVIEW_ID;

const isCodexResponsesTemplate = (model: ApprovalModelLike): boolean =>
  model.provider === CODEX_AUTO_REVIEW_PROVIDER && model.api === CODEX_RESPONSES_API;

/** Resolve the classifier model, deriving the hidden Codex entry from a real template when needed. */
export const resolveCodexAutoReviewModel = <T extends ApprovalModelLike>(
  models: readonly T[],
): T | undefined => {
  const registered = models.find(isCodexAutoReview);
  if (registered) return registered;
  const template = models.find(isCodexResponsesTemplate);
  if (!template) return undefined;
  return {
    ...template,
    id: CODEX_AUTO_REVIEW_ID,
    name: "Codex Auto Review",
  } as T;
};

/** Add classifier-only models to the approval picker without changing ordinary model sources. */
export const approvalModelCandidates = <T extends ApprovalModelLike>(
  models: readonly T[],
): T[] => {
  const codex = resolveCodexAutoReviewModel(models);
  if (!codex || models.some(isCodexAutoReview)) return [...models];
  return [...models, codex];
};

/** Resolve a configured approval model, including the hidden Codex classifier fallback. */
export const resolveApprovalModel = <T extends ApprovalModelLike>(
  modelKey: string,
  models: readonly T[],
): T | undefined => {
  const separator = modelKey.indexOf("/");
  if (separator <= 0 || separator === modelKey.length - 1) return undefined;
  const provider = modelKey.slice(0, separator);
  const id = modelKey.slice(separator + 1);
  const registered = models.find((model) => model.provider === provider && model.id === id);
  if (registered) return registered;
  if (modelKey !== CODEX_AUTO_REVIEW_MODEL_KEY) return undefined;
  return resolveCodexAutoReviewModel(models);
};
