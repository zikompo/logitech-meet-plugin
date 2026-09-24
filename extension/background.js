// Bridges the Logitech plugins (local WebSocket servers) and Meet tabs.
// Connects as a client to every known plugin port, forwards commands to the
// best Meet tab, and broadcasts the Meet call state back to every plugin.

const PLUGIN_PORTS = [
  47831, // Node.js plugin
  47832, // C# plugin
];
const MAX_BACKOFF_MS = 30_000;
const VERSION = chrome.runtime.getManifest().version;

const REACTIONS = ['heart', 'thumbsup', 'party', 'clap', 'laugh', 'surprised', 'sad', 'thinking', 'thumbsdown'];
const COMMANDS = new Set([
  'toggle-mic',
  'mic-off',
  'mic-on',
  'toggle-camera',
  'camera-off',
  'camera-on',
  'toggle-hand',
  'toggle-chat',
  'toggle-people',
  'toggle-captions',
  'share-screen',
  'leave-call',
  'focus-meet',
  ...REACTIONS.map((r) => `react:${r}`),
]);

const EMPTY_STATE = { inCall: false, micOn: null, camOn: null, handRaised: null, captionsOn: null };

// --- plugin connections ----------------------------------------------------

const sockets = new Map(); // port -> WebSocket
const backoff = new Map(); // port -> next retry delay (ms)
const retryTimers = new Map(); // port -> timeout id

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(message) {
  for (const ws of sockets.values()) send(ws, message);
}

function scheduleRetry(port) {
  clearTimeout(retryTimers.get(port));
  const delay = backoff.get(port) ?? 1000;
  backoff.set(port, Math.min(delay * 2, MAX_BACKOFF_MS));
  retryTimers.set(port, setTimeout(() => connect(port), delay));
}

// Chrome logs every refused WebSocket to the extension's Errors page, and that
// can't be caught. A no-cors fetch fails silently instead, so check the plugin
// is listening before opening a socket. (Its HTTP reply doesn't matter.)
async function isListening(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

const probing = new Set(); // ports with a check in flight

async function connect(port) {
  const current = sockets.get(port);
  if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) return;
  if (probing.has(port)) return;
  clearTimeout(retryTimers.get(port));

  probing.add(port);
  const listening = await isListening(port);
  probing.delete(port);
  if (!listening) {
    scheduleRetry(port);
    return;
  }

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.set(port, ws);

  ws.onopen = () => {
    backoff.delete(port);
    console.log(`[meet-control] connected to plugin on :${port}`);
    send(ws, { type: 'hello', client: 'meet-control-extension', version: VERSION });
    send(ws, { type: 'state', state: currentState });
    refreshStates();
  };
  ws.onmessage = (event) => handlePluginMessage(ws, event.data);
  ws.onerror = () => {}; // onclose follows
  ws.onclose = () => {
    if (sockets.get(port) === ws) sockets.delete(port);
    scheduleRetry(port);
  };
}

function connectAll() {
  for (const port of PLUGIN_PORTS) connect(port);
}

async function handlePluginMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === 'ping') {
    send(ws, { type: 'pong' });
    return;
  }
  if (msg.type !== 'command') return;

  const { id, command } = msg;
  if (!COMMANDS.has(command)) {
    send(ws, { type: 'result', id, ok: false, error: `Unknown command "${command}"` });
    return;
  }
  try {
    const result = await runCommand(command);
    send(ws, { type: 'result', id, ok: true, ...result });
  } catch (err) {
    send(ws, { type: 'result', id, ok: false, error: err.message });
  }
}

// --- Meet tabs -----------------------------------------------------------

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Tab was open before the extension loaded: inject and retry once.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['meet-dom.js', 'content.js'] });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

// Prefer a tab that's in a call; among those, the active tab of the focused
// window, then the most recently used one.
async function pickMeetTab() {
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  if (tabs.length === 0) return null;

  const focused = await chrome.windows.getLastFocused().catch(() => null);
  const scored = await Promise.all(
    tabs.map(async (tab) => {
      const state = await sendToTab(tab.id, { type: 'get-state' }).catch(() => null);
      return { tab, inCall: !!state?.inCall };
    }),
  );
  scored.sort(
    (a, b) =>
      b.inCall - a.inCall ||
      (b.tab.active && b.tab.windowId === focused?.id) - (a.tab.active && a.tab.windowId === focused?.id) ||
      (b.tab.lastAccessed ?? 0) - (a.tab.lastAccessed ?? 0),
  );
  return scored[0].tab;
}

async function runCommand(command) {
  const tab = await pickMeetTab();
  if (!tab) throw new Error('No Google Meet tab is open');

  if (command === 'focus-meet') {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return {};
  }

  const response = await sendToTab(tab.id, { type: 'command', command });
  if (!response?.ok) throw new Error(response?.error ?? 'Meet tab did not respond');
  if (response.state) updateTabState(tab.id, response.state);
  return { state: response.state };
}

// --- call state ------------------------------------------------------------

const tabStates = new Map(); // tabId -> { state, updatedAt }
let currentState = EMPTY_STATE;

function updateTabState(tabId, state) {
  tabStates.set(tabId, { state, updatedAt: Date.now() });
  recomputeState();
}

function recomputeState() {
  const entries = [...tabStates.values()].sort(
    (a, b) => b.state.inCall - a.state.inCall || b.updatedAt - a.updatedAt,
  );
  const next = entries[0]?.state ?? EMPTY_STATE;
  if (JSON.stringify(next) === JSON.stringify(currentState)) return;
  currentState = next;
  broadcast({ type: 'state', state: currentState });
}

// The worker's memory is wiped whenever Chrome stops it, so re-read every Meet
// tab when a plugin connects instead of trusting what's cached.
async function refreshStates() {
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  await Promise.all(
    tabs.map(async (tab) => {
      const state = await sendToTab(tab.id, { type: 'get-state' }).catch(() => null);
      if (state) tabStates.set(tab.id, { state, updatedAt: tab.lastAccessed ?? 0 });
    }),
  );
  recomputeState();
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  connectAll();
  if (msg?.type === 'state' && sender.tab?.id != null) updateTabState(sender.tab.id, msg.state);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabStates.delete(tabId)) recomputeState();
});

// --- lifecycle -------------------------------------------------------------

// MV3 service workers stop when idle. Open sockets with 20s pings keep this one
// alive while a plugin is connected; the alarm wakes it to retry otherwise.
chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'reconnect') connectAll();
});

chrome.runtime.onStartup.addListener(connectAll);

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ['meet-dom.js', 'content.js'] })
      .catch(() => {});
  }
});

connectAll();
