
#include "defines.h"
#include "functions.h"


/*****************************************************************************/
static int32_t TDC_Dot_product(const int16_t x[], const int16_t y[], const int16_t lg);
static void   TDC_highPassFiltering_fx(const int16_t L_buffer, int16_t exc2[], const int16_t l_fir_fer,
                                       const int16_t *hp_filt);
static int32_t TDC_calcGainp(int16_t x[], int16_t y[], int16_t lg);
static void   TDC_calcGainc(int16_t *exc, int16_t Q_exc, int16_t old_fpitch, int16_t lg, int16_t frame_dms, int16_t lp_gainp, int32_t *lp_gainc);
static void   TDC_random_fx(int16_t *seed, int16_t lg, int16_t *y);
static int16_t TDC_preemph(int16_t *x, const int16_t fac, const int16_t lg);
static void   TDC_LPC_residu_fx(const int16_t *a, int16_t *x, int16_t *y, int16_t lg, int16_t m);
static void   TDC_deemph_fx(const int16_t *x, int16_t *y, const int16_t fac, const int16_t lg, const int16_t mem);
static void   TDC_LPC_synthesis_fx(const int16_t sh, const int16_t a[], const int16_t x[], int16_t y[], const int16_t lg,
                                   const int16_t m);
static void   TDC_normalize_energy_fx(int16_t *gain, int16_t *gain_exp, const int16_t *x, const int16_t lg);
/*****************************************************************************/


/*
 * processTimeDomainConcealment_Apply
 *
 * Parameters:
 *   pitch_int                i  : integer pitch lag                 Q0
 *   preemphFac_fx            i  : preemphase factor                 Q15
 *   A_fx                     i  : lp filter coefficients            Qx
 *   pcmbufHist_fx            i  : pointer to input signal           Qq_fx_old_exp
 *   frame_length             i  : frame length                      Q0
 *   fs_idx                   i  : sample rate index                 Q0
 *   nbLostFramesInRow        i  : number of consecutive lost frames Q0
 *   overlap                  i  : overlap length                    Q0
 *   stabFac_fx               i  : stability factor                  Q15
 *   fract                    i/o: fraction of lag                   Q0
 *   seed_fx                  i/o: pointer to seed                   Q0
 *   gain_p_fx                i/o: pointer to gainp                  Q15
 *   gain_c_fx                i/o: pointer to gainc                  15Q16
 *   cum_alpha                i/o: cumulative damping factor         Q15
 *   synth_fx                 o  : pointer to synthesized signal     Q_syn
 *   Q_syn                    o  : exponent for synthesized signal   Q0
 *   alpha                    o  : damping factor                    Q15
 *   scratchBuffer            i  : scratch buffer
 *
 * Function:
 *    Perform the time domain concealment.
 *
 * Returns:
 *    void
 */
