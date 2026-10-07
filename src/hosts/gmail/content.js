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

/** Bottom chrome: clear of Gmail undo (left) + right add-ons rail / side-panel toggle. */
const UI = Object.freeze({
  edge: 24,
  gap: 12,
  /** Typical collapsed Gmail add-ons rail width when measurement fails open. */
  rightRailFallback: 56,
  /** Cap so a full-width drawer cannot shove the FAB off-screen. */
  rightInsetMax: 120,
  zBar: 999998,
  zToast: 999999,
  collapseMs: 8000,
});

/** @type {boolean} */
let toolbarExpanded = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let toolbarCollapseTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let layoutSyncTimer = null;
/** @type {ResizeObserver | null} */
let layoutRo = null;
/** @type {{ right: number, bottom: number }} */
let safeInset = { right: UI.edge + UI.rightRailFallback + UI.gap, bottom: UI.edge };

/**
 * Measure Gmail right-rail / side-panel chrome so FAB does not cover the toggle.
 * @returns {{ right: number, bottom: number }}
 */
function measureSafeInset() {
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  let right = UI.edge;
  let bottom = UI.edge;

  /** @param {DOMRectReadOnly} r */
  const claimRight = (r) => {
    if (!(r.width > 4 && r.height > 4)) return;
    // Element hugs the right edge of the viewport
    if (r.right < vw - 6 || r.left < vw * 0.55) return;
    const inset = Math.ceil(vw - r.left) + UI.gap;
    if (inset > right) right = inset;
  };

  /** @param {DOMRectReadOnly} r */
  const claimBottomRight = (r) => {
    if (!(r.width > 4 && r.height > 4)) return;
    if (r.right < vw - 6 || r.left < vw * 0.55) return;
    if (r.bottom < vh - 8 || r.top < vh * 0.45) return;
    const insetB = Math.ceil(vh - r.top) + UI.gap;
    // Only bump bottom when the control is a small toggle strip, not a tall panel
    if (r.height <= 120 && insetB > bottom) bottom = insetB;
  };

  // Classic Gmail add-ons / side panel rail
  for (const el of document.querySelectorAll(".bAw, .brC-aT5-aOt-Jw")) {
    if (!(el instanceof HTMLElement)) continue;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
      continue;
    }
    const r = el.getBoundingClientRect();
    claimRight(r);
  }

  // Side panel show/hide control + other bottom-right Gmail chrome
  for (const el of document.querySelectorAll(
    [
      '[aria-label*="side panel" i]',
      '[aria-label*="Side panel" i]',
      '[data-tooltip*="side panel" i]',
      '[data-tooltip*="Side panel" i]',
      'button[aria-label*="Calendar" i]',
      'div[role="button"][aria-label*="Calendar" i]',
    ].join(","),
  )) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest("#cfeg-reply-toolbar, #cfeg-reply-toast")) continue;
    const r = el.getBoundingClientRect();
    claimRight(r);
    claimBottomRight(r);
  }

  // Fallback: collapsed rail ~56px still present but selector missed
  if (right <= UI.edge) {
    right = UI.edge + UI.rightRailFallback + UI.gap;
  }

  right = Math.min(Math.max(right, UI.edge), UI.rightInsetMax);
  bottom = Math.min(Math.max(bottom, UI.edge), 160);
  return { right, bottom };
}

function toolbarBottomPx() {
  return safeInset.bottom;
}

function toolbarRightPx() {
  return safeInset.right;
}

/** Toast sits above the toolbar so actions stay clickable. */
function toastBottomPx() {
  const bar = document.getElementById("cfeg-reply-toolbar");
  const h = bar?.getBoundingClientRect().height || (toolbarExpanded ? 44 : 40);
  return toolbarBottomPx() + h + UI.gap;
}

