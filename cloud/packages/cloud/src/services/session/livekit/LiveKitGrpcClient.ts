import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { Logger } from "pino";
import UserSession from "../UserSession";
import path from "path";

/**
 * LiveKitGrpcClient - gRPC client for Go livekit-bridge
 *
 * Replaces WebSocket-based LiveKitClient with gRPC bidirectional streaming.
 * - Handles audio streaming to/from LiveKit room via Go bridge
 * - Server-side audio playback (MP3/WAV)
 * - Built-in HTTP/2 flow control and backpressure
 * - No manual reconnection logic (gRPC handles it)
 */

interface JoinRoomParams {
  url: string;
  roomName: string;
  token: string;
  targetIdentity?: string;
}

interface PlayAudioParams {
  requestId: string;
  url: string;
  volume?: number;
  stopOther?: boolean;
}

interface PlayAudioEvent {
  type: "STARTED" | "PROGRESS" | "COMPLETED" | "FAILED";
  requestId: string;
  durationMs?: number;
  positionMs?: number;
  error?: string;
  metadata?: Record<string, string>;
}

export class LiveKitGrpcClient {
  private readonly logger: Logger;
  private readonly userSession: UserSession;
  private readonly bridgeUrl: string;
  private client: any; // LiveKitBridge gRPC client
  private audioStream: grpc.ClientDuplexStream<any, any> | null = null;
  private connected = false;
  private disposed = false;
  private joinedRoom = false;
  private currentParams: JoinRoomParams | null = null;
  private eventHandlers: Map<string, (evt: PlayAudioEvent) => void> = new Map();

  // Endianness handling
  private readonly endianMode: "auto" | "swap" | "off";
  private endianSwapDetermined = false;
  private shouldSwapBytes = false;

  // Audio capture for debugging
  private captureAudio = false;
  private capturedChunks: Buffer[] = [];
  private captureStartTime: number = 0;
  private captureDuration = 5000; // 5 seconds
  private captureFilePath = "";

  constructor(userSession: UserSession, bridgeUrl?: string) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({
      service: "LiveKitGrpcClient",
      feature: "livekit-grpc",
    });

    // Support Unix socket or TCP connection
    // If LIVEKIT_GRPC_SOCKET is set, use Unix socket with unix: prefix
    const socketPath = process.env.LIVEKIT_GRPC_SOCKET;
    if (socketPath) {
      this.bridgeUrl = `unix:${socketPath}`;
    } else {
      this.bridgeUrl =
        bridgeUrl ||
        process.env.LIVEKIT_GRPC_BRIDGE_URL ||
        "livekit-bridge:9090";
    }

    // Initialize endianness mode from environment
    const mode = (process.env.LIVEKIT_PCM_ENDIAN || "auto").toLowerCase();
    this.endianMode = mode as "auto" | "swap" | "off";

    // Enable audio capture if DEBUG_CAPTURE_AUDIO is set
    if (process.env.DEBUG_CAPTURE_AUDIO === "true") {
      this.captureAudio = true;
      const timestamp = Date.now();
      this.captureFilePath = `/tmp/livekit-audio-${this.userSession.userId}-${timestamp}.raw`;
      this.logger.info(
        { feature: "livekit-grpc", path: this.captureFilePath },
        "Audio capture ENABLED - will save first 5 seconds to file",
      );
    }