void processTimeDomainConcealment_Apply(const int16_t pitch_int, const int16_t preemphFac_fx, const int16_t *A_fx,
                                           const int16_t lpc_order, const int16_t *pcmbufHist_fx, const int16_t frame_length,
                                           const int16_t frame_dms, const int16_t fs_idx, const int16_t nbLostFramesInRow,
                                           const int16_t overlap, const int16_t stabFac_fx, int16_t *fract,
                                           int16_t *seed_fx, int16_t *gain_p_fx, int32_t *gain_c_fx, int16_t *cum_alpha,
                                           int16_t *synth_fx, int16_t *Q_syn, int16_t *alpha, int16_t max_len_pcm_plc,
                                           int8_t *scratchBuffer)
{
    int32_t       i;
    int16_t        s, s1, c1, c2, len, len_hp, cnt, g_fx, ilen, Tc, nextInc, beforeNextInc;
    int32_t        tmp32, tmp32_2;
    int16_t        gain_p_loc;
    int32_t        gain_c_32_fx;
    int16_t        gain_c_16_fx, gain_c_16_fx_exp, gain_inov_fx, gain_inov_fx_exp, ilen_exp;
    int16_t        len_pi_lf_2, frame_length_2, step_fx, step_n_fx, gain_h_fx, nbLostCmpt_loc, alpha_loc, mem_deemph;
    int16_t *      synth_mem_fx, *synth_tmp_fx, *exc2_fx, *exc_fx, *pt_exc, *pt1_exc, *x_pre_fx;
    int16_t        Q_exc, new_Q, exp_scale;
    const int16_t *hp_filt_fx;

    /* len of output signal */
    len = frame_length + overlap;

    nbLostCmpt_loc = nbLostFramesInRow; 
    nextInc = 1;  
    beforeNextInc = 1;  
    switch (frame_dms)
    {
        case 25: 
            nbLostCmpt_loc = shr((nbLostFramesInRow + 3), 2);
            nextInc = (nbLostFramesInRow & 0x0003) == 1;  
            beforeNextInc = (nbLostFramesInRow & 0x0003) == 0;  
            break;
        case 50:
            nbLostCmpt_loc = shr((nbLostFramesInRow + 1), 1);
            nextInc = (nbLostFramesInRow & 0x0001) == 1;  
            beforeNextInc = (nbLostFramesInRow & 0x0001) == 0;  
            break;
    }

#ifdef NONBE_PLC3_BURST_TUNING
    if (nbLostCmpt_loc > PLC_FADEOUT_IN_MS / 10)
    {
        *gain_p_fx = 0; 
        *gain_c_fx = 0; 
        *Q_syn     = 0; 
        *alpha     = 0; 
        memset(synth_fx, 0, len * sizeof(int16_t));
        return;
    }
#endif

    frame_length_2 = shr_pos(frame_length, 1);

    Tc = pitch_int; 
    if ((*fract) > 0)
        Tc += 1;

    len_pi_lf_2 = Tc + frame_length_2;

    /*----------------------------------------------------------------
     * Buffer Initialization
     *
     *                exc_fx       synth_mem_fx
     * |--exc_buf_past--|--exc_buf_curr--|--syn_mem--|--x_pre--|
     *                                               |--exc2--|
     *                                               |--syn--|
     *
     *---------------------------------------------------------------*/
    /* pointer inits */
    exc_fx       = (int16_t *)(((uint8_t *)scratchBuffer) +sizeof(int16_t) * len_pi_lf_2); /* MAX_PITCH+MAX_LEN/2 + MAX_LEN+MDCT_MEM_LEN_MAX */
    synth_mem_fx = (int16_t *)(((uint8_t *)exc_fx) + sizeof(*exc_fx) * len);           /* M */
    x_pre_fx     = (int16_t *)(((uint8_t *)synth_mem_fx) + sizeof(*synth_mem_fx) * lpc_order); /* MAX_PITCH+MAX_LEN/2+M+1 */
    exc2_fx      = (int16_t *)(((uint8_t *)synth_mem_fx) + sizeof(*synth_mem_fx) *lpc_order); /* MAX_LEN+MDCT_MEM_LEN_MAX+TDC_L_FIR_HP+TDC_L_FIR_HP/2-1 */
    synth_tmp_fx = (int16_t *)(((uint8_t *)synth_mem_fx) + sizeof(*synth_mem_fx) * lpc_order); /* MAX_LEN+MDCT_MEM_LEN_MAX */
    /* Buffers 'overlap' since they are not used at the same time */

    /*---------------------------------------------------------------*
     * LPC Residual                                                  *
     *---------------------------------------------------------------*/
 
    /* copy buffer to pre-emphasis buffer */
    cnt = len_pi_lf_2 + lpc_order + 1;
    memmove(&x_pre_fx[0], &pcmbufHist_fx[max_len_pcm_plc - cnt], cnt * sizeof(int16_t));

    /* apply pre-emphasis to the signal */
    Q_exc = TDC_preemph(&(x_pre_fx[1]), preemphFac_fx, (cnt -1));

    /* copy memory for LPC synth */
    memmove(&synth_mem_fx[0], &x_pre_fx[len_pi_lf_2 + 1], lpc_order * sizeof(int16_t));

    /* LPC Residual */
    TDC_LPC_residu_fx(A_fx, &(x_pre_fx[lpc_order + 1]), &(exc_fx[-len_pi_lf_2]), len_pi_lf_2, lpc_order);

    /*---------------------------------------------------------------*
     * Calculate gains                                               *
     *---------------------------------------------------------------*/

    if (nbLostFramesInRow == 1)
    {
        if (pitch_int == Tc)
            *gain_p_fx = round_fx_sat(L_shl_sat(TDC_calcGainp(&(x_pre_fx[lpc_order + Tc + 1]), &(x_pre_fx[lpc_order + 1]), frame_length_2), 15));
        else
        {
            tmp32   = TDC_calcGainp(&(x_pre_fx[lpc_order + Tc + 1]), &(x_pre_fx[lpc_order + 2]), frame_length_2);
            tmp32_2 = TDC_calcGainp(&(x_pre_fx[lpc_order + Tc + 1]), &(x_pre_fx[lpc_order + 1]), frame_length_2);
            if (tmp32 > tmp32_2)
            {
                Tc = pitch_int; 
                *gain_p_fx = round_fx_sat(L_shl_sat(tmp32, 15));
                *fract = 0; 
            }
            else
                *gain_p_fx = round_fx_sat(L_shl_sat(tmp32_2, 15));
        }

        if (*gain_p_fx < 0)
            *gain_p_fx = 0; 

        if (pitch_int == Tc)
            TDC_calcGainc(exc_fx, Q_exc, Tc, frame_length_2, frame_dms, *gain_p_fx, &gain_c_32_fx);
        else
        {
            TDC_calcGainc(exc_fx, Q_exc, pitch_int, frame_length_2, frame_dms, *gain_p_fx, &tmp32);
            TDC_calcGainc(exc_fx, Q_exc, Tc, frame_length_2, frame_dms, *gain_p_fx, &gain_c_32_fx);
            gain_c_32_fx = min(gain_c_32_fx, tmp32); 
        }
    }
    else
        gain_c_32_fx = *gain_c_fx; 

    /*---------------------------------------------------------------*
     * Damping factor                                                *
     *---------------------------------------------------------------*/
    if (nextInc != 0)
    {
        if (nbLostCmpt_loc == 1)
        {
            /* Threshold 31470 is 0.98^2 in Q15 format */
            if ((*gain_p_fx) > 31470)
                 *alpha = 0x7D71; /*0.98f*/
            else if ((*gain_p_fx) < 28037)/* Threshold 28037 is 0.925^2 in Q15 format */
                 *alpha = 0x7666; /*0.925f*/
            else
            {
                exp_scale = 0;
                *alpha = Sqrt16(*gain_p_fx, &exp_scale); 
                *alpha = shl(*alpha, exp_scale);
            }
        }
        else
        {
            switch (nbLostCmpt_loc)
            {
            case 2:
                c1 = 0x50A4; /*0.630f*/       
                c2 = 0x2CCD; /*0.350f*/ 
                break;
#ifndef NONBE_PLC3_BURST_TUNING
            case 3:
#else
        default:
#endif
                c1 = 0x5375; /*0.652f*/ 
                c2 = 0x29FC; /*0.328f*/ 
                break;
#ifndef NONBE_PLC3_BURST_TUNING
            case 4:
                c1 = 0x5646; /*0.674f*/ 
                c2 = 0x2666; /*0.300f*/ 
                break;
            case 5:
                c1 = 0x5917; /*0.696f*/ 
                c2 = 0x220C; /*0.266f*/ 
                break;
            default:
                c1 = 0x5CCD; /*0.725f*/ 
                c2 = 0x1CCD; /*0.225f*/ 
                break;
#endif
            }

            *alpha = mult_r(stabFac_fx, c2);
            *alpha = (*alpha) + c1;
            *alpha = mult(*gain_p_fx, (*alpha));
#ifdef NONBE_PLC3_BURST_TUNING
            if (nbLostCmpt_loc > 3)
            {
                c1= div_s((PLC_FADEOUT_IN_MS/10 -nbLostCmpt_loc), (PLC_FADEOUT_IN_MS/10 - 3));
                *alpha = mult(*alpha, c1);
            }
#endif

            if (nbLostCmpt_loc == 2)
            {
                if ((*alpha  /*0.919f*/) < 0x75A2)
                    *alpha = 0x75A2; 
            }
            else if (nbLostCmpt_loc > 5)
                *gain_p_fx = *alpha; 
        }
    }

    gain_p_loc = *gain_p_fx; 
    alpha_loc  = *alpha;     

    if (frame_dms == 25)
    {
        if (gain_p_loc < 32767)
        {
            exp_scale  = 0;
            s = Sqrt16(gain_p_loc, &exp_scale); 
            gain_p_loc = shl(s, exp_scale);
        }
        if (gain_p_loc < 32767)
        {
            exp_scale  = 0;
            s = Sqrt16(gain_p_loc, &exp_scale); 
            gain_p_loc = shl(s, exp_scale);
        }

        if (alpha_loc < 32767)
        {
            exp_scale = 0;
            alpha_loc = Sqrt16(alpha_loc, &exp_scale); 
            alpha_loc = shl(alpha_loc, exp_scale);
        }
        if (alpha_loc < 32767)
        {
            exp_scale = 0;
            alpha_loc = Sqrt16(alpha_loc, &exp_scale); 
            alpha_loc = shl(alpha_loc, exp_scale);
        }
    }
    if (frame_dms == 50)
    {
        if (gain_p_loc < 32767)
        {
            exp_scale  = 0;
            s = Sqrt16(gain_p_loc, &exp_scale); 
            gain_p_loc = shl(s, exp_scale);
        }

        if (alpha_loc < 32767)
        {
            exp_scale = 0;
            alpha_loc = Sqrt16(alpha_loc, &exp_scale); 
            alpha_loc = shl(alpha_loc, exp_scale);
        }
    }
    /* update gain for next frame */
    if (beforeNextInc != 0)
        *gain_p_fx = *alpha; 
    /*---------------------------------------------------------------*
     * Construct the harmonic part                                   *
     *  Last pitch cycle of the previous frame is repeatedly copied. *
     *---------------------------------------------------------------*/
    pt_exc  = exc_fx;         
    pt1_exc = pt_exc - Tc;    
    s = min(len, Tc); 
    
    if ((stabFac_fx  /*1.f Q15*/ < 32767) && (nbLostFramesInRow == 1))
    { /* pitch cycle is first low-pass filtered */
        if (fs_idx <= 1)
        {
            for(i = 0; i < s; i++)
            { 
                *pt_exc++ = mac_r_sat(
                    L_mac_sat(L_mac_sat(L_mac_sat(L_mac_sat(L_mac_sat(L_mult(174 /* 0.0053f Q15*/, pt1_exc[-5]),
                                                                      -1442 /*-0.0440f Q15*/, pt1_exc[-3]),
                                                            8641 /* 0.2637f Q15*/, pt1_exc[-1]),
                                                  18022 /* 0.5500f Q15*/, pt1_exc[0]),
                                        8641 /* 0.2637f Q15*/, pt1_exc[1]),
                              -1442 /*-0.0440f Q15*/, pt1_exc[3]),
                    174 /* 0.0053f Q15*/, pt1_exc[5]);
                pt1_exc++;
            }
        }
        else
        {
            for(i = 0; i < s; i++)
            {
                *pt_exc++ = mac_r_sat(
                    L_mac_sat(
                        L_mac_sat(
                            L_mac_sat(
                                L_mac_sat(
                                    L_mac_sat(
                                        L_mac_sat(
                                            L_mac_sat(L_mac_sat(L_mac_sat(L_mult(-174 /*-0.0053f Q15*/, pt1_exc[-5]),
                                                                          -121 /*-0.0037f Q15*/, pt1_exc[-4]),
                                                                -459 /*-0.0140f Q15*/, pt1_exc[-3]),
                                                      590 /* 0.0180f Q15*/, pt1_exc[-2]),
                                            8743 /* 0.2668f Q15*/, pt1_exc[-1]),
                                        16355 /* 0.4991f Q15*/, pt1_exc[0]),
                                    8743 /* 0.2668f Q15*/, pt1_exc[1]),
                                590 /* 0.0180f Q15*/, pt1_exc[2]),
                            -459 /*-0.0140f Q15*/, pt1_exc[3]),
                        -121 /*-0.0037f Q15*/, pt1_exc[4]),
                    -174 /*-0.0053f Q15*/, pt1_exc[5]);
                pt1_exc++;
            }
        }
    }
    else
    {
        /* copy the first pitch cycle without low-pass filtering */
        for(i = 0; i < s; i++)
            *pt_exc++ = *pt1_exc++; 
    }

     s = len - Tc; 
     for(i = 0; i < s; i++)
        *pt_exc++ = *pt1_exc++; 

    /*---------------------------------------------------------------*
     * Construct the random part of excitation                       *
     *---------------------------------------------------------------*/
    TDC_random_fx(seed_fx, (len + (TDC_L_FIR_HP + ((TDC_L_FIR_HP >> 1) - 1))), exc2_fx);
    /* ratio between full band and highpassed noise */
    if (nbLostFramesInRow == 1)
        *cum_alpha = 0x7FFF; 
    else
        *cum_alpha = mult_r(*cum_alpha, alpha_loc); 

    /* high pass noise */
    hp_filt_fx = TDC_high_32;
    if (fs_idx <= 1)
        hp_filt_fx = TDC_high_16;

    len_hp = len + (TDC_L_FIR_HP >> 1);

    if (nbLostFramesInRow == 1)
        TDC_highPassFiltering_fx(len_hp, exc2_fx, TDC_L_FIR_HP, hp_filt_fx);
    else
    {
        c1 = 0x7FFF - (*cum_alpha);
        for(i = 0; i < len_hp; i++)
        {
            /* Return value of dot product is Q1 */
            tmp32 = Mpy_32_16_asm(TDC_Dot_product(&exc2_fx[i], hp_filt_fx, TDC_L_FIR_HP), (*cum_alpha) /*Q15*/);
            exc2_fx[i] = round_fx(L_mac0_1(tmp32, c1, exc2_fx[i])); 
        }
    }

    exc2_fx = exc2_fx + TDC_L_FIR_HP / 2;
    /* normalize energy */
    TDC_normalize_energy_fx(&gain_inov_fx, &gain_inov_fx_exp, exc2_fx, frame_length);
    tmp32 = Mpy_32_16_asm(
        L_sub(590558016l /*1.1 Q29*/, Mpy_32_16_asm(L_shr_pos(L_deposit_h(gain_p_loc), 2), 24576 /*0.75*/)) /*Q29*/,
        gain_inov_fx /*Q15,gain_inov_e*/); /*Q29,gain_inov_e*/
    s = norm_l(tmp32);
    tmp32 = L_shl_pos(tmp32, s);
    tmp32 = min(tmp32, 0x7FFEFFFF);
    gain_inov_fx_exp = (gain_inov_fx_exp - s) + 2; /*->Q31*/
    gain_inov_fx = round_fx(tmp32);                        /*Q15,gain_inov_e*/
    /* gains */
    gain_h_fx = (int16_t)0x7FFF; 
    /* update steps */
#ifdef NONBE_PLC3_FIX_FADEOUT
    ilen = Divide1616_Scale((int16_t)1, frame_length, &ilen_exp);
#else
    ilen = Divide1616_Scale((int16_t)1, len, &ilen_exp);
#endif
    step_fx = round_fx(L_shl(L_mult((gain_h_fx - alpha_loc), ilen), ilen_exp));
#ifndef NONBE_PLC3_FIX_FADEOUT
    ilen = Divide1616_Scale((int16_t)1, frame_length, &ilen_exp);
#endif
    s = norm_l(gain_c_32_fx);
    tmp32 = L_shl_pos(gain_c_32_fx, s);
    gain_c_16_fx = extract_h(tmp32);
    gain_c_16_fx_exp = 15 -s;
    tmp32 = L_msu(tmp32, gain_c_16_fx, alpha_loc);
    step_n_fx = round_fx(L_shl(Mpy_32_16_asm(tmp32, ilen), ilen_exp));

    /*---------------------------------------------------------------*
     * Construct the total excitation                                *
     *---------------------------------------------------------------*/

    s1 = Q_exc + (gain_inov_fx_exp +gain_c_16_fx_exp);
    cnt = frame_length + TDC_L_FIR_HP / 2;
    g_fx = mult_r(gain_c_16_fx, gain_inov_fx);
    for(i = 0; i < TDC_L_FIR_HP / 2; i++)
    {
        /* harmonic */
        tmp32 = L_mult(exc_fx[i], gain_h_fx);
        /* random */
        tmp32_2 = L_shl_sat(L_mult(exc2_fx[i], g_fx), s1);
        /* total */
        exc_fx[i] = round_fx_sat(L_add_sat(tmp32, tmp32_2)); 
        /* update */
        gain_h_fx = gain_h_fx - step_fx;
    }

    for(; i < cnt; i++)
    {
        /* harmonic */
        tmp32 = L_mult(exc_fx[i], gain_h_fx);
        /* random */
        tmp32_2 = L_shl_sat(L_mult(exc2_fx[i], g_fx), s1);
        /* total */
        exc_fx[i] = round_fx_sat(L_add_sat(tmp32, tmp32_2)); 
        /* update */
#ifdef NONBE_PLC3_FIX_FADEOUT
        gain_h_fx = max((gain_h_fx - step_fx), 0);
        gain_c_16_fx = max((gain_c_16_fx - step_n_fx), 0);
#else
        gain_h_fx = (gain_h_fx - step_fx);
        gain_c_16_fx = (gain_c_16_fx - step_n_fx);
#endif
#ifdef NONBE_PLC3_FIX_DAMPING
        g_fx = mult_r(gain_c_16_fx, gain_inov_fx);
#endif
    }
    g_fx = mult_r(gain_c_16_fx, gain_inov_fx);
    for(; i < len; i++)
    {
        /* harmonic */
        tmp32 = L_mult(exc_fx[i], gain_h_fx);
        /* random */
        tmp32_2 = L_shl_sat(L_mult(exc2_fx[i], g_fx), s1);
        /* total */
        exc_fx[i] = round_fx_sat(L_add_sat(tmp32, tmp32_2)); 
        /* update */
#ifdef NONBE_PLC3_FIX_FADEOUT
        gain_h_fx = max((gain_h_fx - step_fx), 0);
#else
        gain_h_fx    = gain_h_fx - step_fx;
#endif
    }
    /* update gain */
    *gain_c_fx = L_shl(L_deposit_h(gain_c_16_fx), (gain_c_16_fx_exp - 15)); 
    /*----------------------------------------------------------*
     * Compute the synthesis speech                             *
     *----------------------------------------------------------*/
    new_Q = Q_exc - 5;
    new_Q = max(new_Q, -3);
    exp_scale = new_Q - Q_exc + 1;
    *Q_syn = new_Q; 
    Copy_Scale_sig(synth_mem_fx, &synth_tmp_fx[-lpc_order], lpc_order, exp_scale);
    TDC_LPC_synthesis_fx((Q_exc -(*Q_syn)), A_fx, exc_fx, synth_tmp_fx, len, lpc_order);
    /*----------------------------------------------------------*
     * Deemphasis                                               *
     *----------------------------------------------------------*/
    mem_deemph = shl(pcmbufHist_fx[max_len_pcm_plc - 1], *Q_syn);
    TDC_deemph_fx(synth_tmp_fx, synth_fx, preemphFac_fx, len, mem_deemph);

#ifdef NONBE_PLC3_BURST_TUNING
    /*----------------------------------------------------------*
     * Fade to zero                                             *
     *----------------------------------------------------------*/
    if (beforeNextInc != 0)
    {
        if (nbLostCmpt_loc == PLC_FADEOUT_IN_MS / 10)
        {
            gain_h_fx = (int16_t)0x7FFF; 
            step_fx   = round_fx(L_shl(L_mult(gain_h_fx, ilen), ilen_exp));
            for(i = 0; i < frame_length; i++)
            {
                assert(gain_h_fx >= 0);
                synth_fx[i] = mult(synth_fx[i], gain_h_fx);
                gain_h_fx  = gain_h_fx - step_fx;
            }
            memset(&synth_fx[frame_length], 0, overlap * sizeof(int16_t));
        }
    }
#endif

}


