package com.augmentos.asg_client.bluetooth.utils;

import android.util.Log;

import java.util.ArrayList;
import java.util.List;

/**
 * Parser for K900 protocol messages.
 * Uses a CircleBuffer to handle fragmented messages across multiple UART reads.
 */
public class K900MessageParser {
    private static final String TAG = "K900MessageParser";
    
    // K900 Protocol markers
    private static final String PROTOCOL_START_MARKER = "##";
    private static final String PROTOCOL_END_MARKER = "$$";
    private static final byte[] START_MARKER_BYTES = {0x23, 0x23}; // ##
    private static final byte[] END_MARKER_BYTES = {0x24, 0x24};   // $$
    
    // Buffer size for parsing messages
    private static final int BUFFER_SIZE = 8192; // 8KB buffer
    
    private final CircleBuffer mCircleBuffer;
    private final byte[] mTempBuffer;
    
    /**
     * Create a new K900MessageParser
     */
    public K900MessageParser() {
        mCircleBuffer = new CircleBuffer(BUFFER_SIZE);
        mTempBuffer = new byte[BUFFER_SIZE];
        Log.d(TAG, "K900MessageParser initialized with " + BUFFER_SIZE + " byte buffer");
    }
    
    /**
     * Add data to the message buffer
     * @param data Raw data received from UART
     * @param size Size of the data
     * @return true if data was added successfully
     */
    public boolean addData(byte[] data, int size) {
        if (data == null || size <= 0) {
            return false;
        }
        
        // Detailed hex dump of incoming data
        StringBuilder hexDump = new StringBuilder();
        for (int i = 0; i < Math.min(size, 40); i++) { // Limit to first 40 bytes
            hexDump.append(String.format("%02X ", data[i] & 0xFF));
        }
        
        // Check for message markers in this chunk
        boolean hasStart = false;
        int startPos = -1;
        boolean hasEnd = false;
        int endPos = -1;
        
        for (int i = 0; i < size - 1; i++) {
            if (data[i] == START_MARKER_BYTES[0] && data[i+1] == START_MARKER_BYTES[1]) {
                hasStart = true;
                startPos = i;
                Log.d(TAG, "🔍 Found start marker ## at position " + i);
            }
            if (data[i] == END_MARKER_BYTES[0] && data[i+1] == END_MARKER_BYTES[1]) {
                hasEnd = true;
                endPos = i;
                Log.d(TAG, "🔍 Found end marker $$ at position " + i);
            }
        }
        
        if (hasStart && hasEnd && startPos < endPos) {
            // Complete message in a single chunk - just add the exact portion
            Log.d(TAG, "📦 Complete message detected in single chunk from pos " + startPos + " to " + (endPos+2));
            if (mCircleBuffer.getDataLen() > 0) {
                Log.w(TAG, "⚠️ Buffer already contains " + mCircleBuffer.getDataLen() + " bytes from incomplete message - clearing");
                mCircleBuffer.clear();
            }
            // Only add the relevant portion (from ## to $$ inclusive)
            return mCircleBuffer.add(data, startPos, (endPos + 2) - startPos);
        } else if (hasStart) {
            // Found start of a new message
            if (mCircleBuffer.getDataLen() > 0) {
                Log.w(TAG, "⚠️ Found new message start but buffer already contains " + mCircleBuffer.getDataLen() + " bytes - clearing");
                mCircleBuffer.clear();
            }
            Log.d(TAG, "🔄 Adding partial message (start found) - hex: " + hexDump);
            return mCircleBuffer.add(data, startPos, size - startPos);
        } else if (hasEnd && mCircleBuffer.getDataLen() > 0) {
            // Found end of a message and buffer already has content
            Log.d(TAG, "🔄 Adding end portion of fragmented message - hex: " + hexDump);
            return mCircleBuffer.add(data, 0, endPos + 2);
        } else if (!hasStart && !hasEnd && mCircleBuffer.getDataLen() > 0) {
            // Middle portion of a fragmented message
            Log.d(TAG, "🔄 Adding middle portion of fragmented message - hex: " + hexDump);
            return mCircleBuffer.add(data, 0, size);
        } else if (!hasStart && !hasEnd && mCircleBuffer.getDataLen() == 0) {
            // Unexpected data with no markers and empty buffer
            Log.w(TAG, "⚠️ Received data with no markers and empty buffer - ignoring");
            return true; // pretend we succeeded but don't store anything
        } else {
            Log.d(TAG, "🔄 Adding data to buffer - hex: " + hexDump);
            return mCircleBuffer.add(data, 0, size);
        }
    }
    
