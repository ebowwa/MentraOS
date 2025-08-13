
#include "functions.h"


void process_cutoff_bandwidth(int32_t d_fx[], int16_t len, int16_t bw_bin)
{
    int32_t i = 0;
    if (len > bw_bin){
        /* roll off */
        for (i = -1; i < 3; i++) {
            d_fx[bw_bin + i] = L_shr(d_fx[bw_bin + i], add(i, 2));
        }

        for (i = bw_bin + 3; i < len; i++) {
            d_fx[i] = 0; 
        } 
    }
}

