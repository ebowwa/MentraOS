
#include "functions.h"


void process_olpa(int16_t *mem_s6k4_exp, int16_t mem_s12k8[], int16_t mem_s6k4[], int16_t *pitch, int16_t *s12k8,
                     int16_t len, int16_t *normcorr, int16_t *mem_pitch, int16_t s12k8_exp, int8_t *scratchBuffer)
{
    int32_t  sum, sum0, sum1, sum2, prod, inv;
    int16_t  shift, s6k4_exp, prod_exp, min_pitch, max_pitch;
    int16_t  scale0, scale1, scale2, pitch2, normcorr2, len2;
    int32_t  max32;
    int32_t *ac;
    int16_t *s6k4;
    int32_t n;

    int32_t m;
    int32_t  L_tmp, L_tmp2;

    /* Buffer alignment */
    ac = (int32_t *)scratchBuffer; /* Size = 4 * RANGE_PITCH_6K4 = 392 bytes */

    /* Downsample input signal by a factor of 2 (12.8kHz -> 6.4kHz) */
    s6k4    = mem_s6k4 + MAX_PITCH_6K4;
    sum     = L_mac(L_mac(L_mult(mem_s12k8[0], 4053), mem_s12k8[1], 7712), mem_s12k8[2], 9239);
    *s6k4++ = round_fx(L_mac(L_mac(sum, s12k8[0], 7712), s12k8[1], 4053)); 
    sum     = L_mac(L_mac(L_mult(mem_s12k8[2], 4053), s12k8[0], 7712), s12k8[1], 9239);
    *s6k4++ = round_fx(L_mac(L_mac(sum, s12k8[2], 7712), s12k8[3], 4053)); 

    for(n = 5; n < len; n += 2)
    {
        sum     = L_mac(L_mac(L_mult(s12k8[n - 4], 4053), s12k8[n - 3], 7712), s12k8[n - 2], 9239);
        *s6k4++ = round_fx(L_mac(L_mac(sum, s12k8[n - 1], 7712), s12k8[n], 4053)); 
    }

    mem_s12k8[0] = s12k8[len - 3]; 
    mem_s12k8[1] = s12k8[len - 2]; 
    mem_s12k8[2] = s12k8[len - 1]; 
    len2         = shr(len, 1);

    /* Scale downsampled signal */
    s6k4          = mem_s6k4 + MAX_PITCH_6K4;
    scale0        = sub(getScaleFactor16_0(mem_s6k4, MAX_PITCH_6K4), 3);
    *mem_s6k4_exp = sub(*mem_s6k4_exp, scale0); 
    scale1        = sub(getScaleFactor16_0(s6k4, len2), 3);
    s6k4_exp      = sub(s12k8_exp, scale1);
    scale2        = sub(*mem_s6k4_exp, s6k4_exp);
    if (scale2 > 0)
    {
        Scale_sig(s6k4, len2, sub(scale1, scale2));
        shift    = scale0;        
        s6k4_exp = *mem_s6k4_exp; 
    }
    else
    {
        Scale_sig(s6k4, len2, scale1);
        shift         = add(scale0, scale2);
        *mem_s6k4_exp = s6k4_exp; 
    }
    Scale_sig(mem_s6k4, MAX_PITCH_6K4, shift);

    /* Compute autocorrelation */
    for(n = MIN_PITCH_6K4; n <= MAX_PITCH_6K4; n++)
    {
        sum = L_mult0(s6k4[0], s6k4[0 - n]);
        for(m = 1; m < len2; m++)
        {
            sum = L_mac0_1(sum, s6k4[m], s6k4[m - n]);
        }
        ac[n - MIN_PITCH_6K4] = sum; 
    }

    /* Weight autocorrelation and find maximum */
    max32  = Mpy_32_16_asm(ac[0], olpa_ac_weighting[0]); 
    *pitch = MIN_PITCH_6K4;
    for (n = MIN_PITCH_6K4 + 1; n <= MAX_PITCH_6K4; n++)
    {
        L_tmp  = Mpy_32_16_asm(ac[n - MIN_PITCH_6K4], olpa_ac_weighting[n - MIN_PITCH_6K4]);
        L_tmp2 = L_sub_sat(L_tmp, max32);
        if (L_tmp2 > 0)
        {
            *pitch = n; 
        }
        max32 = max(L_tmp, max32);
    }

/* Compute normalized correlation */
    sum0 = L_mult0(s6k4[0], s6k4[0 - *pitch]);
    sum1 = L_mac0_1(1, s6k4[0 - *pitch], s6k4[0 - *pitch]);
    sum2 = L_mac0_1(1, s6k4[0], s6k4[0]);
    for (m = 1; m < len2; m++)
    {
        sum0 = L_mac0_1(sum0, s6k4[m], s6k4[m - *pitch]);
        sum1 = L_mac0_1(sum1, s6k4[m - *pitch], s6k4[m - *pitch]);
        sum2 = L_mac0_1(sum2, s6k4[m], s6k4[m]);
    }
    scale1   = norm_l(sum1);
    scale2   = norm_l(sum2);
    sum1     = L_shl_pos(sum1, scale1);
    sum2     = L_shl_pos(sum2, scale2);
    prod     = Mpy_32_32(sum1, sum2);
    shift    = norm_l(prod);
    prod     = L_shl_pos(prod, shift);
    prod_exp = sub(62, add(add(scale1, scale2), shift));
    inv      = Isqrt(prod, &prod_exp);
    scale0   = norm_l(sum0);
    sum0     = L_shl_pos(sum0, scale0);
    prod     = Mpy_32_32(sum0, inv);
    prod_exp = add(sub(31, scale0), prod_exp);
    
    if (prod == 0 || sub(norm_l(prod), prod_exp) >= 0)
    {
        *normcorr = max(0, round_fx_sat(L_shl_sat(prod, prod_exp))); 
    }
    else
    {
        *normcorr = 32767; 
    }

    /* Second try in the neighborhood of the previous pitch */
    min_pitch = max(MIN_PITCH_6K4, sub(*mem_pitch, 4));
    max_pitch = min(MAX_PITCH_6K4, add(*mem_pitch, 4));
    max32     = ac[min_pitch - MIN_PITCH_6K4]; 
    pitch2    = min_pitch;                     
    for(n = min_pitch + 1; n <= max_pitch; n++)
    {
        L_tmp = L_sub_sat(ac[n - MIN_PITCH_6K4], max32);
        if (L_tmp > 0)
        {
            pitch2 = n; 
        }
        max32 = max(ac[n - MIN_PITCH_6K4], max32);
    }
    if (sub(*pitch, pitch2) != 0)
    {
        sum0 = L_mult0(s6k4[0], s6k4[0 - pitch2]);
        sum1 = L_mac0_1(1, s6k4[0 - pitch2], s6k4[0 - pitch2]);
        sum2 = L_mac0_1(1, s6k4[0], s6k4[0]);
        for (m = 1; m < len2; m++)
        {
            sum0 = L_mac0_1(sum0, s6k4[m], s6k4[m - pitch2]);
            sum1 = L_mac0_1(sum1, s6k4[m - pitch2], s6k4[m - pitch2]);
            sum2 = L_mac0_1(sum2, s6k4[m], s6k4[m]);
        }
        scale1   = norm_l(sum1);
        scale2   = norm_l(sum2);
        sum1     = L_shl_pos(sum1, scale1);
        sum2     = L_shl_pos(sum2, scale2);
        prod     = Mpy_32_32(sum1, sum2);
        shift    = norm_l(prod);
        prod     = L_shl_pos(prod, shift);
        prod_exp = sub(62, add(add(scale1, scale2), shift));
        inv      = Isqrt(prod, &prod_exp);
        scale0   = norm_l(sum0);
        sum0     = L_shl_pos(sum0, scale0);
        prod     = Mpy_32_32(sum0, inv);
        prod_exp = add(sub(31, scale0), prod_exp);
        
        if (prod == 0 || sub(norm_l(prod), prod_exp) >= 0)
        {
            normcorr2 = max(0, round_fx_sat(L_shl_sat(prod, prod_exp))); 
        }
        else
        {
            normcorr2 = 32767; 
        }
        if (sub(normcorr2, mult_r(*normcorr, 27853)) > 0)
        {
            *pitch    = pitch2;    
            *normcorr = normcorr2; 
        }
    }
    *mem_pitch = *pitch; 

    /* Update memory */

    memmove(mem_s6k4, &mem_s6k4[len2], MAX_PITCH_6K4 * sizeof(int16_t));

    /* Upsample pitch by a factor of 2 (6.4kHz -> 12.8kHz) */
    *pitch = shl_pos(*pitch, 1); 

}