/*****************************************************************************/

static int32_t syn_kern_2(int32_t L_tmp, const int16_t a[], const int16_t y[])
{
    L_tmp = L_msu_sat(L_tmp, y[-1], a[1]);
    L_tmp = L_msu_sat(L_tmp, y[-2], a[2]);
    return L_tmp;
}

static int32_t syn_kern_4(int32_t L_tmp, const int16_t a[], const int16_t y[])
{
    L_tmp = syn_kern_2(L_tmp, a, y);
    return syn_kern_2(L_tmp, a + 2, y - 2);
}

static int32_t syn_kern_8(int32_t L_tmp, const int16_t a[], const int16_t y[])
{
    L_tmp = syn_kern_4(L_tmp, a, y);
    return syn_kern_4(L_tmp, a + 4, y - 4);
}

static int32_t syn_kern_16(int32_t L_tmp, const int16_t a[], const int16_t y[])
{
    L_tmp = syn_kern_8(L_tmp, a, y);
    return syn_kern_8(L_tmp, a + 8, y - 8);
}

/*
 * TDC_Dot_product
 *
 * Parameters:
 *   x     i: x vector       Q0
 *   y     i: y vector       Q0
 *   lg    i: vector length  Q0
 *
 * Function:
 *   dot product
 *
 * Returns:
 *   dot product              Q1
 */
