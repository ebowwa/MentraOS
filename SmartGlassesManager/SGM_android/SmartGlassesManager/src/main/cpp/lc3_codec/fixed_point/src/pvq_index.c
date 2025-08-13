
#include "functions.h"
#include "enhUL32.h"


#define SIGNBIT_FX 0x80000000u
#define SIGNBIT_SHRT_FX 0x8000

static void initOffsets_fx(int16_t dim_in, uint32_t *h_mem,
                           int16_t k_val_in) /* may be removed with tables for N=16,10,6  */
{
    uint32_t k_val_prev, k_val_curr;
    uint32_t k_val, UL_k_val_in;

    h_mem[0] = UL_deposit_l(0);
    h_mem[1] = UL_deposit_l(1);

    UL_k_val_in = UL_deposit_l(k_val_in);
    if (sub(dim_in, 2) == 0)
    {
        for(k_val = 2; k_val <= UL_k_val_in; k_val++)
        {
            h_mem[k_val] = UL_subNsD((k_val << 1), 1U);

        }
        h_mem[k_val] = UL_k_val_in; 
    }
    else
    {
        k_val_prev = UL_deposit_l(1U);
        for(k_val_curr = 2; k_val_curr <= UL_k_val_in; k_val_curr++)
        {
            h_mem[k_val_curr] = UL_addNsD(1U, UL_Mpy_32_32(k_val_curr, (k_val_prev << 1)));
            k_val_prev        = UL_addNsD(k_val_curr, 0U);
        }
        h_mem[k_val_curr] = UL_Mpy_32_32(k_val_curr, k_val_prev); 
    }

}

static void a_fwd_fx(uint32_t *a_in,   /* i/o: offsets   */
                     int16_t   n_items /* i  :  items, k's  */
)
{
    uint32_t  a_1, a_in0;
    int32_t  i;
    uint32_t *a_in_prev_ptr;

    a_in0 = UL_deposit_l(1);

    a_in_prev_ptr = &(a_in[-1]);
    for(i = 1; i <= n_items; i++)
    {
        a_1              = UL_addNsD(a_in0, UL_addNsD(a_in_prev_ptr[i], a_in[i]));
        a_in_prev_ptr[i] = a_in0; 
        a_in0            = UL_addNsD(a_1, 0U);
    }
    a_in_prev_ptr[i] = a_in0; 
}

static void a_bwd_fx(uint32_t *a_in,   /* i/o: offsets   */
                     int16_t   n_items /* i:  n_items  */
)
{
    uint32_t  a_1, a_in0;
    int32_t  i;
    uint32_t *a_in_prev_ptr;

    a_in0         = UL_deposit_l(0);
    a_in_prev_ptr = &(a_in[-1]);

    for(i = 1; i <= n_items; i++)
    {
        a_1              = UL_subNsD(UL_subNsD(a_in[i], a_in0), a_in_prev_ptr[i]);
        a_in_prev_ptr[i] = a_in0;
        a_in0            = UL_addNsD(a_1, 0U);
    }
    a_in_prev_ptr[i] = a_in0;

}

static void a_u_fwd_fx(uint32_t *a_u_in, int16_t k_val_in, int16_t mem_size_m1)
{
    uint32_t u_kp1_prev, u_kp1;
    uint32_t u_k_prev;


    u_kp1_prev = a_u_in[mem_size_m1]; 
    u_k_prev   = UL_lshr(a_u_in[k_val_in], 1);

    a_fwd_fx(&a_u_in[1], k_val_in);

    u_kp1               = UL_lshr(a_u_in[k_val_in], 1);
    a_u_in[mem_size_m1] = UL_addNsD(1U, UL_addNsD(u_kp1_prev, UL_addNsD(u_k_prev, u_kp1)));

}

static int16_t get_lead_sign_fx(uint32_t *ind)
{
    int16_t leading_sign;

    leading_sign = 1; 
    if (UL_and(*ind, 1) != 0)
    {
        leading_sign = -1; 
    }
    (*ind) = UL_lshr(*ind, 1);
    return leading_sign;
}

/*-------------------------------------------------------------------*
 * mind2vec_one_fx()
 *-------------------------------------------------------------------*/
static void mind2vec_one_fx(int16_t  k_val_in,                           /* i:  nb unit pulses    , [ 0...K_MAX ]   */
                            int16_t  leading_sign,                       /* i: leading sign  -1, 0, 1*/
                            uint32_t ind, /* i:  index                */ /* parameter could  be omitted */
                            int16_t *vec_out                             /* o:  pulse train          */
)
{
    *vec_out = (int16_t)ind; /* dummy assignment to handle the common ind parameter warning  */

    if (leading_sign < 0)
    {
        k_val_in = negate(k_val_in);
    }
    *vec_out = k_val_in;
}

