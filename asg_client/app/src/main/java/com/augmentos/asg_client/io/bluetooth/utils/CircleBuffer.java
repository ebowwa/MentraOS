package com.augmentos.asg_client.io.bluetooth.utils;

import android.util.Log;

/**
 * CircleBuffer implementation for buffering UART data.
 * Adapted from K900_server_sdk CircleBuffer.
 */
public class CircleBuffer {
    private static final String TAG = "CircleBuffer";
    
    private int begin = 0;
    private int end = 0;
    private byte[] mBuf = null;
    private int mLen = 0;
    
    /**
     * Create a new CircleBuffer with the specified length
     * @param len Buffer size in bytes
     */
    public CircleBuffer(int len) {
        mLen = len;
        mBuf = new byte[len];
        Log.d(TAG, "Created CircleBuffer with size " + len + " bytes");
    }
    
    /**
     * Check if the buffer can accommodate the specified number of bytes
     * @param len Number of bytes to check
     * @return true if the buffer can accommodate the bytes, false otherwise
     */
    public boolean canAdd(int len) {
        if (len > mLen) {
            return false;
        }
        
        if (begin == end) {
            return true; // Empty buffer
        }
        
        if (end > begin) {
            // Data is contiguous, check if there's enough space
            int availableSpace = mLen - end + begin - 1;
            return availableSpace >= len;
        } else {
            // Data wraps around, check if there's enough space
            int availableSpace = begin - end - 1;
            return availableSpace >= len;
        }
    }
    
    /**
     * Add data to the buffer
     * @param buf Source buffer
     * @param offset Offset in source buffer
     * @param len Length to add
     * @return true if add was successful, false if buffer is full
     */
    public boolean add(byte[] buf, int offset, int len) {
        if (len > mLen) {
            Log.w(TAG, "Cannot add data larger than buffer size: " + len + " > " + mLen);
            return false;
        }
        
        if (canAdd(len)) {
            if (end >= begin) {
                int laterSize = mLen - end;
                if (laterSize >= len) {
                    ByteUtil.copyBytes(buf, offset, len, mBuf, end);
                    end += len;
                    end = end % mLen;
                } else {
                    int offset2 = offset;
                    if (laterSize > 0) {
                        ByteUtil.copyBytes(buf, offset2, laterSize, mBuf, end);
                        offset2 += laterSize;
                    }
                    int frontSize = begin - 1;
                    if (frontSize < len - laterSize) {
                        Log.w(TAG, "Not enough space in front portion of buffer");
                        return false;
                    }
                    int cpSize = len - laterSize;
                    ByteUtil.copyBytes(buf, offset2, cpSize, mBuf, 0);
                    end = cpSize;
                }
            } else {
                int remaindSize = begin - end - 1;
                if (remaindSize >= len) {
                    ByteUtil.copyBytes(buf, offset, len, mBuf, end);
                    end += len;
                } else {
                    Log.w(TAG, "Not enough space in buffer: need " + len + ", have " + remaindSize);
                    return false;
                }
            }
            
            // Keep this circle buffer log
            //Log.d(TAG, "Added " + len + " bytes to buffer, now contains " + getDataLen() + " bytes");
            return true;
        } else {
            //Log.w(TAG, "Cannot add " + len + " bytes to buffer");
            return false;
        }
    }
    
    /**
     * Fetch data from the buffer without removing it
     * @param buf Destination buffer
     * @param offset Offset in destination buffer
     * @param len Maximum length to fetch
     * @return Actual number of bytes fetched
     */
    public int fetch(byte[] buf, int offset, int len) {
        if (begin == end) {
            return 0;
        }
        
        int fetchSize = 0;
        if (end > begin) {
            fetchSize = (end - begin) >= len ? len : (end - begin);
            ByteUtil.copyBytes(mBuf, begin, fetchSize, buf, offset);
            return fetchSize;
        } else {
            int laterSize = mLen - begin;
            if (laterSize >= len) {
                fetchSize = len;
                ByteUtil.copyBytes(mBuf, begin, fetchSize, buf, offset);
            } else {
                fetchSize = laterSize;
                ByteUtil.copyBytes(mBuf, begin, fetchSize, buf, offset);
                int remainingLen = len - laterSize;
                if (remainingLen > 0 && end > 0) {
                    int frontFetchSize = Math.min(remainingLen, end);
                    ByteUtil.copyBytes(mBuf, 0, frontFetchSize, buf, offset + laterSize);
                    fetchSize += frontFetchSize;
                }
            }
            return fetchSize;
        }
    }
    
    /**
     * Get the current data length in the buffer
     * @return Number of bytes currently in the buffer
     */
    public int getDataLen() {
        if (begin == end) {
            return 0;
        }
        
        if (end > begin) {
            return end - begin;
        } else {
            return mLen - begin + end;
        }
    }
    
    /**
     * Clear the buffer
     */
    public void clear() {
        begin = 0;
        end = 0;
    }
} 