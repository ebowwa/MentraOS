import { Logger } from 'pino';
import crypto from 'crypto';

export interface RtmpRelayEndpoint {
  relayId: string;
  rtmpUrl: string;
  hlsBaseUrl?: string;
  hostname: string;
  port: number;
}

/**
 * Service to manage RTMP relay endpoints
 */
export class RtmpRelayService {
  private logger: Logger;
  private relays: RtmpRelayEndpoint[] = [];
  
  constructor(logger: Logger) {
    this.logger = logger.child({ service: 'RtmpRelayService' });
    this.initializeRelays();
  }
  
  private initializeRelays() {
    // Use environment variable or default to US Central relay
    const relayUrls = process.env.RTMP_RELAY_URLS?.split(',') || [
      'rtmp-relay-uscentral.mentra.glass:1935'
    ];
    
    // HLS base URLs (comma-separated, matching relay URLs)
    const hlsUrls = process.env.RTMP_RELAY_HLS_URLS?.split(',') || [];
    
    this.relays = relayUrls.map((url, index) => {
      const [hostname, port] = url.split(':');
      
      // If HLS URL is provided, use it; otherwise construct from hostname
      const hlsBaseUrl = hlsUrls[index] || `http://${hostname}:8888`;
      
      return {
        relayId: `relay-${index}`,
        hostname,
        port: parseInt(port) || 1935,
        rtmpUrl: `rtmp://${hostname}:${port}`,
        hlsBaseUrl
      };
    });
    
    this.logger.info({ 
      relayCount: this.relays.length,
      relays: this.relays 
    }, 'Initialized relay endpoints');
  }
  
  /**
   * Get relay endpoint for a user
   * Uses consistent hashing to assign users to relays
   */
  getRelayForUser(userId: string): RtmpRelayEndpoint {
    if (this.relays.length === 0) {
      throw new Error('No relay endpoints configured');
    }
    
    // For single relay, just return it
    if (this.relays.length === 1) {
      return this.relays[0];
    }
    
    // Consistent hashing for multiple relays
    const hash = crypto.createHash('md5').update(userId).digest();
    const index = hash.readUInt32BE(0) % this.relays.length;
    return this.relays[index];
  }
  
  /**
   * Build RTMP URL for glasses to connect to relay
   */
  buildRelayUrl(userId: string, streamId: string): string {
    const relay = this.getRelayForUser(userId);
    // Replace @ with - in userId for MediaMTX compatibility
    const sanitizedUserId = userId.replace('@', '-');
    const url = `${relay.rtmpUrl}/live/${sanitizedUserId}/${streamId}`;
    
    this.logger.debug({ 
      userId, 
      sanitizedUserId,
      streamId, 
      relay: relay.relayId,
      url 
    }, 'Built relay URL for stream');
    
    return url;
  }
  
  /**
   * Get all configured relays (for monitoring)
   */
  getRelays(): RtmpRelayEndpoint[] {
    return [...this.relays];
  }
}