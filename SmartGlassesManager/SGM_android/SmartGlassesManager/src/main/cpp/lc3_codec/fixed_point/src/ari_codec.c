
#include "functions.h"
#include "enhUL32.h"


typedef struct
{
    int16_t inv_bin;
    int16_t numbytes;
    int16_t c_bp;
    int16_t c_bp_side;
    int16_t bytes;
    int16_t b_left;
    int16_t b_right;
    int16_t enc;
    int16_t bfi;
    int16_t be_bp_left;
    int16_t be_bp_right;
} Pc_State;

typedef struct
{
    uint32_t low;
    uint32_t range;
    int16_t  cache;
    int16_t  carry;
    int16_t  carry_count;
} Encoder_State;

typedef struct
{
    uint32_t low;
    uint32_t range;
    uint32_t tmp;
    int16_t  BER_detect;
    Pc_State pc;
} Decoder_State;

static void ac_dec_init(uint8_t *ptr, int16_t *bp, int16_t *bp_side, int16_t *mask_side, Decoder_State *st );
static __forceinline void pc_init(int16_t n_pc, int16_t numbytes, int16_t be_bp_left, int16_t be_bp_right, int16_t L_spec,
                                     int16_t enc, int16_t bfi, Pc_State *pc );
static __forceinline int16_t check_pc_bytes(int16_t *bp, int16_t *bp_side, int16_t *mask_side, int16_t cur_bin, int16_t from_left,
                                           Pc_State *pc );
static void ac_enc_init(Encoder_State *st );
static void ac_enc_shift(uint8_t *ptr, int16_t *bp, Encoder_State *st);
static void write_indice_forward(uint8_t *ptr, int16_t bp, int16_t indice, int16_t numbits);
static void ac_encode(uint8_t *ptr, int16_t *bp, Encoder_State *st, /* i/o: Encoder state */
                         uint32_t cum_freq, /* i  : Cumulative frequency up to symbol   */
                         uint32_t sym_freq  /* i  : Symbol probability                  */);
static int16_t ac_enc_finish(uint8_t *ptr, int16_t *bp, Encoder_State *st );
static int16_t ac_decode(                         /* o  : Decoded cumulative frequency    */
                           Decoder_State *st, /* i/o: Decoder State                   */
                           int16_t            pki);
static int16_t ac_decode_tns_order(                         /* o  : Decoded cumulative frequency    */
                                  Decoder_State *st, /* i/o: Decoder State                   */
                                  int16_t            enable_lpc_weighting);
static int16_t ac_decode_tns_coef(                         /* o  : Decoded cumulative frequency    */
                                 Decoder_State *st, /* i/o: Decoder State                   */
                                 int16_t            pki);
static int16_t ac_dec_update(uint8_t *ptr, int16_t *bp, int16_t *bp_side, int16_t *mask_side, int16_t cur_bin,
                               Decoder_State *st, /* i/o: Decoder State           */
                               uint32_t cum_freq,        /* i  : Cumulative frequency    */
                               uint32_t sym_freq         /* i  : Symbol frequency        */);

/*************************************************************************/

void generateEncodedTnsData(uint8_t * ptr, int16_t tns_numfilters, int16_t* pbp, 
    Encoder_State* pSt, int16_t enable_lpc_weighting, int16_t *tns_order, 
    int16_t *tns_idx)
{
    int32_t          n, k;
    for(n = 0; n < tns_numfilters; n++)
    {
        if (tns_order[n] > 0)
        {
            ac_encode(ptr, pbp, pSt, plus_ac_tns_order_cumfreq[enable_lpc_weighting][tns_order[n] - 1],
                         plus_ac_tns_order_freq[enable_lpc_weighting][tns_order[n] - 1]);
            for(k = 0; k < tns_order[n]; k++)
            {
                ac_encode(ptr, pbp, pSt, plus_ac_tns_coef_cumfreq[k][tns_idx[MAXLAG * n + k]],
                             plus_ac_tns_coef_freq[k][tns_idx[MAXLAG * n + k]]);
            }
        }
    }
}

static int16_t *         lsb, nlsbs;

