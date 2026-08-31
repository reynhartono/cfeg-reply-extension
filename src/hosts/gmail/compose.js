/**
 * Apply compose To/Cc on Gmail — full replace (never append onto Gmail defaults).
 *
 * Gmail often shows collapsed recipient *rows* (label + chips) until clicked;
 * the editable input appears only after expand. We find compose via body/subject
 * first, then expand To/Cc before wipe/write.
 */

/**
 * @param {ParentNode} root
 * @returns {HTMLElement | null}
 */
export function findComposeDialog(root = document) {
  /** @type {{ el: HTMLElement, score: number }[]} */
  const candidates = [];

  const addCandidate = (el, score) => {
    if (!(el instanceof HTMLElement)) return;
    // Prefer outermost sensible compose root
    let rootEl =
      el.closest('div[role="dialog"]') ||
      el.closest("[data-compose-id]") ||
      el.closest("form") ||
      el.closest(".M9") ||
      null;

    if (!rootEl) {
      let p = el.parentElement;
      for (let i = 0; i < 14 && p; i++) {
        if (
          p.querySelector('input[name="subjectbox"]') ||
          p.querySelector('[aria-label="Message Body" i]') ||
          p.querySelector('[g_editable="true"]') ||
          p.querySelector('textarea[name="to"]') ||
          p.getAttribute("role") === "dialog"
        ) {
          rootEl = p;
          break;
        }
        p = p.parentElement;
      }
    }
    rootEl = rootEl || el;
    if (!(rootEl instanceof HTMLElement)) return;

    // Must look like a compose (body or subject or to)
    const isCompose = Boolean(
      rootEl.querySelector('input[name="subjectbox"]') ||
        rootEl.querySelector('[aria-label="Message Body" i]') ||
        rootEl.querySelector('[g_editable="true"]') ||
        rootEl.querySelector('textarea[name="to"]') ||
        rootEl.querySelector('[name="to"]'),
    );
    if (!isCompose) return;

    const r = rootEl.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) {
      // still allow if it has hidden textarea (inline)
      if (!rootEl.querySelector('textarea[name="to"]')) return;
    }

    const s =
      score +
      (r.width > 0 ? r.width * Math.max(r.height, 1) / 1000 : 0) +
      (rootEl.querySelector('textarea[name="to"]') ? 5000 : 0) +
      (rootEl.querySelector('[g_editable="true"]') ? 2000 : 0) +
      (rootEl.getAttribute("role") === "dialog" ? 1500 : 0);
    candidates.push({ el: rootEl, score: s });
  };

  // 1) Classic markers (may be hidden textarea — still valid)
  for (const sel of [
    'textarea[name="to"]',
    'input[name="to"]',
    'input[name="subjectbox"]',
    '[name="subjectbox"]',
    '[aria-label="Message Body" i]',
    '[g_editable="true"]',
    '[aria-label="To recipients" i]',
    '[aria-label*="To recipients" i]',
    '[aria-label="To" i]',
  ]) {
    for (const m of root.querySelectorAll(sel)) {
      if (!(m instanceof HTMLElement)) continue;
      // Don't require visibility for hidden textarea[name=to]
      if (
        m.tagName !== "TEXTAREA" &&
        m.getAttribute("name") !== "to" &&
        m.getAttribute("name") !== "subjectbox" &&
        !isVisible(m)
      ) {
        continue;
      }
      addCandidate(m, 100);
    }
  }

  // 2) Collapsed recipient rows: "To" text label near chips
  for (const el of root.querySelectorAll("span, div, td, th")) {
    if (!(el instanceof HTMLElement)) continue;
    if (!isVisible(el)) continue;
    const t = (el.textContent || "").trim();
    if (t !== "To" && t !== "To:" && t !== "Cc" && t !== "Cc:") continue;
    // Small label only
    if (t.length > 4) continue;
    addCandidate(el, 80);
  }

  // 3) Any role=dialog that looks like mail compose
  for (const d of root.querySelectorAll('div[role="dialog"]')) {
    if (!(d instanceof HTMLElement)) continue;
    if (!isVisible(d)) continue;
    if (
      d.querySelector('[g_editable="true"]') ||
      d.querySelector('input[name="subjectbox"]') ||
      d.querySelector('textarea[name="to"]')
    ) {
      addCandidate(d, 200);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  // Dedupe by element
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c.el)) continue;
    seen.add(c.el);
    return c.el;
  }
  return null;
}

