/**
 * Pure X-CFEG-* header parser.
 * Consumer of the cf-email-gateway X-CFEG header contract.
 * Local pin: docs/02-header-contract.md
 */

/** @typedef {{ email: string, name: string }} CfegParty */
/**
 * @typedef {{
 *   replyTo: string,
 *   replyToMailbox: string | null,
 *   participant: CfegParty | null,
 *   index: number,
 *   role: string | null,
 *   header: string | null,
 * }} CfegParticipant
 */
/**
 * @typedef {object} CfegMessageContext
 * @property {number} version
 * @property {string} replyTo
 * @property {string | null} replyToMailbox
 * @property {string | null} replyToDisplay
 * @property {string | null} token
 * @property {string | null} mailbox
 * @property {CfegParty | null} primary
 * @property {CfegParticipant[]} participants
 * @property {boolean} versionAssumed
 * @property {'ok' | 'unsupported_version'} status
 */

export const SUPPORTED_VERSIONS = Object.freeze([2]);
export const CURRENT_CONTRACT_VERSION = 2;

const CRLF = /[\r\n]/;

export function isAddrSpec(value) {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (!s || CRLF.test(s) || s.length > 254) return false;
  return /^[^\s@<>"]+[^\s@<>"]*@[^\s@<>"]+\.[^\s@<>"]+$/.test(s);
}

export function sanitizeHeaderValue(raw) {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  let s = raw.replace(/\r\n?[ \t]/g, " ");
  s = s.split(/\r?\n/)[0] ?? "";
  s = s.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return s.length ? s : null;
}

/**
 * Parse `"Name <email>" <r+token@dom>` or bare `r+token@dom`.
 * @returns {{ tokenAddr: string, displayLabel: string | null, mailbox: string | null } | null}
 */
export function parseMailboxOrAddr(raw) {
  const s = sanitizeHeaderValue(raw);
  if (!s) return null;

  // v2: "Alice <alice@a.com>" <r+tok@dom>
  const m = s.match(/^"([^"]*)"\s*<([^>]+@[^>]+)>\s*$/);
  if (m && isAddrSpec(m[2].trim())) {
    return {
      tokenAddr: m[2].trim(),
      displayLabel: m[1].trim() || null,
      mailbox: s,
    };
  }
  // unquoted: Alice <alice@a.com> <r+tok@dom> — rare; last angle is hop
  const angles = [...s.matchAll(/<([^>]+@[^>]+)>/g)].map((x) => x[1].trim());
  if (angles.length >= 2 && isAddrSpec(angles[angles.length - 1])) {
    const hop = angles[angles.length - 1];
    const label = s.replace(/<[^>]+@[^>]+>\s*$/, "").replace(/^"|"$/g, "").trim();
    return {
      tokenAddr: hop,
      displayLabel: label || null,
      mailbox: s,
    };
  }
  // Name <addr> single angle — if looks like hop token use it
  const m2 = s.match(/^(.*?)\s*<([^>]+@[^>]+)>\s*$/);
  if (m2 && isAddrSpec(m2[2].trim())) {
    return {
      tokenAddr: m2[2].trim(),
      displayLabel: m2[1].replace(/"/g, "").trim() || null,
      mailbox: s,
    };
  }
  if (isAddrSpec(s)) {
    return { tokenAddr: s, displayLabel: null, mailbox: null };
  }
  return null;
}

/**
 * Build peoplekit-friendly chip: `"Display" <hop@token>` or bare hop.
 * SMTP must remain the hop address (hidden To / Addr).
 */