void ariEncoder_process(uint8_t *ptr, Encoder_State* pSt, int16_t xq[], int16_t lastnz,
                            int16_t *codingdata, int16_t lsbMode,
                            int16_t* pBp, int16_t* p_bp_side, int16_t* p_mask_side)
{
    int16_t           a1, b1, a1_i, b1_i, a1_msb, b1_msb;
    int16_t           lev1;
    int16_t           tmp;    
    int32_t           k, lev;

    a1_i          = 0; 
    b1_i          = 1; 

    if (lsbMode == 0)
    {
         /*Main Loop through the 2-tuples*/
         for(k = 0; k < lastnz; k += 2)
         {
             if (codingdata[1] < 0)
             {
                 ac_encode(ptr, pBp, pSt, ari_spec_cumfreq[ari_spec_lookup[codingdata[0]]][0],
                              ari_spec_freq[ari_spec_lookup[codingdata[0]]][0]);
             }
             else if (codingdata[1] == 0)
             {
                 ac_encode(ptr, pBp, pSt, ari_spec_cumfreq[ari_spec_lookup[codingdata[0]]][codingdata[2]],
                              ari_spec_freq[ari_spec_lookup[codingdata[0]]][codingdata[2]]);
                 if (xq[a1_i] != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[a1_i], 15));
                 }
                 if (xq[b1_i] != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[b1_i], 15));
                 }
             }
             else if (sub(codingdata[1], 1) == 0)
             {
                 ac_encode(ptr, pBp, pSt, ari_spec_cumfreq[ari_spec_lookup[codingdata[0]]][VAL_ESC],
                              ari_spec_freq[ari_spec_lookup[codingdata[0]]][VAL_ESC]);
                 ac_encode(ptr, pBp, pSt,
                              ari_spec_cumfreq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[1]]][codingdata[2]],
                              ari_spec_freq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[1]]][codingdata[2]]);
                 write_bit_backward(ptr, p_bp_side, p_mask_side, s_and(xq[a1_i], 1));
                 write_bit_backward(ptr, p_bp_side, p_mask_side, s_and(xq[b1_i], 1));
                 if (xq[a1_i] != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[a1_i], 15));
                 }
                 if (xq[b1_i] != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[b1_i], 15));
                 }
             }
             else
             {
                 a1 = abs_s(xq[a1_i]);
                 b1 = abs_s(xq[b1_i]);
                 for(lev = 0; lev < codingdata[1]; lev++)
                 {
                     lev1 = min(lev, 3);
                     ac_encode(ptr, pBp, pSt,
                                  ari_spec_cumfreq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[lev1]]][VAL_ESC],
                                  ari_spec_freq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[lev1]]][VAL_ESC]);
                     write_bit_backward(ptr, p_bp_side, p_mask_side, s_and(shr_pos(a1, lev), 1));
                     write_bit_backward(ptr, p_bp_side, p_mask_side, s_and(shr_pos(b1, lev), 1));
                 }
                 lev1 = min(codingdata[1], 3);
                 ac_encode(ptr, pBp, pSt,
                              ari_spec_cumfreq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[lev1]]][codingdata[2]],
                              ari_spec_freq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[lev1]]][codingdata[2]]);
                 if (xq[a1_i] != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[a1_i], 15));
                 }
                 if (xq[b1_i] != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[b1_i], 15));
                 }
             }

             a1_i += 2;
             b1_i += 2;
             codingdata += 3;

         } /*end of the 2-tuples loop*/
        }
     else
     {
         /*Main Loop through the 2-tuples*/
         for(k = 0; k < lastnz; k += 2)
         {
             if (codingdata[1] < 0)
             {
                 ac_encode(ptr, pBp, pSt, ari_spec_cumfreq[ari_spec_lookup[codingdata[0]]][0],
                              ari_spec_freq[ari_spec_lookup[codingdata[0]]][0]);
             }
             else if (codingdata[1] == 0)
             {
                 ac_encode(ptr, pBp, pSt, ari_spec_cumfreq[ari_spec_lookup[codingdata[0]]][codingdata[2]],
                              ari_spec_freq[ari_spec_lookup[codingdata[0]]][codingdata[2]]);
                 if (xq[a1_i] != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[a1_i], 15));
                 }
                 if (xq[b1_i] != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[b1_i], 15));
                 }
             }
             else if (sub(codingdata[1], 1) == 0)
             {
                 ac_encode(ptr, pBp, pSt, ari_spec_cumfreq[ari_spec_lookup[codingdata[0]]][VAL_ESC],
                              ari_spec_freq[ari_spec_lookup[codingdata[0]]][VAL_ESC]);
                 ac_encode(ptr, pBp, pSt,
                              ari_spec_cumfreq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[1]]][codingdata[2]],
                              ari_spec_freq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[1]]][codingdata[2]]);
                 a1_msb       = s_and(codingdata[2], 0x3);
                 tmp          = s_and(xq[a1_i], 1);
                 lsb[nlsbs++] = tmp; 
                 
                 if (a1_msb == 0 && tmp > 0)
                 {
                     if (xq[a1_i] > 0)
                     {
                         lsb[nlsbs++] = 0; 
                     }
                     if (xq[a1_i] < 0)
                     {
                         lsb[nlsbs++] = 1; 
                     }
                 }
                 if (a1_msb != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[a1_i], 15));
                 }
                 b1_msb       = shr_pos(codingdata[2], 2);
                 tmp          = s_and(xq[b1_i], 1);
                 lsb[nlsbs++] = tmp; 
                 
                 if (b1_msb == 0 && tmp > 0)
                 {
                     if (xq[b1_i] > 0)
                     {
                         lsb[nlsbs++] = 0; 
                     }
                     if (xq[b1_i] < 0)
                     {
                         lsb[nlsbs++] = 1; 
                     }
                 }
                 if (b1_msb != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[b1_i], 15));
                 }
             }
             else
             {
                 a1           = abs_s(xq[a1_i]);
                 b1           = abs_s(xq[b1_i]);
                 a1_msb       = shr_pos(a1, 1);
                 tmp          = s_and(a1, 1);
                 lsb[nlsbs++] = tmp; 
                 
                 if (a1_msb == 0 && tmp > 0)
                 {
                     if (xq[a1_i] > 0)
                     {
                         lsb[nlsbs++] = 0; 
                     }
                     if (xq[a1_i] < 0)
                     {
                         lsb[nlsbs++] = 1; 
                     }
                 }
                 b1_msb       = shr_pos(b1, 1);
                 tmp          = s_and(b1, 1);
                 lsb[nlsbs++] = tmp; 
                 
                 if (b1_msb == 0 && tmp > 0)
                 {
                     if (xq[b1_i] > 0)
                     {
                         lsb[nlsbs++] = 0; 
                     }
                     if (xq[b1_i] < 0)
                     {
                         lsb[nlsbs++] = 1; 
                     }
                 }
                 ac_encode(ptr, pBp, pSt, ari_spec_cumfreq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[0]]][VAL_ESC],
                              ari_spec_freq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[0]]][VAL_ESC]);
                 for(lev = 1; lev < codingdata[1]; lev++)
                 {
                     lev1 = min(lev, 3);
                     ac_encode(ptr, pBp, pSt,
                                  ari_spec_cumfreq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[lev1]]][VAL_ESC],
                                  ari_spec_freq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[lev1]]][VAL_ESC]);
                     write_bit_backward(ptr, p_bp_side, p_mask_side, s_and(shr_pos(a1, lev), 1));
                     write_bit_backward(ptr, p_bp_side, p_mask_side, s_and(shr_pos(b1, lev), 1));
                 }
                 lev1 = min(codingdata[1], 3);
                 ac_encode(ptr, pBp, pSt,
                              ari_spec_cumfreq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[lev1]]][codingdata[2]],
                              ari_spec_freq[ari_spec_lookup[codingdata[0] + Tab_esc_nb[lev1]]][codingdata[2]]);
                 if (a1_msb != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[a1_i], 15));
                 }
                 if (b1_msb != 0)
                 {
                     write_bit_backward(ptr, p_bp_side, p_mask_side, lshr(xq[b1_i], 15));
                 }
             }
    
             a1_i += 2;
             b1_i += 2;
             codingdata += 3;
    
         } /*end of the 2-tuples loop*/
     }
}

