// cloud/packages/cloud/src/services/session/WebRTCManager.ts

/**
 * @fileoverview WebRTCManager handles WebRTC peer connections and signaling
 * within a user session. It manages audio streaming from glasses clients
 * using WebRTC instead of WebSocket binary messages.
 */

import { Logger } from "pino";
import WebSocket from "ws";
import {
    WebRTCCapability,
    WebRTCOffer,
    WebRTCAnswer,
    WebRTCIceCandidate,
    WebRTCAudioStart,
    WebRTCAudioStop,
    WebRTCReady,
    WebRTCError,
    CloudToGlassesMessageType
} from "@mentra/sdk";
import wrtc, { MediaStream, RTCPeerConnection } from '@roamhq/wrtc';

import UserSession from "./UserSession";

/**
 * WebRTC connection state
 */
export type WebRTCConnectionState =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'failed'
    | 'closed';

/**
 * WebRTC audio processing configuration
 */
export interface WebRTCAudioConfig {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
}

/**
 * Manages WebRTC connections and audio streaming for a user session
 */
export class WebRTCManager {
    private userSession: UserSession;
    private logger: Logger;

    // WebRTC state
    private peerConnection?: RTCPeerConnection; // RTCPeerConnection from @roamhq/wrtc
    private audioStream?: MediaStream; // MediaStream
    private connectionState: WebRTCConnectionState = 'disconnected';
    private clientCapable: boolean = false;
    private audioProcessingEnabled: boolean = false;

    // Configuration
    private readonly iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    private readonly audioConfig: WebRTCAudioConfig = {
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16
    };

    constructor(userSession: UserSession) {
        this.userSession = userSession;
        this.logger = userSession.logger.child({ service: "WebRTCManager" });

        this.logger.info("WebRTCManager initialized");
    }

    /**
     * Check if WebRTC is supported and active
     */
    isActive(): boolean {
        return this.clientCapable && this.connectionState === 'connected';
    }

    /**
     * Check if client has WebRTC capability
     */
    isClientCapable(): boolean {
        return this.clientCapable;
    }

    /**
     * Get current connection state
     */
    getConnectionState(): WebRTCConnectionState {
        return this.connectionState;
    }

    /**
     * Handle WebRTC capability message from client
     */
    async handleWebRTCCapability(message: WebRTCCapability): Promise<void> {
        this.logger.info(`Client WebRTC capability: ${message.supported}`, {
            clientVersion: message.clientVersion,
            preferredCodec: message.preferredCodec
        });

        this.clientCapable = message.supported;

        if (message.supported) {
            try {
                await this.initializePeerConnection();

                // Send WebRTC ready message to client
                this.sendWebRTCMessage({
                    type: CloudToGlassesMessageType.WEBRTC_READY,
                    sessionId: this.userSession.sessionId,
                    iceServers: this.iceServers,
                    timestamp: new Date()
                });

                this.logger.info('WebRTC initialized and ready message sent');
            } catch (error) {
                this.logger.error('Failed to initialize WebRTC:', error);
                this.sendWebRTCError('Failed to initialize WebRTC on server', 'INIT_FAILED');
            }
        } else {
            this.logger.info('Client does not support WebRTC, will use WebSocket audio');
        }
    }

    /**
     * Handle WebRTC offer from client
     */
    async handleWebRTCOffer(message: WebRTCOffer): Promise<void> {
        this.logger.info('Processing WebRTC offer from client');

        try {
            if (!this.peerConnection) {
                await this.initializePeerConnection();
            }

            this.connectionState = 'connecting';
            if (!this.peerConnection) {
                throw new Error('Peer connection not initialized for offer');
            }
            // Set remote description
            await this.peerConnection.setRemoteDescription({
                type: 'offer',
                sdp: message.sdp
            });

            // Create answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // Send answer to client
            this.sendWebRTCMessage({
                type: CloudToGlassesMessageType.WEBRTC_ANSWER,
                sdp: answer.sdp,
                sessionId: this.userSession.sessionId,
                timestamp: new Date()
            });

            this.logger.info('WebRTC offer processed and answer sent');
        } catch (error) {
            this.logger.error('Error handling WebRTC offer:', error);
            this.connectionState = 'failed';
            this.sendWebRTCError('Failed to process WebRTC offer', 'OFFER_FAILED');
        }
    }

    /**
     * Handle WebRTC answer from client (if server initiates)
     */
    async handleWebRTCAnswer(message: WebRTCAnswer): Promise<void> {
        this.logger.info('Processing WebRTC answer from client');

        try {
            if (!this.peerConnection) {
                throw new Error('No peer connection exists for answer');
            }

            await this.peerConnection.setRemoteDescription({
                type: 'answer',
                sdp: message.sdp
            });

            this.logger.info('WebRTC answer processed successfully');
        } catch (error) {
            this.logger.error('Error handling WebRTC answer:', error);
            this.connectionState = 'failed';
            this.sendWebRTCError('Failed to process WebRTC answer', 'OFFER_FAILED');
        }
    }

