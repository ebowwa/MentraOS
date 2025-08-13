// lc3_codec_wrapper.cpp - Compatibility wrapper for lc3_codec to maintain liblc3 JNI interface
#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <android/log.h>
#include "lc3_codec/inc/lc3_process.h"

#define LOG_TAG "LC3CodecJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// Wrapper structure to hold lc3_codec instances
struct LC3CodecWrapper {
    LC3_Info encoder_info;
    LC3_Info decoder_info;
    void* encoder_instance;
    void* decoder_instance;
    void* encoder_scratch;
    void* decoder_scratch;
};

extern "C" JNIEXPORT jlong JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_initEncoder(JNIEnv *env, jclass clazz) {
    LC3CodecWrapper* wrapper = new LC3CodecWrapper();
    if (!wrapper) return 0;
    
    // Initialize encoder info
    memset(&wrapper->encoder_info, 0, sizeof(LC3_Info));
    wrapper->encoder_info.sample_rate = 16000;
    wrapper->encoder_info.channels = 1;
    wrapper->encoder_info.bitwidth = 16;
    wrapper->encoder_info.bitalign = 16;
    wrapper->encoder_info.frame_dms = 100; // 10ms frame
    wrapper->encoder_info.is_encode = 1;
    wrapper->encoder_info.is_lc3plus = 0;
    
    // Calculate frame size for 40 bytes output (320 kbps equivalent)
    wrapper->encoder_info.frame_size = 40;
    wrapper->encoder_info.frame_samples = 160; // 10ms at 16kHz
    
    // Initialize encoder
    int result = lc3_api_encoder_init(&wrapper->encoder_info);
    if (result != LC3_API_OK) {
        LOGE("Failed to initialize lc3_codec encoder: %d", result);
        delete wrapper;
        return 0;
    }
    
    // Allocate instance and scratch memory
    wrapper->encoder_instance = malloc(wrapper->encoder_info.instance_size);
    wrapper->encoder_scratch = malloc(wrapper->encoder_info.scratch_size);
    
    if (!wrapper->encoder_instance || !wrapper->encoder_scratch) {
        LOGE("Failed to allocate encoder memory");
        if (wrapper->encoder_instance) free(wrapper->encoder_instance);
        if (wrapper->encoder_scratch) free(wrapper->encoder_scratch);
        delete wrapper;
        return 0;
    }
    
    wrapper->encoder_info.instance = wrapper->encoder_instance;
    wrapper->encoder_info.scratch = wrapper->encoder_scratch;
    
    LOGI("LC3 Codec encoder initialized successfully");
    return reinterpret_cast<jlong>(wrapper);
}

