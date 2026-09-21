import { describe, expect, it } from "vitest";
import {
  CODEX_AUTO_REVIEW_MODEL_KEY,
  approvalModelCandidates,
  resolveApprovalModel,
  resolveCodexAutoReviewModel,
  type ApprovalModelLike,
} from "../src/core/approval-model.js";

const template: ApprovalModelLike = {
  provider: "openai-codex",
  id: "gpt-5.5",
  name: "GPT-5.5",
  api: "openai-codex-responses",
};

const key = (model: ApprovalModelLike): string => `${model.provider}/${model.id}`;

describe("Codex approval model", () => {
  it("derives the hidden classifier from an OpenAI Codex Responses template", () => {
    const derived = resolveCodexAutoReviewModel([template]);

    expect(derived).toMatchObject({
      provider: "openai-codex",
      id: "codex-auto-review",
      name: "Codex Auto Review",
      api: "openai-codex-responses",
    });
    expect(derived).toMatchObject({
      reasoning: true,
      input: ["text"],
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        max: "max",
      },
    });
    expect(derived).not.toBe(template);
  });

  it("prefers a real registered auto-review model", () => {
    const registered = { ...template, id: "codex-auto-review", name: "Registered Review" };

    expect(resolveCodexAutoReviewModel([registered, template])).toBe(registered);
    expect(resolveApprovalModel(CODEX_AUTO_REVIEW_MODEL_KEY, [registered, template])).toBe(registered);
  });

  it("does not expose Codex without a Responses template", () => {
    const models = [{ provider: "anthropic", id: "claude" }];

    expect(resolveCodexAutoReviewModel(models)).toBeUndefined();
    expect(approvalModelCandidates(models)).toEqual(models);
  });

  it("adds the derived model only to approval candidates", () => {
    const models = [template];
    const candidates = approvalModelCandidates(models);

    expect(candidates.map(key)).toEqual(["openai-codex/gpt-5.5", CODEX_AUTO_REVIEW_MODEL_KEY]);
    expect(models.map(key)).toEqual(["openai-codex/gpt-5.5"]);
  });
});
