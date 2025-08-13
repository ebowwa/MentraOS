
#include "defines.h"
#include "functions.h"


static inline void processPLCUpdateAfterIMDCTstage1(int16_t fs_idx, int16_t xLen, int16_t oldLen, AplcSetup *plcAd,
                                                                                   int16_t bufHistlen, int16_t bfi, int16_t *prev_bfi, int16_t concealMethod,
                                                                                   int16_t *nbLostFramesInRow,int16_t x_fx[], int16_t q_fx_exp)
{
    int16_t frontLen = 0;
    int16_t pastLen = 0;
    int16_t marginOldPast = 0;
    int16_t marginOldFront = 0;
    int16_t scale_fac_old_dual = 0;
    int16_t  scale_fac_old = 0;
    int16_t scale_fac_new = 0;
    int16_t marginNewXlen = 0;
    int16_t q_theo_new_old = 0;
    int16_t q_theo_new_new = 0;
    int16_t q_new = 0;
    int16_t shift_old = 0;
    int16_t shift_new = 0;
	
    frontLen = LprotSzPtr[fs_idx] - xLen;  /*16-10 =  6ms  of the  prev_synth/xfp part  */
    pastLen = oldLen - frontLen;          /* ~11.8 ms*/
    marginOldPast = getScaleFactor16_0(&(plcAd->x_old_tot_fx[plcAd->max_len_pcm_plc - bufHistlen]), pastLen);
    marginOldFront = getScaleFactor16_0(&(plcAd->x_old_tot_fx[plcAd->max_len_pcm_plc - bufHistlen + pastLen]), frontLen);
    scale_fac_old_dual = min(marginOldFront, marginOldPast);
    scale_fac_old = scale_fac_old_dual;
    frontLen = 0;         
    if ((bfi == 1) && ((*prev_bfi) == 0) && (concealMethod == 2))
    {   /* prepare localized margin_xfp value  for a next bad concealment Method 2 frame   */
        frontLen = *nbLostFramesInRow;
        frontLen = hamm_len2Tab[fs_idx] + shr(hamm_len2Tab[fs_idx], 2); /*  find margin in the   3.75 ms front part   */
        pastLen = xLen - frontLen;
        scale_fac_new = getScaleFactor16_0(&(x_fx[0]), pastLen);
        marginNewXlen = getScaleFactor16_0(&(x_fx[0]) + pastLen, frontLen); /* for pHEcuprev_synth  in 2nd+  bfi frame */
        scale_fac_new = min(scale_fac_new, marginNewXlen);
    }
    else
    { /* prepare margin value for any coming  good frame  or  any coming first bad frame  */
        marginNewXlen = getScaleFactor16_0(&(x_fx[0]),xLen);  /* prevsynth  in first bfi frame */
        scale_fac_new = marginNewXlen; 
    }

    q_theo_new_old = max(plcAd->q_fx_old_exp - scale_fac_old, 0);
    q_theo_new_new = max(q_fx_exp - scale_fac_new, 0);
    q_new = max(q_theo_new_old, q_theo_new_new);
    shift_old = plcAd->q_fx_old_exp - q_new;
    shift_new = q_fx_exp - q_new;
    if (shift_old != 0)
    {
        Scale_sig(&plcAd->x_old_tot_fx[plcAd->max_len_pcm_plc - bufHistlen], oldLen, shift_old);       
        if ((bfi == 1) && (concealMethod == 3))
            plcAd->tdc_gain_c = L_shl(plcAd->tdc_gain_c, shift_old);
        /* count move to static RAM */
        marginOldFront = min(16, (marginOldFront - shift_old));
    }

    if (shift_new)
    {
        Scale_sig(&plcAd->x_old_tot_fx[plcAd->max_len_pcm_plc - xLen], xLen, shift_new); /* positive shift_new means upshift=less margin  */
        marginNewXlen = min(16, (marginNewXlen - shift_new));
    }

    plcAd->q_fx_old_exp = (q_fx_exp - shift_new);
    plcAd->PhECU_margin_xfp = min(marginNewXlen, marginOldFront);   /* for pHECU winEncalc xfp energy calculations */
    if (frontLen != 0)/* prepare margin value for a first pHECU(16 ms)  or a consecutive bad PhEcu frame (3.75ms)  */
        plcAd->PhECU_margin_xfp = marginNewXlen; 
    if (plcAd->PhECU_margin_xfp == 16)
        plcAd->PhECU_margin_xfp = 1;     /* "1" --> does not rescale the   all-zero vector, inside PhECU  */
}

static inline void processPLCUpdateAfterIMDCTstage2(int16_t *prev_bfi, AplcSetup *plcAd, int16_t scf_q[])
{
    int32_t  tmp32 = 0;
    int32_t i = 0;
    int16_t a= 0;

    /* calculate stability factor */
    if ((*prev_bfi) == 1)
        plcAd->stab_fac = 26214;  
    else
    {
        tmp32 = 0;  
        for(i = 0; i < M; i++)
        {
            a = scf_q[i] - plcAd->old_scf_q[i];
            tmp32 = L_mac_sat(tmp32, a, a);
        }
        tmp32 = L_shl_sat(tmp32, 3);
        if (tmp32 > 0x7D000000 /*1.25*25*/)
            plcAd->stab_fac = 0;  
        else if (tmp32 < 0x19003E82 /*0.25*25*/)
            plcAd->stab_fac = 0x7FFF;  
        else
        {
            tmp32 = L_shl_pos(L_sub(0x50000000 /*1.25/2*/, Mpy_32_16(tmp32, 0x51EC /*16/25*/)), 1);
            plcAd->stab_fac = round_fx(tmp32);  
        }
    }
}

