/**
 * KI-G1: fetch X-CFEG-* via Gmail Show original (view=om).
 */

import { parseCfegHeaders, shouldIntercept } from "../../shared/headers.js";
import {
  buildOriginalMessageUrl,
  extractRawFromShowOriginalHtml,
  normalizePermMessageId,
  parseGmailAccountIndex,
  parseIkFromHtml,
} from "./gmail-ids.js";

/** @type {Map<string, any>} */
const cache = new Map();

/**
 * @param {Document} doc
 * @returns {string | null}
 */
export function findVisibleMessagePermId(doc = document) {
  const nodes = [
    ...doc.querySelectorAll("[data-message-id]"),
    ...doc.querySelectorAll("[data-legacy-message-id]"),
  ];

  /** @type {Element[]} */
  const visible = nodes.filter((el) => {
    try {
      if (typeof el.checkVisibility === "function") {
        return el.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        });
      }
    } catch {
      /* ignore */
    }
    const st = doc.defaultView?.getComputedStyle?.(el);
    if (st && (st.display === "none" || st.visibility === "hidden")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  // Prefer nodes inside the open message pane (larger area)
  visible.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return rb.height * rb.width - ra.height * ra.width;
  });

  const pick = visible[0] || nodes[nodes.length - 1] || null;
  if (!pick) return null;

  const raw =
    pick.getAttribute("data-message-id") ||
    pick.getAttribute("data-legacy-message-id");
  return normalizePermMessageId(raw);
}

/**
 * @param {Document} doc
 * @returns {string | null}
 */
export function findIk(doc = document) {
  for (const el of doc.querySelectorAll("a[href], form[action], link[href]")) {
    const href = el.getAttribute("href") || el.getAttribute("action") || "";
    if (!href.includes("ik=")) continue;
    try {
      const u = new URL(href, doc.location?.href || "https://mail.google.com");
      const ik = u.searchParams.get("ik");
      if (ik && /^[a-f0-9]+$/i.test(ik)) return ik;
    } catch {
      const m = href.match(/[?&]ik=([a-f0-9]+)/i);
      if (m) return m[1];
    }
  }
  // Scripts / GLOBALS often embed ik in page HTML
  const html = doc.documentElement?.innerHTML || "";
  const fromHtml = parseIkFromHtml(html);
  if (fromHtml) return fromHtml;

  // last resort: current URL
  try {
    const ik = new URL(doc.location.href).searchParams.get("ik");
    if (ik && /^[a-f0-9]+$/i.test(ik)) return ik;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string | Record<string, string> | null} raw
 */
export function contextFromRaw(raw) {
  const ctx = parseCfegHeaders(raw);
  return shouldIntercept(ctx) ? ctx : null;
}

/**
 * @typedef {{ ctx: import('../../shared/headers.js').CfegMessageContext | null, error: string | null, debug?: object }} FetchResult
 */

/**
 * @param {{ permmsgid?: string | null, force?: boolean }} [opts]
 * @returns {Promise<FetchResult>}
 */
export async function fetchContextForOpenMessageDetailed(opts = {}) {
  const permmsgid =
    normalizePermMessageId(opts.permmsgid) || findVisibleMessagePermId(document);
  if (!permmsgid) {
    return { ctx: null, error: "no message id on page (open the message first)" };
  }

  if (!opts.force && cache.has(permmsgid)) {
    const hit = cache.get(permmsgid);
    if (hit instanceof Promise) return hit;
    return hit;
  }

  const pending = (async () => {
    const ik = findIk(document);
    if (!ik) {
      return {
        ctx: null,
        error: "could not find Gmail ik — reload Gmail tab",
        debug: { permmsgid },
      };
    }

    const accountIndex = parseGmailAccountIndex(location.pathname);
    let url;
    try {
      url = buildOriginalMessageUrl({
        origin: location.origin,
        accountIndex,
        ik,
        permmsgid,
      });
    } catch (e) {
      return { ctx: null, error: String(e), debug: { permmsgid, ik } };
    }

    let res;
    try {
      res = await fetch(url, {
        credentials: "include",
        redirect: "follow",
        headers: { Accept: "text/html,application/xhtml+xml,*/*" },
      });
    } catch (e) {
      return {
        ctx: null,
        error: `fetch failed: ${e}`,
        debug: { url },
      };
    }
    if (!res.ok) {
      return {
        ctx: null,
        error: `Show original HTTP ${res.status}`,
        debug: { url },
      };
    }
    const html = await res.text();
    const raw = extractRawFromShowOriginalHtml(html);
    if (!raw) {
      return {
        ctx: null,
        error: "could not parse Show original body",
        debug: { url, htmlLen: html.length },
      };
    }
    // Accept full v2 marker set (Reply-To, Reply-To-Addr, Parties)
    if (
      !/X-CFEG-Reply-To:/i.test(raw) &&
      !/X-CFEG-Reply-To-Addr:/i.test(raw) &&
      !/X-Reply-To:/i.test(raw) &&
      !/X-CFEG-Parties:/i.test(raw)
    ) {
      return {
        ctx: null,
        error:
          "no X-CFEG-Reply-To on this message (gateway not minting, or not a CFEG forward)",
        debug: { url, head: raw.slice(0, 400) },
      };
    }
    const ctx = contextFromRaw(raw);
    if (!ctx) {
      return {
        ctx: null,
        error: "X-CFEG headers present but failed validation",
        debug: { url },
      };
    }
    return { ctx, error: null, debug: { url, replyTo: ctx.replyTo } };
  })();

  cache.set(permmsgid, pending);
  try {
    const result = await pending;
    cache.set(permmsgid, result);
    return result;
  } catch (e) {
    const result = { ctx: null, error: String(e) };
    cache.set(permmsgid, result);
    return result;
  }
}

/**
 * @param {{ permmsgid?: string | null, force?: boolean }} [opts]
 */
export async function fetchContextForOpenMessage(opts = {}) {
  const { ctx } = await fetchContextForOpenMessageDetailed(opts);
  return ctx;
}

export function clearContextCache() {
  cache.clear();
}

export async function fetchOpenMessageRawHeaders() {
  const ctx = await fetchContextForOpenMessage();
  return ctx?.replyTo ? `X-CFEG-Reply-To: ${ctx.replyTo}\n` : null;
}