export function formatComposeChip(displayLabel, tokenAddr) {
  const tok = String(tokenAddr || "").trim();
  if (!tok) return "";
  const d = String(displayLabel || "")
    .replace(/[\r\n"]/g, "")
    .trim();
  if (!d) return tok;
  return `"${d}" <${tok}>`;
}

export function parsePartyField(raw) {
  const s = sanitizeHeaderValue(raw);
  if (!s) return null;
  const pipe = s.indexOf("|");
  const emailPart = (pipe === -1 ? s : s.slice(0, pipe)).trim();
  const namePart = pipe === -1 ? "" : s.slice(pipe + 1).trim();
  if (!isAddrSpec(emailPart)) return null;
  return { email: emailPart.toLowerCase(), name: namePart };
}

export function normalizeHeaderInput(input) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (input == null) return map;

  if (typeof input === "object" && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input)) {
      if (v == null) continue;
      const val = Array.isArray(v) ? v.join(", ") : String(v);
      const clean = sanitizeHeaderValue(val);
      if (clean != null) map.set(k.toLowerCase(), clean);
    }
    return map;
  }

  if (typeof input !== "string") return map;

  let text = input;
  const sep = text.search(/\r?\n\r?\n/);
  if (sep !== -1) text = text.slice(0, sep);

  const lines = text.split(/\r?\n/);
  /** @type {string | null} */
  let currentName = null;
  /** @type {string[]} */
  let currentVal = [];

  const flush = () => {
    if (!currentName) return;
    const joined = sanitizeHeaderValue(currentVal.join(""));
    if (joined != null) {
      const key = currentName.toLowerCase();
      if (!map.has(key)) map.set(key, joined);
    }
    currentName = null;
    currentVal = [];
  };

  for (const line of lines) {
    if (/^[ \t]/.test(line) && currentName) {
      currentVal.push(" " + line.trim());
      continue;
    }
    flush();
    const m = line.match(/^([^:\s]+)\s*:\s*(.*)$/);
    if (!m) continue;
    currentName = m[1];
    currentVal = [m[2] ?? ""];
  }
  flush();
  return map;
}

function get(map, name) {
  return map.get(name) ?? null;
}

/**
 * @param {string | Record<string, string | string[]> | null | undefined} input
 * @param {{ supportedVersions?: number[] }} [options]
 * @returns {CfegMessageContext | null}
 */