    /**
     * Parse and extract complete messages from the buffer
     * @return List of complete messages, or null if none were found
     */
    public List<byte[]> parseMessages() {
        int dataLen = mCircleBuffer.getDataLen();
        if (dataLen == 0) {
            return null;
        }
        
        // Fetch all available data into our temp buffer
        int fetchSize = mCircleBuffer.fetch(mTempBuffer, 0, dataLen);
        if (fetchSize == 0) {
            return null;
        }
        
        // Debug info - print the buffer content in hex
        StringBuilder hexDump = new StringBuilder();
        for (int i = 0; i < Math.min(fetchSize, 40); i++) {
            hexDump.append(String.format("%02X ", mTempBuffer[i] & 0xFF));
        }
        if (fetchSize > 40) hexDump.append("...");
        
        Log.d(TAG, "🔍 Parsing " + fetchSize + " bytes from buffer: " + hexDump);
        
        List<byte[]> completeMessages = new ArrayList<>();
        int currentPos = 0;
        boolean foundValidMessage = false;
        
        // Continue until we can't find any more complete messages
        while (currentPos < fetchSize) {
            // Find start marker
            int startMarkerPos = findMarker(mTempBuffer, currentPos, fetchSize - currentPos, START_MARKER_BYTES);
            if (startMarkerPos == -1) {
                // No start marker found
                Log.d(TAG, "⚠️ No start marker found in remaining buffer from position " + currentPos);
                if (!foundValidMessage) {
                    // If we haven't found any valid messages, clear the whole buffer
                    Log.w(TAG, "🧹 Clearing entire buffer as no valid messages were found");
                    mCircleBuffer.clear();
                    return null;
                }
                break;
            }
            
            // If we found a start marker that's not at our current position, skip to it
            if (startMarkerPos > currentPos) {
                Log.d(TAG, "⏩ Skipping " + (startMarkerPos - currentPos) + " bytes to start marker");
                currentPos = startMarkerPos;
            }
            
            // Find end marker
            int endMarkerPos = findMarker(mTempBuffer, currentPos + 2, fetchSize - currentPos - 2, END_MARKER_BYTES);
            if (endMarkerPos == -1) {
                // No end marker found - log the partial message for debugging
                String partialHex = ByteUtil.outputHexString(mTempBuffer, currentPos, fetchSize - currentPos); // Using space-separated hex format
                Log.d(TAG, "⏳ No end marker found after position " + currentPos + ", waiting for more data");
                Log.d(TAG, "⏳ Partial message content (hex): " + partialHex);
                
                // If we've already found at least one valid message, process that and keep the rest
                if (foundValidMessage) {
                    break;
                }
                
                // Check if buffer has been waiting too long (we would need timestamp tracking for this)
                // For now, if the buffer size exceeds a reasonable message size, clear it
                if (fetchSize > 512) {  // 512 bytes should be more than enough for any valid message
                    Log.w(TAG, "🧹 Buffer size too large (" + fetchSize + " bytes) without valid message - clearing");
                    mCircleBuffer.clear();
                }
                return null;
            }
            
            // Validate the message format (check ## is followed by at least 4 bytes of command header)
            if (endMarkerPos - currentPos < 6) {
                Log.w(TAG, "⚠️ Message too short (" + (endMarkerPos - currentPos) + " bytes) - skipping");
                currentPos = endMarkerPos + 2;
                continue;
            }
            
            // Calculate message length including markers
            int messageLength = (endMarkerPos + 2) - currentPos;
            
            // Extract the complete message
            byte[] completeMessage = new byte[messageLength];
            ByteUtil.copyBytes(mTempBuffer, currentPos, messageLength, completeMessage, 0);
            
            // Verify this looks like a valid K900 message with proper structure
            if (isValidK900Message(completeMessage)) {
                completeMessages.add(completeMessage);
                Log.d(TAG, "✅ Found valid complete message: " + messageLength + " bytes");
                foundValidMessage = true;
            } else {
                // Detailed logging of invalid message for debugging
                String invalidHex = ByteUtil.outputHexString(completeMessage, 0, completeMessage.length); // Using space-separated hex format
                Log.w(TAG, "❌ Invalid message format detected - skipping");
                Log.w(TAG, "❌ Invalid message content (hex): " + invalidHex);
                
                // Try to determine what's wrong with the message
                // Count start markers
                int startMarkerCount = 0;
                for (int i = 0; i < completeMessage.length - 1; i++) {
                    if (completeMessage[i] == START_MARKER_BYTES[0] && completeMessage[i+1] == START_MARKER_BYTES[1]) {
                        startMarkerCount++;
                    }
                }
                
                if (startMarkerCount > 1) {
                    Log.w(TAG, "❌ Reason: Multiple start markers (##) detected - likely concatenated messages");
                } else if (completeMessage.length < 8) {
                    Log.w(TAG, "❌ Reason: Message too short (" + completeMessage.length + " bytes)");
                } else {
                    Log.w(TAG, "❌ Reason: Unknown validation failure");
                }
            }
            
            // Move past this message
            currentPos = endMarkerPos + 2;
        }
        
        // Remove the processed data from the circle buffer
        if (currentPos > 0) {
            mCircleBuffer.removeHead(currentPos);
            Log.d(TAG, "🧹 Removed " + currentPos + " processed bytes from buffer, " + 
                 mCircleBuffer.getDataLen() + " bytes remaining");
        }
        
        return completeMessages.isEmpty() ? null : completeMessages;
    }
    