void ariEncoder_residualData(uint8_t* ptr, int16_t lsbMode, Encoder_State* pSt, int16_t* p_extra_bits, int16_t nbbits,
                            int16_t bp, int16_t nbits_side, int16_t* p_bp_side, int16_t* p_mask_side,
                            int16_t* pNumResBitsEnc, int16_t* pNlsbs, int8_t *resBits, int16_t* lsb)
{
    int16_t           extra_bits;

    extra_bits = sub(norm_ul(pSt->range), 6);
    if (pSt->cache >= 0)
    {
        extra_bits = add(extra_bits, 8);
    }
    if (pSt->carry_count > 0)
    {
        extra_bits = add(extra_bits, shl_pos(pSt->carry_count, 3));
    }
    int32_t n = sub(nbbits, add(shl_pos(bp, 3), add(extra_bits, nbits_side))); 
    assert(n >= 0);

    if (lsbMode == 0)
    {
        *pNumResBitsEnc = min(*pNumResBitsEnc, n);
        for(int32_t i = 0; i < *pNumResBitsEnc; i++)
        {
            write_bit_backward(ptr, p_bp_side, p_mask_side, (int16_t)resBits[i]);
        }
    }
    else
    {
        *pNlsbs = min(*pNlsbs, n);
        for(int32_t k = 0; k < *pNlsbs; k++)
        {
            write_bit_backward(ptr, p_bp_side, p_mask_side, lsb[k]);
        }
    }

    *p_extra_bits = extra_bits;
}

int16_t ArithmeticEncoder(uint8_t *bytes, int16_t bp_side_in, int16_t mask_side_in, int16_t nbbits, int16_t xq[],
                            int16_t *tns_order, int16_t tns_numfilters, int16_t *tns_idx, int16_t lastnz,
                            int16_t *codingdata, int8_t *resBits, int16_t numResBits, int16_t lsbMode,
                            int16_t enable_lpc_weighting, int8_t *scratchBuffer)
{
    Encoder_State st;
    int16_t           bp, bp_side, mask_side, extra_bits;
    int16_t           nbits_side;
    int16_t           fill_bits;
    uint8_t *         ptr;
    int16_t           numResBitsEnc;

    lsb = (int16_t *)scratchBuffer; /* Size = 2 * MAX_LEN * 2 bytes */

    /* Init */ 
    bp            = 0; 
    numResBitsEnc = 0; 
    nlsbs         = 0; 
    ptr           = bytes;
    bp_side       = bp_side_in; 
    mask_side     = mask_side_in; 

    /*Start Encoding*/
    ac_enc_init(&st);

    /* TNS data */

    generateEncodedTnsData(ptr, tns_numfilters, &bp, &st, enable_lpc_weighting,
        tns_order, tns_idx);

    /* do encoding */
    ariEncoder_process(ptr, &st, xq, lastnz, codingdata, lsbMode, &bp, &bp_side,
        &mask_side);
 
    /* Side bits (in sync with the decoder) */
    nbits_side = sub(nbbits, add(shl_pos(bp_side, 3), sub(norm_s(mask_side), 6)));


    /* Residual bits (in sync with the decoder) */    
    ariEncoder_residualData(ptr, lsbMode, &st, &extra_bits, nbbits,
                            bp, nbits_side, &bp_side, &mask_side,
                            &numResBitsEnc, &nlsbs, resBits, lsb);

    /* End arithmetic coder, overflow management */
    extra_bits = ac_enc_finish(ptr, &bp, &st);

    /* Fill bits (for debugging, the exact number of fill bits cannot be computed in the decoder)*/
    fill_bits = nbbits - (bp * 8 + extra_bits + nbits_side + nlsbs + numResBitsEnc);

    return fill_bits;
}

static inline int16_t getTnsdata(uint8_t *ptr, int16_t tns_numfilters, int16_t* tns_order, int16_t* bp, Decoder_State* st, int16_t enable_lpc_weighting, 
	                           int16_t frame_dms, int16_t* bp_side, int16_t* mask_side, int16_t* tns_idx)
{
    int32_t n, k = 0;
    int16_t max_tns_order = 0;

    /* TNS data */
#ifdef NONBE_BER_DETECT
    max_tns_order = MAXLAG;
    if (frame_dms <= 50)
        max_tns_order = max_tns_order >> 1;
#endif

    for(n = 0; n < tns_numfilters; n++)
    {
        if (tns_order[n] > 0)
        {
            tns_order[n] = ac_decode_tns_order(st, enable_lpc_weighting);
            tns_order[n] = (tns_order[n] + 1);
#ifdef NONBE_BER_DETECT
            if (tns_order[n] > max_tns_order)
                return 1;
#endif
            if (ac_dec_update(ptr, bp, bp_side, mask_side, 0, st, plus_ac_tns_order_cumfreq[enable_lpc_weighting][tns_order[n] - 1],
                                          plus_ac_tns_order_freq[enable_lpc_weighting][tns_order[n] - 1]) != 0)
                return 1;

            for(k = 0; k < tns_order[n]; k++)
            {
                if ((*bp_side) < (*bp))
                    return 1;

                tns_idx[MAXLAG * n + k] = ac_decode_tns_coef(st, k);
                if (ac_dec_update(ptr, bp, bp_side, mask_side, 0, st, plus_ac_tns_coef_cumfreq[k][tns_idx[MAXLAG * n + k]],
                                 plus_ac_tns_coef_freq[k][tns_idx[MAXLAG * n + k]]) != 0)
                   return 1;
            }
        }
    }
    return 0;
}

static int16_t ac_decode_update(uint8_t* ptr, Decoder_State* st, int16_t num, int16_t* bp, int16_t* bp_side, 
                                                  int16_t*mask_side, int32_t k, int16_t* r)
{
    *r = ac_decode(st, ari_spec_lookup[num]);
    if (ac_dec_update(ptr, bp, bp_side, mask_side, k, st, ari_spec_cumfreq[ari_spec_lookup[num]][*r],
                                    ari_spec_freq[ari_spec_lookup[num]][*r]) != 0)
        return 1;

    return 0;
}

