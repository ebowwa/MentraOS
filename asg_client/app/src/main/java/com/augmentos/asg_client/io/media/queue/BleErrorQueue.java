package com.augmentos.asg_client.io.media.queue;

import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Queue system for BLE error messages when file transfer is in progress.
 * Prevents BLE interference by queuing error messages for delivery after transfer completes.
 */
public class BleErrorQueue {
    private static final String TAG = "BleErrorQueue";
    
    // Thread-safe queue for error messages
    private final ConcurrentLinkedQueue<QueuedErrorMessage> errorQueue = new ConcurrentLinkedQueue<>();
    
    // Flag to track if we're currently processing the queue
    private final AtomicBoolean isProcessingQueue = new AtomicBoolean(false);
    
    // Callback interface for sending messages via BLE
    public interface BleMessageSender {
        void sendThroughBluetooth(byte[] data);
        boolean isBleTransferInProgress();
    }
    
    // Queued error message structure
    private static class QueuedErrorMessage {
        final String requestId;
        final String errorCode;
        final String errorMessage;
        final long timestamp;
        final String messageType;
        
        QueuedErrorMessage(String requestId, String errorCode, String errorMessage, String messageType) {
            this.requestId = requestId;
            this.errorCode = errorCode;
            this.errorMessage = errorMessage;
            this.messageType = messageType;
            this.timestamp = System.currentTimeMillis();
        }
    }
    
    private BleMessageSender messageSender;
    
    public BleErrorQueue(BleMessageSender messageSender) {
        this.messageSender = messageSender;
    }
    
    /**
     * Queue an error message for later delivery when BLE is available.
     * 
     * @param requestId Request ID associated with the error
     * @param errorCode Error code
     * @param errorMessage Error message
     * @param messageType Type of message (e.g., "photo_response", "ble_photo_error")
     */
    public void queueErrorMessage(String requestId, String errorCode, String errorMessage, String messageType) {
        QueuedErrorMessage errorMsg = new QueuedErrorMessage(requestId, errorCode, errorMessage, messageType);
        errorQueue.offer(errorMsg);
        
        Log.d(TAG, "📋 Queued error message: " + errorCode + " for requestId: " + requestId + 
                  " | Queue size: " + errorQueue.size());
        
        // Try to process queue if BLE is available
        processQueueIfAvailable();
    }
    
    /**
     * Process all queued error messages if BLE is available.
     * This method is thread-safe and can be called from multiple threads.
     * Uses immediate processing to prevent blocking new file transfers.
     */
    public void processQueueIfAvailable() {
        // Use atomic operation to ensure only one thread processes the queue
        if (!isProcessingQueue.compareAndSet(false, true)) {
            Log.d(TAG, "📋 Queue processing already in progress, skipping");
            return;
        }
        
        try {
            // Process messages one by one with immediate BLE availability checks
            int processedCount = 0;
            QueuedErrorMessage errorMsg;
            
            while ((errorMsg = errorQueue.poll()) != null) {
                // Check BLE availability for EACH message to prevent blocking new transfers
                if (messageSender == null || messageSender.isBleTransferInProgress()) {
                    Log.d(TAG, "📋 BLE became busy during error processing - re-queuing " + 
                              (errorQueue.size() + 1) + " messages");
                    // Re-queue the current message
                    errorQueue.offer(errorMsg);
                    break; // Stop processing to avoid blocking new transfers
                }
                
                try {
                    sendQueuedErrorMessage(errorMsg);
                    processedCount++;
                    
                    // Add small delay between messages to prevent UART overflow
                    // This prevents error messages from interfering with new file transfers
                    if (errorQueue.peek() != null) { // Only delay if more messages to send
                        try {
                            Thread.sleep(10); // 10ms delay between error messages
                        } catch (InterruptedException e) {
                            Log.w(TAG, "Error message delay interrupted", e);
                            break; // Stop processing if interrupted
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "❌ Error sending queued message for requestId: " + errorMsg.requestId, e);
                    // Re-queue the message if sending failed
                    errorQueue.offer(errorMsg);
                    break; // Stop processing to avoid infinite loop
                }
            }
            
            if (processedCount > 0) {
                Log.i(TAG, "✅ Processed " + processedCount + " queued error messages");
            }
            
        } finally {
            // Always release the processing lock
            isProcessingQueue.set(false);
        }
    }
    
    /**
     * Send a queued error message via BLE.
     */
    private void sendQueuedErrorMessage(QueuedErrorMessage errorMsg) throws JSONException {
        JSONObject json = new JSONObject();
        json.put("type", errorMsg.messageType);
        json.put("requestId", errorMsg.requestId);
        
        if ("photo_response".equals(errorMsg.messageType)) {
            json.put("success", false);
            json.put("errorCode", errorMsg.errorCode);
            json.put("errorMessage", errorMsg.errorMessage);
        } else if ("ble_photo_error".equals(errorMsg.messageType)) {
            json.put("error", errorMsg.errorMessage);
        }
        
        json.put("timestamp", errorMsg.timestamp);
        
        Log.d(TAG, "📤 Sending queued error message: " + errorMsg.errorCode + 
                  " for requestId: " + errorMsg.requestId);
        
        messageSender.sendThroughBluetooth(json.toString().getBytes());
    }
    
    /**
     * Get the current queue size for monitoring purposes.
     */
    public int getQueueSize() {
        return errorQueue.size();
    }
    
    /**
     * Clear all queued messages (use with caution).
     */
    public void clearQueue() {
        int clearedCount = errorQueue.size();
        errorQueue.clear();
        Log.w(TAG, "🗑️ Cleared " + clearedCount + " queued error messages");
    }
    
    /**
     * Check if there are any queued messages.
     */
    public boolean hasQueuedMessages() {
        return !errorQueue.isEmpty();
    }
    
    /**
     * Test method to verify the error queue system works correctly.
     * This method simulates the scenario where BLE is busy and error messages are queued.
     */
    public void runSelfTest() {
        Log.d(TAG, "🧪 Starting BLE Error Queue self-test");
        
        // Test 1: Queue messages when BLE is busy
        Log.d(TAG, "🧪 Test 1: Queuing messages when BLE is busy");
        queueErrorMessage("test-1", "BLE_TRANSFER_BUSY", "Test error message 1", "photo_response");
        queueErrorMessage("test-2", "BLE_TRANSFER_BUSY", "Test error message 2", "photo_response");
        queueErrorMessage("test-3", "BLE_TRANSFER_BUSY", "Test error message 3", "photo_response");
        
        int queueSize = getQueueSize();
        Log.d(TAG, "🧪 Test 1 Result: Queue size = " + queueSize + " (expected: 3)");
        
        // Test 2: Process queue when BLE becomes available
        Log.d(TAG, "🧪 Test 2: Processing queue when BLE becomes available");
        processQueueIfAvailable();
        
        int finalQueueSize = getQueueSize();
        Log.d(TAG, "🧪 Test 2 Result: Final queue size = " + finalQueueSize + " (expected: 0 if BLE available, 3 if busy)");
        
        Log.d(TAG, "🧪 BLE Error Queue self-test completed");
    }
}
