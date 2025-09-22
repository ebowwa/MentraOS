
import Foundation

class STTTools {
    // MARK: - SherpaOnnxTranscriber / STT Model Management

    static func didReceivePartialTranscription(_ text: String) {
        // Send partial result to server witgetConnectedBluetoothNameh proper formatting
        let transcriptionLanguage = UserDefaults.standard.string(forKey: "STTModelLanguageCode") ?? "en-US"
        Bridge.log("Mentra: Sending partial transcription: \(text), \(transcriptionLanguage)")
        let transcription: [String: Any] = [
            "type": "local_transcription",
            "text": text,
            "isFinal": false,
            "startTime": Int(Date().timeIntervalSince1970 * 1000) - 1000, // 1 second ago
            "endTime": Int(Date().timeIntervalSince1970 * 1000),
            "speakerId": 0,
            "transcribeLanguage": transcriptionLanguage,
            "provider": "sherpa-onnx",
        ]

        Bridge.sendLocalTranscription(transcription: transcription)
    }

    static func didReceiveFinalTranscription(_ text: String) {
        // Send final result to server with proper formatting
        let transcriptionLanguage = UserDefaults.standard.string(forKey: "STTModelLanguageCode") ?? "en-US"
        Bridge.log("Mentra: Sending final transcription: \(text), \(transcriptionLanguage)")
        if !text.isEmpty {
            let transcription: [String: Any] = [
                "type": "local_transcription",
                "text": text,
                "isFinal": true,
                "startTime": Int(Date().timeIntervalSince1970 * 1000) - 2000, // 2 seconds ago
                "endTime": Int(Date().timeIntervalSince1970 * 1000),
                "speakerId": 0,
                "transcribeLanguage": transcriptionLanguage,
                "provider": "sherpa-onnx",
            ]

            Bridge.sendLocalTranscription(transcription: transcription)
        }
    }

    static func setSttModelDetails(_ path: String, _ languageCode: String) {
        UserDefaults.standard.set(path, forKey: "STTModelPath")
        UserDefaults.standard.set(languageCode, forKey: "STTModelLanguageCode")
        UserDefaults.standard.synchronize()
    }

    static func getSttModelPath() -> String {
        return UserDefaults.standard.string(forKey: "STTModelPath") ?? ""
    }

    static func checkSTTModelAvailable() -> Bool {
        guard let modelPath = UserDefaults.standard.string(forKey: "STTModelPath") else {
            return false
        }

        let fileManager = FileManager.default

        // Check for tokens.txt (required for all models)
        let tokensPath = (modelPath as NSString).appendingPathComponent("tokens.txt")
        if !fileManager.fileExists(atPath: tokensPath) {
            return false
        }

        // Check for CTC model
        let ctcModelPath = (modelPath as NSString).appendingPathComponent("model.int8.onnx")
        if fileManager.fileExists(atPath: ctcModelPath) {
            return true
        }

        // Check for transducer model
        let transducerFiles = ["encoder.onnx", "decoder.onnx", "joiner.onnx"]
        for file in transducerFiles {
            let filePath = (modelPath as NSString).appendingPathComponent(file)
            if !fileManager.fileExists(atPath: filePath) {
                return false
            }
        }

        return true
    }

    static func validateSTTModel(_ path: String) -> Bool {
        do {
            let fileManager = FileManager.default

            // Check for tokens.txt (required for all models)
            let tokensPath = (path as NSString).appendingPathComponent("tokens.txt")
            if !fileManager.fileExists(atPath: tokensPath) {
                return false
            }

            // Check for CTC model
            let ctcModelPath = (path as NSString).appendingPathComponent("model.int8.onnx")
            if fileManager.fileExists(atPath: ctcModelPath) {
                return true
            }

            // Check for transducer model
            let transducerFiles = ["encoder.onnx", "decoder.onnx", "joiner.onnx"]
            var allTransducerFilesPresent = true

            for file in transducerFiles {
                let filePath = (path as NSString).appendingPathComponent(file)
                if !fileManager.fileExists(atPath: filePath) {
                    allTransducerFilesPresent = false
                    break
                }
            }

            return allTransducerFilesPresent
        } catch {
            Bridge.log("STT_ERROR: \(error.localizedDescription)")
            return false
        }
    }

    static func extractTarBz2(sourcePath: String, destinationPath: String) -> Bool {
        do {
            let fileManager = FileManager.default

            // Create destination directory if it doesn't exist
            try fileManager.createDirectory(
                atPath: destinationPath,
                withIntermediateDirectories: true,
                attributes: nil
            )

            // Try to read compressed file
            guard let compressedData = try? Data(contentsOf: URL(fileURLWithPath: sourcePath))
            else {
                Bridge.log("EXTRACTION_ERROR: Failed to read compressed file")
                return false
            }

            // Create a temporary directory for extraction
            let tempExtractPath = NSTemporaryDirectory().appending("/\(UUID().uuidString)")
            try fileManager.createDirectory(
                atPath: tempExtractPath,
                withIntermediateDirectories: true,
                attributes: nil
            )

            // Use the Swift TarBz2Extractor with SWCompression
            var extractionError: NSError?
            let success = TarBz2Extractor.extractTarBz2From(
                sourcePath,
                to: destinationPath,
                error: &extractionError
            )

            if !success || extractionError != nil {
                print(
                    "EXTRACTION_ERROR: \(extractionError?.localizedDescription ?? "Failed to extract tar.bz2")"
                )
                return false
            }

            // Rename encoder
            let oldEncoderPath = (destinationPath as NSString).appendingPathComponent(
                "encoder-epoch-99-avg-1.onnx")
            let newEncoderPath = (destinationPath as NSString).appendingPathComponent(
                "encoder.onnx")
            if fileManager.fileExists(atPath: oldEncoderPath) {
                try? fileManager.moveItem(atPath: oldEncoderPath, toPath: newEncoderPath)
            }

            // Rename decoder
            let oldDecoderPath = (destinationPath as NSString).appendingPathComponent(
                "decoder-epoch-99-avg-1.onnx")
            let newDecoderPath = (destinationPath as NSString).appendingPathComponent(
                "decoder.onnx")
            if fileManager.fileExists(atPath: oldDecoderPath) {
                try? fileManager.moveItem(atPath: oldDecoderPath, toPath: newDecoderPath)
            }

            // Rename joiner
            let oldJoinerPath = (destinationPath as NSString).appendingPathComponent(
                "joiner-epoch-99-avg-1.int8.onnx")
            let newJoinerPath = (destinationPath as NSString).appendingPathComponent("joiner.onnx")
            if fileManager.fileExists(atPath: oldJoinerPath) {
                try? fileManager.moveItem(atPath: oldJoinerPath, toPath: newJoinerPath)
            }

            return true
        } catch {
            Bridge.log("EXTRACTION_ERROR: \(error.localizedDescription)")
            return false
        }
    }
}
