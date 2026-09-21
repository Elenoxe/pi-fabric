import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  ApprovalController,
  FabricSessionApprovals,
} from "../src/core/approval-controller.js";
import type { FabricAutoApprovalClassifier } from "../src/core/auto-approval-classifier.js";
import type { ResolvedFabricAction } from "../src/core/action-registry.js";

const action: ResolvedFabricAction = {
  ref: "demo.write",
  provider: "demo",
  name: "write",
  description: "Write data",
  inputSchema: {},
  risk: "write",
};

const policies = {
  read: "allow" as const,
  write: "ask" as const,
  execute: "deny" as const,
  network: "ask" as const,
  agent: "ask" as const,
  overrides: {},
};
const tuiContext = (
  custom: (...args: unknown[]) => Promise<unknown>,
  notify = vi.fn(),
): ExtensionContext => ({
  hasUI: true,
  mode: "tui",
  ui: { custom, notify },
} as unknown as ExtensionContext);

describe("ApprovalController", () => {
  it("fails closed when approval is required without a UI", async () => {
    const controller = new ApprovalController(policies, { hasUI: false } as ExtensionContext);
    await expect(controller.approve(action)).rejects.toThrow("no interactive UI");
  });

  it("allows only the selected call when Allow once is chosen", async () => {
    const custom = vi.fn(async () => "allow-once");
    const notify = vi.fn();
    const controller = new ApprovalController(policies, tuiContext(custom, notify));

    await controller.approve(action);
    await controller.approve({ ...action, ref: "demo.writeAgain" });

    expect(custom).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith("Allowed once: demo.write", "info");
    expect(notify).toHaveBeenCalledWith("Allowed once: demo.writeAgain", "info");
  });
  it("uses an exact token override before the action risk policy", async () => {
    const controller = new ApprovalController(
      { ...policies, read: "allow", write: "deny", overrides: { "demo.write": "read" } },
      { hasUI: false } as ExtensionContext,
    );
    await expect(controller.approve(action)).resolves.toBeUndefined();
  });

  it("passes the original action metadata to exact auto approval", async () => {
    const classify = vi.fn(async () => ({
      decision: "allow" as const,
      reason: "Safe",
      model: "test/classifier",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    }));
    const controller = new ApprovalController(
      { ...policies, overrides: { "demo.write": "auto" } },
      { hasUI: false } as ExtensionContext,
      new FabricSessionApprovals(),
      { classify } as unknown as FabricAutoApprovalClassifier,
    );

    await controller.approve(action, { path: "workspace" });

    expect(classify).toHaveBeenCalledWith(action, { path: "workspace" }, expect.anything(), undefined);
  });

  it("keeps exact ask grants scoped to their action ref", async () => {
    const custom = vi.fn()
      .mockResolvedValueOnce("allow-session")
      .mockResolvedValueOnce("allow-once");
    const session = new FabricSessionApprovals();
    const controller = new ApprovalController(
      {
        ...policies,
        overrides: {
          "demo.write": "ask",
          "demo.writeLater": "ask",
        },
      },
      tuiContext(custom),
      session,
    );

    await controller.approve(action);
    await controller.approve({ ...action, ref: "demo.writeLater" });
    await controller.approve(action);

    expect(custom).toHaveBeenCalledTimes(2);
    expect(session.approvedRefs).toContain("demo.write");
    expect(session.approvedRisks).not.toContain("write");
  });

  it("does not let a broad session grant bypass an exact ask or deny", async () => {
    const session = new FabricSessionApprovals();
    session.approvedRisks.add("write");
    const ask = new ApprovalController(
      { ...policies, overrides: { "demo.write": "ask" } },
      { hasUI: false } as ExtensionContext,
      session,
    );
    await expect(ask.approve(action)).rejects.toThrow("no interactive UI");

    const deny = new ApprovalController(
      { ...policies, overrides: { "demo.write": "deny" } },
      { hasUI: false } as ExtensionContext,
      session,
    );
    await expect(deny.approve(action)).rejects.toThrow("denied by the Fabric write policy");
  });

  it("shares an Always allow grant across the Pi session", async () => {
    const custom = vi.fn(async () => "allow-session");
    const notify = vi.fn();
    const session = new FabricSessionApprovals();
    const firstExecution = new ApprovalController(
      policies,
      tuiContext(custom, notify),
      session,
    );
    const laterExecution = new ApprovalController(
      policies,
      tuiContext(custom, notify),
      session,
    );

    await firstExecution.approve(action);
    await laterExecution.approve({ ...action, ref: "demo.writeLater" });

    expect(custom).toHaveBeenCalledOnce();
    expect(session.approvedRisks).toContain("write");
    expect(notify).toHaveBeenLastCalledWith(
      "Allowed write access for this Pi session",
      "info",
    );
  });

  it("uses an RPC-compatible three-choice dialog", async () => {
    const select = vi.fn(async () => "Allow write access for this session");
    const notify = vi.fn();
    const controller = new ApprovalController(policies, {
      hasUI: true,
      mode: "rpc",
      ui: { select, notify },
    } as unknown as ExtensionContext);

    await controller.approve(action);

    expect(select).toHaveBeenCalledWith(
      "Pi Fabric permission · demo.write requests write access. Write data",
      ["Allow once", "Allow write access for this session", "Deny"],
    );
  });

  it("auto-allows only the exact classified action", async () => {
    const classify = vi.fn(async () => ({
      decision: "allow" as const,
      reason: "Routine task-aligned local write",
      model: "anthropic/classifier",
      usage: {
        input: 10,
        output: 2,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 12,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    }));
    const classifier = { classify } as unknown as FabricAutoApprovalClassifier;
    const controller = new ApprovalController(
      { ...policies, write: "auto", model: "anthropic/classifier" },
      { hasUI: false } as ExtensionContext,
      new FabricSessionApprovals(),
      classifier,
    );
    const args = { path: "src/index.ts", content: "safe" };

    await controller.approve(action, args);

    expect(classify).toHaveBeenCalledWith(
      action,
      args,
      expect.anything(),
      "anthropic/classifier",
    );
  });

  it("escalates an unsafe auto decision to the approval wizard", async () => {
    const classifier = {
      classify: vi.fn(async () => ({
        decision: "escalate" as const,
        reason: "Command modifies shared production state",
        model: "anthropic/classifier",
        usage: {
          input: 10,
          output: 2,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 12,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      })),
    } as unknown as FabricAutoApprovalClassifier;
    const custom = vi.fn(async () => "allow-once");
    const notify = vi.fn();
    const controller = new ApprovalController(
      { ...policies, write: "auto" },
      tuiContext(custom, notify),
      new FabricSessionApprovals(),
      classifier,
    );

    await controller.approve(action, { path: "production" });

    expect(custom).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Auto mode escalated"),
      "warning",
    );
  });

  it("fails closed to explicit approval when the classifier is unavailable", async () => {
    const classifier = {
      classify: vi.fn(async () => { throw new Error("model unavailable"); }),
    } as unknown as FabricAutoApprovalClassifier;
    const custom = vi.fn(async () => "deny");
    const controller = new ApprovalController(
      { ...policies, write: "auto" },
      tuiContext(custom),
      new FabricSessionApprovals(),
      classifier,
    );

    await expect(controller.approve(action)).rejects.toThrow("User denied");
    expect(custom).toHaveBeenCalledOnce();
  });

  it("fails closed and notifies when the user denies or dismisses", async () => {
    const custom = vi.fn(async () => "deny");
    const notify = vi.fn();
    const controller = new ApprovalController(policies, tuiContext(custom, notify));

    await expect(controller.approve(action)).rejects.toThrow(
      "User denied write access for demo.write",
    );
    expect(notify).toHaveBeenLastCalledWith(
      "Denied write access for demo.write",
      "warning",
    );
  });

  it("serializes concurrent one-time requests instead of widening the grant", async () => {
    const custom = vi.fn(async () => "allow-once");
    const controller = new ApprovalController(policies, tuiContext(custom));

    await Promise.all([
      controller.approve(action),
      controller.approve({ ...action, ref: "demo.parallelWrite" }),
    ]);

    expect(custom).toHaveBeenCalledTimes(2);
  });

  it("lets a queued request inherit a session grant without a second prompt", async () => {
    const custom = vi.fn(async () => "allow-session");
    const controller = new ApprovalController(policies, tuiContext(custom));

    await Promise.all([
      controller.approve(action),
      controller.approve({ ...action, ref: "demo.parallelWrite" }),
    ]);

    expect(custom).toHaveBeenCalledOnce();
  });

  it("denies actions blocked by policy without prompting", async () => {
    const custom = vi.fn(async () => "allow-once");
    const controller = new ApprovalController(policies, tuiContext(custom));
    await expect(controller.approve({ ...action, risk: "execute" })).rejects.toThrow(
      "denied by the Fabric execute policy",
    );
    expect(custom).not.toHaveBeenCalled();
  });
});
