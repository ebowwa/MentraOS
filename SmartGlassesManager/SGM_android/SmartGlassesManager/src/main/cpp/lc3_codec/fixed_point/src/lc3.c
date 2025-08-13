
#include "defines.h"
#include "functions.h"
#include "lc3.h"
#include "setup_dec_lc3.h"
#include "setup_enc_lc3.h"


#define RETURN_IF(cond, error)                                                                                         \
    if (cond)                                                                                                          \
    return (error)
#if 0
#pragma message("PROFILE CONFIG: " PROFILE)
#ifdef SUBSET_NB
#pragma message("- SUBSET_NB")
#endif
#ifdef SUBSET_SQ
#pragma message("- SUBSET_SQ")
#endif
#ifdef SUBSET_HQ
#pragma message("- SUBSET_HQ")
#endif
#ifdef SUBSET_SWB
#pragma message("- SUBSET_SWB")
#endif
#ifdef SUBSET_FB
#pragma message("- SUBSET_FB")
#endif
#endif
/* ensure api header constants are up to date */
STATIC_ASSERT_1(LC3_MAX_SAMPLES >= MAX_LEN);
STATIC_ASSERT_1(LC3_MAX_CHANNELS >= MAX_CHANNELS);
STATIC_ASSERT_1(LC3_MAX_BYTES >= BYTESBUFSIZE);
STATIC_ASSERT_1(LC3_ENC_MAX_SIZE >= ENC_MAX_SIZE);
STATIC_ASSERT_1(LC3_DEC_MAX_SIZE >= DEC_MAX_SIZE);
STATIC_ASSERT_1(LC3_ENC_MAX_SCRATCH_SIZE >= SCRATCH_BUF_LEN_ENC_TOT);
STATIC_ASSERT_1(LC3_DEC_MAX_SCRATCH_SIZE >= SCRATCH_BUF_LEN_DEC_TOT);


/* misc functions ************************************************************/

int32_t lc3_channels_supported(int32_t channels)
{
    return channels >= 1 && channels <= MAX_CHANNELS;
}

int32_t lc3_samplerate_supported(int32_t samplerate)
{
    switch (samplerate)
    {
#ifdef SUBSET_NB
    case 8000: return 1;
#endif
#ifdef SUBSET_SQ
    case 16000: return 1;
#endif
#ifdef SUBSET_HQ
    case 24000: return 1;
#endif
#ifdef SUBSET_SWB
    case 32000: return 1;
#endif
#ifdef SUBSET_FB
    case 44100: return 1;
    case 48000: return 1;
#endif
    default: return 0;
    }
}

int32_t lc3_plc_mode_supported(LC3_PlcMode plc_mode)
{
    switch ((int32_t)plc_mode)
    {
    case LC3_PLC_ADVANCED: /* fallthru */
        return 1;
    default: return 0;
    }
}

static int32_t lc3_frame_size_supported(float frame_ms)
{
    switch ((int32_t)(frame_ms * 10))
    {
    case 25: /* fallthru */
    case 50: /* fallthru */
    case 100: return 1;
    default: return 0;
    }
}

static int32_t null_in_list(void **list, int32_t n)
{
    while (--n >= 0)
        RETURN_IF(list[n] == NULL, 1);
    return 0;
}

/* return pointer to aligned base + base_size, *base_size += size + 4 bytes align */
void *balloc(void *base, size_t *base_size, size_t size)
{
    uintptr_t ptr = ((uintptr_t)base + *base_size + 3) & ~3;
    assert((uintptr_t)base % 4 == 0); /* base must be 4-byte aligned */
    *base_size = (*base_size + size + 3) & ~3;
    return (void *)ptr;
}

/* encoder functions *********************************************************/

LC3_Error lc3_enc_init(LC3_Enc *encoder, int32_t samplerate, int32_t channels)
{
    RETURN_IF(encoder == NULL, LC3_NULL_ERROR);
    RETURN_IF((uintptr_t)encoder % 4 != 0, LC3_ALIGN_ERROR);
    RETURN_IF(!lc3_samplerate_supported(samplerate), LC3_SAMPLERATE_ERROR);
    RETURN_IF(!lc3_channels_supported(channels), LC3_CHANNELS_ERROR);
    return FillEncSetup(encoder, samplerate, channels); /* real bitrate check happens here */
}

int32_t lc3_enc_get_input_samples(const LC3_Enc *encoder)
{
    RETURN_IF(encoder == NULL, 0);
    return encoder->frame_length;
}

int32_t lc3_enc_get_num_bytes(const LC3_Enc *encoder)
{
    RETURN_IF(encoder == NULL, 0);
    return (int32_t)encoder->bitrate * encoder->frame_length / (8 * encoder->fs_in);
}

