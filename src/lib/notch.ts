export const NOTCH = { collapsed: { width: 300, height: 34 } };
/** Expanded notch size: wide enough for the buttons and every page name, tall enough for the widgets. */
export function notchExpandedSize(buttons: number, widgetIds: string[] | false, pageNames: string[] = []) {
  const tiles = Math.min(Math.max(buttons, 4), 9);
  const widgets = widgetIds ? widgetIds : [];
  const full = widgets.filter((w) => w === "spotify" || w === "media").length;
  const rows = full + Math.ceil((widgets.length - full) / 2);
  const widgetHeight = rows ? 30 + rows * 62 : 0;
  const buttonRows = Math.ceil(Math.max(buttons + 1, 1) / tiles);
  const buttonHeight = 70 + Math.min(buttonRows, 3) * 74;
  const side = widgets.length ? 420 : 40;
  // page chips (icon + name) + the keep-awake chip and the three buttons beside them
  const chips = pageNames.reduce((w, n) => w + 36 + n.length * 7, 0) + Math.max(0, pageNames.length - 1) * 4 + 150;
  return { width: Math.min(1500, side + Math.max(tiles * 66, chips)), height: Math.min(360, Math.max(132, widgetHeight, buttonHeight)) };
}