    /**
     * Handle WebRTC ICE candidate from client
     */
    async handleWebRTCIceCandidate(message: WebRTCIceCandidate): Promise<void> {
        this.logger.debug('Processing ICE candidate from client');

        try {
            if (!this.peerConnection) {
                this.logger.warn('Received ICE candidate but no peer connection exists');
                return;
            }

            await this.peerConnection.addIceCandidate({
                candidate: message.candidate,
                sdpMLineIndex: message.sdpMLineIndex,
                sdpMid: message.sdpMid
            });

            this.logger.debug('ICE candidate added successfully');
        } catch (error) {
            this.logger.error('Error adding ICE candidate:', error);
            // Don't fail the entire connection for ICE candidate errors
        }
    }

    /**
     * Handle WebRTC audio start request
     */
    async handleWebRTCAudioStart(message: WebRTCAudioStart): Promise<void> {
        this.logger.info('WebRTC audio start requested');

        if (this.connectionState !== 'connected') {
            this.logger.warn('WebRTC audio start requested but connection not established');
            this.sendWebRTCError('WebRTC not connected', 'NOT_CONNECTED');
            return;
        }

        // Enable audio processing
        this.audioProcessingEnabled = true;

        // Switch AudioManager to WebRTC source
        this.userSession.audioManager.setAudioSource('webrtc');

        this.logger.info(`WebRTC audio streaming started for session ${this.userSession.userId}`);
    }

    /**
     * Handle WebRTC audio stop request
     */
    async handleWebRTCAudioStop(message: WebRTCAudioStop): Promise<void> {
        this.logger.info(`WebRTC audio stop requested for session ${this.userSession.userId}`);

        // Disable audio processing
        this.audioProcessingEnabled = false;

        // Switch AudioManager back to WebSocket for backwards compatibility
        this.userSession.audioManager.setAudioSource('websocket');

        this.logger.info(`WebRTC audio streaming stopped for session ${this.userSession.userId}`);
    }

    /**
     * Initialize WebRTC peer connection
     */
    private async initializePeerConnection(): Promise<void> {
        if (this.peerConnection) {
            this.logger.warn(`WebRTC peer connection already initialized for session ${this.userSession.userId}`);
            return;
        }

        try {
            this.logger.debug(`Initializing WebRTC peer connection for session ${this.userSession.userId}`);
            // Create peer connection with ICE servers
            this.peerConnection = new wrtc.RTCPeerConnection({
                iceServers: this.iceServers
            });

            // Set up event handlers
            this.setupPeerConnectionHandlers();

            this.logger.info(`WebRTC peer connection initialized for session ${this.userSession.userId}`);
        } catch (error) {
            this.logger.error(error, `Failed to initialize WebRTC peer connection for session ${this.userSession.userId}`);
            throw error;
        }
    }

    /**
     * Set up WebRTC peer connection event handlers
     */
    private setupPeerConnectionHandlers(): void {
        if (!this.peerConnection) return;

        // Handle incoming audio tracks
        this.peerConnection.ontrack = (event: any) => {
            this.logger.info({event}, `WebRTC track received for session ${this.userSession.userId}`);
            const [stream] = event.streams;
            this.audioStream = stream;

            // Set up audio processing pipeline
            this.setupAudioProcessing(stream);
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            if (!this.peerConnection) return this.logger.warn('Peer connection not initialized for state change');
            const state = this.peerConnection.connectionState;
            this.logger.info({ state }, `WebRTC connection state changed: ${state} for session ${this.userSession.userId}`);

            switch (state) {
                case 'connected':
                    this.connectionState = 'connected';
                    this.logger.info('WebRTC connection established successfully');
                    break;
                case 'disconnected':
                    this.connectionState = 'disconnected';
                    this.handleConnectionLoss();
                    break;
                case 'failed':
                    this.connectionState = 'failed';
                    this.handleConnectionFailure();
                    break;
                case 'closed':
                    this.connectionState = 'closed';
                    this.handleConnectionClosed();
                    break;
                default:
                    this.connectionState = state as WebRTCConnectionState;
            }
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event: any) => {
            if (event.candidate) {
                this.sendWebRTCMessage({
                    type: CloudToGlassesMessageType.WEBRTC_ICE_CANDIDATE,
                    candidate: event.candidate.candidate,
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                    sdpMid: event.candidate.sdpMid,
                    sessionId: this.userSession.sessionId,
                    timestamp: new Date()
                });
            } else {
                this.logger.debug('ICE candidate gathering completed');
            }
        };

        // Handle ICE connection state changes
        this.peerConnection.oniceconnectionstatechange = () => {
            if (!this.peerConnection) return this.logger.warn('Peer connection not initialized for ICE state change');
            const iceState = this.peerConnection.iceConnectionState;
            this.logger.debug({ iceState }, `ICE connection state: ${iceState} for session ${this.userSession.userId}`);
        };
    }

