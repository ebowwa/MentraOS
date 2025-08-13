
#include "defines.h"
#include "constants.h"
#include "functions.h"


static inline int16_t getScaleFactor16_withNegativeScaling(int16_t *data16, int16_t dataLen)
{
    int32_t i;
    int16_t tmp, shift;
    int16_t x_min = 0;
    int16_t x_max = 0;
	
    for(i = 0; i < dataLen; i++)
    {
        if (data16[i] > 0)
            x_max = max(x_max, data16[i]);
        if (data16[i] < 0)
            x_min = min(x_min, data16[i]);
    }

    tmp   = max(x_max, negate(x_min));
    shift = norm_s(tmp);
    if (tmp == 0)
        shift = 15; 

    return shift;
}

static inline void processPCapplystage1(int16_t spec_inv_idx, int16_t q_old_d_fx[], int32_t* mean_nrg_low, 
	                                                                   int32_t* mean_nrg_high, int16_t yLen, int16_t s)
{
    int32_t i = 0;
    int16_t tmp16 = 0;
    int16_t c = 0;

    for(i = 0; i < spec_inv_idx; i++)
    {
        tmp16 = shl_sat(q_old_d_fx[i], (s -4));
        *mean_nrg_low = L_mac0_1(*mean_nrg_low, tmp16, tmp16); /* exp = 2s - 8 */
    }

    for(i = spec_inv_idx; i < yLen; i++)
    {
        tmp16 = shl_sat(q_old_d_fx[i], (s - 4));
        *mean_nrg_high = L_mac0_1(*mean_nrg_high, tmp16, tmp16); /* exp = 2s - 8 */
    }

    if (spec_inv_idx < (yLen - spec_inv_idx))
    {
        c = div_s(spec_inv_idx, (yLen - spec_inv_idx));
        *mean_nrg_high = Mpy_32_16_asm(*mean_nrg_high, c); /* exp = 2s - 8 */
    }
    else
    {
        c = div_s((yLen - spec_inv_idx), spec_inv_idx);
        *mean_nrg_low = Mpy_32_16_asm(*mean_nrg_low, c); /* exp = 2s - 8 */
    }
}

static inline void processPCapplystage2(int16_t q_old_res_fx[], int16_t spec_inv_idx, int16_t q_res_fx[], 
	                                                                  int16_t * q_old_res_fx_exp, int16_t prev_gg, int16_t prev_gg_e,
	                                                                  int16_t global_gain, int16_t global_gain_e, int16_t *fac_e, int16_t *fac)
{
    int16_t  s = 0;
    int32_t ener_prev = 0;
    int32_t i = 0;
    int16_t tmp16 = 0;
    int32_t ener_curr = 0;
    int16_t s3 = 0;
    int16_t s2 = 0;
    int16_t	 prev_gg2 = 0;
    int16_t	 prev_gg2_e = 0;
    int32_t ener_prev_gg2 = 0;
    int16_t gg2 = 0;
    int16_t gg2_e = 0;
    int32_t ener_curr_gg2 = 0;
    int16_t tmp16_2 = 0;

    s = getScaleFactor16(q_old_res_fx, spec_inv_idx);
    for(i = 0; i < spec_inv_idx; i++)
    {
        tmp16 = shl_sat(q_old_res_fx[i], (s - 4));
        ener_prev = L_mac0_1(ener_prev, tmp16, tmp16); /* exp = - (2s - 8 - 2**q_old_res_fx_exp) */
    }

    s2 = getScaleFactor16(q_res_fx, spec_inv_idx);
    for(i = 0; i < spec_inv_idx; i++)
    {
        tmp16 = shl_sat(q_res_fx[i], (s2 - 4));
        ener_curr = L_mac0_1(ener_curr, tmp16, tmp16); /* exp = - (2s2 - 8) */
    }

    s  = shl((s - (*q_old_res_fx_exp)), 1);
    s2 = shl(s2, 1);
    s3 = max(s, s2);
    ener_prev = L_shr_sat(ener_prev, (s3 - s2));
    ener_curr = L_shr_sat(ener_curr, (s3 - s));

    prev_gg2 = mult(prev_gg, prev_gg);
    prev_gg2_e = shl(prev_gg_e, 1);
    ener_prev_gg2 = Mpy_32_16_asm(ener_prev, prev_gg2); /* exp =  prev_gg2_e */

    gg2 = mult(global_gain, global_gain);
    gg2_e = shl(global_gain_e, 1);
    ener_curr_gg2 = Mpy_32_16_asm(ener_curr, gg2);      /* exp =  gg2_e */

    s3 = max(prev_gg2_e, gg2_e);
    ener_prev_gg2 = L_shr_sat(ener_prev_gg2, (s3 - prev_gg2_e));
    ener_curr_gg2 = L_shr_sat(ener_curr_gg2, (s3 - gg2_e));

    if (ener_prev_gg2 > ener_curr_gg2)
    {
        s = getScaleFactor32(&ener_prev, 1);
        s2 = getScaleFactor32(&ener_curr, 1);
        s3 = min(s, s2);
        tmp16 = extract_h(L_shl_sat(ener_curr, s3));
        tmp16_2 = extract_h(L_shl_sat(ener_prev, s3));

        *fac_e = 0;  
        tmp16_2 = Inv16(tmp16_2, fac_e);
        *fac = mult(tmp16, tmp16_2);
        if ((*fac) < 32767)
            *fac = Sqrt16(*fac, fac_e); 
    }
}