static int16_t setval_update_sign_fx(int16_t k_delta, int16_t k_max_local, int16_t *leading_sign, uint32_t *ind_in,
                                    int16_t *vec_out)
{
    if (k_delta != 0)
    {
        mind2vec_one_fx(k_delta, *leading_sign, *ind_in, vec_out);
        *leading_sign = get_lead_sign_fx(ind_in);
        k_max_local   = sub(k_max_local, k_delta);
    }
    return k_max_local;
}

/*-------------------------------------------------------------------*
 * mind2vec_fx()
 *-------------------------------------------------------------------*/
static void mind2vec_fx(int16_t   dim_in,       /* i:  dimension        */
                        int16_t   k_max_local,  /* i:  nb unit pulses   */
                        int16_t   leading_sign, /* i: leading sign  */
                        uint32_t  ind,          /* i:  index            */
                        int16_t * vec_out,      /* o:  pulse train      */
                        uint32_t *h_in          /* i:  offset vector   A=1+2U  */
)
{
    int32_t pos;
    int16_t  k_acc, k_delta;
    uint32_t UL_tmp_offset, UL_diff;
    uint16_t sgn;

    k_acc = k_max_local;
    for(pos = 0; pos < dim_in; pos++)
    {

        if (ind != 0)
        {

            k_acc = k_max_local;

            UL_tmp_offset = UL_addNsD(h_in[k_acc], 0U);

            UL_diff = UL_subNs(ind, UL_tmp_offset, &sgn);

            while(sgn)
            {
                UL_diff = UL_subNs(ind, h_in[--k_acc], &sgn);
            }

            ind = UL_addNsD(UL_diff, 0U);

            k_delta = sub(k_max_local, k_acc);
        }
        else
        {
            mind2vec_one_fx(k_max_local, leading_sign, ind, &vec_out[pos]);
            break;
        }

        k_max_local = setval_update_sign_fx(k_delta, k_max_local, &leading_sign, &ind, &vec_out[pos]);

        a_bwd_fx(h_in, add(k_max_local, 1));
    }
}

PvqEntry_fx get_size_mpvq_calc_offset(                   /* o : size, dim, k_val        */
                                         int16_t   dim_in,   /* i : dimension                */
                                         int16_t   k_val_in, /* i : nb unit pulses           */
                                         uint32_t *h_mem     /* o : offsets                  */
)
{
    int32_t     i;
    PvqEntry_fx entry;
    int16_t      kp1;

    entry.dim   = dim_in;
    entry.k_val = k_val_in;

    entry.index         = L_deposit_l(0);
    entry.lead_sign_ind = 0;

    ASSERT_LC3(dim_in <= M);
    ASSERT_LC3(tabledKMAX[dim_in] != 0);

    /* tabled values for worst case K */ /* made into table lookup for N=16, 10, 6  */
    kp1 = add(k_val_in, 1);
    for(i = 0; i <= kp1; i++) /* A+U copying */
    {
        h_mem[i] =
            UL_addNsD(MPVQ_offs_ptr[dim_in][i], 0U); /* a vector  copying is needed as MPVQ recursion is in place */
    }
    /* special handling of last  U offset   in k+1 column  */
    if (sub(k_val_in, tabledKMAX[dim_in]) != 0)
    {
        h_mem[kp1] = UL_lshr(h_mem[kp1], 1); /* (A+1)/2 , convert from  A(K+1) to  U(K+1)  domain */
    }
    entry.size =
        UL_addNsD(1U, UL_addNsD(h_mem[kp1], UL_lshr(h_mem[k_val_in], 1))); /* MPVQ size calc. 1 + H(K+1) + (A(K)>>1) */


    return entry;
}

/*-------------------------------------------------------------------*
 * mpvq_deindex()
 *-------------------------------------------------------------------*/
void mpvq_deindex(                           /* o :  void                        */
                     const PvqEntry_fx *entry,  /* i :  sign_ind, index, dim, k_val */
                     uint32_t *          h_mem,  /* i :  A/U offsets                 */
                     int16_t *           vec_out /* o :  pulse train                 */
)
{
    int16_t leading_sign;
    //TRACE("mpvq_deindex");

    memset(vec_out, 0, (entry->dim) * sizeof(int16_t));

    leading_sign = 1;
    if (entry->lead_sign_ind != 0)
    {
        leading_sign = -1;
    }

    if (entry->k_val != 0)
    {
        mind2vec_fx(entry->dim, entry->k_val, leading_sign, entry->index, vec_out, h_mem);
    }
    
}

/*-------------------------------------------------------------------*
 * vec2mind_two_fx()
 *-------------------------------------------------------------------*/
