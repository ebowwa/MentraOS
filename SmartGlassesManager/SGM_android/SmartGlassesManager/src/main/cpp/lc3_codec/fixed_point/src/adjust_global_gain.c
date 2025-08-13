
#include "functions.h"


void processAdjustGlobalGain(int16_t *gg_idx, int16_t gg_idx_min, int16_t gg_idx_off, int16_t *gain, int16_t *gain_e,
                                int16_t target, int16_t nBits, int16_t *gainChange, int16_t fs_idx)
{
    int32_t L_tmp;
    int16_t delta, delta2;

    if (sub(nBits, adjust_global_gain_tables[0][fs_idx]) < 0)
    {
        delta = mult_r(add(nBits, 48), 2048);
    }
    else if (sub(nBits, adjust_global_gain_tables[1][fs_idx]) < 0)
    {
        delta = mult_r(add(nBits, adjust_global_gain_tables[4][fs_idx]), adjust_global_gain_tables[3][fs_idx]);
    }
    else if (sub(nBits, adjust_global_gain_tables[2][fs_idx]) < 0)
    {
        delta = mult_r(nBits, 683);
    }
    else
    {
        delta = mult_r(adjust_global_gain_tables[2][fs_idx], 683);
    }
    delta2 = add(delta, 2);

    *gainChange = 0; 

    
    if (sub(*gg_idx, 255) == 0 && sub(nBits, target) > 0)
    {
        *gainChange = 1; 
    }

      
    if ((sub(*gg_idx, 255) < 0 && sub(nBits, target) > 0) || (*gg_idx > 0 && sub(nBits, sub(target, delta2)) < 0))
    {
        
        if (sub(nBits, sub(target, delta2)) < 0)
        {
            *gg_idx = sub(*gg_idx, 1); 
        }
        else if (sub(*gg_idx, 254) == 0 || sub(nBits, add(target, delta)) < 0)
        {
            *gg_idx = add(*gg_idx, 1); 
        }
        else
        {
            *gg_idx = add(*gg_idx, 2); 
        }

        *gg_idx = max(*gg_idx, sub(gg_idx_min, gg_idx_off)); 

        L_tmp       = L_shl_pos(L_mult0(add(*gg_idx, gg_idx_off), 0x797D), 7); /* 6Q25; 0x797D -> log2(10)/28 (Q18) */
        *gain_e     = add(extract_l(L_shr_pos(L_tmp, 25)), 1);                 /* get exponent */
        *gain       = round_fx(InvLog2(L_or(L_tmp, 0xFE000000)));
        *gainChange = 1; 
    }
}