function isVisible(el) {
  try {
    if (typeof el.checkVisibility === "function") {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
  } catch {
    /* ignore */
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Click collapsed "To" / "Cc" row so Gmail materializes the peoplekit input.
 * @param {HTMLElement} compose
 * @param {'to'|'cc'|'bcc'} which
 */
export async function expandRecipientRow(compose, which) {
  // Already have editable field?
  const existing = findRecipientField(compose, which);
  if (
    existing &&
    (existing instanceof HTMLInputElement ||
      existing instanceof HTMLTextAreaElement ||
      existing.isContentEditable ||
      existing.querySelector?.("input, textarea"))
  ) {
    try {
      existing.focus?.();
      existing.click?.();
    } catch {
      /* ignore */
    }
    await delay(40);
    return true;
  }

  const labels =
    which === "to"
      ? ["to", "to:", "recipients"]
      : which === "cc"
        ? ["cc", "cc:"]
        : ["bcc", "bcc:"];

  // Click aria labels
  for (const el of compose.querySelectorAll("[aria-label], span, div, td, th, button")) {
    if (!(el instanceof HTMLElement) || !isVisible(el)) continue;
    const a = (el.getAttribute("aria-label") || "").toLowerCase();
    const t = (el.textContent || "").trim().toLowerCase();
    const hit =
      labels.some((l) => a === l || a.startsWith(l + " ") || a.includes(l + " recipient")) ||
      labels.some((l) => t === l);
    if (!hit) continue;
    if (which === "to" && (a.includes("cc") || a.includes("bcc") || t === "cc" || t === "bcc")) {
      continue;
    }
    try {
      el.click();
      await delay(60);
      el.focus?.();
    } catch {
      /* ignore */
    }
    if (findRecipientField(compose, which) || findHiddenAddressTextarea(compose, which)) {
      return true;
    }
  }

  // Click first email chip / hovercard in header area to open peoplekit
  for (const chip of compose.querySelectorAll(
    "[data-hovercard-id], [email], span[email]",
  )) {
    if (!(chip instanceof HTMLElement) || !isVisible(chip)) continue;
    try {
      chip.click();
      await delay(50);
    } catch {
      /* ignore */
    }
    if (findRecipientField(compose, which)) return true;
    break;
  }

  // Hidden textarea always "exists" for many composes even when collapsed
  return Boolean(findHiddenAddressTextarea(compose, which));
}

/**
 * @param {ParentNode} compose
 * @param {'to' | 'cc' | 'bcc'} which
 * @returns {HTMLElement | null}
 */
export function findRecipientField(compose, which) {
  const ariaPrefs = {
    to: ["To recipients", "To", "Recipients"],
    cc: ["CC recipients", "Cc recipients", "Cc", "CC"],
    bcc: ["BCC recipients", "Bcc recipients", "Bcc", "BCC"],
  };

  for (const label of ariaPrefs[which] || [which]) {
    const nodes = compose.querySelectorAll(
      `[aria-label="${label}"], [aria-label="${label}" i]`,
    );
    for (const el of nodes) {
      if (!(el instanceof HTMLElement)) continue;
      const inner = el.matches("input, textarea")
        ? el
        : el.querySelector('input, textarea, div[contenteditable="true"]') || el;
      if (inner instanceof HTMLElement) return inner;
    }
  }

  for (const el of compose.querySelectorAll("[aria-label]")) {
    if (!(el instanceof HTMLElement)) continue;
    const a = (el.getAttribute("aria-label") || "").toLowerCase();
    if (which === "to") {
      if (
        (a === "to" || a.includes("to recipient") || a === "recipients") &&
        !a.includes("cc") &&
        !a.includes("bcc")
      ) {
        const inner = el.querySelector("input, textarea") || el;
        return inner instanceof HTMLElement ? inner : el;
      }
    } else if (a.includes(which)) {
      const inner = el.querySelector("input, textarea") || el;
      return inner instanceof HTMLElement ? inner : el;
    }
  }

  // peoplekit combobox
  for (const el of compose.querySelectorAll('[role="combobox"], input[type="text"]')) {
    if (!(el instanceof HTMLElement)) continue;
    const a = (el.getAttribute("aria-label") || "").toLowerCase();
    if (which === "to" && a.includes("to") && !a.includes("cc")) return el;
    if (which !== "to" && a.includes(which)) return el;
  }

  const byName = compose.querySelector(
    `textarea[name="${which}"], input[name="${which}"]`,
  );
  return byName instanceof HTMLElement ? byName : null;
}

function findHiddenAddressTextarea(compose, which) {
  const el = compose.querySelector(`textarea[name="${which}"]`);
  return el instanceof HTMLTextAreaElement ? el : null;
}

function fieldChipRoot(field) {
  return (
    field.closest("[data-hovercard-owner-id]") ||
    field.closest("tr") ||
    field.closest("td") ||
    field.closest("form") ||
    field.parentElement?.parentElement ||
    field.parentElement ||
    field
  );
}

export function ensureCcVisible(compose) {
  if (
    findRecipientField(compose, "cc") ||
    findHiddenAddressTextarea(compose, "cc")
  ) {
    return;
  }
  for (const el of compose.querySelectorAll("span, div, button, a")) {
    const t = (el.textContent || "").trim().toLowerCase();
    const al = (el.getAttribute("aria-label") || "").toLowerCase();
    if (t === "cc" || t === "cc:" || al.includes("add cc") || al === "cc") {
      if (el instanceof HTMLElement) {
        el.click();
        return;
      }
    }
  }
}

export function setNativeValue(input, value) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function fireKey(el, key, keyCode) {
  el.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: key,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
    }),
  );
  el.dispatchEvent(
    new KeyboardEvent("keyup", {
      key,
      code: key,
      keyCode,
      which: keyCode,
      bubbles: true,
    }),
  );
}

