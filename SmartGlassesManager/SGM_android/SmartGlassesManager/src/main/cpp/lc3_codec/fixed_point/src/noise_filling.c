
#include "functions.h"


static inline int16_t processNoiseFillingstage1(int16_t noisefillwidth, int16_t noisefillstart, int32_t xq[], int16_t* ind, int16_t N)
{
    int32_t i = 0;
    int16_t  nzeros = 0;
    int16_t n = 0;

    nzeros = -2 * noisefillwidth - 1;
    for(i = noisefillstart - noisefillwidth; i < noisefillstart + noisefillwidth; i++)
    {
        if (xq[i] != 0)
            nzeros = -2 * noisefillwidth - 1;
        else
            nzeros += 1;
    }

    for(i = noisefillstart; i < N - noisefillwidth; i++)
    {
        if (xq[i + noisefillwidth] != 0)
            nzeros = -2 * noisefillwidth - 1;
        else
            nzeros += 1;

        if (nzeros >= 0)
            ind[n++] = i;
    }

    for(i = N - noisefillwidth; i < N; i++)
    {
        nzeros += 1;
        if (nzeros >= 0)
            ind[n++] = i;
    }

    return n;
}

static inline void processNoiseFillingstage2(int16_t m, int16_t fac_ns_idx, int16_t xq_e, int16_t fac_ns_pc, 
	                                                        int16_t spec_inv_idx, int16_t* ind, int32_t xq[], int16_t nfseed)
{
    int i = 0;
    int16_t  fac_ns = 0;
    int32_t  L_NF, L_NF_pc = 0;;

    fac_ns = shl_pos(sub(8, fac_ns_idx), 11);
    L_NF = L_shr(L_deposit_l(fac_ns), sub(xq_e, 16));
    L_NF_pc = L_shr(L_deposit_l(fac_ns_pc), sub(xq_e, 16));

    for(i = 0; i < m; i++)
    {
        nfseed = extract_l(L_mac0_1(13849, nfseed, 31821));
        if (nfseed >= 0)
        {
            if (ind[i] < spec_inv_idx)
                xq[ind[i]] = L_NF;
            else
                xq[ind[i]] = L_NF_pc;
        }
        else
        {
            if (ind[i] < spec_inv_idx)
                xq[ind[i]] = L_negate(L_NF);
            else
                xq[ind[i]] = L_negate(L_NF_pc);
        }
    }
}


void processNoiseFilling(int32_t xq[], int16_t nfseed, int16_t xq_e, int16_t fac_ns_idx, int16_t BW_cutoff_idx,
                            int16_t frame_dms, int16_t fac_ns_pc, int16_t spec_inv_idx, int8_t *scratchBuffer)
{
    int16_t   *ind, m;
    int16_t  noisefillwidth, noisefillstart, N;

    ind = (int16_t *)scratchBuffer; /* Size = 2 * MAX_LEN bytes */
    m = 0;
	
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
    default: /* 100 */
        N = BW_cutoff_bin_10ms[BW_cutoff_idx];        
        noisefillwidth = NOISEFILLWIDTH_10MS;
        noisefillstart = NOISEFILLSTART_10MS;
        break;
    }

    m = processNoiseFillingstage1(noisefillwidth, noisefillstart, xq, ind, N);

    if(m > 0)
        processNoiseFillingstage2(m, fac_ns_idx, xq_e, fac_ns_pc, spec_inv_idx, ind, xq, nfseed);

}