static int32_t TDC_Dot_product(const int16_t x[], const int16_t y[], const int16_t lg)
{
    int32_t i;
    int32_t  sum;

    sum = L_mac0_1(1L, x[0], y[0]);
    for(i = 1; i < lg; i++)
    {
        sum = L_mac0_1(sum, x[i], y[i]);
    }

    return sum;
}

/*
 * TDC_highPassFiltering_fx
 *
 * Parameters:
 *   L_buffer     i: buffer length
 *   exc2         i: unvoiced excitation before the high pass filtering  Qx/Qx+1
 *   l_fir_fer    i: length highpass filter
 *   hp_filt      i: highpass filter coefficients                        Q15
 *
 * Function:
 *   Highpass filter
 *
 * Returns:
 *   void
 */
static void TDC_highPassFiltering_fx(const int16_t L_buffer, int16_t exc2[], const int16_t l_fir_fer,
                                     const int16_t *hp_filt)
{
    int32_t i;

    for(i = 0; i < L_buffer; i++)
    {
        exc2[i] = round_fx(L_sub(TDC_Dot_product(&exc2[i], hp_filt, l_fir_fer), 1)); 
    }
}

/*
 * TDC_calcGainc
 *
 * Parameters:
 *   exc        i: pointer to excitation buffer
 *   Q_exc      i: Q format of excitation buffer
 *   old_fpitch i: pitch_int
 *   lg         i: length
 *   lp_gainp   i: gain p
 *   lp_gainc   o: pointer to gain (15Q16)
 *
 * Function:
 *   Gain calculation
 *
 * Returns:
 *   void
 */
