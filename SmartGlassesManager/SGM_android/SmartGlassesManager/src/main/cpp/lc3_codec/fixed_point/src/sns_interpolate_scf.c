
#include "functions.h"


static inline void SnsscalefactorsInterpolation(int16_t *scf_int, int16_t *scf_q)
{
    int16_t  i = 0;
    int16_t  tmp = 0;
    int16_t  tmp2 = 0;

    /* Interpolation */
    scf_int[0] = scf_q[0];
    scf_int[1] = scf_q[0];
    for(i = 1; i < M; i++)
    {
        tmp = sub(scf_q[i], scf_q[i - 1]);
        tmp2 = mult_r(tmp, 8192);
        tmp = mult_r(tmp, 4096);
        scf_int[i * 4 - 2] = add(scf_q[i - 1], tmp);
        scf_int[i * 4 - 1] = add(scf_int[i * 4 - 2], tmp2);
        scf_int[i * 4]     = add(scf_int[i * 4 - 1], tmp2);
        scf_int[i * 4 + 1] = add(scf_int[i * 4], tmp2);
    }
    scf_int[62] = add(scf_int[61], tmp2);
    scf_int[63] = add(scf_int[62], tmp2);
}

static inline void processSnsInterpolateScfstage1(int16_t n_bands, int16_t* scf_tmp, int16_t* scf_int)
{
    int16_t  i = 0;
    int16_t  tmp = 0;

    /* 8 kHz mode for 2.5 ms */
    if (n_bands < 32)
    {
        memmove(scf_tmp, scf_int, 64 * sizeof(int16_t));
        tmp = 32 - n_bands;
        for(i = 0; i < tmp; i++)
            /* 8192 = 0.25 * 2^15 */
            scf_int[i] = add(mac_r(L_mult(scf_tmp[4 * i], 8192), scf_tmp[4 * i + 1], 8192),
                             mac_r(L_mult(scf_tmp[4 * i + 2], 8192), scf_tmp[4 * i + 3], 8192));

        for(i = 0; i < n_bands - tmp; i++)
            scf_int[tmp + i] = mac_r(L_mult(scf_tmp[4 * tmp + 2 * i], 16384), scf_tmp[4 * tmp + 2 * i + 1], 16384);
    }
    else
        /* For 5ms */
        if (n_bands < 64)
        {
            tmp = 64 - n_bands;
            for(i = 0; i < tmp; i++)
                scf_int[i] = mac_r(L_mult(scf_int[2 * i], 16384), scf_int[2 * i + 1], 16384);
            for(; i < n_bands; i++)
                scf_int[i] = scf_int[tmp + i];
        }
}

static inline void processSnsInterpolateScfstage2(int16_t inv_scf, int16_t n_bands, int16_t *scf_int, 
	                                                                                      int16_t mdct_scf[], int16_t mdct_scf_exp[])
{
    int16_t  i = 0;
 
    /* Inversion at encoder-side*/
    if (inv_scf == 1)
    {
        for(i = 0; i < n_bands; i++)
            scf_int[i] = -scf_int[i];
    }

    /* Linear Domain */
    for(i = 0; i < n_bands; i++)
        mdct_scf[i] = InvLog2_16(scf_int[i], &mdct_scf_exp[i]);

}

void processSnsInterpolateScf(int16_t *scf_q, int16_t mdct_scf[], int16_t mdct_scf_exp[], int16_t inv_scf,
                                 int16_t n_bands, int8_t *scratchBuffer)
{
    int16_t *scf_int;
    int16_t *scf_tmp;

    scf_int = (int16_t *)scratchBuffer;              /* Size = 2 * MAX_BANDS_NUMBER = 128 bytes */
    scf_tmp = (int16_t *)(((uint8_t *)scf_int) + 2 * MAX_BANDS_NUMBER); /* 2 * MAX_BANDS_NUMBER = 128 bytes */

    SnsscalefactorsInterpolation(scf_int, scf_q);

    processSnsInterpolateScfstage1(n_bands, scf_tmp, scf_int);

    processSnsInterpolateScfstage2(inv_scf, n_bands, scf_int, mdct_scf, mdct_scf_exp);

}

