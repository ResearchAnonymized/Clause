import { describe, expect, it } from "vitest";
import {
  AUTO_ROUTER_MODEL,
  autoRouterPluginId,
  formatModelLabel,
  isAutoRouterModel,
  mergeLlmConfig,
  normalizeCostTier,
} from "@/lib/agent-defaults";

describe("OpenRouter Auto Router defaults", () => {
  it("treats openrouter/auto as the workspace default model", () => {
    expect(mergeLlmConfig(null).model).toBe(AUTO_ROUTER_MODEL);
    expect(mergeLlmConfig({} as never).model).toBe(AUTO_ROUTER_MODEL);
    expect(normalizeCostTier(mergeLlmConfig(null).extra.cost_tier)).toBe("medium");
  });

  it("recognizes auto and auto-beta slugs", () => {
    expect(isAutoRouterModel("openrouter/auto")).toBe(true);
    expect(isAutoRouterModel("openrouter/auto-beta")).toBe(true);
    expect(isAutoRouterModel("openai/gpt-4o-mini")).toBe(false);
    expect(autoRouterPluginId("openrouter/auto-beta")).toBe("auto-beta-router");
    expect(autoRouterPluginId("openrouter/auto")).toBe("auto-router");
  });

  it("normalizes cost tiers and labels Auto Router", () => {
    expect(normalizeCostTier("HIGH")).toBe("high");
    expect(normalizeCostTier("nope")).toBe("medium");
    expect(formatModelLabel(AUTO_ROUTER_MODEL)).toContain("Auto Router");
  });
});