static void TDC_calcGainc(int16_t *exc, int16_t Q_exc, int16_t old_fpitch, int16_t lg, int16_t frame_dms, int16_t lp_gainp, int32_t *lp_gainc)
{
    int16_t  tmp16, tmp_e, tmp2_e;
    int32_t  L_tmp, L_tmp_max;
    int32_t i;

#ifndef NONBE_PLC3_GAIN_CONTROL
    UNUSED(L_tmp_max);
    UNUSED(frame_dms);
#endif
    L_tmp = L_deposit_l(0);

    for(i = 0; i < lg; i++)
    {
        /* gain_c += ( exc[-i-1] - *gain_p * exc[-i-1-pitch_int] ) * ( exc[-i-1] - *gain_p * exc[-i-1-pitch_int] ); */
        tmp16 = sub_sat(exc[i - lg] /*Q1*/, mult_r(lp_gainp /*Q15*/, exc[i - lg - old_fpitch] /*Q1*/) /*Q1*/);
        L_tmp = L_mac0_sat(L_tmp, tmp16, tmp16); /*Q3*/
    }

#ifdef NONBE_PLC3_GAIN_CONTROL
    if (sub(frame_dms, 100) < 0)
    {
        L_tmp_max = L_deposit_l(0);
        for(i = 0; i < lg; i++)
        {
            L_tmp_max = L_mac0_sat(L_tmp_max, exc[i - lg], exc[i - lg]); /*Q3*/
        }
        L_tmp = min(L_tmp, L_tmp_max);
    }
#endif

    tmp_e = norm_l(L_tmp);
    L_tmp = L_shl(L_tmp, tmp_e);
    tmp_e = sub(sub(31, shl_pos(Q_exc, 1)), tmp_e); /*L_tmp is Q31, now*/
    tmp16 = Divide3216_Scale(L_tmp /*Q31,norm,tmp_e*/, lg /*Q15,15*/, &tmp2_e) /*Q15,tmp2_e+tmp_e-15*/;
    tmp_e = sub(add(tmp2_e, tmp_e), 15);

    if (tmp16 != 0)
    {
        tmp16     = Sqrt16(tmp16, &tmp_e); /*Q15,norm,tmp_e*/
        tmp_e     = min(tmp_e, 15);
        *lp_gainc = L_shl_pos(L_deposit_l(tmp16), add(tmp_e, 1)); /*15Q16*/
        
    }
    else
    {
        *lp_gainc = 0;
    }

}

