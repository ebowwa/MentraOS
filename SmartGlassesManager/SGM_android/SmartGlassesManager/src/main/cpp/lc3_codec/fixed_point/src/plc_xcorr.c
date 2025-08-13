
#include "defines.h"
#include "functions.h"


#define MAX_ACCS 3 /* sum(x.*y), sum(x.*x), sum(y.*y),  nb of always nonsaturated shorter sub_blocks*/
#define MAX_BLOCKS 8
#define MAX_ACC_LEN_BITS 7
#define MIN_ACC_LEN_BITS 5
#define MAX_ACC_LEN (1 << MAX_ACC_LEN_BITS)
#define MIN_PITCH_8K 20 /* 8000* MIN_PITCH_12k8/12800 */

static const int16_t pitch_min_2[5] = {2 * MIN_PITCH_8K, 2 * MIN_PITCH_8K * 2, 2 * MIN_PITCH_8K * 3,
                                      2 * MIN_PITCH_8K * 4, 2 * MIN_PITCH_8K * 6};

/* req headroom in bits, for safe summing of block results w/o downshift */
/* also the safe pre subblock acc downshift for various number of blocks */
static const int16_t tab_req_headroom[MAX_BLOCKS + 1] = {0, 0, 1, 2, 2, 3, 3, 3, 3};
/*(0, 1, 2,  3,4, 5,6,7,8)*/

static int16_t plc_norm_corr_blocks_fx(int16_t tot_len, int16_t l2_base_len, int16_t n_blocks, int16_t inshift,
                                      int16_t *currFrame, int16_t *predFrame);

int16_t plc_norm_corr_blocks_fx(                     /* o:  norm_corr range  [-1 ... 1.0[  in Q15  */
                               int16_t  tot_len,     /* i:  total correlation length in Q0 */
                               int16_t  l2_base_len, /* i:  size of subblocks in log2  */
                               int16_t  n_blocks,    /* i:  number of accumulator sub_blocks */
                               int16_t  inshift,     /* i:  required inshift of curr/pred Q0 */
                               int16_t *currFrame,   /* i:  ptr to most recent section */
                               int16_t *predFrame)   /* i:  ptr to historic section  */
{
    int16_t  scale0, scale1, scale2, scale_min, shift, prod_exp, acc_margin;
    int32_t  L_prod, L_inv, L_tmp0 = 0, L_tmp1 = 0, L_tmp2 = 0;
    int16_t  norm_corr, curr, pred;
    int32_t m, b;
    int32_t  L_ce[MAX_ACCS][MAX_BLOCKS];

    //TRACE("plc_norm_corr_blocks_fx");

    /* Calculate normalized correlation with added shift and  block interleaving possibility */
    ASSERT_LC3(n_blocks <= MAX_BLOCKS && n_blocks > 0);
    ASSERT_LC3(((float)tot_len / (float)n_blocks) <= (float)(1 << l2_base_len));
    ASSERT_LC3(inshift > 0);

    for(b = 0; b < n_blocks; b++)
    { /* block loop with  fixed pre_down shifting(inshift) of input signal  */
        curr   = shr_pos(currFrame[b], inshift);
        pred   = shr_pos(predFrame[b], inshift);
        L_tmp2 = L_deposit_l(0);
        L_tmp0 = L_msu0(L_tmp2, curr, pred); /*   acc L_tmp0 on negative side to avoid saturation for  (-1*-1)  */
        L_tmp1 = L_msu0(L_tmp2, pred, pred); /*   acc_energy on negative side    */
        L_tmp2 = L_msu0(L_tmp2, curr, curr); /*   acc_energy on negative side    */

        for(m = (b + n_blocks); m < tot_len; m += n_blocks)
        { /* interleaved accumulation over total length */
            curr   = shr_pos(currFrame[m], inshift);
            pred   = shr_pos(predFrame[m], inshift);
            L_tmp0 = L_msu0(L_tmp0, curr, pred);
            L_tmp1 = L_msu0(L_tmp1, pred, pred);
            L_tmp2 = L_msu0(L_tmp2, curr, curr);
        }

        L_ce[0][b] = L_add(L_tmp0, 0); /* account for moves from register to stack memory */
        L_ce[1][b] = L_add(L_tmp1, 0);
        L_ce[2][b] = L_add(L_tmp2, 0);
    }

    /* aggregate  interleaved subsections */
    if (sub(n_blocks, 1) >= 0)
    {                                            /* 100% safe non saturating L_ce  with a safe acc_margin   */
        acc_margin = tab_req_headroom[n_blocks]; 

        L_tmp0 = L_shr_pos(L_ce[0][0], acc_margin);
        L_tmp1 = L_shr_pos(L_ce[1][0], acc_margin);
        L_tmp2 = L_shr_pos(L_ce[2][0], acc_margin);

        for(b = 1; b < n_blocks; b++)
        {
            L_tmp0 = L_add(L_tmp0, L_shr_pos(L_ce[0][b], acc_margin)); /* add negative values */
            L_tmp1 = L_add(L_tmp1, L_shr_pos(L_ce[1][b], acc_margin)); /* add negative values */
            L_tmp2 = L_add(L_tmp2, L_shr_pos(L_ce[2][b], acc_margin)); /* add negative values */
        }

        /* evaluate headroom margin in coarse representation */
        scale0 = norm_l(L_tmp0);
        scale1 = norm_l(L_tmp1);
        scale2 = norm_l(L_tmp2);

        scale_min = min(scale0, scale1);
        scale_min = min(scale_min, scale2);

        shift = sub(scale_min, acc_margin);
        if (shift >= 0)
        {                                  /* re-accumulate blocks with highest possible precision */
            L_tmp0 = L_add(L_ce[0][0], 0); /* add negative values */
            L_tmp1 = L_add(L_ce[1][0], 0); /* add negative values */
            L_tmp2 = L_add(L_ce[2][0], 0); /* add negative values */

            for(b = 1; b < n_blocks; b++)
            {
                L_tmp0 = L_add(L_tmp0, L_ce[0][b]); /* add negative values */
                L_tmp1 = L_add(L_tmp1, L_ce[1][b]); /* add negative values */
                L_tmp2 = L_add(L_tmp2, L_ce[2][b]); /* add negative values */
            }
        }
    }

    /* quota: norm_corr   =  corr/sqrt(en1*en2) =  negate(L_tmp1)/sqrt(-L_tmp1*-L_tmp2)  */
    L_tmp1 = min(L_tmp1, -1); /* make sure there is negative energy  */
    L_tmp2 = min(L_tmp2, -1); /* make sure there is negative energy  */

    ASSERT_LC3(L_tmp1 < 0 && L_tmp2 < 0);

    /* negate correlation, due to  the used safe msu0 accumulation,  with a saturation pre-check ctrl */
    L_tmp0 = max(L_tmp0, (MIN_32 + 1));
    L_tmp0 = L_negate(L_tmp0);

    scale0 = norm_l(L_tmp0);
    scale1 = norm_l(L_tmp1);
    scale2 = norm_l(L_tmp2);

    L_tmp1   = L_shl_pos(L_tmp1, scale1);
    L_tmp2   = L_shl_pos(L_tmp2, scale2);
    L_prod   = Mpy_32_32(L_tmp1, L_tmp2); /* neg * neg -> positive */
    shift    = norm_l(L_prod);
    L_prod   = L_shl_pos(L_prod, shift);
    prod_exp = sub(62, add(add(scale1, scale2), shift));
    L_inv    = Isqrt(L_prod, &prod_exp);

    L_tmp0   = L_shl_pos(L_tmp0, scale0);
    L_prod   = Mpy_32_32(L_tmp0, L_inv);
    prod_exp = add(sub(31, scale0), prod_exp);

    norm_corr = 32767;  /* as close to 1.0 as possible in Q15 */
    if (L_tmp0 < 0)
    {
        norm_corr = -32768;  /*-1.0*/
    }

    
    if (L_prod == 0 || sub(norm_l(L_prod), prod_exp) >= 0)
    {
        norm_corr = round_fx_sat(L_shl_sat(L_prod, prod_exp));
    }
    
    return norm_corr;
}

