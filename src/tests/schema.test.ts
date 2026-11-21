import { describe, expect, it } from "vitest";
import { ConfigError, defaultConfig, migrate, parseConfigText, serialiseConfig } from "../lib/schema";
import { SCHEMA_VERSION } from "../types";

describe("configuration schema", () => {
  it("export → import keeps every page, button and sequence, and is idempotent", () => {
    const c = defaultConfig();
    const { config, warnings } = parseConfigText(serialiseConfig(c));
    expect(warnings).toEqual([]);
    const shape = (x: typeof c) => ({
      pages: x.pages.map((p) => [p.id, p.name, p.buttons.map((b) => [b.id, b.label, b.sequenceId, b.steps.map((s) => s.type)])]),
      sequences: x.sequences.map((q) => [q.id, q.name, q.steps.map((s) => s.type)]),
      settings: x.settings,
    });
    expect(shape(config)).toEqual(shape(c));
    const again = parseConfigText(serialiseConfig(config));
    expect(serialiseConfig(again.config)).toBe(serialiseConfig(config));
  });

  it("ships the four example pages and presets", () => {
    const c = defaultConfig();
    expect(c.pages.map((p) => p.name)).toEqual(["General", "Coding", "Photography", "Editing", "Tools & AI"]);
    expect(c.profiles.map((p) => p.displayMode)).toEqual(["floating", "button", "sidebar"]);
    expect(c.sequences.map((q) => q.name)).toEqual(["Coding Mode", "Photography Mode", "Editing Mode", "Clean Up"]);
    expect(c.sequences.find((q) => q.name === "Clean Up")!.confirm).toBe(true);
    // every button linking a sequence points to an existing one
    const ids = new Set(c.sequences.map((q) => q.id));
    for (const b of c.pages.flatMap((p) => p.buttons)) if (b.sequenceId) expect(ids.has(b.sequenceId)).toBe(true);
  });

  it("rejects invalid JSON with a readable message", () => {
    expect(() => parseConfigText("{nope")).toThrow(ConfigError);
    try { parseConfigText("{nope"); } catch (e) { expect((e as ConfigError).problems[0]).toMatch(/not valid JSON/); }
  });

  it("rejects files that are not Command Centre configs", () => {
    expect(() => migrate({ hello: "world" })).toThrow(/not a Command Centre configuration/);
    expect(() => migrate([1, 2])).toThrow(ConfigError);
  });

  it("rejects configs from a newer version", () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1, pages: [] })).toThrow(/newer Command Centre/);
  });

  it("requires at least one page", () => {
    expect(() => migrate({ schemaVersion: 3, pages: [] })).toThrow(/at least one page/);
  });

  it("repairs out-of-range values and drops unknown steps with warnings", () => {
    const { config, warnings } = migrate({
      schemaVersion: 3,
      settings: { opacity: 500, radius: -4, displayMode: "hologram", accent: "red" },
      pages: [{ id: "a", name: "A", columns: 99, buttons: [{ label: "X", steps: [{ type: "format_c_drive" }, { type: "system", action: "shutdown" }, { type: "delay", ms: 250 }] }] }],
    });
    expect(config.settings.opacity).toBe(100);
    expect(config.settings.radius).toBe(0);
    expect(config.settings.displayMode).toBe("floating");
    expect(config.settings.accent).toBe("#7aa8ff");
    expect(config.pages[0].columns).toBe(10);
    expect(config.pages[0].buttons[0].steps).toHaveLength(1);
    expect(warnings.join(" ")).toMatch(/unknown step type/);
    expect(warnings.join(" ")).toMatch(/unsupported system control/);
  });

  it("only accepts data: image icons (no remote URLs)", () => {
    const { config } = migrate({ schemaVersion: 3, pages: [{ name: "A", buttons: [{ label: "x", icon: { type: "image", data: "https://evil.example/x.png" } }] }] });
    expect(config.pages[0].buttons[0].icon).toEqual({ type: "builtin", name: "zap" });
  });

  it("unlinks buttons whose sequence is missing", () => {
    const { config, warnings } = migrate({ schemaVersion: 3, pages: [{ name: "A", buttons: [{ label: "x", sequenceId: "gone" }] }] });
    expect(config.pages[0].buttons[0].sequenceId).toBeUndefined();
    expect(warnings.join(" ")).toMatch(/missing sequence/);
  });

  it("upgrades schema 3 to 4: adds profiles, displays, alarms, notes and the Tools & AI page", () => {
    const { config, warnings, upgradedFrom } = migrate({ schemaVersion: 3, settings: { displayMode: "notch", sidebarSide: "left" }, pages: [{ id: "g", name: "G", buttons: [] }], sequences: [] });
    expect(upgradedFrom).toBe(3);
    expect(config.schemaVersion).toBe(7);
    expect(config.hub.pinned.length).toBeGreaterThanOrEqual(0);
    expect(config.ai.claudeModel).toBe("claude-opus-5-5");
    expect(config.classes).toEqual([]);
    expect(config.profiles[0]).toMatchObject({ displayMode: "notch", sidebarSide: "left", pageIds: [] });
    expect(config.displays).toEqual({});
    expect(config.alarms).toEqual([]);
    expect(config.notes).toEqual([]);
    expect(config.pages.map((p) => p.name)).toEqual(["G", "Tools & AI"]);
    expect(warnings.join(" ")).toMatch(/Tools & AI/);
  });

  it("validates displays, profiles, alarms and notes", () => {
    const { config } = migrate({
      schemaVersion: 4, pages: [{ id: "g", name: "G", buttons: [] }],
      profiles: [{ id: "p1", name: "Work", displayMode: "sidebar", pageIds: ["g", "gone"] }],
      displays: { "DISPLAY2": { enabled: true, profileId: "nope", activePageId: "g" }, "DISPLAY3": { enabled: false, profileId: "p1" } },
      alarms: [{ label: "Wake", time: "7:05", days: [1, 2, 9], once: true }, { time: "bad" }],
      notes: [{ text: "hi", color: "#ff0000" }],
    });
    expect(config.profiles[0].pageIds).toEqual(["g"]);
    expect(config.displays.DISPLAY2.profileId).toBe("p1");
    expect(config.displays.DISPLAY3.enabled).toBe(false);
    expect(config.alarms[0]).toMatchObject({ time: "07:05", days: [1, 2], once: true, enabled: true });
    expect(config.alarms[1].time).toBe("07:00");
    expect(config.notes[0]).toMatchObject({ text: "hi", color: "#ff0000" });
  });

  it("migrates the version 1 prototype format", () => {
    const { config, warnings } = migrate({ version: 1, displayMode: "sidebar", alwaysOnTop: false, gridColumns: 5, items: [{ id: "explorer", name: "Explorer", description: "Browse files", icon: "▣", accent: "#6da9ff", enabled: true }] });
    expect(warnings[0]).toMatch(/Upgraded a version 1/);
    expect(config.schemaVersion).toBe(SCHEMA_VERSION);
    expect(config.settings.displayMode).toBe("sidebar");
    expect(config.settings.alwaysOnTop).toBe(false);
    expect(config.pages[0].columns).toBe(5);
    expect(config.pages[0].buttons[0].label).toBe("Explorer");
    expect(config.pages[0].buttons[0].icon).toEqual({ type: "text", value: "▣" });
  });

  it("migrates the version 2 prototype format with pages and actions", () => {
    const { config } = migrate({
      version: 2, displayMode: "notch", theme: "light", accent: "#76adff", opacity: 92, animation: false, globalHotkey: "Alt+Space", activePageId: "coding",
      pages: [{ id: "coding", name: "Coding", columns: 3, items: [{ id: "c", name: "Code", description: "", icon: "<>", accent: "#74a7ff", enabled: true, action: [{ id: "1", kind: "launch", target: "C:\\code.exe", args: ["--new-window"] }, { id: "2", kind: "website", target: "github.com" }, { id: "3", kind: "delay", target: "", delayMs: 300 }] }] }],
    });
    expect(config.activePageId).toBe("coding");
    expect(config.settings.theme).toBe("light");
    expect(config.settings.animations).toBe("off");
    expect(config.pages[0].buttons[0].steps).toMatchObject([
      { type: "launch", path: "C:\\code.exe", args: "--new-window" },
      { type: "url", url: "github.com" },
      { type: "delay", ms: 300 },
    ]);
  });
});
