/** Shared settings helpers (docs/03-settings.md). */

export const DEFAULTS = Object.freeze({
  enabled: true,
  debug: false,
});

/**
 * @returns {Promise<{ enabled: boolean, debug: boolean }>}
 */
export async function getSettings() {
  const api = globalThis.browser?.storage ?? globalThis.chrome?.storage;
  if (!api?.local) return { ...DEFAULTS };
  const data = await api.local.get(Object.keys(DEFAULTS));
  return {
    enabled: data.enabled !== undefined ? Boolean(data.enabled) : DEFAULTS.enabled,
    debug: data.debug !== undefined ? Boolean(data.debug) : DEFAULTS.debug,
  };
}

/**
 * @param {Partial<{ enabled: boolean, debug: boolean }>} partial
 */
export async function setSettings(partial) {
  const api = globalThis.browser?.storage ?? globalThis.chrome?.storage;
  if (!api?.local) return;
  const next = { ...(await getSettings()), ...partial };
  await api.local.set({
    enabled: Boolean(next.enabled),
    debug: Boolean(next.debug),
  });
}
