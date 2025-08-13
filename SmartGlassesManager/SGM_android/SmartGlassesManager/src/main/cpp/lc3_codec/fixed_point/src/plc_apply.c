
#include "defines.h"
#include "constants.h"
#include "functions.h"


static inline void processPLCapplyconcealMethod2(AplcSetup *plcAd, int16_t prev_bfi, int16_t fs_idx, int16_t old_pitch_int, 
                                                                          int16_t old_pitch_fr, int32_t * L_ecu_rec, int16_t frame_length, int16_t *q_fx_exp, 
                                                                          int8_t* buffer_phecu, const int16_t w[], int16_t ola_mem[], int16_t *ola_mem_exp, int16_t x_fx[])
{
    int16_t env_stab = 32767;
    int16_t tmp_is_trans[2]; /* may be  changed to a single variable */
    int16_t prev_bfi_plc2 = 0;
    int16_t  y_e;             /*exponent of L_ecu_rec */

    /* call phaseEcu */
    tmp_is_trans[0] = plcAd->PhECU_short_flag_prev; 
    tmp_is_trans[1] = plcAd->PhECU_short_flag_prev; 
                
    ASSERT_LC3(prev_bfi == 0 || prev_bfi == 1|| prev_bfi == 2);  /*PC prev_bfi has three states */
    prev_bfi_plc2 = prev_bfi; 
    if (prev_bfi_plc2 == 2) 
        prev_bfi_plc2 = 0; 
    
    ASSERT_LC3(prev_bfi_plc2 == 0 || prev_bfi_plc2 == 1); /*PhEcu does not accept prev_bfi == 2 */
    if (prev_bfi_plc2 == 0)
    { /* convert pitch lag info at current fs to a normalized fractional bin-frequency   */
        plcAd->PhECU_f0hzLtpBinQ7 = plc_phEcuSetF0Hz(fs_idx, old_pitch_int, old_pitch_fr);
        /* first bfi frame calc decoded pcm  energy 16,16 ms, in 26 ms buffer separated by 10 ms*/
        /* compute energy normalization needed for concealment method 2  Xavg  and transient analysis */
        /* left   */                
        processPLCUpdateXFP_w_E_hist(0, 0,
                                                  &(plcAd->x_old_tot_fx[ (plcAd->max_len_pcm_plc - (num_FsByResQ0[fs_idx] + rectLengthTab[fs_idx]))]), 
                                                  plcAd->q_fx_old_exp,0,  fs_idx,&plcAd->PhECU_L_oold_xfp_w_E_fx, &plcAd->PhECU_oold_xfp_w_E_exp_fx,
                                                  &plcAd->PhECU_L_old_xfp_w_E_fx, &plcAd->PhECU_old_xfp_w_E_exp_fx,&plcAd->PhECU_oold_Ltot_exp_fx, 
                                                  &plcAd->PhECU_old_Ltot_exp_fx);

        /* right  */
        processPLCUpdateXFP_w_E_hist(0, 0, plcAd->PhECU_xfp_fx, plcAd->PhECU_xfp_exp_fx, plcAd->PhECU_margin_xfp, fs_idx,
                                                  &plcAd->PhECU_L_oold_xfp_w_E_fx, &plcAd->PhECU_oold_xfp_w_E_exp_fx,&plcAd->PhECU_L_old_xfp_w_E_fx, 
                                                  &plcAd->PhECU_old_xfp_w_E_exp_fx,&plcAd->PhECU_oold_Ltot_exp_fx, &plcAd->PhECU_old_Ltot_exp_fx);
    }

    hq_phase_ecu(plcAd->PhECU_xfp_fx,       /* i :  only valid first Bfi frame , buffer of previous synt signal length */
                            L_ecu_rec,                 /* o  : reconstructed frame in folded tda domain xtda  int32_t  Q x     */
                            &plcAd->PhECU_time_offs,   /* i/o: Sample offset for consecutive frame losses*/
                            plcAd->PhECU_X_sav_fx,     /* i(prev_bfi==1)/o(prev_bfi==0): Stored Complex spectrum of prototype frame */
                            &plcAd->PhECU_X_savQ_fx,   /* i/o: Q value of stored spectrum                */
                            &plcAd->PhECU_num_plocs,   /* i/o: Number of identified peaks                */
                            plcAd->PhECU_plocs,        /* i/o: Peak locations   Q0                         */
                            plcAd->PhECU_f0est,        /* i/o: Interpolated peak locations           Q16 */
                            env_stab,                  /* i  : Envelope stability parameter              */
                            plcAd->PhECU_f0hzLtpBinQ7, /* i:  LTP bin frequency in normalized Hz  Q7 */
                            plcAd->norm_corrQ15_fx,    /* i : correlation for lag at f0hzLtpBinQ7 */
                            prev_bfi_plc2,                  /* i   : indicating burst frame error             */
                            tmp_is_trans,              /* i   : flags indicating previous transient frames */
                            plcAd->PhECU_mag_chg_1st,  /* i/o: per band magnitude modifier for transients*/
                            NULL,                      /*  o: dbg per band magnitude modifier, incl. burst attenuation   */
                            plcAd->PhECU_Xavg,         /* i/o: Frequency group average gain to fade to   */
                            &plcAd->PhECU_beta_mute,   /* o   : Factor for long-term mute                */
                            fs_idx,                    /* i  : Encoded bandwidth   "nb(0),WB,sWB,WB,FB"  */
                            frame_length,              /* i   : frame length                             */
                            NULL ,                      /* o  :  seed synch dbg                          */ 
                            NULL ,                      /* o  :  evolved Spectrum   dbg                  */ 
                            plcAd->PhECU_t_adv,       /* i  : time adjustment excluding time_offs         */
                            PhECU_wins[fs_idx][2], /* i:  2 ms initial part pre_tda = mdct-ana */
                            PhECU_wins[fs_idx][1], /* i:  16 ms pretda combined part  IWHR+MDCT-ana  */
                            PhECU_wins[fs_idx][0], 
                            plcAd->PhECU_xfp_exp_fx, 
                            plcAd->max_lprot, 
                            plcAd->max_plocs,
                            plcAd->PhECU_L_oold_xfp_w_E_fx,plcAd->PhECU_oold_xfp_w_E_exp_fx, plcAd->PhECU_oold_Ltot_exp_fx,
                            plcAd->PhECU_oold_grp_shape_fx,
                            plcAd->PhECU_L_old_xfp_w_E_fx,plcAd->PhECU_old_xfp_w_E_exp_fx, plcAd->PhECU_old_Ltot_exp_fx,
                            plcAd->PhECU_old_grp_shape_fx,
                            plcAd->PhECU_margin_xfp,
                            buffer_phecu);
 
    y_e = 18;    /*  the  fixed exponent (exp)  from Lecu_rec  from PhaseECU is 18    */

    Processing_ITDA_WIN_OLA(L_ecu_rec,   /* i:     X_TDA buffer data   =  "y"  DCT-IV output */
                                                  &y_e,        /* i/o:    x_tda exponent  "y_e"  */
                                                  w,           /* i:     window coefficients including normalization of sqrt(2/N) and scaled by 2^4 */
                                                  ola_mem,     /* i/o:  overlap add memory */
                                                  ola_mem_exp, /* i/o:  overlap add exponent */
                                                  x_fx,        /* o:    time signal out */
                                                  LowDelayShapes_n960_len[fs_idx],                         /* i:   window length */
                                                  frame_length,                                            /* i:   block size */
                                                  (frame_length - LowDelayShapes_n960_la_zeroes[fs_idx]) /* i:   overlap add buffer size */); 
    *q_fx_exp = y_e;     /*  assign updated Q */
}

