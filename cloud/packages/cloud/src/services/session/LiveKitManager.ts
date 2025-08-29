import { Logger } from 'pino';
import { logger as rootLogger } from '../logging/pino-logger';
import UserSession from './UserSession';
import { AccessToken } from 'livekit-server-sdk';
import LiveKitClientTS from './LiveKitClient';


import dotenv from 'dotenv';
dotenv.config();

export class LiveKitManager {
  private readonly logger: Logger;
  private readonly session: UserSession;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly livekitUrl: string;
  private bridgeClient: LiveKitClientTS | null = null;
  // private micEnabled = false;
  private healthTimer: NodeJS.Timeout | null = null;

  constructor(session: UserSession) {
    this.session = session;
    const startMs = (session as any).startTime instanceof Date ? (session as any).startTime.getTime() : Date.now();
    const lkTraceId = `livekit:${session.userId}:${startMs}`;
    this.logger = rootLogger.child({ service: 'LiveKitManager', userId: session.userId, feature: 'livekit', lkTraceId });
    this.apiKey = process.env.LIVEKIT_API_KEY || '';
    this.apiSecret = process.env.LIVEKIT_API_SECRET || '';
    this.livekitUrl = process.env.LIVEKIT_URL || '';
    this.logger.info({ apiKey: this.apiKey, apiSecret: this.apiSecret, livekitUrl: this.livekitUrl }, "⚡️ LiveKitManager initialized");
    if (!this.apiKey || !this.apiSecret || !this.livekitUrl) {
      this.logger.warn('LIVEKIT env vars are not fully configured');
    }
  }

  getRoomName(): string {
    return this.session.userId;
  }

  getUrl(): string {
    return this.livekitUrl;
  }

  async mintClientPublishToken(): Promise<string | null> {
    if (!this.apiKey || !this.apiSecret) return null;
    try {
      const at = new AccessToken(this.apiKey, this.apiSecret, { identity: this.session.userId, ttl: 300 });
      at.addGrant({ roomJoin: true, canPublish: true, canSubscribe: false, room: this.getRoomName() } as any);
      const token = await at.toJwt();
      this.logger.info({ roomName: this.getRoomName(), token }, 'Minted client publish token');
      return token;
    } catch (error) {
      this.logger.error(error, 'Failed to mint client publish token');
      return null;
    }
  }

  /**
   * Handle LIVEKIT_INIT by preparing subscriber and returning connection info.
   */
  async handleLiveKitInit(): Promise<{ url: string; roomName: string; token: string } | null> {
    const url = this.getUrl();
    const roomName = this.getRoomName();

    // Mint publish token for clients
    const token = await this.mintClientPublishToken();

    if (!url || !roomName || !token) {
      this.logger.warn({ hasUrl: Boolean(url), hasRoom: Boolean(roomName), hasToken: Boolean(token), feature: 'livekit' }, 'LIVEKIT_INFO not ready (missing url/room/token)');
      return null;
    }

    try {
      await this.startBridgeSubscriber({ url, roomName });
    } catch (e) {
      const logger = this.logger.child({feature: "livekit"});
      logger.error(e, 'Failed to start bridge subscriber');
    }

    this.logger.info({ roomName }, 'Returning LiveKit info');
    return { url, roomName, token };
  }

  async mintClientSubscribeToken(): Promise<string | null> {
    if (!this.apiKey || !this.apiSecret) return null;
    try {
      const at = new AccessToken(this.apiKey, this.apiSecret, { identity: this.session.userId, ttl: 300 });
      at.addGrant({ roomJoin: true, canPublish: false, canSubscribe: true, room: this.getRoomName() } as any);
      const token = await at.toJwt();
      this.logger.info({ roomName: this.getRoomName(), token }, 'Minted client subscribe token');
      return token;
    } catch (error) {
      this.logger.error(error, 'Failed to mint client subscribe token');
      return null;
    }
  }

  async mintAgentSubscribeToken(): Promise<string | null> {
    if (!this.apiKey || !this.apiSecret) return null;
    try {
      const at = new AccessToken(this.apiKey, this.apiSecret, { identity: `cloud-agent:${this.session.userId}`, ttl: 60000 });
      at.addGrant({ roomJoin: true, canPublish: false, canSubscribe: true, room: this.getRoomName() } as any);
      const token = await at.toJwt();
      this.logger.info({ roomName: this.getRoomName(), token }, 'Minted agent subscribe token');
      return token;
    } catch (error) {
      this.logger.error(error, 'Failed to mint agent subscribe token');
      return null;
    }
  }

  /**
   * Start subscriber via Go livekit-bridge and stream 16 kHz PCM to AudioManager.
   */
  private async startBridgeSubscriber(info: { url: string; roomName: string }): Promise<void> {
    if (this.bridgeClient && this.bridgeClient.isConnected()) { this.logger.debug('Bridge subscriber already connected'); return; }
    const targetIdentity = this.session.userId; // client publishes as plain userId
    this.bridgeClient = new LiveKitClientTS(this.session);
    const subscribeToken = await this.mintAgentSubscribeToken();
    if (!subscribeToken) { this.logger.warn('Failed to mint subscribe token for bridge subscriber'); return; }
    await this.bridgeClient.connect({ url: info.url, roomName: info.roomName, token: subscribeToken, targetIdentity });
    this.logger.info({ feature: 'livekit', room: info.roomName }, 'Bridge subscriber connected');

    // Start a light health log to keep an eye on connection status
    if (!this.healthTimer) {
      this.healthTimer = setInterval(() => {
        const isConnected = this.bridgeClient?.isConnected() ?? false;
        this.logger.debug({ feature: 'livekit', micEnabled: this.session.microphoneManager.isEnabled(), isConnected }, 'Bridge health');
      }, 10000);
    }
  }

  private async ensureBridgeConnected(): Promise<void> {
    if (this.bridgeClient && this.bridgeClient.isConnected()) return;
    this.logger.info({ feature: 'livekit' }, 'Ensuring bridge subscriber is connected');
    await this.startBridgeSubscriber({ url: this.getUrl(), roomName: this.getRoomName() });
  }

  // Signal from MicrophoneManager
  public onMicStateChange(isOn: boolean): void {
    // this.micEnabled = isOn;
    this.applySubscribeState();
  }

  private applySubscribeState(): void {
    const shouldSubscribe = this.session.microphoneManager.isEnabled();
    this.ensureBridgeConnected()
      .then(() => {
        if (!this.bridgeClient || !this.bridgeClient.isConnected()) {
          this.logger.warn({ feature: 'livekit' }, 'Bridge not connected; cannot toggle subscribe');
          return;
        }
        if (shouldSubscribe) {
          this.logger.info({ feature: 'livekit', target: this.session.userId }, 'Enabling bridge subscribe');
          this.bridgeClient.enableSubscribe(this.session.userId);
        } else {
          this.logger.info({ feature: 'livekit' }, 'Disabling bridge subscribe');
          this.bridgeClient.disableSubscribe();
        }
      })
      .catch((err) => this.logger.error({ feature: 'livekit', err }, 'Failed ensuring bridge connection'));
  }
}

export default LiveKitManager;
