// Everything this extension knows about Google Meet's DOM lives in this file.
// When Google ships a UI change and a control stops working, this is the only
// place that should need editing. Matchers are tried in order; the first
// visible element wins. Language-independent attributes come first, English
// aria-label prefixes are the fallback.
(() => {
  const isVisible = (el) =>
    !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  const allButtons = () => document.querySelectorAll('button, [role="button"]');
  // Accessible name: aria-label, or the text of the elements named by aria-labelledby.
  const label = (el) => {
    const direct = el.getAttribute('aria-label');
    if (direct) return direct.trim().toLowerCase();
    const ids = el.getAttribute('aria-labelledby');
    if (!ids) return '';
    return ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim()
      .toLowerCase();
  };

  const bySelector = (selector) => () =>
    [...document.querySelectorAll(selector)].find(isVisible) || null;

  const byLabelPrefix = (...prefixes) => {
    const wanted = prefixes.map((p) => p.toLowerCase());
    return () => {
      for (const el of allButtons()) {
        const l = label(el);
        if (l && wanted.some((p) => l.startsWith(p)) && isVisible(el)) return el;
      }
      return null;
    };
  };

  const firstOf = (...matchers) => () => {
    for (const match of matchers) {
      const el = match();
      if (el) return el;
    }
    return null;
  };

  // Mic and camera toggles both carry data-is-muted="true|false". Tell them
  // apart by label; if the label is in another language, fall back to DOM
  // order (Meet always renders the mic toggle before the camera toggle).
  const mutedToggles = () => [...document.querySelectorAll('[data-is-muted]')].filter(isVisible);
  const mutedToggle = (keywords, fallbackIndex) => () => {
    const toggles = mutedToggles();
    const byName = toggles.find((el) => keywords.some((k) => label(el).includes(k)));
    return byName || toggles[fallbackIndex] || null;
  };

  const find = {
    mic: mutedToggle(['microphone', 'mic'], 0),
    camera: mutedToggle(['camera', 'video'], 1),
    leave: firstOf(byLabelPrefix('leave call', 'leave meeting'), bySelector('[jsname="CQylAd"]')),
    hand: byLabelPrefix('raise hand', 'lower hand'),
    captions: byLabelPrefix('turn on captions', 'turn off captions', 'captions'),
    chat: byLabelPrefix('chat with everyone', 'open chat', 'chat'),
    // Since 2026 the People panel opens from the participant avatars at the top right.
    people: firstOf(
      bySelector('[role="button"]:has([data-avatar-count])'),
      byLabelPrefix('people', 'show everyone', 'participants'),
    ),
    share: byLabelPrefix('share screen', 'present now', 'present'),
    reactionsToggle: byLabelPrefix('send a reaction', 'reactions', 'send reaction'),
  };

  // Meet's reaction bar. Names cover the Unicode name and the words Meet has
  // used in tooltips over time.
  const REACTIONS = {
    heart: { emoji: '💖', names: ['sparkling heart', 'heart'] },
    thumbsup: { emoji: '👍', names: ['thumbs up'] },
    party: { emoji: '🎉', names: ['party popper', 'celebrate', 'tada'] },
    clap: { emoji: '👏', names: ['clapping hands', 'clap'] },
    laugh: { emoji: '😂', names: ['face with tears of joy', 'laugh', 'joy'] },
    surprised: { emoji: '😮', names: ['face with open mouth', 'surprised', 'wow'] },
    sad: { emoji: '😢', names: ['crying face', 'sad', 'cry'] },
    thinking: { emoji: '🤔', names: ['thinking face', 'thinking', 'hmm'] },
    thumbsdown: { emoji: '👎', names: ['thumbs down'] },
  };

  const findReaction = (key) => {
    const r = REACTIONS[key];
    if (!r) return null;
    const direct = bySelector(`[data-emoji="${r.emoji}"]`)();
    if (direct) return direct.closest('button, [role="button"]') || direct;
    for (const el of allButtons()) {
      if (!isVisible(el)) continue;
      const l = label(el);
      if (l === r.emoji || l.includes(r.emoji) || r.names.includes(l)) return el;
      if (el.textContent.trim() === r.emoji) return el;
      const img = el.querySelector('img[alt]');
      if (img && (img.alt === r.emoji || r.names.includes(img.alt.toLowerCase()))) return el;
    }
    return null;
  };

  // Read on/off state off an element. null means "can't tell".
  const isMuted = (el) => (el ? el.getAttribute('data-is-muted') === 'true' : null);
  const labelStartsWith = (el, prefix) => (el ? label(el).startsWith(prefix) : null);

  const readState = () => {
    const mic = find.mic();
    const cam = find.camera();
    const hand = find.hand();
    const captions = find.captions();
    return {
      inCall: !!find.leave(),
      micOn: mic ? !isMuted(mic) : null,
      camOn: cam ? !isMuted(cam) : null,
      handRaised: hand ? labelStartsWith(hand, 'lower hand') : null,
      captionsOn: captions ? labelStartsWith(captions, 'turn off captions') : null,
    };
  };

  globalThis.MeetDom = { find, findReaction, REACTIONS, readState, isMuted, isVisible };
})();
