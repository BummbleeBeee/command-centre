import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "../app/context";
import { Glyph } from "../components/Icon";
import { AiProvider, AiStreamEvent, api, isDesktop } from "../lib/api";
import { uid } from "../lib/schema";
import { chatgptUrl, claudeUrl } from "./AskAI";

interface Msg { id: string; role: "user" | "assistant"; content: string; error?: boolean; pending?: boolean }
type Target = "claude" | "openai" | "both";

// Conversations survive switching tabs (kept in memory for this session only).
const threads: Record<AiProvider, Msg[]> = { claude: [], openai: [] };
const NAMES: Record<AiProvider, string> = { claude: "Claude", openai: "ChatGPT" };

/** Minimal formatting: ``` code fences and `inline code`. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/```(?:[\w-]+)?\n?/);
  return (
    <>
      {parts.map((p, i) => i % 2 === 1
        ? <pre key={i}>{p.replace(/\n$/, "")}</pre>
        : <Fragment key={i}>{p.split(/(`[^`\n]+`)/).map((s, j) => (s.startsWith("`") && s.endsWith("`") && s.length > 2 ? <code key={j}>{s.slice(1, -1)}</code> : <Fragment key={j}>{s}</Fragment>))}</Fragment>)}
    </>
  );
}

function Thread({ provider, msgs, model, children }: { provider: AiProvider; msgs: Msg[]; model: string; children?: ReactNode }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);
  return (
    <div className="ai-thread">
      <div className="ai-thread-head">
        <span className={`ai-mark ${provider === "claude" ? "claude-bg" : "chatgpt-bg"}`}><Glyph name={provider === "claude" ? "sparkles" : "chat"} size={13} /></span>
        {NAMES[provider]}<small>{model}</small>
      </div>
      <div className="ai-msgs">
        {msgs.length === 0 && <p className="ai-empty">Ask {NAMES[provider]} anything. The answer appears here.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`ai-msg ${m.role} ${m.error ? "error" : ""}`}>
            {m.pending && !m.content ? <span className="ai-typing"><i /><i /><i /></span> : <Rich text={m.content} />}
          </div>
        ))}
        {children}
        <div ref={end} />
      </div>
    </div>
  );
}

export function AiChat({ compact }: { compact?: boolean } = {}) {
  const app = useApp();
  const ai = app.config.ai;
  const [target, setTarget] = useState<Target>(() => { const t = (localStorage.getItem("cc-ai-target") as Target) || "both"; return compact && t === "both" ? "claude" : t; });
  const [, force] = useState(0);
  const [input, setInput] = useState("");
  const [keys, setKeys] = useState<{ claude: boolean; openai: boolean } | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const live = useRef(new Map<string, { provider: AiProvider; msgId: string }>());
  const rerender = () => force((n) => n + 1);

  useEffect(() => { try { localStorage.setItem("cc-ai-target", target); } catch { /* ignore */ } }, [target]);
  useEffect(() => { if (isDesktop()) void api.aiKeyStatus().then((k) => { setKeys(k); if (!k.claude && !k.openai) setShowKeys(true); }).catch(() => undefined); }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    const un = listen<AiStreamEvent>("ai-stream", (e) => {
      const ref = live.current.get(e.payload.requestId);
      if (!ref) return;
      const msg = threads[ref.provider].find((m) => m.id === ref.msgId);
      if (!msg) return;
      if (e.payload.delta) msg.content += e.payload.delta;
      if (e.payload.done) {
        msg.pending = false;
        if (e.payload.error) { msg.error = true; msg.content = msg.content ? `${msg.content}\n\n⚠ ${e.payload.error}` : `⚠ ${e.payload.error}`; }
        if (e.payload.stopReason === "max_tokens") msg.content += "\n\n(Reply cut off: it reached the length limit.)";
        if (e.payload.stopReason === "refusal" && !e.payload.error) msg.content += "\n\n(Claude declined to continue this reply.)";
        live.current.delete(e.payload.requestId);
      }
      rerender();
    });
    return () => { void un.then((f) => f()); };
  }, []);

  const providers: AiProvider[] = target === "both" ? ["claude", "openai"] : [target];
  const busy = [...live.current.values()].length > 0;
  const missing = providers.filter((p) => keys && !keys[p]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (missing.length) { setShowKeys(true); return; }
    setInput("");
    for (const p of providers) {
      threads[p].push({ id: uid(), role: "user", content: text });
      const history = threads[p].filter((m) => !m.error && !m.pending).map(({ role, content }) => ({ role, content }));
      const reply: Msg = { id: uid(), role: "assistant", content: "", pending: true };
      threads[p].push(reply);
      const requestId = uid();
      live.current.set(requestId, { provider: p, msgId: reply.id });
      void api.aiChat(requestId, p, p === "claude" ? ai.claudeModel : ai.openaiModel, ai.system, history).catch(() => undefined);
    }
    rerender();
  };
  const stop = () => { for (const id of live.current.keys()) void api.aiCancel(id); };
  const clear = () => { providers.forEach((p) => { threads[p] = []; }); rerender(); };
  const openInBrowser = () => {
    const text = input.trim();
    if (!text) return;
    if (target !== "openai") void api.openUrl(claudeUrl(text));
    if (target !== "claude") void api.openUrl(chatgptUrl(text));
  };

  return (
    <div className={`ai-chat ${compact ? "compact" : ""}`}>
      <div className="ai-top">
        <div className="seg">
          <button className={target === "claude" ? "active" : ""} onClick={() => setTarget("claude")}>Claude</button>
          <button className={target === "openai" ? "active" : ""} onClick={() => setTarget("openai")}>ChatGPT</button>
          {!compact && <button className={target === "both" ? "active" : ""} onClick={() => setTarget("both")}>Both side by side</button>}
        </div>
        <span className="grow" />
        <button className="btn" onClick={clear} disabled={busy}><Glyph name="refresh" size={13} /> New chat</button>
        {!compact && <button className={`btn ${showKeys ? "primary" : ""}`} onClick={() => setShowKeys(!showKeys)}><Glyph name="lock" size={13} /> Keys &amp; models</button>}
      </div>
      {showKeys && !compact && <KeysPanel keys={keys} onChange={setKeys} />}
      <div className={`ai-threads ${providers.length === 2 ? "both" : ""}`}>
        {providers.map((p) => <Thread key={p} provider={p} msgs={threads[p]} model={p === "claude" ? ai.claudeModel : ai.openaiModel} />)}
      </div>
      {missing.length > 0 && <p className="warn small">Add your {missing.map((m) => NAMES[m]).join(" and ")} API key above to chat here, or use “Open in browser”, which uses your normal sign-in and needs no key.</p>}
      <div className="ai-compose">
        <textarea value={input} rows={2} placeholder={`Message ${providers.map((p) => NAMES[p]).join(" & ")}…  (Enter to send, Shift+Enter for a new line)`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        {busy
          ? <button className="btn danger" onClick={stop}><Glyph name="x" size={14} /> Stop</button>
          : <button className="btn primary" disabled={!input.trim() || !isDesktop()} onClick={() => void send()}><Glyph name="arrow-right" size={14} /> Send</button>}
        <button className="btn" disabled={!input.trim() || !isDesktop()} onClick={openInBrowser} title="Open this question in your browser instead (no API key needed)"><Glyph name="globe" size={14} /></button>
      </div>
    </div>
  );
}