static int16_t ArithmeticDecoderstage1(int16_t lastnz, int16_t rateFlag, uint8_t *ptr, Decoder_State* st, int16_t* bp, int16_t *bp_side, int16_t *mask_side, int16_t *x, 
	int16_t lsbMode, int16_t *lsb_ind, int16_t* lsb_ind_c, int16_t L_spec, Pc_State *pc)
{
    int16_t t =0;
    int32_t k = 0;
    int16_t  c = 0;
    int16_t  nt_half = 0;
    int16_t  esc_nb = 0;
    int32_t lev = 0;
    int16_t  b1 = 0;
    int16_t  a1 = 0;
    int16_t  b = 0;
    int16_t  a = 0;
    int16_t  b1_i = 1;
    int16_t  a1_i = 0;
    int16_t  r = 0;

    nt_half   = L_spec >> 1;    
    /*Main Loop through the 2-tuples*/
    for(k = 0; k < lastnz; k += 2)
    {
        /* Get context */
        t = add(c, rateFlag);
        if (k > nt_half)
            t += 1 << NBITS_CONTEXT;

        if(ac_decode_update(ptr, st, t, bp, bp_side, mask_side, k, &r))
            return 1;

        if (r == 0)
        {
            x[a1_i] = 0;
            x[b1_i] = 0;
            c = add(shl_pos(s_and(c, 0xf), 4), 1);
        }
        else if (r < VAL_ESC)
        {
            a = s_and(r, 0x3);
            b = shr_pos(r, 2);
            c = add(shl_pos(s_and(c, 0xf), 4), add(add(a, b), 1));
            if (a > 0)
            {
                if (check_pc_bytes(bp, bp_side, mask_side, a1_i, 0, pc) != 0)
                    return 1;

                if (read_bit(ptr, bp_side, mask_side) != 0)
                    a = negate(a);
            }
            x[a1_i] = a;
            if (b > 0)
            {
                if (check_pc_bytes(bp, bp_side, mask_side, b1_i, 0, pc) != 0)
                    return 1;

                if (read_bit(ptr, bp_side, mask_side) != 0)
                    b = negate(b);
            }
            x[b1_i] = b;
        }
        else
        {
            if (lsbMode == 0)
            {
                if (check_pc_bytes(bp, bp_side, mask_side, a1_i, 0, pc) != 0)
                    return 1;
    
                a = read_bit(ptr, bp_side, mask_side);
                if (check_pc_bytes(bp, bp_side, mask_side, a1_i, 0, pc) != 0)
                    return 1;
    
                b = read_bit(ptr, bp_side, mask_side);
            }

            if(ac_decode_update(ptr, st, t + Tab_esc_nb[1], bp, bp_side, mask_side, k, &r))
                return 1;

            if (r < VAL_ESC)
            {
                a1 = s_and(r, 0x3);
                b1 = shr_pos(r, 2);

                if (lsbMode == 0)
                {
                    a  = add(shl_pos(a1, 1), a);
                    b  = add(shl_pos(b1, 1), b);
                }
                else
                {
                    a  = shl_pos(a1, 1);
                    b  = shl_pos(b1, 1);
                }

                if (a > 0)
                {
                    if (check_pc_bytes(bp, bp_side, mask_side, a1_i, 0, pc) != 0)
                        return 1;

                    if (read_bit(ptr, bp_side, mask_side) != 0)
                        a = negate(a);
                }
                x[a1_i] = a;
                if (b > 0)
                {
                    if (check_pc_bytes(bp, bp_side, mask_side, b1_i, 0, pc) != 0)
                        return 1;
                    if (read_bit(ptr, bp_side, mask_side) != 0)
                        b = negate(b);
                }
                x[b1_i] = b;
                c = add(shl_pos(s_and(c, 0xf), 4), add(shl_pos(add(a1, b1), 1), 1));

                if (lsbMode != 0)
                  lsb_ind[(*lsb_ind_c)++] = k;				
           }
            else
            {
                if (check_pc_bytes(bp, bp_side, mask_side, a1_i, 0, pc) != 0)
                    return 1;

                if (lsbMode == 0)					
                    a = add(shl_pos(read_bit(ptr, bp_side, mask_side), 1), a);
                else
                    a = shl_pos(read_bit(ptr, bp_side, mask_side), 1);                   
    				
                if (check_pc_bytes(bp, bp_side, mask_side, a1_i, 0, pc) != 0)
                    return 1;
    
                if (lsbMode == 0)					
                    b = add(shl_pos(read_bit(ptr, bp_side, mask_side), 1), b);
                else
                    b = shl_pos(read_bit(ptr, bp_side, mask_side), 1);                    
					
                for(lev = 2; lev < 14; lev++)
                {
                    esc_nb = min(lev, 3);
                    if(ac_decode_update(ptr, st, (t + Tab_esc_nb[esc_nb]), bp, bp_side, mask_side, k, &r))
                        return 1;

                    if (r < VAL_ESC)
                        break;
                    if (check_pc_bytes(bp, bp_side, mask_side, a1_i, 0, pc) != 0)
                        return 1;

                    a = add(shl(read_bit(ptr, bp_side, mask_side), lev), a);
                    if (check_pc_bytes(bp, bp_side, mask_side, a1_i, 0, pc) != 0)
                        return 1;

                    b = add(shl(read_bit(ptr, bp_side, mask_side), lev), b);
                }
                /* check for bitflip */
                if (lev == 14)
                    return 1;

                b1 = shr_pos(r, 2);
                a1 = s_and(r, 0x3);
                a  = add(shl(a1, lev), a);
                b  = add(shl(b1, lev), b);
                if (a > 0)
                {
                    if (check_pc_bytes(bp, bp_side, mask_side, a1_i, 0, pc) != 0)
                        return 1;

                    if (read_bit(ptr, bp_side, mask_side) != 0)
                        a = negate(a);
                }
                x[a1_i] = a;
                if (b > 0)
                {
                    if (check_pc_bytes(bp, bp_side, mask_side, b1_i, 0, pc) != 0)
                        return 1;

                    if (read_bit(ptr, bp_side, mask_side) != 0)
                        b = negate(b);
                }
                x[b1_i] = b;
                c = add(shl_pos(s_and(c, 0xf), 4), add(esc_nb, 12));

                if (lsbMode != 0)
                    lsb_ind[(*lsb_ind_c)++] = k;                      
					
            }
        }

        if ((sub(sub(*bp, *bp_side), 3) > 0 && sub(st->pc.c_bp, st->pc.c_bp_side) == 0) || st->BER_detect > 0)
            return 1;

        a1_i += 2;
        b1_i += 2;
    }

    if (L_spec > k)
        memset(&x[k], 0, (L_spec - k) * sizeof(*x));

    return 0;
}

