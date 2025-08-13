
#include "defines.h"
#include "functions.h"


void plc_phEcu_LF_peak_analysis(int16_t *      plocs,      /* i/o  0 ... Lprot/2 +1*/
                                   int16_t *      n_plocs,    /* i/o   0.. MAX_PLOCS  */
                                   int32_t *      L_f0estQ16, /* i/o  Q16*/
                                   const int16_t *mag,        /* i: Qx    */
                                   const int16_t stPhECU_f0hzLtpBinQ7, const int16_t stPhECU_f0gainLtpQ15,
                                   const int16_t nSubm, int16_t maxPlocs,
                                   int8_t *scratchBuffer /* Size = 6 * MAX_PLOCS + 42 */
)
{
    int32_t i, j;
    int16_t  n_plocs_ana, peakLF_Xval, tmp, f_abs_ind, plocsIntersectFlag;

    int32_t  L_fQ7, *L_f0est_prelQ16;
    int16_t  num_prel = 0, *plocs_prel;
    int16_t  prel_low, prel_high, start, fin;
    int16_t *plocs_old;
    int32_t *L_plocsi_old;     

    L_f0est_prelQ16 = (int32_t *)scratchBuffer;                              /* Size = 4 * 7 */
    plocs_prel      = (int16_t *)(((uint8_t *)L_f0est_prelQ16) + sizeof(*L_f0est_prelQ16) * 7); /* Size = 2 * 7 */
    plocs_old       = (int16_t *)(((uint8_t *)plocs_prel) + sizeof(*plocs_prel) * 7);           /* Size = 2 * MAX_PLOCS */
    L_plocsi_old    = (int32_t *)(((uint8_t *)plocs_old) + sizeof(*plocs_old) * maxPlocs);      /* Size = 4 * MAX_PLOCS */

     
    if ((*n_plocs > 0) && sub(stPhECU_f0gainLtpQ15, ((int16_t)(0.25 * 32768.0))) > 0 &&
        sub(stPhECU_f0hzLtpBinQ7, (int16_t)(2.75 * 128.0)) < 0)
    {

        /* % analyze/apply  f0Ltp to avoid  intermodulation effects  below  f0  of ~180 Hz
        % we only do the  f0Ltp-replacement(s)  if  there is already an established
        % fft peak in the region   ~fRes  to  2.5*fres
        fft_peak_eval_plocs = 1:3;
        plocsIntersectFlag = intersect(plocs, fft_peak_eval_plocs );  % check for 1,2,3  in plocs  */

        plocsIntersectFlag = 0; 
        peakLF_Xval        = 0; 
        n_plocs_ana        = min(*n_plocs, 3);
        for(i = 0; i < n_plocs_ana; i++)
        {
            tmp = plocs[i];       
            if (sub(tmp, 2) <= 0) /*  C index  0, 1,2  checked , [DC, 62.5 Hz, 125Hz ] */
            {
                plocsIntersectFlag = add(i, 1);
            }
            peakLF_Xval = max(mag[tmp], peakLF_Xval);
        }

        num_prel = 0; 
        if (plocsIntersectFlag != 0)
        { /* fft-peak at 0, 62 or 125 Hz  */
            /*  analyze if  ltp-based f0 need to be added  or not  */
            peakLF_Xval = mult_r(peakLF_Xval, (int16_t)(.375 * 32768.0)); /* now as a limit */

            for(i = 1; i <= nSubm; i++)
            {
                L_fQ7     = L_mult0(i, stPhECU_f0hzLtpBinQ7); /* fractional index stored in L_plocsi */
                f_abs_ind = L_shr_pos(L_add(L_fQ7, 64), 7);   /* integer bin index stored in plocs */

                
                if ((L_sub(L_fQ7, 819) <= 0) && /*  % only apply up to ~400hz , 819 = 400/62.5*128 */
                    (sub(mag[f_abs_ind], peakLF_Xval) >
                     0)) /* %  only set as preliminary  if relative peak strength is signficant*/
                {
                    L_f0est_prelQ16[num_prel] = L_shl_pos(L_fQ7, 9); 
                    plocs_prel[num_prel]      = f_abs_ind;           
                    num_prel                  = add(num_prel, 1);
                }
            }
        } /*intersectFlag*/

        /* now replace/ merge new preliminary added peaks with existing plocs and L_f0estQ16 */
        /* note that a previous fake/merged magnitude-determined peak may be replaced by two separated  side peaks */

        /* a general non-optimized list-merging solution below */
        
        if ((num_prel > 0) && (sub(add(num_prel, *n_plocs), MAX_PLOCS) <= 0) /* skip in case plocs list is too large */
        )
        {
            prel_low  = plocs_prel[0];                
            prel_high = plocs_prel[sub(num_prel, 1)]; 

            start = -1; 
            for(i = sub(*n_plocs, 1); i >= 0; i--)
            {
                if (sub(plocs[i], prel_low) >= 0)
                {
                    start = i; 
                }
            }
            start = sub(start, 1);    /* end of old section to copy before the added/merged section */
            start = max(start, -1); /* limit  for loop later */
                                      /*% dbg check  low part for a sucessful replace/merge  */
            if (start >= 0 && start < *n_plocs)
            {
                ASSERT_LC3(plocs[start] < plocs_prel[0]);
            }

            sub(0, 0);
            if (prel_high < plocs[0])
            {
                fin = 0;  /*% keep all plocs , just concat  */
            }
            else
            {
                fin = *n_plocs;
                for(i = 0; i < *n_plocs; i++)
                {
                    sub(0, 0);
                    if (plocs[i] <= prel_high)
                    {
                        fin = i; 
                    }
                }
                fin = add(fin, 1); /* first element  in high part of old  plocs to be copied  */
            }

            /*% dbg check high part for a sucessful replace/merge */
            if (fin >= 0 && fin < *n_plocs)
            {
                ASSERT_LC3(plocs_prel[sub(num_prel, 1)] < plocs[fin]);
            }

            /*
            % actual replace/merge of added integer locations and fractional freqs. into plocs/f0list  list ;
            % three loops in BASOP
            plocs     =  [ plocs(1:(start)) ; plocs_prel ; plocs((fin):end) ];
            f0est    =   [  f0est(1:(start)) ; f0est_prel; f0est((fin):end) ];
            */

            for(i = 0; i < *n_plocs; i++)
            {
                plocs_old[i]    = plocs[i];      
                L_plocsi_old[i] = L_f0estQ16[i]; 
            }

            /*
            j=0;
            for(i=0; i <= start; i++)
            {
                plocs[i] = plocs_old[i];        
            L_f0estQ16[i] = L_plocsi_old[i]; 
            j++;
        }
        */

            j = add(start, 1);

        for(i = 0; i < num_prel; i++) /* NB this section may  both insert or overwrite old plocs   */
        {
            plocs[j]      = plocs_prel[i];      
            L_f0estQ16[j] = L_f0est_prelQ16[i]; 
            j++;
        }
        for(i = fin; i < *n_plocs; i++) /* copy the tail of the list */
        {
            plocs[j]      = plocs_old[i];    
            L_f0estQ16[j] = L_plocsi_old[i]; 
            j++;
        }

        *n_plocs = j;  /* update total length   */
    }                            /* num_prel >0*/
} /* gain/hz Limits */
    
}


