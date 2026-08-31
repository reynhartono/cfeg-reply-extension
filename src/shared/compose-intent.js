/**
 * Map CfegMessageContext → compose recipients (cf-email-gateway contract + local docs/02).
 *
 * Reply: To = primary hop only; Cc empty.
 * Reply-All:
 *   To  = primary + parties role/header in {to, from, reply-to}
 *   Cc  = parties role/header === cc
 *   (fallback without roles: non-primary → Cc)
 * SMTP / hidden: bare hop tokens only. Chips may include display.
 */

import { formatComposeChip } from "./headers.js";

/**
 * @typedef {import('./headers.js').CfegMessageContext} CfegMessageContext
 * @typedef {import('./headers.js').CfegParticipant} CfegParticipant
 * @typedef {'reply' | 'reply_all'} ComposeKind
 * @typedef {{
 *   to: string[],
 *   cc: string[],
 *   kind: ComposeKind,
 *   displayHint: string | null,
 *   toMailboxes: string[],
 *   ccMailboxes: string[],
 *   toChips: string[],
 *   ccChips: string[],
 * }} ComposeIntent
 */

function dedupeAddrs(addrs) {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const a of addrs) {
    const key = a.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a.trim());
  }
  return out;
}

/**
 * @param {CfegParticipant} p
 * @returns {'to' | 'cc'}
 */
function bucketParticipant(p) {
  const r = String(p.role || "").toLowerCase();
  const h = String(p.header || "").toLowerCase();
  if (r === "cc" || h === "cc") return "cc";
  if (
    r === "to" ||
    r === "from" ||
    r === "reply-to" ||
    r === "primary" ||
    h === "to" ||
    h === "from" ||
    h === "reply-to"
  ) {
    return "to";
  }
  // Unknown / other → Cc (do not dump random parties on To)
  if (r || h) return "cc";
  // No role metadata on pN → Cc (Reply-All fallback)
  return "cc";
}

/**
 * @param {CfegParticipant} p
 */
function chipFor(p) {
  const label =
    p.participant?.name && p.participant?.email
      ? `${p.participant.name} <${p.participant.email}>`
      : p.participant?.email || null;
  return formatComposeChip(label, p.replyTo) || p.replyTo;
}

/**
 * @param {CfegMessageContext | null | undefined} ctx
 * @param {ComposeKind} kind
 * @returns {ComposeIntent | null}
 */
export function toComposeIntent(ctx, kind) {
  if (!ctx || ctx.status !== "ok" || !ctx.replyTo) return null;
  if (kind !== "reply" && kind !== "reply_all") return null;

  const primaryTok = ctx.replyTo;
  const primaryMb = ctx.replyToMailbox || primaryTok;
  const primaryChip =
    formatComposeChip(ctx.replyToDisplay, primaryTok) || primaryTok;

  if (kind === "reply") {
    return {
      kind: "reply",
      to: [primaryTok],
      cc: [],
      toMailboxes: [primaryMb],
      ccMailboxes: [],
      toChips: [primaryChip],
      ccChips: [],
      displayHint: ctx.replyToDisplay,
    };
  }

  /** @type {string[]} */
  const toTok = [primaryTok];
  /** @type {string[]} */
  const toMb = [primaryMb];
  /** @type {string[]} */
  const toChips = [primaryChip];
  /** @type {string[]} */
  const ccTok = [];
  /** @type {string[]} */
  const ccMb = [];
  /** @type {string[]} */
  const ccChips = [];

  const hasRoles = ctx.participants.some((p) => p.role || p.header);

  for (const p of ctx.participants) {
    if (p.replyTo.toLowerCase() === primaryTok.toLowerCase()) continue;
    const bucket = hasRoles ? bucketParticipant(p) : "cc";
    if (bucket === "to") {
      toTok.push(p.replyTo);
      toMb.push(p.replyToMailbox || p.replyTo);
      toChips.push(chipFor(p));
    } else {
      ccTok.push(p.replyTo);
      ccMb.push(p.replyToMailbox || p.replyTo);
      ccChips.push(chipFor(p));
    }
  }

  return {
    kind: "reply_all",
    to: dedupeAddrs(toTok),
    cc: dedupeAddrs(ccTok),
    toMailboxes: toMb,
    ccMailboxes: ccMb,
    toChips,
    ccChips,
    displayHint: ctx.replyToDisplay,
  };
}