function KeysPanel({ keys, onChange }: { keys: { claude: boolean; openai: boolean } | null; onChange: (k: { claude: boolean; openai: boolean }) => void }) {
  const app = useApp();
  const ai = app.config.ai;
  const [draft, setDraft] = useState<Record<AiProvider, string>>({ claude: "", openai: "" });
  const [models, setModels] = useState<string[]>([]);
  const setAi = (p: Partial<typeof ai>) => app.update((c) => ({ ...c, ai: { ...c.ai, ...p } }));
  const save = async (p: AiProvider) => {
    try {
      await api.aiSetKey(p, draft[p]);
      setDraft((d) => ({ ...d, [p]: "" }));
      onChange(await api.aiKeyStatus());
      app.toast({ kind: "success", title: `${NAMES[p]} key saved`, detail: "Stored in Windows Credential Manager, not in your config file." });
    } catch (e) { app.toast({ kind: "error", title: "API key", detail: (e as Error).message }); }
  };
  const remove = async (p: AiProvider) => { await api.aiDeleteKey(p).catch(() => undefined); onChange(await api.aiKeyStatus()); };
  const loadModels = async () => {
    try { setModels(await api.aiListOpenaiModels()); } catch (e) { app.toast({ kind: "error", title: "OpenAI models", detail: (e as Error).message }); }
  };
  return (
    <section className="card ai-keys">
      {(["claude", "openai"] as AiProvider[]).map((p) => (
        <div key={p} className="key-row">
          <strong>{p === "claude" ? "Claude key" : "OpenAI key"}</strong>
          <input type="password" autoComplete="off" value={draft[p]} placeholder={keys?.[p] ? "Saved. Paste a new key to replace it." : p === "claude" ? "sk-ant-… from console.anthropic.com" : "sk-… from platform.openai.com"}
            onChange={(e) => setDraft((d) => ({ ...d, [p]: e.target.value }))} />
          <button className="btn" disabled={!draft[p].trim() || !isDesktop()} onClick={() => void save(p)}>Save</button>
          {keys?.[p] ? <button className="btn" onClick={() => void remove(p)} title="Delete the saved key">Remove</button> : <span className="key-missing">not set</span>}
        </div>
      ))}
      <div className="row wrap">
        <label className="field inline">Claude model <input value={ai.claudeModel} onChange={(e) => setAi({ claudeModel: e.target.value })} style={{ width: 170 }} /></label>
        <label className="field inline">ChatGPT model
          {models.length
            ? <select value={ai.openaiModel} onChange={(e) => setAi({ openaiModel: e.target.value })}>{[ai.openaiModel, ...models.filter((m) => m !== ai.openaiModel)].map((m) => <option key={m}>{m}</option>)}</select>
            : <input value={ai.openaiModel} onChange={(e) => setAi({ openaiModel: e.target.value })} style={{ width: 140 }} />}
        </label>
        <button className="btn" disabled={!keys?.openai} onClick={() => void loadModels()}>List ChatGPT models</button>
      </div>
      <label className="field">Instructions for both assistants
        <input value={ai.system} onChange={(e) => setAi({ system: e.target.value })} />
      </label>
      <p className="dim small">API keys are billed per use by Anthropic / OpenAI and are separate from Claude Pro or ChatGPT Plus subscriptions. Keys are stored in Windows Credential Manager and never written to config.json, backups or exports. Replies stream from the providers' official APIs.</p>
    </section>
  );
}