    /**
     * Validate that a message appears to follow the K900 protocol format
     * @param message The message bytes to validate
     * @return true if the message appears valid
     */
    private boolean isValidK900Message(byte[] message) {
        if (message == null || message.length < 8) {  // Minimum size for a valid message
            return false;
        }
        
        // Check start marker
        if (message[0] != START_MARKER_BYTES[0] || message[1] != START_MARKER_BYTES[1]) {
            return false;
        }
        
        // Check end marker
        if (message[message.length-2] != END_MARKER_BYTES[0] || message[message.length-1] != END_MARKER_BYTES[1]) {
            return false;
        }
        
        // Check that we don't have multiple ## markers in the message
        int startMarkerCount = 0;
        for (int i = 0; i < message.length - 1; i++) {
            if (message[i] == START_MARKER_BYTES[0] && message[i+1] == START_MARKER_BYTES[1]) {
                startMarkerCount++;
                if (startMarkerCount > 1) {
                    Log.w(TAG, "❌ Multiple start markers in message - probably concatenated");
                    return false;
                }
            }
        }
        
        return true;
    }
    
    /**
     * Find a marker sequence in a byte array
     * @param data Source data
     * @param offset Starting offset
     * @param length Length to search
     * @param marker Marker to find
     * @return Position of marker, or -1 if not found
     */
    private int findMarker(byte[] data, int offset, int length, byte[] marker) {
        if (data == null || marker == null || offset < 0 || length <= 0 || 
            offset + length > data.length || marker.length > length) {
            return -1;
        }
        
        for (int i = offset; i <= offset + length - marker.length; i++) {
            boolean found = true;
            for (int j = 0; j < marker.length; j++) {
                if (data[i + j] != marker[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return i;
            }
        }
        
        return -1;
    }
    
    /**
     * Clear the parser buffer
     */
    public void clear() {
        mCircleBuffer.clear();
    }
}