static inline void processPCapplystage3(int16_t q_res_fx[], int16_t spec_inv_idx, int16_t yLen, 
	                                                                  int16_t *q_old_res_fx_exp, int16_t *q_fx_exp,  int32_t q_d_fx[]) 
{
    int16_t s = 0;
    int16_t s2 = 0;
    int16_t s3 = 0;
    int16_t tmp16 = 0;
    int32_t i = 0;

    /* scaling to 15Q16 */
    s = getScaleFactor16_withNegativeScaling(&q_res_fx[0], spec_inv_idx); /* exp = 0 */
    s2  = getScaleFactor16_withNegativeScaling(&q_res_fx[spec_inv_idx], (yLen - spec_inv_idx)); /* exp = q_old_res_fx_exp */
    s3  = s + (*q_old_res_fx_exp);
    if (s3 > s2) {
        tmp16 = s3 - s2;
        s = s - tmp16;
        s3 = s3 - tmp16;
    }
    *q_fx_exp = 15 - s;

    for(i = 0; i < spec_inv_idx; i++)
        q_d_fx[i] = L_shl_pos(L_deposit_h(q_res_fx[i]), s); 

    for(; i < yLen; i++)
        q_d_fx[i] = L_shl_pos(L_deposit_h(q_res_fx[i]), s3); 
}


void processPCapply(int16_t yLen, int16_t q_old_res_fx[], int16_t *q_old_res_fx_exp, int16_t q_res_fx[],
                       int16_t q_old_d_fx[], int16_t spec_inv_idx, int16_t *fac, int16_t *fac_e,
                       int32_t q_d_fx[], int16_t *q_fx_exp, int16_t gg_idx, int16_t gg_idx_off, int16_t prev_gg, int16_t prev_gg_e,
                       int16_t *pc_nbLostFramesInRow)
{
    int32_t i;
    int16_t  s, inv_gain, thr;
    int32_t  mean_nrg_high, mean_nrg_low;
    int16_t  global_gain, global_gain_e;
    int32_t  tmp32;

    assert(spec_inv_idx >= 0);
    *pc_nbLostFramesInRow = (*pc_nbLostFramesInRow) + 1;
    tmp32 = L_shl_pos(L_mult0((gg_idx + gg_idx_off), 0x797D), 7);
    global_gain_e = extract_l(L_shr_pos(tmp32, 25)) + 1;
    global_gain = round_fx(InvLog2(L_or(tmp32, 0xFE000000)));
    s = global_gain_e;  
    inv_gain = Inv16(global_gain, &s);
    *fac = mult(prev_gg, inv_gain);
    *fac_e = s + prev_gg_e;
    /* Calculate rescaling factor */
    s = getScaleFactor16(q_old_d_fx, yLen);

    mean_nrg_low = 0;
    mean_nrg_high = 0;  
    processPCapplystage1(spec_inv_idx, q_old_d_fx , &mean_nrg_low, &mean_nrg_high, yLen, s);

    if (mean_nrg_low > mean_nrg_high)
        processPCapplystage2(q_old_res_fx, spec_inv_idx, q_res_fx, q_old_res_fx_exp, prev_gg, 
			                       prev_gg_e, global_gain, global_gain_e, fac_e, fac);

    /* write synthesized samples */
    *q_old_res_fx_exp = (*q_old_res_fx_exp) + (*fac_e);
    thr = shl_sat(20480, (-15 - (*q_old_res_fx_exp)));
    for(i = spec_inv_idx; i < yLen; i++)
    {
        q_res_fx[i] = extract_h(L_mult(q_old_res_fx[i]  /* exp = q_old_res_fx_exp' */, *fac /* exp = fac_e */)); /* exp = q_old_res_fx_exp */
        if ((abs_s(q_res_fx[i])) < thr)
            q_res_fx[i] = 0;  
    }

    processPCapplystage3(q_res_fx, spec_inv_idx, yLen, q_old_res_fx_exp, q_fx_exp, q_d_fx);

}

