
#include "functions.h"
#include "lc3_debug.h"

void processOutputScaling(int16_t* x_fx, void* s_out, int32_t bits_per_sample, int16_t q_fx_exp, int16_t frame_length)
{
    int16_t scale;
    int16_t skip;
    int32_t offset;
    int32_t i, j;

    int bits_skip = bits_per_sample >> 16;
    bits_per_sample &= 0xffff;
    if (!bits_skip) bits_skip = bits_per_sample;
    scale  = 31 + 16 - bits_per_sample - q_fx_exp;
    //dbgTestPDL(bits_skip);
    //dbgTestPDL(bits_per_sample);
    //dbgTestPDL(scale);
    if (bits_per_sample == 16)
    {
        int out_skip = bits_skip >> 4;//16bits
        int16_t * out = (int16_t*)s_out;
        scale = 15 - q_fx_exp;
        for(i = 0, j = 0; i < frame_length; i++, j+=skip)
        {
            *out = round_fx_sat(L_shr_sat(L_deposit_h(x_fx[i]), scale));
            out += out_skip;
        }
    }else if(bits_per_sample == 24){
        int out_skip = bits_skip >> 3;//8bits
        uint8_t* out = (uint8_t*)s_out;
        offset = L_shr_sat(128, (16 - scale));
        for (int i = 0; i < frame_length; i++)
        {
            int32_t tmp = L_shr_sat(L_add_sat(L_deposit_h(x_fx[i]), offset), scale);
            out[0] = tmp & 0xff;
            out[1] = (tmp >> 8) & 0xff;
            out[2] = (tmp >> 16) & 0xff;
            out[3] = (tmp >> 24) & 0xff;///[err]err for 24 align.
            out+=out_skip;
        }
    }else{//32 bits
        int out_skip = bits_skip >> 5;//32bits
        int32_t* out = (int32_t*)s_out;
        offset = L_shr_sat(32768, (16 - scale));
        for(i = 0, j = 0; i < frame_length; i++, j += skip)
        {
            *out = L_shr_sat(L_add_sat(L_deposit_h(x_fx[i]), offset), scale);
            out += out_skip;
        }
    }
}

