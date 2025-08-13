
#include "defines.h"
#include "constants.h"
#include "functions.h"


#define BLOCK_SIZE 3
#define THR1 8
#define FAC 9830 /* 0.3 */

void peakDetector_fx(int16_t in_sig[], int16_t yLen, int16_t *xover);

void processPCclassify(int16_t pitch_present, int16_t frame_dms, int16_t q_old_d_fx[], int16_t q_old_res_fx[],
                          int16_t yLen, int16_t spec_inv_idx, int16_t stab_fac, int16_t prev_bfi, int16_t *bfi)
{
    int16_t  maxPitchBin, xover;
    int32_t i;
    int16_t  s, tmp16, full_nrg16, part_nrg16;
    int32_t  full_nrg, part_nrg;

    if (prev_bfi == 1)
        *bfi = 1;
    else if (i_mult(spec_inv_idx, 10) < (frame_dms << 2) )/* Apply classifier only if lower than 2khz signal */
    {
        if (stab_fac < 16384)
            *bfi = 1;
        else if (pitch_present == 1)
        {
            maxPitchBin = 8;  
            if (frame_dms == 50)
                maxPitchBin = 4;  

            /* avoid phase discontinuity in low frequencies */
            peakDetector_fx(q_old_d_fx, yLen, &xover);        
            if ((spec_inv_idx < xover) || (spec_inv_idx < maxPitchBin))
                *bfi = 1;
        }
        else
        {
            s = getScaleFactor16(q_old_res_fx, yLen);

            part_nrg = 0;  
            for(i = 0; i < spec_inv_idx; i++)
            {
                tmp16    = shl_sat(q_old_res_fx[i], (s - 4));
                part_nrg = L_mac0_1(part_nrg, tmp16, tmp16); /* exp = 2s - 8 */
            }

            full_nrg = part_nrg;  
            for(i = spec_inv_idx; i < yLen; i++)
            {
                tmp16    = shl_sat(q_old_res_fx[i], (s - 4));
                full_nrg = L_mac0_1(full_nrg, tmp16, tmp16); /* exp = 2s - 8 */
            }

            s = getScaleFactor32(&full_nrg, 1);
            full_nrg16 = extract_h(L_shl(full_nrg, s));
            part_nrg16 = extract_h(L_shl(part_nrg, s));

            tmp16 = mult(full_nrg16, 9830 /* 0.3 */);
            if (part_nrg16 < tmp16)
                *bfi = 1;
        }
    }
}

