// Generates every icon both plugins need from one set of drawings:
//   - colour key icons for the device (Node: package/actionicons, C#: embedded src/Icons)
//   - black single-colour symbols for the Options+ action picker (package/actionsymbols)
// Run with: node tools/make-icons.mjs
// If you add an action to a plugin, add its name to NODE_ACTIONS / CSHARP_SYMBOLS below.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const COLOR = {
  mono: false,
  fg: '#FFFFFF',
  red: '#FF5A5F',
  yellow: '#FFC940',
  face: '#FFCC4D',
  ink: '#664500',
  heart: '#FF5C8A',
  blue: '#5DADEC',
  dim: '#8A8A8A',
};
const MONO = Object.fromEntries(Object.keys(COLOR).map((k) => [k, '#000000']));
MONO.mono = true;

// Fill for "solid" shapes: coloured on the device, outlined in mono symbols.
const solid = (p, color) => (p.mono ? `fill="none" stroke="${p.fg}"` : `fill="${color}" stroke="${p.ink}"`);
const dot = (p, cx, cy) => `<circle cx="${cx}" cy="${cy}" r="1.2" fill="${p.ink}" stroke="none"/>`;
const face = (p, features) =>
  `<circle cx="12" cy="12" r="9" ${p.mono ? `fill="none" stroke="${p.fg}"` : `fill="${p.face}" stroke="none"`}/>` +
  `<g stroke="${p.ink}">${features}</g>`;
const slash = (p) => `<path d="M4 3l16 18" stroke="${p.red}"/>`;

const micBody = (c) =>
  `<g stroke="${c}"><rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></g>`;
const cameraBody = (c) =>
  `<g stroke="${c}"><rect x="2.5" y="6.5" width="13" height="11" rx="2.5"/><path d="M15.5 10.5l5.5-3v9l-5.5-3z"/></g>`;
const handBody = (c) =>
  `<path stroke="${c}" d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a5.5 5.5 0 0 1-4.6-2.5L3.3 15a1.6 1.6 0 0 1 2.6-1.8L8 15.5"/>`;
const thumb =
  'M7.5 10.5V20.5H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM7.5 10.5l3.8-7a2.2 2.2 0 0 1 3.2 2.3L13.8 9.5h5a2 2 0 0 1 2 2.4l-1.4 6.8a2.2 2.2 0 0 1-2.2 1.8H7.5';
const tear = (p, x, y) =>
  `<path d="M${x} ${y}c-1 1.3-1.5 2.2-1.5 2.8a1.5 1.5 0 0 0 3 0c0-.6-.5-1.5-1.5-2.8z" fill="${p.blue}" stroke="${p.mono ? p.fg : 'none'}"/>`;

