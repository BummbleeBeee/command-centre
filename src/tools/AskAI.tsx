import { useState } from "react";
import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { api, isDesktop } from "../lib/api";
import { installedApps, matchApp } from "../lib/resolveApps";

export const claudeUrl = (q: string) => `https://claude.ai/new?q=${encodeURIComponent(q)}`;
export const chatgptUrl = (q: string) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`;

async function openApp(hint: string, fallback: string) {
  const app = matchApp(await installedApps(), hint);
  if (app) await api.launchApp(app.target);
  else await api.openUrl(fallback);
}

/** One prompt, sent to Claude, ChatGPT or both, in your browser where you're signed in. */
export function AskAI() {
  const app = useApp();
  const [q, setQ] = useState("");
  const send = async (to: "claude" | "chatgpt" | "both") => {
    const text = q.trim();
    if (!text) return;
    try {
      if (to !== "chatgpt") await api.openUrl(claudeUrl(text));
      if (to !== "claude") await api.openUrl(chatgptUrl(text));
      app.toast({ kind: "success", title: to === "both" ? "Sent to Claude and ChatGPT" : `Sent to ${to === "claude" ? "Claude" : "ChatGPT"}` });
    } catch (e) { app.toast({ kind: "error", title: "Ask AI", detail: (e as Error).message }); }
  };
  return (
    <div className="ask-ai">
      <div className="ai-apps">
        <button className="ai-app claude" disabled={!isDesktop()} onClick={() => void openApp("Claude", "https://claude.ai/new")}>
          <span className="ai-mark"><Glyph name="sparkles" size={20} /></span><strong>Claude</strong><small>Open app or claude.ai</small>
        </button>
        <button className="ai-app chatgpt" disabled={!isDesktop()} onClick={() => void openApp("ChatGPT", "https://chatgpt.com")}>
          <span className="ai-mark"><Glyph name="chat" size={20} /></span><strong>ChatGPT</strong><small>Open app or chatgpt.com</small>
        </button>
      </div>
      <label className="field">Ask both at once
        <textarea className="ai-input" value={q} onChange={(e) => setQ(e.target.value)} rows={5} placeholder="Type a question, e.g. “Explain this error…”. Ctrl+Enter sends to both."
          onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); void send("both"); } }} />
      </label>
      <div className="row wrap">
        <button className="btn primary" disabled={!q.trim() || !isDesktop()} onClick={() => void send("both")}><Glyph name="sparkles" size={14} /> Ask both</button>
        <button className="btn" disabled={!q.trim() || !isDesktop()} onClick={() => void send("claude")}>Ask Claude</button>
        <button className="btn" disabled={!q.trim() || !isDesktop()} onClick={() => void send("chatgpt")}>Ask ChatGPT</button>
        <button className="btn" disabled={!q.trim()} onClick={() => void navigator.clipboard?.writeText(q)} title="Copy the prompt"><Glyph name="copy" size={14} /></button>
      </div>
      <p className="dim small">Your question opens in a new Claude and/or ChatGPT tab in your default browser, using the accounts you're already signed in to. Nothing is sent anywhere else, and no API key is needed.</p>
    </div>
  );
}