void processPLCUpdateAfterIMDCT(int16_t x_fx[], int16_t q_fx_exp, int16_t concealMethod, int16_t xLen, int16_t fs_idx,
   int16_t *nbLostFramesInRow, int16_t *prev_prev_bfi, int16_t *prev_bfi, int16_t bfi, int16_t scf_q[],
   int16_t *ns_cum_alpha, AplcSetup *plcAd)
{
    int16_t  oldLen, bufHistlen;
  
    //TRACE("processPLCUpdateAfterIMDCT ");
    if (plcAd)
    {
#ifdef  NONBE_FIX_PCMHIST_LENGTHS
        /* for  short NB frames(2.5 ms)  TDC-filtering  requires  more PCM samples than  the plc_xcorr function */
        bufHistlen = max(xLen,  ((M + 1) + (shr(xLen, 1)))) ; 
        bufHistlen = pitch_max[fs_idx] + bufHistlen;       
#else
        bufHistlen = pitch_max[fs_idx] + xLen;
#endif
        if ( (bfi== 1)  && (concealMethod == 2))
        {   /* % reduced buffering update length during concealment method 2 as Xsav_fx is stored in the  joint  q_old_fx and x_old_tot_fx buffer */
            bufHistlen = bufHistlen - (LprotSzPtr[fs_idx] - min(MAX_BW_BIN, xLen));
            //ASSERT_LC3(xLen == (int16_t)(((double)LprotSzPtr[fs_idx])*0.625)); /*/ only enter here for 10 ms cases */
           /* actually one can  select to always update xLen(10 ms)  less  samples of x_old_tot,  also in  TDC-PLC bfi frames ,, and for PhECU.PLC  */
        }
        oldLen = bufHistlen - xLen;
        /* update ltpf-free pcm history buffer for TD-PLC */
        memmove(&plcAd->x_old_tot_fx[plcAd->max_len_pcm_plc - bufHistlen],
                        &plcAd->x_old_tot_fx[plcAd->max_len_pcm_plc - bufHistlen + xLen], oldLen * sizeof(int16_t));
        memcpy(&plcAd->x_old_tot_fx[plcAd->max_len_pcm_plc - xLen], &x_fx[0], xLen * sizeof(int16_t));

        processPLCUpdateAfterIMDCTstage1(fs_idx, xLen, oldLen, plcAd,bufHistlen, bfi, prev_bfi, 
		                                                 concealMethod,nbLostFramesInRow,x_fx, q_fx_exp);
    }

    /* Update PLC params */
    if (bfi != 1)
    {
        /* % reset counters in GF  */
        *nbLostFramesInRow = 0;    /*plc0,3 4 , udpate  */
        *ns_cum_alpha = 32767;     /*plc0,  4 , udpate  */
        if (plcAd)
        {
#ifndef BE_MOVED_STAB_FAC
            processPLCUpdateAfterIMDCTstage2\(prev_bfi, plcAd, scf_q);         
#endif
            memmove(plcAd->old_old_scf_q, plcAd->old_scf_q, M * sizeof(int16_t));
            memmove(plcAd->old_scf_q, scf_q, M * sizeof(int16_t));
            /* PLC fullband transient detector setting for non-bfi frames */
            plcAd->PhECU_short_flag_prev = 0;   /* fullband transient not active   */
        }
    }
    /* values may be {0,1,2} */
    *prev_prev_bfi = *prev_bfi;  
    *prev_bfi = bfi;  
}

#ifdef BE_MOVED_STAB_FAC
void processPLCcomputeStabFac_main(int16_t scf_q[], int16_t old_scf_q[], int16_t old_old_scf_q[], int16_t bfi, int16_t prev_bfi,
                              int16_t prev_prev_bfi, int16_t *stab_fac)
{
    if (((bfi == 1) && (prev_bfi != 1)) || (bfi == 2))
        processPLCcomputeStabFac(scf_q, old_scf_q, prev_bfi, stab_fac);
}

void processPLCcomputeStabFac(int16_t scf_q[], int16_t old_scf_q[], int16_t prev_bfi, int16_t *stab_fac)
{
    int32_t i;
    int32_t  tmp32;
    int16_t  d;

    /* calculate stability factor */
    if (prev_bfi == 1)
        *stab_fac = 26214; 
    else
    {
        tmp32 = 0; 
        for(i = 0; i < M; i++)
        {
            d = scf_q[i] - old_scf_q[i];
            tmp32 = L_mac_sat(tmp32, d, d);
        }
        tmp32 = L_shl_sat(tmp32, 3);
        if (tmp32 > 0x7D000000 /*1.25*25*/)
            *stab_fac = 0; 
        else if (tmp32 < 0x19003E82 /*0.25*25*/)
            *stab_fac = 0x7FFF; 
        else
        {
            tmp32 = L_shl_pos((0x50000000 - Mpy_32_16(tmp32, 0x51EC)), 1);
            *stab_fac = round_fx(tmp32); 
        }
    }
}
#endif /* BE_MOVED_STAB_FAC */

