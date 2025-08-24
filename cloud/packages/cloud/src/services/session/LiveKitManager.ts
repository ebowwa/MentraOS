import { Logger } from 'pino';
import { logger as rootLogger } from '../logging/pino-logger';
import UserSession from './UserSession';
import { AccessToken } from 'livekit-server-sdk';
// NOTE: We will use the Go livekit-bridge for media. rtc-node is retained here only for types in WIP areas.
import {
  AudioStream,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  TrackKind,
  TrackPublication,
  dispose,
} from '@livekit/rtc-node';
import LiveKitClientTS from './LiveKitClient';


import dotenv from 'dotenv';
dotenv.config();

export class LiveKitManager {
  private readonly logger: Logger;
  private readonly session: UserSession;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly livekitUrl: string;
  private room: any | null = null;
  private sinks: any[] = [];
  private subscriberRunning = false;
  private receivedFrameCount = 0;
  private trackToProcess: string | undefined = undefined;
  private bridgeClient: LiveKitClientTS | null = null;
  private micEnabled = false;

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
      const at = new AccessToken(this.apiKey, this.apiSecret, { identity: `cloud-agent:${this.session.userId}`, ttl: 600 });
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
   * Start a LiveKit subscriber agent for this user session.
   * Subscribes to remote audio and forwards PCM to transcription manager.
   */
  async startSubscriber(): Promise<void> {
    // Legacy rtc-node subscriber (kept for reference/testing). Prefer startBridgeSubscriber.
    this.logger.info('startSubscriber invoked');
    if (this.subscriberRunning) {
      this.logger.debug('LiveKit subscriber already running');
      return;
    }
    const subscribeToken = await this.mintAgentSubscribeToken();
    const url = this.getUrl();
    const roomName = this.getRoomName();
    if (!subscribeToken || !url) {
      this.logger.warn({ hasToken: Boolean(subscribeToken), hasUrl: Boolean(url), roomName }, 'Cannot start LiveKit subscriber (missing url or token)');
      return;
    }

    this.logger.info({ url, roomName, tokenLength: subscribeToken.length }, 'Attempting to connect to LiveKit');

    try {
      // Lazy import livekit-client & wrtc
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      // const livekit = require('livekit-client');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      // const wrtc = require('wrtc');

      this.room = new Room();

      this.logger.info({ url, roomName }, 'Attempting to connect LiveKit subscriber...');

      await this.room.connect(url, subscribeToken, {
        autoSubscribe: true,
        dynacast: true,
        adaptiveStream: true,
        timeout: 5000, // 30 second timeout
        disconnectOnPageHidden: false,
        expWebAudioMix: false,
      });
      this.subscriberRunning = true;
      this.logger.info({ roomName, url }, 'LiveKit subscriber connected');
      let tracks = 0;
      this.room.on(RoomEvent.TrackSubscribed, async (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        tracks++;
        try {
          this.logger.info({ participant: participant.identity, kind: track.kind, trackSid: track.sid }, 'Subscribed to remote track');
          // if (track.kind !== 'audio') return;
          if (track.kind !== TrackKind.KIND_AUDIO) return this.logger.debug({ participant: participant.identity, kind: track.kind, trackSid: track.sid }, 'Ignored non-audio track');
          // const mediaTrack = (track as AudioStreamTrack).mediaStreamTrack;
          // const mediaTrack = track
          // if (!mediaTrack) return;
          const stream = new AudioStream(track);
          this.trackToProcess = track.sid;

          for await (const frame of stream) {
            // if (!this.trackToProcess) {
            //   return;
            // }

            // if (writer == null) {
            //   // create file on first frame
            //   // also guard when track is unsubscribed
            //   writer = fs.createWriteStream('output.wav');
            //   writeWavHeader(writer, frame);
            // }

            // if (writer) {
            // const buf = Buffer.from(frame.data.buffer);
            // console.log('Received audio frame', {
            //   // log the first few bytes of the buffer
            //   buffer: frame.data.buffer.slice(0, 10),
            //   tracks,
            //   sid: track.sid,
            // });
            // LiveKit frames are typically 48kHz mono PCM. Our STT expects 16kHz PCM.
            // Convert to Int16Array, resample to 16kHz if needed, and pass ArrayBuffer onward.
            try {
              const inputRate = (frame as any).sampleRate ?? 48000;
              const inputChannels = (frame as any).channels ?? (frame as any).channelCount ?? 1;

              // Determine incoming sample type and convert to mono Int16
              const samplesAny: any = (frame as any).data ?? frame.data;
              let monoInt16: Int16Array;
              let sampleType: 'int16' | 'float32' | 'unknown' = 'unknown';

              if (samplesAny instanceof Int16Array) {
                sampleType = 'int16';
                if (inputChannels === 1) {
                  monoInt16 = samplesAny;
                } else {
                  // Average to mono
                  const totalFrames = Math.floor(samplesAny.length / inputChannels);
                  monoInt16 = new Int16Array(totalFrames);
                  for (let i = 0; i < totalFrames; i++) {
                    let acc = 0;
                    for (let ch = 0; ch < inputChannels; ch++) acc += samplesAny[i * inputChannels + ch];
                    monoInt16[i] = Math.max(-32768, Math.min(32767, Math.round(acc / inputChannels)));
                  }
                }
              } else if (samplesAny instanceof Float32Array) {
                sampleType = 'float32';
                const totalFrames = Math.floor(samplesAny.length / inputChannels);
                monoInt16 = new Int16Array(totalFrames);
                for (let i = 0; i < totalFrames; i++) {
                  let acc = 0;
                  for (let ch = 0; ch < inputChannels; ch++) acc += samplesAny[i * inputChannels + ch];
                  const avg = acc / inputChannels; // -1..1
                  monoInt16[i] = Math.max(-32768, Math.min(32767, Math.round(avg * 32767)));
                }
              } else if (samplesAny && samplesAny.buffer instanceof ArrayBuffer) {
                // Fallback: assume Int16 layout in buffer
                sampleType = 'unknown';
                const bufView = new Int16Array(samplesAny.buffer, samplesAny.byteOffset || 0, Math.floor((samplesAny.byteLength || samplesAny.buffer.byteLength) / 2));
                if (inputChannels === 1) {
                  monoInt16 = bufView;
                } else {
                  const totalFrames = Math.floor(bufView.length / inputChannels);
                  monoInt16 = new Int16Array(totalFrames);
                  for (let i = 0; i < totalFrames; i++) {
                    let acc = 0;
                    for (let ch = 0; ch < inputChannels; ch++) acc += bufView[i * inputChannels + ch];
                    monoInt16[i] = Math.max(-32768, Math.min(32767, Math.round(acc / inputChannels)));
                  }
                }
              } else {
                // Ultimate fallback to avoid crash
                monoInt16 = new Int16Array(0);
              }

              const targetRate = 16000;

              // Pre-resample energy debug (first ~100ms window)
              const preWindow = Math.min(monoInt16.length, Math.max(1, Math.floor(inputRate / 10)));
              let sumAbsPre = 0, sumSqPre = 0;
              for (let i = 0; i < preWindow; i++) { const v = monoInt16[i]; sumAbsPre += Math.abs(v); sumSqPre += v * v; }
              const meanAbsPre = preWindow ? sumAbsPre / preWindow : 0;
              const rmsPre = preWindow ? Math.sqrt(sumSqPre / preWindow) : 0;

              const pcm16 = inputRate === targetRate
                ? monoInt16
                : this.resampleLinear(monoInt16, inputRate, targetRate);

              const ab = pcm16.buffer.slice(
                pcm16.byteOffset,
                pcm16.byteOffset + pcm16.byteLength,
              ) as ArrayBuffer;

              // Post-resample energy debug (first ~100ms at 16kHz ~ 1600 samples)
              const postWindow = Math.min(pcm16.length, 1600);
              let sumAbs = 0, sumSq = 0;
              for (let i = 0; i < postWindow; i++) { const v = pcm16[i]; sumAbs += Math.abs(v); sumSq += v * v; }
              const meanAbs = postWindow ? sumAbs / postWindow : 0;
              const rms = postWindow ? Math.sqrt(sumSq / postWindow) : 0;

              this.logger.debug({ inputRate, inputChannels, sampleType, meanAbsPre: Number(meanAbsPre.toFixed(1)), rmsPre: Number(rmsPre.toFixed(1)), meanAbs: Number(meanAbs.toFixed(1)), rms: Number(rms.toFixed(1)) }, 'LiveKit frame energy (pre/post resample)');

              this.session.audioManager.processAudioData(ab, /* isLC3 */ false);
            } catch (convErr) {
              this.logger.warn({ err: convErr }, 'Failed to convert/resample LiveKit frame; forwarding raw');
              this.session.audioManager.processAudioData(frame.data.buffer, /* isLC3 */ false);
            }

            // Debug: log every 50 frames to confirm audio flow
            this.receivedFrameCount++;

            if (this.receivedFrameCount % 100 === 0) {
              // console.log('Received audio frame', {
              //   // log the first few bytes of the buffer
              //   buffer: frame.data.buffer.slice(0, 10),
              //   tracks,
              //   sid: track.sid,
              // });
              // convert this to a string: frame.data.buffer.slice(0, 10). then we can log it as main message.
              // Convert first 10 bytes to readable format
              const bufferString = Array.from(new Uint8Array(frame.data.buffer.slice(0, 10))).join(', ');

              this.logger.debug({ feature: "audio", buffer: bufferString }, `Received audio frame [${bufferString}]`);

              this.logger.debug({
                samplesIn: frame.samplesPerChannel * frame.channels,
                sampleRateIn: (frame as any).sampleRate,
                channelCount: frame.channels,
                framesIn: frame.samplesPerChannel,
                bytesOut: frame.data.buffer.byteLength,
                framesReceived: this.receivedFrameCount,
              }, 'LiveKit audio sink received frames');
            }
            // writer.write(buf);
          }
          // }

          // const RTCAudioSink = wrtc?.nonstandard?.RTCAudioSink;
          // if (!RTCAudioSink) {
          //   this.logger.error('RTCAudioSink not available from wrtc');
          //   return;
          // }
          // const sink = new RTCAudioSink(mediaTrack);
          // this.sinks.push(sink);
          // this.logger.info({ participant: participant?.identity, publicationTrackSid: publication?.trackSid }, 'Attached RTCAudioSink to remote audio track');

          // sink.ondata = (data: any) => {
          //   try {
          //     // data: { samples: Int16Array|Float32Array, sampleRate, bitsPerSample, channelCount, numberOfFrames }
          //     const pcm16 = this.ensureInt16Mono(data);
          //     const targetRate = 16000;
          //     const resampled = data.sampleRate === targetRate
          //       ? pcm16
          //       : this.resampleLinear(pcm16, data.sampleRate, targetRate);
          //     const ab = resampled.buffer.slice(
          //       resampled.byteOffset,
          //       resampled.byteOffset + resampled.byteLength,
          //     ) as ArrayBuffer;
          //     // Route through AudioManager to preserve relaying and manager semantics
          //     this.session.audioManager.processAudioData(ab, /* isLC3 */ false);

          //     // Debug: log every 50 frames to confirm audio flow
          //     this.receivedFrameCount++;
          //     if (this.receivedFrameCount % 50 === 0) {
          //       this.logger.debug({
          //         samplesIn: (data.samples && (data.samples.length || (data.numberOfFrames || 0))) || undefined,
          //         sampleRateIn: data.sampleRate,
          //         channelCount: data.channelCount,
          //         framesIn: data.numberOfFrames,
          //         bytesOut: resampled.byteLength,
          //         framesReceived: this.receivedFrameCount,
          //       }, 'LiveKit audio sink received frames');
          //     }
          //   } catch (err) {
          //     this.logger.warn({ err }, 'Error processing audio sink data');
          //   }
          // };
        } catch (e) {
          this.logger.error(e, 'Failed to attach audio sink');
        }
      });

      this.room.on(RoomEvent.TrackUnsubscribed, (_: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        console.log('unsubscribed from track', publication.sid, participant.identity);
        if (publication.sid === this.trackToProcess) {
          this.trackToProcess = undefined;
        }
      });

      this.room.on(RoomEvent.Disconnected, () => {
        this.logger.warn('LiveKit subscriber disconnected');
        this.stopSubscriber();
      });
    } catch (error) {
      this.logger.error(error, 'Error starting LiveKit subscriber');
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
  }

  // Signal from MicrophoneManager
  public onMicStateChange(isOn: boolean): void {
    this.micEnabled = isOn;
    this.applySubscribeState();
  }

  private applySubscribeState(): void {
    const shouldSubscribe = this.micEnabled;
    if (!this.bridgeClient || !this.bridgeClient.isConnected()) return;
    if (shouldSubscribe) {
      this.logger.info('Enabling bridge subscribe');
      this.bridgeClient.enableSubscribe(this.session.userId);
    } else {
      this.logger.info('Disabling bridge subscribe');
      this.bridgeClient.disableSubscribe();
    }
  }

  stopSubscriber(): void {
    try {
      for (const sink of this.sinks) {
        try {
          if (sink?.stop) sink.stop();
        } catch { }
      }
      this.sinks = [];
      if (this.room) {
        try { this.room.disconnect(); } catch { }
      }
    } finally {
      this.room = null;
      this.subscriberRunning = false;
      this.logger.info('LiveKit subscriber stopped');
    }
  }

  private ensureInt16Mono(data: any): Int16Array {
    const channelCount = data.channelCount || 1;
    const bitsPerSample = data.bitsPerSample || 16;
    const samples = data.samples;
    if (bitsPerSample === 16 && channelCount === 1 && samples instanceof Int16Array) {
      return samples;
    }
    // Convert Float32 to Int16
    let mono: Int16Array;
    if (channelCount === 1) {
      if (samples instanceof Float32Array) {
        mono = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) mono[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
      } else {
        mono = samples as Int16Array;
      }
    } else {
      // Average stereo to mono
      const totalFrames = data.numberOfFrames || (samples.length / channelCount);
      mono = new Int16Array(totalFrames);
      for (let i = 0; i < totalFrames; i++) {
        const left = samples[i * channelCount];
        const right = samples[i * channelCount + 1];
        const fl = typeof left === 'number' ? left : Number(left);
        const fr = typeof right === 'number' ? right : Number(right);
        const avg = (fl + fr) / 2;
        mono[i] = Math.max(-32768, Math.min(32767, Math.round(avg * 32767)));
      }
    }
    return mono;
  }

  private resampleLinear(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
    if (fromRate === toRate) return pcm;
    const ratio = fromRate / toRate;
    const outSamples = Math.round(pcm.length / ratio);
    const out = new Int16Array(outSamples);
    for (let i = 0; i < outSamples; i++) {
      const srcIndex = i * ratio;
      const i1 = Math.floor(srcIndex);
      const i2 = Math.min(i1 + 1, pcm.length - 1);
      const s1 = pcm[i1];
      const s2 = pcm[i2];
      const frac = srcIndex - Math.floor(srcIndex);
      out[i] = Math.round(s1 + (s2 - s1) * frac);
    }
    return out;
  }
}

export default LiveKitManager;