static int16_t ArithmeticDecoderstage2(int16_t lsbMode, int16_t *resBits, int16_t L_spec, int16_t *x, int16_t *bp, int16_t * bp_side, 
	                                                                   int16_t * mask_side, int16_t * resQdata,int16_t* lsb_ind, int16_t lsb_ind_c, uint8_t *ptr,
	                                                                   int16_t nbbits, int16_t nbits_ari, int16_t extra_bits, int16_t nbits_side, Pc_State *pc)
{
    int32_t n = 0;
    int32_t k = 0;
    int16_t  b = 0;
    int16_t  a = 0;
    int16_t  tmp = 0;

    n = sub(nbbits, add(nbits_ari, add(extra_bits, nbits_side)));
    if (n < 0)
        return 1;

    if (lsbMode == 0)
    {
        *resBits = n;
        for(k = 0; k < L_spec; k++)
        {
            if (x[k] != 0)
            {
                if (n == 0)
                    break;
                if (check_pc_bytes(bp, bp_side, mask_side, pc->inv_bin, 0, pc) != 0)
                    return 1;
                *resQdata++ = read_bit(ptr, bp_side, mask_side);
                n -= 1;
            }
        }
        *resBits = sub(*resBits, n);
    }
    else
    {
        *resBits = 0;
        for(k = 0; k < lsb_ind_c; k++)
        {
            a = x[lsb_ind[k]];
            if (n == 0)
                break;
            if (check_pc_bytes(bp, bp_side, mask_side, pc->inv_bin, 0, pc) != 0)
                return 1;
            tmp = read_bit(ptr, bp_side, mask_side);
            n -= 1;
            if (tmp > 0)
            {
                if (a > 0)
                    a += 1;
                if (a < 0)
                    a -= 1;
                if (a == 0)
                {
                    if (n == 0)
                        break;
                    a = 1;
                    if (check_pc_bytes(bp, bp_side, mask_side, pc->inv_bin, 0, pc) != 0)
                        return 1;
                    if (read_bit(ptr, bp_side, mask_side) != 0)
                        a = -a;
                    n -=  1;
                }
            }

            x[lsb_ind[k]] = a;
            b = x[lsb_ind[k] + 1];
            if (n == 0)
                break;
            if (check_pc_bytes(bp, bp_side, mask_side, pc->inv_bin, 0, pc) != 0)
                return 1;
            tmp = read_bit(ptr, bp_side, mask_side);
            n   -= 1;
            if (tmp > 0)
            {
                if (b > 0)
                    b += 1;
                if (b < 0)
                    b -= 1;
                if (b == 0)
                {
                    if (n == 0)
                        break;
                    b = 1;
                    if (check_pc_bytes(bp, bp_side, mask_side, pc->inv_bin, 0, pc) != 0)
                        return 1;
                    if (read_bit(ptr, bp_side, mask_side) != 0)
                        b = -b;
                    n -= 1;
                }
            }
            x[lsb_ind[k] + 1] = b;
        }
    }
    return 0;
}

static inline void getnoisefillingseed(int16_t spec_inv_idx, int16_t *x, int16_t *nf_seed)
{
    int32_t tmp32 = 0;
    int32_t i = 0;
	
    /* Noise Filling seed */
    for(i = 0; i < spec_inv_idx; i++)
        tmp32 = L_mac0_1(tmp32, abs_s(x[i]), i);

    *nf_seed = extract_l(tmp32);
}

void ArithmeticDecoder(uint8_t *bytes, int16_t *bp_side, int16_t *mask_side, int16_t nbbits, int16_t L_spec,
                          int16_t fs_idx, int16_t enable_lpc_weighting, int16_t tns_numfilters, int16_t lsbMode,
                          int16_t lastnz, int16_t *bfi, int16_t *tns_order, int16_t fac_ns_idx, int16_t gg_idx,
                          int16_t frame_dms,
                          int16_t n_pc, int16_t be_bp_left, int16_t be_bp_right, int16_t enc, int16_t *spec_inv_idx, int16_t *b_left,
                          int16_t *resBits, int16_t *x, int16_t *nf_seed, int16_t *resQdata, int16_t *tns_idx,
                          int16_t *zero_frame, int8_t *scratchBuffer)
{

    Decoder_State st;
    int16_t  bp = 0;
    int16_t  rateFlag = 0;
    int16_t  nbits_side, extra_bits, nbits_ari = 0;
    uint8_t *ptr;
    int16_t  lsb_ind_c = 0;
    int16_t *lsb_ind;

    lsb_ind = (int16_t *)scratchBuffer; /* Size 2 * MAX_LEN bytes */

    /* Rate flag */
    if ((nbbits -(160 + fs_idx * 160)) > 0)        
        rateFlag = 2 << NBITS_CONTEXT;

    pc_init(n_pc, (nbbits >> 3), be_bp_left, be_bp_right, L_spec, enc, *bfi, &st.pc);

    /* Init */
    bp        = 0;
    if (enc == 0)
        bp = bp + st.pc.bytes;
    *spec_inv_idx = L_spec;
    *b_left = -1;
    lsb_ind_c = 0;

    ptr = bytes;

    /* Arithmetic Decoder Initialization */
    ac_dec_init(ptr, &bp, bp_side, mask_side, &st);

    if(getTnsdata(ptr, tns_numfilters, tns_order, &bp, &st, enable_lpc_weighting,
		               frame_dms, bp_side, mask_side, tns_idx))
        goto ber_detect;

    if (st.BER_detect > 0)
        goto ber_detect;


    if(ArithmeticDecoderstage1(lastnz, rateFlag, ptr, &st, &bp, bp_side, mask_side, x, lsbMode, lsb_ind, &lsb_ind_c, L_spec, &st.pc))
        goto ber_detect;

    nbits_side = sub(nbbits, add(shl_pos(*bp_side, 3), sub(norm_s(*mask_side), 6)));
    extra_bits  = sub(norm_ul(st.range), 6);
    nbits_ari   = shl_pos(sub(bp, 3), 3);
    if (enc == 0)
    {
        if (st.pc.c_bp == 0)
            nbits_ari = shl_pos(sub(sub(bp, st.pc.bytes), 3), 3);
        else
            nbits_ari = shl_pos(add(bp, sub(sub(st.pc.b_left, st.pc.bytes), 3)), 3);

        if (st.pc.c_bp_side != 0)
            nbits_side = sub(add(sub(nbbits, shl_pos(st.pc.b_left, 3)), shl_pos(sub(st.pc.bytes, *bp_side), 3)), sub(norm_s(*mask_side), 6));
    }

    if(ArithmeticDecoderstage2(lsbMode, resBits, L_spec, x, &bp, bp_side, mask_side, resQdata,lsb_ind, 
		                                       lsb_ind_c, ptr, nbbits, nbits_ari, extra_bits, nbits_side, &st.pc))
        goto ber_detect_res;

    /* Noise Filling seed */
    getnoisefillingseed(L_spec, x, nf_seed);

    /* Detect zero frame */
    if ((lastnz == 2) && (x[0] == 0) && (x[1] == 0) && (gg_idx == 0) && (fac_ns_idx == 7))
        *zero_frame = 1;
    else
        *zero_frame = 0;

    if (enc)
    {
        if (st.pc.bytes > 0)
        {
            if (st.pc.b_left > shr_pos(nbbits,3))
                *b_left = sub(*bp_side, st.pc.bytes);
        }
    }

    if ((*bfi) == 2)
    {
        if ((*spec_inv_idx) == L_spec)
            *bfi = 0;
    }
    goto bail;

/* goto for bit error handling */
ber_detect:
    *bfi = 1;
    *b_left = st.pc.b_left;

    if ((st.pc.inv_bin > 0) && (st.pc.inv_bin <= L_spec))
    {
        *spec_inv_idx = st.pc.inv_bin;
        *bfi = 2;
        *resBits = 0;
        *zero_frame = 0;
        getnoisefillingseed(*spec_inv_idx, x, nf_seed);

    }
    goto bail;

/* goto for bit error handling in residual signal */
ber_detect_res:
    *b_left  = st.pc.b_left;
    *resBits = 0;
    *bfi = 0;
    *zero_frame = 0;
    /* Noise Filling seed */
    getnoisefillingseed(*spec_inv_idx, x, nf_seed);
    goto bail;
    
    /* goto, because of dynmem out */
bail:
    return;
}

