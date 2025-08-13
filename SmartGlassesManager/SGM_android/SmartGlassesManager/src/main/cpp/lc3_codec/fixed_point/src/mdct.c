
#include "functions.h"


/* Union holding buffers to conserve stack memory. */
void processMdct(
    int16_t x[],             /* i:   time input signal */
    int16_t x_exp, int16_t N, /* i:   block size N */
    const int16_t w[],       /* i:   window coefficients including normalization of sqrt(2/N) and scaled by 2^4 */
    int16_t       wLen,      /* i:   window length */
    int16_t       mem[],     /* i/o: last block of input samples */
    int16_t       memLen,    /* i:   length of last sample block */
    int32_t       y[],       /* o:   spectral data */
    int16_t *     y_e,       /* o:   spectal data exponent */
    int8_t *      scratchBuffer)
{
    int32_t i;
    int16_t  z, s, m;
    int16_t *buf;
    int32_t *workBuffer;

    /* Buffers overlap since they are not used at the same time */
    buf        = (int16_t *)scratchBuffer; /* Size = 2 * MAX_LEN */
    workBuffer = (int32_t *)scratchBuffer; /* Size = 4 * MAX_LEN */

    /* Init (constant per sample rate) */
    z = (N << 1) - wLen; /* number of leading zeros in window */
    m = N >> 1;          /* half block size */

    memmove(buf, mem, memLen * sizeof(int16_t));

    memmove(&buf[memLen], x, (N - memLen) * sizeof(int16_t));

    memmove(mem, &x[N - memLen], memLen * sizeof(int16_t));

    for(i = 0; i < m; i++)
    {
        y[m + i] = L_msu0(L_mult0(buf[i], w[i]), buf[2 * m - 1 - i], w[2 * m - 1 - i]); 
    }

    for(i = 0; i < z; i++)
    {
        y[m - 1 - i] = L_mult0(x[2 * m - memLen + i], w[2 * m + i]); 
    }
    
    for(i = i; i < m; i++)
    {
        y[m - 1 - i] = L_mac0_1(L_mult0(x[2 * m - memLen + i], w[2 * m + i]), x[4 * m - memLen - 1 - i],
                              w[4 * m - 1 - i]); 
    }

    s = max(0, getScaleFactor32(y, N));
    for(i = 0; i < N; i++)
    {
        y[i] = L_shl(y[i], s); 
    }

    *y_e = sub(sub(x_exp, 2), s);

    /* N=20 only for 2.5ms possible */
    /* maybe implement this a pre init of shift */
    if (sub(N, 20) <= 0)
    {
        *y_e = add(*y_e, 2);
    }
    else if (sub(N, 120) <= 0)
    {
        *y_e = add(*y_e, 1);
    }

    dct_IV(y, y_e, N, workBuffer);

}

