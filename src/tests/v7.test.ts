import { describe, expect, it } from "vitest";
import { repairLabel, repairText } from "../lib/textRepair";
import { migrate, defaultConfig } from "../lib/schema";
import { rankApps } from "../editor/AppSearch";
import { clockText } from "../components/DotClock";

// Simulates text being mis-read as Windows-1252 and re-saved as UTF-8 (what damaged "Volume −").
const CP = [0x20ac,0,0x201a,0x0192,0x201e,0x2026,0x2020,0x2021,0x02c6,0x2030,0x0160,0x2039,0x0152,0,0x017d,0,0,0x2018,0x2019,0x201c,0x201d,0x2022,0x2013,0x2014,0x02dc,0x2122,0x0161,0x203a,0x0153,0,0x017e,0x0178];
const garble = (s: string) => [...new TextEncoder().encode(s)].map((b) => String.fromCodePoint(b >= 0x80 && b <= 0x9f && CP[b - 0x80] ? CP[b - 0x80] : b)).join("");

describe("text repair", () => {
  it("undoes repeated encoding damage", () => {
    for (const original of ["Volume −", "Café · Notes", "Brightness —", "日本語"]) {
      let s = original;
      for (let i = 0; i < 3; i++) s = garble(s);
      expect(s).not.toBe(original);
      expect(repairText(s)).toBe(original);
    }
  });
  it("leaves normal text alone", () => {
    for (const t of ["Volume +", "Clean Up", "Ünïcödé façade", "Tools & AI", "日本語"]) expect(repairText(t)).toBe(t);
  });
  it("falls back to the readable start when characters were lost", () => {
    expect(repairLabel("Volume A��'A+�?TA", "X")).toBe("Volume A");
    expect(repairLabel("��", "Untitled")).toBe("Untitled");
  });
  it("repairs damaged button names when loading, using the action for lost text", () => {
    const { config, warnings } = migrate({
      schemaVersion: 6, pages: [{ name: "General", buttons: [
        { label: "Volume A��'A+�?TA��?", steps: [{ type: "volume", mode: "down", value: 10 }] },
        { label: garble(garble("Café")), steps: [{ type: "url", url: "https://x.y" }] },
      ] }],
    });
    expect(config.pages[0].buttons.map((b) => b.label)).toEqual(["Volume −", "Café"]);
    expect(warnings.join(" ")).toMatch(/Repaired/);
  });
});

describe("app search", () => {
  const apps = ["Google Chrome", "Character Map", "ChatGPT", "Microsoft Edge", "Visual Studio Code", "Notepad"].map((name) => ({ name, target: name, source: "startMenu" as const }));
  it("ranks prefix matches first, then word starts, then contains", () => {
    expect(rankApps(apps, "ch").map((a) => a.name)).toEqual(["ChatGPT", "Character Map", "Google Chrome"]);
    expect(rankApps(apps, "code").map((a) => a.name)).toEqual(["Visual Studio Code"]);
    expect(rankApps(apps, "ed")[0].name).toBe("Microsoft Edge");
    expect(rankApps(apps, "")).toEqual([]);
  });
});

describe("dot clock + defaults", () => {
  it("formats HH:MM", () => {
    expect(clockText(new Date(2026, 0, 1, 9, 5))).toMatch(/^\d\d:05$/);
  });
  it("new settings have sensible defaults", () => {
    const s = defaultConfig().settings;
    expect(s).toMatchObject({ showSuccessToasts: false, animSpeed: 1, easing: "smooth", slideIn: true, sidebarAutoHide: false, sidebarPinned: false, orbStyle: "light" });
  });
});

import { reconcileDisplays } from "../lib/monitors";
describe("renamed monitors", () => {
  const mon = (name: string, x: number) => ({ name, index: 0, x, y: 116, width: 1920, height: 1080, scale: 1, primary: false });
  it("moves settings from a vanished name to the monitor at the same place", () => {
    const displays = { "\\\\.\\DISPLAY5": { enabled: true, profileId: "side", sidebarSide: "left" as const, bounds: { x: -1920, y: 116, width: 1920, height: 1080 } } };
    const next = reconcileDisplays(displays, [mon("\\\\.\\DISPLAY10", -1920)])!;
    expect(Object.keys(next)).toEqual(["\\\\.\\DISPLAY10"]);
    expect(next["\\\\.\\DISPLAY10"]).toMatchObject({ enabled: true, profileId: "side", sidebarSide: "left" });
  });
  it("records bounds and does nothing when already up to date", () => {
    const first = reconcileDisplays({ A: { enabled: true, profileId: "p" } }, [mon("A", 0)])!;
    expect(first.A.bounds).toEqual({ x: 0, y: 116, width: 1920, height: 1080 });
    expect(reconcileDisplays(first, [mon("A", 0)])).toBeNull();
  });
});

import { panelRect } from "../lib/monitors";
describe("settings window placement", () => {
  const m = { name: "R", index: 1, x: 2560, y: 209, width: 1920, height: 1080, scale: 1, primary: false };
  it("centres on the requesting monitor at the default size", () => {
    expect(panelRect(undefined, m)).toEqual({ x: 3140, y: 449, width: 760, height: 600 });
  });
  it("never reuses a maximised size: caps at 90% of the screen", () => {
    const r = panelRect({ x: -1928, y: 108, width: 1936, height: 1048 }, m)!;
    expect(r.width).toBe(1728);
    expect(r.height).toBe(972);
    expect(r.x).toBeGreaterThanOrEqual(2560);
  });
});
