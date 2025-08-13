#include "lc3_process.h"
#include "lc3_debug.h"
extern "C" {
#include "lc3.h"
}

#define LC3_MODUL 31

static int32_t lc3plus_api_decoder_uninit(LC3_Dec_Info * info);
static int32_t lc3plus_api_dec(LC3_Dec_Info * info, void* scratch, void* input_bytes, int32_t num_bytes, void** output_samples, int32_t bfi_ext);
static int32_t lc3plus_api_dec_interlaced(LC3_Dec_Info * info, void* scratch, void* input_bytes, int32_t num_bytes, void* output_samples, int32_t bfi_ext);
//
EXTERNC int32_t lc3_api_decoder_init_plus(LC3_Dec_Info * info) {
    dbgTestPXL("fixed_point start");
    if (info->frame_dms != 100
        && info->frame_dms != 50
        && info->frame_dms != 25
        ) {
        dbgErrPXL("unsupportde frame duration:%d(0.1ms)", info->frame_dms);
        return ERROR(0);
    }
    info->plcMeth = LC3_API_PLC_ADVANCED;
    auto decode_size = lc3_dec_get_size(info->sample_rate, info->channels, (LC3_PlcMode)info->plcMeth);
    returnIfErrCS(ERROR(0), decode_size<=0, "%d,get_size()", decode_size);
    //
    auto dec = (struct LC3_Dec*)info->cb_alloc(info->pool, decode_size);
    returnIfErrCS(ERROR(0), !dec, "alloc_decode(%d)", decode_size);
    info->instance = dec;
    info->instance_size = decode_size;   
    //
    int err = 0;   
    err = lc3_dec_init(dec, info->sample_rate, info->channels, (LC3_PlcMode)info->plcMeth);
    returnIfErrCS(ERROR(err), err, "%d,init()", err);

    err = lc3_dec_set_frame_ms(dec, info->frame_dms/10.f);
    returnIfErrCS(ERROR(err), err, "%d,set_dms(%d)", err, info->frame_dms);

    err = lc3_dec_set_ep_enabled(dec, info->epmode != 0);
    returnIfErrCS(ERROR(err), err, "%d,set_ep(%d)", err, info->epmode);
    
    /*err = lc3_dec_set_bitrate(dec, info->bitrate);
    if (err)
        return ERROR(err);*/

    //info->delay = info->dc ? lc3_dec_get_delay(dec) / info->dc : 0;
    info->frame_samples = lc3_dec_get_output_samples(dec);
    //
    auto scratch_size = lc3_dec_get_scratch_size(dec);
    if (scratch_size) {
        auto scratch = info->cb_alloc(info->pool, scratch_size);
        returnIfErrCS(ERROR(0), !scratch, "%d,alloc_scratch(%d)", err, scratch_size);        
        info->scratch = scratch;
        info->scratch_size = scratch_size;
    }
    //
    info->cb_decode = &lc3plus_api_dec;
    info->cb_decode_interlaced = &lc3plus_api_dec_interlaced;
    info->cb_uninit = &lc3plus_api_decoder_uninit;
    dbgTestPXL("fixed_point end");
    return 0;
}

static int32_t lc3plus_api_decoder_uninit(LC3_Dec_Info* info) {
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

static int32_t lc3plus_api_dec(LC3_Dec_Info* info, void *scratch, void *input_bytes, int32_t num_bytes, void **output_samples, int32_t bfi_ext){
    returnIfErrC(ERROR(0), !info);
    returnIfErrC(ERROR(0), info->is_interlaced);
    returnIfErrC(ERROR(0), !info->instance);
    returnIfErrC(ERROR(0), !scratch);
    returnIfErrC(ERROR(0), !input_bytes);
    returnIfErrC(ERROR(0), !num_bytes);
    returnIfErrC(ERROR(0), !output_samples);
    returnIfErrC(ERROR(0), !info->bitwidth);
    returnIfErrC(ERROR(0), !info->channels);
    auto dec = (LC3_Dec*)info->instance;
    int sample_bits = info->bitwidth;
    int err = lc3_dec(dec, scratch, input_bytes, num_bytes, (void **)output_samples, sample_bits, bfi_ext);
    returnIfErrCS(ERROR(err), err, "%d", err);
    return 0;
}

static int32_t lc3plus_api_dec_interlaced(LC3_Dec_Info* info, void* scratch, void* input_bytes, int32_t num_bytes, void* output_samples, int32_t bfi_ext) {
    returnIfErrC(ERROR(0),!info);
    returnIfErrC(ERROR(0),!info->is_interlaced);
    returnIfErrC(ERROR(0),!info->instance);
    returnIfErrC(ERROR(0),!scratch);
    returnIfErrC(ERROR(0),!input_bytes);
    returnIfErrC(ERROR(0),!num_bytes);
    returnIfErrC(ERROR(0),!output_samples);
    returnIfErrC(ERROR(0),!info->bitwidth);
    returnIfErrC(ERROR(0),!info->channels);
    auto dec = (LC3_Dec*)info->instance;
    void* outputs[4];
    uint8_t* output = (uint8_t*)output_samples;
    int sample_align = info->bitalign ? info->bitalign : info->bitwidth;
    int skip = sample_align >>3;
    for (int i = 0; i < info->channels; i++) {
        outputs[i] = output;
        output += skip;
    }
    int sample_bits = info->bitwidth;    
    sample_bits |= (sample_align * info->channels) << 16;
    int err = lc3_dec(dec, scratch, input_bytes, num_bytes, (void**)outputs, sample_bits, bfi_ext);
    returnIfErrCS(ERROR(err), err, "%d", err);
    return 0;
}

