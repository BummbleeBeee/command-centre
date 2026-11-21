import { describe, expect, it } from "vitest";
import { acceleratorFromEvent, isSafeGlobalHotkey } from "../lib/hotkeys";
import { matchApp } from "../lib/resolveApps";
import { baseName } from "../engine/runner";

const ev = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}, key = "") =>
  ({ code, key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe("hotkeys", () => {
  it("builds canonical accelerators", () => {
    expect(acceleratorFromEvent(ev("KeyK", { ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+K");
    expect(acceleratorFromEvent(ev("Space", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+Space");
    expect(acceleratorFromEvent(ev("F5"))).toBe("F5");
    expect(acceleratorFromEvent(ev("Digit3", { metaKey: true }))).toBe("Super+3");
    expect(acceleratorFromEvent(ev("ArrowUp", { altKey: true }))).toBe("Alt+Up");
  });

  it("ignores lone modifier presses", () => {
    expect(acceleratorFromEvent(ev("ControlLeft", { ctrlKey: true }, "Control"))).toBeNull();
  });

  it("refuses global hotkeys that would hijack typing", () => {
    expect(isSafeGlobalHotkey("K")).toBe(false);
    expect(isSafeGlobalHotkey("Shift+K")).toBe(false);
    expect(isSafeGlobalHotkey("Ctrl+Alt+K")).toBe(true);
    expect(isSafeGlobalHotkey("F9")).toBe(true);
  });
});

describe("app discovery helpers", () => {
  const apps = [
    { name: "Visual Studio Code", target: "C:\\vsc.lnk", source: "startMenu" as const },
    { name: "DaVinci Resolve", target: "C:\\resolve.lnk", source: "startMenu" as const },
    { name: "Photos", target: "shell:AppsFolder\\Microsoft.Windows.Photos_8wekyb3d8bbwe!App", source: "store" as const },
  ];
  it("matches hints in priority order", () => {
    expect(matchApp(apps, "Visual Studio Code")?.target).toBe("C:\\vsc.lnk");
    expect(matchApp(apps, "Lightroom|Photoshop|Photos")?.name).toBe("Photos");
    expect(matchApp(apps, "Premiere Pro")).toBeUndefined();
  });
  it("derives readable base names", () => {
    expect(baseName("C:\\Program Files\\App\\Code.exe")).toBe("Code");
    expect(baseName("shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App")).toBe("Microsoft.WindowsCalculator_8wekyb3d8bbwe");
  });
});
