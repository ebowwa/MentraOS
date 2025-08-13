
#include "functions.h"


void processEstimateGlobalGain(int32_t x[], int16_t x_e, int16_t lg, int16_t nbitsSQ, int16_t *gain, int16_t *gain_e,
                                  int16_t *quantizedGain, int16_t *quantizedGainMin, int16_t quantizedGainOff,
                                  int32_t *targetBitsOff, int16_t *old_targetBits, int16_t old_specBits,
                                  int8_t *scratchBuffer)
{

    int16_t  lg_4, s, tmp16, iszero;
    int32_t  ener, tmp32, x_max;
    int32_t  target, fac, offset;
    int32_t *en;
    int32_t i, iter;
    int32_t diff, diff2;

    en = (int32_t *)scratchBuffer; /* Size = 4 * MAX_LEN bytes */

    if (*old_targetBits < 0)
    {
        *targetBitsOff = 0; 
    }
    else
    {
        tmp32          = L_add(*targetBitsOff, L_deposit_h(sub(*old_targetBits, old_specBits)));
        tmp32          = min((40 << 16), max(-(40 << 16), tmp32));
        *targetBitsOff = L_add(Mpy_32_16(*targetBitsOff, 26214), Mpy_32_16(tmp32, 6554)); 
    }

    *old_targetBits = nbitsSQ; 
    nbitsSQ         = add(nbitsSQ, round_fx(*targetBitsOff));

    lg_4  = shr_pos(lg, 2);
    x_max = 0; 

/* energy of quadruples with 9dB offset */
    for(i = 0; i < lg_4; i++)
    {
        /* normalization */
        s = 31; 

        tmp32 = L_abs(x[0]);
        tmp32 = max(tmp32, L_abs(x[1]));
        tmp32 = max(tmp32, L_abs(x[2]));
        tmp32 = max(tmp32, L_abs(x[3]));
        x_max = max(x_max, tmp32);

        if (tmp32 != 0)
            s = norm_l(tmp32);

        s = sub(s, 2); /* 2 bits headroom */

        /* calc quadruple energy */
        ener = L_deposit_l(1);

        tmp16 = round_fx(L_shl(x[0], s));
        ener  = L_mac(ener, tmp16, tmp16);

        tmp16 = round_fx(L_shl(x[1], s));
        ener  = L_mac(ener, tmp16, tmp16);

        tmp16 = round_fx(L_shl(x[2], s));
        ener  = L_mac(ener, tmp16, tmp16);

        tmp16 = round_fx(L_shl(x[3], s));
        ener  = L_mac(ener, tmp16, tmp16);

        s = shl_pos(sub(x_e, s), 1);
#ifdef NON_BE_GAIN_EST_FIX
        if (ener==1 && s < 0) s = 0;
#endif
        /* log */
        tmp32 = L_add(LC3_Log2(ener), L_shl_pos(L_deposit_l(s), 25)); /* log2, 6Q25 */
        tmp32 = L_add(L_shr_pos(Mpy_32_16(tmp32, 0x436E), 6), 0x9CCCD); /* -> (28/20)*(7+10*tmp32/log2(10)), 15Q16 */
        en[i] = tmp32;                                                  
        x += 4;
    }

    if (x_max == 0)
    {
        *quantizedGainMin = quantizedGainOff; 
        *quantizedGain    = 0;                
        *old_targetBits   = -1;               
    }
    else
    {
        /* Minimum gain */
        x_max             = LC3_Log2(x_max);
        x_max             = L_add(x_max, L_shl_pos(L_deposit_l(x_e), 25)); /* log2(x_max) in 6Q25 */
        x_max             = L_sub(Mpy_32_32(x_max, 0x436E439A), 0xFCDD6B4); /* 28*log10(x_max/(32768-0.375)) = log2(x_max)*(28/log2(10))-28*log10(32768-0.375) in 10Q21 */
        *quantizedGainMin = extract_l(L_shr_pos(L_add(x_max, (1 << 21) + (1 << 11)), 21)); 
        ASSERT_LC3(*quantizedGainMin <= 255 + quantizedGainOff);
        *quantizedGainMin = max(quantizedGainOff, min(add(255, quantizedGainOff), *quantizedGainMin));

        /* SQ scale: 4 bits / 6 dB per quadruple */
        target = L_shl_pos(L_mult(0x7D71, nbitsSQ), 1); /* -> (28/20) * (1.4) * nbitsSQ */
        fac = L_add(0x1000000, 0); /* -> 256 */
        offset = L_deposit_h(add(255, quantizedGainOff)); /* -> 127 */

        /* find offset (0 to 127) */
        for(iter = 0; iter < 8; iter++)
        {
            fac    = L_shr_pos(fac, 1);
            offset = L_sub(offset, fac);

            ener   = L_deposit_l(0);
            iszero = 1; 
            for(i = lg_4 - 1; i >= 0; i--)
            {
                tmp32 = L_sub(en[i], offset);
                diff  = L_sub(tmp32, 0x9CCCD); /* 0x9CCCD -> (28/20)*(7) */
                if (diff < 0 && iszero == 0)
                {
                    ener = L_add(ener, 0x3C7AE); /* 0x3C7AE -> (28/20)*(2.7) */
                }
                if (diff >= 0)
                {
                    ener   = L_add(ener, tmp32);
                    iszero = 0; 
                }
                diff2 = L_sub(tmp32, 0x460000); /* 0x460000 -> (28/20)*(50) */
                if (diff2 >= 0)
                {
                    ener = L_add(ener, diff2);
                }
            }

            /* if ener is above target -> increase offset */
            
            if (L_sub(ener, target) > 0 && iszero == 0)
            {
                offset = L_add(offset, fac);
            }
        }

        tmp16 = extract_h(offset);
        if (sub(tmp16, *quantizedGainMin) < 0)
        {
            *old_targetBits = -1; 
        }
        *quantizedGain = sub(max(*quantizedGainMin, tmp16), quantizedGainOff); 
    }

    tmp32 =
        L_shl_pos(L_mult0(add(*quantizedGain, quantizedGainOff), 0x797D), 7); /* 6Q25; 0x797D -> log2(10)/28 (Q18) */
    *gain_e = add(extract_l(L_shr_pos(tmp32, 25)), 1);                        /* get exponent */
    *gain   = round_fx(InvLog2(L_or(tmp32, 0xFE000000)));

}

