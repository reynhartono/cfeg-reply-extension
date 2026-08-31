/**
 * Pure Gmail URL / id helpers (no DOM). Testable offline.
 */

/**
 * @param {string} pathname
 * @returns {string}
 */
export function parseGmailAccountIndex(pathname) {
  const m = String(pathname || "").match(/\/mail\/u\/(\d+)/);
  return m ? m[1] : "0";
}

/**
 * Normalize data-message-id / permmsgid forms to `msg-f:…` style without leading #.
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function normalizePermMessageId(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith("#")) s = s.slice(1);
  // Some UIs use msg-a: / msg-f:
  if (/^msg-[af]:/i.test(s)) return s;
  // Bare numeric legacy
  if (/^\d{6,}$/.test(s)) return `msg-f:${s}`;
  return s;
}

/**
 * Build Gmail "Show original" URL (public UI pattern: view=om).
 * @param {{ origin: string, accountIndex?: string, ik: string, permmsgid: string }} p
 */
export function buildOriginalMessageUrl(p) {
  const accountIndex = p.accountIndex ?? "0";
  const permmsgid = normalizePermMessageId(p.permmsgid);
  if (!p.ik || !permmsgid) {
    throw new Error("ik and permmsgid required");
  }
  const base = `${p.origin.replace(/\/$/, "")}/mail/u/${accountIndex}/`;
  const u = new URL(base);
  u.searchParams.set("ik", p.ik);
  u.searchParams.set("view", "om");
  u.searchParams.set("permmsgid", permmsgid);
  return u.toString();
}

/**
 * Scrape ik from HTML / link soup without page-world globals.
 * @param {string} html
 * @returns {string | null}
 */
export function parseIkFromHtml(html) {
  if (!html) return null;
  const patterns = [
    /\bGM_ID_KEY\s*=\s*["']([a-f0-9]+)["']/i,
    /["']ik["']\s*:\s*["']([a-f0-9]+)["']/i,
    /[?&]ik=([a-f0-9]{6,})\b/i,
    /\bik["']?\s*[:=]\s*["']([a-f0-9]{6,})["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Pull RFC822-ish text from Show original HTML response.
 * @param {string} html
 * @returns {string | null}
 */
export function extractRawFromShowOriginalHtml(html) {
  if (!html || typeof html !== "string") return null;

  // Prefer <pre> blocks (common on view=om)
  const pres = [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)];
  let best = null;
  let bestScore = 0;
  for (const m of pres) {
    const text = decodeBasicHtmlEntities(stripTags(m[1]));
    const score = scoreRawHeaders(text);
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }
  if (best && bestScore > 0) return best;

  // Fallback: whole body text
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (body) {
    const text = decodeBasicHtmlEntities(stripTags(body[1]));
    if (scoreRawHeaders(text) > 0) return text;
  }

  // Already plain
  if (scoreRawHeaders(html) > 0) return html;
  return null;
}

/**
 * @param {string} text
 */
function scoreRawHeaders(text) {
  if (!text) return 0;
  let s = 0;
  if (/^[\s\S]{0,500}Return-Path:/im.test(text) || /^Received:/im.test(text)) s += 2;
  if (/^From:/im.test(text)) s += 1;
  if (/X-CFEG-Reply-To:/i.test(text) || /X-Reply-To:/i.test(text)) s += 5;
  if (/X-CFEG-Version:/i.test(text)) s += 3;
  if (/Message-I[Dd]:/m.test(text)) s += 1;
  return s;
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "\n");
}

function decodeBasicHtmlEntities(s) {
  return s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r");
}

/**
 * Detect Reply vs Reply-All from control label / aria.
 * Tight matching — do not treat random UI text containing "reply".
 * @param {string} label
 * @returns {'reply' | 'reply_all' | null}
 */
export function classifyReplyActionLabel(label) {
  const t = String(label || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.length > 48) return null;
  if (
    t.includes("forward") ||
    t.includes("new message") ||
    t.includes("compose") ||
    t.includes("discard") ||
    t.includes("send")
  ) {
    return null;
  }
  if (
    t === "reply all" ||
    t === "reply-all" ||
    t === "reply to all" ||
    /^reply\s*all\b/.test(t)
  ) {
    return "reply_all";
  }
  // Exact-ish Reply only (not "replying", "noreply", etc.)
  if (t === "reply" || /^reply$/.test(t) || /^reply\s*\(/.test(t)) {
    return "reply";
  }
  return null;
}
