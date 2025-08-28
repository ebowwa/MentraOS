import WebSocket from 'ws';
import { Logger } from 'pino';
import UserSession from './UserSession';

export interface BridgeOptions {
  bridgeUrl?: string; // ws://host:8080/ws
}

/**
 * LiveKitClient (TS) - Thin client that talks to Go livekit-bridge over WebSocket.
 * - Joins a LiveKit room via bridge
 * - Enables subscribe to a target publisher identity
 * - Streams 16 kHz PCM16 frames (10 ms, 320 bytes) back to AudioManager
 */
export class LiveKitClient {
  private readonly logger: Logger;
  private readonly userSession: UserSession;
  private readonly bridgeUrl: string;
  private ws: WebSocket | null = null;
  private connected = false;
  private frameCount = 0;
  private lastParams: { url: string; roomName: string; token: string; targetIdentity?: string } | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private manualClose = false;

  constructor(userSession: UserSession, opts?: BridgeOptions) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ service: 'LiveKitClientTS' });
    this.bridgeUrl = opts?.bridgeUrl || process.env.LIVEKIT_GO_BRIDGE_URL || 'ws://livekit-bridge:8080/ws';
  }

  async connect(params: { url: string; roomName: string; token: string; targetIdentity?: string }): Promise<void> {
    if (this.ws) await this.close();

    const userId = `cloud-agent:${this.userSession.userId}`;
    // Ensure /ws path is present
    const base = this.bridgeUrl.endsWith('/ws') ? this.bridgeUrl : `${this.bridgeUrl.replace(/\/$/, '')}/ws`;
    const wsUrl = `${base}?userId=${encodeURIComponent(userId)}`;
    this.logger.info({ wsUrl, room: params.roomName, target: params.targetIdentity }, 'Connecting to livekit-bridge');

    this.ws = new WebSocket(wsUrl);
    this.manualClose = false;
    this.lastParams = params;
    this.frameCount = 0;

    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('bridge ws timeout')), 8000);
      this.ws!.once('open', () => {
        clearTimeout(to);
        this.logger.debug({ feature: 'livekit', wsUrl }, 'Bridge WS open (server)');
        resolve();
      });
      this.ws!.once('error', (err) => { clearTimeout(to); reject(err as any); });
    });

    this.connected = true;
    let i = 0;

    // Wire message handler before sending commands
    this.ws.on('message', (data: WebSocket.RawData) => {
      if (Buffer.isBuffer(data)) {
        // PCM16 @ 16kHz, 10 ms (320 bytes) expected
        try {
          // const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          // print first 10 bytes.
          i++;
          this.frameCount++;
          if (i % 20 === 0) {
            this.logger.debug({ feature: 'livekit', data: data.slice(0, 10) }, 'Received PCM16 frame');
          }
          this.userSession.audioManager.processAudioData(data, /* isLC3 */ false);
        } catch (err) {
          this.logger.warn(err, 'Failed to forward PCM16 frame');
        }
      } else {
        try {
          const evt = JSON.parse((data as any).toString());
          if (evt?.type && evt?.type !== 'connected') {
            this.logger.debug({ feature: 'livekit', evt }, '[LiveKitClient] Bridge event');
          }
        } catch { }
      }
    });

    // Lifecycle: close/error
    this.ws.on('close', (code: number, reason: Buffer) => {
      this.logger.warn({ feature: 'livekit', code, reason: reason?.toString() }, 'Bridge WS closed (server)');
      this.connected = false;
      this.scheduleReconnect();
    });
    this.ws.on('error', (err) => {
      this.logger.warn({ feature: 'livekit', err }, 'Bridge WS error (server)');
      // keep connected flag; close will also trigger in most cases
    });

    // Join room via bridge
    this.logger.debug({ feature: 'livekit', roomName: params.roomName }, 'Sending join_room to bridge');
    this.ws.send(JSON.stringify({ action: 'join_room', roomName: params.roomName, token: params.token, url: params.url }));

    // Enable subscribe to target identity (publisher) if provided
    this.logger.debug({ feature: 'livekit', targetIdentity: params.targetIdentity || '' }, 'Sending subscribe_enable to bridge');
    this.ws.send(JSON.stringify({ action: 'subscribe_enable', targetIdentity: params.targetIdentity || '' }));

    this.logger.info({ feature: 'livekit' }, 'LiveKitClientTS connected and subscribe enabled');
  }

  async close(): Promise<void> {
    if (!this.ws) return;
    try {
      try { this.ws.send(JSON.stringify({ action: 'subscribe_disable' })); } catch { }
      this.manualClose = true;
      this.ws.close();
    } catch { }
    this.ws = null;
    this.connected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean { return this.connected && !!this.ws && this.ws.readyState === WebSocket.OPEN; }

  enableSubscribe(targetIdentity: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: 'subscribe_enable', targetIdentity }));
  }

  disableSubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: 'subscribe_disable' }));
  }

  private scheduleReconnect(): void {
    if (this.manualClose) return;
    if (!this.lastParams) return;
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts++));
    this.logger.info({ feature: 'livekit', delayMs: delay }, 'Scheduling bridge reconnect');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.lastParams!).catch((err) => {
        this.logger.error({ feature: 'livekit', err }, 'Bridge reconnect failed');
        this.scheduleReconnect();
      });
    }, delay);
  }
}

export default LiveKitClient;
