
#include "functions.h"
#include "enhUL32.h"


#define SNS_MPVQ_SZ_3_0    (1549824U)

static __forceinline int16_t read_uint(uint8_t *bytes, int16_t *bp, int16_t *mask, int16_t numbits)
{
    int16_t  value, bit = 0;
    int32_t i;

    value = read_bit(bytes, bp, mask);
    for (i = 1; i < numbits; i++)
    {
        bit    = read_bit(bytes, bp, mask);
        value += (bit << i);
    }
    return value;
}

static __forceinline int16_t dec_split_st2VQ_CW(                     /* local BER flag */
                                                  const int32_t L_cwRx, /* max 25 bits */
                                                  const int32_t L_szA, const int32_t L_szB, int32_t *L_cwA, int32_t *L_cwB,
                                                  int16_t *submodeLSB)
{
    /* demultiplex:  L_cwRx =   L_cwB(21.z bits) * L_szA(3.y bits)   + L_cwA(21.x bits)); */
    int16_t  start, fin, ind;
    int32_t  L_tmp, L_max_size;
    int32_t i;

    L_max_size = (int32_t)UL_Mpy_32_32((uint32_t)L_szB, (uint32_t)L_szA); /*  may be tabled  */

    /* section B  ind larger than 13  out of the possible  14 =   0..13  */
    if (L_cwRx >= L_max_size)
    {
        *L_cwA      = 0;
        *L_cwB      = 0;
        *submodeLSB = 0;
        return (int16_t)1; /* set berFlag and exit */
    }
    /* floor(L_cwRx / L_szA) */
    /*initial binary split of cw,  select top or low half */
    start = 0;

    ASSERT_LC3((L_szB & 0x1L) == 0); /* this middle split only works if  L_szB is even  */
    if (L_sub(L_cwRx, L_shr_pos(L_max_size, 1)) >= 0)
    {
        start = L_shr_pos(L_szB, 1); /* top half start index */
    }

    /*linear loop over a low  or a  high section */
    ind = start;
    L_tmp = L_negate(L_cwRx); /* search from negative side */

    L_tmp = L_add(L_tmp, (int32_t)UL_Mpy_32_32(UL_deposit_l((uint16_t)start), (uint32_t)L_szA));
    /* start is 0 or 7 */ /*non-fractional mult is   (int32_t)start * L_szA */

    /* a short linear run  over  ceil(szB/2) =  7   values  */

    fin = add(start, shr_pos(L_szB, 1));
    for(i = start; i < fin; i++)
    {
        ind   = add(ind, 1);
        L_tmp = L_add(L_tmp, L_szA);
        if (L_tmp > 0)
        {
            ind = sub(ind, 1); /* passed criteria point, keep index    */
        }
    }

    *L_cwB = L_deposit_l(ind);
    *L_cwA = L_sub(L_cwRx, (int32_t)UL_Mpy_32_32(UL_deposit_l((uint16_t)ind),
                                                (uint32_t)L_szA)); /* non-fractional mult;   (int32_t)ind * L_szA */

    ASSERT_LC3(*L_cwA >= 0 && *L_cwA < L_szA);
    ASSERT_LC3(*L_cwB >= 0 && *L_cwB < L_szB);

    *submodeLSB = 0;
    *L_cwB      = L_sub(*L_cwB, 2);
    if (*L_cwB < 0)
    {
        *submodeLSB = 1;
    }
    *L_cwB = L_mac0_1(*L_cwB, 2, *submodeLSB); /* add back gain ind if needed */

    return 0; /* no BER */
}

