
#include "defines.h"
#ifdef NONBE_PLC4_ADAP_DAMP
#include "functions.h"
void processPLCDampingScrambling_main(int16_t bfi, int16_t concealMethod, int16_t ns_nbLostFramesInRow,
                                         int16_t pc_nbLostFramesInRow, int16_t *ns_seed, int16_t *pc_seed, int16_t pitch_present_bfi1,
                                         int16_t pitch_present_bfi2, int32_t spec[], int16_t *q_fx_exp, int16_t *q_old_d_fx,
                                         int16_t *q_old_fx_exp, int16_t L_spec, int16_t stabFac, int16_t frame_dms,
                                         int16_t *cum_fading_slow, int16_t *cum_fading_fast, int16_t *alpha, int16_t spec_inv_idx)
{
    if (( (bfi == 1) && (concealMethod == 4)) || (bfi == 2))
    {
        if (bfi == 1)
            processPLCDampingScrambling(spec, L_spec, ns_nbLostFramesInRow, stabFac,pitch_present_bfi1, 
				                                  frame_dms, cum_fading_slow,cum_fading_fast, alpha, ns_seed, 0);
        else
        {
            processPLCDampingScrambling(spec, L_spec, pc_nbLostFramesInRow, stabFac,pitch_present_bfi2, frame_dms, 
				                                    cum_fading_slow,cum_fading_fast, alpha, pc_seed, spec_inv_idx);
            processPLCupdateSpec(q_old_d_fx, q_old_fx_exp, spec, q_fx_exp, L_spec);
        }
    }
}

