
#include "functions.h"


void processMdctShaping(int32_t x[], int16_t scf[], int16_t scf_exp[], const int16_t bands_offset[], int16_t fdns_npts)
{
    int32_t i, j;

    j = 0;
    for(i = 0; i < fdns_npts; i++)
    {
        for(; j < bands_offset[i + 1]; j++)
            x[j] = L_shl(Mpy_32_16(x[j], scf[i]), scf_exp[i]);
    }
}

void processScfScaling(int16_t scf_exp[], int16_t fdns_npts, int16_t *x_e)
{
    int32_t i;
    int16_t  scf_exp_max;

    scf_exp_max = scf_exp[0];

    for(i = 1; i < fdns_npts; i++)
        scf_exp_max = max(scf_exp_max, scf_exp[i]);

    for(i = 0; i < fdns_npts; i++)
        scf_exp[i] = scf_exp[i] -scf_exp_max;

    *x_e = (*x_e) + scf_exp_max;
}

