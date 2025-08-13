
#include "defines.h"
#include "constants.h"
#include "functions.h"


void processPCupdate(int16_t bfi, int16_t yLen, int16_t q_old_res_fx[], int16_t *q_old_res_fx_exp,
                      int16_t q_res_fx[], int16_t spec_inv_idx, int16_t gg_idx, int16_t gg_idx_off,
                      int16_t *prev_gg, int16_t *prev_gg_e, int16_t rframe, int16_t *BW_cutoff_idx_nf,
                      int16_t *prev_BW_cutoff_idx_nf, int16_t fac_ns_idx, int16_t *prev_fac_ns_fx, int16_t fac,
                      int16_t fac_e)
{
    int16_t  global_gain, global_gain_e, s, s2, s3, tmp16;
    int32_t  tmp32;

    tmp32 = L_shl_pos(L_mult0((gg_idx + gg_idx_off), 0x797D), 7);
    global_gain_e = extract_l(L_shr_pos(tmp32, 25)) + 1;
    global_gain = round_fx(InvLog2(L_or(tmp32, 0xFE000000)));

    *prev_gg = global_gain;  
    *prev_gg_e = global_gain_e;  

    s = getScaleFactor16(q_res_fx, spec_inv_idx); /* exp = 0 */
    if (bfi == 0)
    {
        *q_old_res_fx_exp = -s;
        Copy_Scale_sig(q_res_fx, q_old_res_fx, yLen, s);
    }
    else
    {
        s2 = getScaleFactor16(&q_res_fx[spec_inv_idx], (yLen - spec_inv_idx)); /* exp = q_old_res_fx_exp */
        s3 = (s + (*q_old_res_fx_exp));
        if (s3 > s2)
        {
            tmp16 = s3 - s2;
            s = s - tmp16;
        }
        s2 = s + (*q_old_res_fx_exp);
        *q_old_res_fx_exp = -s;

        Copy_Scale_sig(q_res_fx, q_old_res_fx, spec_inv_idx, s);
        Copy_Scale_sig(&q_res_fx[spec_inv_idx], &q_old_res_fx[spec_inv_idx], (yLen - spec_inv_idx), s2);
    }





    if (rframe == 0)
    {
        *prev_BW_cutoff_idx_nf = *BW_cutoff_idx_nf;
        *prev_fac_ns_fx = shl_pos((8 - fac_ns_idx), 11);
    }
    else if ((bfi == 2) && ((*BW_cutoff_idx_nf) != (*prev_BW_cutoff_idx_nf)))
    {
        *BW_cutoff_idx_nf = *prev_BW_cutoff_idx_nf;
        *prev_fac_ns_fx = shl_sat(mult(*prev_fac_ns_fx, fac), fac_e);
        *prev_fac_ns_fx = max(*prev_fac_ns_fx, 2048);
        *prev_fac_ns_fx = min(*prev_fac_ns_fx, 16384);
    }

}