/*
 * TDC_calcGainp
 *
 * Parameters:
 *   x      i: input signal
 *   y      i: shifted input signal
 *   lg     i: vector length
 *
 * Function:
 *   Gain calculation
 *
 * Returns:
 *   gain (15Q16)
 */
static int32_t TDC_calcGainp(int16_t x[], int16_t y[], int16_t lg)
{
    int32_t  tcorr, tener, Lgain, L_tmp1, L_tmp2;
    int16_t  m_corr, m_ener, negative, Q_corr, Q_ener;
    int32_t i;

    negative = 0; 

    L_tmp1 = L_deposit_l(0);
    L_tmp2 = L_deposit_l(0);
    for(i = 0; i < lg; i += 2)
    {
        L_tmp1 = L_mac0_1(L_tmp1, x[i], y[i]);
        L_tmp2 = L_mac0_1(L_tmp2, x[i + 1], y[i + 1]);
    }
    tcorr  = L_add(L_shr_pos(L_tmp1, 1), L_shr_pos(L_tmp2, 1));
    Q_corr = norm_l(tcorr);
    tcorr  = L_shl(tcorr, Q_corr);
    Q_corr = sub(2, Q_corr);

    L_tmp1 = L_deposit_l(0);
    L_tmp2 = L_deposit_l(0);
    for(i = 0; i < lg; i += 2)
    {
        L_tmp1 = L_mac0_1(L_tmp1, y[i], y[i]);
        L_tmp2 = L_mac0_1(L_tmp2, y[i + 1], y[i + 1]);
    }
    tener  = L_add(L_shr_pos(L_tmp1, 1), L_shr_pos(L_tmp2, 1));
    Q_ener = norm_l(tener);
    tener  = L_shl(tener, Q_ener);
    Q_ener = sub(2, Q_ener);

    tener = max(tener, 1);

    if (tcorr <= 0)
    {
        negative = 1; 
    }
    tcorr = L_abs_sat(tcorr);

    m_corr = extract_h(tcorr);

    m_ener = extract_h(tener);

    if (sub(m_corr, m_ener) > 0)
    {
        m_corr = shr_pos(m_corr, 1);
        Q_corr = add(Q_corr, 1);
    }
    if (m_ener == 0)
    {
        
        m_corr = 0x7FFF;
    }
    if (m_ener != 0)
    {
        m_corr = div_s(m_corr, m_ener);
    }

    Q_corr = sub(Q_corr, Q_ener);

    Lgain = L_shl(L_deposit_l(m_corr), add(Q_corr, 1));

    if (negative != 0)
    {
        Lgain = L_negate(Lgain);
    }

    return Lgain;
}

