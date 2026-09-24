# Google Meet for Logitech devices

Control Google Meet from a Logitech MX Creative Console, Loupedeck, or any device that runs Logi Actions plugins. It can mute and unmute, turn the camera on and off, raise your hand, send reactions, open chat and people, toggle captions, share your screen, and leave the call.

Meet runs in a browser tab, so a plugin can't talk to it directly. This repo has three parts:

```
Logi device ─► Logi Plugin Service ─► Node plugin (ws://127.0.0.1:47831) ─┐
                                    └► C#  plugin (ws://127.0.0.1:47832) ─┤
                                                                           ▼
                                      Chrome extension (connects to both ports)
                                                                           ▼
                                      meet.google.com tab: clicks Meet's own buttons,
                                      reports mic/camera/hand state back
```

| Folder | What it is |
| --- | --- |
| [`extension/`](extension) | Chrome/Arc/Brave MV3 extension, shared by both plugins. Plain JS, no build step. |
| [`node-plugin/`](node-plugin) | Plugin built on the **Node.js SDK** (beta). Buttons only, with static icons. |
| [`csharp-plugin/`](csharp-plugin) | Plugin built on the **C# SDK**. Keys show **live state** (red mic when muted, yellow hand when raised), and it adds a **reaction dial**. |
| [`tools/`](tools) | `make-icons.mjs` generates all icons. `fake-plugin.mjs` tests the extension without Logi. |

Both plugins can be installed at once. They use different ports, and the extension serves both.

## 1. Load the extension (required for both plugins)

1. Open `chrome://extensions` (or `arc://extensions`, `brave://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension/` folder.
4. Join or open a Meet. Meet tabs that were already open are picked up automatically.

## 2a. Node.js plugin

The Logi Plugin Service ships its own Node 22 to run plugins. Your local Node is only used for building, and Node 20+ works (npm warns about the engine version, which is harmless).

```bash
cd node-plugin
npm install
npm run watch      # build, link into Logi Plugin Service, rebuild on save; Ctrl+C unlinks
```

`npm run build` + `npm run link` does a one-off build and link, and `npm run unlink` removes it. `npm run build:pack` makes a distributable `.lplug4`.

In Options+, the plugin shows up as **Google Meet (Node)** under *All Actions → Installed Plugins*. Logs are in `~/Library/Application Support/Logi/LogiPluginService/Logs/plugin_logs/GoogleMeetNode.log`.

## 2b. C# plugin

It needs the .NET SDK that matches your Logi Plugin Service. Service 6.4+ is built on **.NET 10**, even though Logitech's docs still say .NET 8. If the build fails with `CS1705 ... System.Runtime, Version=10.0.0.0`, the project's `TargetFramework` doesn't match the service.

```bash
brew install --cask dotnet-sdk
```

```bash
cd csharp-plugin
dotnet build
```

The build writes `GoogleMeetPlugin.link` into `~/Library/Application Support/Logi/LogiPluginService/Plugins/` and asks the service to reload. For hot reload, run `cd csharp-plugin/src && dotnet watch build`. It shows up as **Google Meet (C#)**. Until the extension connects, the plugin shows a warning in Options+.

## Actions

| Action | Node | C# |
| --- | --- | --- |
| Toggle microphone / camera / hand / captions | ✓ | ✓ key image follows live state |
| Mute / unmute mic, camera off / on (idempotent) | ✓ | ✓ |
| Share screen, leave call, show Meet tab | ✓ | ✓ |
| Toggle chat / people panel | ✓ | ✓ |
| Reactions: 💖 👍 🎉 👏 😂 😮 😢 🤔 👎 | ✓ | ✓ |
| Reaction picker dial (turn to choose, press to send) | – | ✓ |

When several Meet tabs are open, commands go to the one that's in a call. If more than one is, the tab you're looking at or used most recently wins.

## Testing the extension without Logi

```bash
cd node-plugin
npm run unlink                       # frees port 47831
npm run fake-extension-test          # then type: toggle-mic, react:clap, list, …
```

The extension's own log is under `chrome://extensions` → *Meet Control for Logitech* → *service worker*.

## When Google changes Meet's UI

Meet has no public API, so the extension clicks Meet's buttons. If an action stops working, the fix almost always goes in **[`extension/meet-dom.js`](extension/meet-dom.js)**, which holds every selector. Each control is a list of matchers tried in order. The language-independent ones come first (for example `[data-is-muted]` on the mic and camera buttons), then English `aria-label` prefixes. To find the new label, right-click the Meet button, choose *Inspect*, and add its `aria-label` prefix to the list. Then reload the extension.

Known limits:
- The fallback labels are English. Other languages work for mic and camera but may need labels added for the rest.
- The Node SDK has no key-up event, so push-to-talk isn't possible there. The C# SDK could add it.

## Icons

All icons come from [`tools/make-icons.mjs`](tools/make-icons.mjs): colour key icons for the devices, plus the black single-colour symbols the Options+ action picker requires. After changing an icon or adding an action, run `node tools/make-icons.mjs`.
