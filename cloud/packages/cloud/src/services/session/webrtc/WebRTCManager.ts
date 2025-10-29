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

  constructor(session: UserSession) {
    this.session = session;
    this.logger = rootLogger.child({
      service: "WebRTCManager",
      userId: session.userId,
    });
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
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
    this.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
  }

  public async acceptOffer(message: SdpOffer) {
    this.logger.debug(
      { message, service: "WebRTCManager" },
      "SDP offer received from glasses",
    );
    const sdpType = message.sdp.type;
    const sdp = message.sdp.sdp;
    this.pc.setRemoteDescription(new RTCSessionDescription(sdp, sdpType));
    const answer = await this.pc.createAnswer();
    this.pc.setLocalDescription(answer);
    return answer;
  }
}