extern "C" JNIEXPORT void JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_freeEncoder(JNIEnv *env, jclass clazz, jlong encPtr) {
    if (encPtr == 0) return;
    
    LC3CodecWrapper* wrapper = reinterpret_cast<LC3CodecWrapper*>(encPtr);
    if (wrapper->encoder_instance) free(wrapper->encoder_instance);
    if (wrapper->encoder_scratch) free(wrapper->encoder_scratch);
    delete wrapper;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_initDecoder(JNIEnv *env, jclass clazz) {
    LC3CodecWrapper* wrapper = new LC3CodecWrapper();
    if (!wrapper) return 0;
    
    // Initialize decoder info
    memset(&wrapper->decoder_info, 0, sizeof(LC3_Info));
    wrapper->decoder_info.sample_rate = 16000;
    wrapper->decoder_info.channels = 1;
    wrapper->decoder_info.bitwidth = 16;
    wrapper->decoder_info.bitalign = 16;
    wrapper->decoder_info.frame_dms = 100; // 10ms frame
    wrapper->decoder_info.is_encode = 0;
    wrapper->decoder_info.is_lc3plus = 0;
    
    // Calculate frame size for 40 bytes input
    wrapper->decoder_info.frame_size = 40;
    wrapper->decoder_info.frame_samples = 160; // 10ms at 16kHz
    
    // Initialize decoder
    int result = lc3_api_decoder_init(&wrapper->decoder_info);
    if (result != LC3_API_OK) {
        LOGE("Failed to initialize lc3_codec decoder: %d", result);
        delete wrapper;
        return 0;
    }
    
    // Allocate instance and scratch memory
    wrapper->decoder_instance = malloc(wrapper->decoder_info.instance_size);
    wrapper->decoder_scratch = malloc(wrapper->decoder_info.scratch_size);
    
    if (!wrapper->decoder_instance || !wrapper->decoder_scratch) {
        LOGE("Failed to allocate decoder memory");
        if (wrapper->decoder_instance) free(wrapper->decoder_instance);
        if (wrapper->decoder_scratch) free(wrapper->decoder_scratch);
        delete wrapper;
        return 0;
    }
    
    wrapper->decoder_info.instance = wrapper->decoder_instance;
    wrapper->decoder_info.scratch = wrapper->decoder_scratch;
    
    LOGI("LC3 Codec decoder initialized successfully");
    return reinterpret_cast<jlong>(wrapper);
}

extern "C" JNIEXPORT void JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_freeDecoder(JNIEnv *env, jclass clazz, jlong decPtr) {
    if (decPtr == 0) return;
    
    LC3CodecWrapper* wrapper = reinterpret_cast<LC3CodecWrapper*>(decPtr);
    if (wrapper->decoder_instance) free(wrapper->decoder_instance);
    if (wrapper->decoder_scratch) free(wrapper->decoder_scratch);
    delete wrapper;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_encodeLC3(JNIEnv *env, jclass clazz, jlong encPtr, jbyteArray pcmData) {
    if (encPtr == 0) return env->NewByteArray(0);
    
    LC3CodecWrapper* wrapper = reinterpret_cast<LC3CodecWrapper*>(encPtr);
    jbyte* pcmBytes = env->GetByteArrayElements(pcmData, nullptr);
    int pcmLength = env->GetArrayLength(pcmData);
    
    int dtUs = 10000; // 10ms
    int srHz = 16000;
    uint16_t samplesPerFrame = 160; // 10ms at 16kHz
    uint16_t bytesPerFrame = samplesPerFrame * 2;
    uint16_t encodedFrameSize = 40;
    
    int frameCount = pcmLength / bytesPerFrame;
    int outputSize = frameCount * encodedFrameSize;
    
    if (frameCount <= 0) {
        env->ReleaseByteArrayElements(pcmData, pcmBytes, JNI_ABORT);
        return env->NewByteArray(0);
    }
    
    int16_t* alignedPcmBuffer = (int16_t*)malloc(bytesPerFrame);
    unsigned char* encodedData = (unsigned char*)malloc(outputSize);
    
    if (!alignedPcmBuffer || !encodedData) {
        LOGE("Failed to allocate encoding buffers");
        if (alignedPcmBuffer) free(alignedPcmBuffer);
        if (encodedData) free(encodedData);
        env->ReleaseByteArrayElements(pcmData, pcmBytes, JNI_ABORT);
        return env->NewByteArray(0);
    }
    
    for (int i = 0, offset = 0; i < frameCount; i++, offset += encodedFrameSize) {
        // Convert PCM data to int16 samples
        for (int j = 0; j < samplesPerFrame; j++) {
            int srcIdx = i * bytesPerFrame + j * 2;
            if (srcIdx + 1 >= pcmLength) {
                alignedPcmBuffer[j] = 0;
            } else {
                alignedPcmBuffer[j] = (int16_t)(
                    ((int16_t)pcmBytes[srcIdx + 1] << 8) |
                    ((uint8_t)pcmBytes[srcIdx])
                );
            }
        }
        
        // Encode frame using lc3_codec
        void* input_samples[1] = { alignedPcmBuffer };
        int result = wrapper->encoder_info.cb_encode(
            &wrapper->encoder_info,
            wrapper->encoder_scratch,
            input_samples,
            encodedData + offset,
            encodedFrameSize
        );
        
        if (result != LC3_API_OK) {
            LOGE("Encoding failed for frame %d: %d", i, result);
            memset(encodedData + offset, 0, encodedFrameSize);
        }
    }
    
    jbyteArray resultArray = env->NewByteArray(outputSize);
    env->SetByteArrayRegion(resultArray, 0, outputSize, (jbyte*)encodedData);
    
    free(alignedPcmBuffer);
    free(encodedData);
    env->ReleaseByteArrayElements(pcmData, pcmBytes, JNI_ABORT);
    
    return resultArray;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_augmentos_smartglassesmanager_cpp_L3cCpp_decodeLC3(JNIEnv *env, jclass clazz, jlong decPtr, jbyteArray lc3Data) {
    if (decPtr == 0) return env->NewByteArray(0);
    
    LC3CodecWrapper* wrapper = reinterpret_cast<LC3CodecWrapper*>(decPtr);
    jbyte* lc3Bytes = env->GetByteArrayElements(lc3Data, nullptr);
    int lc3Length = env->GetArrayLength(lc3Data);
    
    int dtUs = 10000; // 10ms
    int srHz = 16000;
    uint16_t samplesPerFrame = 160; // 10ms at 16kHz
    uint16_t bytesPerFrame = samplesPerFrame * 2;
    uint16_t encodedFrameSize = 40;
    
    int outSize = (lc3Length / encodedFrameSize) * bytesPerFrame;
    unsigned char* outArray = (unsigned char*)malloc(outSize);
    int16_t* outBuf = (int16_t*)malloc(bytesPerFrame);
    
    if (!outArray || !outBuf) {
        LOGE("Failed to allocate decoding buffers");
        if (outArray) free(outArray);
        if (outBuf) free(outBuf);
        env->ReleaseByteArrayElements(lc3Data, lc3Bytes, JNI_ABORT);
        return env->NewByteArray(0);
    }
    
    jsize offset = 0;
    for (int i = 0; i <= lc3Length - encodedFrameSize; i += encodedFrameSize) {
        unsigned char* framePtr = reinterpret_cast<unsigned char*>(lc3Bytes + i);
        
        // Decode frame using lc3_codec
        void* output_samples[1] = { outBuf };
        int result = wrapper->decoder_info.cb_decode(
            &wrapper->decoder_info,
            wrapper->decoder_scratch,
            framePtr,
            encodedFrameSize,
            output_samples,
            0 // No BFI
        );
        
        if (result != LC3_API_OK) {
            LOGE("Decoding failed for frame %d: %d", i/encodedFrameSize, result);
            memset(outBuf, 0, bytesPerFrame);
        }
        
        memcpy(outArray + offset, outBuf, bytesPerFrame);
        offset += bytesPerFrame;
        memset(outBuf, 0, bytesPerFrame);
    }
    
    jbyteArray resultArray = env->NewByteArray(outSize);
    env->SetByteArrayRegion(resultArray, 0, outSize, (jbyte*)outArray);
    
    env->ReleaseByteArrayElements(lc3Data, lc3Bytes, JNI_ABORT);
    free(outArray);
    free(outBuf);
    return resultArray;
} 