void peakDetector_fx(int16_t in_sig[], int16_t yLen, int16_t *xover)
{
    int32_t i, j;
    int16_t  tmp16, c, s, s2, mean_block_nrg16;
    int32_t  maxPeak, tmp32;
    int32_t  mean_block_nrg, block_cent;
    int16_t  cur_max, prev_max, next_max;

    *xover = 0;

    s = getScaleFactor16(in_sig, yLen);

    mean_block_nrg = 0;  
    for(i = 0; i < yLen; i++)
    {
        tmp16          = shl_sat(in_sig[i], sub(s, 4));
        mean_block_nrg = L_mac0_1(mean_block_nrg, tmp16, tmp16); /* exp = 2s - 8 */
    }

    s2               = getScaleFactor16(&yLen, 1);
    c                = shl(yLen, s2);
    mean_block_nrg16 = div_l(mean_block_nrg, c);                                        /* exp = 2s - 8 - s2 - 1 */
    mean_block_nrg   = L_shl(L_mult0(mean_block_nrg16, BLOCK_SIZE * THR1), add(4, s2)); /* exp = 2s - 5 */

    maxPeak = 0;  
    c = sub(yLen, 2 * BLOCK_SIZE);

    
    if (abs_s(in_sig[0]) >= abs_s(in_sig[1]))
    {
        block_cent = 0;  
        for(j = 0; j <= 1; j++)
        {
            tmp16      = shl_sat(in_sig[j], sub(s, 2));
            block_cent = L_mac0_1(block_cent, tmp16, tmp16); /* -> exp = 2s - 4 */
        }
        block_cent = L_shr(block_cent, 1); /* exp = 2s - 5 */

        if (L_sub(block_cent, mean_block_nrg) > 0)
        {
            cur_max = abs_s(in_sig[0]);
            cur_max = MAX(abs_s(in_sig[1]), cur_max);

            next_max = abs_s(in_sig[-1 + BLOCK_SIZE]);
            next_max = MAX(abs_s(in_sig[-1 + BLOCK_SIZE + 1]), next_max);
            next_max = MAX(abs_s(in_sig[-1 + BLOCK_SIZE + 2]), next_max);

            if (sub(cur_max, next_max) > 0)
            {
                maxPeak = block_cent;  
                *xover = 1;
            }
        }
    }

    for(i = 0; i < BLOCK_SIZE; i++)
    {
        
        if (abs_s(in_sig[i + 1]) >= abs_s(in_sig[i]) && abs_s(in_sig[i + 1]) >= abs_s(in_sig[i + 2]))
        {
            block_cent = 0;  
            for(j = 0; j < BLOCK_SIZE; j++)
            {
                tmp16      = shl_sat(in_sig[i + j], sub(s, 2));
                block_cent = L_mac0_1(block_cent, tmp16, tmp16); /* -> exp = 2s - 4 */
            }
            block_cent = L_shr(block_cent, 1); /* exp = 2s - 5 */

            if (L_sub(block_cent, mean_block_nrg) > 0)
            {
                cur_max = abs_s(in_sig[i]);
                cur_max = MAX(abs_s(in_sig[i + 1]), cur_max);
                cur_max = MAX(abs_s(in_sig[i + 2]), cur_max);

                prev_max = 0;  
                for(j = i - BLOCK_SIZE; j <= i - 1; j++)
                {
                    if (j > 0)
                    {
                        prev_max = MAX(abs_s(in_sig[j]), prev_max);
                    }
                }

                next_max = abs_s(in_sig[i + BLOCK_SIZE]);
                next_max = MAX(abs_s(in_sig[i + BLOCK_SIZE + 1]), next_max);
                next_max = MAX(abs_s(in_sig[i + BLOCK_SIZE + 2]), next_max);

                
                if (sub(cur_max, prev_max) >= 0 && sub(cur_max, next_max) > 0)
                {
                    if (L_sub(block_cent, maxPeak) >= 0)
                    {
                        maxPeak = block_cent;  
                        *xover = sub(add(i, BLOCK_SIZE), 1);
                    }
                    else
                    {
                        tmp32 = L_mult(FAC, extract_h(maxPeak));

                        tmp16 = extract_l(L_shr(maxPeak, 1));
                        tmp16 = s_and(tmp16, 0x7fff);
                        tmp16 = mult(FAC, tmp16);
                        tmp32 = L_add_sat(tmp32, tmp16);

                        if (L_sub(block_cent, tmp32) > 0)
                        {
                            *xover = sub(add(i, BLOCK_SIZE), 1);
                        }
                    }
                }
            }
        }
    }

    for(i = BLOCK_SIZE; i <= c; i++)
    {
        
        if (abs_s(in_sig[i + 1]) >= abs_s(in_sig[i]) && abs_s(in_sig[i + 1]) >= abs_s(in_sig[i + 2]))
        {
            block_cent = 0;  
            for(j = 0; j < BLOCK_SIZE; j++)
            {
                tmp16      = shl_sat(in_sig[i + j], sub(s, 2));
                block_cent = L_mac0_1(block_cent, tmp16, tmp16); /* -> exp = 2s - 4 */
            }
            block_cent = L_shr(block_cent, 1); /* exp = 2s - 5 */

            if (L_sub(block_cent, mean_block_nrg) > 0)
            {
                cur_max = abs_s(in_sig[i]);
                cur_max = MAX(abs_s(in_sig[i + 1]), cur_max);
                cur_max = MAX(abs_s(in_sig[i + 2]), cur_max);

                prev_max = abs_s(in_sig[i - BLOCK_SIZE]);
                prev_max = MAX(abs_s(in_sig[i - BLOCK_SIZE + 1]), prev_max);
                prev_max = MAX(abs_s(in_sig[i - BLOCK_SIZE + 2]), prev_max);

                next_max = abs_s(in_sig[i + BLOCK_SIZE]);
                next_max = MAX(abs_s(in_sig[i + BLOCK_SIZE + 1]), next_max);
                next_max = MAX(abs_s(in_sig[i + BLOCK_SIZE + 2]), next_max);

                
                if (sub(cur_max, prev_max) >= 0 && sub(cur_max, next_max) > 0)
                {
                    if (L_sub(block_cent, maxPeak) >= 0)
                    {
                        maxPeak = block_cent;  
                        *xover = sub(add(i, BLOCK_SIZE), 1);
                    }
                    else
                    {
                        tmp32 = L_mult(FAC, extract_h(maxPeak));

                        tmp16 = extract_l(L_shr(maxPeak, 1));
                        tmp16 = s_and(tmp16, 0x7fff);
                        tmp16 = mult(FAC, tmp16);
                        tmp32 = L_add_sat(tmp32, tmp16);

                        if (L_sub(block_cent, tmp32) > 0)
                        {
                            *xover = sub(add(i, BLOCK_SIZE), 1);
                        }
                    }
                }
            }
        }
    }
}


