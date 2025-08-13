
#include "functions.h"
#include "enhUL32.h"


static int32_t ac_enc_mux_st2VQ_cws(                    /*  o:  max 25 bits total codeword */
                                   const int32_t L_szA, /*  i:  max 22 bits */
                                   const int32_t L_szB, /*  i:  max 4 bits  */
                                   const int32_t L_cwA, const int32_t L_cwB);

void processEncoderEntropy(uint8_t *bytes, int16_t *bp_side, int16_t *mask_side, int16_t nbbits, int16_t targetBytes,
                           int16_t L_spec, int16_t BW_cutoff_bits, int16_t tns_numfilters,
                           int16_t lsbMode, int16_t lastnz, int16_t *tns_order, int16_t fac_ns_idx, int16_t gg_idx,
                           int16_t BW_cutoff_idx, int16_t *ltpf_idx, int32_t *L_scf_idx, int16_t bfi_ext, int16_t fs_idx)
{
    int16_t  tmp;
    int32_t  L_tmp;
    int16_t  submode_LSB, submode_MSB, gain_MSBs;
    int32_t  L_gain_LSB;
    int32_t n;
    uint8_t *ptr;

    int16_t  lastnzTrigger[5] = {63, 127, 127, 255, 255};

    /* Init */
    *bp_side   = shr_pos(sub(nbbits, 1), 3);
    *mask_side = shl(1, sub(8, sub(nbbits, shl_pos(*bp_side, 3))));
    ptr        = bytes;

    memset(bytes, 0, targetBytes * sizeof(*bytes));

    /* Cutoff-detection */
    if (BW_cutoff_bits > 0)
    {
        write_indice_backward(ptr, bp_side, mask_side, BW_cutoff_idx, BW_cutoff_bits);
    }

    /* Encode last non-zero tuple */
    tmp = sub(14, norm_s(negate(L_spec)));

    if (sub(bfi_ext, 1) == 0)
    {
        write_indice_backward(ptr, bp_side, mask_side, lastnzTrigger[fs_idx], tmp);
    }
    else
    {
        write_indice_backward(ptr, bp_side, mask_side, sub(shr_pos(lastnz, 1), 1), tmp);
    }

    /* Mode bit */
    write_bit_backward(ptr, bp_side, mask_side, lsbMode);

    /* Encode global-gain */
    write_indice_backward(ptr, bp_side, mask_side, gg_idx, 8);

    /* TNS on/off flag */
    for(n = 0; n < tns_numfilters; n++)
    {
        write_bit_backward(ptr, bp_side, mask_side, min(tns_order[n], 1));
    }

    /* LTPF on/off*/
    write_indice_backward(ptr, bp_side, mask_side, ltpf_idx[0], 1);

    /* Encode SCF VQ parameters - 1st stage (10 bits) */
    write_indice_backward(ptr, bp_side, mask_side, extract_l(L_scf_idx[0]), 5); /* stage1 LF   5 bits */
    write_indice_backward(ptr, bp_side, mask_side, extract_l(L_scf_idx[1]), 5); /* stage1 HF   5  bits  */

    /* Encode SCF VQ parameters - 2nd stage side-info (3-4 bits) */
    submode_MSB = shr_pos(extract_l(L_scf_idx[2]), 1);        /*  explicit tx */
    write_bit_backward(ptr, bp_side, mask_side, submode_MSB); /* submode MSB  1 explicit bit */
    submode_LSB = s_and(extract_l(L_scf_idx[2]), 0x1);        /* for joint coding with shapeCw */
    gain_MSBs   = extract_l(L_scf_idx[3]);                    /* all gain bits */
    L_gain_LSB  = L_and(L_scf_idx[3], 0x1L);
    gain_MSBs   = shr(gain_MSBs, plus_sns_gainLSBbits[L_scf_idx[2]]);

    ASSERT_LC3(gain_MSBs >= 0 && gain_MSBs < (1 << plus_sns_gainMSBbits[L_scf_idx[2]])); /* ASSERT  max 2 MSB(s) in gain bits */

    write_indice_backward(ptr, bp_side, mask_side, gain_MSBs,
                          plus_sns_gainMSBbits[L_scf_idx[2]]);                 /* adjgain or MSBs of adjGains   1-2 bits  */
    write_bit_backward(ptr, bp_side, mask_side, extract_l(L_scf_idx[4])); /*  shape  LS 1 bit */

    /* Encode SCF VQ parameters - 2nd stage data (24-25 bits) */
    if (submode_MSB == 0)
    { /* regular,regular_lf*/
        ASSERT_LC3(submode_MSB == 0);

        L_tmp = L_add(L_gain_LSB, 0); /* gain-LSB 0,1 for regular_lf,  offset is 0 */
        if (submode_LSB == 0)
        {
            L_tmp = L_add(L_scf_idx[6],
                          sns_MPVQ_Sz[1][1]); /* shape B pos offset is 2 , upshifted two positions , 0..11 -> 2..13 */
        }
        /* regular mode A,B indexes multiplexed, total 24.x bits  MPVQ codeword section A + codeword for section B */
        L_tmp = ac_enc_mux_st2VQ_cws(sns_MPVQ_Sz[0][0],                               /*  max 21.3  bits*/
                                     UL_addNsD(sns_MPVQ_Sz[0][1], sns_MPVQ_Sz[1][1]), /*  max log2(14)  bits */
                                     L_scf_idx[5] /* shapeA */, L_tmp /*   shapeB joint with adjGainLSB */);
        /* regular mode  mode shape  index   total  1+23.9999 bits    MPVQ codeword  */
        ASSERT_LC3(L_tmp < (1L << 25));
        write_indice_backward(ptr, bp_side, mask_side, extract_l(L_tmp), 13);                /*  multiplex 13  bits  */
        write_indice_backward(ptr, bp_side, mask_side, extract_l(L_shr_pos(L_tmp, 13)), 12); /* multiplex 12 bits  */
    }
    else
    { /* outlier near, outlier far */
        ASSERT_LC3(submode_MSB == 1);
        L_tmp = L_scf_idx[5];   /* outlier near  section assumed */
        if (submode_LSB != 0)
        {                                                   /* outl_far */
            L_tmp = L_add(L_shl_pos(L_tmp, 1), L_gain_LSB); /*  add lsb bit of Gain */
            L_tmp = L_add(L_tmp, sns_MPVQ_Sz[2][0]);        /*  outlier far section offset added */
        }

        ASSERT_LC3(L_tmp < (1L << 24));
        /* outlier mode shape  index   total  23.8536 ( +  ~.14 ) bits as   MPVQ codeword  */
        write_indice_backward(ptr, bp_side, mask_side, extract_l(L_tmp), 12);            /*  multiplex 12  bits  LSB*/
        write_indice_backward(ptr, bp_side, mask_side, extract_l(L_shr(L_tmp, 12)), 12); /* multiplex 12 bits  MSBs */
    }

    /* LTPF data */
    if (ltpf_idx[0] != 0)
    {
        write_indice_backward(ptr, bp_side, mask_side, ltpf_idx[1], 1);
        write_indice_backward(ptr, bp_side, mask_side, ltpf_idx[2], 9);
    }

    /* Encoder noise-fac */
    write_indice_backward(ptr, bp_side, mask_side, fac_ns_idx, 3);

}

static __forceinline int32_t
ac_enc_mux_st2VQ_cws(                    /*  o:  max 25 bits total codeword */
                     const int32_t L_szA, /*  i:  max 22 bits */
                     const int32_t L_szB, /*  i:  max 4 bits  0..13  */
                     const int32_t L_cwA,
                     const int32_t L_cwB) /*  [0..13} corresponding to gains{0,1}, shapeB{0..11}  or */
{

    int32_t L_cwTx;
    /* L_cw_tx =   L_cwB(21.z bits) * L_szA(3.y bits)   + L_cwA(21.x bits)); */
    L_cwTx = (int32_t)UL_Mpy_32_32(
        (uint32_t)L_cwB, (uint32_t)L_szA); /* non-fractional 16x32 -> 32  may possibly also be used if available */
    L_cwTx = L_add(L_cwTx, L_cwA);

    ASSERT_LC3((L_szA * L_szB) <= 1 << 25);          /* multiplexing only allowed up to 25 bits  (+ leading sign)  */
    ASSERT_LC3(L_cwTx >= 0 && L_cwTx <= 0x01ffFFff); /*  max 25 bits allowed */

    return L_cwTx;
}