const ICONS = {
  mic: (p) => micBody(p.fg),
  'mic-off': (p) => micBody(p.red) + slash(p),
  camera: (p) => cameraBody(p.fg),
  'camera-off': (p) => cameraBody(p.red) + slash(p),
  hand: (p) => handBody(p.fg),
  'hand-raised': (p) => handBody(p.yellow) + `<path stroke="${p.yellow}" d="M19.5 3.5l1.5-1.5M20.5 7h2"/>`,
  captions: (p) =>
    `<g stroke="${p.fg}"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M10.5 10a2.2 2.2 0 1 0 0 4M17 10a2.2 2.2 0 1 0 0 4"/></g>`,
  'captions-on': (p) =>
    `<rect x="2.5" y="5" width="19" height="14" rx="2.5" ${p.mono ? `stroke="${p.fg}"` : `fill="${p.fg}" stroke="${p.fg}"`}/>` +
    `<path stroke="${p.mono ? p.fg : '#000000'}" d="M10.5 10a2.2 2.2 0 1 0 0 4M17 10a2.2 2.2 0 1 0 0 4"/>`,
  chat: (p) => `<path stroke="${p.fg}" d="M7 4.5h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9.5L4 20.5V7.5a3 3 0 0 1 3-3z"/>`,
  people: (p) =>
    `<g stroke="${p.fg}"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 13.8a5 5 0 0 1 5.5 5.2"/></g>`,
  share: (p) =>
    `<g stroke="${p.fg}"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4M12 13.5V8M9.5 10.5L12 8l2.5 2.5"/></g>`,
  leave: (p) =>
    `<path stroke="${p.red}" d="M3.5 14.5c5-5 12-5 17 0l-1.8 2.3a1 1 0 0 1-1.3.2l-2.4-1.4a1 1 0 0 1-.5-.9v-2c-2-.7-3-.7-5 0v2a1 1 0 0 1-.5.9L6.6 17a1 1 0 0 1-1.3-.2z"/>`,
  focus: (p) =>
    `<g stroke="${p.fg}"><rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="M2.5 8.5h19M10 12h5v5M15 12l-6 6"/></g>`,

  heart: (p) =>
    `<path d="M12 20.5S3.5 15.5 3.5 9.2A4.7 4.7 0 0 1 12 6.5a4.7 4.7 0 0 1 8.5 2.7c0 6.3-8.5 11.3-8.5 11.3z" ${p.mono ? `fill="none" stroke="${p.fg}"` : `fill="${p.heart}" stroke="none"`}/>` +
    `<path stroke="${p.yellow}" d="M19.5 1.5v3M18 3h3"/>`,
  thumbsup: (p) => `<path ${solid(p, p.face)} d="${thumb}"/>`,
  thumbsdown: (p) => `<path ${solid(p, p.face)} transform="rotate(180 12 12)" d="${thumb}"/>`,
  party: (p) =>
    `<path ${solid(p, p.face)} d="M3.5 20.5L8 8.5l7.5 7.5z"/>` +
    `<path stroke="${p.red}" d="M13 7.5c.5-2 2-3 4-3"/><path stroke="${p.blue}" d="M16.5 11c1.5-.8 3-.8 4.5 0"/>` +
    `<circle cx="11.5" cy="3" r="1" fill="${p.heart}" stroke="none"/><circle cx="20" cy="6" r="1" fill="${p.blue}" stroke="none"/><circle cx="20.5" cy="15" r="1" fill="${p.yellow}" stroke="none"/>`,
  clap: (p) =>
    `<rect ${solid(p, p.face)} x="4.5" y="7" width="7" height="13" rx="3.5" transform="rotate(-18 8 13.5)"/>` +
    `<rect ${solid(p, p.face)} x="11.5" y="7" width="7" height="13" rx="3.5" transform="rotate(18 15 13.5)"/>` +
    `<path stroke="${p.yellow}" d="M5 2.5l1 2M12 1.5V4M19 2.5l-1 2"/>`,
  laugh: (p) =>
    face(p, `<path d="M7.5 10.5q1.5-2 3 0M13.5 10.5q1.5-2 3 0"/><path d="M7 13.5h10a5 5 0 0 1-10 0z" fill="${p.ink}"/>`) +
    tear(p, 4.5, 10.5) +
    tear(p, 19.5, 10.5),
  surprised: (p) =>
    face(p, dot(p, 9, 10) + dot(p, 15, 10) + `<ellipse cx="12" cy="15.5" rx="2" ry="2.6" fill="${p.ink}"/>`),
  sad: (p) => face(p, dot(p, 9, 10) + dot(p, 15, 10) + `<path d="M8.5 16.5q3.5-3 7 0"/>`) + tear(p, 16.5, 11.5),
  thinking: (p) => face(p, dot(p, 9, 10.5) + dot(p, 15, 10.5) + `<path d="M13.5 7.5l3-1M9.5 15.5h4.5"/>`),
};

