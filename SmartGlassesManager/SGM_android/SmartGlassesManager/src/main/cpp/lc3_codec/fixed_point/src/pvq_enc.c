
#include "functions.h"


static void pvq_pyr_project(const int16_t  dim_proj,                  /* end vector dimension+1       */
                            const int16_t *xabs,                      /* absolute vector values */
                            int32_t        L_xsum,                    /* absolute vector sum over dim  */
                            int16_t        num,                       /* target number of pulses */
                            int16_t *      y,                         /* projected output vector    */
                            int16_t *pulse_tot_ptr, int32_t *L_xy_ptr, /* accumulated correlation  Q(in+0+1) = Qin+1 */
                            int32_t *L_yy_ptr                         /* accumulated energy  Q0  */
)
{
    int32_t i;
    int32_t  L_tmp, L_num;
    int16_t  den, shift_num, shift_den, shift_delta, proj_fac;

    *pulse_tot_ptr = 0; 
    *L_xy_ptr      = L_deposit_l(0);
    *L_yy_ptr      = L_deposit_l(0);

    shift_den = norm_l(L_xsum);                          /* x_sum input  Qin                         */
    den       = extract_h(L_shl_pos(L_xsum, shift_den)); /* now in Qin+shift_den                     */

    L_num     = L_deposit_l(num);
    shift_num = sub(norm_l(L_num), 1);
    L_num     = L_shl_pos(L_num, shift_num); /* now in Q0 +shift_num -1                  */
    proj_fac  = div_l(L_num, den); /* L_num always has to be less than den<<16 , norm_l-1  makes that happen  */

    shift_delta = sub(shift_num, shift_den);
    for(i = 0; i < dim_proj; i++)
    {
        L_tmp = L_mult(proj_fac, xabs[i]);                       /* Q  shift_delta + PVQ_SEARCH_QIN */
        y[i]  = extract_h(L_shr(L_tmp, shift_delta));  /*  to  Q0 with floor , and potential  sturation */
        ;

        *pulse_tot_ptr = add(*pulse_tot_ptr, y[i]);       /* Q0                                         */
        *L_yy_ptr      = L_mac0_1(*L_yy_ptr, y[i], y[i]);   /* Energy,   Q0 */
        *L_xy_ptr      = L_mac(*L_xy_ptr, xabs[i], y[i]); /* Corr, Q0*Q12  +1 --> Q13                   */
    }

}


static __forceinline int16_t one_pulse_search(const int16_t  dim_start, /* start vector dimension       */
                                             const int16_t  dim_end,   /* end vector dimension+1       */
                                             const int16_t *x_abs,     /* absolute vector values */
                                             int16_t *      y,         /* output vector    */
                                             int16_t *      pulse_tot_ptr,
                                             int32_t *      L_xy_ptr, /* accumulated correlation  Q(12+0+1) = Q13 */
                                             int32_t *      L_yy_ptr, /* accumulated energy  Q0 */
                                             int16_t        max_xabs)        /* current max amplitude for target  */
{
    int32_t i;
    int16_t  corr_tmp, corr_sq_tmp, en_max_den, cmax_num, en_tmp;
    int32_t  L_tmp_en_lc, L_tmp_corr;
    int16_t  corr_up_shift, imax;

    /* maximize correlation precision, prior to every unit pulse addition in the vector */
    corr_up_shift = norm_l(L_mac(*L_xy_ptr, 1, max_xabs)); /* pre analyze worst case L_xy update in the dim  loop  */
    imax          = -1; /* not needed for search, only added to avoid compiler warning   */
    {
        en_max_den = 0;             
        cmax_num   = -1;  /* req. to force a 1st update for  n==dim_start   */

        for(i = dim_start; i < dim_end; i++)
        {
            L_tmp_corr = L_shl_pos(L_mac(*L_xy_ptr, 1, x_abs[i]), corr_up_shift); /*  actual in-loop target value */

            corr_tmp = round_fx_sat(L_tmp_corr);

            corr_sq_tmp = mult(corr_tmp, corr_tmp); /* CorrSq_tmp for a 16bit low complexity cross multiplication */

            L_tmp_en_lc = L_mac(*L_yy_ptr, 1, y[i]); /*Q0 x^2+ 2x ,  "+1" added once before loop , result ,  energy may
                                                        span up to ~14+1(Q1)+1(sign)=16 bits */
            /* extract_l without shift can always be used for this section as energy is guaranteed to stay in the lower
             * word*/

            en_tmp = extract_l(L_tmp_en_lc); /* L_shl + round_fx could also be used also but then adds an uphift cost */

            /* 16/32 bit comparison    WC (4 +1+1 + (1+1+1) = 9 */
            if (L_msu(L_mult(corr_sq_tmp, en_max_den), cmax_num, en_tmp) > 0) /* use L_mult and then a L_msu */
            {
                cmax_num   = corr_sq_tmp; 
                en_max_den = en_tmp;      
                imax       = i;           
            }
        } /* dim  */
    }


    /*  finally add found unit pulse contribution to past L_xy, Lyy,  for next pulse loop    */
    *L_xy_ptr = L_mac(*L_xy_ptr, x_abs[imax], 1); /*      Qin+1 */
    *L_yy_ptr = L_mac(*L_yy_ptr, 1, y[imax]);

    y[imax]          = add(y[imax], 1);  /* Q0 added pulse              */
    (*pulse_tot_ptr) = add((*pulse_tot_ptr), 1);   /* increment total pulse sum   */
    return imax;
}


