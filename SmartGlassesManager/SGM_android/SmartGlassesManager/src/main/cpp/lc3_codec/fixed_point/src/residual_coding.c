
#include "functions.h"


void processResidualCoding(int16_t x_e, int32_t x[], int16_t xq[], int16_t gain, int16_t gain_e, int16_t L_spec,
                              int16_t targetBits, int16_t nBits, int8_t *resBits, int16_t *numResBits)
{

    int32_t i;
    int16_t  s, n, m;
    int32_t  L_tmp;

    n = 0; 
    m = add(sub(targetBits, nBits), 4);
    s = sub(add(15, gain_e), x_e);
    for(i = 0; i < L_spec; i++)
    {
        if (xq[i] != 0)
        {
            L_tmp = L_sub(x[i], L_shl(L_mult(xq[i], gain), s));
            if (L_tmp < 0)
            {
                resBits[n] = 0; 
            }
            if (L_tmp >= 0)
            {
                resBits[n] = 1; 
            }
            n = add(n, 1);
            if (sub(n, m) == 0)
            {
                break;
            }
        }
    }
    *numResBits = n; 
}

