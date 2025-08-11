//
//  MicrophoneManager.swift
//  MentraOS_Manager
//
//  Created on 3/8/25.
//

import AVFoundation
import Combine
import Foundation

protocol MicCallback {
    func onRouteChange(
        reason: AVAudioSession.RouteChangeReason,
        availableInputs: [AVAudioSessionPortDescription]
    )
    func onInterruption(began: Bool)
}

class OnboardMicrophoneManager {
    // MARK: - Properties

    /// Publisher for voice data
    private let voiceDataSubject = PassthroughSubject<Data, Never>()

    private var micCallback: MicCallback?

    /// Public access to voice data stream
    var voiceData: AnyPublisher<Data, Never> {
        return voiceDataSubject.eraseToAnyPublisher()
    }

    /// Audio recording components
    private var audioEngine: AVAudioEngine?
    private var audioSession: AVAudioSession?

    /// Recording state
    private(set) var isRecording = false

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    init() {
        // Set up audio session notification to handle route changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Public Methods

    func setMicCallback(_ callback: MicCallback) {
        micCallback = callback
    }

    /// Check (but don't request) microphone permissions
    /// Permissions are requested by React Native UI, not directly by Swift
    func requestPermissions() async -> Bool {
        // Instead of requesting permissions directly, we just check the current status
        // This maintains compatibility with existing code that calls this method
        return checkPermissions()
    }

    /// Check if microphone permissions have been granted
    func checkPermissions() -> Bool {
        return AVAudioSession.sharedInstance().recordPermission == .granted
    }

    /// Get a list of available audio input devices
    func getAvailableInputDevices() -> [String: String] {
        var deviceInfo = [String: String]()

        // Get current route inputs
        let currentRoute = AVAudioSession.sharedInstance().currentRoute
        for input in currentRoute.inputs {
            deviceInfo[input.uid] = input.portName
        }

        // Also check available inputs which may include disconnected but paired devices
        if let availableInputs = AVAudioSession.sharedInstance().availableInputs {
            for input in availableInputs {
                deviceInfo[input.uid] = input.portName
            }
        }

        return deviceInfo
    }

    /// Manually set AirPods or another specific device as preferred input
    func setPreferredInputDevice(named deviceName: String) -> Bool {
        guard let availableInputs = AVAudioSession.sharedInstance().availableInputs else {
            CoreCommsService.log("No available inputs found")
            return false
        }

        // Find input containing the specified name (case insensitive)
        guard
            let preferredInput = availableInputs.first(where: {
                $0.portName.range(of: deviceName, options: .caseInsensitive) != nil
            })
        else {
            CoreCommsService.log("No input device found containing name: \(deviceName)")
            return false
        }

        do {
            try AVAudioSession.sharedInstance().setPreferredInput(preferredInput)
            CoreCommsService.log("Successfully set preferred input to: \(preferredInput.portName)")
            return true
        } catch {
            CoreCommsService.log("Failed to set preferred input: \(error)")
            return false
        }
    }

    @objc private func handleInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue)
        else {
            return
        }

