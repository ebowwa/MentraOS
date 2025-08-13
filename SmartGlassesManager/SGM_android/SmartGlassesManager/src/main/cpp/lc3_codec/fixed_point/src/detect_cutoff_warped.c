
#include "functions.h"


void processDetectCutoffWarped(int16_t *bw_idx, int32_t *d2_fx, int16_t d2_fx_exp, int16_t fs_idx, int16_t frame_dms)
{

    int32_t       iBand;
    int32_t        d2_fx_sum;
    int32_t        d2_fx_mean;
    int32_t        delta_energy;
    int16_t        d2_fx_sum_exp;
    int16_t        d2_fx_mean_exp;
    int16_t        nrg_below_thresh;
    int16_t        counter;
    int16_t        brickwall;
    int16_t        stop;
    int16_t        brickwall_dist;
    const int16_t *warp_idx_start, *warp_idx_stop;

    switch (frame_dms)
    {
    case 25:
        warp_idx_start = BW_warp_idx_start_all_2_5ms[fs_idx - 1]; 
        warp_idx_stop  = BW_warp_idx_stop_all_2_5ms[fs_idx - 1];  
        break;
    case 50:
        warp_idx_start = BW_warp_idx_start_all_5ms[fs_idx - 1]; 
        warp_idx_stop  = BW_warp_idx_stop_all_5ms[fs_idx - 1];  
        break;
    default:                                                /* 100 */
        warp_idx_start = BW_warp_idx_start_all[fs_idx - 1]; 
        warp_idx_stop  = BW_warp_idx_stop_all[fs_idx - 1];  
        break;
    }

    counter = fs_idx;
    do
    {

        /* counter is 0...num_idxs-1 */
        counter = sub(counter, 1);

        /* always code the lowest band (NB), skip check against threshold if counter == -1 */
        if (counter < 0)
        {
            break;
        }

        d2_fx_mean     = 0; 
        d2_fx_mean_exp = 0; 

        iBand         = warp_idx_start[counter]; 
        d2_fx_sum     = d2_fx[iBand];            
        d2_fx_sum_exp = d2_fx_exp;               

        iBand++;
        for(; iBand <= warp_idx_stop[counter]; iBand++)
        {
            d2_fx_sum = LC3_Add_Mant32Exp(d2_fx[iBand], d2_fx_exp, d2_fx_sum, d2_fx_sum_exp, &d2_fx_sum_exp);
        }
        /* Energy-sum */
        d2_fx_mean = Mpy_32_16(d2_fx_sum, InvIntTable[add(sub(warp_idx_stop[counter], warp_idx_start[counter]), 1)]);
        d2_fx_mean_exp = d2_fx_sum_exp; 

        /* check if above threshold */
        nrg_below_thresh = LC3_Cmp_Mant32Exp(BW_thresh_quiet[counter], BW_thresh_quiet_exp, d2_fx_mean,
                                                    d2_fx_mean_exp); /* true if firstNumber > secondNumber */
    }
    while(nrg_below_thresh > 0)
        ;

    *bw_idx = add(1, counter); 

    /* addtional check for brickwall characteristic */
    if (sub(fs_idx, *bw_idx) > 0)
    {
        brickwall      = 0; 
        stop           = add(warp_idx_start[counter + 1], 1);
        brickwall_dist = BW_brickwall_dist[counter + 1];

        for(iBand = stop; iBand >= sub(stop, brickwall_dist); iBand--)
        {
            /* Band(x) > Band(x-3)*Thr */
            delta_energy =
                L_sub(Mpy_32_16_asm(d2_fx[iBand - brickwall_dist], BW_thresh_brickwall[counter + 1]), d2_fx[iBand]);
            if (delta_energy > 0)
            {
                brickwall = 1; 
            }
            if (brickwall)
            {
                break;
            }
        }
        if (brickwall == 0)
        {
            *bw_idx = fs_idx;
        }
    }

}