void pvq_enc_search(
    const int16_t *x,           /* i:   target vector to quantize       Qin     */
    int16_t *      y_far,       /* o:   outl_far o, raw pulses  (non-scaled short) Q0  , length dim     */
    int16_t *      y,           /* o:   outl_near o, raw pulses  (non-scaled short) Q0  , length dim     */
    int16_t *      yA,          /* o:   A section  raw pulses  (non-scaled short) Q0 , length dimA   */
    int16_t *      yB,          /* o:   B section  raw pulses  (non-scaled short) Q0   , length dim-dimA  */
    int32_t *      L_corr,      /* o:   4 un-normalized correlation sums for outl_far, outl_near, A, AB  */
    int32_t *      L_search_en, /* o:   4  energy sums for outl_far, outl_near,  A, AB  */
    int16_t *      pulses_fin,  /* i:   number of allocated pulses  to outl_far, outl_near ,  A, AB  sections   */
    int16_t *      pulses_proj, /* i:   number of projection pulses  for outl_far, outl_near,  A, AB    */

    const int16_t dim, /* i:   Length of outlier  vector */
    const int16_t dimA /* i:   Length of vector A section */
)
{
    int32_t       i;
    int16_t        pulse_tot_far, pulse_tot, pulse_totA, pulse_totB;
    int16_t        xabs[PVQ_MAX_VEC_SIZE];
    int16_t        max_xabs, max_xabsA, max_xabsB;
    int32_t        L_xsum, L_xsumA;
    int32_t        L_yy, L_xy;
    int16_t        imax;
    int32_t       k;
    int16_t        dim_m1;
    int16_t        dimB;
    const int16_t *xBptr;
    int16_t        pulses_far, pulses, pulsesA, pulsesB;

    //TRACE("pvq_enc_search");

    pulses_far = pulses_fin[0]; 
    pulses     = pulses_fin[1]; 
    pulsesA    = pulses_fin[2]; 
    pulsesB    = pulses_fin[3]; 

    for(i = 0; i < N_SCF_SHAPES_ST2; i++)
    {
        L_corr[i]      = L_deposit_l(0);
        L_search_en[i] = L_deposit_l(0);
    }

    dimB = sub(dim, dimA);

    L_xsum = L_deposit_h(0);

    max_xabs  = -1; 
    max_xabsA = -1; 
    max_xabsB = -1; 
    for(i = 0; i < dimA; i++)
    {
        xabs[i]   = abs_s(x[i]);      /* Qx */
        max_xabsA = max(max_xabsA, xabs[i]);  /* for efficient  search correlation scaling */
        L_xsum    = L_mac0_1(L_xsum, 1, xabs[i]); /* stay in Qx */
    }

    memset(y_far, 0, dim * sizeof(int16_t));
    memset(y, 0, dimA * sizeof(int16_t));
    memset(yA, 0, dimA * sizeof(int16_t));

    L_xsumA = L_add(L_xsum, 0); /* save for section A projection */

    for(i = dimA; i < dim; i++)
    {
        xabs[i]   = abs_s(x[i]);      /* Qx */
        max_xabsB = max(max_xabsB, xabs[i]);  /* for efficient  search correlation scaling */
        L_xsum    = L_mac0_1(L_xsum, 1, xabs[i]); /* stay in Qx */
    }

    memset(&y[dimA], 0, (dim - dimA) * sizeof(int16_t));

    memset(yB, 0, dimB * sizeof(int16_t));

    max_xabs = max(max_xabsA, max_xabsB); /* global max abs value */

    
    if (L_xsum == 0)
    { /* no shape in any  section, projection in outl_far, outl_near, A, AB  not possible, any search meaningless  */

        dim_m1        = sub(dim, 1);
        y_far[0]      = shr_pos(pulses_far, 1);                        
        y_far[dim_m1] = add(y_far[dim_m1], sub(pulses_far, y_far[0])); 

        dim_m1    = sub(dim, 1);
        y[0]      = shr_pos(pulses, 1);                
        y[dim_m1] = add(y[dim_m1], sub(pulses, y[0])); 

        dim_m1     = sub(dimA, 1);
        yA[0]      = shr_pos(pulsesA, 1);                  
        yA[dim_m1] = add(yA[dim_m1], sub(pulsesA, yA[0])); 

        dim_m1     = sub(dimB, 1);
        yB[0]      = shr_pos(pulsesB, 1);                  
        yB[dim_m1] = add(yB[dim_m1], sub(pulsesB, yB[0])); 
    }
    else
    {
        ASSERT_LC3(pulses_proj[0] > 0);
        ASSERT_LC3(L_xsum > 0);

        pvq_pyr_project(dim, xabs, L_xsum, pulses_proj[0], y_far, &pulse_tot_far, &L_xy,
                        &L_yy); /* outlier  submode projection  */

        ASSERT_LC3(pulses_far <= 127);
        for(k = pulse_tot_far; k < pulses_far; k++)
        {
            L_yy = L_add(L_yy, 1); /* pre add 1 in  Q0 in    L_yyQ0 = (x^2 + 2*x + 1)    */
            imax = one_pulse_search(0, dim, xabs, y_far, &pulse_tot_far, &L_xy, &L_yy, max_xabs);
        }
        ASSERT_LC3(pulse_tot_far == pulses_far);
        /* outlier far submode result vector in   y_far[0...15]  */
        L_corr[0] = L_shr_pos(L_xy, 1); /* to Qin*Q0 */

        memmove(y, y_far, dim * sizeof(int16_t)); /*y_far->y  */

        pulse_tot = pulse_tot_far; 

        ASSERT_LC3(pulses <= 127);
        for(k = pulse_tot; k < pulses; k++)
        {
            L_yy = L_add(L_yy, 1); /* pre add 1 in  Q0 in    L_yyQ0 = (x^2 + 2*x + 1)    */
            imax = one_pulse_search(0, dim, xabs, y, &pulse_tot, &L_xy, &L_yy, max_xabs);
        }

        /* outlier near submode result vector in   y[0...15]  */
        L_corr[1] = L_shr_pos(L_xy, 1); /* to Qin*Q0 */

        ASSERT_LC3(pulse_tot == pulses);

        if (L_xsumA == 0)
        {
            /* no shape in A section, projection in A not possible,  search meaningless  */
            dim_m1     = sub(dimA, 1);
            yA[0]      = shr_pos(pulsesA, 1);                  
            yA[dim_m1] = add(yA[dim_m1], sub(pulsesA, yA[0])); 
        }
        else
        {
            if (pulses_proj[2] != 0) /* fixed setup  if bitrate is fixed */
            {
                ASSERT_LC3(pulses_proj[2] > 0);
                ASSERT_LC3(L_xsumA > 0);
                pvq_pyr_project(dimA, xabs, L_xsumA, pulses_proj[2], yA, &pulse_totA, &L_xy,
                                &L_yy); /* section A  , in submode 1 projection  */
            }
            else
            {
                /*  default, otherwise recalculate A   from outlier result  (to remove any section B pulses influence)
                 */
                pulse_totA = 0; 
                L_xy       = L_deposit_l(0);
                L_yy       = L_deposit_l(0);

                memmove(yA, y, dimA * sizeof(int16_t));
                for(i = 0; i < dimA; i++)
                {
                    pulse_totA = add(pulse_totA, yA[i]);      /* Q0                                         */
                    L_xy       = L_mac(L_xy, xabs[i], yA[i]); /* Corr, Q0*Q12  +1 --> Q13                   */
                    L_yy       = L_mac(L_yy, yA[i], yA[i]);   /* Energy, Q(0+0)+1)= Q1 */
                }
                L_yy = L_shr_pos(L_yy, 1); /* En to Q0  */
            }

            /* search remaining pulses in regular section A  */
            for(k = pulse_totA; k < pulsesA; k++)
            {
                L_yy = L_add(L_yy, 1); /* 1 added in Q0 */
                imax = one_pulse_search(0, dimA, xabs, yA, &pulse_totA, &L_xy, &L_yy, max_xabsA);
            }
            ASSERT_LC3(pulse_totA == pulsesA);
        } /* L_xsumA!=0 */

        /* reg Set A result vector now in  yA[0...9]  */
        L_corr[2] = L_shr_pos(L_xy, 1); /* to Qin*Q0 */

        /* search remaining pulses in regular section B,  even if energy in B is zero  */
        ASSERT_LC3(pulses_proj[3] == 0);
        pulse_totB = 0; 

        if (sub(pulsesB, 1) == 0)
        { /* LC search,  sufficient to find a single max,  as pulses can not be stacked, when nb-pulses==1  */
            imax = 0;  /* safety */
            for(i = dimA; i < dim; i++)
            {
                if (xabs[i] == max_xabsB)
                {
                    imax = sub(i, dimA);
                }
            }
            pulse_totB = 1;                                     
            yB[imax]   = 1;                           /* reg set B result vector in  yB[0...5]  */
            L_xy       = L_mac(L_xy, xabs[add(imax, dimA)], 1); /* calc total corr for A+B sections */
            L_yy       = L_add(L_yy, 1);
        }
        else
        { /* more than one target pulse in section B */
            /* keep A pulses influence,  search  section B pulses influence */
            for(k = pulse_totB; k < pulsesB; k++)
            {
                L_yy = L_add(L_yy, 1); /* 1 added in Q0*/
                imax = one_pulse_search(dimA, dim, xabs, &(yB[-dimA]), &pulse_totB, &L_xy, &L_yy, max_xabsB);
            }
        }

        L_corr[3] = L_shr_pos(L_xy, 1);  /* to Qin*Q0 ,  corr of combined A and B */

        ASSERT_LC3(pulse_totB == pulsesB);
        /* reg set B result vector now in  yB[0...5]  */
    } /* L_xsum != 0 */

/* apply sign of (x) to  first orthant result */
    for(i = 0; i < dim; i++)
    {
        if (x[i] < 0)
        {
            y_far[i] = negate(y_far[i]); /* apply sign for outlier far */
        }
    }

    for(i = 0; i < dim; i++)
    {
        if (x[i] < 0)
        {
            y[i] = negate(y[i]); /* apply sign for outliers near */
        }
    }

    xBptr = &(x[dimA]);  /* ptr init to B target section */
    for(i = 0; i < dimA; i++)
    {
        if (x[i] < 0)
        {
            yA[i] = negate(yA[i]); /* apply sign  in N_SETA */
        }
    }

    for(i = 0; i < (dimB); i++)
    {
        if (xBptr[i] < 0)
        {
            yB[i] = negate(yB[i]); /* apply sign  in N_SETB */
        }
    }

    
}

