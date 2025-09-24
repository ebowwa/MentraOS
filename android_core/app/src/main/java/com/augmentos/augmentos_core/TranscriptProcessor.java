package com.augmentos.augmentos_core;

import java.util.ArrayList;
import java.util.List;

public class TranscriptProcessor {
    private int maxCharsPerLine;
    private boolean isChinese;
    
    private final int maxLines;
    private final List<String> finalTranscriptHistory = new ArrayList<>();
    private final int maxFinalTranscripts;
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

        if (isChinese) {
            // For Chinese text, process character by character
            StringBuilder currentLine = new StringBuilder();
            
            for (int i = 0; i < text.length(); i++) {
                char c = text.charAt(i);
                
                // If adding this character would exceed maxLength, start a new line
                if (currentLine.length() >= maxLength) {
                    result.add(currentLine.toString());
                    currentLine = new StringBuilder();
                }
                currentLine.append(c);
            }
            
            // Add the last line if it's not empty
            if (currentLine.length() > 0) {
                result.add(currentLine.toString());
            }
        } else {
            // For non-Chinese text, use word-based wrapping
            String[] words = text.split("\\s+");
            StringBuilder currentLine = new StringBuilder();

            for (String word : words) {
                // If the word itself is longer than maxLength, split it
                while (word.length() > maxLength) {
                    // Take the first maxLength characters of the word
                    String part = word.substring(0, maxLength);
                    // If we already have content in the current line, add it to result first
                    if (currentLine.length() > 0) {
                        result.add(currentLine.toString());
                        currentLine = new StringBuilder();
                    }
                    // Add this part as a new line
                    result.add(part);
                    // Keep the remaining part of the word
                    word = word.substring(maxLength);
                }
                
                // Now handle the remaining part of the word (or the whole word if it wasn't too long)
                if (currentLine.length() + word.length() + (currentLine.length() > 0 ? 1 : 0) > maxLength) {
                    // If adding this word would exceed maxLength, start a new line
                    if (currentLine.length() > 0) {
                        result.add(currentLine.toString());
                        currentLine = new StringBuilder();
                    }
                } else if (currentLine.length() > 0) {
                    // Otherwise, add a space if this isn't the first word in the line
                    currentLine.append(" ");
                }
                currentLine.append(word);
            }

            // Add the last line if it's not empty
            if (currentLine.length() > 0) {
                result.add(currentLine.toString());
            }
        }

        return result;
    }

    public void modifyLanguage(String language) {
        boolean languageIsChinese = language.equals("zh-CN");
        if (languageIsChinese != this.isChinese) {
            this.isChinese = languageIsChinese;
            if (languageIsChinese) {
                this.maxCharsPerLine = 10;
            } else {
                this.maxCharsPerLine = 30;
            }
            this.clear();
        }
    }

    public void clear() {
        finalTranscriptHistory.clear();
        currentDisplayLines.clear();
        partialText = "";
        lastPartialUpdateTime = 0;
    }
}