export function countChips(compose, which) {
  const field = findRecipientField(compose, which);
  const hidden = findHiddenAddressTextarea(compose, which);
  let n = 0;
  if (field) {
    const root = fieldChipRoot(field);
    n += root.querySelectorAll(
      "[data-hovercard-id], [email], [data-email]",
    ).length;
  }
  // Also chips anywhere in compose header area if field collapsed
  if (!n) {
    n += compose.querySelectorAll(
      ".peoplekit-list [data-hovercard-id], [data-hovercard-id]",
    ).length;
  }
  if (hidden?.value?.trim()) {
    n = Math.max(n, hidden.value.split(",").filter(Boolean).length);
  }
  return n;
}

/**
 * Aggressively wipe ALL recipients on To or Cc.
 * @param {HTMLElement} compose
 * @param {'to'|'cc'|'bcc'} which
 */
export async function clearRecipients(compose, which) {
  await expandRecipientRow(compose, which);

  for (let pass = 0; pass < 6; pass++) {
    const hidden = findHiddenAddressTextarea(compose, which);
    if (hidden) setNativeValue(hidden, "");

    const field = findRecipientField(compose, which);
    // Broader root: whole compose header if field missing
    const root = field
      ? fieldChipRoot(field)
      : compose;

    const removes = [
      ...root.querySelectorAll(
        '[aria-label*="Remove" i], [aria-label*="Delete" i], [data-tooltip*="Remove" i]',
      ),
    ];
    for (const btn of removes) {
      if (btn instanceof HTMLElement) {
        try {
          btn.click();
        } catch {
          /* ignore */
        }
      }
    }

    for (const chip of root.querySelectorAll(
      "[data-hovercard-id], [email], [data-email]",
    )) {
      if (!(chip instanceof HTMLElement)) continue;
      const del =
        chip.querySelector(
          '[aria-label*="Remove" i], [role="button"], img',
        ) || null;
      try {
        if (del instanceof HTMLElement) del.click();
        else chip.click();
      } catch {
        /* ignore */
      }
    }

    const input =
      field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
        ? field
        : field?.querySelector?.("input, textarea") || field;

    if (
      input instanceof HTMLInputElement ||
      input instanceof HTMLTextAreaElement ||
      (input instanceof HTMLElement && input.isContentEditable)
    ) {
      try {
        input.focus();
        if (
          input instanceof HTMLInputElement ||
          input instanceof HTMLTextAreaElement
        ) {
          input.select();
          setNativeValue(input, "");
        } else {
          document.execCommand?.("selectAll");
          input.textContent = "";
          input.dispatchEvent(new InputEvent("input", { bubbles: true }));
        }
        for (let i = 0; i < 10; i++) fireKey(input, "Backspace", 8);
        fireKey(input, "Delete", 46);
      } catch {
        /* ignore */
      }
    }

    if (hidden) setNativeValue(hidden, "");
    await delay(30 + pass * 20);

    const hid = findHiddenAddressTextarea(compose, which);
    const hidEmpty = !hid || !hid.value.trim();
    // Don't require zero chips if we can't find field — hidden empty is enough
    if (hidEmpty && countChips(compose, which) <= 0) break;
    if (hidEmpty && pass >= 2 && !findRecipientField(compose, which)) break;
  }

  const hidden = findHiddenAddressTextarea(compose, which);
  if (hidden) setNativeValue(hidden, "");
}

