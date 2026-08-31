/**
 * Gmail content script — v0.2.2
 * Event-driven (no full-DOM thrash). Cache last good CFEG context for rewrite.
 */

import { DEFAULTS, getSettings } from "../../shared/settings.js";
import { toComposeIntent } from "../../shared/compose-intent.js";
import { classifyReplyActionLabel } from "./gmail-ids.js";
import {
  clearContextCache,
  fetchContextForOpenMessageDetailed,
  findVisibleMessagePermId,
} from "./headers-source.js";
import { applyComposeRecipients, findComposeDialog, isNewMessageCompose } from "./compose.js";

const LOG = "[cfeg-reply]";
const PHASE = "2";

/** @type {{ enabled: boolean, debug: boolean }} */
let settings = { ...DEFAULTS };

/** @type {'reply' | 'reply_all' | null} */
let pendingKind = null;
/** @type {number} */
let pendingUntil = 0;

/** Last successful CFEG context (Diagnose or fetch) — reuse so Reply doesn't re-hit view=om. */
/** @type {import('../../shared/headers.js').CfegMessageContext | null} */
let lastGoodCtx = null;
/** @type {string | null} */
let lastGoodPermId = null;

/** @type {WeakSet<Element>} */
const rewritten = new WeakSet();
let rewriteInFlight = false;
/** @type {MutationObserver | null} */
let shortObserver = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let shortObserverTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let applyDebounceTimer = null;
let applyEpoch = 0;
/** Only one successful/started apply per Reply click */
let sessionClaimed = false;

function log(...args) {
  if (settings.debug) console.debug(LOG, ...args);
}
function warn(...args) {
  console.warn(LOG, ...args);
}

function setBadge(state) {
  document.documentElement.dataset.cfegReply = state;
  document.documentElement.dataset.cfegReplyPhase = PHASE;
}

/**
 * @param {string} text
 * @param {'ok'|'err'|'info'} [level]
 */
function showToast(text, level = "info") {
  let el = document.getElementById("cfeg-reply-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "cfeg-reply-toast";
    document.body.appendChild(el);
  }
  const bg =
    level === "ok" ? "#0d652d" : level === "err" ? "#8f1d14" : "#1a376a";
  el.style.cssText = `position:fixed;z-index:999999;bottom:24px;right:24px;background:${bg};color:#fff;padding:10px 14px;border-radius:8px;font:13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:420px;opacity:1`;
  el.textContent = text;
  clearTimeout(el._cfegT);
  el._cfegT = setTimeout(() => {
    el.style.opacity = "0";
  }, level === "err" ? 7000 : 3500);
}

/**
 * @param {EventTarget | null} t
 */
function kindFromEventTarget(t) {
  let el = t instanceof Element ? t : null;
  for (let i = 0; i < 8 && el; i++) {
    const label = [
      el.getAttribute("aria-label"),
      el.getAttribute("data-tooltip"),
      el.getAttribute("title"),
      el.textContent,
    ]
      .filter(Boolean)
      .join(" ");
    const k = classifyReplyActionLabel(label || "");
    if (k) return k;
    el = el.parentElement;
  }
  return null;
}

function armPending(kind) {
  pendingKind = kind;
  pendingUntil = Date.now() + 15000;
  sessionClaimed = false;
  log("pending", kind);
  // New Reply session: allow rewrite again (draft discard reuses DOM)
  for (const el of document.querySelectorAll("[data-cfeg-applied]")) {
    el.removeAttribute("data-cfeg-applied");
  }
  void prefetchContext();
  watchForComposeBriefly();
}

async function prefetchContext() {
  const permmsgid = findVisibleMessagePermId(document);
  if (!permmsgid) return;
  // Skip network if we already have this message
  if (lastGoodCtx && lastGoodPermId === permmsgid) return;
  try {
    const r = await fetchContextForOpenMessageDetailed({ permmsgid });
    if (r.ctx) {
      lastGoodCtx = r.ctx;
      lastGoodPermId = permmsgid;
      log("prefetch ok", r.ctx.replyTo);
    } else {
      log("prefetch miss", r.error);
    }
  } catch (e) {
    log("prefetch err", e);
  }
}