/*
 * TDC_LPC_synthesis_fx
 *
 * Parameters:
 *   sh          i  : scaling to apply for a[0]                 Q0
 *   a[]         i  : LP filter coefficients                    Qx
 *   x[]         i  : input signal                              Qx
 *   y[]         o  : output signal                             Qx-s
 *   lg          i  : size of filtering                         Q0
 *   m           i  : order of LP filter                        Q0
 *
 * Function:
 *    Apply LP filtering to obtain synthesis signal.
 *    Memory size is always m.
 *
 * Returns:
 *    void
 */
static void TDC_LPC_synthesis_fx(const int16_t sh, const int16_t a[], const int16_t x[], int16_t y[], const int16_t lg,
                                 const int16_t m)
{
    int32_t i;
    int16_t  a0;
    int16_t  q;
    int32_t(*syn_kern)(int32_t L_tmp, const int16_t a[], const int16_t y[]);

    ASSERT_LC3(m == 16 || m == 8);

    if (sub(m, 16) == 0)
    {
        syn_kern = syn_kern_16;
    }
#ifdef NONBE_PLC3_NB_LPC_ORDER
    if (sub(m, 8) == 0)
    {
        syn_kern = syn_kern_8;
    }
#endif
    q        = add(norm_s(a[0]), 1);
    a0       = shr(a[0], sh);

    for(i = 0; i < lg; i++)
    {
        y[i] = round_fx_sat(L_shl_sat(syn_kern(L_mult(a0, x[i]), a, &y[i]), q)); 
    }

}

/* TDC_LPC_residu_fx
 *
 * Parameters:
 *    a           I: LP filter coefficients (Qx)
 *    x           I: input signal
 *    y           O: output signal
 *    lg          I: size of filtering
 *    m           I: lpc order
 *
 * Function:
 *    Apply inverse filtering to obtain LP residual signal.
 *
 * Returns:
 *    void
 */
static void TDC_LPC_residu_fx(const int16_t *a, int16_t *x, int16_t *y, int16_t lg, int16_t m)
{
    int16_t  a_exp;
    int32_t  s;
    int32_t i;

    ASSERT_LC3(m == 16 || m == 8);

    a_exp = add(norm_s(a[0]), 1);
    a_exp = add(a_exp, 1);

    if (sub(m, 16) == 0)
    {
        for(i = 0; i < lg; i++)
        {
            s = L_mult(x[i], a[0]);
            s = L_mac_sat(s, x[i - 1], a[1]);
            s = L_mac_sat(s, x[i - 2], a[2]);
            s = L_mac_sat(s, x[i - 3], a[3]);
            s = L_mac_sat(s, x[i - 4], a[4]);
            s = L_mac_sat(s, x[i - 5], a[5]);
            s = L_mac_sat(s, x[i - 6], a[6]);
            s = L_mac_sat(s, x[i - 7], a[7]);
            s = L_mac_sat(s, x[i - 8], a[8]);
            s = L_mac_sat(s, x[i - 9], a[9]);
            s = L_mac_sat(s, x[i - 10], a[10]);
            s = L_mac_sat(s, x[i - 11], a[11]);
            s = L_mac_sat(s, x[i - 12], a[12]);
            s = L_mac_sat(s, x[i - 13], a[13]);
            s = L_mac_sat(s, x[i - 14], a[14]);
            s = L_mac_sat(s, x[i - 15], a[15]);
            s = L_mac_sat(s, x[i - 16], a[16]);

            s    = L_shl_sat(s, a_exp);
            y[i] = round_fx_sat(s); 
        }
    }
#ifdef NONBE_PLC3_NB_LPC_ORDER
    if (sub(m, 8) == 0)
    {
        for(i = 0; i < lg; i++)
        {
            s = L_mult(x[i], a[0]);
            s = L_mac_sat(s, x[i - 1], a[1]);
            s = L_mac_sat(s, x[i - 2], a[2]);
            s = L_mac_sat(s, x[i - 3], a[3]);
            s = L_mac_sat(s, x[i - 4], a[4]);
            s = L_mac_sat(s, x[i - 5], a[5]);
            s = L_mac_sat(s, x[i - 6], a[6]);
            s = L_mac_sat(s, x[i - 7], a[7]);
            s = L_mac_sat(s, x[i - 8], a[8]);

            s    = L_shl_sat(s, a_exp);
            y[i] = round_fx_sat(s); 
        }
    }
#endif

}

