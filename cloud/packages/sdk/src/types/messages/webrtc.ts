
import { BaseMessage } from './base';
import { GlassesToCloudMessageType, CloudToGlassesMessageType } from '../message-types';

/**
 * WebRTC capability announcement from client
 */
export interface WebRTCCapability extends BaseMessage {
  type: GlassesToCloudMessageType.WEBRTC_CAPABILITY;
  supported: boolean;
  clientVersion?: string;
  preferredCodec?: string; // 'opus', 'pcm', etc.
}

/**
 * WebRTC offer message (bidirectional)
 */
export interface WebRTCOffer extends BaseMessage {
  type: GlassesToCloudMessageType.WEBRTC_OFFER | CloudToGlassesMessageType.WEBRTC_OFFER;
  sdp: string;
  sessionId: string;
}

/**
 * WebRTC answer message (bidirectional)
 */
export interface WebRTCAnswer extends BaseMessage {
  type: GlassesToCloudMessageType.WEBRTC_ANSWER | CloudToGlassesMessageType.WEBRTC_ANSWER;
  sdp: string;
  sessionId: string;
}

/**
 * WebRTC ICE candidate message (bidirectional)
 */
export interface WebRTCIceCandidate extends BaseMessage {
  type: GlassesToCloudMessageType.WEBRTC_ICE_CANDIDATE | CloudToGlassesMessageType.WEBRTC_ICE_CANDIDATE;
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
  sessionId: string;
}

/**
 * Request to start WebRTC audio streaming
 */
export interface WebRTCAudioStart extends BaseMessage {
  type: GlassesToCloudMessageType.WEBRTC_AUDIO_START;
}

/**
 * Request to stop WebRTC audio streaming
 */
export interface WebRTCAudioStop extends BaseMessage {
  type: GlassesToCloudMessageType.WEBRTC_AUDIO_STOP;
}

/**
 * WebRTC ready confirmation from server
 */
export interface WebRTCReady extends BaseMessage {
  type: CloudToGlassesMessageType.WEBRTC_READY;
  sessionId: string;
  iceServers?: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

/**
 * WebRTC error message from server
 */
export interface WebRTCError extends BaseMessage {
  type: CloudToGlassesMessageType.WEBRTC_ERROR;
  message: string;
  code?: 'INIT_FAILED' | 'NOT_CONNECTED' | 'OFFER_FAILED' | 'ICE_FAILED' | 'UNKNOWN';
}

// Type guards for WebRTC messages
export function isWebRTCCapability(message: any): message is WebRTCCapability {
  return message.type === GlassesToCloudMessageType.WEBRTC_CAPABILITY;
}

export function isWebRTCOffer(message: any): message is WebRTCOffer {
  return message.type === GlassesToCloudMessageType.WEBRTC_OFFER || 
         message.type === CloudToGlassesMessageType.WEBRTC_OFFER;
}

export function isWebRTCAnswer(message: any): message is WebRTCAnswer {
  return message.type === GlassesToCloudMessageType.WEBRTC_ANSWER || 
         message.type === CloudToGlassesMessageType.WEBRTC_ANSWER;
}

export function isWebRTCIceCandidate(message: any): message is WebRTCIceCandidate {
  return message.type === GlassesToCloudMessageType.WEBRTC_ICE_CANDIDATE || 
         message.type === CloudToGlassesMessageType.WEBRTC_ICE_CANDIDATE;
}

export function isWebRTCAudioStart(message: any): message is WebRTCAudioStart {
  return message.type === GlassesToCloudMessageType.WEBRTC_AUDIO_START;
}

export function isWebRTCAudioStop(message: any): message is WebRTCAudioStop {
  return message.type === GlassesToCloudMessageType.WEBRTC_AUDIO_STOP;
}

export function isWebRTCReady(message: any): message is WebRTCReady {
  return message.type === CloudToGlassesMessageType.WEBRTC_READY;
}

export function isWebRTCError(message: any): message is WebRTCError {
  return message.type === CloudToGlassesMessageType.WEBRTC_ERROR;
}