static __forceinline void dec_sns_parameter(uint8_t *ptr,int16_t *bp_side, int16_t *mask_side,
                                                                           int32_t *L_scf_idx,   int16_t* BER_detect)
{
    int32_t  tmp32, tmp32lim = 0;
    int16_t  submodeMSB, submodeLSB = 0;

    /* Decode SNS VQ parameters - 1st stage (10 bits) */
    L_scf_idx[0] = read_uint(ptr, bp_side, mask_side, 5); /* stage1 LF  5  bits */
    L_scf_idx[1] = read_uint(ptr, bp_side, mask_side, 5); /* stage1 HF  5 bits  */

    /* Decode SNS VQ parameters - 2nd stage side-info (3-4 bits) */
    submodeMSB   = read_bit(ptr, bp_side, mask_side); /* submodeMSB 1 bit */
    if(submodeMSB == 0)
        L_scf_idx[3] = read_uint(ptr, bp_side, mask_side, 1); /* gains or gain MSBs  1bits  */
    else
        L_scf_idx[3] = read_uint(ptr, bp_side, mask_side, 2); /* gains or gain MSBs  2 bits  */

    L_scf_idx[4] = read_bit(ptr, bp_side, mask_side);                         /*  shape LS 1 bit */

    /* Decode SNS VQ parameters - 2nd stage data (24-25 bits) */
    if (submodeMSB == 0)
    { /* shape_j = 0, or 1  */
        /* regular mode A,B indexes integer multiplexed, total 24.x bits  MPVQ codeword section A and  codeword for
         * section B */
        /* regular mode  mode shape  index   total  24.9999 bits    MPVQ codeword  */
        tmp32 = read_uint(ptr, bp_side, mask_side, 13);
        tmp32 |= L_shl_pos(read_uint(ptr, bp_side, mask_side, 12), 13); /*for ber state   */
        *BER_detect = dec_split_st2VQ_CW(       /* local BER flag */
                                  tmp32, /* L_cwRx  max 25 bits */
                                  sns_MPVQ_Sz[0][0], 14, /* 12+2 = 14 */                                 
                                  (&L_scf_idx[5]),                                                    /* shape A */
                                  (&L_scf_idx[6]), /* shape B or  gain LSB */
                                  &submodeLSB      /* total submode update below  */
            );
        if (submodeLSB != 0)
        { /* add gainLSB bit */
            L_scf_idx[3] = L_shl_pos(L_scf_idx[3], 1) + L_scf_idx[6];
            L_scf_idx[6] = -2L;
        }
    }
    else
    { /* shape_j = 2 or 3  */
        //ASSERT_LC3(submodeMSB == 1);
        /* outlier mode shape  index   total  23.8536 +  19.5637 (19.5637 < (log2(2.^24 -2.^23.8537))    bits    MPVQ
         * codeword  */
        tmp32 = read_uint(ptr, bp_side, mask_side, 12);
        tmp32 |= L_shl_pos(read_uint(ptr, bp_side, mask_side, 12), 12);
        L_scf_idx[5] = tmp32; /*shape outl_near or outl_far */
        submodeLSB = 0;
        *BER_detect = 0;
        tmp32lim = sns_MPVQ_Sz[2][0] + SNS_MPVQ_SZ_3_0;
        if (tmp32 >= tmp32lim)
        {
            *BER_detect = 1;
        }
        else
        {
            tmp32 = (tmp32 -sns_MPVQ_Sz[2][0]); /*  a potential high index is computed */
            if (tmp32 >= 0)
            {
                submodeLSB = 1;
                ASSERT_LC3(tmp32 >= 0 && tmp32 < (int32_t)(2 * sns_MPVQ_Sz[3][0]));
                L_scf_idx[3] = L_add(L_shl_pos(L_scf_idx[3], 1), L_and(tmp32, 0x1)); /* add LSB_gain bit to gain MSBs */
                L_scf_idx[5] = L_shr_pos(tmp32, 1); /* MPVQ index with offset and gainLSB removed */
                L_scf_idx[6] = -2L;
            }
            else
            {
                L_scf_idx[6] = -1L;
            }
        }
    }
    L_scf_idx[2] = (submodeMSB << 1) + submodeLSB; /* decoder internal signal shape_j = submode 0..3 to VQ */

}

