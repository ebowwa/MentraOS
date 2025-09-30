package com.augmentos.augmentos_core.enums;

/**
 * Enum representing the types of data required for microphone state changes
 */
public enum SpeechRequiredDataType {
    PCM("pcm"),
    TRANSCRIPTION("transcription"),
    PCM_OR_TRANSCRIPTION("pcm_or_transcription");

    private final String stringValue;

    SpeechRequiredDataType(String stringValue) {
        this.stringValue = stringValue;
    }

    public String getStringValue() {
        return stringValue;
    }

    /**
     * Converts a string value to the corresponding enum value
     * @param value The string value to convert
     * @return The corresponding SpeechRequiredDataType enum value
     * @throws IllegalArgumentException if the string value is not recognized
     */
    public static SpeechRequiredDataType fromString(String value) {
        if (value == null) {
            throw new IllegalArgumentException("SpeechRequiredDataType string value cannot be null");
        }
        
        for (SpeechRequiredDataType type : SpeechRequiredDataType.values()) {
            if (type.stringValue.equals(value)) {
                return type;
            }
        }
        
        throw new IllegalArgumentException("Unknown SpeechRequiredDataType: " + value);
    }

    @Override
    public String toString() {
        return stringValue;
    }
}