static inline void processPLCapplyconcealMethod3(int16_t nbLostFramesInRow, AplcSetup *plcAd, int16_t old_pitch_fr, 
	              int16_t frame_length,  int16_t frame_dms, const int16_t *band_offsets,int16_t fs_idx, int16_t yLen, int32_t *q_old_d_fx32, 
	              int16_t q_old_d_fx[], int32_t *d2_fx, int16_t *q_old_fx_exp, int8_t *buffer_perBandEnergy, int8_t *buffer_preEmphasis, 
	              int8_t *buffer_InverseODFT,int32_t *tdc_A_32, int32_t *r_fx, int8_t *buffer_Levinson, int16_t old_pitch_int, int16_t la_zeroes, 
	              int16_t x_fx[], int16_t *damping, int8_t *buffer_tdc, int16_t *q_fx_exp, int16_t ola_mem[], int16_t *ola_mem_exp, 
	              const int16_t w[], int8_t *buffer_tdac)
{
    int16_t n_bands = 0;
    int32_t i = 0;
    int16_t  d2_fx_exp = 0;
    int16_t  r_fx_exp = 0;
    int16_t  Q_syn = 0;

    if (nbLostFramesInRow == 1)
    {
        plcAd->tdc_fract = old_pitch_fr; 
        n_bands = min(frame_length, MAX_BANDS_NUMBER_PLC);
        switch (frame_dms)
        {
            case 25:
                band_offsets = bands_offset_lin_2_5ms[fs_idx];  
                if (fs_idx == 4)
                    n_bands = 60;  
                break;
            case 50:
                band_offsets = bands_offset_lin_5ms[fs_idx]; 
                if (fs_idx == 2)
                    n_bands = 40; 
                break;
            case 100:
                band_offsets = bands_offset_lin_10ms[fs_idx]; 
                break;
            default:
                band_offsets = bands_offset_lin[fs_idx]; 
                break;               
        }

        for(i = 0; i < yLen; i++)
            q_old_d_fx32[i] = L_deposit_h(q_old_d_fx[i]);
    
        /* LPC Analysis */
        /* calculate per band energy*/
        processPerBandEnergy(d2_fx, &d2_fx_exp, q_old_d_fx32, *q_old_fx_exp, band_offsets, fs_idx, 
                                                          n_bands, 1, frame_dms, buffer_perBandEnergy);   
        /* calculate pre-emphasis */
        processPreEmphasis(d2_fx, &d2_fx_exp, fs_idx, n_bands, frame_dms, buffer_preEmphasis);   
        /* inverse ODFT */
        processInverseODFT(r_fx, &r_fx_exp, d2_fx, d2_fx_exp, n_bands, plcAd->tdc_lpc_order, buffer_InverseODFT);   
        /* lag windowing */
        processLagwin(r_fx, lag_win[fs_idx], plcAd->tdc_lpc_order);
        /* Levinson Durbin */
        processLevinson(tdc_A_32, r_fx, plcAd->tdc_lpc_order, NULL, NULL, buffer_Levinson);
        /* 32Q27 -> 16Qx */
        processPLCLpcScaling(tdc_A_32, plcAd->tdc_A, (plcAd->tdc_lpc_order + 1));
    }
    /* call TD-PLC */
    processTimeDomainConcealment_Apply(old_pitch_int, plcAd->tdc_preemph_fac, plcAd->tdc_A, plcAd->tdc_lpc_order, 
                               plcAd->x_old_tot_fx, frame_length, frame_dms,fs_idx, nbLostFramesInRow, (frame_length - la_zeroes), 
                               plcAd->stab_fac,&plcAd->tdc_fract,&plcAd->tdc_seed, &plcAd->tdc_gain_p, &plcAd->tdc_gain_c,
                               &plcAd->tdc_cum_damp, x_fx, &Q_syn, damping,plcAd->max_len_pcm_plc, buffer_tdc);   
    /* exponent of TD-PLC output */
    Q_syn = Q_syn + (15 - plcAd->q_fx_old_exp);
    *q_fx_exp = 15 - Q_syn; 
    /* TDAC */
    processTdac(ola_mem, ola_mem_exp, x_fx, *q_fx_exp, w, la_zeroes, frame_length, buffer_tdac);
}

