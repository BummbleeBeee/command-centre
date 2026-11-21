import { describe, expect, it } from "vitest";
import { angleToFraction, DURATION_STEPS, stepIndex } from "../components/TimePicker";
import { linkName, normalizeUrl } from "../tools/HubTools";
import { hubPanelSide } from "../tools/HubView";
import { defaultConfig, migrate } from "../lib/schema";

describe("dial knob", () => {
  it("maps the 270° arc to 0..1 and snaps the bottom gap to the nearest end", () => {
    expect(angleToFraction(-135)).toBeCloseTo(0);
    expect(angleToFraction(0)).toBeCloseTo(0.5);
    expect(angleToFraction(135)).toBeCloseTo(1);
    expect(angleToFraction(-170)).toBe(0);
    expect(angleToFraction(170)).toBe(1);
    expect(angleToFraction(225)).toBe(0); // same as -135
  });
  it("duration snap points cover 1 minute to 12 hours, in order", () => {
    expect(DURATION_STEPS[0]).toBe(1);
    expect(DURATION_STEPS[DURATION_STEPS.length - 1]).toBe(720);
    expect([...DURATION_STEPS].sort((a, b) => a - b)).toEqual(DURATION_STEPS);
    expect(DURATION_STEPS[stepIndex(90)]).toBe(90);
    expect(DURATION_STEPS[stepIndex(100)]).toBe(105);
  });
});

describe("hub links", () => {
  it("accepts plain addresses and rejects non-web ones", () => {
    expect(normalizeUrl("youtube.com")).toBe("https://youtube.com/");
    expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("file:///C:/x")).toBeNull();
    expect(normalizeUrl("hello")).toBeNull();
    expect(linkName("https://www.github.com/me")).toBe("github");
  });
  it("keeps valid links and drops bad ones when loading settings", () => {
    const raw = { ...defaultConfig(), hub: { ...defaultConfig().hub, links: [{ id: "a", name: "YT", url: "https://youtube.com" }, { name: "bad", url: "javascript:x" }], desktopMode: true, panelSide: "left" } };
    const c = migrate(raw).config;
    expect(c.hub.links.map((l) => l.name)).toEqual(["YT"]);
    expect(c.hub.desktopMode).toBe(true);
    expect(c.hub.panelSide).toBe("left");
    expect(migrate(defaultConfig()).config.hub).toMatchObject({ desktopMode: false, panelSide: "auto", links: [] });
  });
});

describe("hub side panel", () => {
  const mons = [{ name: "A", index: 0, x: 0, y: 0, width: 1920, height: 1080, scale: 1, primary: true }, { name: "B", index: 1, x: 1920, y: 0, width: 2560, height: 1440, scale: 1, primary: false }];
  it("opens towards the side with room", () => {
    expect(hubPanelSide("auto", { x: 1800, y: 900 }, mons)).toBe("left");
    expect(hubPanelSide("auto", { x: 100, y: 900 }, mons)).toBe("right");
    expect(hubPanelSide("auto", { x: 2000, y: 900 }, mons)).toBe("right");
    expect(hubPanelSide("auto", undefined, mons)).toBe("left");
    expect(hubPanelSide("right", { x: 1800, y: 900 }, mons)).toBe("right");
  });
});

import { notchExpandedSize } from "../lib/notch";
describe("notch width", () => {
  it("grows so every page name fits", () => {
    const few = notchExpandedSize(4, ["awake"], ["General"]);
    const many = notchExpandedSize(4, ["awake"], ["General", "Coding", "Photography", "Editing", "Tools & AI"]);
    expect(many.width).toBeGreaterThan(few.width);
    // widgets column (420) + chips must fit: 5 chips ≈ 5*36 + 41 chars*7 + 16 + 150
    expect(many.width).toBeGreaterThanOrEqual(420 + 5 * 36 + 41 * 7 + 16 + 150);
  });
});
