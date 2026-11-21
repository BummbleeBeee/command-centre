import { describe, expect, it } from "vitest";
import { defaultConfig, migrate } from "../lib/schema";
import { upcoming, when } from "../lib/upcoming";
import { iconTargetFor } from "../lib/realIcons";
import { presetPatch, THEME_PRESETS } from "../lib/theme";
import type { ClassEntry } from "../types";

describe("schema 5", () => {
  it("defaults include hub, AI and classes, with real apps pinned", () => {
    const c = defaultConfig();
    expect(c.schemaVersion).toBe(7);
    expect(c.hub.enabled).toBe(false);
    expect(c.hub.pinned.length).toBeGreaterThan(0);
    const ids = new Set(c.pages.flatMap((p) => p.buttons.map((b) => b.id)));
    expect(c.hub.pinned.every((id) => ids.has(id))).toBe(true);
    expect(c.ai.claudeModel).toBe("claude-opus-5-5");
    expect(c.settings.glass).toBe("frosted");
    expect(c.settings.effect).toBe("none");
  });

  it("validates classes, hub pins and effect settings", () => {
    const { config } = migrate({
      schemaVersion: 5, pages: [{ id: "g", name: "G", buttons: [{ id: "b1", label: "App", steps: [] }] }],
      settings: { effect: "lava", glass: "neon", effectIntensity: 500 },
      classes: [{ name: "Maths", days: [1, 3, 8], start: "9:00", end: "10:30", room: "B2" }],
      hub: { enabled: true, pinned: ["b1", "ghost"] },
      ai: { claudeModel: "", system: "Be brief" },
    });
    expect(config.settings.effect).toBe("none");
    expect(config.settings.glass).toBe("neon");
    expect(config.settings.effectIntensity).toBe(100);
    expect(config.classes[0]).toMatchObject({ name: "Maths", days: [1, 3], start: "09:00", end: "10:30", room: "B2" });
    expect(config.hub).toMatchObject({ enabled: true, pinned: ["b1"] });
    expect(config.ai.claudeModel).toBe("claude-opus-5-5");
    expect(config.ai.system).toBe("Be brief");
  });

  it("theme presets are valid and apply as custom themes", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(12);
    for (const p of THEME_PRESETS) for (const c of [p.bg, p.surface, p.text, p.accent]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    const patch = presetPatch(THEME_PRESETS.find((p) => p.id === "sunset")!);
    const { config } = migrate({ schemaVersion: 5, pages: [{ name: "G", buttons: [] }], settings: patch });
    expect(config.settings).toMatchObject({ theme: "custom", accent: "#ff8a5c", glass: "tinted", themePreset: "sunset" });
  });
});

describe("upcoming", () => {
  const cls = (name: string, days: number[], start: string, end: string): ClassEntry => ({ id: name, name, days, start, end, room: "R1", color: "#fff" });
  // Wednesday 2026-11-18 10:15 local time
  const now = new Date(2026, 10, 18, 10, 15);

  it("shows a class in progress first, then the next ones in order", () => {
    const list = upcoming(now, [cls("Physics", [3], "10:00", "11:00"), cls("Art", [3], "14:00", "15:00"), cls("Maths", [4], "09:00", "10:00")], [], [], 5);
    expect(list.slice(0, 3).map((u) => u.title)).toEqual(["Physics", "Art", "Maths"]);
    expect(list[0].now).toBe(true);
    expect(when(list[0], now)).toMatch(/^now · until/);
    expect(when(list[2], now)).toMatch(/^tomorrow/);
  });

  it("includes alarms and timers, skips past and disabled ones", () => {
    const list = upcoming(now, [cls("Old", [3], "08:00", "09:00")],
      [{ id: "a", label: "Wake", time: "07:00", days: [], enabled: true, once: false }, { id: "b", label: "Off", time: "11:00", days: [], enabled: false, once: false }],
      [{ id: "t", label: "Tea", atMs: now.getTime() + 5 * 60000 }], 5);
    expect(list[0]).toMatchObject({ kind: "timer", title: "Tea" });
    expect(when(list[0], now)).toBe("in 5 min");
    expect(list.some((u) => u.title === "Old" || u.title === "Off")).toBe(false);
    expect(list.find((u) => u.kind === "alarm")?.title).toBe("Wake"); // tomorrow 07:00
  });
});

describe("real app images", () => {
  const c = defaultConfig();
  const find = (label: string, page = "general") => c.pages.find((p) => p.id === page)!.buttons.find((b) => b.label === label)!;
  it("maps every kind of button to an app image source", () => {
    expect(iconTargetFor(find("Explorer"), c)).toBe("sys:file_explorer");
    expect(iconTargetFor(find("Browser"), c)).toBe("browser:");
    expect(iconTargetFor(find("Volume +"), c)).toMatch(/SndVol\.exe$/);
    expect(iconTargetFor(find("Lock"), c)).toBe("sys:settings");
    expect(iconTargetFor(find("Sticky notes", "tools-ai"), c)).toMatch(/StickyNotes/);
    expect(iconTargetFor(find("Timer 25 min", "tools-ai"), c)).toMatch(/WindowsAlarms/);
    expect(iconTargetFor(find("Clean Up"), c)).toBe("sys:task_manager");
    expect(iconTargetFor(find("Coding"), c)).not.toBeNull(); // page button borrows its page's app
  });
});
