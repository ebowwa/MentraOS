
#include "defines.h"
#include "functions.h"


void plc_phEcu_F0_refine_first(int16_t *     plocs,                       /* i/o */
                                  const int16_t n_plocs_in, int32_t *L_f0est, /* i/o  Q16 */
                                  const int16_t stPhECU_f0hzLtpBinQ7, const int16_t stPhECU_f0gainLtpQ15,
                                  const int16_t nSubm)
{
    int32_t subm, i;
    int16_t  ploc, n_plocs_ana;
    int32_t  L_tmp = 0, L_diff, L_f0EstQ7, L_sensitivity_Q7;     

    /* single initial peak F0 correction using available LTP information  */

    if (sub(stPhECU_f0gainLtpQ15, ((int16_t)(0.25 * 32768.0))) > 0)
    {
        ploc        = -1;         /* sentinel */
        n_plocs_ana = min(n_plocs_in, 4); /* only analyze  at first 3 deteteced LF peaks */

        /*  only apply analysis below nsubm*pitmax_freq  ~=  1600Hz */
        i = sub(n_plocs_ana, 1);
        while(i >= 0 && sub(plocs[i], (int16_t)(1600.0 / 62.5)) > 0)
        {
            i--;
        }
        n_plocs_ana = add(i, 1);

        if ((n_plocs_ana > 0))
        {
            /*   % find/correct first peak  in f0est , that is a submultiple of n*f0Ltp*/
            for(i = 0; i < n_plocs_ana; i++)
            {

                L_sensitivity_Q7 = L_deposit_l(((int32_t)1) << (7 - 1)); /* 0.5 in Q7 */
                if (sub(stPhECU_f0gainLtpQ15, ((int16_t)(0.75 * 32768.0))) < 0)
                {
                    L_sensitivity_Q7 = L_shr_pos(L_sensitivity_Q7, 1); /* %   more picky if correlation is rather low */
                }

                L_f0EstQ7 = L_shr_pos(L_f0est[i], 9); /* Q16 to Q7 */

                for(subm = 1; subm <= nSubm; subm++)
                {
                    /*adjf0 = abs(f0est - subm*stPhECU_f0hzLtpBin*ones(size(f0est))) < sensitivity ; % L1  difference,
                    vector operation over f0
                    ind   = find(adjf0==1,1); */
                    L_diff = L_msu0(L_f0EstQ7, subm, stPhECU_f0hzLtpBinQ7);
                    L_diff = L_abs(L_diff);
                    if (L_sub(L_diff, L_sensitivity_Q7) < 0)
                    {
                        L_tmp = L_shl_pos(L_mult0(subm, stPhECU_f0hzLtpBinQ7), 16 - 7); /* to Q16 */
                        ploc  = i;                                                      
                        break;
                    }
                    L_sensitivity_Q7 = Mpy_32_16_asm(L_sensitivity_Q7, (int16_t)(0.875 * 32768.0 )); /* 2 cycles */
                }                                                                                    /* subm*/

                if (ploc >= 0)
                {
                    break;
                }
            } /* i, n_ploc_ana*/
        }

        if (ploc >= 0)
        {
            L_f0est[ploc] = L_tmp;  /* in Q16 */
            /*ideally also integer plocs should be updated , e.g.  if  f0est goes from 1.45(plocs=1)  to 1.6(plocs==2)
             */
            /* but that is costly and   not required as long as corr_phase width is large enough ]*/
        }
    }
   
}