function toastRightPx() {
  return toolbarRightPx();
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
  el.style.cssText = `position:fixed;z-index:${UI.zToast};bottom:${toastBottomPx()}px;right:${toastRightPx()}px;background:${bg};color:#fff;padding:10px 14px;border-radius:8px;font:13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:min(90vw,420px);opacity:1`;
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

function scheduleToolbarCollapse() {
  if (toolbarCollapseTimer) clearTimeout(toolbarCollapseTimer);
  toolbarCollapseTimer = setTimeout(() => {
    toolbarExpanded = false;
    syncToolbar();
  }, UI.collapseMs);
}

function setToolbarExpanded(next) {
  toolbarExpanded = next;
  if (toolbarCollapseTimer) {
    clearTimeout(toolbarCollapseTimer);
    toolbarCollapseTimer = null;
  }
  if (next) scheduleToolbarCollapse();
  syncToolbar();
}

/**
 * Compact FAB bottom-right (avoids Gmail undo). Expand for actions.
 * Diagnose only when popup debug is on.
 */
function ensureToolbar() {
  if (document.getElementById("cfeg-reply-toolbar")) {
    syncToolbar();
    return;
  }

  const bar = document.createElement("div");
  bar.id = "cfeg-reply-toolbar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "CFEG Reply");

  const btnStyle =
    "background:#1a376a;color:#fff;border:0;border-radius:6px;padding:8px 10px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);font:12px system-ui,sans-serif";
  const btnMuted =
    "background:#3c4043;color:#fff;border:0;border-radius:6px;padding:8px 10px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);font:12px system-ui,sans-serif";

  const btnToggle = document.createElement("button");
  btnToggle.type = "button";
  btnToggle.id = "cfeg-reply-toggle";
  btnToggle.textContent = "CFEG";
  btnToggle.title = "CFEG Reply actions";
  btnToggle.setAttribute("aria-expanded", "false");
  btnToggle.style.cssText = btnStyle;
  btnToggle.addEventListener("click", (ev) => {
    ev.stopPropagation();
    setToolbarExpanded(!toolbarExpanded);
  });

  const actions = document.createElement("div");
  actions.id = "cfeg-reply-actions";
  actions.style.cssText = "display:none;gap:6px;flex-wrap:wrap;align-items:center";

  const btnReply = document.createElement("button");
  btnReply.type = "button";
  btnReply.id = "cfeg-reply-btn-reply";
  btnReply.textContent = "Reply";
  btnReply.style.cssText = btnStyle;
  btnReply.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    scheduleToolbarCollapse();
    if (!settings.enabled) return showToast("CFEG disabled in popup", "err");
    sessionClaimed = false;
    armPending("reply");
    await attemptRewrite({ force: true, kind: "reply" });
    setToolbarExpanded(false);
  });

  const btnAll = document.createElement("button");
  btnAll.type = "button";
  btnAll.id = "cfeg-reply-btn-all";
  btnAll.textContent = "Reply-All";
  btnAll.style.cssText = btnStyle;
  btnAll.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    scheduleToolbarCollapse();
    if (!settings.enabled) return showToast("CFEG disabled in popup", "err");
    sessionClaimed = false;
    armPending("reply_all");
    await attemptRewrite({ force: true, kind: "reply_all" });
    setToolbarExpanded(false);
  });

  const btnDiag = document.createElement("button");
  btnDiag.type = "button";
  btnDiag.id = "cfeg-reply-btn-diag";
  btnDiag.textContent = "Diagnose";
  btnDiag.style.cssText = btnMuted;
  btnDiag.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    scheduleToolbarCollapse();
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
    setToolbarExpanded(false);
  });

  actions.append(btnReply, btnAll, btnDiag);
  bar.append(btnToggle, actions);
  document.body.appendChild(bar);

  // Outside click collapses expanded actions
  document.addEventListener(
    "click",
    (ev) => {
      if (!toolbarExpanded) return;
      const t = ev.target;
      if (t instanceof Node && bar.contains(t)) return;
      setToolbarExpanded(false);
    },
    true,
  );

  syncToolbar();
}

