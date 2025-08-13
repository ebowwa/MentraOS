
#include "functions.h"


void dct_IV(int32_t *pDat,       /* i/o: pointer to data buffer */
            int16_t *pDat_e,     /* i/o: pointer to data exponent */
            int16_t  L,          /* i  : length of block */
            int32_t *workBuffer) /* : size of L */
{
    int16_t sin_step;
    int16_t idx;
    int16_t M_var;
    int32_t *pDat_0;
    int32_t *pDat_1;
    int32_t accu1 = 0;
    int32_t accu2 = 0;
    int32_t accu3 = 0;
    int32_t accu4 = 0;
    int32_t i;
    const PWord16 *twiddle;
    const PWord16 *sin_twiddle;

    M_var = L >> 1;
    LC3_getTables(&twiddle, &sin_twiddle, &sin_step, L);

    pDat_0 = &pDat[0];
    pDat_1 = &pDat[L - 2];

    for(i = 0; i < (M_var - 1); i += 2, pDat_0+=2,pDat_1-=2)
    {
        accu1 = pDat_1[1];
        accu2 = pDat_0[0];
        accu3 = pDat_0[1]; 
        accu4 = pDat_1[0];

        cplxMpy32_32_16_2(&accu1, &accu2,accu1, accu2, twiddle[i].v.re, twiddle[i].v.im);
        cplxMpy32_32_16_2(&accu3, &accu4, accu4, accu3, twiddle[i + 1].v.re, twiddle[i + 1].v.im);

        pDat_0[0] = accu2;
        pDat_0[1] = accu1;
        pDat_1[0] = accu4;
        pDat_1[1] = -accu3;
    }

    LC3_cfft(&pDat[0], &pDat[1], M_var, 2, pDat_e, workBuffer);

    pDat_0 = &pDat[0];
    pDat_1 = &pDat[L - 2];

   /* Sin and Cos values are 0.0f and 1.0f */
    accu1 = pDat_1[0];
    accu2 = pDat_1[1];

    pDat_1[1] = -(pDat_0[1]>>1);
    pDat_0[0] = (pDat_0[0]>>1);

    /* 28 cycles for ARM926 */
    for (idx = sin_step,i=1; i<((M_var+1)>>1); i++, idx+=sin_step)
    {
        cplxMpy32_32_16_2(&accu3, &accu4, accu1, accu2, sin_twiddle[idx].v.re, sin_twiddle[idx].v.im);
	  
        pDat_0[1] =  accu3;
        pDat_1[0] =  accu4;
        pDat_0+=2;
        pDat_1-=2;

        cplxMpy32_32_16_2(&accu3, &accu4, pDat_0[1], pDat_0[0], sin_twiddle[idx].v.re, sin_twiddle[idx].v.im);

        if(i != (((M_var+1)>>1) -1))
        {
            accu1 = pDat_1[0];
            accu2 = pDat_1[1];
            pDat_1[1] = -accu3;
            pDat_0[0] =  accu4;
        }
    }

/* Last Sin and Cos value pair are the same */
    accu1  = (Mpy_32_16_asm(pDat_1[0], TWIDDLE)) >> 1;
    accu2  = (Mpy_32_16_asm(pDat_1[1], TWIDDLE))>> 1;

    pDat_1[1] = -accu3;
    pDat_0[0] =  accu4;

    pDat_1[0] = accu1 + accu2;
    pDat_0[1] = accu1 - accu2;

    /* Add twiddeling scale. */
    *pDat_e = (*pDat_e) + 2;
}