/* TDC_random_fx
 *
 * Parameters:
 *    seed        i/o: seed for random number
 *    lg          i  : vector length
 *    y           o  : output values
 *
 * Function:
 *    Uniform distributed random generator.
 *
 * Returns:
 *    random number
 */
static void TDC_random_fx(int16_t *seed, int16_t lg, int16_t *y)
{
    int32_t i;

    for(i = 0; i < lg; i++)
    {
        *seed = extract_l(L_mac0_1(16831L, *seed, 12821));
        *y++  = *seed; 
    }

}

/*
 * TDC_preemph
 *
 * Parameters:
 *    x              i/o: signal             Qx
 *    fac            i:   preemphasis factor Q15
 *    lg             i:   vector length
 *
 * Function:
 *    Filtering through 1 - fac z^-1
 *
 * Returns:
 *    Q-factor
 */
static int16_t TDC_preemph(int16_t *x, const int16_t fac, const int16_t lg)
{
    int16_t  fac_sh, Q_max_value, Q_out;
    int32_t  max_val;
    int32_t i;

    fac_sh      = shr(fac, 3);
    Q_max_value = 4096; 
    Q_out       = 12;   

    max_val = 0; 
    for(i = sub(lg, 1); i >= 0; i--)
    {
        max_val = max(L_abs(L_msu(L_mult(x[i], Q_max_value), x[i - 1], fac_sh)), max_val);
    }

    if (extract_h(max_val) != 0)
    {
        Q_out = min(max(sub(norm_s(extract_h(max_val)), 3), 0), 12);
    }

    for(i = sub(lg, 1); i >= 0; i--)
    {
        x[i] = round_fx(L_shl(L_msu(L_mult(x[i], Q_max_value), x[i - 1], fac_sh), Q_out)); 
    }

    return sub(Q_out, 2);
}

/*
 * TDC_deemph_fx
 *
 * Parameters:
 *    x              i: input signal        Qx
 *    y              o: output signal       Qx
 *    fac            i: deemphasis factor   Q15
 *    lg             i: size of filtering   Q0
 *    mem            i: memory (x[-1])
 *
 * Function:
 *    Filtering through 1/(1-fac z^-1)
 *
 * Returns:
 *    void
 */
static void TDC_deemph_fx(const int16_t *x, int16_t *y, const int16_t fac, const int16_t lg, const int16_t mem)
{
    int32_t i;

    y[0] = round_fx_sat(L_mac_sat(L_deposit_h(x[0]), mem, fac)); 
    for(i = 1; i < lg; i++)
    {
        y[i] = round_fx_sat(L_mac_sat(L_deposit_h(x[i]), y[i - 1], fac)); 
    }

}

/*
 * TDC_normalize_energy_fx
 *
 * Parameters:
 *   gain          o: gain
 *   gain_exp      o: exponent of gain
 *   x             i: input signal
 *   lg            i: length of input signal
 *
 * Function:
 *    Normalizes the energy.
 *
 * Returns:
 *    void
 */
static void TDC_normalize_energy_fx(int16_t *gain, int16_t *gain_exp, const int16_t *x, const int16_t lg)
{
    int32_t i;
    int16_t  c;
    int16_t  e;
    int16_t  e1;
    int16_t  e2;
    int32_t  tmp;
    int16_t  tmp16;

    tmp = 0; 
    for(i = 0; i < lg; i++)
    {
        tmp16 = mult_r(x[i], 2048);
        tmp   = L_mac(tmp, tmp16, tmp16);
    }

    e     = norm_l(tmp);
    tmp   = L_shl_pos(tmp, e);
    e1    = sub(sub(30, e), -8); 
    tmp16 = Divide3216_Scale(tmp, lg, &e2);

    e = 0; 
    if (tmp16 != 0)
    {
        e = sub(add(e1, e2), 15);
    }

    c = 0x0148; /* 0.01 */
    
    if (e > 0)
    {
        c = shr(c, min(e, 15));
    }
    else
    {
        tmp16 = shr(tmp16, min(negate(e), 15));
        e     = 0; 
    }

    e2 = 2; 
    if (s_and(e, 1))
    {
        e2 = 1; 
    }

    tmp16 = add(shr_pos(tmp16, e2), shr_pos(c, e2));
    e     = add(e, e2);

    tmp16 = Sqrt16(tmp16, &e);

    *gain     = Divide1616_Scale((int16_t)0x7FFF, tmp16, &e1); 
    *gain_exp = sub(e1, e);                                              

}