export function parseCfegHeaders(input, options = {}) {
  const supported = options.supportedVersions ?? SUPPORTED_VERSIONS;
  const map = normalizeHeaderInput(input);
  if (map.size === 0) return null;

  const bareAddr = sanitizeHeaderValue(get(map, "x-cfeg-reply-to-addr"));
  const replyRaw =
    get(map, "x-cfeg-reply-to") ?? get(map, "x-reply-to") ?? bareAddr;
  if (!replyRaw && !bareAddr) return null;

  const parsedPrimary = parseMailboxOrAddr(replyRaw);
  const tokenFromBare = bareAddr && isAddrSpec(bareAddr) ? bareAddr : null;
  const replyTo = tokenFromBare || parsedPrimary?.tokenAddr || null;
  if (!replyTo || !isAddrSpec(replyTo)) return null;

  const versionRaw = sanitizeHeaderValue(get(map, "x-cfeg-version"));
  let versionAssumed = false;
  /** @type {number} */
  let version;
  if (versionRaw == null) {
    // Missing version → current when hop is usable
    version = CURRENT_CONTRACT_VERSION;
    versionAssumed = true;
  } else {
    const n = Number.parseInt(versionRaw, 10);
    if (!Number.isFinite(n) || String(n) !== versionRaw.trim()) {
      return null;
    }
    version = n;
  }

  if (!supported.includes(version)) {
    return {
      version,
      replyTo,
      replyToMailbox: parsedPrimary?.mailbox ?? null,
      replyToDisplay: null,
      token: null,
      mailbox: null,
      primary: null,
      participants: [],
      versionAssumed,
      status: "unsupported_version",
    };
  }

  /** @type {CfegParticipant[]} */
  const participants = [];
  /** @type {CfegParty | null} */
  let primaryFromParties = null;

  const partiesRaw = sanitizeHeaderValue(get(map, "x-cfeg-parties"));
  if (partiesRaw) {
    try {
      const arr = JSON.parse(partiesRaw);
      if (Array.isArray(arr)) {
        for (const p of arr) {
          if (!p || typeof p !== "object") continue;
          const tok = String(p.token || "").trim();
          if (!isAddrSpec(tok)) continue;
          const party = {
            email: String(p.email || "").toLowerCase(),
            name: String(p.name || ""),
          };
          const role = p.role ? String(p.role) : null;
          const isPrimary =
            role === "primary" ||
            tok.toLowerCase() === replyTo.toLowerCase();

          if (isPrimary && !primaryFromParties) {
            primaryFromParties = party;
            continue; // not in Reply-All Cc list
          }
          if (tok.toLowerCase() === replyTo.toLowerCase()) continue;

          participants.push({
            replyTo: tok,
            replyToMailbox: p.mailbox ? String(p.mailbox) : null,
            participant: party,
            index: participants.length + 1,
            role,
            header: p.header ? String(p.header) : null,
          });
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (!participants.length) {
    for (let n = 1; n <= 50; n++) {
      const pRaw =
        get(map, `x-cfeg-reply-to-p${n}`) ||
        get(map, `x-cfeg-reply-to-p${n}-addr`);
      if (!pRaw) break;
      const pParsed = parseMailboxOrAddr(pRaw);
      const pBare = sanitizeHeaderValue(get(map, `x-cfeg-reply-to-p${n}-addr`));
      const pTok =
        (pBare && isAddrSpec(pBare) ? pBare : null) || pParsed?.tokenAddr;
      if (!pTok || !isAddrSpec(pTok)) continue;
      if (pTok.toLowerCase() === replyTo.toLowerCase()) continue;
      participants.push({
        replyTo: pTok,
        replyToMailbox: pParsed?.mailbox ?? null,
        participant: parsePartyField(get(map, `x-cfeg-participant-p${n}`)),
        index: n,
        role: null,
        header: null,
      });
    }
  }

  if (!participants.length) {
    const all = sanitizeHeaderValue(get(map, "x-cfeg-reply-all-addr"));
    if (all) {
      for (const part of all.split(",")) {
        const t = part.trim();
        if (!isAddrSpec(t)) continue;
        if (t.toLowerCase() === replyTo.toLowerCase()) continue;
        participants.push({
          replyTo: t,
          replyToMailbox: null,
          participant: null,
          index: participants.length + 1,
          role: null,
          header: null,
        });
      }
    }
  }

  // Merge mailbox forms from X-CFEG-Reply-All CSV when participants lack mailbox
  const replyAllMb = sanitizeHeaderValue(get(map, "x-cfeg-reply-all"));
  if (replyAllMb) {
    for (const chunk of splitMailboxList(replyAllMb)) {
      const parsed = parseMailboxOrAddr(chunk);
      if (!parsed) continue;
      const hit = participants.find(
        (p) => p.replyTo.toLowerCase() === parsed.tokenAddr.toLowerCase(),
      );
      if (hit && !hit.replyToMailbox) hit.replyToMailbox = parsed.mailbox;
    }
  }

  const display =
    sanitizeHeaderValue(get(map, "x-cfeg-reply-to-display")) ||
    parsedPrimary?.displayLabel ||
    (primaryFromParties
      ? primaryFromParties.name
        ? `${primaryFromParties.name} <${primaryFromParties.email}>`
        : primaryFromParties.email
      : null);

  const primaryPack =
    parsePartyField(get(map, "x-cfeg-reply-primary")) || primaryFromParties;

  return {
    version,
    replyTo,
    replyToMailbox: parsedPrimary?.mailbox ?? null,
    replyToDisplay: display,
    token: sanitizeHeaderValue(get(map, "x-cfeg-reply-token")),
    mailbox: (() => {
      const m = sanitizeHeaderValue(get(map, "x-cfeg-reply-mailbox"));
      return m && isAddrSpec(m) ? m : m;
    })(),
    primary: primaryPack,
    participants,
    versionAssumed,
    status: "ok",
  };
}

/** Split CSV of mailbox forms that may contain commas inside quotes. */
function splitMailboxList(s) {
  /** @type {string[]} */
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') inQ = !inQ;
    if (c === "," && !inQ) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function shouldIntercept(ctx) {
  return Boolean(ctx && ctx.status === "ok" && ctx.replyTo);
}

/** True if raw headers look CFEG-related (for diagnose messages). */
export function looksLikeCfegRaw(raw) {
  if (!raw) return false;
  return (
    /X-CFEG-Reply-To:/i.test(raw) ||
    /X-CFEG-Reply-To-Addr:/i.test(raw) ||
    /X-Reply-To:/i.test(raw) ||
    /X-CFEG-Parties:/i.test(raw)
  );
}
