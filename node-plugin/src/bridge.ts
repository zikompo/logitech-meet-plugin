import { randomUUID } from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';

// The Chrome extension connects to this port. The C# plugin uses 47832, so
// both plugins can be installed at the same time.
export const NODE_PLUGIN_PORT = 47831;

const COMMAND_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 20_000; // under 30s so the extension's service worker stays alive

export type MeetState = {
  inCall: boolean;
  micOn: boolean | null;
  camOn: boolean | null;
  handRaised: boolean | null;
  captionsOn: boolean | null;
};

type ExtensionMessage =
  | { type: 'hello'; version?: string }
  | { type: 'pong' }
  | { type: 'state'; state: MeetState }
  | { type: 'result'; id: string; ok: boolean; error?: string };

type Pending = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type Client = {
  socket: WebSocket;
  connectedAt: number;
  state: MeetState | null;
};

// Local WebSocket server that the "Meet Control for Logitech" extension
// connects to. Commands go out to the extension; results and Meet state come back.
export class MeetBridge {
  private readonly clients = new Set<Client>();
  private readonly pending = new Map<string, Pending>();

  constructor(port = NODE_PLUGIN_PORT) {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port,
      // Only browser extensions may connect; this blocks ordinary web pages.
      verifyClient: ({ origin }: { origin: string }) => typeof origin === 'string' && origin.startsWith('chrome-extension://'),
    });
    server.on('connection', (socket) => this.onConnection(socket));
    server.on('error', (error) => console.error(`[meet-bridge] server error on :${port}:`, error.message));
    server.on('listening', () => console.log(`[meet-bridge] waiting for the Meet extension on ws://127.0.0.1:${port}`));

    setInterval(() => {
      for (const client of this.clients) send(client.socket, { type: 'ping' });
    }, PING_INTERVAL_MS).unref();
  }

  async send(command: string): Promise<void> {
    const client = this.pickClient();
    if (!client) throw new Error('The Meet Control extension is not connected. Is Chrome open with the extension loaded?');

    const id = randomUUID();
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for "${command}"`));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
    });
    send(client.socket, { type: 'command', id, command });
    return done;
  }

  // Several browsers can run the extension at once (e.g. Chrome and Arc).
  // Prefer the one that reports an active call, then the newest connection.
  private pickClient(): Client | undefined {
    const open = [...this.clients].filter((c) => c.socket.readyState === WebSocket.OPEN);
    open.sort((a, b) => Number(!!b.state?.inCall) - Number(!!a.state?.inCall) || b.connectedAt - a.connectedAt);
    return open[0];
  }

  private onConnection(socket: WebSocket) {
    const client: Client = { socket, connectedAt: Date.now(), state: null };
    this.clients.add(client);
    console.log('[meet-bridge] extension connected');

    socket.on('message', (data) => {
      let msg: ExtensionMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === 'state') {
        client.state = msg.state;
      } else if (msg.type === 'result') {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.ok) pending.resolve();
        else pending.reject(new Error(msg.error ?? 'Command failed'));
      }
    });

    socket.on('close', () => {
      this.clients.delete(client);
      console.log('[meet-bridge] extension disconnected');
    });
    socket.on('error', () => socket.close());
  }
}

function send(socket: WebSocket, message: object) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