void processPLCDampingScrambling(int32_t spec[], int16_t L_spec, int16_t nbLostFramesInRow, int16_t stabFac,
                                    int16_t pitch_present, int16_t frame_dms, int16_t *cum_fading_slow,
                                    int16_t *cum_fading_fast, int16_t *alpha, int16_t *seed, int16_t spec_inv_idx)
{
    int32_t i;
    int16_t xLostFramesInRow, slow, fast, tmp16;
    int16_t plc_start_inFrames, plc_end_inFrames, plc_duration_inFrames, x, m, b, linFuncStartStop;
    int16_t randThreshold, ad_threshFac, energThreshold, s, s2, s3, mean_energy16;
    int32_t frame_energy, mean_nrg, fac;

    if (sub(nbLostFramesInRow, 1) == 0)
    {
        *cum_fading_slow = 32767;  
        *cum_fading_fast = 32767;  
    }

    xLostFramesInRow = nbLostFramesInRow;  
    switch (frame_dms)
    {
    case 25: nbLostFramesInRow = shr(add(nbLostFramesInRow, 3), 2); break;
    case 50: nbLostFramesInRow = shr(add(nbLostFramesInRow, 1), 1); break;
    }

    /* get damping factor */
    tmp16 = mult(6554, stabFac);
    slow = add(26214, tmp16);
    fast = add(9830, tmp16);

    if (spec_inv_idx == 0)
    {
        if (sub(nbLostFramesInRow, PLC_FADEOUT_IN_MS/10) > 0)
        {
            slow = 0;  
            fast = 0;  
        }
        else if (sub(nbLostFramesInRow, 2) > 0)
        {
            tmp16 = div_s(sub(PLC_FADEOUT_IN_MS / 10, nbLostFramesInRow), sub(PLC_FADEOUT_IN_MS / 10, sub(nbLostFramesInRow, 1)));
            slow = mult(slow, tmp16);
            fast = mult(fast, tmp16);
        }
    }

    switch (frame_dms)
    {
    case 25:
        if (sub(slow, 32767) < 0)
        {
            tmp16  = 0;
            slow = Sqrt16(slow, &tmp16);  
            slow = shl(slow, tmp16);
        }
        if (sub(slow, 32767) < 0)
        {
            tmp16  = 0;
            slow = Sqrt16(slow, &tmp16);  
            slow = shl(slow, tmp16);
        }
        if (sub(fast, 32767) < 0)
        {
            tmp16  = 0;
            fast = Sqrt16(fast, &tmp16);  
            fast = shl(fast, tmp16);
        }
        if (sub(fast, 32767) < 0)
        {
            tmp16  = 0;
            fast = Sqrt16(fast, &tmp16);  
            fast = shl(fast, tmp16);
        }
        break;
    case 50:
        if (sub(slow, 32767) < 0)
        {
            tmp16  = 0;
            slow = Sqrt16(slow, &tmp16);  
            slow = shl(slow, tmp16);
        }
        if (sub(fast, 32767) < 0)
        {
            tmp16  = 0;
            fast = Sqrt16(fast, &tmp16);  
            fast = shl(fast, tmp16);
        }
        break;
    }

    *alpha = slow;
    *cum_fading_slow = mult_r(*cum_fading_slow, slow);
    *cum_fading_fast = mult_r(*cum_fading_fast, fast);

    /* Get fadeout function */
    /* being 1 up to plc_start_inFrames, being 0 starting with
       plc_end_inFrames; decreasing linearly in between */
    switch (frame_dms)
    {
    case 25:
        plc_start_inFrames = (10*PLC_START_IN_MS) / 25;  
        plc_end_inFrames   = (10*PLC_FADEOUT_IN_MS) / 25;  
        break;
    case 50:
        plc_start_inFrames = PLC_START_IN_MS / 5;  
        plc_end_inFrames   = PLC_FADEOUT_IN_MS / 5;  
        break;
    default:
        plc_start_inFrames = PLC_START_IN_MS / 10;  
        plc_end_inFrames   = PLC_FADEOUT_IN_MS / 10;  
    }

    if (pitch_present == 0)
    {
        plc_start_inFrames = 1;  
    }
    plc_duration_inFrames = sub(plc_end_inFrames, plc_start_inFrames);

    if (sub(xLostFramesInRow, plc_start_inFrames) < 0)
    {
        x = plc_start_inFrames;  
    }
    else
    {
        if (sub(xLostFramesInRow, plc_end_inFrames) > 0)
        {
            x = plc_end_inFrames;  
        }
        else
        {
            x = xLostFramesInRow;  
        }
    }
    m = negate(div_s(1, plc_duration_inFrames));
    b = negate(plc_end_inFrames); /* shift on x axis */
    linFuncStartStop = i_mult(add(m, 1), (add(x, b)));  /* +1 to prevent 32768 as result */

    /* Sign scrambling */
    randThreshold = mult(-32768, linFuncStartStop);

    tmp16 = *seed;  
    for(i = spec_inv_idx; i < L_spec; i++)
    {
        tmp16 = extract_l(L_mac0_1(16831, tmp16, 12821));

        if (tmp16 < 0)
        {
            
            if (pitch_present == 0 || sub(tmp16, randThreshold) < 0)
            {
                spec[i] = L_negate(spec[i]);
            }
        }

    }
    *seed = tmp16; 

    /* Apply adaptive damping */
    tmp16 = mult(18022 /* 10 - 1.2 */, linFuncStartStop);
    ad_threshFac = add(shr(tmp16, 1), 1228 /* 1.2 >> 1 */); /* exp = 5 */

    s = getScaleFactor32(&spec[spec_inv_idx], sub(L_spec, spec_inv_idx));
    frame_energy = 0;  
    for(i = spec_inv_idx; i < L_spec; i++)
    {
        tmp16     = extract_h(L_shl_sat(spec[i], sub(s, 4)));
        frame_energy = L_mac0_1(frame_energy, tmp16, tmp16); /* exp = -(2*(s-16) - 8) */
    }
    mean_energy16 = Divide3216_Scale(frame_energy, sub(L_spec, spec_inv_idx), &s2);  /* exp = -(2*(s-16) - 8) + 16 - (15-s2) */

    energThreshold = mult(ad_threshFac, mean_energy16);    /* exp = -(2*(s-16) - 8) + 16 - (15-s2) + 5 */

    s3 = add(sub(29, shl(sub(s, 16), 1)), s2);
    if (sub(energThreshold, 32767) < 0)
    {
        energThreshold = Sqrt16(energThreshold, &s3);
    }
    s3 = sub(s3, 15);

    mean_nrg = L_shl_sat(L_deposit_l(energThreshold), s3); /* exp = 0 */
    fac = mult(sub(*cum_fading_slow, *cum_fading_fast), energThreshold);
    fac = L_shl_sat(L_deposit_l(fac), s3); /* exp = 0 */

    for(i = spec_inv_idx; i < L_spec; i++)
    {
        if (L_sub(L_abs(spec[i]), mean_nrg) < 0)
        {
            spec[i] = Mpy_32_16_asm(spec[i], *cum_fading_slow);
        }
        else
        {
            if (spec[i] > 0)
            {
                spec[i] = L_add(Mpy_32_16_asm(spec[i], *cum_fading_fast), fac);
            }
            else if (spec[i] == 0)
            {
                spec[i] = Mpy_32_16_asm(spec[i], *cum_fading_fast);
            }
            else
            {
                spec[i] = L_sub(Mpy_32_16_asm(spec[i], *cum_fading_fast), fac);
            }
        }
    }

}


#endif /* NONBE_PLC4_ADAP_DAMP */