static void vec2mind_two_fx(const int16_t *vec_in,        /* i : PVQ  pulse train        */
                            int16_t *      k_val_out_ptr, /* o : number of unit pulses    */
                            uint32_t *     next_sign_ind, /* i/o: next sign ind           */
                            uint32_t *     ind            /* o: MPVQ index                */
)
{
    uint32_t lead_sign_ind_add;
    int16_t  abs0, abs1, abs01, sptr;

    abs0           = abs_s(vec_in[0]);
    abs1           = abs_s(vec_in[1]);
    abs01          = add(abs0, abs1);
    *k_val_out_ptr = abs01; 
    *ind           = UL_deposit_l(0);

    *next_sign_ind = UL_deposit_h(SIGNBIT_SHRT_FX);

    if (abs01 != 0)
    {
        sptr           = 0; 
        *next_sign_ind = UL_deposit_l(sptr);

        
        if (abs0 != 0 && abs1 != 0)
        {
            lead_sign_ind_add = UL_deposit_l(1);
            if (vec_in[1] < 0)
            {
                lead_sign_ind_add = UL_deposit_l(2);
            }
            *ind = UL_addNsD(UL_deposit_l((uint16_t)(sub(abs1, 1) << 1)), lead_sign_ind_add);            
        }
        else
        {
            if (abs0 == 0)
            {
                *ind = UL_deposit_l((uint16_t)sub((abs1 << 1), 1));            
                sptr = 1; 
            }
        }

        if (vec_in[sptr] < 0)
        {
            *next_sign_ind = UL_deposit_l(1);
        }
    }

}

static void enc_push_sign(int16_t val, uint32_t *next_sign_ind, uint32_t *index)
{
    
    if ((UL_and(*next_sign_ind, SIGNBIT_FX) == 0) && (val != 0))
    {
        *index = UL_addNsD(((*index) << 1), *next_sign_ind);        
    }
    if (val < 0)
    {
        *next_sign_ind = UL_deposit_l(1);
    }
    if (val > 0)
    {
        *next_sign_ind = UL_deposit_l(0);
    }
}

static void vec2mind_fx(int16_t        dim_in,        /* i :  dim                       */
                        int16_t        k_val_in,      /* i :  number of unit pulses     */
                        const int16_t *vec_in,        /* i :  PVQ pulse train           */
                        uint32_t *     next_sign_ind, /* o :  pushed leading sign       */
                        uint32_t *     index,         /* o :  MPVQ index                */
                        uint32_t *     N_MPVQ_ptr,    /* o :  size(N_MPVQ(dim,K_val_in))*/
                        uint32_t *     h_mem)              /* o :  offsets                   */
{
    int32_t pos;
    int16_t  mem_size_m1, k_val_acc, tmp_val;
    uint32_t tmp_h;

    mem_size_m1    = add(k_val_in, 1);
    *next_sign_ind = UL_deposit_h(SIGNBIT_SHRT_FX);

    pos = sub(dim_in, 2);
    vec2mind_two_fx(&vec_in[pos], &k_val_acc, next_sign_ind, index);
    initOffsets_fx(3, h_mem, k_val_in);

    tmp_h = h_mem[k_val_acc]; 
    for(pos--; pos >= 0; pos--)
    {
        tmp_val = vec_in[pos]; 
        enc_push_sign(tmp_val, next_sign_ind, index);

        *index = UL_addNsD(*index, tmp_h);

        k_val_acc = add(k_val_acc, abs_s(tmp_val));

        if (pos != 0)
        {
            a_u_fwd_fx(h_mem, k_val_in, mem_size_m1);
        }
        tmp_h = UL_addNsD(h_mem[k_val_acc], 0U);
    }
    *N_MPVQ_ptr = UL_addNsD(1U, UL_addNsD(UL_lshr(tmp_h, 1), h_mem[mem_size_m1])); 

}

PvqEntry_fx mpvq_index(                          /* o : leading_sign_index, index, size, k_val        */
                          const int16_t *vec_in,     /* i : signed pulse train        */
                          int16_t        dim_in,     /* i : dimension                 */
                          int16_t        k_val_local /* i : nb unit pulses            */
)
{
    PvqEntry_fx result;
    uint32_t     h_mem[1 + KMAX_FX + 1];
    uint32_t     lead_sign_ind;

    //TRACE("mpvq_index");

    ASSERT_LC3(k_val_local <= KMAX_FX);

    result.k_val = k_val_local; 
    result.dim   = dim_in;      

    vec2mind_fx(dim_in, k_val_local, vec_in, &lead_sign_ind, &result.index, &result.size, h_mem);

    result.lead_sign_ind = u_extract_l(lead_sign_ind);    

    return result;
}