function svg(key, palette) {
  const body = ICONS[key](palette);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="80" height="80" fill="none" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`
  );
}

function writeAll(dir, entries, palette) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [fileName, key] of entries) {
    if (!ICONS[key]) throw new Error(`No icon named "${key}" (for ${fileName})`);
    writeFileSync(join(dir, `${fileName}.svg`), svg(key, palette));
  }
}

// Node plugin: files are named after each action's `name` (see node-plugin/src/actions.ts).
const NODE_ACTIONS = {
  toggle_mic: 'mic',
  mute_mic: 'mic-off',
  unmute_mic: 'mic',
  toggle_camera: 'camera',
  camera_off: 'camera-off',
  camera_on: 'camera',
  toggle_hand: 'hand',
  leave_call: 'leave',
  share_screen: 'share',
  focus_meet: 'focus',
  toggle_chat: 'chat',
  toggle_people: 'people',
  toggle_captions: 'captions',
  react_heart: 'heart',
  react_thumbsup: 'thumbsup',
  react_party: 'party',
  react_clap: 'clap',
  react_laugh: 'laugh',
  react_surprised: 'surprised',
  react_sad: 'sad',
  react_thinking: 'thinking',
  react_thumbsdown: 'thumbsdown',
};
writeAll(join(root, 'node-plugin/package/actionicons'), Object.entries(NODE_ACTIONS), COLOR);
writeAll(join(root, 'node-plugin/package/actionsymbols'), Object.entries(NODE_ACTIONS), MONO);

// C# plugin key images are chosen at runtime from embedded resources (by icon key).
writeAll(
  join(root, 'csharp-plugin/src/Icons'),
  Object.keys(ICONS).map((k) => [k, k]),
  COLOR,
);

// C# symbols are named <namespace>.<class>[___<parameter>] (see csharp-plugin/src/Actions).
const NS = 'Loupedeck.GoogleMeetPlugin';
const CSHARP_SYMBOLS = {
  [`${NS}.ToggleCommand`]: 'mic',
  [`${NS}.ToggleCommand___toggle-mic`]: 'mic',
  [`${NS}.ToggleCommand___toggle-camera`]: 'camera',
  [`${NS}.ToggleCommand___toggle-hand`]: 'hand',
  [`${NS}.ToggleCommand___toggle-captions`]: 'captions',
  [`${NS}.MeetCommand`]: 'focus',
  [`${NS}.MeetCommand___mic-off`]: 'mic-off',
  [`${NS}.MeetCommand___mic-on`]: 'mic',
  [`${NS}.MeetCommand___camera-off`]: 'camera-off',
  [`${NS}.MeetCommand___camera-on`]: 'camera',
  [`${NS}.MeetCommand___toggle-chat`]: 'chat',
  [`${NS}.MeetCommand___toggle-people`]: 'people',
  [`${NS}.MeetCommand___share-screen`]: 'share',
  [`${NS}.MeetCommand___leave-call`]: 'leave',
  [`${NS}.MeetCommand___focus-meet`]: 'focus',
  [`${NS}.ReactionCommand`]: 'laugh',
  [`${NS}.ReactionCommand___heart`]: 'heart',
  [`${NS}.ReactionCommand___thumbsup`]: 'thumbsup',
  [`${NS}.ReactionCommand___party`]: 'party',
  [`${NS}.ReactionCommand___clap`]: 'clap',
  [`${NS}.ReactionCommand___laugh`]: 'laugh',
  [`${NS}.ReactionCommand___surprised`]: 'surprised',
  [`${NS}.ReactionCommand___sad`]: 'sad',
  [`${NS}.ReactionCommand___thinking`]: 'thinking',
  [`${NS}.ReactionCommand___thumbsdown`]: 'thumbsdown',
  [`${NS}.ReactionDialAdjustment`]: 'laugh',
};
writeAll(join(root, 'csharp-plugin/src/package/actionsymbols'), Object.entries(CSHARP_SYMBOLS), MONO);

console.log(
  `Wrote ${Object.keys(NODE_ACTIONS).length * 2} Node icons, ${Object.keys(ICONS).length} C# key icons, ` +
    `${Object.keys(CSHARP_SYMBOLS).length} C# symbols.`,
);