void processPLCapply(int16_t concealMethod, int16_t nbLostFramesInRow, int16_t bfi, int16_t prev_bfi,
                        int16_t frame_length, int16_t la_zeroes, const int16_t w[], int16_t x_fx[], int16_t ola_mem[],
                        int16_t *ola_mem_exp, int16_t q_old_d_fx[], int16_t *q_old_fx_exp, int32_t q_d_fx[],
                        int16_t *q_fx_exp, int16_t yLen, int16_t fs_idx, int16_t *damping, int16_t old_pitch_int,
                        int16_t old_pitch_fr, int16_t *ns_cum_alpha, int16_t *ns_seed, int16_t frame_dms, AplcSetup *plcAd,
                        int8_t *scratchBuffer)
{
    int32_t *d2_fx;
    int32_t *q_old_d_fx32;
    int32_t *r_fx;
    int32_t *tdc_A_32;
    int8_t * buffer_perBandEnergy, *buffer_preEmphasis, *buffer_InverseODFT, *buffer_tdc;
    int8_t *buffer_tdac, *buffer_phecu,  *buffer_Levinson;
    const int16_t *band_offsets;
    int32_t * L_ecu_rec; /*  local xtda  output is MAX_LEN -> input  buffer,as  tmp buffer for w32 fft MAX_LPROT */

    d2_fx = (int32_t *)scratchBuffer; /* Size = 4 * MAX_BANDS_NUMBER_PLC */
    q_old_d_fx32 = (int32_t *)(((uint8_t *)d2_fx) + sizeof(*d2_fx) * MAX_BANDS_NUMBER_PLC); /* Size = 4 * MAX_BW */
    r_fx = (int32_t *)(((uint8_t *)d2_fx) + sizeof(*d2_fx) * MAX_BANDS_NUMBER_PLC); /* Size = 4 * (M + 1) */
    tdc_A_32 = (int32_t *)(((uint8_t *)r_fx) + sizeof(*r_fx) * (M + 1));                /* Size = 4 * (M + 1) */
    L_ecu_rec = (int32_t *)(((uint8_t *)tdc_A_32) + sizeof(*tdc_A_32) * (M + 1)); /* Size = 4 * MAX_LPROT bytes */
    buffer_perBandEnergy =((int8_t *)q_old_d_fx32) + sizeof(*q_old_d_fx32) * (MAX_BW); /* Size = 2 * MAX_BANDS_NUMBER_PLC */
    buffer_preEmphasis =((int8_t *)tdc_A_32) + sizeof(*tdc_A_32) * (M + 1); /* Size = 2 * MAX_BANDS_NUMBER_PLC */
    buffer_InverseODFT = buffer_preEmphasis;                          /* Size = 640 bytes */
    buffer_Levinson = buffer_preEmphasis;                          /* Size = 4 * (M + 1) */
    buffer_tdc = scratchBuffer; /* Size = 2 * (MAX_PITCH + MAX_LEN/2 + MAX_LEN + MDCT_MEM_LEN_MAX + M + MAX_PITCH +MAX_LEN/2 + M + 1) bytes */
    buffer_tdac  = scratchBuffer; /* Size = 2 * MAX_LEN bytes */
    buffer_phecu = scratchBuffer; /* Size = 2 * MAX_LGW + 8 * MAX_LPROT + 12 * MAX_L_FRAME */
    /* Buffers overlap since they are not used at once */

    /* Apply/Prepare PLC in bfi-case */
    if (bfi == 1)
    {
        switch (concealMethod)
        {
            case 2:
                ASSERT_LC3(frame_dms == 100);
                processPLCapplyconcealMethod2(plcAd, prev_bfi, fs_idx, old_pitch_int, old_pitch_fr, L_ecu_rec, 
					                                 frame_length, q_fx_exp, buffer_phecu, w, ola_mem, ola_mem_exp, x_fx);
                break;
            case 3:
                processPLCapplyconcealMethod3(nbLostFramesInRow, plcAd, old_pitch_fr, frame_length, frame_dms, 
					band_offsets, fs_idx, yLen, q_old_d_fx32, q_old_d_fx, d2_fx, q_old_fx_exp, buffer_perBandEnergy, 
					buffer_preEmphasis, buffer_InverseODFT, tdc_A_32, r_fx, buffer_Levinson, old_pitch_int, la_zeroes, 
					x_fx, damping, buffer_tdc, q_fx_exp, ola_mem, ola_mem_exp, w, buffer_tdac);
                break;
            case 4:
                *q_fx_exp = *q_old_fx_exp; 
            /* call Noise Substitution */
#ifndef NONBE_PLC4_ADAP_DAMP
                processPLCNoiseSubstitution(q_d_fx, q_old_d_fx, yLen, nbLostFramesInRow, plcAd->stab_fac, 
                                                                  frame_dms,damping, ns_cum_alpha, ns_seed);
#else
                processPLCNoiseSubstitution(q_d_fx, q_old_d_fx, yLen);
#endif
                break;
            default: ASSERT_LC3(!"Unsupported PLC method!");
        } /* switch (converalMethod)*/
    }     /* if (bfi) */
}