    // Load proto and create gRPC client
    this.initializeGrpcClient();
  }

  private initializeGrpcClient(): void {
    try {
      // Path to proto file (relative to this file or absolute)
      // Proto file is copied to cloud/packages/cloud/proto/
      const PROTO_PATH = path.resolve(
        __dirname,
        "../../../../proto/livekit_bridge.proto",
      );

      // Load proto definition
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      const livekitProto = (protoDescriptor.mentra as any).livekit.bridge;

      // Create insecure client (internal network or Unix socket)
      // gRPC-JS automatically handles unix: prefix for Unix domain sockets
      this.client = new livekitProto.LiveKitBridge(
        this.bridgeUrl,
        grpc.credentials.createInsecure(),
      );

      this.logger.info(
        {
          bridgeUrl: this.bridgeUrl,
          userId: this.userSession.userId,
          feature: "livekit-grpc",
        },
        "gRPC client initialized",
      );
    } catch (error) {
      this.logger.error(
        { error, bridgeUrl: this.bridgeUrl },
        "Failed to initialize gRPC client",
      );
      throw error;
    }
  }

  async connect(params: JoinRoomParams): Promise<void> {
    if (this.disposed) {
      throw new Error("LiveKitGrpcClient is disposed");
    }

    if (this.joinedRoom) {
      this.logger.warn("Already connected to room, disconnecting first");
      await this.disconnect();
    }

    this.currentParams = params;

    // Join room via gRPC
    await this.joinRoom(params);

    // Start bidirectional audio stream
    await this.startAudioStream();

    this.connected = true;
    this.logger.info(
      {
        room: params.roomName,
        target: params.targetIdentity,
        feature: "livekit-grpc",
      },
      "Connected to LiveKit room via gRPC",
    );
  }

  private async joinRoom(params: JoinRoomParams): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = {
        user_id: this.userSession.userId,
        room_name: params.roomName,
        token: params.token,
        livekit_url: params.url,
        target_identity: params.targetIdentity || this.userSession.userId,
      };

      this.logger.debug(
        {
          request,
          feature: "livekit-grpc",
        },
        "Calling JoinRoom RPC",
      );

      this.client.joinRoom(
        request,
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            this.logger.error(
              {
                error,
                feature: "livekit-grpc",
              },
              "JoinRoom RPC failed",
            );
            reject(error);
            return;
          }

          if (!response.success) {
            const err = new Error(response.error || "Failed to join room");
            this.logger.error(
              {
                response,
                feature: "livekit-grpc",
              },
              "JoinRoom returned failure",
            );
            reject(err);
            return;
          }

          this.joinedRoom = true;
          this.logger.info(
            {
              participantId: response.participant_id,
              participantCount: response.participant_count,
              feature: "livekit-grpc",
            },
            "Joined LiveKit room",
          );
          resolve();
        },
      );
    });
  }

  private async startAudioStream(): Promise<void> {
    if (this.audioStream) {
      this.logger.warn(
        {
          feature: "livekit-grpc",
        },
        "Audio stream already exists, closing first",
      );
      this.audioStream.end();
      this.audioStream = null;
    }

    this.audioStream = this.client.streamAudio();

    // Send initial chunk with user_id to establish stream
    const initialChunk = {
      user_id: this.userSession.userId,
      pcm_data: Buffer.alloc(0), // Empty initial frame
      sample_rate: 16000,
      channels: 1,
      timestamp_ms: Date.now(),
    };

    this.audioStream?.write(initialChunk);

    // Handle incoming audio from LiveKit → TypeScript
    let receivedChunks = 0;
    this.audioStream?.on("data", (chunk: any) => {
      try {
        let pcmData = Buffer.from(chunk.pcm_data);

        // Capture audio for debugging if enabled
        if (this.captureAudio) {
          this.captureAudioData(pcmData, receivedChunks);
        }

        // Handle endianness if needed
        if (this.endianMode !== "off" && pcmData.length >= 2) {
          pcmData = this.handleEndianness(pcmData, receivedChunks);
        }

        receivedChunks++;
        if (receivedChunks % 100 === 0) {
          // Log sample values to verify endianness
          const sampleCount = Math.min(8, Math.floor(pcmData.length / 2));
          const i16 = new Int16Array(
            pcmData.buffer,
            pcmData.byteOffset,
            Math.floor(pcmData.byteLength / 2),
          );
          const headSamples: number[] = Array.from(i16.slice(0, sampleCount));

          this.logger.debug(
            {
              receivedChunks,
              chunkSize: pcmData.length,
              userId: this.userSession.userId,
              headBytes: Array.from(pcmData.slice(0, 10)),
              headSamples,
              feature: "livekit-grpc",
            },
            "Received audio chunks from gRPC bridge",
          );
        }

        // Forward to AudioManager (PCM16LE @ 16kHz, mono)
        this.userSession.audioManager.processAudioData(pcmData);
      } catch (error) {
        this.logger.warn(
          {
            error,
            feature: "livekit-grpc",
          },
          "Failed to process audio chunk from bridge",
        );
      }
    });

    // Handle stream errors
    this.audioStream?.on("error", (error: Error) => {
      this.logger.error(
        {
          error,
          feature: "livekit-grpc",
        },
        "Audio stream error",
      );
      this.connected = false;

      // Attempt reconnection if not disposed
      if (!this.disposed && this.currentParams) {
        this.logger.info(
          {
            feature: "livekit-grpc",
          },
          "Attempting to reconnect after stream error",
        );
        setTimeout(() => {
          if (this.currentParams && !this.disposed) {
            this.connect(this.currentParams).catch((err) => {
              this.logger.error(
                {
                  err,
                  feature: "livekit-grpc",
                },
                "Reconnection failed",
              );
            });
          }
        }, 2000);
      }
    });

    // Handle stream end
    this.audioStream?.on("end", () => {
      this.logger.info(
        {
          feature: "livekit-grpc",
        },
        "Audio stream ended",
      );
      this.connected = false;
      this.audioStream = null;
    });

    this.logger.info(
      {
        userId: this.userSession.userId,
        feature: "livekit-grpc",
      },
      "Audio stream started, listening for audio from bridge",
    );
  }

  /**
   * Capture audio data for debugging
   */
  private captureAudioData(pcmData: Buffer, chunkIndex: number): void {
    if (!this.captureAudio) return;

    // Start capture timer on first chunk
    if (this.capturedChunks.length === 0) {
      this.captureStartTime = Date.now();
      this.logger.info(
        { feature: "livekit-grpc" },
        "Started audio capture (5 seconds)",
      );
    }

    // Check if we've captured enough
    const elapsed = Date.now() - this.captureStartTime;
    if (elapsed > this.captureDuration) {
      // Save and analyze
      this.saveAndAnalyzeCapturedAudio();
      this.captureAudio = false; // Stop capturing
      return;
    }

    // Store the chunk (BEFORE any endianness handling)
    this.capturedChunks.push(Buffer.from(pcmData));

    // Log detailed analysis for first chunk
    if (chunkIndex === 0) {
      this.analyzeFirstChunk(pcmData);
    }
  }

  /**
   * Analyze first audio chunk in detail
   */
  private analyzeFirstChunk(pcmData: Buffer): void {
    this.logger.info(
      {
        feature: "livekit-grpc",
        length: pcmData.length,
        firstBytes: Array.from(pcmData.slice(0, 32)),
      },
      "First audio chunk received - raw bytes",
    );

    // Interpret as little-endian int16
    const asLE = new Int16Array(
      pcmData.buffer,
      pcmData.byteOffset,
      Math.min(16, Math.floor(pcmData.byteLength / 2)),
    );
    const samplesLE = Array.from(asLE);

    // Interpret as big-endian int16 (manually swap)
    const samplesLE_swapped: number[] = [];
    for (let i = 0; i + 1 < Math.min(32, pcmData.length); i += 2) {
      const swapped = (pcmData[i + 1] << 8) | pcmData[i];
      samplesLE_swapped.push(swapped > 32767 ? swapped - 65536 : swapped);
    }

    this.logger.info(
      {
        feature: "livekit-grpc",
        asLittleEndian: samplesLE,
        asBigEndian: samplesLE_swapped,
      },
      "First chunk - interpreted both ways",
    );
  }

  /**
   * Save captured audio to file and analyze
   */
  private saveAndAnalyzeCapturedAudio(): void {
    const fs = require("fs");
    const { execSync } = require("child_process");
    const totalChunks = this.capturedChunks.length;
    const totalBytes = this.capturedChunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    );

    this.logger.info(
      {
        feature: "livekit-grpc",
        chunks: totalChunks,
        totalBytes,
        path: this.captureFilePath,
      },
      "Saving captured audio to file",
    );

    try {
      // Concatenate all chunks
      const allAudio = Buffer.concat(this.capturedChunks);

      // Save raw PCM
      fs.writeFileSync(this.captureFilePath, allAudio);

      // Analyze statistics
      const i16 = new Int16Array(
        allAudio.buffer,
        allAudio.byteOffset,
        Math.floor(allAudio.byteLength / 2),
      );

      let min = 32767;
      let max = -32768;
      let sum = 0;
      let zeros = 0;
      let maxAbsValues = 0;

      for (let i = 0; i < i16.length; i++) {
        const val = i16[i];
        if (val < min) min = val;
        if (val > max) max = val;
        sum += Math.abs(val);
        if (val === 0) zeros++;
        if (Math.abs(val) > 30000) maxAbsValues++;
      }

      const avg = sum / i16.length;
      const zeroPercent = (zeros / i16.length) * 100;
      const maxPercent = (maxAbsValues / i16.length) * 100;

      this.logger.info(
        {
          feature: "livekit-grpc",
          stats: {
            samples: i16.length,
            min,
            max,
            avgAbsolute: Math.round(avg),
            zerosPercent: zeroPercent.toFixed(2),
            maxedOutPercent: maxPercent.toFixed(2),
          },
        },
        "Audio capture complete - statistics",
      );

      // Convert to WAV files automatically
      const leWavPath = this.captureFilePath.replace(".raw", "-le.wav");
      const beWavPath = this.captureFilePath.replace(".raw", "-be.wav");

      try {
        // Convert as little-endian
        execSync(
          `ffmpeg -f s16le -ar 16000 -ac 1 -i ${this.captureFilePath} ${leWavPath} -y 2>/dev/null`,
          { stdio: "ignore" },
        );
        this.logger.info(
          { feature: "livekit-grpc", path: leWavPath },
          "Created little-endian WAV",
        );
      } catch {
        this.logger.warn(
          { feature: "livekit-grpc" },
          "ffmpeg not available - skipping LE WAV",
        );
      }

      try {
        // Convert as big-endian
        execSync(
          `ffmpeg -f s16be -ar 16000 -ac 1 -i ${this.captureFilePath} ${beWavPath} -y 2>/dev/null`,
          { stdio: "ignore" },
        );
        this.logger.info(
          { feature: "livekit-grpc", path: beWavPath },
          "Created big-endian WAV",
        );
      } catch {
        this.logger.warn(
          { feature: "livekit-grpc" },
          "ffmpeg not available - skipping BE WAV",
        );
      }

      // Save analysis to text file
      const analysisPath = this.captureFilePath.replace(".raw", ".txt");
      const qualityAnalysis = this.analyzeAudioQuality(
        min,
        max,
        avg,
        zeroPercent,
        maxPercent,
      );
      const analysis = `
Audio Capture Analysis - STATIC AUDIO DEBUG
============================================
File: ${this.captureFilePath}
Samples: ${i16.length}
Duration: ~${(i16.length / 16000).toFixed(2)} seconds @ 16kHz

Statistics:
-----------
Min value: ${min}
Max value: ${max}
Average absolute: ${Math.round(avg)}
Zeros: ${zeros} (${zeroPercent.toFixed(2)}%)
Maxed out (>30000): ${maxAbsValues} (${maxPercent.toFixed(2)}%)

First 100 samples (as little-endian):
${Array.from(i16.slice(0, 100)).join(", ")}

First 64 bytes (hex):
${Array.from(allAudio.slice(0, 64))
  .map((b) => b.toString(16).padStart(2, "0"))
  .join(" ")}

Analysis:
---------
${qualityAnalysis}

WAV Files (if ffmpeg available):
---------------------------------
${leWavPath} - Little-endian (standard)
${beWavPath} - Big-endian

NEXT STEPS:
-----------
1. Listen to both WAV files (if created)
2. Determine which one sounds clear (not static)
3. Apply the fix:

   If ${leWavPath.split("/").pop()} is clear:
   → Audio is already little-endian (correct)
   → Add to .env: LIVEKIT_PCM_ENDIAN=off

   If ${beWavPath.split("/").pop()} is clear:
   → Audio is big-endian (needs byte swapping)
   → Add to .env: LIVEKIT_PCM_ENDIAN=swap

   If BOTH sound like static:
   → Not an endianness issue
   → Check mobile sends PCM16 format
   → Verify 16kHz mono

4. Restart cloud: docker-compose restart cloud

FILES SAVED:
------------
${this.captureFilePath}
${analysisPath}
${fs.existsSync(leWavPath) ? leWavPath : "(ffmpeg not available)"}
${fs.existsSync(beWavPath) ? beWavPath : "(ffmpeg not available)"}
`;

      fs.writeFileSync(analysisPath, analysis);

      this.logger.info(
        {
          feature: "livekit-grpc",
          rawFile: this.captureFilePath,
          analysisFile: analysisPath,
          leWav: fs.existsSync(leWavPath) ? leWavPath : null,
          beWav: fs.existsSync(beWavPath) ? beWavPath : null,
        },
        "Audio capture complete - files saved",
      );

      // Log to console for easy visibility
      console.log("\n" + "=".repeat(60));
      console.log("AUDIO CAPTURE COMPLETE");
      console.log("=".repeat(60));
      console.log(analysis);
      console.log("=".repeat(60) + "\n");
    } catch (error) {
      this.logger.error(
        { feature: "livekit-grpc", error },
        "Failed to save captured audio",
      );
    }

    // Clear captured data
    this.capturedChunks = [];
  }

  /**
   * Analyze audio quality based on statistics
   */
  private analyzeAudioQuality(
    min: number,
    max: number,
    avg: number,
    zeroPercent: number,
    maxPercent: number,
  ): string {
    const issues: string[] = [];

    if (zeroPercent > 50) {
      issues.push("- TOO MANY ZEROS (>50%) - Likely silence or no audio");
    }

    if (maxPercent > 10) {
      issues.push(
        "- TOO MANY MAXED VALUES (>10%) - Likely clipping or wrong format",
      );
    }

    if (avg < 100) {
      issues.push("- VERY LOW AMPLITUDE (<100) - Audio too quiet or silence");
    }

    if (avg > 20000) {
      issues.push("- VERY HIGH AMPLITUDE (>20000) - Possible clipping");
    }

    if (min === 0 && max === 0) {
      issues.push("- ALL ZEROS - No audio data");
    }

    if (Math.abs(max) > 32000 || Math.abs(min) > 32000) {
      issues.push(
        "- VALUES NEAR LIMITS - Check for clipping or bit depth issues",
      );
    }

    // Check for pattern suggesting wrong endianness
    if (avg < 500 && maxPercent < 1 && zeroPercent < 10) {
      issues.push(
        "- LOW AMPLITUDE BUT NOT SILENCE - Possible endianness issue (try swapping)",
      );
    }

    if (issues.length === 0) {
      return "Audio looks HEALTHY - good amplitude range, no obvious issues";
    } else {
      return "POTENTIAL ISSUES DETECTED:\n" + issues.join("\n");
    }
  }

  /**
   * Handle endianness detection and byte swapping
   */
  private handleEndianness(buf: Buffer, frameCount: number): Buffer {
    // Guard: ensure even-length PCM data
    if ((buf.length & 1) === 1) {
      if (frameCount % 200 === 0) {
        this.logger.warn(
          { feature: "livekit-grpc", rawLen: buf.length },
          "Odd-length PCM payload detected; dropping last byte",
        );
      }
      buf = buf.slice(0, buf.length - 1);
    }

    if (buf.length < 2) {
      return buf;
    }

    // Force swap if mode is "swap" (check FIRST before auto-detection)
    if (this.endianMode === "swap") {
      this.shouldSwapBytes = true;
      this.endianSwapDetermined = true;
    }

    // Detect endianness once in 'auto' mode (only if not already forced)
    if (
      !this.endianSwapDetermined &&
      this.endianMode === "auto" &&
      buf.length >= 16
    ) {
      let oddAreMostlyFFor00 = 0; // count of MSB being 0xFF or 0x00 (sign-extension in BE)
      let evenAreMostlyFFor00 = 0; // count of LSB being 0xFF or 0x00 (sign-extension in LE)
      const pairs = Math.min(16, Math.floor(buf.length / 2));

      for (let i = 0; i < pairs; i++) {
        const b0 = buf[2 * i]; // LSB if LE, MSB if BE
        const b1 = buf[2 * i + 1]; // MSB if LE, LSB if BE
        if (b0 === 0x00 || b0 === 0xff) evenAreMostlyFFor00++;
        if (b1 === 0x00 || b1 === 0xff) oddAreMostlyFFor00++;
      }

      // If upper byte (b1) has more sign-extension pattern than lower byte,
      // it's likely big-endian and needs swapping to little-endian
      if (oddAreMostlyFFor00 >= evenAreMostlyFFor00 + 6) {
        this.shouldSwapBytes = true;
      } else {
        this.shouldSwapBytes = false;
      }

      this.endianSwapDetermined = true;
      this.logger.info(
        {
          feature: "livekit-grpc",
          oddFF00: oddAreMostlyFFor00,
          evenFF00: evenAreMostlyFFor00,
          willSwap: this.shouldSwapBytes,
        },
        "PCM endianness detection result",
      );
    }

    // Perform byte swapping if needed
    if (this.shouldSwapBytes) {
      // Log once to confirm swapping is happening
      if (frameCount === 0) {
        this.logger.info(
          { feature: "livekit-grpc", mode: this.endianMode },
          "SWAPPING BYTES - converting big-endian to little-endian",
        );
      }
      // Create new buffer for swapped data
      const swapped = Buffer.allocUnsafe(buf.length);
      for (let i = 0; i + 1 < buf.length; i += 2) {
        swapped[i] = buf[i + 1];
        swapped[i + 1] = buf[i];
      }
      return swapped;
    }

    if (frameCount === 0) {
      this.logger.info(
        { feature: "livekit-grpc", mode: this.endianMode },
        "NOT SWAPPING BYTES - data is already little-endian",
      );
    }

    return buf;
  }

  /**
   * Send audio chunk to LiveKit room via gRPC stream
   * This is called by TypeScript when we want to send audio TO the bridge
   */
  public sendAudioChunk(pcmData: Buffer): void {
    if (!this.audioStream || this.disposed || !this.connected) {
      return;
    }

    try {
      const chunk = {
        user_id: this.userSession.userId,
        pcm_data: pcmData,
        sample_rate: 16000,
        channels: 1,
        timestamp_ms: Date.now(),
      };

      this.audioStream?.write(chunk);
    } catch (error) {
      this.logger.warn(
        {
          error,
          feature: "livekit-grpc",
        },
        "Failed to send audio chunk to bridge",
      );
    }
  }

  /**
   * Play audio from URL via server-side bridge
   */
  public playAudio(params: PlayAudioParams): void {
    if (!this.client || this.disposed) {
      this.logger.warn(
        {
          feature: "livekit-grpc",
        },
        "Cannot play audio: client not initialized",
      );
      return;
    }

    const request = {
      request_id: params.requestId,
      audio_url: params.url,
      volume: params.volume ?? 1.0,
      stop_other: params.stopOther ?? false,
      user_id: this.userSession.userId,
    };

    this.logger.info(
      {
        request,
        feature: "livekit-grpc",
      },
      "Calling PlayAudio RPC",
    );

    // PlayAudio returns a stream of events
    const stream = this.client.playAudio(request);

    stream.on("data", (event: any) => {
      const playEvent: PlayAudioEvent = {
        type: this.mapEventType(event.type),
        requestId: event.request_id,
        durationMs: event.duration_ms,
        positionMs: event.position_ms,
        error: event.error,
        metadata: event.metadata,
      };

      this.logger.debug(
        {
          event: playEvent,
          feature: "livekit-grpc",
        },
        "PlayAudio event",
      );

      // Notify event handler if registered
      const handler = this.eventHandlers.get(params.requestId);
      if (handler) {
        handler(playEvent);
      }

      // Clean up handler on completion or failure
      if (playEvent.type === "COMPLETED" || playEvent.type === "FAILED") {
        this.eventHandlers.delete(params.requestId);
      }
    });

    stream.on("error", (error: Error) => {
      this.logger.error(
        {
          error,
          requestId: params.requestId,
          feature: "livekit-grpc",
        },
        "PlayAudio stream error",
      );

      const handler = this.eventHandlers.get(params.requestId);
      if (handler) {
        handler({
          type: "FAILED",
          requestId: params.requestId,
          error: error.message,
        });
        this.eventHandlers.delete(params.requestId);
      }
    });

    stream.on("end", () => {
      this.logger.debug(
        {
          requestId: params.requestId,
          feature: "livekit-grpc",
        },
        "PlayAudio stream ended",
      );
    });
  }

  /**
   * Stop audio playback
   */
  public stopAudio(requestId?: string): void {
    if (!this.client || this.disposed) {
      return;
    }

    const request = {
      user_id: this.userSession.userId,
      request_id: requestId || "",
      reason: "User requested stop",
    };

    this.client.stopAudio(
      request,
      (error: grpc.ServiceError | null, response: any) => {
        if (error) {
          this.logger.error(
            {
              error,
              feature: "livekit-grpc",
            },
            "StopAudio RPC failed",
          );
          return;
        }

        this.logger.info(
          {
            stoppedRequestId: response.stopped_request_id,
            feature: "livekit-grpc",
          },
          "Audio playback stopped",
        );
      },
    );
  }

  /**
   * Register event handler for PlayAudio events
   */
  public onPlayAudioEvent(
    requestId: string,
    handler: (evt: PlayAudioEvent) => void,
  ): void {
    this.eventHandlers.set(requestId, handler);
  }

  /**
   * Enable subscription to target identity
   */
  public enableSubscribe(targetIdentity: string): void {
    // In gRPC version, subscription is handled during JoinRoom
    // This method is kept for API compatibility but is a no-op
    this.logger.debug(
      {
        targetIdentity,
        feature: "livekit-grpc",
      },
      "enableSubscribe called (no-op in gRPC version)",
    );
  }

  /**
   * Disable subscription
   */
  public disableSubscribe(): void {
    // In gRPC version, subscription is controlled by stream lifecycle
    // This method is kept for API compatibility but is a no-op
    this.logger.debug(
      {
        feature: "livekit-grpc",
      },
      "disableSubscribe called (no-op in gRPC version)",
    );
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.connected && this.joinedRoom && !!this.audioStream;
  }

  /**
   * Disconnect from room
   */
  public async disconnect(): Promise<void> {
    if (!this.joinedRoom) {
      return;
    }

    // Close audio stream
    if (this.audioStream) {
      this.audioStream.end();
      this.audioStream = null;
    }

    // Leave room
    if (this.client) {
      return new Promise((resolve) => {
        const request = {
          user_id: this.userSession.userId,
          reason: "User disconnected",
        };

        this.client.leaveRoom(
          request,
          (error: grpc.ServiceError | null, _response: any) => {
            if (error) {
              this.logger.error(
                {
                  error,
                  feature: "livekit-grpc",
                },
                "LeaveRoom RPC failed",
              );
            } else {
              this.logger.info(
                {
                  feature: "livekit-grpc",
                },
                "Left LiveKit room",
              );
            }

            this.joinedRoom = false;
            this.connected = false;
            this.currentParams = null;
            resolve();
          },
        );
      });
    }

    this.joinedRoom = false;
    this.connected = false;
    this.currentParams = null;
  }

  /**
   * Dispose of client (cleanup)
   */
  public dispose(): void {
    this.disposed = true;
    void this.disconnect();
    this.eventHandlers.clear();

    if (this.client) {
      // gRPC client doesn't have explicit close, channels are managed automatically
      this.client = null;
    }
  }

  /**
   * Map proto event type to TypeScript enum
   */
  private mapEventType(
    protoType: number,
  ): "STARTED" | "PROGRESS" | "COMPLETED" | "FAILED" {
    switch (protoType) {
      case 0:
        return "STARTED";
      case 1:
        return "PROGRESS";
      case 2:
        return "COMPLETED";
      case 3:
        return "FAILED";
      default:
        return "FAILED";
    }
  }

  /**
   * Legacy compatibility: set event handler (used by old WebSocket client)
   */
  public onEvent(_handler: (evt: any) => void): void {
    // Convert to new event system
    this.logger.debug(
      {
        feature: "livekit-grpc",
      },
      "onEvent called (legacy compatibility mode)",
    );
    // In the new system, events are handled per-request via onPlayAudioEvent
    // This is a simplified compatibility shim
  }

  /**
   * Legacy compatibility: play URL (used by old WebSocket client)
   */
  public playUrl(params: {
    requestId: string;
    url: string;
    volume?: number;
    stopOther?: boolean;
  }): void {
    this.playAudio(params);
  }

  /**
   * Legacy compatibility: stop playback
   */
  public stopPlayback(requestId?: string): void {
    this.stopAudio(requestId);
  }
}

export default LiveKitGrpcClient;
