// Stand-in for a Logitech plugin, for testing the Chrome extension without the
// Logi Plugin Service. Hosts the same WebSocket server the plugins do and lets
// you type commands.
//
//   cd node-plugin && npm run fake-extension-test            (port 47831)
//   cd node-plugin && npm run fake-extension-test -- 47832   (port 47832, if the Node plugin is running)
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';

// Borrow `ws` from the Node plugin's dependencies.
const require = createRequire(new URL('../node-plugin/package.json', import.meta.url));
const { WebSocketServer } = require('ws');

const port = Number(process.argv[2] ?? 47831);
const COMMANDS = [
  'toggle-mic', 'mic-off', 'mic-on', 'toggle-camera', 'camera-off', 'camera-on', 'toggle-hand',
  'toggle-chat', 'toggle-people', 'toggle-captions', 'share-screen', 'leave-call', 'focus-meet',
  'react:heart', 'react:thumbsup', 'react:party', 'react:clap', 'react:laugh', 'react:surprised',
  'react:sad', 'react:thinking', 'react:thumbsdown',
];

const server = new WebSocketServer({
  host: '127.0.0.1',
  port,
  verifyClient: ({ origin }) => typeof origin === 'string' && origin.startsWith('chrome-extension://'),
});
const clients = new Set();

server.on('listening', () => {
  console.log(`Fake plugin listening on ws://127.0.0.1:${port}. Waiting for the extension…`);
  console.log(`Type a command (or "list"). Leaving the call is a real action. Ctrl+C to quit.\n`);
});
server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is in use (is a plugin running?). Try another: 47831 or 47832.` : err);
  process.exit(1);
});
server.on('connection', (ws, req) => {
  clients.add(ws);
  console.log(`← extension connected (${req.headers.origin})`);
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'result') console.log(msg.ok ? `← ok ${JSON.stringify(msg.state ?? {})}` : `← error: ${msg.error}`);
    else if (msg.type === 'state') console.log(`← state ${JSON.stringify(msg.state)}`);
    else if (msg.type === 'hello') console.log(`← hello from extension v${msg.version}`);
  });
  ws.on('close', () => {
    clients.delete(ws);
    console.log('← extension disconnected');
  });
});

setInterval(() => clients.forEach((ws) => ws.send(JSON.stringify({ type: 'ping' }))), 20_000);

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const command = line.trim();
  if (!command) return;
  if (command === 'list') return console.log(COMMANDS.join('\n'));
  if (clients.size === 0) return console.log('No extension connected yet.');
  console.log(`→ ${command}`);
  for (const ws of clients) ws.send(JSON.stringify({ type: 'command', id: randomUUID(), command }));
});