int32_t lc3_enc_get_real_bitrate(const LC3_Enc *encoder)
{
    int32_t ch = 0, totalBytes = 0;
    RETURN_IF(encoder == NULL, 0);
    RETURN_IF(!encoder->lc3_br_set, LC3_BITRATE_UNSET_ERROR);
    for (ch = 0; ch < encoder->channels; ch++)
    {
        totalBytes += encoder->channel_setup[ch]->targetBytes;
    }
    int32_t bitrate = (totalBytes * 80000)/ encoder->frame_dms;
    if (encoder->fs_in == 44100)
    {
        int32_t rem = bitrate % 480;
        bitrate = ((bitrate - rem) / 480)* 441 + (rem * 441) / 480;
    }
    return bitrate;
}

LC3_Error lc3_enc_set_bitrate(LC3_Enc *encoder, int32_t bitrate)
{
    RETURN_IF(encoder == NULL, LC3_NULL_ERROR);
    RETURN_IF(bitrate <= 0, LC3_BITRATE_ERROR);
    return update_enc_bitrate(encoder, bitrate);
}

int32_t lc3_enc_get_delay(const LC3_Enc *encoder)
{
    RETURN_IF(encoder == NULL, 0);
    return encoder->frame_length - 2 * encoder->la_zeroes;
}

LC3_Error lc3_enc_set_ep_mode(LC3_Enc *encoder, LC3_EpMode epmode)
{
    RETURN_IF(encoder == NULL, LC3_NULL_ERROR);
    RETURN_IF((unsigned)epmode > LC3_EP_HIGH, LC3_EPMODE_ERROR);
    encoder->epmode = epmode;
    return encoder->lc3_br_set ? update_enc_bitrate(encoder, encoder->bitrate) : LC3_OK;
}

LC3_Error lc3_enc_set_ep_mode_request(LC3_Enc *encoder, LC3_EpModeRequest epmr)
{
    RETURN_IF(encoder == NULL, LC3_NULL_ERROR);
    RETURN_IF((unsigned)epmr > LC3_EPMR_HIGH, LC3_EPMR_ERROR);
    encoder->epmr = epmr;
    return LC3_OK;
}

LC3_Error lc3_enc_set_frame_ms(LC3_Enc *encoder, float frame_ms)
{
    RETURN_IF(encoder == NULL, LC3_NULL_ERROR);
    RETURN_IF(!lc3_frame_size_supported(frame_ms), LC3_FRAMEMS_ERROR);
    RETURN_IF(encoder->lc3_br_set, LC3_BITRATE_SET_ERROR);
    encoder->frame_dms = (int32_t)(frame_ms * 10);
    set_enc_frame_params(encoder);
    return LC3_OK;
}

LC3_Error lc3_enc_set_bandwidth(LC3_Enc *encoder, int32_t bandwidth)
{
    RETURN_IF(encoder == NULL, LC3_NULL_ERROR);
    int32_t effective_fs = encoder->fs_in;
    if (encoder->bandwidth != bandwidth) {
        if (encoder->fs_in > 40000) {
            effective_fs = 40000;
        }
        if ((bandwidth * 2) > effective_fs) {
            return LC3_BW_WARNING;
        }
        else {
            encoder->bandwidth = bandwidth;
            encoder->bw_ctrl_cutoff_bin = (div_l(L_mult0(bandwidth,encoder->frame_dms),(5000>>1)));
            encoder->bw_index = max(0,extract_l(div_l(bandwidth,(4000>>1))-1));
        }
    }
    return LC3_OK;
}

int32_t lc3_enc_get_size(int32_t samplerate, int32_t channels)
{
    RETURN_IF(!lc3_samplerate_supported(samplerate), 0);
    RETURN_IF(!lc3_channels_supported(channels), 0);
    return get_encoder_mem_size(samplerate, channels);
}

LC3_Error lc3_enc(LC3_Enc *encoder, void *scratch, void **input_samples, int32_t bitdepth, void *output_bytes, int32_t num_bytes)
{
    RETURN_IF(!encoder || !input_samples || !output_bytes || !num_bytes || !scratch, LC3_NULL_ERROR);
    RETURN_IF(null_in_list(input_samples, encoder->channels), LC3_NULL_ERROR);
    int bits = bitdepth & 0xffff;
    RETURN_IF(bits != 16 && bits != 24 && bits != 32, LC3_ERROR);
    RETURN_IF(!encoder->lc3_br_set, LC3_BITRATE_UNSET_ERROR);
    int size = Enc_LC3(encoder, input_samples, bitdepth, (uint8_t*)output_bytes, scratch, num_bytes == -1);
    assert(size == lc3_enc_get_num_bytes(encoder));
    return LC3_OK;
}

