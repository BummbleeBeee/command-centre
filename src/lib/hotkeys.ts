import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { isDesktop } from "./api";

const MODIFIERS = ["Ctrl", "Alt", "Shift", "Super"] as const;

/** Builds a canonical accelerator ("Ctrl+Alt+K") from a keyboard event, or null. */
export function acceleratorFromEvent(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  const key = keyName(e.code, e.key);
  if (!key) return null;
  return [...mods, key].join("+");
}

function keyName(code: string, key: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (/^Numpad[0-9]$/.test(code)) return code;
  const map: Record<string, string> = {
    Space: "Space", Enter: "Enter", Tab: "Tab", Escape: "Escape", Backspace: "Backspace", Delete: "Delete",
    Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", ArrowUp: "Up",
    ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Minus: "-", Equal: "=", BracketLeft: "[",
    BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
    Backquote: "`", PrintScreen: "PrintScreen",
  };
  if (map[code]) return map[code];
  if (["Control", "Alt", "Shift", "Meta", "OS"].includes(key)) return null;
  return null;
}

/** Global hotkeys need at least one modifier (or a function key) so normal typing is never hijacked. */
export function isSafeGlobalHotkey(acc: string): boolean {
  const parts = acc.split("+");
  const hasMod = parts.some((p) => (MODIFIERS as readonly string[]).includes(p) && p !== "Shift");
  const key = parts[parts.length - 1];
  return hasMod || /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
}

export interface HotkeyBinding { accelerator: string; run: () => void }

/** Re-registers every global hotkey. Returns the accelerators that could not be registered. */
let queue: Promise<unknown> = Promise.resolve();

/** Serialised so overlapping re-registrations can never race each other. */
export function applyHotkeys(bindings: HotkeyBinding[]): Promise<string[]> {
  const next = queue.then(() => registerAll(bindings));
  queue = next.catch(() => undefined);
  return next;
}

async function registerAll(bindings: HotkeyBinding[]): Promise<string[]> {
  if (!isDesktop()) return [];
  await unregisterAll().catch(() => undefined);
  const failed: string[] = [];
  const seen = new Set<string>();
  for (const b of bindings) {
    const acc = b.accelerator.trim();
    if (!acc || seen.has(acc.toLowerCase())) continue;
    seen.add(acc.toLowerCase());
    try {
      await register(acc, (event) => { if (event.state === "Pressed") b.run(); });
    } catch {
      failed.push(acc);
    }
  }
  return failed;
}