int16_t plc_xcorr_lc(                     /* o: quantized output xcorr in Q15  [ 0 ..32767 ] = [0. 1.0[  */
                       int16_t *pcmbuf_fx,   /* i: NB should be an  already dynamically upscaled pcm buffer with about
                                               0...1(2)  bits margin */
                       int16_t buflen,       /* i: Q0 physical size of pcmbuf_fx */
                       int16_t pitch_int,    /* i: Q0  in Fs, lag value to evaluate, corresponding to the current f0   in
                                               pcm_buf_Fx   */
                       int16_t nom_corr_len, /* i: nominal correlation length to use  */
                       int16_t fs_idx /*i:  */)
{
    int16_t *range1Ptr;
    int16_t *range2Ptr;
    int16_t  corr_len_fx, inshift, l2_base_len, n_blocks, norm_xcorr_est_q;

    //TRACE("plc_xcorr_lc");

    norm_xcorr_est_q = 0; 

    if (pitch_int > 0)
    {
        corr_len_fx = min(nom_corr_len, pitch_int); /* default assumption one wavelength=pitch_int */
        corr_len_fx = max(corr_len_fx, pitch_min_2[fs_idx]);

        ASSERT_LC3(corr_len_fx >= (pitch_min_2[fs_idx])); /* at least 2 x pitch min(fs) */
        ASSERT_LC3(corr_len_fx <= (MAX_ACC_LEN * MAX_BLOCKS));

        range1Ptr = &(pcmbuf_fx[buflen]) - corr_len_fx; /* ptr setup, start of head section */
        range2Ptr = range1Ptr - pitch_int;              /* ptr setup, history = tail - lag  distance */

        /* assume 32 bit acc of up to 32 values  ->  sum(over 32,  x_up>>2 * y_up>>2)    */
        inshift     = 2;                
        l2_base_len = MIN_ACC_LEN_BITS; 
        n_blocks    = shr(add(corr_len_fx, (1 << MIN_ACC_LEN_BITS) - 1), MIN_ACC_LEN_BITS);

        if (sub(n_blocks, MAX_BLOCKS) > 0)
        {                    /* shift to 32 bit acc of up to 128 values ->  sum(over 128,  x_up>>3 * y_up>>3)    */
            inshift     = 3; 
            l2_base_len = MAX_ACC_LEN_BITS; 
            n_blocks    = shr(add(corr_len_fx, ((1 << MAX_ACC_LEN_BITS) - 1)), MAX_ACC_LEN_BITS);
        }

        ASSERT_LC3(n_blocks <= MAX_BLOCKS); /* MAX_BLOCKS*(32 or 128)  is max possible total corr_length */
        ASSERT_LC3(n_blocks > 0);

        /* subblock accumulation of corr and energies, to achieve high low level precision  */
        norm_xcorr_est_q =
            plc_norm_corr_blocks_fx(corr_len_fx, l2_base_len, n_blocks, inshift, range1Ptr, /* curr_frame  */
                                    range2Ptr); /* pred_frame = curr_frame-lag, i.e historic section */

        norm_xcorr_est_q = max(0, norm_xcorr_est_q); /* do not allow negative output values  */
    }
    
    return norm_xcorr_est_q;
}