function syncToolbar() {
  const bar = document.getElementById("cfeg-reply-toolbar");
  if (!bar) return;

  safeInset = measureSafeInset();
  const bottom = toolbarBottomPx();
  const right = toolbarRightPx();

  bar.style.cssText = `position:fixed;z-index:${UI.zBar};bottom:${bottom}px;right:${right}px;left:auto;display:flex;gap:6px;align-items:center;font:12px system-ui,sans-serif;flex-wrap:wrap;max-width:min(90vw,420px);opacity:${settings.enabled ? "1" : "0.55"}`;

  const toggle = document.getElementById("cfeg-reply-toggle");
  const actions = document.getElementById("cfeg-reply-actions");
  const diag = document.getElementById("cfeg-reply-btn-diag");
  if (!(toggle instanceof HTMLButtonElement) || !(actions instanceof HTMLElement)) {
    return;
  }

  toggle.setAttribute("aria-expanded", toolbarExpanded ? "true" : "false");
  toggle.title = toolbarExpanded
    ? "Collapse CFEG actions"
    : "Expand CFEG Reply actions";

  if (toolbarExpanded) {
    actions.style.display = "flex";
    toggle.textContent = "CFEG ▾";
  } else {
    actions.style.display = "none";
    toggle.textContent = "CFEG";
  }

  if (diag) {
    diag.style.display = settings.debug ? "" : "none";
    diag.hidden = !settings.debug;
  }

  // Keep an open toast stacked above the live toolbar height
  const toast = document.getElementById("cfeg-reply-toast");
  if (toast && toast.style.opacity !== "0") {
    toast.style.bottom = `${toastBottomPx()}px`;
    toast.style.right = `${toastRightPx()}px`;
  }
}

function scheduleLayoutSync() {
  if (layoutSyncTimer) clearTimeout(layoutSyncTimer);
  layoutSyncTimer = setTimeout(() => {
    layoutSyncTimer = null;
    syncToolbar();
  }, 120);
}

function bindLayoutObservers() {
  window.addEventListener("resize", scheduleLayoutSync, { passive: true });
  // After Gmail UI clicks (side-panel toggle, etc.) remeasure once
  document.addEventListener(
    "click",
    () => {
      scheduleLayoutSync();
    },
    true,
  );
  if (typeof ResizeObserver === "function") {
    layoutRo = new ResizeObserver(() => scheduleLayoutSync());
    layoutRo.observe(document.documentElement);
    const attachRail = () => {
      const rail = document.querySelector(".bAw, .brC-aT5-aOt-Jw");
      if (rail && layoutRo) layoutRo.observe(rail);
    };
    attachRail();
    // Rail may mount after content script
    setTimeout(attachRail, 1500);
    setTimeout(attachRail, 4000);
  }
  // Light poll: Gmail can restyle without resize/click
  setInterval(() => {
    if (!document.getElementById("cfeg-reply-toolbar")) return;
    const next = measureSafeInset();
    if (next.right !== safeInset.right || next.bottom !== safeInset.bottom) {
      syncToolbar();
    }
  }, 2000);
}

function bindSettingsListener() {
  const api = globalThis.browser?.storage ?? globalThis.chrome?.storage;
  if (!api?.onChanged) return;
  api.onChanged.addListener((changes, area) => {
    if (area && area !== "local") return;
    let touched = false;
    if (changes.enabled) {
      settings.enabled = Boolean(changes.enabled.newValue);
      touched = true;
    }
    if (changes.debug) {
      settings.debug = Boolean(changes.debug.newValue);
      touched = true;
    }
    if (!touched) return;
    setBadge(settings.enabled ? "ready" : "disabled");
    syncToolbar();
  });
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
  bindSettingsListener();
  bindLayoutObservers();

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

  console.info(LOG, "loaded phase", PHASE, "toolbar-br-compact", {
    enabled: settings.enabled,
    debug: settings.debug,
  });
}

init().catch((err) => console.warn(LOG, "init failed", err));