void ArithmeticDecoderScaling(int16_t *data16, int16_t dataLen, int32_t *data32, int16_t *data_e)
{
    int32_t i;
    int16_t tmp, shift;
    int16_t x_min = 0;
    int16_t x_max = 0;

    for(i = 0; i < dataLen; i++)
    {
        if (data16[i] > 0)
            x_max = max(x_max, data16[i]);
        if (data16[i] < 0)
            x_min = min(x_min, data16[i]);
    }

    tmp   = max(x_max, negate(x_min));
    shift = norm_s(tmp);
    if (tmp == 0)
        shift = 15;

    for(i = 0; i < dataLen; i++)
        data32[i] = L_shl_pos(L_deposit_h(data16[i]), shift);

    *data_e = 15 - shift;
}

static __forceinline uint32_t UL_addNs24(uint32_t UL_var1, uint32_t UL_var2, uint16_t *wrap)
{
    return UL_lshr(UL_addNs((UL_var1 << 8), (UL_var2 << 8), wrap), 8);
}

int16_t find_last_nz_pair(const int16_t x[], int16_t length)
{
    int16_t  last_nz, lobs[4];
    int32_t stage, i;

    lobs[0] = 4;                  
    lobs[1] = shr_pos(length, 1); /* length/2 */
    
    lobs[2] = add(lobs[1], shr_pos(length, 2)); 
    lobs[3] = add(lobs[2], shr_pos(length, 3)); 

    last_nz = 0;      
    i       = length; 
    for(stage = 3; stage >= 0; --stage)
    {
        /* unmapped kernel */
        for(; i >= lobs[stage]; i -= 2)
        {
            if (x[i - 2] != 0)
            {
                last_nz = max(last_nz, i);
            }
            if (x[i - 1] != 0)
            {
                last_nz = max(last_nz, i);
            }
        }
        if (last_nz > 0)
        {
            break;
        }
    }
    return max(last_nz, 2);
}

void write_bit_backward(uint8_t *ptr, int16_t *bp, int16_t *mask, int16_t bit)
{
    if (bit > 0)
    {
        ptr[*bp] = (uint8_t)s_or((int16_t)ptr[*bp], *mask); 
    }
    *mask = (*mask) <<  1;
    if (sub(*mask, 0x100) == 0)
    {
        *mask = 1; 
    }
    if (sub(*mask, 1) == 0)
    {
        *bp = sub(*bp, 1); 
    }
}

void write_indice_backward(uint8_t *ptr, int16_t *bp, int16_t *mask, int16_t indice, int16_t numbits)
{
    int32_t k;
    int16_t bit;

    for(k = 0; k < numbits; k++)
    {
        bit = s_and(indice, 1);
        write_bit_backward(ptr, bp, mask, bit);
        indice = lshr(indice, 1);
    }
}

static __forceinline void write_indice_forward(uint8_t *ptr, int16_t bp, int16_t indice, int16_t numbits)
{
    int32_t k;
    int16_t  bit, mask, tmp;

    tmp  = (int16_t)ptr[bp]; 
    mask = 0x80;            
    for(k = 0; k < numbits; k++)
    {
        bit = s_and(indice, mask);
        tmp = s_or(tmp, mask);
        if (bit == 0)
        {
            tmp = sub(tmp, mask);
        }
        mask = lshr(mask, 1);
    }
    ptr[bp] = (uint8_t)tmp; 

}

static __forceinline void ac_enc_init(Encoder_State *st) /* i/o: Encoder state       */
{
    st->low         = 0; 
    st->range       = 0x00ffffff;     
    st->cache       = -1;             
    st->carry       = 0;              
    st->carry_count = 0;              
}

