/**
 * MV3 service worker — defaults on install.
 */

import { DEFAULTS } from "../shared/settings.js";

const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await api.storage.local.set({ ...DEFAULTS });
  }
});

// Keep worker lightweight; Phase 2 may add message routing.
api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "cfeg.ping") {
    sendResponse({ ok: true, phase: 1, version: api.runtime.getManifest().version });
    return true;
  }
  return false;
});
