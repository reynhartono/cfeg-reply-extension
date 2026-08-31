import { getSettings, setSettings } from "../shared/settings.js";

const enabledEl = document.getElementById("enabled");
const debugEl = document.getElementById("debug");
const statusEl = document.getElementById("status");

async function refresh() {
  const s = await getSettings();
  enabledEl.checked = s.enabled;
  debugEl.checked = s.debug;
}

async function onChange() {
  await setSettings({
    enabled: enabledEl.checked,
    debug: debugEl.checked,
  });
  statusEl.textContent = "Saved";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 1200);
}

enabledEl.addEventListener("change", onChange);
debugEl.addEventListener("change", onChange);
refresh().catch((e) => {
  statusEl.textContent = String(e);
});
