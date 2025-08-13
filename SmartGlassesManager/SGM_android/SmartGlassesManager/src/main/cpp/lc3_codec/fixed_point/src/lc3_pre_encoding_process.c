
#include "functions.h"
#include "lc3_debug.h"

void lc3_pre_encoding_process(int32_t* input, int16_t* output, LC3_Enc * pEncoder, EncSetup * pEncSetup, int32_t bits_per_sample, void* scratch)
{
    int32_t *x = input;
    int16_t* x_scaled = output;
    
    int16_t *x_exp = &pEncSetup->x_exp;
    int16_t* mdct_mem = pEncSetup->stEnc_mdct_mem; 
    int16_t mdct_mem_len = pEncoder->stEnc_mdct_mem_len;
    int16_t* resample_mem_in = pEncSetup->r12k8_mem_in;
    int16_t resample_mem_in_len = pEncoder->r12k8_mem_in_len;
    int32_t* resample_mem_in50 = pEncSetup->r12k8_mem_50;
    int16_t* resample_mem_out = pEncSetup->r12k8_mem_out;
    int16_t resample_mem_out_len = pEncoder->r12k8_mem_out_len;
    int32_t* mdct_mem32 = pEncSetup->mdct_mem32;
    int16_t N = pEncoder->frame_length;
    int32_t* resamp_mem32 = pEncSetup->resamp_mem32;
    int16_t* mem_s12k8 = pEncSetup->olpa_mem_s12k8;
    int16_t *resamp_scale = &pEncSetup->resamp_exp;

    int16_t i;
    int16_t s;
    int16_t scales[6];

    int16_t bits_skip = bits_per_sample >> 16;
    bits_per_sample &= 0xffff;
    if (!bits_skip) bits_skip = bits_per_sample;
    //dbgTestPDL(bits_per_sample);
    //dbgTestPDL(bits_skip);
    //dbgTestPPL(scratch);
    //dbgTestPPL(output);
    //dbgTestPPL(input);
    if (bits_per_sample == 16) {
        int in_skip = bits_skip >> 4;//for 16bits.
        int16_t N = pEncoder->frame_length;
        int16_t* in = (int16_t*)input;
        for (int i = 0; i < N; i++) {
            output[i] = *in;
            in += in_skip;
        }
        return;
    }else if(24 == bits_per_sample)
    {
        x = (int32_t*)scratch;
        int32_t* xs = (int32_t*)x;
        int in_skip = bits_skip >> 3;//for 8bits
        //
        uint8_t* in = (uint8_t*)input;
        for (int i = 0; i < N; i++)
        {
            int32_t tmp_x = 0;
            tmp_x |= in[0];
            tmp_x |= in[1] << 8;
            tmp_x |= in[2] << 16;
            //if (tmp_x & 0x00800000)tmp_x |= 0xff000000;
            xs[i] = tmp_x << 8 >> 8;
            in += in_skip;
        }
    }else{
        x = (int32_t*)scratch;
        int32_t* xs = (int32_t*)x;
        int in_skip = bits_skip >> 5;//for 32bits
        int32_t* in = (int32_t*)input;
        for (int i = 0; i < N; i++)
        {
            xs[i] = in[0] >> 8;
            in += in_skip;
        }
    }
    /* Scale input for 24 bit case */

    /* Find maximum exponent */
    scales[0] = sub(15 + 8, getScaleFactor32_0(x, N));
    scales[1] = sub(15 + 8, getScaleFactor32_0(mdct_mem32, mdct_mem_len));
    scales[2] = sub(15 + 8, getScaleFactor32_0(resamp_mem32, resample_mem_in_len));
    scales[3] = sub(sub(*resamp_scale, 2), getScaleFactor32_0(resample_mem_in50, 2));
    scales[4] = sub(sub(*resamp_scale, 2), getScaleFactor16_0(resample_mem_out, resample_mem_out_len));
    scales[5] = sub(sub(*resamp_scale, 2), getScaleFactor16_0(mem_s12k8, 3));
    *x_exp    = 7; 
    for(i = 0; i < 6; i++)
    {
        *x_exp = max(*x_exp, scales[i]); 
    }

    /* Shift input buffers */
    s = sub(15 + 8, *x_exp);
    for(i = 0; i < N; i++)
    {
        x_scaled[i] = round_fx_sat(L_shl(x[i], s));
    }

    for(i = 0; i < mdct_mem_len; i++)
    {
        mdct_mem[i] = round_fx_sat(L_shl(mdct_mem32[i], s));
    }

    for(i = 0; i < resample_mem_in_len; i++)
    {
        resample_mem_in[i] = round_fx_sat(L_shl(resamp_mem32[i], s));
    }

    /* Adjust resampler filter and output buffers */
    s             = sub(sub(*resamp_scale, 2), *x_exp);
    *resamp_scale = add(*x_exp, 2);

    if (s)
    {
        for(i = 0; i < 2; i++)
        {
            resample_mem_in50[i] = L_shl(resample_mem_in50[i], s);
        }
        for(i = 0; i < resample_mem_out_len; i++)
        {
            resample_mem_out[i] = shl(resample_mem_out[i], s);
        }

        for(i = 0; i < 3; i++)
        {
            mem_s12k8[i] = shl(mem_s12k8[i], s);
        }
    }

    /* Store part of current frame as mdct memory buffer and resampler input buffer for next frame */
    memcpy(mdct_mem32, &x[N - mdct_mem_len], mdct_mem_len * sizeof(int32_t));
    memmove(resamp_mem32, &x[N - resample_mem_in_len], resample_mem_in_len * sizeof(int32_t));
}
    
