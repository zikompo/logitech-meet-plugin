namespace Loupedeck.GoogleMeetPlugin
{
    using System;
    using System.Collections.Concurrent;
    using System.IO;
    using System.Linq;
    using System.Net;
    using System.Net.WebSockets;
    using System.Text;
    using System.Text.Json;
    using System.Threading;
    using System.Threading.Tasks;

    // Local WebSocket server that the "Meet Control for Logitech" Chrome extension
    // connects to. Commands go out to the extension; results and Meet state come back.
    public sealed class MeetBridge : IDisposable
    {
        // The Node.js plugin uses 47831, so both plugins can be installed at once.
        public const Int32 Port = 47832;

        private static readonly TimeSpan CommandTimeout = TimeSpan.FromSeconds(5);
        private static readonly TimeSpan PingInterval = TimeSpan.FromSeconds(20); // keeps the extension's service worker alive
        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

        private readonly HttpListener _listener = new();
        private readonly CancellationTokenSource _cts = new();
        private readonly ConcurrentDictionary<Connection, Byte> _connections = new();
        private readonly ConcurrentDictionary<String, TaskCompletionSource> _pending = new();

        public MeetState State { get; private set; } = MeetState.Empty;

        public Boolean IsExtensionConnected => !this._connections.IsEmpty;

        public event EventHandler StateChanged;

        public event EventHandler ConnectionChanged;

        public void Start()
        {
            this._listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
            this._listener.Start();
            _ = Task.Run(this.AcceptLoopAsync);
            _ = Task.Run(this.PingLoopAsync);
            PluginLog.Info($"Waiting for the Meet extension on ws://127.0.0.1:{Port}");
        }

        // Fire-and-forget for button presses: failures are logged, not thrown.
        public void Run(String command) => _ = this.RunAsync(command);

        public async Task RunAsync(String command)
        {
            try
            {
                await this.SendCommandAsync(command);
            }
            catch (Exception ex)
            {
                PluginLog.Warning($"'{command}' failed: {ex.Message}");
            }
        }

        public async Task SendCommandAsync(String command)
        {
            var connection = this.PickConnection()
                ?? throw new InvalidOperationException("The Meet Control extension is not connected. Is Chrome open with the extension loaded?");

            var id = Guid.NewGuid().ToString();
            var result = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            this._pending[id] = result;
            try
            {
                await connection.SendAsync(new { type = "command", id, command }, this._cts.Token);
                await result.Task.WaitAsync(CommandTimeout, this._cts.Token);
            }
            finally
            {
                this._pending.TryRemove(id, out _);
            }
        }

        public void Dispose()
        {
            this._cts.Cancel();
            foreach (var connection in this._connections.Keys)
            {
                connection.Abort();
            }
            try
            {
                this._listener.Close();
            }
            catch (ObjectDisposedException)
            {
            }
        }

        // Several browsers can run the extension at once (e.g. Chrome and Arc).
        // Prefer the one reporting an active call, then the newest connection.
        private Connection PickConnection() =>
            this._connections.Keys
                .Where(c => c.IsOpen)
                .OrderByDescending(c => c.State.InCall)
                .ThenByDescending(c => c.ConnectedAt)
                .FirstOrDefault();

        private async Task AcceptLoopAsync()
        {
            while (!this._cts.IsCancellationRequested)
            {
                HttpListenerContext context;
                try
                {
                    context = await this._listener.GetContextAsync();
                }
                catch when (this._cts.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception ex)
                {
                    PluginLog.Error(ex, "Accepting a connection failed");
                    continue;
                }
                _ = Task.Run(() => this.HandleContextAsync(context));
            }
        }

        private async Task HandleContextAsync(HttpListenerContext context)
        {
            // Only browser extensions may connect; this blocks ordinary web pages.
            var origin = context.Request.Headers["Origin"];
            if (!context.Request.IsWebSocketRequest || origin?.StartsWith("chrome-extension://", StringComparison.Ordinal) != true)
            {
                context.Response.StatusCode = 403;
                context.Response.Close();
                return;
            }

            WebSocket socket;
            try
            {
                socket = (await context.AcceptWebSocketAsync(subProtocol: null)).WebSocket;
            }
            catch (Exception ex)
            {
                PluginLog.Error(ex, "WebSocket handshake failed");
                return;
            }

            var connection = new Connection(socket);
            this._connections[connection] = 0;
            PluginLog.Info($"Extension connected ({origin})");
            this.ConnectionChanged?.Invoke(this, EventArgs.Empty);
            try
            {
                await this.ReceiveLoopAsync(connection);
            }
            catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
            {
                // connection dropped
            }
            finally
            {
                this._connections.TryRemove(connection, out _);
                connection.Abort();
                PluginLog.Info("Extension disconnected");
                this.RecomputeState();
                this.ConnectionChanged?.Invoke(this, EventArgs.Empty);
            }
        }

        private async Task ReceiveLoopAsync(Connection connection)
        {
            var buffer = new Byte[16 * 1024];
            using var message = new MemoryStream();
            while (connection.IsOpen)
            {
                var received = await connection.Socket.ReceiveAsync(new ArraySegment<Byte>(buffer), this._cts.Token);
                if (received.MessageType == WebSocketMessageType.Close)
                {
                    return;
                }
                message.Write(buffer, 0, received.Count);
                if (!received.EndOfMessage)
                {
                    continue;
                }
                this.HandleMessage(connection, message.ToArray());
                message.SetLength(0);
            }
        }

        private void HandleMessage(Connection connection, Byte[] payload)
        {
            JsonDocument document;
            try
            {
                document = JsonDocument.Parse(payload);
            }
            catch (JsonException)
            {
                return;
            }

            using var _ = document;
            var root = document.RootElement;

            switch (root.TryGetProperty("type", out var type) ? type.GetString() : null)
            {
                case "state":
                    connection.State = root.GetProperty("state").Deserialize<MeetState>(Json) ?? MeetState.Empty;
                    this.RecomputeState();
                    break;

                case "result":
                    var id = root.GetProperty("id").GetString();
                    if (id != null && this._pending.TryRemove(id, out var pending))
                    {
                        if (root.GetProperty("ok").GetBoolean())
                        {
                            pending.TrySetResult();
                        }
                        else
                        {
                            var error = root.TryGetProperty("error", out var e) ? e.GetString() : "Command failed";
                            pending.TrySetException(new InvalidOperationException(error));
                        }
                    }
                    break;
            }
        }

        private void RecomputeState()
        {
            var next = this.PickConnection()?.State ?? MeetState.Empty;
            if (next == this.State)
            {
                return;
            }
            this.State = next;
            this.StateChanged?.Invoke(this, EventArgs.Empty);
        }

        private async Task PingLoopAsync()
        {
            using var timer = new PeriodicTimer(PingInterval);
            try
            {
                while (await timer.WaitForNextTickAsync(this._cts.Token))
                {
                    foreach (var connection in this._connections.Keys)
                    {
                        try
                        {
                            await connection.SendAsync(new { type = "ping" }, this._cts.Token);
                        }
                        catch (Exception ex) when (ex is WebSocketException or ObjectDisposedException)
                        {
                            connection.Abort();
                        }
                    }
                }
            }
            catch (OperationCanceledException)
            {
            }
        }

        private sealed class Connection
        {
            // WebSocket allows only one send at a time.
            private readonly SemaphoreSlim _sendLock = new(1, 1);

            public Connection(WebSocket socket) => this.Socket = socket;

            public WebSocket Socket { get; }

            public DateTime ConnectedAt { get; } = DateTime.UtcNow;

            public MeetState State { get; set; } = MeetState.Empty;

            public Boolean IsOpen => this.Socket.State == WebSocketState.Open;

            public async Task SendAsync(Object message, CancellationToken cancellationToken)
            {
                var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(message, Json));
                await this._sendLock.WaitAsync(cancellationToken);
                try
                {
                    await this.Socket.SendAsync(new ArraySegment<Byte>(bytes), WebSocketMessageType.Text, endOfMessage: true, cancellationToken);
                }
                finally
                {
                    this._sendLock.Release();
                }
            }

            public void Abort() => this.Socket.Abort();
        }
    }
}
