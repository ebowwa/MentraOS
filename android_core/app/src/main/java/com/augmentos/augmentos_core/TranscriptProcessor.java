package com.augmentos.augmentos_core;

import java.util.ArrayList;
import java.util.List;

public class TranscriptProcessor {
    private final int maxCharsPerLine;
    private final int maxLines;
    private final List<String> finalTranscriptHistory = new ArrayList<>();
    private final int maxFinalTranscripts;
    private final boolean isChinese;
    private long lastPartialUpdateTime = 0;
    private static final long THROTTLE_INTERVAL_MS = 300; // 300ms throttle interval
    private final List<String> currentDisplayLines = new ArrayList<>();
    private String partialText = "";
    private String lastUserTranscript = "";

    public TranscriptProcessor(int maxCharsPerLine, int maxLines, int maxFinalTranscripts, boolean isChinese) {
        this.maxCharsPerLine = maxCharsPerLine;
        this.maxLines = maxLines;
        this.maxFinalTranscripts = maxFinalTranscripts;
        this.isChinese = isChinese;
    }

    public TranscriptProcessor(int maxCharsPerLine, int maxLines) {
        this(maxCharsPerLine, maxLines, 3, false);
    }

    public String processString(String newText, boolean isFinal) {
        if (newText == null) {
            newText = "";
        }
        newText = newText.trim();

        if (!isFinal) {
            // Store this as the current partial text (overwriting old partial)
            this.partialText = newText;
            this.lastUserTranscript = newText;

            // Combine final history with new partial text
            String combinedText = getCombinedTranscriptHistory() + " " + newText;
            currentDisplayLines.clear();
            currentDisplayLines.addAll(wrapText(combinedText, maxCharsPerLine));

            // Ensure we have exactly maxLines
            while (currentDisplayLines.size() < maxLines) {
                currentDisplayLines.add("");
            }
            while (currentDisplayLines.size() > maxLines) {
                currentDisplayLines.remove(0);
            }

            long currentTime = System.currentTimeMillis();
            long timeSinceLastUpdate = currentTime - lastPartialUpdateTime;

            // If less than throttle interval has passed, return null
            if (timeSinceLastUpdate < THROTTLE_INTERVAL_MS) {
                return null;
            }

            // Update the last update time
            lastPartialUpdateTime = currentTime;

            // Return the processed text
            return String.join("\n", currentDisplayLines);
        } else {
            // We have a final text -> clear out the partial text to avoid duplication
            this.partialText = "";

            // Add to transcript history when it's a final transcript
            addToTranscriptHistory(newText);

            // Use the same wrapping logic as partial to maintain consistency
            String combinedText = getCombinedTranscriptHistory();
            currentDisplayLines.clear();
            currentDisplayLines.addAll(wrapText(combinedText, maxCharsPerLine));

            // Ensure we have exactly maxLines
            while (currentDisplayLines.size() < maxLines) {
                currentDisplayLines.add("");
            }
            while (currentDisplayLines.size() > maxLines) {
                currentDisplayLines.remove(0);
            }

            return String.join("\n", currentDisplayLines);
        }
    }

    private void addToTranscriptHistory(String transcript) {
        if (transcript == null || transcript.trim().isEmpty()) {
            return; // Don't add empty transcripts
        }

        finalTranscriptHistory.add(transcript.trim());

        // Ensure we don't exceed maxFinalTranscripts
        while (finalTranscriptHistory.size() > maxFinalTranscripts) {
            finalTranscriptHistory.remove(0); // Remove oldest transcript
        }
    }

    private String getCombinedTranscriptHistory() {
        return String.join(" ", finalTranscriptHistory);
    }

    private List<String> wrapText(String text, int maxLength) {
        List<String> result = new ArrayList<>();
        if (text == null || text.isEmpty()) {
            return result;
        }

        String[] words = text.split("\\s+");
        StringBuilder currentLine = new StringBuilder();

        for (String word : words) {
            if (currentLine.length() + word.length() + 1 <= maxLength) {
                if (currentLine.length() > 0) {
                    currentLine.append(" ");
                }
                currentLine.append(word);
            } else {
                if (currentLine.length() > 0) {
                    result.add(currentLine.toString());
                }
                currentLine = new StringBuilder(word);
            }
        }

        if (currentLine.length() > 0) {
            result.add(currentLine.toString());
        }

        return result;
    }

    public void clear() {
        finalTranscriptHistory.clear();
        currentDisplayLines.clear();
        partialText = "";
        lastPartialUpdateTime = 0;
    }
}
