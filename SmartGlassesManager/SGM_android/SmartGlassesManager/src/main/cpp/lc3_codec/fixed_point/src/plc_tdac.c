
#include "defines.h"
#include "functions.h"


/*
 * processTdac
 *
 * Parameters:
 *   ola_mem       o: pointer of output signal                  Q0
 *   ola_mem_exp   o: exponent of output signal                 Q0
 *   synth         i: pointer of input signal                   Q0
 *   synth_exp     i: exponent of input signal                  Q0
 *   win           i: pointer of analysis and synthesis window  Q0
 *   la_zeroes     i: number of zeroes                          Q0
 *   frame_len     i: frame length                              Q0
 *
 * Function:
 *
 *
 * Returns:
 *    void
 */
void processTdac(int16_t *ola_mem, int16_t *ola_mem_exp, const int16_t *synth_inp, const int16_t synth_exp_inp,
                    const int16_t *win, const int16_t la_zeroes, const int16_t frame_len, int8_t *scratchBuffer)
{
    int32_t       i;
    int16_t        s;
    int16_t        L;
    int16_t        N;
    int16_t        NZ;
    int16_t        LD2;
    int32_t        sz;
    int16_t        INV_NORM;
    int16_t        INV_NORM_E;
    int16_t        smax;
    int16_t *      synth;
    int16_t        synth_len;
    int16_t        synth_exp;
    const int16_t *win1;
    const int16_t *win2;
    const int16_t *win3;
    const int16_t *win4;
    const int16_t *synth1;
    const int16_t *synth2;
    int16_t *      ola_mem1;
    int16_t *      ola_mem2;

    synth = (int16_t *)scratchBuffer; /* Size = 2 * MAX_LEN */

    ASSERT_LC3(la_zeroes <= frame_len / 2);

    L   = frame_len; 
    LD2 = shr_pos(L, 1);
    NZ  = LD2 - la_zeroes;

    /* inverse normalization of sqrt(2/N) inside window */
    INV_NORM   = negate(shl_pos(frame_len, 6));
    INV_NORM_E = 2; 
    if (norm_s(INV_NORM) > 0)
    {
        INV_NORM   = shl_pos(INV_NORM, 1);
        INV_NORM_E = 1; 
    }
    if (frame_len <= 120)
        INV_NORM_E = INV_NORM_E + 2;
    if (frame_len <= 20)
        INV_NORM_E = INV_NORM_E + 2;

    /* Scale input */
    synth_len = shl_pos(L, 1) - la_zeroes;
    s         = getScaleFactor16(synth_inp, synth_len);

    for(i = 0; i < synth_len; i++)
    {
        synth[i] = shl(synth_inp[i], s); 
    }
    synth_exp = synth_exp_inp - s;

    /* calculate x_ov[L+la_zeroes] ... x_ov[2*L-1] */

    win1 = &win[L + LD2 - 1];
    win2 = &win[L + LD2];

    win3 = &win[LD2 - 1];
    win4 = &win[LD2];

    synth1 = &synth[L + LD2 - 1 - la_zeroes];
    synth2 = &synth[L + LD2 - la_zeroes];

    ola_mem1 = &ola_mem[LD2 - la_zeroes];
    ola_mem2 = &ola_mem[LD2 - la_zeroes - 1];

    smax = 15; 

    for(i = 0; i < NZ; i++)
    {
        /* analysis windowing + 2N -> N */
        sz = L_mac_sat(L_mult(*synth1, *win1), *synth2, *win2);

        /* N -> 2N + synthesis windowing */
        *ola_mem1 = round_fx(Mpy_32_16_asm(sz, *win3)); 
        *ola_mem2 = round_fx(Mpy_32_16_asm(sz, *win4)); 

        /* determine headroom */
        s = norm_s(*ola_mem1);
        if (*ola_mem1 != 0)
            smax = min(smax, s);
        s = norm_s(*ola_mem2);
        if (*ola_mem2 != 0)
            smax = min(smax, s);

        /* pointer update */
        win1--;
        win2++;
        win3--;
        win4++;
        synth1--;
        synth2++;
        ola_mem1++;
        ola_mem2--;
    }

    N = LD2; 

    for(; i < N; i++)
    {
        /* analysis windowing + 2N -> N */
        sz = L_mult(*synth1, *win1);
        /* N -> 2N + synthesis windowing */
        *ola_mem1 = round_fx(Mpy_32_16(sz, *win3)); 
        /* determin headroom */
        s = norm_s(*ola_mem1);
        if (*ola_mem1 != 0)
            smax = min(smax, s);

        /* pointer update */
        win1--;
        win2++;
        win3--;
        synth1--;
        synth2++;
        ola_mem1++;
    }

    smax = min(smax, 15);
    N = N + NZ;
    for(i = 0; i < N; i++)
        ola_mem[i] = round_fx(L_mult(shl(ola_mem[i], smax), INV_NORM)); 

    *ola_mem_exp = (synth_exp + INV_NORM_E) - smax; 
}


