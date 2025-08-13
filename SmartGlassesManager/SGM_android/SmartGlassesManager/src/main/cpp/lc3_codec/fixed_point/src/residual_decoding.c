
#include "functions.h"


void processResidualDecoding(int32_t x[], int16_t x_e, int16_t L_spec, int16_t resBits[], int16_t nResBits)
{
    int32_t k = 0;
    int32_t  fac_m, fac_p = 0;
    int16_t  s, n = 0;

    s     = x_e - 1;
    fac_m = L_shr(0xC000000, s);
    fac_p = L_shr(0x14000000, s);

    while((k < L_spec) && (n  < nResBits))
    {
        if(x[k] != 0)
        {
            if(resBits[n++] == 0)
            {
                 if(x[k] > 0)
                     x[k] -= fac_m;
                 else
                     x[k] -= fac_p;
            }
            else
            {
                 if(x[k] > 0)
                     x[k] += fac_p;
                 else
                     x[k] += fac_m;
            }
        }
        k++;
    }
}


