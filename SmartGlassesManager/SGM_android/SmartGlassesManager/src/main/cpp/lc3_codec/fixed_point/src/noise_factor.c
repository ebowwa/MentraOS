
#include "functions.h"


#ifdef NONBE_LOW_BR_NF_TUNING
void processNoiseFactor(int16_t *fac_ns_idx, int16_t x_e, int32_t x[], int16_t xq[], int16_t gg, int16_t gg_e,
                           int16_t BW_cutoff_idx, int16_t frame_dms, int16_t target_bytes, int8_t *scratchBuffer)
#else
void processNoiseFactor_fx(int16_t *fac_ns_idx, int16_t x_e, int32_t x[], int16_t xq[], int16_t gg, int16_t gg_e,
                           int16_t BW_cutoff_idx, int16_t frame_dms, int8_t *scratchBuffer)
#endif
{
    int32_t k = 0;
    int16_t  nzeros, s1, s2, s3, c, idx, fac_unq, *ind;
    int16_t  noisefillwidth, noisefillstart, N = 0;
    int32_t  Lsum = 0;

    ind = (int16_t *)scratchBuffer; /* Size = 2 * MAX_LEN bytes */

    noisefillwidth = 0;
    noisefillstart = 0;
    c              = 0;

    switch (frame_dms)
    {
    case 25:
        N = BW_cutoff_bin_2_5ms[BW_cutoff_idx];        
        noisefillwidth = NOISEFILLWIDTH_2_5MS;
        noisefillstart = NOISEFILLSTART_2_5MS;
        break;
    case 50:
        N = BW_cutoff_bin_5ms[BW_cutoff_idx];        
        noisefillwidth = NOISEFILLWIDTH_5MS;
        noisefillstart = NOISEFILLSTART_5MS;
        break;
    case 100:
        N = BW_cutoff_bin_10ms[BW_cutoff_idx];        
        noisefillwidth = NOISEFILLWIDTH_10MS;
        noisefillstart = NOISEFILLSTART_10MS;
        break;
    }

    nzeros = -2 * noisefillwidth - 1; 

    for(k = noisefillstart - noisefillwidth; k < noisefillstart + noisefillwidth; k++)
    {
        if (xq[k] != 0)
        {
            nzeros = -2 * noisefillwidth - 1; 
        }
        if (xq[k] == 0)
        {
            nzeros = add(nzeros, 1);
        }
    }

    for(k = noisefillstart; k < N - noisefillwidth; k++)
    {
        if (xq[k + noisefillwidth] != 0)
        {
            nzeros = -2 * noisefillwidth - 1; 
        }
        if (xq[k + noisefillwidth] == 0)
        {
            nzeros = add(nzeros, 1);
        }
        if (nzeros >= 0)
        {
            ind[c++] = k; 
        }
    }

    for(k = N - noisefillwidth; k < N; k++)
    {
        nzeros = add(nzeros, 1);
        if (nzeros >= 0)
        {
            ind[c++] = k; 
        }
    }

    if (c == 0)
    {
        fac_unq = 0; 
    }
    else
    {

#ifdef NONBE_LOW_BR_NF_TUNING
        if (target_bytes <= 20 && frame_dms == 100)
        {
            int32_t ind_sum;
            int16_t mean_ind;

            int16_t fac_unq1, fac_unq2;

            /* calculate mean index */
            ind_sum = ind[0]; 
            for(k = 1; k < c; k++)
            {
                ind_sum = L_add(ind_sum, ind[k]);
            }

            mean_ind = Divide3216_Scale(ind_sum, c, &s2);
            mean_ind = shl(mean_ind, s2 + 1);

            assert(0 <= mean_ind && mean_ind <= ind[c - 1]);

            /* calculate noise filling gain for low frequencies */
            Lsum = 0; 
            for(k = 0; ind[k] <= mean_ind; k++)
            {
                Lsum = L_add(Lsum, L_abs(x[ind[k]]));
            }
            fac_unq1 = Divide3216_Scale(Lsum, k, &s1);
            fac_unq1 = Divide1616_Scale(fac_unq1, gg, &s2);
            s3       = sub(15, add(x_e, add(s1, sub(s2, gg_e))));
            s2       = norm_s(fac_unq1);
            
            if (fac_unq1 != 0 && add(s3, s2) < 0)
            {
                fac_unq1 = MAX_16; 
            }
            else
            {
                fac_unq1 = shr_r(fac_unq1, min(s3, 15));
            }

            /* calculate noise filling gain for high frequencies */
            Lsum = 0; 
            idx  = sub(c, k);
            for(; k < c; k++)
            {
                Lsum = L_add(Lsum, L_abs(x[ind[k]]));
            }
            fac_unq2 = Divide3216_Scale(Lsum, idx, &s1);
            fac_unq2 = Divide1616_Scale(fac_unq2, gg, &s2);
            s3       = sub(15, add(x_e, add(s1, sub(s2, gg_e))));
            s2       = norm_s(fac_unq1);
            
            if (fac_unq2 != 0 && add(s3, s2) < 0)
            {
                fac_unq2 = MAX_16; 
            }
            else
            {
                fac_unq2 = shr_r(fac_unq2, min(s3, 15));
            }

            /* calculate noise filling gain as minimum over high and low frequencies */
            fac_unq = min(fac_unq1, fac_unq2);
        }
        else
        {
            Lsum = L_abs(x[ind[0]]);
            for(k = 1; k < c; k++)
            {
                Lsum = L_add(Lsum, L_abs(x[ind[k]]));
            }
            fac_unq = Divide3216_Scale(Lsum, c, &s1);
            fac_unq = Divide1616_Scale(fac_unq, gg, &s2);
            s3      = sub(15, add(x_e, add(s1, sub(s2, gg_e))));
            s2      = norm_s(fac_unq);
            
            if (fac_unq != 0 && add(s3, s2) < 0)
            {
                fac_unq = MAX_16; 
            }
            else
            {
                fac_unq = shr_r(fac_unq, min(s3, 15));
            }
        }
#else
        Lsum = L_abs(x[ind[0]]);
        for(k = 1; k < c; k++)
        {
            Lsum = L_add(Lsum, L_abs(x[ind[k]]));
        }
        fac_unq = Divide3216_Scale(Lsum, c, &s1);
        fac_unq = Divide1616_Scale(fac_unq, gg, &s2);
        s3      = sub(15, add(x_e, add(s1, sub(s2, gg_e))));
        s2      = norm_s(fac_unq);
        
        if (fac_unq != 0 && add(s3, s2) < 0)
        {
            fac_unq = MAX_16; 
        }
        else
        {
            fac_unq = shr_r(fac_unq, min(s3, 15));
        }

#endif
    }

    idx = round_fx(L_sub(0x80000, L_mult(fac_unq, 16)));
    if (sub(idx, 7) > 0)
    {
        idx = 7; 
    }
    if (idx < 0)
    {
        idx = 0; 
    }
    *fac_ns_idx = idx; 

}

