
#include "functions.h"


void processLevinson(int32_t *lpc, int32_t *ac, int16_t N, int16_t *rc, int32_t *pred_err, int8_t *scratchBuffer)
{
    int32_t *lpc_tmp;
    int32_t  rc32, err, sum;
    int16_t  shift, s, inv;
    int32_t n, m;

    lpc_tmp = (int32_t *)scratchBuffer; /* Size = 4 * (M_LTPF + 1) = 100 bytes */
    /* Init Prediction Error */
    err   = ac[0]; 
    shift = 0;     
    /* LPC Coefficient 0 */
    lpc[0] = 0x8000000; 
    /* Reflection Coefficient 0 */
    if (ac[0] != 0)
    {
        inv  = div_s(16383, extract_h(ac[0]));
        rc32 = L_shl_pos(Mpy_32_32(L_abs(ac[1]), Mpy_32_16(L_sub(MAX_32, Mpy_32_16(ac[0], inv)), inv)), 2);
    }
    else
        rc32 = 0; 

    if (ac[1] > 0)
        rc32 = -rc32;

    if (rc != NULL)
        rc[0] = round_fx(rc32); 

    /* LPC Coefficient 1 */
    lpc[1] = L_shr_pos(rc32, 4);
    for(n = 2; n <= N; n++)
    {
        /* Update Prediction Error */
        err   = Mpy_32_32(err, L_sub(MAX_32, Mpy_32_32(rc32, rc32)));
        s     = norm_l(err);
        err   = L_shl_pos(err, s);
        shift = shift + s;

        /* Reflection Coefficient n-1 */
        sum = Mpy_32_32(ac[1], lpc[n - 1]);
        for(m = 2; m < n; m++)
            sum = L_add(sum, Mpy_32_32(ac[m], lpc[n - m]));

        sum = L_add(L_shl_pos(sum, 4), ac[n]);
        if (err != 0)
        {
            inv  = div_s(16383, extract_h(err));
            rc32 = L_shl_pos(Mpy_32_32(L_abs(sum), Mpy_32_16(L_sub(MAX_32, Mpy_32_16(err, inv)), inv)), 2);
        }
        else
            rc32 = 0;

        if (sum > 0)
            rc32 = L_negate(rc32);

        rc32 = L_shl(rc32, shift);
        if (rc != NULL)
            rc[n - 1] = round_fx(rc32); 

/* Recompute LPC Coefficients up to n-1 */
        for(m = 1; m < n; m++)
            lpc_tmp[m] = L_add(lpc[m], Mpy_32_32(rc32, lpc[n - m])); 

        memmove(&lpc[1], &lpc_tmp[1], (n - 1) * sizeof(int32_t));
        /* LPC Coefficient n */
        lpc[n] = L_shr_pos(rc32, 4); 
    }

    /* Final Prediction Error */
    if (pred_err != NULL)
    {
        err = Mpy_32_32(err, L_sub(MAX_32, Mpy_32_32(rc32, rc32)));
        *pred_err = L_shr(err, shift);
    }
}


void lpc2rc(int32_t *lpc, int16_t *rc, int16_t N)
{
    int32_t  lpc_tmp[MAXLAG + 1];
    int32_t  rc32, tmp0, tmp1;
    int16_t  inv;
    int32_t n, m;

    for(n = N; n >= 2; n--)
    {
        rc32      = L_shl_pos(lpc[n], 4);
        rc[n - 1] = round_fx(rc32); 
        tmp0 = L_sub(MAX_32, L_abs(Mpy_32_32(rc32, rc32)));
        for(m = 1; m < n; m++)
        {
            tmp1       = L_sub(lpc[m], Mpy_32_32(lpc[n - m], rc32));
            inv        = div_s(16383, extract_h(tmp0));
            lpc_tmp[m] = L_shl_pos(Mpy_32_32(tmp1, Mpy_32_16(L_sub(MAX_32, Mpy_32_16(tmp0, inv)), inv)), 2); 
        }
        memmove(&lpc[1], &lpc_tmp[1], (n - 1) * sizeof(int32_t));
    }
    rc[0] = round_fx(L_shl_pos(lpc[1], 4)); 
}

