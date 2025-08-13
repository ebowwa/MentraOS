
#include "functions.h"


void processApplyGlobalGain(int32_t x[], int16_t *x_e, int16_t xLen, int16_t global_gain_idx, int16_t global_gain_off)
{
    int32_t i;
    int16_t global_gain, global_gain_e;
    int32_t tmp32;

    tmp32 = L_shl_pos(L_mult0(add(global_gain_idx, global_gain_off), 0x797D), 7);
    global_gain_e = add(extract_l(L_shr_pos(tmp32, 25)), 1);
    global_gain = round_fx(InvLog2(tmp32 | 0xFE000000));

    for(i = 0; i < xLen; i++)
        x[i] = Mpy_32_16(x[i], global_gain);

    *x_e = (*x_e) + global_gain_e;
}

