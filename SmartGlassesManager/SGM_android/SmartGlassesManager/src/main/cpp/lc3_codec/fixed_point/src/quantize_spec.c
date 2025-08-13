
#include "functions.h"


void processQuantizeSpec(int32_t x[], int16_t x_e, int16_t gain, int16_t gain_e, int16_t xq[], int16_t nt, int16_t target,
                            int16_t totalBits, int16_t *nBits, int16_t *nBits2, int16_t fs_idx, int16_t *lastnzout,
                            int16_t *codingdata, int16_t *lsbMode, int16_t mode)
{

    int16_t  a1, b1, a1_i, b1_i;
    int16_t  t, lev1;
    int16_t  lastnz, lastnz2;
    int16_t  rateFlag;
    int32_t  nbits32, nbits232, target32;
    int16_t  nt_half;
    int16_t  c, ab_max, msb, a1_msb, b1_msb, levmax;
    int16_t  s;
    int16_t  totBits, nbits_lsb;
    int32_t k, lev;
    int16_t  tmp16;
    int32_t  offs32;
    int32_t i;

    /* Quantization */
    gain = Inv16(gain, &gain_e);
    s    = sub(add(x_e, gain_e), 15);

    for(i = 0; i < nt; i++)
    {
        offs32 = Mpy_32_16_asm(L_abs(x[i]), gain); /* multiply */
        offs32 = L_shl(offs32, s);             /* convert to 15Q16 */
        tmp16  = mac_r(offs32, -4096, 1);      /* add offset and truncate */
        if (x[i] < 0)
            tmp16 = negate(tmp16); /* restore sign */

        xq[i] = tmp16; 
    }

    /* Rate flag */
    rateFlag = 0; 
    if (sub(totalBits, add(160, i_mult(fs_idx, 160))) > 0)
    {
        rateFlag = 2 << NBITS_CONTEXT; 
    }

    /* Init */
    nt_half   = shr_pos(nt, 1);
    c         = 0; 
    t         = 0; 
    a1_i      = 0; 
    b1_i      = 1; 
    target32  = L_shl_pos(L_deposit_l(target), SYM_BITS_Q);
    nbits32   = L_negate(target32);
    nbits232  = 0; 
    nbits_lsb = 0; 
    if (mode == 0 && sub(totalBits, add(480, i_mult(fs_idx, 160))) >= 0)
    {
        mode = 1; 
    }

    /* Find last non-zero tuple */
    lastnz = find_last_nz_pair(xq, nt);
    if (mode >= 0)
    {
        lastnz2 = 2;
    }
    else
    {
        lastnz2 = lastnz;
    }

    if (mode < 0)
    {
        /* Main Loop through the 2-tuples */
        for(k = 0; k < lastnz; k += 2)
        {

            /* Get context */
            t = add(c, rateFlag);
            if (sub(k, nt_half) > 0)
            {
                t = add(t, 1 << NBITS_CONTEXT);
            }
            codingdata[0] = t; 

            /* Init current 2-tuple encoding */
            a1     = abs_s(xq[a1_i]);
            b1     = abs_s(xq[b1_i]);
            ab_max = max(a1, b1);

            if (ab_max == 0)
            {
                codingdata[1] = -1; 
                codingdata[2] = 0;  
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t]][0]);
                c             = add(shl_pos(s_and(c, 0xf), 4), 1);
            }
            else if (sub(ab_max, A_THRES) < 0)
            {
                codingdata[1] = 0; 
                msb           = add(a1, shl_pos(b1, A_THRES_SHIFT));
                codingdata[2] = msb; 
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t]][msb]);
                if (a1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (b1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                c = add(shl_pos(s_and(c, 0xf), 4), add(add(a1, b1), 1));
            }
            else if (sub(ab_max, 2 * A_THRES) < 0)
            {
                codingdata[1] = 1; 
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t]][VAL_ESC]);
                nbits32       = L_add(nbits32, 2 << SYM_BITS_Q);
                a1_msb        = shr_pos_pos(a1, 1);
                b1_msb        = shr_pos_pos(b1, 1);
                msb           = add(a1_msb, shl_pos(b1_msb, A_THRES_SHIFT));
                codingdata[2] = msb; 
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t + Tab_esc_nb[1]]][msb]);
                if (a1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (b1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                c = add(shl_pos(s_and(c, 0xf), 4), add(shl_pos(add(a1_msb, b1_msb), 1), 1));
            }
            else
            {
                levmax        = sub(13, norm_s(ab_max));
                codingdata[1] = levmax; 
                for(lev = 0; lev < levmax; lev++)
                {
                    lev1    = min(lev, 3);
                    nbits32 = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t + Tab_esc_nb[lev1]]][VAL_ESC]);
                }
                nbits32       = L_add(nbits32, L_shl_pos(L_deposit_l(levmax), SYM_BITS_Q + 1));
                a1_msb        = shr(a1, levmax);
                b1_msb        = shr(b1, levmax);
                msb           = add(a1_msb, shl_pos(b1_msb, A_THRES_SHIFT));
                codingdata[2] = msb; 
                lev1          = min(levmax, 3);
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t + Tab_esc_nb[lev1]]][msb]);
                if (a1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (b1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                c = add(shl_pos(s_and(c, 0xf), 4), add(12, min(levmax, 3)));
            }

            a1_i += 2;
            b1_i += 2;
            codingdata += 3;

        } /* end of the 2-tuples loop */
    }
    else if (mode == 0)
    {
        /* Main Loop through the 2-tuples */
        for(k = 0; k < lastnz; k += 2)
        {

            /* Get context */
            t = add(c, rateFlag);
            if (sub(k, nt_half) > 0)
            {
                t = add(t, 1 << NBITS_CONTEXT);
            }
            codingdata[0] = t; 

            /* Init current 2-tuple encoding */
            a1     = abs_s(xq[a1_i]);
            b1     = abs_s(xq[b1_i]);
            ab_max = max(a1, b1);

            if (ab_max == 0)
            {
                codingdata[1] = -1; 
                codingdata[2] = 0;  
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t]][0]);
                c             = add(shl_pos(s_and(c, 0xf), 4), 1);
            }
            else if (sub(ab_max, A_THRES) < 0)
            {
                codingdata[1] = 0; 
                msb           = add(a1, shl_pos(b1, A_THRES_SHIFT));
                codingdata[2] = msb; 
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t]][msb]);
                if (a1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (b1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (nbits32 <= 0)
                {
                    lastnz2 = add(k, 2);
                }
                if (nbits32 <= 0)
                {
                    nbits232 = nbits32; 
                }
                c = add(shl_pos(s_and(c, 0xf), 4), add(add(a1, b1), 1));
            }
            else if (sub(ab_max, 2 * A_THRES) < 0)
            {
                codingdata[1] = 1; 
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t]][VAL_ESC]);
                nbits32       = L_add(nbits32, 2 << SYM_BITS_Q);
                a1_msb        = shr_pos_pos(a1, 1);
                b1_msb        = shr_pos_pos(b1, 1);
                msb           = add(a1_msb, shl_pos(b1_msb, A_THRES_SHIFT));
                codingdata[2] = msb; 
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t + Tab_esc_nb[1]]][msb]);
                if (a1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (b1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (nbits32 <= 0)
                {
                    lastnz2 = add(k, 2);
                }
                if (nbits32 <= 0)
                {
                    nbits232 = nbits32; 
                }
                c = add(shl_pos(s_and(c, 0xf), 4), add(shl_pos(add(a1_msb, b1_msb), 1), 1));
            }
            else
            {
                levmax        = sub(13, norm_s(ab_max));
                codingdata[1] = levmax; 
                for(lev = 0; lev < levmax; lev++)
                {
                    lev1    = min(lev, 3);
                    nbits32 = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t + Tab_esc_nb[lev1]]][VAL_ESC]);
                }
                nbits32       = L_add(nbits32, L_shl_pos(L_deposit_l(levmax), SYM_BITS_Q + 1));
                a1_msb        = shr(a1, levmax);
                b1_msb        = shr(b1, levmax);
                msb           = add(a1_msb, shl_pos(b1_msb, A_THRES_SHIFT));
                codingdata[2] = msb; 
                lev1          = min(levmax, 3);
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t + Tab_esc_nb[lev1]]][msb]);
                if (a1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (b1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (nbits32 <= 0)
                {
                    lastnz2 = add(k, 2);
                }
                if (nbits32 <= 0)
                {
                    nbits232 = nbits32; 
                }
                c = add(shl_pos(s_and(c, 0xf), 4), add(12, min(levmax, 3)));
            }

            a1_i += 2;
            b1_i += 2;
            codingdata += 3;

        } /* end of the 2-tuples loop */
    }
    else
    {
        /* Main Loop through the 2-tuples */
        for(k = 0; k < lastnz; k += 2)
        {

            /* Get context */
            t = add(c, rateFlag);
            if (sub(k, nt_half) > 0)
            {
                t = add(t, 1 << NBITS_CONTEXT);
            }
            codingdata[0] = t; 

            /* Init current 2-tuple encoding */
            a1     = abs_s(xq[a1_i]);
            b1     = abs_s(xq[b1_i]);
            ab_max = max(a1, b1);

            if (ab_max == 0)
            {
                codingdata[1] = -1; 
                codingdata[2] = 0;  
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t]][0]);
                c             = add(shl_pos(s_and(c, 0xf), 4), 1);
            }
            else if (sub(ab_max, A_THRES) < 0)
            {
                codingdata[1] = 0; 
                msb           = add(a1, shl_pos(b1, A_THRES_SHIFT));
                codingdata[2] = msb; 
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t]][msb]);
                if (a1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (b1 != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (nbits32 <= 0)
                {
                    lastnz2 = add(k, 2);
                }
                if (nbits32 <= 0)
                {
                    nbits232 = nbits32; 
                }
                c = add(shl_pos(s_and(c, 0xf), 4), add(add(a1, b1), 1));
            }
            else if (sub(ab_max, 2 * A_THRES) < 0)
            {
                codingdata[1] = 1; 
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t]][VAL_ESC]);
                a1_msb        = shr_pos_pos(a1, 1);
                b1_msb        = shr_pos_pos(b1, 1);
                msb           = add(a1_msb, shl_pos(b1_msb, A_THRES_SHIFT));
                codingdata[2] = msb; 
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t + Tab_esc_nb[1]]][msb]);
                if (a1_msb != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (b1_msb != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                nbits_lsb = add(nbits_lsb, 2);
                if (sub(a1, 1) == 0)
                {
                    nbits_lsb = add(nbits_lsb, 1);
                }
                if (sub(b1, 1) == 0)
                {
                    nbits_lsb = add(nbits_lsb, 1);
                }
                if (nbits32 <= 0)
                {
                    lastnz2 = add(k, 2);
                }
                if (nbits32 <= 0)
                {
                    nbits232 = nbits32; 
                }
                c = add(shl_pos(s_and(c, 0xf), 4), add(shl_pos(add(a1_msb, b1_msb), 1), 1));
            }
            else
            {
                levmax        = sub(13, norm_s(ab_max));
                codingdata[1] = levmax; 
                for(lev = 0; lev < levmax; lev++)
                {
                    lev1    = min(lev, 3);
                    nbits32 = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t + Tab_esc_nb[lev1]]][VAL_ESC]);
                }
                nbits32       = L_add(nbits32, L_shl_pos(L_deposit_l(sub(levmax, 1)), SYM_BITS_Q + 1));
                a1_msb        = shr(a1, levmax);
                b1_msb        = shr(b1, levmax);
                msb           = add(a1_msb, shl_pos(b1_msb, A_THRES_SHIFT));
                codingdata[2] = msb; 
                lev1          = min(levmax, 3);
                nbits32       = L_add(nbits32, ari_spec_bits[ari_spec_lookup[t + Tab_esc_nb[lev1]]][msb]);
                a1_msb        = shr_pos(a1, 1);
                b1_msb        = shr_pos(b1, 1);
                if (a1_msb != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                if (b1_msb != 0)
                {
                    nbits32 = L_add(nbits32, 1 << SYM_BITS_Q);
                }
                nbits_lsb = add(nbits_lsb, 2);
                if (sub(a1, 1) == 0)
                {
                    nbits_lsb = add(nbits_lsb, 1);
                }
                if (sub(b1, 1) == 0)
                {
                    nbits_lsb = add(nbits_lsb, 1);
                }
                if (nbits32 <= 0)
                {
                    lastnz2 = add(k, 2);
                }
                if (nbits32 <= 0)
                {
                    nbits232 = nbits32; 
                }
                c = add(shl_pos(s_and(c, 0xf), 4), add(12, min(levmax, 3)));
            }

            a1_i += 2;
            b1_i += 2;
            codingdata += 3;

        } /* end of the 2-tuples loop */
    }

    /* Number of consumed bits */
    nbits32 = L_add(nbits32, target32);
    totBits = add(extract_l(L_shr_pos_pos(L_sub(nbits32, 1), SYM_BITS_Q)), 1);
    if (mode > 0)
    {
        totBits = add(totBits, nbits_lsb);
    }
    if (nBits != NULL)
    {
        *nBits = totBits;
    }
    if (mode >= 0)
    {
        nbits232 = L_add(nbits232, target32);
        *nBits2  = add(extract_l(L_shr_pos_pos(L_sub(nbits232, 1), SYM_BITS_Q)), 1);
    }
    else
    {
        *nBits2 = *nBits; 
    }
    if (mode > 0)
    {
        *nBits2 = add(*nBits2, nbits_lsb);
    }
    *lastnzout = lastnz2;

    /* Truncation of high frequency coefficients */
    if (lastnz > lastnz2)
    {
        memset(&xq[lastnz2], 0, (lastnz - lastnz2) * sizeof(*xq));
    }

    /* Truncation of LSBs */
    
    if (mode > 0 && sub(totBits, target) > 0)
    {
        *lsbMode = 1; 
    }
    else
    {
        *lsbMode = 0; 
    }

}