    /**
     * Set up audio processing pipeline from WebRTC stream
     */
    private setupAudioProcessing(stream: any): void {
        try {
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                this.logger.warn('No audio tracks in WebRTC stream');
                return;
            }

            const audioTrack = audioTracks[0];
            this.logger.info('Setting up WebRTC audio processing pipeline', {
                trackId: audioTrack.id,
                trackLabel: audioTrack.label,
                enabled: audioTrack.enabled
            });

            // TODO: Implement actual audio data extraction from WebRTC stream
            // This will depend on the capabilities of @roamhq/wrtc library
            // For now, this is a placeholder for the audio processing pipeline
            this.processWebRTCAudioTrack(audioTrack);

        } catch (error) {
            this.logger.error('Error setting up WebRTC audio processing:', error);
        }
    }

    /**
     * Process WebRTC audio track and extract audio data
     * TODO: Implement based on @roamhq/wrtc capabilities
     */
    private processWebRTCAudioTrack(audioTrack: any): void {
        this.logger.info('WebRTC audio track processing started');

        // This is where you'll need to implement the actual audio extraction
        // The implementation will depend on how @roamhq/wrtc allows access to raw audio data
        // Possible approaches:
        // 1. Use MediaStreamTrack.applyConstraints() and MediaRecorder
        // 2. Use Web Audio API if supported in Node.js environment
        // 3. Use native audio processing if @roamhq/wrtc provides raw access

        // Placeholder for actual implementation:
        // setInterval(() => {
        //   if (this.audioProcessingEnabled) {
        //     // Extract audio chunk from WebRTC stream
        //     const audioData = extractAudioChunk(audioTrack);
        //     this.userSession.audioManager.processWebRTCAudioData(audioData);
        //   }
        // }, 100); // Process every 100ms
    }

    /**
     * Handle WebRTC connection loss
     */
    private handleConnectionLoss(): void {
        this.logger.warn('WebRTC connection lost');
        this.audioProcessingEnabled = false;

        // Fall back to WebSocket audio
        this.userSession.audioManager.setAudioSource('websocket');

        // TODO: Implement reconnection logic if needed
    }

    /**
     * Handle WebRTC connection failure
     */
    private handleConnectionFailure(): void {
        this.logger.error('WebRTC connection failed');
        this.audioProcessingEnabled = false;

        // Fall back to WebSocket audio
        this.userSession.audioManager.setAudioSource('websocket');

        // Send error to client
        this.sendWebRTCError('WebRTC connection failed', 'ICE_FAILED');
    }

    /**
     * Handle WebRTC connection closed
     */
    private handleConnectionClosed(): void {
        this.logger.info('WebRTC connection closed');
        this.audioProcessingEnabled = false;
        this.audioStream = undefined;

        // Fall back to WebSocket audio
        this.userSession.audioManager.setAudioSource('websocket');
    }

    /**
     * Send WebRTC message to client via WebSocket
     */
    private sendWebRTCMessage(message: any): void {
        if (this.userSession.websocket && this.userSession.websocket.readyState === WebSocket.OPEN) {
            this.userSession.websocket.send(JSON.stringify(message));
        } else {
            this.logger.warn('Cannot send WebRTC message: WebSocket not ready');
        }
    }

    /**
     * Send WebRTC error message to client
     */
    private sendWebRTCError(message: string, code?: string): void {
        const errorMessage: WebRTCError = {
            type: CloudToGlassesMessageType.WEBRTC_ERROR,
            message,
            code: code as any,
            timestamp: new Date()
        };

        this.sendWebRTCMessage(errorMessage);
        this.logger.error(`WebRTC error sent to client: ${message}`, { code });
    }

    /**
     * Get WebRTC manager info for debugging
     */
    getInfo(): object {
        return {
            clientCapable: this.clientCapable,
            connectionState: this.connectionState,
            audioProcessingEnabled: this.audioProcessingEnabled,
            hasAudioStream: !!this.audioStream,
            hasPeerConnection: !!this.peerConnection,
            audioConfig: this.audioConfig
        };
    }

    /**
     * Clean up WebRTC resources
     */
    dispose(): void {
        try {
            this.logger.info("Disposing WebRTCManager");

            // Stop audio processing
            this.audioProcessingEnabled = false;

            // Close peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = undefined;
            }

            // Clear audio stream
            this.audioStream = undefined;

            // Reset state
            this.connectionState = 'closed';
            this.clientCapable = false;

            this.logger.info('WebRTC resources cleaned up');
        } catch (error) {
            this.logger.error(`Error disposing WebRTCManager:`, error);
        }
    }
}

export default WebRTCManager;