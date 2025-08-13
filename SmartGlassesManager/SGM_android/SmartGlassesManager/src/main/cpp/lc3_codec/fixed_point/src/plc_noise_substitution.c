
#include "defines.h"
#include "functions.h"


#ifndef NONBE_PLC4_ADAP_DAMP
void processPLCNoiseSubstitution(int32_t spec[], int16_t spec_prev[], int16_t L_spec, int16_t nbLostFramesInRow,
                                    int16_t stabFac, int16_t frame_dms, int16_t *alpha, int16_t *cum_alpha, int16_t *seed)
#else
void processPLCNoiseSubstitution(int32_t spec[], int16_t spec_prev[], int16_t L_spec)
#endif
{
#ifndef NONBE_PLC4_ADAP_DAMP
    int32_t i;
    int16_t  tmp16;
    int16_t  spec_prev16;

    switch (frame_dms)
    {
    case 25: nbLostFramesInRow = shr(add(nbLostFramesInRow, 3), 2); break;
    case 50: nbLostFramesInRow = shr(add(nbLostFramesInRow, 1), 1); break;
    }

    /* get damping factor */
#ifndef NONBE_PLC4_BURST_TUNING
    if (sub(nbLostFramesInRow, 4) < 0)
    {
        *alpha = add(26214 /*0.8 Q15*/, mult_r(6553 /*0.2 Q15*/, stabFac)); 
    }
    else if (sub(nbLostFramesInRow, 6) < 0)
    {
        *alpha = add(19660 /*0.6 Q15*/, mult_r(9830 /*0.3 Q15*/, stabFac)); 
    }
    else if (sub(nbLostFramesInRow, 8) < 0)
    {
        *alpha = add(16384 /*0.5 Q15*/, mult_r(13107 /*0.4 Q15*/, stabFac)); 
    }
    else
    {
        *alpha = add(14745 /*0.45 Q15*/, mult_r(13107 /*0.4 Q15*/, stabFac)); 
    }
#else
    *alpha = add(26214 /*0.8 Q15*/, mult_r(6553 /*0.2 Q15*/, stabFac)); 
    if (sub(nbLostFramesInRow, PLC_FADEOUT_IN_MS / 10) > 0)
    {
        *alpha = 0; 
    }
    else if (sub(nbLostFramesInRow, 2) > 0)
    {
        tmp16  = div_s(sub(PLC_FADEOUT_IN_MS / 10, nbLostFramesInRow), sub(PLC_FADEOUT_IN_MS / 10, sub(nbLostFramesInRow, 1)));
        *alpha = mult(*alpha, tmp16);
    }
#endif

    switch (frame_dms)
    {
    case 25:
        if (sub(*alpha, 32767) < 0)
        {
            tmp16  = 0;
            *alpha = Sqrt16(*alpha, &tmp16);  
            *alpha = shl(*alpha, tmp16);
        }
        if (sub(*alpha, 32767) < 0)
        {
            tmp16  = 0;
            *alpha = Sqrt16(*alpha, &tmp16);  
            *alpha = shl(*alpha, tmp16);
        }
        break;
    case 50:
        if (sub(*alpha, 32767) < 0)
        {
            tmp16  = 0;
            *alpha = Sqrt16(*alpha, &tmp16); 
            *alpha = shl(*alpha, tmp16);
        }
        break;
    }

    *cum_alpha = mult_r(*cum_alpha, *alpha); 

    tmp16 = *seed; 

    /* Add noise and damping */
    for(i = 0; i < L_spec; i++)
    {
        tmp16 = extract_l(L_mac0_1(16831, tmp16, 12821));

        spec_prev16 = mult(spec_prev[i], *cum_alpha);

        if (tmp16 < 0)
        {
            spec_prev16 = negate(spec_prev16);
        }

        spec[i] = L_deposit_h(spec_prev16);
    }

    /* High pass to prevent overflows */
    spec[0] = Mpy_32_16_asm(spec[0], 6553 /* 0.2 Q15*/); 
    spec[1] = Mpy_32_16_asm(spec[1], 16384 /* 0.5 Q15*/);

    *seed = tmp16; 
#else
    int32_t i;

    for(i = 0; i < L_spec; i++)
    {
        spec[i] = L_deposit_h(spec_prev[i]);
    }

    /* High pass to prevent overflows */
    spec[0] = Mpy_32_16_asm(spec[0], 6553 /* 0.2 Q15*/); 
    spec[1] = Mpy_32_16_asm(spec[1], 16384 /* 0.5 Q15*/); 
#endif /* NONBE_PLC4_ADAP_DAMP */

}



