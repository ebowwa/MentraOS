#include "lc3_process.h"
#include "lc3_debug.h"
extern "C"{
#define ENABLE_ENCODER
#include "lc3plus_enc.h"
}
#define LC3_MODUL 22
//
static int32_t lc3plus_api_encoder_uninit(LC3_Enc_Info * info);
static int32_t lc3plus_api_enc(LC3_Enc_Info* encoder, void* scratch, void** input_samples, void* output_bytes, int32_t num_bytes);
static int32_t lc3plus_api_enc_interlaced(LC3_Enc_Info* encoder, void* scratch, void* input_samples, void* output_bytes, int32_t num_bytes);
//
EXTERNC int32_t lc3_api_encoder_init_plus(LC3_Enc_Info* info){
    dbgTestPXL("lc3plus enc(v%d)start", lc3plus_enc_version());
    bool check = info->frame_dms == 100
        || info->frame_dms == 50
        || info->frame_dms == 25;
    returnIfErrCS(ERROR(0), !check, "frame duration:%d(0.1ms)in[100,50,25]", info->frame_dms);
    
    //
    auto encode_size = 0;
    int err = lc3plus_enc_get_size(info->sample_rate, info->channels, info->bitwidth, &encode_size);
    returnIfErrCS(ERROR(err), err, "%d",err);
    returnIfErrC(ERROR(0), !encode_size);
    //
    auto enc = (struct LC3PLUS_Enc*)info->cb_alloc(info->pool, encode_size); 
    returnIfErrCS(ERROR(0), !enc, "alloc_encode(%d)", encode_size);
    info->instance = enc;
    info->instance_size = encode_size;    
    //
    int hrmode = 1;
    int lfe = 0;
    int scratch_size = 0; 
    //err = lc3_enc_init(enc, info->sample_rate, info->channels);
    err = lc3plus_enc_init(enc//LC3PLUS_Enc* const encoder
        , info->sample_rate// int32_t const samplerate
        , info->channels//int32_t const channels
        , info->frame_dms//int32_t const frame_dms
        , hrmode//int32_t const hrmode
        , info->bitwidth//info->bitrate//int32_t const bps_in
        , lfe//int32_t const lfe
        , &scratch_size//int32_t* const scratchSize
    ); 
    returnIfErrCS(ERROR(err), err, "%d,init()",err);
    //
    if (info->bandwidth) {
        err = lc3plus_enc_set_bandwidth(enc, info->bandwidth); 
        returnIfErrCS(ERROR(err), err, "%d,set_bandwidth(%d)", err, info->bandwidth);
    }
    //
    err = lc3plus_enc_set_bitrate(enc, info->bitrate); 
    returnIfErrCS(ERROR(err), err, "%d,set_bitrate(%d)", err, info->bitrate);
    //
    //err = lc3plus_enc_set_ep_mode(enc, (LC3PLUS_EpMode)info->epmode); 
    //returnIfErrCS(ERROR(err), err, "%d,set_ep_mode(%d)", err, info->epmode);
    //
    //err = lc3plus_enc_set_ep_mode_request(enc, (LC3PLUS_EpModeRequest)info->epmr); 
    //returnIfErrCS(ERROR(err), err, "%d,set_ep_mode_request(%d)", err, info->epmr);
    //
    //info->delay = info->dc ? lc3_enc_get_delay(enc) / info->dc : 0;
    int samples = 0;
    err = lc3plus_enc_get_input_samples(enc, &samples); 
    returnIfErrCS(ERROR(err), err, "%d,get_samples()", err);
    info->frame_samples = samples;
    // 
    int frame_size = 0;
    err = lc3plus_enc_get_num_bytes(enc, &frame_size); 
    returnIfErrCS(ERROR(err), err, "%d,get_bytes()", err);
    info->frame_size = frame_size;
    //
    //auto scratch_size = lc3plus_enc_get_scratch_size(enc);
    if (scratch_size) {
        auto scratch = info->cb_alloc(info->pool, scratch_size); 
        returnIfErrCS(ERROR(0), !scratch,"alloc_scratch(%d)", scratch_size);
        info->scratch = scratch;
        info->scratch_size = scratch_size;
    }
    //
    info->cb_uninit = &lc3plus_api_encoder_uninit;
    info->cb_encode = &lc3plus_api_enc;
    info->cb_encode_interlaced = &lc3plus_api_enc_interlaced;
    //
    dbgTestPXL0("lc3plus end");
    return 0;
}

static int32_t lc3plus_api_encoder_uninit(LC3_Enc_Info* info) {
    returnIfErrC(ERROR(0), !info);
    if (info->cb_free) {
        if (info->instance) {
            info->cb_free(info->pool, info->instance);
            info->instance = 0;
        }
        if (info->scratch) {
            info->cb_free(info->pool, info->scratch);
            info->scratch = 0;
        }
    }
    return 0;
}

static int32_t lc3plus_api_enc(LC3_Enc_Info* info, void *scratch, void **input_samples, void *output_bytes, int32_t num_bytes){
    returnIfErrC(ERROR(0), !info);
    returnIfErrC(ERROR(0), info->is_interlaced);
    auto enc = (LC3PLUS_Enc*)info->instance;
    //enc->is_interlaced = false;
    //return lc3_enc(enc, scratch, (void **)input_samples, enc->sample_bits, output_bytes, num_bytes);
    int err = lc3plus_enc_process_frame(enc//LC3PLUS_Enc* const encoder
        , input_samples//void* const* const input_samples
        , output_bytes//void* const output_bytes
        , &num_bytes//int32_t* const num_bytes
        , scratch//void* const scratch
        , 0
    );
    returnIfErrCS(ERROR(err), err, "%d", err);
    return 0;
}

static int32_t lc3plus_api_enc_interlaced(LC3_Enc_Info* info, void* scratch, void* input_samples, void* output_bytes, int32_t num_bytes){
    returnIfErrC(ERROR(0), !info);
    returnIfErrC(ERROR(0), !info->is_interlaced);
    auto enc = (LC3PLUS_Enc*)info->instance;
    void* inputs[4];
    char* ptr = (char*)input_samples;
    int skip = info->bitalign >> 3;
    for (int i = 0; i < info->channels; i++) {
        inputs[i] = ptr;
        ptr += skip;
    }
    int bits_skip = info->bitalign ? info->bitalign : info->bitwidth;
    bits_skip *= info->channels;
    
    int err = lc3plus_enc_process_frame(enc//LC3PLUS_Enc* const encoder
        , inputs//void* const* const input_samples
        , output_bytes//void* const output_bytes
        , &num_bytes//int32_t* const num_bytes
        , scratch//void* const scratch
        , bits_skip
    );
    returnIfErrCS(ERROR(err), err, "%d", err);
    return 0;
}
