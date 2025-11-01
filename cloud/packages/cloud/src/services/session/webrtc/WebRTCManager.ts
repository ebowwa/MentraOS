import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from "werift";
import { UserSession } from "../UserSession";
import { SdpOffer, IceCandidate, CloudToGlassesMessageType } from "@mentra/sdk";
import { Logger } from "pino";
import { logger as rootLogger } from "../../logging/pino-logger";

export class WebRTCManager {
  private session: UserSession;
  private readonly logger: Logger;
  public pc: RTCPeerConnection;
  private remoteIceCandidates: RTCIceCandidate[] = [];
  private turnCredential = process.env.TURN_CREDENTIAL;

  constructor(session: UserSession) {
    this.session = session;
    this.logger = rootLogger.child({
      service: "WebRTCManager",
      userId: session.userId,
    });
    this.pc = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.relay.metered.ca:80",
        },
        {
          urls: "turn:global.relay.metered.ca:80",
          username: "7e7947a3a273be9fb3d69365",
          credential: this.turnCredential,
        },
        {
          urls: "turn:global.relay.metered.ca:80?transport=tcp",
          username: "7e7947a3a273be9fb3d69365",
          credential: this.turnCredential,
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: "7e7947a3a273be9fb3d69365",
          credential: this.turnCredential,
        },
        {
          urls: "turns:global.relay.metered.ca:443?transport=tcp",
          username: "7e7947a3a273be9fb3d69365",
          credential: this.turnCredential,
        },
      ],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
    });
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.logger.debug(
          { candidate: event.candidate, service: "WebRTCManager" },
          "ICE candidate generated",
        );
        this.session.websocket.send(
          JSON.stringify({
            type: CloudToGlassesMessageType.SERVER_ICE_CANDIDATE,
            candidate: event.candidate,
          }),
        );
      }
    };
  }

  public dispose() {
    this.pc.close();
  }

  public async addClientIceCandidate(message: IceCandidate) {
    this.logger.debug(
      { message, service: "WebRTCManager" },
      "ICE candidate received from glasses",
    );
    if (this.pc.remoteDescription) {
      this.logger.debug(
        { message, service: "WebRTCManager" },
        "ICE candidate added to remote description",
      );
      this.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    } else {
      this.logger.debug(
        { message, service: "WebRTCManager" },
        "ICE candidate will be processed later",
      );
      this.remoteIceCandidates.push(new RTCIceCandidate(message.candidate));
    }
  }

  public async acceptOffer(message: SdpOffer) {
    this.logger.debug(
      { message, service: "WebRTCManager" },
      "SDP offer received from glasses",
    );
    const sdpType = message.sdp.type;
    const sdp = message.sdp.sdp;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp, sdpType));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.processCandidates();
    return answer;
  }

  private async processCandidates() {
    this.logger.debug(
      { service: "WebRTCManager" },
      "Processing candidates: ",
      this.remoteIceCandidates.length,
    );
    for (const candidate of this.remoteIceCandidates) {
      await this.pc.addIceCandidate(candidate);
    }
    this.remoteIceCandidates = [];
  }
}
