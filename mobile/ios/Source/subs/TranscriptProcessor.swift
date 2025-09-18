import Foundation

class TranscriptProcessor {
    private var maxCharsPerLine: Int
    private var maxLines: Int
    private var lines: [String]
    private var partialText: String
    private var lastUserTranscript: String
    private var finalTranscriptHistory: [String] // Array to store history of final transcripts
    private var maxFinalTranscripts: Int // Max number of final transcripts to keep
    private var isChinese: Bool
    private var currentDisplayLines: [String] // Track current display lines to maintain consistency
    private var lastPartialUpdateTime: TimeInterval = 0
    private let throttleInterval: TimeInterval = 0.3 // 300ms throttle interval
    
    init(maxCharsPerLine: Int, maxLines: Int, maxFinalTranscripts: Int = 3, isChinese: Bool = false) {
        self.maxCharsPerLine = maxCharsPerLine
        self.maxLines = maxLines
        self.lastUserTranscript = ""
        self.lines = []
        self.partialText = ""
        self.finalTranscriptHistory = []
        self.maxFinalTranscripts = maxFinalTranscripts
        self.isChinese = isChinese
        self.currentDisplayLines = []
    }
    
    func processString(_ newText: String?, isFinal: Bool) -> String? {
        let newText = newText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if !isFinal {
            // Store this as the current partial text (overwriting old partial)
            self.partialText = newText
            self.lastUserTranscript = newText
            
            // Combine final history with new partial text
            let combinedText = getCombinedTranscriptHistory() + " " + newText
            self.currentDisplayLines = wrapText(combinedText, maxLength: self.maxCharsPerLine)
            
            // Ensure we have exactly maxLines
            while self.currentDisplayLines.count < self.maxLines {
                self.currentDisplayLines.append("")
            }
            while self.currentDisplayLines.count > self.maxLines {
                self.currentDisplayLines.removeFirst()
            }

            let currentTime = Date().timeIntervalSince1970
            let timeSinceLastUpdate = currentTime - lastPartialUpdateTime
            
            // If less than throttle interval has passed, return nil
            if timeSinceLastUpdate < throttleInterval {
                return nil
            }
            
            // Update the last update time
            lastPartialUpdateTime = currentTime
            
            // Return the processed text
            return self.currentDisplayLines.joined(separator: "\n")
        } else {
            // We have a final text -> clear out the partial text to avoid duplication
            self.partialText = ""
            
            // Add to transcript history when it's a final transcript
            addToTranscriptHistory(newText)
            
            // Use the same wrapping logic as partial to maintain consistency
            let combinedText = getCombinedTranscriptHistory()
            self.currentDisplayLines = wrapText(combinedText, maxLength: self.maxCharsPerLine)
            
            // Ensure we have exactly maxLines
            while self.currentDisplayLines.count < self.maxLines {
                self.currentDisplayLines.append("")
            }
            while self.currentDisplayLines.count > self.maxLines {
                self.currentDisplayLines.removeFirst()
            }
            
            return self.currentDisplayLines.joined(separator: "\n")
        }
    }
    
    // Add to transcript history
    private func addToTranscriptHistory(_ transcript: String) {
        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return } // Don't add empty transcripts
        
        self.finalTranscriptHistory.append(trimmed)
        
        // Ensure we don't exceed maxFinalTranscripts
        while self.finalTranscriptHistory.count > self.maxFinalTranscripts {
            self.finalTranscriptHistory.removeFirst() // Remove oldest transcript
        }
    }
    
    // Get the transcript history
    func getFinalTranscriptHistory() -> [String] {
        return Array(self.finalTranscriptHistory) // Return a copy to prevent external modification
    }
    
    // Get combined transcript history as a single string
    func getCombinedTranscriptHistory() -> String {
        return self.finalTranscriptHistory.joined(separator: " ")
    }
    
    // Method to set max final transcripts
    func setMaxFinalTranscripts(_ maxFinalTranscripts: Int) {
        self.maxFinalTranscripts = maxFinalTranscripts
        // Trim history if needed after changing the limit
        while self.finalTranscriptHistory.count > self.maxFinalTranscripts {
            self.finalTranscriptHistory.removeFirst()
        }
    }
    
    // Get max final transcripts
    func getMaxFinalTranscripts() -> Int {
        return self.maxFinalTranscripts
    }
    
    private func wrapText(_ text: String, maxLength: Int) -> [String] {
        var result: [String] = []
        var remainingText = text
        
        while !remainingText.isEmpty {
            if remainingText.count <= maxLength {
                result.append(remainingText)
                break
            } else {
                var splitIndex = maxLength
                
                if isChinese {
                    // For Chinese text, find the last valid word boundary
                    // Note: For Chinese, we might want to implement a more sophisticated word boundary detection
                    // For now, we'll just split at maxLength for Chinese
                    splitIndex = maxLength
                } else {
                    // For non-Chinese text, find the last space before maxLength
                    let endIndex = remainingText.index(remainingText.startIndex, offsetBy: maxLength, limitedBy: remainingText.endIndex) ?? remainingText.endIndex
                    let searchRange = remainingText.startIndex..<endIndex
                    if let lastSpaceIndex = remainingText.rangeOfCharacter(from: .whitespaces, options: .backwards, range: searchRange)?.lowerBound {
                        splitIndex = remainingText.distance(from: remainingText.startIndex, to: lastSpaceIndex)
                    }
                    // If we didn't find a space, force split
                    if splitIndex == 0 {
                        splitIndex = maxLength
                    }
                }
                
                let splitIndexStr = remainingText.index(remainingText.startIndex, offsetBy: splitIndex)
                let chunk = String(remainingText[..<splitIndexStr]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !chunk.isEmpty {
                    result.append(chunk)
                }
                remainingText = String(remainingText[splitIndexStr...]).trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        
        return result
    }
    
    public func getLastUserTranscript() -> String {
        return self.lastUserTranscript
    }
    
    public func clear() {
        self.lines = []
        self.partialText = ""
        self.finalTranscriptHistory = []
        self.currentDisplayLines = []
        self.lastPartialUpdateTime = 0
    }
    
    public func getMaxCharsPerLine() -> Int {
        return self.maxCharsPerLine
    }
    
    public func getMaxLines() -> Int {
        return self.maxLines
    }
}