/**
 * Observe DOM only for a short window after Reply (not forever).
 * Debounce apply so we run once after Gmail paints default To (then we wipe).
 */
function watchForComposeBriefly() {
  applyEpoch += 1;
  const epoch = applyEpoch;

  if (shortObserver) {
    shortObserver.disconnect();
    shortObserver = null;
  }
  if (applyDebounceTimer) {
    clearTimeout(applyDebounceTimer);
    applyDebounceTimer = null;
  }

  const schedule = () => {
    if (epoch !== applyEpoch) return;
    if (applyDebounceTimer) clearTimeout(applyDebounceTimer);
    // Short debounce: expand+wipe handles Gmail default fill; don't wait 2s
    applyDebounceTimer = setTimeout(() => {
      if (epoch !== applyEpoch) return;
      void attemptRewrite({ quiet: true });
    }, 120);
  };

  shortObserver = new MutationObserver(() => schedule());
  shortObserver.observe(document.body, { childList: true, subtree: true });
  if (shortObserverTimer) clearTimeout(shortObserverTimer);
  shortObserverTimer = setTimeout(stopShortObserver, 12000);

  // Fast first tries
  setTimeout(() => schedule(), 50);
  setTimeout(() => schedule(), 200);
  setTimeout(() => schedule(), 450);
  setTimeout(() => schedule(), 900);
}

function stopShortObserver() {
  if (shortObserver) {
    shortObserver.disconnect();
    shortObserver = null;
  }
  if (shortObserverTimer) {
    clearTimeout(shortObserverTimer);
    shortObserverTimer = null;
  }
}

/**
 * @param {{ force?: boolean, quiet?: boolean, kind?: 'reply'|'reply_all' }} [opts]
 */
async function attemptRewrite(opts = {}) {
  if (!settings.enabled) return;
  if (rewriteInFlight) return;
  if (!opts.force && sessionClaimed) return;

  const kind =
    opts.kind ||
    (pendingKind && Date.now() < pendingUntil ? pendingKind : null);
  if (!opts.force && !kind) return;

  const compose = findComposeDialog(document);
  if (!compose) {
    if (opts.force && !opts.quiet) {
      showToast(
        "CFEG: reply box not detected yet — click Reply, wait a moment, try CFEG Reply again",
        "err",
      );
    }
    return;
  }

  // Never rewrite Gmail "New message" (even if viewing a CFEG thread)
  if (isNewMessageCompose(compose)) {
    log("skip new-message compose");
    if (opts.force && !opts.quiet) {
      showToast("CFEG: only applies to Reply / Reply-All, not New message", "err");
    }
    return;
  }

  if (!opts.force && (sessionClaimed || compose.hasAttribute("data-cfeg-applied"))) {
    return;
  }

  // Claim session SYNCHRONOUSLY before any await — stops parallel doubles
  sessionClaimed = true;
  rewriteInFlight = true;
  stopShortObserver();
  if (applyDebounceTimer) {
    clearTimeout(applyDebounceTimer);
    applyDebounceTimer = null;
  }

  try {
    const effectiveKind = kind || "reply";
    const permmsgid = findVisibleMessagePermId(document);

    /** @type {import('../../shared/headers.js').CfegMessageContext | null} */
    let ctx = null;

    if (lastGoodCtx && (!permmsgid || permmsgid === lastGoodPermId || opts.force)) {
      ctx = lastGoodCtx;
      log("using cached ctx", ctx.replyTo);
    }

    if (!ctx) {
      const r = await fetchContextForOpenMessageDetailed({
        permmsgid,
        force: false,
      });
      if (r.ctx) {
        ctx = r.ctx;
        lastGoodCtx = r.ctx;
        lastGoodPermId = permmsgid;
      } else if (!opts.quiet) {
        warn("fetch fail", r.error, r.debug);
        showToast(`CFEG: ${r.error}`, "err");
        sessionClaimed = false;
        return;
      } else {
        log("quiet fetch fail", r.error);
        sessionClaimed = false;
        return;
      }
    }

    const intent = toComposeIntent(ctx, effectiveKind);
    if (!intent) {
      sessionClaimed = false;
      return;
    }

    log("apply", intent);
    compose.setAttribute("data-cfeg-applied", effectiveKind);
    rewritten.add(compose);

    const applied = await applyComposeRecipients(compose, intent);
    pendingKind = null;

    if (applied.ok) {
      setBadge("applied");
      showToast(
        effectiveKind === "reply_all"
          ? `CFEG Reply-All → ${intent.to.join(", ")}`
          : `CFEG Reply → ${intent.to[0]}`,
        "ok",
      );
    } else {
      compose.removeAttribute("data-cfeg-applied");
      sessionClaimed = false;
      warn("apply", applied.detail);
      if (!opts.quiet || opts.force) {
        showToast(`CFEG: ${applied.detail}`, "err");
      }
    }
  } finally {
    rewriteInFlight = false;
  }
}

