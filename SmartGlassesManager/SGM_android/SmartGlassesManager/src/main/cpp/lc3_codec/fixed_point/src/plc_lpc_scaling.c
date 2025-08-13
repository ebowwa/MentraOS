
#include "defines.h"
#include "functions.h"


void processPLCLpcScaling(int32_t tdc_A_32[], int16_t tdc_A_16[], int16_t m)
{
    int32_t i;
    int16_t  s;

    s = getScaleFactor32(tdc_A_32, m);
    for(i = 0; i < m; i++)
        tdc_A_16[i] = round_fx_sat(L_shl_sat(tdc_A_32[i], s)); 
}


