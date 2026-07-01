// Real-browser driver: implements the same Driver interface as FakeDriver, over the native-control
// CDP client (zero-dep, no Playwright). Not exercised in CI — real runs need the operator's
// authenticated browser. The path to native-control is overridable via LEARN_NATIVE_CONTROL.
import { pathToFileURL } from "node:url";

const NC_ROOT = process.env.LEARN_NATIVE_CONTROL || "C:/dev/public/telos/demo/native-control";
let _nc = null;
async function nc() {
  if (!_nc) _nc = await import(pathToFileURL(NC_ROOT + "/browser.mjs").href);
  return _nc;
}

const SET_VALUE = (sel, val) =>
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const d=Object.getOwnPropertyDescriptor(p,'value');if(d&&d.set)d.set.call(e,${JSON.stringify(val)});else{e.focus();e.textContent=${JSON.stringify(val)};}e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`;
const CLICK = (sel) =>
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.scrollIntoView({block:'center'});e.click();return true;})()`;
const EXISTS = (sel) => `!!document.querySelector(${JSON.stringify(sel)})`;

export class NativeDriver {
  constructor(session, m) { this.session = session; this._m = m; this.actions = []; }

  /** Attach to the operator's authenticated browser (a tab matching `match`, or the active page). */
  static async open(startUrl = "", { match } = {}) {
    const m = await nc();
    await m.ensureChrome({});
    const { session } = await m.attach({ match });
    try { await session.send("Emulation.setFocusEmulationEnabled", { enabled: true }); } catch {}
    if (startUrl) await m.navigate(session, startUrl);
    return new NativeDriver(session, m);
  }

  async navigate(url) { this.actions.push("navigate:" + url); await this._m.navigate(this.session, url); return { payload: "navigated:" + url }; }
  async click(sel) { this.actions.push("click:" + sel); const ok = await this._m.evalJs(this.session, CLICK(sel)); return { payload: (ok ? "clicked:" : "missing:") + sel }; }
  async fill(sel, val) { this.actions.push("fill:" + sel); const ok = await this._m.evalJs(this.session, SET_VALUE(sel, val)); return { payload: (ok ? "filled:" : "missing:") + sel }; }
  async waitFor(sel, timeoutMs = 8000) {
    this.actions.push("waitFor:" + sel);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await this._m.evalJs(this.session, EXISTS(sel))) return { payload: "present:" + sel };
      if (Date.now() > deadline) return { payload: "timeout:" + sel };
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  async capture(kind = "dom") {
    this.actions.push("capture:" + kind);
    if (kind === "evidence") {
      const state = await this._m.pageState(this.session);
      const ref = "browser-evidence:" + (state.url || "unknown");
      return { kind, payload: ref, evidenceRef: ref };
    }
    if (kind === "screenshot") {
      const data = await this._m.screenshot(this.session);
      return { kind, payload: "screenshot:sha-of-" + (data ? data.length : 0) + "-bytes" };
    }
    const text = await this._m.evalJs(this.session, `(()=>((document.body&&document.body.innerText)||'').slice(0,20000))()`);
    return { kind, payload: text || "" };
  }
  async snapshot() {
    const url = await this._m.evalJs(this.session, `location.href`);
    const title = await this._m.evalJs(this.session, `document.title`);
    return { url: url || "", title: title || "", fields: {} };
  }
  close() { try { this.session.close(); } catch {} }
}
