//
//  SpeechRequiredDataType.swift
//  AugmentOS
//
//  Created by Yash Agarwal on 7/23/25.
//

import Foundation

/**
 * Enum representing the types of data required for speech processing
 * Matches the Android SpeechRequiredDataType enum
 */
enum SpeechRequiredDataType: String, CaseIterable {
    case PCM = "pcm"
    case TRANSCRIPTION = "transcription" 
    case PCM_OR_TRANSCRIPTION = "pcm_or_transcription"
    
    /**
     * Convert from string value to enum
     * @param value The string value to convert
     * @return The corresponding enum value, or nil if not found
     */
    static func fromString(_ value: String) -> SpeechRequiredDataType? {
        return SpeechRequiredDataType(rawValue: value)
    }
    
    /**
     * Convert enum to string value
     * @return The string representation of the enum
     */
    func toString() -> String {
        return self.rawValue
    }
    
    /**
     * Convert array of strings to array of enums
     * @param stringArray Array of string values
     * @return Array of enum values, filtering out invalid strings
     */
    static func fromStringArray(_ stringArray: [String]) -> [SpeechRequiredDataType] {
        return stringArray.compactMap { fromString($0) }
    }
    
    /**
     * Convert array of enums to array of strings
     * @param enumArray Array of enum values
     * @return Array of string values
     */
    static func toStringArray(_ enumArray: [SpeechRequiredDataType]) -> [String] {
        return enumArray.map { $0.toString() }
    }
}
