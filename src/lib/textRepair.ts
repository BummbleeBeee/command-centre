/**
 * Repairs "mojibake": UTF-8 text that was mis-read as Windows-1252 one or more times
 * (e.g. "Volume −" turning into "Volume Ã¢Ë†â€™"). Each pass converts the characters back
 * to their cp1252 bytes and decodes them as UTF-8; it stops as soon as that is not valid.
 */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const SUSPICIOUS = /Ã.|Â|â€|Ë†|Æ’/;

function onePass(s: string): string | null {
  const bytes: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x100 && !(c >= 0x80 && c <= 0x9f)) bytes.push(c);
    else if (CP1252[c] !== undefined) bytes.push(CP1252[c]);
    else if (c >= 0x80 && c <= 0x9f) bytes.push(c); // undefined cp1252 slots kept as-is
    else return null; // a real non-Latin character: this text is not mojibake
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

export function repairText(s: string): string {
  let cur = s;
  // Try a pass whenever there is Latin-1/cp1252 text; a pass only succeeds if it yields valid UTF-8,
  // which ordinary accented text (e.g. "Café") never does.
  for (let i = 0; i < 8 && /[-ÿŒœŠšŸŽžƒˆ˜–-›€™]/.test(cur); i++) {
    const next = onePass(cur);
    if (next === null || next === cur) break;
    cur = next;
  }
  return cur;
}

/** True when text still looks damaged after repair (lost characters or mojibake runs). */
export function looksDamaged(s: string): boolean {
  return s.includes("�") || SUSPICIOUS.test(s);
}

/** Repairs a label; if characters were lost, keeps the readable start of it. */
export function repairLabel(s: string, fallback: string): string {
  const fixed = repairText(s);
  if (!looksDamaged(fixed)) return fixed;
  const prefix = fixed.match(/^[\x20-\x7E]*/)?.[0].replace(/[?\s]+$/, "").trim() ?? "";
  return prefix || fallback;
}