static __forceinline void ac_enc_shift(uint8_t *ptr, int16_t *bp, Encoder_State *st) /* i/o: Encoder state */
{
    
    L_sub(0, 0); /* For comparision in if */
    if (st->low < (0x00ff0000UL) || sub(st->carry, 1) == 0)
    {
        if (st->cache >= 0)
        {
            ptr[(*bp)++] = (uint8_t)add(st->cache, st->carry); 
        }

        while(st->carry_count > 0)
        {
            ptr[(*bp)++]             = (uint8_t)s_and(add(st->carry, 0xff), 255); 
            st->carry_count = sub(st->carry_count, 1);                  
        }

        st->cache = u_extract_l(UL_lshr_pos(st->low, 16)); 
        st->carry = 0;                                              
    }
    else
    {
        st->carry_count = add(st->carry_count, 1); 
    }
    st->low = UL_and((st->low << 8), 0x00ffffff);
    
}

static __forceinline void ac_encode(uint8_t *ptr, int16_t *bp, Encoder_State *st, /* i/o: Encoder state */
                                       uint32_t cum_freq, /* i  : Cumulative frequency up to symbol   */
                                       uint32_t sym_freq)  /* i  : Symbol probability                  */
{
    uint32_t r, tmp;
    uint16_t carry;

    r   = UL_lshr_pos(st->range, 10);
    tmp = UL_Mpy_32_32(r, cum_freq);

    assert(r < (1U << 24));
    assert(cum_freq < (1U << 24));
    assert(tmp < (1U << 24));
    assert(st->low < (1U << 24));
    st->low = UL_addNs24(st->low, tmp, &carry); 

    if (carry != 0)
    {
        st->carry = carry; 
    }

    st->range = UL_Mpy_32_32(r, sym_freq); 

    assert(cum_freq < (1U << 24));
    assert(st->range < (1U << 24));
    while(st->range < (1U << 16))
    {
        L_sub(0, 0); /* Comparison in while */
        st->range = (st->range << 8);

        assert(st->range < (1U << 24));

        ac_enc_shift(ptr, bp, st);
    }

}

static __forceinline int16_t ac_enc_finish(uint8_t *ptr, int16_t *bp, Encoder_State *st) /* i/o: Encoder state */
{
    uint32_t val, mask, high;
    int16_t  bits;
    uint16_t over1, over2;

    /*bits = 24 - log2_i(st->ac_range); */
    bits = sub(norm_ul(st->range), 7);

    mask = UL_lshr(0x00ffffff, bits);

    val  = UL_addNs24(st->low, mask, &over1);
    high = UL_addNs24(st->low, st->range, &over2);

    L_xor(0, 0);    /* For bit not */
    UL_and(1U, 1U); /* added counters */
    val = L_and(val, (~mask) & 0x00ffffff);

    L_xor(0, 0); /* For bit not */
    if ((L_xor(over1, over2)) == 0)
    {
        L_sub(0, 0); /* For comparision in if */
        if (UL_addNsD(val, mask) >= high)
        {
            bits = add(bits, 1);
            mask = UL_lshr_pos(mask, 1);
            val  = UL_and(UL_addNsD(st->low, mask), (~mask) & 0x00ffffff);
            L_xor(0, 0);
            UL_and(1, 1); /* For bit not , mask */
        }

        if (val < st->low)
        {
            st->carry = 1; 
        }
    }

    st->low = val; 

    for(; bits > 0; bits -= 8)
    {
        ac_enc_shift(ptr, bp, st);
    }
    bits = add(bits, 8);

    assert(st->carry == 0);

    if (st->carry_count > 0)
    {
        ptr[(*bp)++] = (uint8_t)st->cache; 

        for(; st->carry_count > 1; st->carry_count--)
        {
            ptr[(*bp)++] = 0xff; 
        }
        write_indice_forward(ptr, *bp, lshr(0xff, sub(8, bits)), bits);
    }
    else
    {
        write_indice_forward(ptr, *bp, st->cache, bits);
    }

    return bits;
}

__forceinline int16_t read_bit(uint8_t *ptr, int16_t *bp, int16_t *mask)
{
    int16_t bit;

    if ((ptr[*bp]) & (*mask))
        bit = 1;
    else
        bit = 0;

    if ((*mask) == 0x80)
    {
        *mask = 1;
        *bp -= 1;
    }
    else
        *mask <<= 1;

    return bit;
}

static __forceinline void ac_dec_init(uint8_t *ptr, int16_t *bp, int16_t *bp_side, int16_t *mask_side, Decoder_State *st) /* i/o: Decoder State */
{
    int32_t i;

    st->low = 0;
    st->range = 0x00ffffff;
    for(i = 0; i < 3; i++)
    {
        if (check_pc_bytes(bp, bp_side, mask_side, 0, 1, &st->pc) != 0)
            return;

        st->low <<= 8;
        st->low += UL_deposit_l((int16_t)ptr[(*bp)++]);
        assert(st->low < (1U << 24));
    }
    st->BER_detect = 0;
}

/* o  : Decoded cumulative frequency    */
static __forceinline int16_t ac_decode(Decoder_State *st, /* i/o: Decoder State                   */
                                         int16_t            pki)
{
    int16_t  val, r;

    st->tmp = UL_lshr_pos(st->range, 10);
    val = 0;

    r = val + 8;
    if(st->low >= (UL_Mpy_32_32(st->tmp, ari_spec_cumfreq[pki][r])))
        val = r;

    r = val + 4;
    if(st->low >= (UL_Mpy_32_32(st->tmp, ari_spec_cumfreq[pki][r])))
        val = r;

    r = val + 2;
    if(st->low >= (UL_Mpy_32_32(st->tmp, ari_spec_cumfreq[pki][r])))
        val = r;

    r = val + 1;
    if(st->low >= (UL_Mpy_32_32(st->tmp, ari_spec_cumfreq[pki][r])))
    {
        val = r;
        if (val == 15)
        {
            if(st->low >= (UL_Mpy_32_32(st->tmp, ari_spec_cumfreq[pki][16])))
                val = 16;

            if(st->low >= (st->tmp << 10))
                st->BER_detect = 1;
        }
    }
    return val;
}

