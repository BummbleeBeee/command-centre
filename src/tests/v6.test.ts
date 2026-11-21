import { describe, expect, it } from "vitest";
import { defaultConfig, migrate } from "../lib/schema";
import { sectorPath } from "../tools/HubView";

describe("schema 6", () => {
  it("default Spotify and Browser buttons have dropdowns; widgets are editable", () => {
    const c = defaultConfig();
    const all = c.pages.flatMap((p) => p.buttons);
    expect(all.find((b) => b.label === "Spotify")?.flyout?.kind).toBe("spotify");
    expect(all.find((b) => b.label === "Browser")?.flyout?.items.length).toBe(4);
    expect(c.settings.widgets).toEqual(["spotify", "next", "volume", "clock"]);
  });

  it("validates widgets and dropdown items", () => {
    const { config, warnings } = migrate({
      schemaVersion: 6,
      settings: { widgets: ["clock", "bogus", "clock", "note"] },
      pages: [{ name: "G", buttons: [
        { label: "Code", flyout: { kind: "items", items: [{ label: "Repo", step: { type: "folder", path: "C:\src" } }, { label: "Bad", step: { type: "nuke" } }] } },
        { label: "Empty", flyout: { kind: "items", items: [] } },
      ] }],
    });
    expect(config.settings.widgets).toEqual(["clock", "note"]);
    expect(config.pages[0].buttons[0].flyout?.items.map((i) => i.label)).toEqual(["Repo"]);
    expect(config.pages[0].buttons[1].flyout).toBeUndefined();
    expect(warnings.join(" ")).toMatch(/unknown step type/);
  });

  it("upgrading from 5 gives Spotify buttons the playlist dropdown", () => {
    const { config, upgradedFrom } = migrate({ schemaVersion: 5, pages: [{ name: "T", buttons: [{ label: "Spotify", steps: [{ type: "panel", panel: "spotify" }] }] }] });
    expect(upgradedFrom).toBe(5);
    expect(config.pages[0].buttons[0].flyout).toEqual({ kind: "spotify", items: [] });
  });
});

describe("hub ring", () => {
  it("draws closed annular sectors", () => {
    const d = sectorPath(-Math.PI / 2, 0, 100, 50);
    expect(d.startsWith("M0.00,-100.00 A100,100 0 0 1 100.00,0.00")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
});