void DecoderSideInformation(uint8_t *bytes, int16_t *bp_side, int16_t *mask_side, int16_t nbbits,
                              int16_t L_spec, int16_t fs_idx, int16_t BW_cutoff_bits, int16_t *num_tns_filters,
                              int16_t *lsbMode, int16_t *lastnz, int16_t *BEC_detect, int16_t *tns_order, int16_t *fac_ns_idx,
                              int16_t *gg_idx, int16_t *BW_cutoff_idx, int16_t *ltpf_idx, int32_t *L_scf_idx,
                              int16_t frame_dms)
{
    int16_t  nbits_lastnz;
    int16_t  BER_detect, tmp_lastnz;
    int32_t i;
    uint8_t *ptr;

    ptr = bytes;
    *bp_side   = (nbbits - 1) >> 3;    
    *mask_side = 1 << (8 - (nbbits - ((*bp_side) << 3)));

    /* Bandwidth */
    if (BW_cutoff_bits > 0)
    {
        *BW_cutoff_idx = read_uint(ptr, bp_side, mask_side, BW_cutoff_bits);
        if (fs_idx < (*BW_cutoff_idx))
        {
            *BW_cutoff_idx = fs_idx;
            *BEC_detect = 1;
            return;
        }
    }
    else
        *BW_cutoff_idx = 0;

    /* Last non-zero tuple */
    /* nbits_lastnz =  ceil(log2(L_spec/2)) */
    nbits_lastnz = 14 - (norm_s(-L_spec));    
    tmp_lastnz = read_uint(ptr, bp_side, mask_side, nbits_lastnz);
    *lastnz = (tmp_lastnz + 1) << 1;
    if ((*lastnz) > L_spec)
    {
        *BEC_detect = 1;
        return;
    }

    /* LSB Mode bit */
    *lsbMode = read_bit(ptr, bp_side, mask_side);

    /* Global Gain */
    *gg_idx = read_uint(ptr, bp_side, mask_side, 8);

    /* Number of TNS filters */
    if (((*BW_cutoff_idx) >= 3) && (frame_dms >= 50))
        *num_tns_filters = 2;
    else
        *num_tns_filters = 1;

    /* Decode TNS on/off flag */
    for(i = 0; i < *num_tns_filters; i++)
        tns_order[i] = read_bit(ptr, bp_side, mask_side);

    /* Pitch present flag */
    ltpf_idx[0] = read_bit(ptr, bp_side, mask_side);

    dec_sns_parameter(ptr, bp_side, mask_side, L_scf_idx, &BER_detect);

    if (BER_detect > 0)
    {
        *BEC_detect = 1;
        return;
    }

    /* LTPF data */
    if (ltpf_idx[0] != 0)
    {
        ltpf_idx[1] = read_uint(ptr, bp_side, mask_side, 1);
        ltpf_idx[2] = read_uint(ptr, bp_side, mask_side, 9);
    }
    else
    {
        ltpf_idx[1] = 0;
        ltpf_idx[2] = 0;
    }

    /* Decode noise level */
    *fac_ns_idx = read_uint(ptr, bp_side, mask_side, 3);

}

#ifdef ENABLE_PADDING
int32_t paddingDecoder(uint8_t *bytes, int16_t nbbits, int16_t L_spec, int16_t BW_cutoff_bits, int16_t ep_enabled,
                   int16_t *total_padding, int16_t *np_zero)
{
    int16_t lastnz_threshold;
    int16_t padding_len_bits, padding_len;

    int16_t bp_side;
    int16_t nbbytes = nbbits >> 3;
    int16_t  mask_side;
    uint8_t *ptr = bytes;
    int16_t lastnz;
    int16_t nbits = 14 - (norm_s(-L_spec));
    *np_zero     = 0;

    *total_padding = 0;
    ptr = bytes;
    bp_side   = (nbbits - 1) >> 3;        
    mask_side = 1 << (8 - (nbbits - ((bp_side) << 3)));

    if (bp_side < 19 || bp_side >= LC3_MAX_BYTES)
        return 1;

    if (BW_cutoff_bits > 0)
        read_uint(ptr, &bp_side, &mask_side, BW_cutoff_bits);

    lastnz = read_uint(ptr, &bp_side, &mask_side, nbits);

    lastnz_threshold = (1 << nbits) - 2;
    while(lastnz == lastnz_threshold)
    {
        padding_len_bits = sub(sub(12, nbits), BW_cutoff_bits);
        /*Read padding length*/
        padding_len = read_uint(ptr, &bp_side, &mask_side, padding_len_bits);
        /* Read 4 reserved bits */
        read_uint(ptr, &bp_side, &mask_side, 4);

        if (ep_enabled == 0)
        {
            /* Discard padding length bytes */
            bp_side        = sub(bp_side, padding_len);
            *total_padding = add(add(*total_padding, padding_len), 2);
        }
        else
        {
            *total_padding = add(*total_padding, 2);
            *np_zero       = add(*np_zero, padding_len);
        }
        
        /* test if we have less than 20 bytes left; if so frame is broken */
        if (sub(sub(nbbytes,add(*total_padding,*np_zero)),20) < 0)
            return 1;

        /* Read bandwidth bits */
        if (BW_cutoff_bits > 0)
            read_uint(ptr, &bp_side, &mask_side, BW_cutoff_bits);

        lastnz = read_uint(ptr, &bp_side, &mask_side, nbits);
    }

    if (ep_enabled != 0)
        *total_padding = add(*total_padding, *np_zero);
    return 0;
}
#endif

