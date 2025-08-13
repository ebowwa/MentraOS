
#include "functions.h"


int16_t pvq_dec_deidx(                          /* out BER detected 1 , ok==0 */
                        int16_t *      y,          /* o:   decoded vector (non-scaled int32_t)  */
                        const int16_t  k_val,      /* i:   number of allocated pulses       */
                        const int16_t  dim,        /* i:   Length of vector                 */
                        const int16_t  LS_ind,     /* i; lS index              1 bit        */
                        const uint32_t UL_MPVQ_ind /* i; MPVQ  index                        */
)
{
    int16_t      BER_flag;
    uint32_t     h_mem[1 + KMAX_FX + 1];
    PvqEntry_fx entry;

    BER_flag = 0;

    /* get_size will likely be called before this function,     as the range decoder needs the size to fetch the index
     */
    entry = get_size_mpvq_calc_offset(dim, k_val, h_mem); /* TBD should be made into tables for N=16,10,6  */

    entry.lead_sign_ind = LS_ind;
    entry.index         = L_deposit_l(0); /* only  in case dim == 1 */
    if (sub(dim, 1) != 0)
    {
        entry.index = UL_MPVQ_ind;

        /* safety check in case of bit errors */
        if (L_sub(entry.index, entry.size) >= 0)
        {
            BER_flag    = 1;
            entry.index = 0; /* return something deterministic/valid, and LOW complex  */
        }
    }
    mpvq_deindex(&entry, h_mem, y); /* actual deindexing  */

    return BER_flag;
}


void pvq_dec_scale_vec(const int16_t *inQ14, int16_t adjGainQ13, int16_t *outQ14)
{
    int32_t i;

    for(i = 0; i < M; i++)
    {
        outQ14[i] = add(outQ14[i], mult_r(adjGainQ13, inQ14[i]));
    }
}


void pvq_dec_en1_normQ14(/*  Have to be used EXACTLY the same way in both  both encoder and decoder */
                            int16_t *      xq, /* o:   en1 normalized decoded vector (Q14)   */
                            const int16_t *y,  /* i:   decoded vector (non-scaled int32_t)  */
                            const int16_t  k_val_max,
                            /* i:   max possible K   in Q0 kO or kA   */ /* OPT:  not BE , use dynamic max  pulse
                                                                            amplitude */
                            const int16_t dim                             /* i:   Length of vector                 */
)
{
    int32_t i;
    int32_t  L_tmp;
    int16_t  shift_num, shift_tot;
    int16_t  isqrtQ16_local, tmp, exp, exp_shift;
    int32_t  L_yy;

/* energy normalization starts here */
    L_yy = L_mult0(y[0], y[0]);
    for(i = 1; i < dim; i++)
    {
        L_yy = L_mac0_1(L_yy, y[i], y[i]); /* stay in Q0 */ /* OPT: reuse some energies from PVQ linear search */
    }
    /* 16 bit */
    if (L_sub(L_yy, SQRT_EN_MAX_FX) < 0)
    {
        ASSERT_LC3(L_yy > 4);                               /* Q16 isqrt table lookup not valid below  5  */
        isqrtQ16_local = isqrt_Q16tab[L_yy]; /* 1 cycle */
    }
    else
    {
        /* about 8-9 cycles */
        exp            = 15; /* set ISqrt16() exp_in to get delta exp out near 0  when Lyy is in Q0  */
        tmp            = ISqrt16(extract_l(L_yy),
                      &exp); /* exp  out is now a delta shift with a later tmp Q15 multiplication in mind  */
        exp_shift      = add(exp, 16 - 15);   /*  up to Q16 */
        isqrtQ16_local = shl(tmp, exp_shift); /* new mantissa in a fixed  Q16  */
    }

    shift_num = norm_s(k_val_max);      /* simply account for the preknown fixed max possible pulseamp in y */
    shift_tot = sub(14 - 1, shift_num); /* upshift  to get  to Q14 */
    for(i = 0; i < dim; i++) /*  upshifted y[i]  used    */
    {
        L_tmp = L_mult(isqrtQ16_local, shl_pos(y[i], shift_num)); /* Q(16+0+shift_num +1    =   shift_num+1  */
        xq[i] = round_fx(L_shl(L_tmp, shift_tot));    /* Q14 ,      */
    }

}

