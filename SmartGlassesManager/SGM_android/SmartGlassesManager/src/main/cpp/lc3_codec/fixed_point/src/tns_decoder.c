
#include "functions.h"


static inline int32_t IIRLattice(int16_t order, const int16_t *parCoeff, int32_t *state, int32_t x)
{
    int32_t i;

    /* first stage: no need to calculate state[order-1] */
    x = L_sub(x, Mpy_32_16(state[order - 1], parCoeff[order - 1]));
    for(i = order - 2; i >= 0; i--)
    {
        x = L_sub(x, Mpy_32_16(state[i], parCoeff[i]));
        state[i + 1] = L_add(state[i], Mpy_32_16(x, parCoeff[i]));
    }

    state[0] = x;
    return x;
}

static void TnsDecoderInitFilter(int32_t *state, int16_t f, int32_t x[], int16_t numfilters, int16_t order[], int16_t* startfreq,
                                                             int16_t s, int16_t* rc, int16_t rc_idx[], int16_t* stopfreq, int16_t BW_stopband, int16_t xLen)
{
    int32_t i = 0;
    int32_t j = 0;

    memset(state, 0, MAXLAG * sizeof(int32_t));
    for(i = 0; i < f; i++)
        x[i] = L_shl(x[i], s);

    for(j = 0; j < numfilters; j++)
    {
        if (order[j] > 0)
        {
            /* Unquantize coefficients */
            for(i = 0; i < order[j]; i++)
                rc[i] = tnsQuantPts[rc_idx[j * MAXLAG + i]];

            /* Stop frequency */
            *stopfreq = BW_stopband;
            if ((numfilters == 2) && (j == 0))
                *stopfreq = startfreq[1];

            /* Filter */
            for(i = startfreq[j]; i < *stopfreq; i++)
                x[i] = IIRLattice(order[j], rc, state, L_shl(x[i], s));
        }
    }
    for(i = *stopfreq; i < xLen; i++)
        x[i] = L_shl(x[i], s);
}

void processTnsDecoder(int16_t rc_idx[], int32_t x[], int16_t xLen, int16_t order[], int16_t *x_e, int16_t BW_stopband_idx,
                          int16_t frame_dms, int8_t *scratchBuffer)
{
    int32_t *state;
    int16_t  s1, s2, s, *rc, f, stopfreq, BW_stopband;
    int16_t  numfilters, startfreq[TNS_NUMFILTERS_MAX] = {0};

    state = (int32_t *)scratchBuffer;               /* Size = MAXLAG */
    rc = (int16_t *)(((uint8_t *)state) + sizeof(*state) * MAXLAG); /* Size = MAXLAG */
    numfilters = 1;
    switch (frame_dms)
    {
    case 25:
        startfreq[0] = 3;
        BW_stopband  = BW_cutoff_bin_2_5ms[BW_stopband_idx];
        break;
    case 50:
        startfreq[0] = 6;
        BW_stopband  = BW_cutoff_bin_5ms[BW_stopband_idx];
        break;
    default: /* 100 */
        startfreq[0] = 12;
        BW_stopband  = BW_cutoff_bin_10ms[BW_stopband_idx];
        break;
    }

    if ((BW_stopband_idx >= 3) && (frame_dms >= 50))
    {
        numfilters   = 2;
        startfreq[1] = shr_pos(BW_stopband, 1);
    }
    stopfreq = 0;

    if (order[0] > 0 || ((numfilters == 2) && (order[1] > 0)))
    {
        /* Scaling */
        f = startfreq[0];
        if ((numfilters == 2) && (order[0] == 0))
            f = startfreq[1];

        s1 = getScaleFactor32(x, f);
        s2 = getScaleFactor32((x + f), (xLen - f));
        s = min(s1, (s2 -7)); /* 7 bits of headroom for IIR filtering */
        *x_e = (*x_e) - s;

        TnsDecoderInitFilter(state, f, x, numfilters, order, startfreq, s,rc, rc_idx, &stopfreq, BW_stopband, xLen);
    }
}

