import {RTCPeerConnection, RTCSessionDescription, RTCIceCandidate} from "react-native-webrtc"
import wsManager from "./WebSocketManager"

// Steps:
// Connect to the server.
// create peer connection
// on ice candidates send it to the cloud
// create an offer and wait for it to accept and save the answer.
// create data channel
// send the data
class MentraWebRTCService {
  private pc: RTCPeerConnection | null = null
  private dc: any | null = null
  private ws = wsManager

  constructor() {
    this.ws.on("message", message => {
      this.handle_message(message)
    })
  }

  public async connect() {
    console.log("MentraWebRTCService: connect()")

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {urls: "stun:stun.l.google.com:19302"},
        {urls: "stun:stun1.l.google.com:19302"},
        {urls: "stun:stun2.l.google.com:19302"},
        {urls: "stun:stun3.l.google.com:19302"},
        {urls: "stun:stun4.l.google.com:19302"},
      ],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    })

    peerConnection.addEventListener("connectionstatechange", event => {
      console.log("MentraWebRTCService: Connection state change", event)
      // peerConnection.connectionState
      console.log("MentraWebRTCService: Connection state", peerConnection.connectionState)
    })
    peerConnection.addEventListener("icecandidate", event => {
      console.log("MentraWebRTCService: Ice candidate", event.candidate)
      this.sendIceCandidate(event.candidate)
    })
    peerConnection.addEventListener("iceconnectionstatechange", event => {
      console.log("MentraWebRTCService: Ice connection state change", event)
      console.log("MentraWebRTCService: Ice connection state", peerConnection.iceConnectionState)
    })
    peerConnection.addEventListener("icegatheringstatechange", event => {
      console.log("MentraWebRTCService: Ice gathering state change", event)
      console.log("MentraWebRTCService: Ice gathering state", peerConnection.iceGatheringState)
    })
    peerConnection.addEventListener("negotiationneeded", event => {
      console.log("MentraWebRTCService: Negotiation needed", event)
    })
    peerConnection.addEventListener("signalingstatechange", event => {
      console.log("MentraWebRTCService: Signaling state change", event)
      console.log("MentraWebRTCService: Signaling state", peerConnection.signalingState)
    })
    peerConnection.addEventListener("track", event => {
      console.log("MentraWebRTCService: Track", event)
    })

    this.pc = peerConnection

    const dc = peerConnection.createDataChannel("test")
    // dc.onopen = () => console.log("Data channel open");
    // dc.onmessage = e => console.log("Received message:", e.data);
    this.dc = dc

    dc.addEventListener("open", () => {
      console.log("Data channel open")
    })
    dc.addEventListener("message", event => {
      console.log("Received message:", event.data)
    })

    // create an offer and set the local description
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    console.log("MentraWebRTCService: Offer created", offer)

    this.sendOffer(offer)
  }

  public sendData(data: any) {
    this.dc!.send("Hey data this side!", data)
  }

  private sendIceCandidate(candidate: RTCIceCandidate) {
    this.ws.sendText(JSON.stringify({type: "client_ice_candidate", candidate}))
  }

  private sendOffer(offer: RTCSessionDescription) {
    console.log("MentraWebRTCService: Sending offer", offer)
    this.ws.sendText(JSON.stringify({type: "sdp_offer", sdp: offer}))
  }

  private async handle_message(message: any) {
    console.log("MentraWebRTCService: Received message", message)
    const type = message.type
    if (type === "sdp_answer") {
      console.log("MentraWebRTCService: Setting remote description", message)
      await this.pc!.setRemoteDescription(new RTCSessionDescription(message.sdp))
    } else if (type === "server_ice_candidate") {
      console.log("MentraWebRTCService: Adding ice candidate", message)
      await this.pc!.addIceCandidate(new RTCIceCandidate(message.candidate))
    }
  }

  public async disconnect() {}
}

const webrtcService = new MentraWebRTCService()
export default webrtcService
