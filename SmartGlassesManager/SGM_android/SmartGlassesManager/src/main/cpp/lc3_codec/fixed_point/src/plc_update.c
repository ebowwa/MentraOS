
#include "defines.h"
#include "functions.h"
#include "stl.h"
#include "basop32.h"


void processPLCupdate(AplcSetup *plcAd, int16_t x_fx[], int16_t q_fx_exp, int16_t concealMethod, int16_t frame_length,
                         int16_t fs_idx, int16_t *nbLostFramesInRow, int16_t *prev_prev_bfi, int16_t *prev_bfi, int16_t bfi, int16_t scf_q[],
                         int16_t ola_mem_fx[], int16_t ola_mem_fx_exp, int16_t *ns_cum_alpha)
{
    processPLCUpdateAfterIMDCT(x_fx, q_fx_exp, concealMethod, frame_length, fs_idx, nbLostFramesInRow, prev_prev_bfi, prev_bfi, bfi,
                                  scf_q, ns_cum_alpha, plcAd); /* NB *prev_bfi updated here */

    if (plcAd != 0)
    { 
        /*  reuse/inplace the most recent 16 ms of x_old_tot without additional rescaling,  keep exponent aligned with tdc pitch buffer to  save WMOPS */
        ASSERT_LC3( (&plcAd->x_old_tot_fx[plcAd->max_len_pcm_plc - LprotSzPtr[fs_idx] ])  == plcAd->PhECU_xfp_fx );   
        plcAd->PhECU_xfp_exp_fx  = plcAd->q_fx_old_exp;     /* exponent used by concealmethod 2 in prevBfi frames and also right after  non bfi frames */
    }
}

void processPLCupdateSpec(int16_t q_old_d_fx[], int16_t *q_old_fx_exp, int32_t q_d_fx[], int16_t *q_fx_exp, int16_t yLen)
{
    int32_t i;
    int16_t  s;

    /* save spectrum and the corresponding exponent */
    s = getScaleFactor32(q_d_fx, yLen);
    *q_old_fx_exp = (*q_fx_exp) - s;

    for(i = 0; i < yLen; i++)
        q_old_d_fx[i] = round_fx_sat(L_shl_sat(q_d_fx[i], s)); /*  */
}

void processPLCspec2shape(int16_t prev_bfi, int16_t bfi, int16_t q_old_d_fx[], int16_t yLen,  
                             int16_t *stPhECU_oold_grp_shape_fx, int16_t *stPhECU_old_grp_shape_fx)

#define L_GRP_DC 4 

{
    int32_t i,l; 
    int16_t  *pX, tmp; 
    int16_t  N_grp,l_grp;
    int16_t  man, expo;
    int32_t  L_acc;
    int32_t  L_tot;
    int32_t  L_grp_shape[MAX_LGW];
    int16_t  grp_shape[MAX_LGW]; /**/
    int16_t  fs_idx,local_prev_bfi;
   
    //TRACE("PhECU::GF::process_plc_spec_2_shape_fx");
    if (bfi != 1)
    {
       fs_idx = mult(yLen, (int16_t)(32768.0 / (99.0))); /* truncation needed , i.e no rounding can be applied here */
       N_grp = xavg_N_grp_fx[fs_idx];
       local_prev_bfi = prev_bfi; 
       if (local_prev_bfi == 2) 
          local_prev_bfi = 0; 

       if( stPhECU_oold_grp_shape_fx[0] < 0 )  
          local_prev_bfi = 1 ;    /* handle startup in the case 2nd frame is a  BFI frame */     

        /* Copy old to oold grp shape */
        for( i=0; i < MAX_LGW ; i++) 
            stPhECU_oold_grp_shape_fx[i] = stPhECU_old_grp_shape_fx[i];     
 
        /* Accumulate DC bin(s) to total */
        pX    = q_old_d_fx;          /*  ptr setup */ 
        L_tot = 0;      /* acc on negative side */
       
        for( i= 0; i < L_GRP_DC; i++)
        {
            tmp    = shr_pos(*pX++ ,spec_shape_headroom[fs_idx]); /* scale down upscaled MDCT to create some headroom */
            L_tot  = L_msu0(L_tot, tmp, tmp);           
        }
 
        /* Accumulate middle subbands and add to total */
        for( i=0; i < (N_grp -1) ; i++)
        {
            L_acc  = 0;  /* acc on negative side */
            l_grp  = mdct_grp_bins_fx[i+1] - mdct_grp_bins_fx[i];   
            for(l=0;l<l_grp; l++)
            {                           
                tmp    = shr(*pX++ ,spec_shape_headroom[fs_idx]);
                L_acc  = L_msu0(L_acc, tmp, tmp);
            }
            L_grp_shape[i] = -L_acc;                   
            L_tot = L_add(L_tot, L_acc);                  /* two negative numbers added */   
        }

        /* Accumulate last subbband and add to total */
        L_acc = 0;    
        l_grp = (mdct_grp_bins_fx[N_grp] - mdct_grp_bins_fx[N_grp-1]) - L_GRP_DC;  

        for(l=0; l<l_grp; l++)
        {
            tmp   = shr(*pX++, spec_shape_headroom[fs_idx]); 
            L_acc = L_msu0(L_acc, tmp, tmp);   
        }
 
        L_grp_shape[(N_grp - 1)] = -L_acc;
        L_tot = L_add(L_tot, L_acc);       /* two negative numbers added */   
        L_tot  = max( -(INT32_MAX), L_tot); /* conditionally add 1 to negative side, to avoid possible saturation in L_negate */ 
        L_tot  = -L_tot;           /* no saturation here as L_tot is != INT32_MIN */

        /* Normalize shape */
        /* norm_scale = 1/L_tot; */
        if (L_tot > 0)
        {
            for(i=0; i < N_grp ; i++)
            {
                man = plc_phEcu_ratio(L_grp_shape[i], L_tot, &expo); /* The mantissa is considered in Q15 output in Q14 */
                grp_shape[i] = shr_sat(man, (expo -1));    /* gfrom Q14 to in Q15 (Due to saturation, it is automatically bound inside [-1.0,1.0].) */
            }
        }
        else
        {
            for(i=0; i < N_grp ; i++)
                grp_shape[i] = GRP_SHAPE_INIT;                          
        }

        /* copy to output */
        for(i=0; i < N_grp ; i++)  
            stPhECU_old_grp_shape_fx[i] = grp_shape[i];    

        for(i = N_grp; i < MAX_LGW ; i++)  
           stPhECU_old_grp_shape_fx[i] = GRP_SHAPE_INIT;
        /* handle oold states for the frame sequence    BAD, GOOD,  NEXT_BAD */
        if(local_prev_bfi == 1)
        {
            for( i=0; i < MAX_LGW ; i++)   
                stPhECU_oold_grp_shape_fx[i] = stPhECU_old_grp_shape_fx[i] ;  
        }
    }
}