        switch type {
        case .began:
            CoreCommsService.log("Audio session interrupted - another app took control")
            // Phone call started, pause recording
            if isRecording {
                //              stopRecording()
                micCallback?.onInterruption(began: true)
            }
        case .ended:
            CoreCommsService.log("Audio session interruption ended")
            if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                if options.contains(.shouldResume) {
                    // Safe to resume recording
                    //                  _ = startRecording()
                    micCallback?.onInterruption(began: false)
                }
            }
        @unknown default:
            break
        }
    }

    /// Handle audio route changes (e.g. when connecting/disconnecting AirPods)
    @objc private func handleRouteChange(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue)
        else {
            return
        }

        CoreCommsService.log("handleRouteChange: \(reason) @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@")
        micCallback?.onRouteChange(reason: reason, availableInputs: audioSession?.availableInputs ?? [])

        // // If we're recording and the audio route changed (e.g., AirPods connected/disconnected)
        // if isRecording {
        //   switch reason {
        //   case .newDeviceAvailable, .oldDeviceUnavailable:
        //     // Restart recording to use the new input device
        //     stopRecording()
        //     _ = startRecording()
        //   default:
        //     break
        //   }
        // }

        // Log the current audio route
        logCurrentAudioRoute()
    }

    /// Log the current audio input/output route for debugging
    private func logCurrentAudioRoute() {
        let currentRoute = AVAudioSession.sharedInstance().currentRoute
        var routeDescription = "Current audio route:\n"

        // Log inputs
        if currentRoute.inputs.isEmpty {
            routeDescription += "- No input ports\n"
        } else {
            for (index, port) in currentRoute.inputs.enumerated() {
                routeDescription +=
                    "- Input \(index + 1): \(port.portName) (type: \(port.portType.rawValue))\n"
            }
        }

        // Log outputs
        if currentRoute.outputs.isEmpty {
            routeDescription += "- No output ports"
        } else {
            for (index, port) in currentRoute.outputs.enumerated() {
                routeDescription +=
                    "- Output \(index + 1): \(port.portName) (type: \(port.portType.rawValue))"
                if index < currentRoute.outputs.count - 1 {
                    routeDescription += "\n"
                }
            }
        }

        CoreCommsService.log(routeDescription)
    }

    // MARK: - Private Helpers

    /// Extract Int16 data from a converted buffer
    private func extractInt16Data(from buffer: AVAudioPCMBuffer) -> Data {
        let channelCount = Int(buffer.format.channelCount)
        let frameCount = Int(buffer.frameLength)
        let data = NSMutableData()

        // Safely get int16 data (won't be nil if buffer is in Int16 format)
        guard let int16Data = buffer.int16ChannelData else {
            CoreCommsService.log("Error: Buffer does not contain int16 data")
            return Data()
        }

        let channels = UnsafeBufferPointer(start: int16Data, count: channelCount)

        // Extract each sample
        for frame in 0 ..< frameCount {
            for channel in 0 ..< channelCount {
                var sample = channels[channel][frame]
                data.append(&sample, length: 2)
            }
        }

        return data as Data
    }

    /// Start recording from the available microphone (built-in, Bluetooth, AirPods, etc.)
    func startRecording() -> Bool {
        // Ensure we're not already recording
        if isRecording {
            CoreCommsService.log("MIC: Microphone is already ON!")
            return true
        }

        // Clean up any existing engine
        if let existingEngine = audioEngine {
            existingEngine.stop()
//      existingEngine.inputNode.removeTap(onBus: 0)
            audioEngine = nil
        }

        // Check permissions first
        guard checkPermissions() else {
            CoreCommsService.log("MIC: Microphone permissions not granted")
            return false
        }

        // Set up audio session BEFORE creating the engine
        audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession?.setCategory(
                .playAndRecord,
                mode: .default,
                options: [.allowBluetooth, .defaultToSpeaker]
            )

            // Set preferred input if available
            if let availableInputs = audioSession?.availableInputs, !availableInputs.isEmpty {
                let preferredInput =
                    availableInputs.first { input in
                        input.portType == .bluetoothHFP || input.portType == .bluetoothA2DP
                    } ?? availableInputs.first

                try audioSession?.setPreferredInput(preferredInput)
            }

            // Activate the session BEFORE creating the engine
            try audioSession?.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            CoreCommsService.log("MIC: Failed to set up audio session: \(error)")
            return false
        }

        // NOW create the audio engine
        audioEngine = AVAudioEngine()

        // Safely get the input node
        guard let engine = audioEngine else {
            CoreCommsService.log("MIC: Failed to create audio engine")
            return false
        }

        // The engine must have an input node, but let's be safe
        let inputNode = engine.inputNode

        // Verify the node is valid before accessing its properties
        guard inputNode.engine != nil else {
            CoreCommsService.log("MIC: Input node is not properly attached to engine")
            audioEngine = nil
            return false
        }

        // Check if the node has inputs available
        guard inputNode.numberOfInputs > 0 else {
            CoreCommsService.log("MIC: Input node has no available inputs")
            audioEngine = nil
            return false
        }

        // Get the native input format - typically 48kHz floating point samples
        let inputFormat = inputNode.inputFormat(forBus: 0)
        CoreCommsService.log("MIC: Input format: \(inputFormat)")

        // Set up a converter node if you need 16-bit PCM
        let converter = AVAudioConverter(
            from: inputFormat,
            to: AVAudioFormat(
                commonFormat: .pcmFormatInt16,
                sampleRate: 16000,
                channels: 1,
                interleaved: true
            )!
        )

        guard let converter = converter else {
            CoreCommsService.log("MIC: converter is nil")
            audioEngine = nil
            return false
        }

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
            guard let self = self else { return }

            let frameCount = Int(buffer.frameLength)

            // Calculate the correct output buffer capacity based on sample rate conversion
            // For downsampling from inputFormat.sampleRate to 16000 Hz
            let outputCapacity = AVAudioFrameCount(
                Double(frameCount) * (16000.0 / inputFormat.sampleRate)
            )

            // Create a 16-bit PCM data buffer with adjusted capacity
            let convertedBuffer = AVAudioPCMBuffer(
                pcmFormat: converter.outputFormat,
                frameCapacity: outputCapacity
            )!

            var error: NSError? = nil
            let status = converter.convert(
                to: convertedBuffer,
                error: &error,
                withInputFrom: { _, outStatus in
                    outStatus.pointee = .haveData
                    return buffer
                }
            )

            guard status == .haveData && error == nil else {
                CoreCommsService.log("MIC: Error converting audio buffer: \(error?.localizedDescription ?? "unknown")")
                return
            }

            let pcmData = self.extractInt16Data(from: convertedBuffer)

            // just publish the PCM data, we'll encode it in the AOSManager:
            self.voiceDataSubject.send(pcmData)
        }

        // Start the audio engine
        do {
            try audioEngine?.start()
            isRecording = true
            CoreCommsService.log("MIC: Started recording from: \(getActiveInputDevice() ?? "Unknown device")")
            return true
        } catch {
            CoreCommsService.log("MIC: Failed to start audio engine: \(error)")
            return false
        }
    }

    /// Get the currently active input device name
    func getActiveInputDevice() -> String? {
        let currentRoute = AVAudioSession.sharedInstance().currentRoute
        return currentRoute.inputs.first?.portName
    }

    /// Stop recording from the microphone
    func stopRecording() {
        guard isRecording else {
            return
        }

        // Remove the tap and stop the engine
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()

        // Clean up
        try? audioSession?.setActive(false)
        audioEngine = nil
        audioSession = nil
        isRecording = false

        CoreCommsService.log("MIC: Stopped recording")
    }

    // MARK: - Cleanup

    func cleanup() {
        NotificationCenter.default.removeObserver(self)
        stopRecording()
    }
}
