#include "lc3_process.h"
#include "lc3_debug.h"
extern "C" {
#include "lc3.h"
}

#define LC3_MODUL 32

static int32_t lc3plus_api_encoder_uninit(LC3_Enc_Info * info);
static int32_t lc3plus_api_enc(LC3_Enc_Info * info, void* scratch, void** input_samples, void* output_bytes, int32_t num_bytes);
static int32_t lc3plus_api_enc_interlaced(LC3_Enc_Info * info, void* scratch, void* input_samples, void* output_bytes, int32_t num_bytes);
//
EXTERNC int32_t lc3_api_encoder_init_plus(LC3_Enc_Info* info){
    dbgErrPXL("lc3plus fixed_point start");
    if (info->frame_dms != 100 
        && info->frame_dms != 50 
        && info->frame_dms != 25
        ) {
        dbgErrPXL("unsupportde frame duration:%d(0.1ms)", info->frame_dms);
        return ERROR(0);
    }    
    auto encode_size = lc3_enc_get_size(info->sample_rate, info->channels);
    returnIfErrCS(ERROR(0), encode_size<=0, "%d,get_size()", encode_size);

    auto enc = (struct LC3_Enc*)info->cb_alloc(info->pool, encode_size);
    returnIfErrCS(ERROR(0), !enc, "alloc_encode(%d)", encode_size);
    info->instance = enc;
    info->instance_size = encode_size;    
    
    int err     = 0;
    err = lc3_enc_init(enc, info->sample_rate, info->channels);
    returnIfErrCS(ERROR(err), err, "%d,init()", err);

    err = lc3_enc_set_frame_ms(enc, info->frame_dms/10.f);
    returnIfErrCS(ERROR(err), err, "%d,set_dms(%u)", err, info->frame_dms);

    err = lc3_enc_set_ep_mode(enc, (LC3_EpMode)info->epmode);
    returnIfErrCS(ERROR(err), err, "%d,set_epmode(%u)", err, info->epmode);

    err = lc3_enc_set_ep_mode_request(enc, (LC3_EpModeRequest)info->epmr);
    returnIfErrCS(ERROR(err), err, "%d,set_epmr(%u)", err, info->epmr);

    err = lc3_enc_set_bitrate(enc, info->bitrate);
    returnIfErrCS(ERROR(err), err, "%d,set_br(%u)", err, info->bitrate);

    //info->delay = info->dc ? lc3_enc_get_delay(enc) / info->dc : 0;
    info->frame_samples = lc3_enc_get_input_samples(enc);
    //info->real_bitrate = lc3_enc_get_real_bitrate(enc);
    info->frame_size = lc3_enc_get_num_bytes(enc);   
    //
    auto scratch_size = lc3_enc_get_scratch_size(enc);
    if (scratch_size) {
        auto scratch = info->cb_alloc(info->pool, scratch_size);
        if (!scratch) {
            dbgErrPXL("alloc scratch fail:%d", scratch_size);
            return ERROR(0);
        }
        info->scratch = scratch;
        info->scratch_size = scratch_size;
    }
    //
    info->cb_uninit = &lc3plus_api_encoder_uninit;
    info->cb_encode = &lc3plus_api_enc;
    info->cb_encode_interlaced = &lc3plus_api_enc_interlaced;
    //
    dbgErrPXL("lc3plus fixed_point end");
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
    return ERROR(0);
}

static int32_t lc3plus_api_enc(LC3_Enc_Info*info, void *scratch, void **input_samples, void *output_bytes, int32_t num_bytes){
    returnIfErrC(ERROR(0), !info);
    returnIfErrC(ERROR(0), info->is_interlaced);
    returnIfErrC(ERROR(0), !info->instance);
    returnIfErrC(ERROR(0), !scratch);
    returnIfErrC(ERROR(0), !output_bytes);
    returnIfErrC(ERROR(0), !num_bytes);
    returnIfErrC(ERROR(0), !input_samples);
    returnIfErrC(ERROR(0), !info->bitwidth);
    returnIfErrC(ERROR(0), !info->channels);
    auto enc = (LC3_Enc*)info->instance;
    int sample_bits = info->bitwidth;
    int err = lc3_enc(enc, scratch, (void **)input_samples, sample_bits, output_bytes, num_bytes);
    returnIfErrCS(ERROR(err), err, "%d", err);
    return 0;
}

static int32_t lc3plus_api_enc_interlaced(LC3_Enc_Info* info, void* scratch, void* input_samples, void* output_bytes, int32_t num_bytes){
    returnIfErrC(ERROR(0), !info);
    returnIfErrC(ERROR(0), !info->is_interlaced);
    returnIfErrC(ERROR(0), !info->instance);
    returnIfErrC(ERROR(0), !scratch);
    returnIfErrC(ERROR(0), !output_bytes);
    returnIfErrC(ERROR(0), !num_bytes);
    returnIfErrC(ERROR(0), !input_samples);
    returnIfErrC(ERROR(0), !info->bitwidth);
    returnIfErrC(ERROR(0), !info->channels);
    auto enc = (LC3_Enc*)info->instance;
    void* inputs[4];
    char* ptr = (char*)input_samples;
    int skip = info->bitalign >> 3;
    for (int i = 0; i < info->channels; i++) {
        inputs[i] = ptr;
        ptr += skip;
    }
    int sample_bits = info->bitwidth;
    sample_bits |= (info->bitalign * info->channels) << 16;
    int err = lc3_enc(enc, scratch, (void**)inputs, sample_bits, output_bytes, num_bytes);
    returnIfErrCS(ERROR(err), err, "%d", err);
    return 0;
}