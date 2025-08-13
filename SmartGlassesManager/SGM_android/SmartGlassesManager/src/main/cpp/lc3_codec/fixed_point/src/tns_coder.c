
#include "functions.h"


static void   Parcor2Index(const int16_t parCoeff[] /*Q15*/, int16_t index[], int16_t order);
static void   Index2Parcor(const int16_t index[], int16_t parCoeff[], int16_t order);
static int32_t FIRLattice(int16_t order, const int16_t *parCoeff /*Q15*/, int32_t *state, int32_t x /* Q0 */);

/*************************************************************************/

void processTnsCoder(int16_t *bits, int16_t indexes[], int32_t x[], int16_t BW_cutoff_idx, int16_t order[],
                        int16_t *numfilters, int16_t enable_lpc_weighting, int16_t nSubdivisions, int16_t frame_dms,
                        int16_t maxLen, int8_t *scratchBuffer)
{
    int16_t *      tmpbuf;
    int32_t *      rxx, epsP, *state, L_tmp, *A, predictionGain, alpha;
    int16_t *      RC, inv;
    int16_t        n, n2, headroom, shift, tmp, shifts, facs, facs_e, stopfreq, xLen, maxOrder;
    int16_t        startfreq[TNS_NUMFILTERS_MAX];
    const int16_t *subdiv_startfreq, *subdiv_stopfreq;
    int32_t       i, j, iSubdivisions, lag;
    int8_t *       LevinsonBuffer;

    /* Buffer alignment */
    tmpbuf = (int16_t *)scratchBuffer; /* Size = 2 * MAX_LEN */

    rxx = (int32_t *)(((uint8_t *)tmpbuf) + sizeof(*tmpbuf) * maxLen); /* Size = 4 * (MAXLAG + 1) = 36 bytes */

    state = (int32_t *)(((uint8_t *)rxx) + sizeof(*rxx) * (MAXLAG + 1)); /* Size = 4 * MAXLAG = 32 bytes */

    A = (int32_t *)(((uint8_t *)state) + sizeof(*state) * MAXLAG); /* Size = 4 * (MAXLAG + 1) = 36 bytes */

    RC = (int16_t *)(((uint8_t *)A) + sizeof(*A) * (MAXLAG + 1)); /* Size = 2 * MAXLAG = 16 bytes */

    LevinsonBuffer = ((int8_t *)RC) + sizeof(*RC) * (MAXLAG); /* Size = 4 * (M_LTPF + 1) = 100 bytes */

    /* Init */
    *bits       = 0;                                
    maxOrder    = MAXLAG;                           
    *numfilters = 1;                                
    xLen        = BW_cutoff_bin_all[BW_cutoff_idx]; 

    switch (frame_dms)
    {
    case 25:
        startfreq[0]     = 3;                                         
        subdiv_startfreq = tns_subdiv_startfreq_2_5ms[BW_cutoff_idx]; 
        subdiv_stopfreq  = tns_subdiv_stopfreq_2_5ms[BW_cutoff_idx];  
        xLen             = shr_pos(xLen, 2);
        maxOrder         = 4; 
        break;
    case 50:
        startfreq[0]     = 6;                                       
        subdiv_startfreq = tns_subdiv_startfreq_5ms[BW_cutoff_idx]; 
        subdiv_stopfreq  = tns_subdiv_stopfreq_5ms[BW_cutoff_idx];  
        xLen             = shr_pos(xLen, 1);
        maxOrder         = 4;
        break;
    default:                                                    /* 100 */
        startfreq[0]     = 12;                                  
        subdiv_startfreq = tns_subdiv_startfreq[BW_cutoff_idx]; 
        subdiv_stopfreq  = tns_subdiv_stopfreq[BW_cutoff_idx];  
        break;
    }

    if (sub(BW_cutoff_idx, 3) >= 0 && frame_dms >= 50)
    {
        *numfilters  = 2;
        startfreq[1] = shr_pos(xLen, 1);
    }

    memset(state, 0, MAXLAG * sizeof(*state));

    for(j = 0; j < *numfilters; j++)
    {
        memset(rxx, 0, (maxOrder + 1) * sizeof(*rxx));

        for(iSubdivisions = 0; iSubdivisions < nSubdivisions; iSubdivisions++)
        {
            n = sub(subdiv_stopfreq[nSubdivisions * j + iSubdivisions],
                    subdiv_startfreq[nSubdivisions * j + iSubdivisions]);

            /*norms[iFilter][iSubdivisions] = norm2FLOAT(pSpectrum+iStartLine, iEndLine-iStartLine);*/
            headroom = getScaleFactor32(x + subdiv_startfreq[nSubdivisions * j + iSubdivisions], n);

            /* Calculate norm of spectrum band */
            L_tmp = Norm32Norm(x + subdiv_startfreq[nSubdivisions * j + iSubdivisions], headroom, n, &shift);

            /* Rounding to avoid overflow when computing the autocorrelation below */
            tmp   = sub(norm_l(L_tmp), 1);
            L_tmp = L_shl(L_tmp, tmp);
            shift = sub(shift, tmp);
            L_tmp = L_add(L_tmp, 0x8000);
            L_tmp = L_and(L_tmp, 0x7FFF0000);

            if (L_tmp == 0)
            {
                rxx[0] = 0x7FFFFFFF; 
                memset(&rxx[1], 0, (maxOrder) * sizeof(*rxx));
                break;
            }

            /* get pre-shift for autocorrelation */
            tmp    = sub(shift, norm_l(L_tmp)); /* exponent for normalized L_tmp */
            tmp    = shr_pos(sub(1, tmp), 1);   /* pre-shift to apply before autocorrelation */
            shifts = min(tmp, headroom);

            /* calc normalization factor */
            facs_e = shl_pos(sub(tmp, shifts), 1);

            switch (frame_dms)
            {
            case 25: facs_e = add(facs_e, 1); break;
            case 50: facs_e = add(facs_e, 1); break;
            case 100: break;
            }

            tmp   = sub(1, shl_pos(tmp, 1));       /* exponent of autocorrelation */
            L_tmp = L_shl(L_tmp, sub(shift, tmp)); /* shift L_tmp to that exponent */
            /* calc factor (with 2 bits headroom for sum of 3 subdivisions) */
            facs = div_s(0x2000, round_fx(L_tmp)); /* L_tmp is >= 0x2000000 */

            for(i = 0; i < n; i++)
            {
                tmpbuf[i] = round_fx_sat(
                    L_shl_sat(x[subdiv_startfreq[nSubdivisions * j + iSubdivisions] + i], shifts)); 
            }

            for(lag = 0; lag <= maxOrder; lag++)
            {
                n2 = sub(n, lag);
                L_tmp = L_deposit_l(0);
                for(i = 0; i < n2; i++)
                {
                    L_tmp = L_mac0_1(L_tmp, tmpbuf[i], tmpbuf[i + lag]);
                }
                if (lag != 0)
                    L_tmp = Mpy_32_32(L_tmp, tnsAcfWindow[lag - 1]);

                L_tmp = Mpy_32_16(L_tmp, facs);
                L_tmp = L_shl(L_tmp, facs_e);

                rxx[lag] = L_add(rxx[lag], L_tmp); 
            }
        }

        /* Levinson-Durbin */
        processLevinson(A, rxx, maxOrder, RC, &epsP, LevinsonBuffer);

        /* Prediction Gain */
        shift          = norm_l(epsP);
        inv            = div_s(16383, extract_h(L_shl_pos(epsP, shift)));
        predictionGain = Mpy_32_32(rxx[0], Mpy_32_16(L_sub(MAX_32, Mpy_32_16(L_shl(epsP, shift), inv)), inv));

        if (L_sub(predictionGain, L_shr_pos_pos(0x30000000, shift)) > 0)
        {
            /* If Prediction Gain is low */
            
            if (enable_lpc_weighting != 0 && L_sub(predictionGain, L_shr_pos_pos(0x40000000, shift)) < 0)
            {
                /* LPC weighting */
                alpha = L_add(0x6CCCCCCD,
                              Mpy_32_32(0x13333333, L_shl_pos(L_sub(L_shl_pos(predictionGain, shift), 0x30000000), 3)));
                L_tmp = alpha;
                for(i = 1; i < maxOrder; i++)
                {
                    A[i]  = Mpy_32_32(A[i], L_tmp); 
                    L_tmp = Mpy_32_32(L_tmp, alpha);
                }
                A[maxOrder] = Mpy_32_32(A[maxOrder], L_tmp); 

                /* LPC -> RC */
                lpc2rc(A, RC, maxOrder);
            }

            /* Reflection Coefficients Quantization */
            Parcor2Index(RC, &indexes[MAXLAG * j], maxOrder);

            /* reduce filter order by truncating trailing zeros */
            i = sub(maxOrder, 1);
            while((i >= 0) && (indexes[MAXLAG * j + i] == INDEX_SHIFT))
            {
                i = sub(i, 1);
            }
            order[j] = add(i, 1);

            /* Count bits */
            L_tmp = L_deposit_l(plus_ac_tns_order_bits[enable_lpc_weighting][order[j] - 1]);
            for(i = 0; i < order[j]; i++)
            {
                L_tmp = L_add(L_tmp, L_deposit_l(plus_ac_tns_coef_bits[i][indexes[MAXLAG * j + i]]));
            }
            *bits = add(*bits, add(2, extract_l(L_shr_pos(L_sub(L_tmp, 1), 11)))); 

            /* Unquantize Reflection Coefficients */
            Index2Parcor(&indexes[MAXLAG * j], RC, order[j]);

            /* Stop frequency */
            stopfreq = xLen; 
            if (sub(*numfilters, 2) == 0 && j == 0)
            {
                stopfreq = startfreq[1];
            }

            /* Filter */
            for(i = startfreq[j]; i < stopfreq; i++)
            {
                x[i] = FIRLattice(order[j], RC, state, x[i]); 
            }
        }
        else
        {
            /* TNS disabled */
            *bits    = add(*bits, 1);
            order[j] = 0;
        }
    }

}