/**
 * Commit one hop to the visible peoplekit only.
 * Do NOT touch hidden textarea here — Gmail syncs hidden→chips and doubles To.
 * @param {HTMLElement} compose
 * @param {string} address bare hop
 * @param {'to'|'cc'|'bcc'} which
 * @param {{ chip?: string }} [opts]
 */
export async function commitAddress(compose, address, which, opts = {}) {
  await expandRecipientRow(compose, which);

  if (fieldShowsHop(compose, which, address)) {
    return true;
  }

  const chipText = opts.chip || address;
  const field = findRecipientField(compose, which);

  const input =
    field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
      ? field
      : field?.querySelector?.("input, textarea") || field;

  if (
    input instanceof HTMLInputElement ||
    input instanceof HTMLTextAreaElement
  ) {
    input.focus();
    setNativeValue(input, "");
    await delay(15);
    setNativeValue(input, chipText);
    await delay(20);
    // One commit path only: Enter (no blur/subject focus — that can re-parse)
    fireKey(input, "Enter", 13);
    await delay(55);
    // Clear residual typed text if chip formed
    if (input.value && input.value.includes(address.split("@")[0])) {
      // leave empty for next type
      try {
        setNativeValue(input, "");
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  if (input instanceof HTMLElement && input.isContentEditable) {
    input.focus();
    input.textContent = chipText;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: chipText }));
    await delay(20);
    fireKey(input, "Enter", 13);
    await delay(55);
    return true;
  }

  // No visible field — deferred to final hidden write only
  return false;
}

/**
 * UI-only check (ignore hidden) — whether hop already appears as a chip.
 * @param {HTMLElement} compose
 * @param {'to'|'cc'|'bcc'} which
 * @param {string} address
 */