function ensureToolbar() {
  if (document.getElementById("cfeg-reply-toolbar")) return;
  const bar = document.createElement("div");
  bar.id = "cfeg-reply-toolbar";
  bar.style.cssText =
    "position:fixed;z-index:999998;bottom:24px;left:24px;display:flex;gap:6px;font:12px system-ui,sans-serif;flex-wrap:wrap;max-width:90vw";

  const style =
    "background:#1a376a;color:#fff;border:0;border-radius:6px;padding:8px 10px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)";
  const styleMuted =
    "background:#3c4043;color:#fff;border:0;border-radius:6px;padding:8px 10px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)";

  const btnReply = document.createElement("button");
  btnReply.type = "button";
  btnReply.textContent = "CFEG Reply";
  btnReply.style.cssText = style;
  btnReply.addEventListener("click", async () => {
    if (!settings.enabled) return showToast("CFEG disabled in popup", "err");
    sessionClaimed = false;
    armPending("reply");
    await attemptRewrite({ force: true, kind: "reply" });
  });

  const btnAll = document.createElement("button");
  btnAll.type = "button";
  btnAll.textContent = "CFEG Reply-All";
  btnAll.style.cssText = style;
  btnAll.addEventListener("click", async () => {
    if (!settings.enabled) return showToast("CFEG disabled in popup", "err");
    sessionClaimed = false;
    armPending("reply_all");
    await attemptRewrite({ force: true, kind: "reply_all" });
  });

  const btnDiag = document.createElement("button");
  btnDiag.type = "button";
  btnDiag.textContent = "CFEG Diagnose";
  btnDiag.style.cssText = styleMuted;
  btnDiag.addEventListener("click", async () => {
    clearContextCache();
    const permmsgid = findVisibleMessagePermId(document);
    const r = await fetchContextForOpenMessageDetailed({
      permmsgid,
      force: true,
    });
    if (r.ctx) {
      lastGoodCtx = r.ctx;
      lastGoodPermId = permmsgid;
      showToast(`CFEG OK: ${r.ctx.replyTo}`, "ok");
      console.info(LOG, "diagnose", r);
    } else {
      showToast(`CFEG: ${r.error}`, "err");
      console.warn(LOG, "diagnose", r);
    }
  });

  bar.append(btnReply, btnAll, btnDiag);
  document.body.appendChild(bar);
}

function onClickCapture(ev) {
  if (!settings.enabled) return;
  const kind = kindFromEventTarget(ev.target);
  if (kind) armPending(kind);
}

function onKeydown(ev) {
  if (!settings.enabled) return;
  const t = ev.target;
  if (
    t instanceof HTMLElement &&
    (t.isContentEditable ||
      t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.closest('[role="textbox"]'))
  ) {
    return;
  }
  if (ev.key === "r" || ev.key === "R") armPending("reply");
  if (ev.key === "a" || ev.key === "A") armPending("reply_all");
}

async function init() {
  settings = await getSettings().catch(() => ({ ...DEFAULTS }));
  setBadge(settings.enabled ? "ready" : "disabled");
  ensureToolbar();

  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("keydown", onKeydown, true);

  // Lightweight nav reset only — no continuous scan
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      clearContextCache();
      lastGoodCtx = null;
      lastGoodPermId = null;
      stopShortObserver();
      log("nav", lastHref);
    }
  }, 2000);

  console.info(LOG, "loaded phase", PHASE, "v0.2.2-event-driven", {
    enabled: settings.enabled,
  });
}

init().catch((err) => console.warn(LOG, "init failed", err));
