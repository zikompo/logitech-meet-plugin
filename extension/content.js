// Runs inside meet.google.com tabs. Executes commands from the background
// service worker by clicking Meet's own buttons, and reports mic/camera/hand
// state changes back up so plugins can show them on the device.
(() => {
  // After the extension reloads, the old copy of this script is orphaned
  // (chrome.runtime.id becomes undefined). Let a fresh injection replace it.
  const existing = globalThis.__meetControl;
  if (existing && existing.alive()) return;
  if (existing) existing.shutdown();

  const { find, findReaction, REACTIONS, readState, isMuted } = globalThis.MeetDom;

  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(fn, timeoutMs = 1500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = fn();
      if (result) return result;
      await sleep(50);
    }
    return null;
  }

  function click(el, what) {
    if (!el) throw new Error(`Couldn't find the ${what} in Meet`);
    el.click();
  }

  // mic-on / mic-off style commands: only click when the state differs.
  function setMuted(el, what, wantMuted) {
    if (!el) throw new Error(`Couldn't find the ${what} in Meet`);
    if (isMuted(el) !== wantMuted) el.click();
  }

  async function react(key) {
    if (!REACTIONS[key]) throw new Error(`Unknown reaction "${key}"`);
    let button = findReaction(key);
    let openedBar = false;
    if (!button) {
      click(find.reactionsToggle(), 'reactions button');
      openedBar = true;
      button = await waitFor(() => findReaction(key));
    }
    if (!button) throw new Error(`Couldn't find the ${REACTIONS[key].emoji} reaction in Meet`);
    button.click();
    if (openedBar) {
      await sleep(150);
      find.reactionsToggle()?.click();
    }
  }

  const commands = {
    'toggle-mic': () => click(find.mic(), 'microphone button'),
    'mic-off': () => setMuted(find.mic(), 'microphone button', true),
    'mic-on': () => setMuted(find.mic(), 'microphone button', false),
    'toggle-camera': () => click(find.camera(), 'camera button'),
    'camera-off': () => setMuted(find.camera(), 'camera button', true),
    'camera-on': () => setMuted(find.camera(), 'camera button', false),
    'toggle-hand': () => click(find.hand(), 'raise hand button'),
    'toggle-chat': () => click(find.chat(), 'chat button'),
    'toggle-people': () => click(find.people(), 'people button'),
    'toggle-captions': () => click(find.captions(), 'captions button'),
    'share-screen': () => click(find.share(), 'share screen button'),
    'leave-call': () => click(find.leave(), 'leave call button'),
  };

  async function run(command) {
    if (command.startsWith('react:')) return react(command.slice('react:'.length));
    const handler = commands[command];
    if (!handler) throw new Error(`Unknown command "${command}"`);
    return handler();
  }

  // --- state reporting -----------------------------------------------------

  let lastSent = '';
  let debounceTimer = null;

  function post(message) {
    if (!alive()) {
      shutdown();
      return;
    }
    chrome.runtime.sendMessage(message).catch(() => {});
  }

  function reportState(force = false) {
    const state = readState();
    const serialized = JSON.stringify(state);
    if (!force && serialized === lastSent) return;
    lastSent = serialized;
    post({ type: 'state', state });
  }

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reportState, 150);
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-is-muted', 'aria-label', 'aria-pressed'],
  });

  function onMessage(msg, _sender, sendResponse) {
    if (msg?.type === 'command') {
      Promise.resolve()
        .then(() => run(msg.command))
        .then(async () => {
          await sleep(200); // let Meet update the DOM before reading state back
          sendResponse({ ok: true, state: readState() });
        })
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true; // async response
    }
    if (msg?.type === 'get-state') {
      sendResponse(readState());
    }
    return false;
  }
  chrome.runtime.onMessage.addListener(onMessage);

  const onPageHide = () => post({ type: 'state', state: { ...readState(), inCall: false } });
  window.addEventListener('pagehide', onPageHide);

  function shutdown() {
    observer.disconnect();
    clearTimeout(debounceTimer);
    window.removeEventListener('pagehide', onPageHide);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {
      // extension context already gone
    }
  }

  globalThis.__meetControl = { alive, shutdown };

  // Wake the service worker (so it connects to the plugins) and send initial state.
  post({ type: 'wake' });
  reportState(true);
})();
