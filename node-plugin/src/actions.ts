import { CommandAction } from '@logitech/plugin-sdk';
import type { MeetBridge } from './bridge';

type ActionSpec = {
  name: string; // also the icon file name in package/actionicons and package/actionsymbols
  displayName: string;
  description: string;
  groupName: string;
  command: string; // command understood by the Chrome extension
};

const CALL = 'Call controls';
const PANELS = 'Panels';
const REACTIONS = 'Reactions';

// Keep in sync with NODE_ACTIONS in tools/make-icons.mjs.
const ACTIONS: ActionSpec[] = [
  { name: 'toggle_mic', displayName: 'Toggle microphone', description: 'Mute or unmute your mic in Meet', groupName: CALL, command: 'toggle-mic' },
  { name: 'mute_mic', displayName: 'Mute microphone', description: 'Mute your mic (does nothing if already muted)', groupName: CALL, command: 'mic-off' },
  { name: 'unmute_mic', displayName: 'Unmute microphone', description: 'Unmute your mic (does nothing if already on)', groupName: CALL, command: 'mic-on' },
  { name: 'toggle_camera', displayName: 'Toggle camera', description: 'Turn your camera on or off in Meet', groupName: CALL, command: 'toggle-camera' },
  { name: 'camera_off', displayName: 'Camera off', description: 'Turn your camera off (does nothing if already off)', groupName: CALL, command: 'camera-off' },
  { name: 'camera_on', displayName: 'Camera on', description: 'Turn your camera on (does nothing if already on)', groupName: CALL, command: 'camera-on' },
  { name: 'toggle_hand', displayName: 'Raise / lower hand', description: 'Raise or lower your hand in Meet', groupName: CALL, command: 'toggle-hand' },
  { name: 'share_screen', displayName: 'Share screen', description: 'Open the Meet screen-sharing picker', groupName: CALL, command: 'share-screen' },
  { name: 'leave_call', displayName: 'Leave call', description: 'Leave the current Meet call', groupName: CALL, command: 'leave-call' },
  { name: 'focus_meet', displayName: 'Show Meet tab', description: 'Bring the Meet tab and its window to the front', groupName: CALL, command: 'focus-meet' },
  { name: 'toggle_chat', displayName: 'Toggle chat', description: 'Open or close the Meet chat panel', groupName: PANELS, command: 'toggle-chat' },
  { name: 'toggle_people', displayName: 'Toggle people', description: 'Open or close the Meet people panel', groupName: PANELS, command: 'toggle-people' },
  { name: 'toggle_captions', displayName: 'Toggle captions', description: 'Turn Meet captions on or off', groupName: PANELS, command: 'toggle-captions' },
  ...(
    [
      ['heart', '💖 Heart'],
      ['thumbsup', '👍 Thumbs up'],
      ['party', '🎉 Celebrate'],
      ['clap', '👏 Clap'],
      ['laugh', '😂 Laugh'],
      ['surprised', '😮 Surprised'],
      ['sad', '😢 Sad'],
      ['thinking', '🤔 Thinking'],
      ['thumbsdown', '👎 Thumbs down'],
    ] as const
  ).map(([key, label]) => ({
    name: `react_${key}`,
    displayName: label,
    description: `Send a ${label.slice(label.indexOf(' ') + 1).toLowerCase()} reaction in Meet`,
    groupName: REACTIONS,
    command: `react:${key}`,
  })),
];

class MeetCommandAction extends CommandAction {
  readonly name: string;
  displayName: string;
  description: string;
  override readonly groupName: string;
  private readonly command: string;

  constructor(
    spec: ActionSpec,
    private readonly bridge: MeetBridge,
  ) {
    super();
    this.name = spec.name;
    this.displayName = spec.displayName;
    this.description = spec.description;
    this.groupName = spec.groupName;
    this.command = spec.command;
  }

  async onKeyDown() {
    try {
      await this.bridge.send(this.command);
    } catch (error) {
      console.warn(`[${this.name}] ${(error as Error).message}`);
    }
  }
}

export function createActions(bridge: MeetBridge): CommandAction[] {
  return ACTIONS.map((spec) => new MeetCommandAction(spec, bridge));
}
