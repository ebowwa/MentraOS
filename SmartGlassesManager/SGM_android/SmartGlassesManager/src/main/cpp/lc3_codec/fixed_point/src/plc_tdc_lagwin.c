
#include "defines.h"
#include "functions.h"


void processLagwin(int32_t r[], const int32_t w[], int16_t m)
{
    /* Start Processing */
    int32_t i;

    for(i = 0; i < m; i++)
        r[i + 1] = Mpy_32_32(r[i + 1], w[i]); 
}


