#include "lc3_process.h"
#include "lc3_debug.h"
extern "C" {
#define ENABLE_DECODER
#include "lc3plus_dec.h"
}
#define LC3_MODUL 21
//
static int32_t lc3plus_api_decoder_uninit(LC3_Dec_Info * info);
static int32_t lc3plus_api_dec(LC3_Dec_Info* info, void* scratch, void* input_bytes, int32_t num_bytes, void** output_samples, int32_t bfi_ext);
static int32_t lc3plus_api_dec_interlaced(LC3_Dec_Info* info, void* scratch, void* input_bytes, int32_t num_bytes, void* output_samples, int32_t bfi_ext);
//
EXTERNC int32_t lc3_api_decoder_init_plus(LC3_Dec_Info * info) {
    dbgTestPXL("lc3plus dec(v%d)start", lc3plus_dec_version());
    auto check = (info->frame_dms == 100
        || info->frame_dms == 50
        || info->frame_dms == 25
        );
    returnIfErrCS(ERROR(0), !check,"frame_dms=%d(0.1ms)in[100,50,25]", info->frame_dms);
    //
    //info->plcMeth = LC3_API_PLC_ADVANCED;
    info->plcMeth = LC3PLUS_PLCMETH_ADV_TDC_NS;
    //
    int32_t decode_size = 0;
    int err = lc3plus_dec_get_size(info->sample_rate, info->channels, (LC3PLUS_PlcMethod)info->plcMeth, info->frame_dms, &decode_size);
    returnIfErrCS(ERROR(err), err, "%d,get_size()", err);
    returnIfErrCS(ERROR(0), !decode_size, "decode_size=%d", decode_size);
    auto dec = (struct LC3PLUS_Dec*)info->cb_alloc(info->pool, decode_size);
    returnIfErrCS(ERROR(0), !dec, "alloc_decoder(%d)", decode_size);
    info->instance = dec;
    info->instance_size = decode_size;   
    //
    int32_t scratch_size = 0;
    err = lc3plus_dec_init(dec//LC3PLUS_Dec* const decoder
        , info->sample_rate//int32_t const samplerate
        , info->channels//int32_t const channels
        , (LC3PLUS_PlcMethod)info->plcMeth//LC3PLUS_PlcMethod const plc_mode
        , info->frame_dms//int32_t const frame_dms
        , 1//info->hrmode//int32_t const hrmode
        , info->epmode//int32_t const ep_enabled
        , info->bitwidth//int32_t const bps_out
        , &scratch_size//int32_t* const scratchSize
    );
    returnIfErrCS(ERROR(err), err, "%d,dec_init()", err);
    //returnIfErrCS(ERROR(0), !scratch_size, "scratch_size=%d", scratch_size);

    //err = lc3_dec_set_frame_ms(dec, info->frame_dms/10.f);
    //if (err)
    //    return err;
    //
    //err = lc3_dec_set_ep_enabled(dec, info->epmode != 0);
    //if (err)
    //    return err;
    //    
    //dec->sample_bits = info->bitwidth;
    //dec->sample_bits_align = info->bitalign ? info->bitalign : info->bitwidth;
    //info->delay = info->dc ? lc3_dec_get_delay(dec) / info->dc : 0;
    int samples = 0;
    err = lc3plus_dec_get_output_samples(dec, &samples);
    returnIfErrCS(ERROR(err), err, "%d,get_samples()", err);
    info->frame_samples = samples;
    //
    //auto scratch_size = lc3_dec_get_scratch_size(dec);
    if (scratch_size) {
        auto scratch = info->cb_alloc(info->pool, scratch_size);
        returnIfErrCS(ERROR(0), !scratch, "alloc_scratch(%d)", scratch_size);
        info->scratch = scratch;
        info->scratch_size = scratch_size;
    }
    //
    info->cb_decode = &lc3plus_api_dec;
    info->cb_decode_interlaced = &lc3plus_api_dec_interlaced;
    info->cb_uninit = &lc3plus_api_decoder_uninit;
    //
    dbgTestPXL0("lc3plus dec end");
    return 0;
}

static int32_t lc3plus_api_decoder_uninit(LC3_Dec_Info* info) {
    returnIfErrC(ERROR(0), !info);
    returnIfErrC(ERROR(0), !info->instance);
    auto dec = (LC3PLUS_Dec*)info->instance;
    lc3plus_dec_exit(dec);
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

static int32_t lc3plus_api_dec(LC3_Dec_Info*info, void *scratch, void *input_bytes, int32_t num_bytes, void **output_samples, int32_t bfi_ext){
    returnIfErrC(ERROR(0), !info);
    returnIfErrC(ERROR(0), !info->instance);
    returnIfErrC(ERROR(0), info->is_interlaced);
    auto dec = (LC3PLUS_Dec*)info->instance;
    int err = lc3plus_dec_process_frame(
        dec//LC3PLUS_Dec* const decoder
        , input_bytes// void* const input_bytes
        , num_bytes//int32_t const num_bytes
        , bfi_ext//int32_t bfi_ext
        , output_samples//void* const* const output_samples
        , scratch//void* const scratch
        , 0
    );
    returnIfErrCS(ERROR(err), err, "%d", err);
    return 0;
}

static int32_t lc3plus_api_dec_interlaced(LC3_Dec_Info* info, void* scratch, void* input_bytes, int32_t num_bytes, void* output_samples, int32_t bfi_ext) {
    returnIfErrC(ERROR(0), !info);
    returnIfErrC(ERROR(0), !info->instance);
    returnIfErrC(ERROR(0), !info->is_interlaced);
    auto dec = (LC3PLUS_Dec*)info->instance;
    void* outputs[4];
    uint8_t* output = (uint8_t*)output_samples;
    int skip = info->bitalign >>3;
    for (int i = 0; i < info->channels; i++) {
        outputs[i] = output;
        output += skip;
    }
    int bits_skip = info->bitalign ? info->bitalign : info->bitwidth;
    bits_skip *= info->channels;
    int err = lc3plus_dec_process_frame(
        dec//LC3PLUS_Dec* const decoder
        , input_bytes// void* const input_bytes
        , num_bytes//int32_t const num_bytes
        , bfi_ext//int32_t bfi_ext
        , outputs//void* const* const output_samples
        , scratch//void* const scratch
        , bits_skip
    );
    returnIfErrCS(ERROR(err), err, "%d", err);
    return 0;
}

