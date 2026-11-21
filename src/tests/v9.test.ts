import { describe, expect, it } from "vitest";
import { secondMonitors } from "../lib/monitors";
import { defaultConfig, migrate } from "../lib/schema";

describe("two modes on one monitor", () => {
  const base = defaultConfig();
  const main = base.profiles[0];
  it("opens a second window only for a different mode", () => {
    const c = { ...base, displays: {
      A: { enabled: true, profileId: main.id, secondMode: "notch" as const },
      B: { enabled: true, profileId: main.id, secondMode: main.displayMode },
      C: { enabled: true, profileId: main.id },
    } };
    expect(secondMonitors(c, ["A", "B", "C"])).toEqual(["A"]);
  });
  it("keeps a valid second mode and drops a bad one", () => {
    const raw = { ...base, displays: { A: { enabled: true, profileId: main.id, secondMode: "sidebar" }, B: { enabled: true, profileId: main.id, secondMode: "nope" } } };
    const cfg = migrate(raw).config;
    expect(cfg.displays.A.secondMode).toBe("sidebar");
    expect(cfg.displays.B.secondMode).toBeUndefined();
  });
});