function fieldShowsHop(compose, which, address) {
  const want = address.toLowerCase();
  const local = want.split("@")[0];
  const field = findRecipientField(compose, which);
  if (!field) return false;
  const root = fieldChipRoot(field);
  const blob = (root.textContent || "").toLowerCase();
  // Count occurrences of hop local-part in chip area
  let n = 0;
  const re = new RegExp(local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const m = blob.match(re);
  n = m ? m.length : 0;
  return n >= 1;
}

export function recipientLooksSet(compose, address, which) {
  const want = address.toLowerCase();
  if (fieldShowsHop(compose, which, address)) return true;
  const hidden = findHiddenAddressTextarea(compose, which);
  return Boolean(hidden && hidden.value.toLowerCase().includes(want));
}

/**
 * Set hidden name=to/cc exactly once after chips settled (no mid-flight writes).
 * @param {HTMLElement} compose
 * @param {'to'|'cc'|'bcc'} which
 * @param {string[]} hops
 */
function setHiddenHopsExact(compose, which, hops) {
  const hidden = findHiddenAddressTextarea(compose, which);
  if (!hidden) return;
  const uniq = [...new Set(hops.map((h) => h.trim()).filter(Boolean))];
  setNativeValue(hidden, uniq.join(", "));
}

/**
 * If more chips than hops, remove extras (click Remove until count ok).
 * @param {HTMLElement} compose
 * @param {'to'|'cc'|'bcc'} which
 * @param {number} maxChips
 */
async function trimExtraChips(compose, which, maxChips) {
  for (let guard = 0; guard < 12; guard++) {
    const n = countChips(compose, which);
    if (n <= maxChips) break;
    const field = findRecipientField(compose, which);
    const root = field ? fieldChipRoot(field) : compose;
    const removes = [
      ...root.querySelectorAll(
        '[aria-label*="Remove" i], [aria-label*="Delete" i]',
      ),
    ];
    // Remove last chip first
    const btn = removes[removes.length - 1];
    if (btn instanceof HTMLElement) {
      try {
        btn.click();
      } catch {
        /* ignore */
      }
    } else {
      break;
    }
    await delay(40);
  }
}

/**
 * True if this compose is Gmail "New message" (not Reply/Forward).
 * @param {HTMLElement} compose
 */
export function isNewMessageCompose(compose) {
  for (const el of compose.querySelectorAll(
    "h1, h2, h3, [role='heading'], [aria-label], span, div",
  )) {
    if (!(el instanceof HTMLElement)) continue;
    const t = (el.getAttribute("aria-label") || el.textContent || "")
      .trim()
      .toLowerCase();
    if (t === "new message" || t === "new conversation") return true;
  }

  const subject = compose.querySelector(
    'input[name="subjectbox"], input[aria-label*="Subject" i]',
  );
  const subj =
    subject instanceof HTMLInputElement ? subject.value.trim() : "";
  if (/^\s*re\s*:/i.test(subj) || /^\s*fw(d)?\s*:/i.test(subj)) return false;

  const hasQuote = Boolean(
    compose.querySelector("blockquote, .gmail_quote, [class*='gmail_quote']"),
  );
  if (!subj && !hasQuote) return true;

  return false;
}

/**
 * @param {HTMLElement} compose
 * @param {{ to: string[], cc: string[], toChips?: string[], ccChips?: string[] }} intent
 */
export async function applyComposeRecipients(compose, intent) {
  await expandRecipientRow(compose, "to");
  await delay(40);

  const hasTo =
    findRecipientField(compose, "to") ||
    findHiddenAddressTextarea(compose, "to") ||
    compose.querySelector('input[name="subjectbox"]') ||
    compose.querySelector('[g_editable="true"]');

  if (!hasTo) {
    return { ok: false, detail: "could not find To field (inline/popout)" };
  }

  const toList = [
    ...new Set((intent.to || []).map((s) => s.trim()).filter(Boolean)),
  ];
  const ccList = [
    ...new Set((intent.cc || []).map((s) => s.trim()).filter(Boolean)),
  ];
  if (!toList.length) return { ok: false, detail: "empty intent" };

  await delay(50);

  // Wipe defaults
  await clearRecipients(compose, "to");
  ensureCcVisible(compose);
  await expandRecipientRow(compose, "cc");
  await clearRecipients(compose, "cc");
  await delay(40);
  await clearRecipients(compose, "to");
  await clearRecipients(compose, "cc");
  // Keep hidden empty until chips done
  setHiddenHopsExact(compose, "to", []);
  setHiddenHopsExact(compose, "cc", []);
  await delay(30);

  // Peoplekit only (no hidden writes per address)
  for (let i = 0; i < toList.length; i++) {
    await commitAddress(compose, toList[i], "to", {
      chip: intent.toChips?.[i] || toList[i],
    });
    await delay(50);
  }

  if (ccList.length) {
    ensureCcVisible(compose);
    await expandRecipientRow(compose, "cc");
    await clearRecipients(compose, "cc");
    setHiddenHopsExact(compose, "cc", []);
    await delay(30);
    for (let i = 0; i < ccList.length; i++) {
      await commitAddress(compose, ccList[i], "cc", {
        chip: intent.ccChips?.[i] || ccList[i],
      });
      await delay(50);
    }
  } else {
    await clearRecipients(compose, "cc");
    setHiddenHopsExact(compose, "cc", []);
  }

  await delay(60);
  // Collapse accidental doubles on To/Cc
  await trimExtraChips(compose, "to", toList.length);
  await trimExtraChips(compose, "cc", ccList.length || 0);

  // If still doubled on To, one clean rewrite with bare hops only (most reliable)
  await delay(40);
  if (countChips(compose, "to") > toList.length) {
    await clearRecipients(compose, "to");
    setHiddenHopsExact(compose, "to", []);
    await delay(40);
    for (const addr of toList) {
      await commitAddress(compose, addr, "to", { chip: addr });
      await delay(45);
    }
    await trimExtraChips(compose, "to", toList.length);
  }

  // Final hidden sync once (after chips stable)
  await delay(40);
  setHiddenHopsExact(compose, "to", toList);
  setHiddenHopsExact(compose, "cc", ccList);

  const primary = toList[0];
  const ok = recipientLooksSet(compose, primary, "to");

  return {
    ok,
    detail: ok
      ? `To=[${toList.join(", ")}] Cc=[${ccList.join(", ")}] chipsTo=${countChips(compose, "to")}`
      : `replace incomplete for ${primary}`,
  };
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