/* o  : Decoded cumulative frequency    */
static __forceinline int16_t ac_decode_tns_order(Decoder_State *st, /* i/o: Decoder State                   */
                                                int16_t            enable_lpc_weighting)
{
    int16_t  val, r;

    st->tmp = UL_lshr_pos(st->range, 10);
    val = 0; 

    r = val + 4;
    if(st->low >= (UL_Mpy_32_32(st->tmp, plus_ac_tns_order_cumfreq[enable_lpc_weighting][r])))
        val = r;

    r = val + 2;
    if(st->low >= (UL_Mpy_32_32(st->tmp, plus_ac_tns_order_cumfreq[enable_lpc_weighting][r])))
        val = r;

    r = val + 1;
    if(st->low >= (UL_Mpy_32_32(st->tmp, plus_ac_tns_order_cumfreq[enable_lpc_weighting][r])))
        val = r;

    if(st->low >= (st->tmp << 10))
        st->BER_detect = 1;

    return val;
}

 /* o  : Decoded cumulative frequency    */
static __forceinline int16_t ac_decode_tns_coef(Decoder_State *st, /* i/o: Decoder State                   */
                                               int16_t            pki)
{
    int16_t  val, r;

    st->tmp = UL_lshr_pos(st->range, 10);
    val = 0;

    r = val + 8;
    if(st->low >= (UL_Mpy_32_32(st->tmp, plus_ac_tns_coef_cumfreq[pki][r])))
        val = r;

    r = val + 4;
    if(st->low >= (UL_Mpy_32_32(st->tmp, plus_ac_tns_coef_cumfreq[pki][r])))
        val = r;

    r = val + 2;
    if(st->low >= (UL_Mpy_32_32(st->tmp, plus_ac_tns_coef_cumfreq[pki][r])))
        val = r;

    r = val + 1;
    if(st->low >= (UL_Mpy_32_32(st->tmp, plus_ac_tns_coef_cumfreq[pki][r])))
    {
        val = r;
        if (val == 15)
        {
            if(st->low >= (UL_Mpy_32_32(st->tmp, plus_ac_tns_coef_cumfreq[pki][16])))
                val = 16;

            if(st->low >= (st->tmp << 10))
                st->BER_detect = 1;
        }
    }
    return val;
}

static __forceinline int16_t ac_dec_update(uint8_t *ptr, int16_t *bp, int16_t *bp_side, int16_t *mask_side, int16_t cur_bin,
                                             Decoder_State *st, /* i/o: Decoder State */
                                             uint32_t cum_freq, /* i  : Cumulative frequency    */
                                             uint32_t sym_freq  /* i  : Symbol frequency        */
)
{
    uint32_t UL_tmp;

    assert(st->tmp < (1U << 24));
    assert(cum_freq < (1U << 24));

    UL_tmp = cum_freq * st->tmp;
    assert(UL_tmp < (1U << 24));

    st->low = st->low -UL_tmp;
    assert(st->low < (1U << 24));

    st->range = (st->tmp * sym_freq);

    assert(st->range < (1U << 24));
    /* updated to 16 from 24 */
    while(st->range < (1U << 16))
    {
        st->low =((st->low) & (0xFFFF)); /*  make sure upshift doe not lead to more than 24 bits */
        assert(st->low < 1U << 16);

        if (check_pc_bytes(bp, bp_side, mask_side, cur_bin, 1, &st->pc) != 0) 
            return 1;

        /*shift in 8 bits */
	 st->low <<=  8;	
        st->low += (int16_t)ptr[(*bp)++];

        assert(st->low < (1U << 24));

        st->range <<= 8;
        assert(st->range < (1U << 24));
    }
    return 0;
}

static __forceinline void pc_init(int16_t n_pc, int16_t numbytes, int16_t be_bp_left, int16_t be_bp_right, int16_t L_spec,
                                     int16_t enc, int16_t bfi, Pc_State *pc /* i/o: Pc State */
)
{
    pc->inv_bin     = L_spec + 1;
    pc->numbytes    = numbytes;
    pc->c_bp        = 0;
    pc->c_bp_side   = 0;
    pc->bytes       = (n_pc + 1) >> 1;
    pc->b_left      = numbytes + 1;
    pc->b_right     = -1;
    pc->enc         = enc;
    pc->bfi         = bfi;
    pc->be_bp_left  = shr(be_bp_left, 3);
    pc->be_bp_right = shr(be_bp_right, 3);
    assert(pc->be_bp_right < pc->bytes || pc->bytes == 0);
}

static __forceinline int16_t check_pc_bytes(int16_t *bp, int16_t *bp_side, int16_t *mask_side, int16_t cur_bin, int16_t from_left,
                                           Pc_State *pc /* i/o: Pc State */)
{
    int16_t bp_local, bp_side_local, offset;

    if (pc->bytes > 0)
    {
        if ((from_left == 0) && (*mask_side) != 1)
            return 0;

        bp_local = *bp;
        bp_side_local = *bp_side;

        if (from_left != 0)
        {
            if ((*mask_side) == 1)
                bp_side_local += 1;
        }
        else
            bp_local -= 1;

        if (pc->b_right < 0)
        {
            offset = -1;
            if (pc->enc == 0)
                offset += pc->bytes;

            if (add(bp_side_local, sub(offset, bp_local)) == pc->bytes)
            {
                pc->b_left = bp_local + 1;
                pc->b_right = bp_side_local - 1;
                if (pc->enc != 0)
                {
                    assert(pc->b_right-pc->b_left+1 == pc->bytes);
                    return 1;
                }
            }
        }

        if ((pc->enc == 0) && (pc->b_right >= 0))
        {
            if ((from_left != 0) && ((*bp) == pc->b_left))
            {
                *bp = 0;
                pc->c_bp = 1;
            }
            if (from_left == 0 && (bp_side_local == pc->b_right))
            {
                *bp_side = pc->bytes -1;
                pc->c_bp_side = 1;
            }
            if (pc->bfi == 2)
            {
                if (((pc->c_bp != 0) && ((*bp) >= pc->be_bp_left)) || ((pc->c_bp_side != 0) && ((*bp_side) <= pc->be_bp_right)))
                {
                    pc->inv_bin = cur_bin;
                    return 1;
                }
                else if (((pc->c_bp != 0) && ((*bp) >= 0)) || ((pc->c_bp_side != 0) && (((*bp_side)+1) <= pc->bytes)))
                {
                    pc->inv_bin = min(pc->inv_bin, cur_bin);
                    return 0;
                }
            }
        }
    }

    return 0;
}

