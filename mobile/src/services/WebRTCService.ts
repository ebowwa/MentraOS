import {RTCPeerConnection, RTCSessionDescription, RTCIceCandidate} from "react-native-webrtc"
import wsManager from "./WebSocketManager"
import Constants from "expo-constants"

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
  private offerCreated = false
  private remoteIceCandidates: RTCIceCandidate[] = []
  private turnCredential = Constants.expoConfig?.extra?.TURN_CREDENTIAL

  constructor() {
    this.ws.on("message", message => {
      this.handle_message(message)
    })
  }

  public async connect() {
    console.log("MentraWebRTCService: connect()")

    const peerConnection = new RTCPeerConnection({
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
    peerConnection.addEventListener("negotiationneeded", async event => {
      console.log("MentraWebRTCService: Negotiation needed", event)
      // create the offer here
      if (!this.offerCreated) {
        this.offerCreated = true
        const offer = await peerConnection.createOffer()
        console.log("MentraWebRTCService: Offer created", offer)
        await peerConnection.setLocalDescription(offer)
        this.sendOffer(offer)
      }
    })
    peerConnection.addEventListener("signalingstatechange", event => {
      console.log("MentraWebRTCService: Signaling state change", event)
      console.log("MentraWebRTCService: Signaling state", peerConnection.signalingState)
    })
    peerConnection.addEventListener("track", event => {
      console.log("MentraWebRTCService: Track", event)
    })

    this.pc = peerConnection

    const dc = await peerConnection.createDataChannel("test")
    // dc.onopen = () => console.log("Data channel open");
    // dc.onmessage = e => console.log("Received message:", e.data);
    this.dc = dc

    dc.addEventListener("open", () => {
      console.log("Data channel open")
    })
    dc.addEventListener("message", event => {
      console.log("Received message:", event.data)
    })
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
    const type = message.type
    if (type === "sdp_answer") {
      await this.pc!.setRemoteDescription(new RTCSessionDescription(message.sdp))
      this.processCandidates()
    } else if (type === "server_ice_candidate") {
      if (message.candidate) {
        const remoteIceCandidate = new RTCIceCandidate(message.candidate)
        if (!this.pc!.remoteDescription) {
          this.remoteIceCandidates.push(remoteIceCandidate)
        } else {
          await this.pc!.addIceCandidate(remoteIceCandidate)
        }
      }
    }
  }

  private processCandidates() {
    console.log("MentraWebRTCService: Processing remote ice candidates: ", this.remoteIceCandidates.length)
    for (const candidate of this.remoteIceCandidates) {
      this.pc!.addIceCandidate(candidate)
    }
    this.remoteIceCandidates = []
  }

  public async disconnect() {}
}

const webrtcService = new MentraWebRTCService()
export default webrtcService