int32_t lc3_enc_get_scratch_size(const LC3_Enc* encoder) {
    if (!encoder)return LC3_ERROR;
    LC3_Enc* enc = (LC3_Enc*)encoder;
    int32_t size = 0;
    RETURN_IF(enc == NULL, 0);
    size = 14 * MAX(enc->frame_length, 160) + 64;
    assert(size <= LC3_ENC_MAX_SCRATCH_SIZE);
    return size;    
}

/* decoder functions *********************************************************/

LC3_Error lc3_dec_init(LC3_Dec *decoder, int32_t samplerate, int32_t channels, LC3_PlcMode plc_mode)
{
    RETURN_IF(decoder == NULL, LC3_NULL_ERROR);
    RETURN_IF(!lc3_samplerate_supported(samplerate), LC3_SAMPLERATE_ERROR);
    RETURN_IF(!lc3_channels_supported(channels), LC3_CHANNELS_ERROR);
    RETURN_IF(!lc3_plc_mode_supported(plc_mode), LC3_PLCMODE_ERROR);
    return FillDecSetup(decoder, samplerate, channels, plc_mode);
}

LC3_Error lc3_dec_set_ep_enabled(LC3_Dec *decoder, int32_t ep_enabled)
{
    RETURN_IF(decoder == NULL, LC3_NULL_ERROR);
    decoder->ep_enabled = ep_enabled != 0;
    decoder->epmr       = LC3_EPMR_ZERO;
    return LC3_OK;
}

int32_t lc3_dec_get_error_report(const LC3_Dec *decoder)
{
    RETURN_IF(decoder == NULL, 0);
    return decoder->error_report;
}

LC3_EpModeRequest lc3_dec_get_ep_mode_request(const LC3_Dec *decoder)
{
    RETURN_IF(decoder == NULL, LC3_EPMR_ZERO);
    return (LC3_EpModeRequest)decoder->epmr;
}

LC3_Error lc3_dec_set_frame_ms(LC3_Dec *decoder, float frame_ms)
{
    RETURN_IF(decoder == NULL, LC3_NULL_ERROR);
    RETURN_IF(!lc3_frame_size_supported(frame_ms), LC3_FRAMEMS_ERROR);
    RETURN_IF(decoder->plcMeth == 2 && frame_ms != 10, LC3_FRAMEMS_ERROR);

    decoder->frame_dms = (int32_t)(frame_ms * 10);
    set_dec_frame_params(decoder);
    return LC3_OK;
}

int32_t lc3_dec_get_output_samples(const LC3_Dec *decoder)
{
    RETURN_IF(decoder == NULL, 0);
    return decoder->frame_length;
}

int32_t lc3_dec_get_delay(const LC3_Dec *decoder)
{
    RETURN_IF(decoder == NULL, 0);
    return decoder->frame_length - 2 * decoder->la_zeroes;
}

LC3_Error lc3_dec(LC3_Dec *decoder, void *scratch, void *input_bytes, int32_t num_bytes, 
                                void **output_samples, int32_t bitdepth, int32_t bfi_ext)
{
    RETURN_IF(!decoder || !input_bytes || !output_samples || !scratch, LC3_NULL_ERROR);
    RETURN_IF(null_in_list(output_samples, decoder->channels), LC3_NULL_ERROR);
    int bits = bitdepth & 0xffff;
    RETURN_IF(bits != 16 && bits != 24 && bits != 32, LC3_ERROR);
    return Dec_LC3(decoder, input_bytes, num_bytes, output_samples, bitdepth, scratch, bfi_ext);
}

int32_t lc3_dec_get_size(int32_t samplerate, int32_t channels, LC3_PlcMode plc_mode)
{
    RETURN_IF(!lc3_samplerate_supported(samplerate), 0);
    RETURN_IF(!lc3_channels_supported(channels), 0);
    RETURN_IF(!lc3_plc_mode_supported(plc_mode), LC3_PLCMODE_ERROR);
    return alloc_decoder(NULL, samplerate, channels, plc_mode);
}

int32_t lc3_dec_get_scratch_size(const LC3_Dec* decoder)
{
    LC3_Dec* dec = (LC3_Dec*)decoder;
    if (!dec)
        return LC3_ERROR;
    int32_t size = 0;
    RETURN_IF(dec == NULL, 0);
    size = 12 * DYN_MAX_LEN(dec->fs) + 752;
    if (dec->plcMeth != LC3_PLC_STANDARD)
        size += 2 * MAX_LGW + 8 * DYN_MAX_LPROT(dec->fs) + 8 * DYN_MAX_LEN(dec->fs);
    assert(size <= LC3_DEC_MAX_SCRATCH_SIZE);
    return size;
}