/*************************************************************************/

static void Parcor2Index(const int16_t parCoeff[] /*Q15*/, int16_t index[], int16_t order)
{
    int32_t i;
    int16_t  iIndex;
    int16_t  x;

    for(i = 0; i < order; i++)
    {
         
        iIndex = 1;
        x      = parCoeff[i];

        while((iIndex < TNS_COEF_RES) && (x > tnsQuantThr[iIndex - 1]))
        {
            iIndex = add(iIndex, 1);
        }
        index[i] = sub(iIndex, 1); 
    }

}

static void Index2Parcor(const int16_t index[], int16_t parCoeff[], int16_t order)
{
    int32_t i;
    for(i = 0; i < order; i++)
    {
        parCoeff[i] = tnsQuantPts[index[i]]; 
    }
}

static int32_t FIRLattice(int16_t order, const int16_t *parCoeff /*Q15*/, int32_t *state, int32_t x /* Q0 */)
{
    int32_t i;
    int32_t  tmpSave, tmp;

    tmpSave = L_add(x, 0);

    for(i = 0; i < order - 1; i++)
    {
        tmp      = L_add(state[i], Mpy_32_16(x, parCoeff[i]));
        x        = L_add(x, Mpy_32_16(state[i], parCoeff[i])); /* exponent: 31+0 */
        state[i] = tmpSave;                                    
        tmpSave  = L_add(tmp, 0);
    }

    /* last stage: only need half operations */
    x                = L_add(x, Mpy_32_16(state[order - 1], parCoeff[order - 1]));
    state[order - 1] = tmpSave; 
    return x;
}