void processPLCUpdateXFP_w_E_hist(int16_t prev_bfi, int16_t bfi, int16_t *xfp_fx, int16_t xfp_exp_fx, int16_t margin_xfp, 
                                     int16_t fs_idx,
                                     int32_t *L_oold_xfp_w_E_fx, int16_t *oold_xfp_w_E_exp_fx, 
                                     int32_t *L_old_xfp_w_E_fx, int16_t *old_xfp_w_E_exp_fx,
                                    
                                     int16_t *oold_Ltot_exp_fx ,int16_t *old_Ltot_exp_fx )    

{
    int32_t L_tot  ; 
    int16_t dn_scale, exp_shift;
    int16_t used_xfp_exp_fx;
    int16_t exp_out  ; 

    //TRACE("PhECU::UpdateXfp_w_E_hist_fx");

    if (bfi != 1)
    {
        if (prev_bfi == 1)/* only a single historic frame available in the next  frame, force artifical update of oold energy to be the same as old */
           *old_xfp_w_E_exp_fx = LTOT_INIT_FLAG ;  

        /* Time shift energy state and xfp exp */ 
        if (sub_sat(*old_xfp_w_E_exp_fx, LTOT_INIT_FLAG ) ==  0) 
        {
            *L_oold_xfp_w_E_fx   =   LTOT_MIN_MAN  ;                                
            *oold_xfp_w_E_exp_fx =  UNINIT_OR_UNSAFE_OOLD_SENTINEL ;   
        }
        else
        {
            *L_oold_xfp_w_E_fx   = *L_old_xfp_w_E_fx;     /* regular update */
            *oold_xfp_w_E_exp_fx = *old_xfp_w_E_exp_fx; 
        }

        /* Time shift L_tot energy state and L_tot_exp  */
        if (sub_sat(*old_Ltot_exp_fx, LTOT_INIT_FLAG ) ==  0) 
        {
            *L_oold_xfp_w_E_fx   =   LTOT_MIN_MAN  ;                                
            *oold_Ltot_exp_fx    =   UNINIT_OR_UNSAFE_OOLD_SENTINEL ;      
        }
        else
        {
            *L_oold_xfp_w_E_fx   = *L_old_xfp_w_E_fx;     /* regular update */
            *oold_Ltot_exp_fx    = *old_Ltot_exp_fx;        
        }

       
        dn_scale        = e_tot_headroom[fs_idx]; /* allowed minimum dn_scale for a max upshifted signal */
        used_xfp_exp_fx = xfp_exp_fx;      
 
        if ( margin_xfp > 0 ) /* xfp_fx was normalized on a larger area than 16ms part of  pcmBuffer  */
        {     
             ASSERT_LC3(bfi !=1) ; /* if bfi was set the margin_xfp  does not reflect the correct 16ms part of pcm_buf hist, prev_synth */
             dn_scale =  max(0, (e_tot_headroom[fs_idx] -margin_xfp)); 

             exp_shift = (e_tot_headroom[fs_idx] -dn_scale);
             used_xfp_exp_fx = (xfp_exp_fx -exp_shift); /* the virtual change of the xfp_buffer due to reduced downscaling in L_tot calc  */
        }
        
        /* use semifixed dn_scale as adjusted by margin_xfp in 16 ms region */
        exp_out = xfp_exp_fx;     
        L_tot = winEnCalc(xfp_fx, dn_scale , PhECU_wins[fs_idx][0], rectLengthTab[fs_idx], hamm_len2Tab[fs_idx], &exp_out );
           
        *L_old_xfp_w_E_fx   = L_tot;      

        *old_xfp_w_E_exp_fx = used_xfp_exp_fx   ;     
       /* this now needs to be in Q1 , used_fx_exp , (exp_out-1-2*e_tot_headroom[fs_idx])/2  */

        *old_Ltot_exp_fx  = exp_out;  /* new proper _Ltot value from winEnCalc function */ 

       
         /* use true int32_t exponent of L_tot */
            

        /* restart oold and old from same  state for init or prevBFI cases  */   
        
        if (sub_sat(*oold_xfp_w_E_exp_fx, UNINIT_OR_UNSAFE_OOLD_SENTINEL)  <= 0  ||  /* old xfp_Exp */
            sub_sat(*oold_Ltot_exp_fx, UNINIT_OR_UNSAFE_OOLD_SENTINEL)  <= 0     )    /* new L_tot_exp */
        {
            *L_oold_xfp_w_E_fx   = L_tot;       
            *oold_xfp_w_E_exp_fx = used_xfp_exp_fx;    
            *oold_Ltot_exp_fx    = *old_Ltot_exp_fx;     /* use   Ltot exp value */ 
        }
    }
}


