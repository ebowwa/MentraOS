
#include "defines.h"
#include "rom_basop_util.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "enhUL32.h"


/* channel coder specific constants and macros */
#define RS16_CW_LEN_MAX 15

#define FEC_N_MODES 4
#define FEC_N_SYNDROMES_MAX 6
#define FEC_N_ERR_POS_MAX 3
#define FEC_N_ELP_COEFF_MAX 4
#define FEC_N_ERR_SYMB_MAX 3
#define FEC_N_MODE_DETECTION_CW 6

#define SYNDROME_IDX(mode_index, cw_index) (((mode_index)*FEC_N_MODE_DETECTION_CW + (cw_index)) * FEC_N_SYNDROMES_MAX)
#define ELP_IDX(mode_index, cw_index) (((mode_index)*FEC_N_MODE_DETECTION_CW + (cw_index)) * FEC_N_ELP_COEFF_MAX)
#define ERR_POS_IDX(mode_index, cw_index) (((mode_index)*FEC_N_MODE_DETECTION_CW + (cw_index)) * FEC_N_ERR_POS_MAX)
#define ERR_SYMB_IDX(mode_index, cw_index) (((mode_index)*FEC_N_MODE_DETECTION_CW + (cw_index)) * FEC_N_ERR_SYMB_MAX)
#define DEG_ELP_IDX(mode_index, cw_index) ((mode_index)*FEC_N_MODE_DETECTION_CW + (cw_index))

#define FEC_TOTAL_SYNDROME_SIZE (FEC_N_SYNDROMES_MAX * FEC_N_MODES * FEC_N_MODE_DETECTION_CW)
#define FEC_TOTAL_ELP_SIZE (FEC_N_ELP_COEFF_MAX * FEC_N_MODES * FEC_N_MODE_DETECTION_CW)
#define FEC_TOTAL_ERR_POS_SIZE (FEC_N_ERR_POS_MAX * FEC_N_MODES * FEC_N_MODE_DETECTION_CW)
#define FEC_TOTAL_ERROR_SIZE (FEC_N_ERR_SYMB_MAX * FEC_N_MODES * FEC_N_MODE_DETECTION_CW)
#define FEC_TOTAL_DEG_ELP_SIZE (FEC_N_MODES * FEC_N_MODE_DETECTION_CW)

/* debugging switches */

/* constants concerning mode detection */
#define EP_RISK_THRESH_NS_M 21990
#define EP_RISK_THRESH_NS_E -23
#define EP_RISK_THRESH_OS_M 25166
#define EP_RISK_THRESH_OS_E -10

#define SIMPLE_FLOAT_1_MANTISSA 16384

#define FEC_STATIC static

/* DISCLAIMER: Strict instrumentation of GF16 arithmetic would have to take into account
 * the initial conversion of the arguments from uint8_t to int16_t (one move16() per argument).
 * Behind this is the assumption that one would store GF16 elements in int16_t for strict BASOP
 * implementation.
 */
#define GF16_MUL(a, b) (uint8_t)(gf16_mult_table[s_or((a), shl((b), 4))])
#define GF16_MUL0(a, b) (uint8_t)(gf16_mult_table[s_or((a), (b))])
#define GF16_ADD(a, b) (uint8_t) s_xor((a), (b))

/* tables for finite field arithmetic */
/* tables for arithmetic in GF(16)  *
 * generator polynomial: 19
 * unit group generator (g): 2
 */

static const uint8_t gf16_g_pow[16] = {1, 2, 4, 8, 3, 6, 12, 11, 5, 10, 7, 14, 15, 13, 9, 1};
/* g_pow[i] contains g^i*/

static const uint8_t gf16_log_g[16] = {255, 0, 1, 4, 2, 8, 5, 10, 3, 14, 9, 7, 6, 13, 11, 12};
/* log_g[n] contains contains the value i such that g^i = n for n=1, 2, ..., 15, log_g[0] is set to 255 */

static const uint8_t gf16_inv_table[16] = {255, 1, 9, 14, 13, 11, 7, 6, 15, 2, 12, 5, 10, 4, 3, 8};
/* gf16_inv_table[n] contains the multiplicative inverse of n in GF(16) (1/0 is set to 255)*/

/* RS16 generating polynomials (from lowest to highest coefficient without leading 1)*/

static const uint8_t rs16_gp_d3[] = {8, 6};
static const uint8_t rs16_gp_d5[] = {7, 8, 12, 13};
static const uint8_t rs16_gp_d7[] = {12, 10, 12, 3, 9, 7};

/* FEC mode signaling polynomials */

#define EP_SIG_POLY_DEG 12

static const uint8_t sig_polys[4][15] = {{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
                                        {7, 15, 5, 6, 14, 9, 1, 3, 12, 10, 13, 3, 2, 0, 0},
                                        {7, 11, 14, 1, 2, 3, 12, 11, 6, 15, 7, 6, 12, 0, 0},
                                        {6, 15, 12, 2, 9, 15, 2, 8, 12, 3, 10, 5, 4, 0, 0}};

static const uint8_t sig_poly_syndr[4][6] = {
    {0, 0, 0, 0, 0, 0}, {0, 4, 5, 11, 5, 8}, {0, 5, 9, 0, 1, 7}, {0, 12, 5, 12, 9, 8}};

/* bit count table for error report (0000 0001 0010 0011 0100 0101 0110 0111 1000 1001 1010 1011 1100 1101 1110 1111) */

static const uint8_t rs16_bit_count_table[] = {0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4};

/* List of RS16 generators by Hamming distance */

static const uint8_t *const rs16_gp_by_hd[8] = {NULL, NULL, NULL, rs16_gp_d3, NULL, rs16_gp_d5, NULL, rs16_gp_d7};

/* fec config data */

static const uint8_t hamming_distance_by_mode0[] = {1, 3, 3, 5, 7};
static const uint8_t hamming_distance_by_mode1[] = {1, 1, 3, 5, 7};

static const uint8_t crc1_bytes_by_mode0[] = {0, 3, 2, 2, 2};
static const uint8_t crc1_bytes_by_mode1[] = {0, 3, 3, 3, 3};
static const uint8_t crc2_bytes_by_mode[]  = {0, 0, 2, 2, 2};

/* fec mode risk table */
typedef struct
{
    uint32_t mantissa;
    int16_t  exponent;
} simple_float;

static const simple_float risk_table_f[4][4] = {{{16384, 0}, {16384, 0}, {16384, 0}, {16384, 0}},
                                                {{16384, -8}, {26880, -1}, {16384, 0}, {16384, 0}},
                                                {{16384, -16}, {26880, -9}, {20475, -2}, {16384, 0}},
                                                {{16384, -24}, {26880, -17}, {20475, -10}, {19195, -4}}};
/* bit error limits for slot size 40 */
static int16_t const low_br_max_bit_errors_by_mode[] = {0, 0, 3, 9, 18};

/*
corresponding float values:
    {1.f, 1.f, 1.f, 1.f},
    {0.00390625f, 0.820312f, 1.f, 1.f},
    {1.52588e-05f, 0.00320435f, 0.312424f, 1.f},
    {5.96046e-08f, 1.2517e-05f, 0.00122041f, 0.0732243f}
*/

/* internal encoder routines */

FEC_STATIC void fec_interleave_pack(uint8_t *out, uint8_t *in, int16_t n_nibbles, int16_t n_codewords);

FEC_STATIC void rs16_enc(uint8_t *iobuf, int16_t codeword_length, int16_t hamming_distance, int16_t fec_mode,
                         int16_t signal_mode);

/* internal decoder routines */

FEC_STATIC void fec_deinterleave_unpack(uint8_t *out, uint8_t *in, int16_t n_nibbles, int16_t n_codewords);

FEC_STATIC int16_t fec_data_preproc(int16_t mode, int16_t epmr, uint8_t *iobuf, uint8_t *cw_buf, int16_t data_bytes,
                                   int16_t slot_bytes, int16_t pc_split);

FEC_STATIC void fec_data_postproc(int16_t mode, int16_t *epmr, uint8_t *iobuf, int16_t data_bytes, uint8_t *cw_buf,
                                  int16_t slot_bytes, int16_t pc_split, int32_t *bfi);

FEC_STATIC int32_t rs16_detect_and_correct(uint8_t *iobuf, int32_t n_symb, int32_t n_codewords, int16_t *epmr, int16_t *error_report,
                                       int32_t *bfi, uint8_t *array_of_trust, int32_t ccc_flag_flag, int16_t *n_pccw, void *scratch);

FEC_STATIC void rs16_calculate_six_syndromes(uint8_t *syndromes, uint8_t *cw, int32_t cw_poly_deg);

FEC_STATIC void rs16_calculate_four_syndromes(uint8_t *syndromes, uint8_t *cw, int32_t cw_poly_deg);

FEC_STATIC void rs16_calculate_two_syndromes(uint8_t *syndromes, uint8_t *cw, int32_t cw_poly_deg);

FEC_STATIC int8_t rs16_calculate_elp(uint8_t *elp, uint8_t *syndromes, int16_t hamming_distance);

FEC_STATIC int16_t rs16_factorize_elp(uint8_t *error_locations, uint8_t *elp, int16_t deg_elp, int16_t max_pos);

FEC_STATIC void rs16_calculate_errors(uint8_t *errors, uint8_t *err_pos, uint8_t *syndromes, int8_t deg_elp, int8_t t);

/* auxiliary routines */

FEC_STATIC int16_t crc1(uint8_t *data, int16_t data_size, int16_t epmr, uint8_t *hash, int16_t hash_size, int16_t check);

FEC_STATIC int16_t fec_estimate_epmr_from_cw0(uint8_t *cw0, int8_t *t, uint8_t *syndromes, uint8_t *elp, int8_t *deg_elp,
                                            uint8_t *err_pos, uint8_t *err_symb, int16_t n_codewords, int16_t n_symb);

FEC_STATIC void dw0_bitswap(uint8_t *dw0, int16_t mode, int16_t slot_bytes);

FEC_STATIC int16_t cw0_get_epmr(uint8_t *cw0, int16_t epmr_position);

FEC_STATIC int16_t dw0_get_epmr(uint8_t *dw0, int16_t mode, int16_t slot_size);

FEC_STATIC int16_t crc2(uint8_t *data, int16_t data_size, uint8_t *hash, int16_t hash_size, int16_t check);

FEC_STATIC simple_float simple_float_mul(simple_float op1, simple_float op2);

FEC_STATIC int16_t simple_float_cmp(simple_float op1, simple_float op2);

FEC_STATIC int16_t get_total_crc_size(int16_t slot_bytes, int16_t fec_mode, int16_t pc_split);

FEC_STATIC int16_t get_n_codewords(int16_t slot_bytes);

FEC_STATIC int16_t get_codeword_length(int16_t n_codewords, int16_t slot_nibbles, int16_t codeword_index);


int16_t fec_get_n_pccw(int16_t slot_bytes, int16_t fec_mode, int16_t ccc_flag)
{
    int16_t n_pccw;

    if (sub(fec_mode, 3) == 0)
    {
        n_pccw = round_fx(L_sub(L_mult(2636, slot_bytes), 117377));
    }
    else if (sub(fec_mode, 4) == 0)
    {
        n_pccw = round_fx(L_sub(L_mult(2178, slot_bytes), 129115));
    }
    else
    {
        n_pccw = 0; 
    }

    if (ccc_flag == 1 || sub(slot_bytes, 80) < 0)
    {
        n_pccw = 0; 
    }

    return n_pccw;
}

FEC_STATIC int16_t get_total_crc_size(int16_t slot_bytes, int16_t fec_mode, int16_t pc_split)
{
    int16_t n_crc;

    n_crc = crc1_bytes_by_mode1[fec_mode]; 
    if (sub(slot_bytes, 40) == 0)
    {
        n_crc = crc1_bytes_by_mode0[fec_mode]; 
    }

    if (pc_split > 0)
    {
        n_crc = add(n_crc, crc2_bytes_by_mode[fec_mode]);
    }
    return n_crc;
}

FEC_STATIC int16_t get_n_codewords(int16_t slot_bytes)
{
    int16_t i;

    slot_bytes = shl(slot_bytes, 1);

    for(i = 0; slot_bytes > 0; i++)
    {
        slot_bytes = sub(slot_bytes, RS16_CW_LEN_MAX);
    }

    return i;
}

FEC_STATIC int16_t get_codeword_length(int16_t n_codewords, int16_t slot_nibbles, int16_t codeword_index)
{
    int16_t i;

    slot_nibbles = sub(slot_nibbles, add(codeword_index, 1));
    slot_nibbles = sub(slot_nibbles, i_mult(n_codewords, 13));

    for(i = 12; slot_nibbles >= 0; i++)
    {
        slot_nibbles = sub(slot_nibbles, n_codewords);
    }

    return add(i, 1);
}

/* Encoder */

int16_t fec_get_data_size(int16_t fec_mode, int16_t ccc_flag, int16_t slot_bytes)
/* not time critical */
{
    int16_t n_codewords, payload_size;

    n_codewords = get_n_codewords(slot_bytes);

    assert(n_codewords == (2 * slot_bytes + RS16_CW_LEN_MAX - 1) / RS16_CW_LEN_MAX);
    payload_size = slot_bytes; 

    if (fec_mode > 0)
    {
        if (fec_mode == 1)
        {
            payload_size = sub(payload_size, 1);
        }
        else
        {
            payload_size = sub(payload_size, i_mult(sub(fec_mode, 1), n_codewords));
        }
        if (slot_bytes == 40)
        {
            payload_size = sub(payload_size, crc1_bytes_by_mode0[fec_mode]); 
        }
        else
        {
            payload_size = sub(payload_size, crc1_bytes_by_mode1[fec_mode]); 
        }

        if (ccc_flag == 0 && fec_mode > 2 && slot_bytes >= 80)
        {
            payload_size = sub(payload_size, crc2_bytes_by_mode[fec_mode]);
        }
    }

    return payload_size;
}

int16_t fec_get_n_pc(int16_t fec_mode, int16_t n_pccw, int16_t slot_bytes)
/* not time critical */
{
    int16_t n_codewords, pc_split, tmp;
    int32_t    i;

    n_codewords = get_n_codewords(slot_bytes);

    assert(n_codewords == (2 * slot_bytes + RS16_CW_LEN_MAX - 1) / RS16_CW_LEN_MAX);
    pc_split = i_mult(i_mult(n_pccw, -2), sub(fec_mode, 1));

    if (fec_mode == 1 || slot_bytes < 80)
    {
        pc_split = 0; 
    }
    else
    {
        for(i = 0; i < n_pccw; i++)
        {
            tmp = get_codeword_length(n_codewords, add(slot_bytes, slot_bytes), sub(n_codewords, i + 1));
            assert(tmp == (2 * slot_bytes + i) / n_codewords);
            pc_split = add(pc_split, tmp);
        }
    }

    return pc_split;
}

/* functions for EPMR handling */
FEC_STATIC void dw0_bitswap(uint8_t *dw0, int16_t mode, int16_t slot_bytes)
/* swap epmr bits with bits that will be positioned at 30 and 32 in code word 0 */
{
    uint8_t tmp;
    int32_t    ind0, ind1, position;

    position = sub(get_codeword_length(get_n_codewords(slot_bytes), shl(slot_bytes, 1), 0), 1);

    if (sub(slot_bytes, 40) == 0)
    {
        ind0 = sub(shl(crc1_bytes_by_mode0[mode], 1), 1);
    }
    else
    {
        ind0 = sub(shl(crc1_bytes_by_mode1[mode], 1), 1);
    }

    ind1 = sub(position, sub(hamming_distance_by_mode0[mode], 1));

    /* swap bits 2 and 3 of dw0[ind0] with bits 0 and 1 of dw0[ind1] */
    tmp = (uint8_t) s_and(shr(dw0[ind0],2), 3);
    dw0[ind0] = (uint8_t) s_and(dw0[ind0], 3);
    dw0[ind0] = (uint8_t) s_or(dw0[ind0], shl(s_and(dw0[ind1], 3),2));
    dw0[ind1] = (uint8_t) s_and(dw0[ind1], 12);
    dw0[ind1] = (uint8_t) s_or(dw0[ind1], tmp);

}

FEC_STATIC int16_t cw0_get_epmr(uint8_t *cw0, int16_t position)
{
    int16_t epmr;

    epmr = s_and(cw0[position], 3);

    return epmr;
}

FEC_STATIC int16_t dw0_get_epmr(uint8_t *dw0, int16_t mode, int16_t slot_size)
{
    int32_t    ncrc1;
    int16_t epmr;

    ncrc1 = crc1_bytes_by_mode1[mode];

    if (sub(slot_size, 40) == 0)
    {
        ncrc1 = crc1_bytes_by_mode0[mode];
    }

    epmr = shr(dw0[2 * ncrc1 - 1], 2);

    return epmr;
}

FEC_STATIC int16_t fec_data_preproc(int16_t mode, int16_t epmr, uint8_t *iobuf, uint8_t *cw_buf, int16_t data_bytes,
                                   int16_t slot_bytes, int16_t pc_split)
{
    int16_t data_offset, n_crc1, n_crc2, tmp;
    int32_t    i, j;

    tmp         = sub(slot_bytes, data_bytes);
    data_offset = add(tmp, tmp);

    /* extract and reverse data*/
    j = sub(add(slot_bytes, slot_bytes), 1);
    for(i = 0; i < data_bytes; i++)
    {
        cw_buf[j--] = (uint8_t)s_and(iobuf[i], 15); 
        cw_buf[j--] = (uint8_t)shr(iobuf[i], 4);    
    }

    /* add crc hashes */
    if (sub(slot_bytes, 40) == 0)
    {
        n_crc1 = crc1_bytes_by_mode0[mode]; 
    }
    else
    {
        n_crc1 = crc1_bytes_by_mode1[mode]; 
    }

    if (pc_split > 0 && sub(mode, 1) > 0)
    {
        n_crc2 = crc2_bytes_by_mode[mode]; 
    }
    else
    {
        n_crc2 = 0; 
    }

    if (n_crc2)
    {
        crc2(cw_buf + data_offset + 2 * data_bytes - pc_split, pc_split, cw_buf + data_offset - 2 * n_crc2, n_crc2, 0);
    }
    if (n_crc1)
    {
        crc1(cw_buf + data_offset, 2 * data_bytes - pc_split, epmr, cw_buf + data_offset - 2 * (n_crc1 + n_crc2), n_crc1,
             0);
    }

    tmp         = add(n_crc1, n_crc2);
    data_offset = sub(data_offset, add(tmp, tmp));

    dw0_bitswap(cw_buf + data_offset, mode, slot_bytes);

    return data_offset;
}

void fec_encoder(int16_t mode, int16_t epmr, uint8_t *iobuf, int16_t data_bytes, int16_t slot_bytes, int16_t n_pccw,
                 void *scratch)
{
    int16_t  n_codewords, codeword_length, hd, redundancy_nibbles, cw_offset, dw_offset, pc_split;
    int32_t     i, j;
    uint8_t *cw_buf;

    cw_offset = 0; 
    dw_offset = 0; 
    pc_split  = 0; 
    cw_buf    = scratch;

    n_codewords = get_n_codewords(slot_bytes);
    assert(n_codewords == (2 * slot_bytes + RS16_CW_LEN_MAX - 1) / RS16_CW_LEN_MAX);

    /* some sanity checks */
    {
        int32_t tmp = slot_bytes;
        assert((slot_bytes >= FEC_SLOT_BYTES_MIN && slot_bytes <= FEC_SLOT_BYTES_MAX) &&
               "fec_encoder: slot_bytes out of range");
        tmp -= mode == 1 ? 1 : n_codewords * (mode - 1);                                 // reed solomon redundancy
        tmp -= slot_bytes == 40 ? crc1_bytes_by_mode0[mode] : crc1_bytes_by_mode1[mode]; // crc1
        tmp -= (n_pccw > 0) && (mode > 1) ? crc2_bytes_by_mode[mode] : 0;                // crc2
        assert(data_bytes == tmp && "fec_encoder: inconsistent payload size");
        assert(n_codewords - n_pccw >= 6);
    }

    /* data preproc: re-ordering and hash extension */
    pc_split = fec_get_n_pc(mode, n_pccw, slot_bytes);

    dw_offset = fec_data_preproc(mode, epmr, iobuf, cw_buf, data_bytes, slot_bytes, pc_split);

    /* encoding of first data word*/
    hd                 = hamming_distance_by_mode0[mode]; 
    redundancy_nibbles = sub(hd, 1);
    codeword_length    = get_codeword_length(n_codewords, add(slot_bytes, slot_bytes), 0);

    assert(codeword_length == (2 * slot_bytes - 1) / n_codewords + 1);

    for(j = redundancy_nibbles; j < codeword_length; (j++, dw_offset++))
    {
        cw_buf[j] = cw_buf[dw_offset]; 
    }

    rs16_enc(cw_buf, codeword_length, hd, mode, 1);

    cw_offset = add(cw_offset, codeword_length);

    /* encoding of remaining data words */
    hd                 = hamming_distance_by_mode1[mode]; 
    redundancy_nibbles = sub(hd, 1);

    for(i = 1; i < n_codewords; i++)
    {
        codeword_length = get_codeword_length(n_codewords, add(slot_bytes, slot_bytes), i);

        assert(codeword_length == (2 * slot_bytes - i - 1) / n_codewords + 1);
        for(j = redundancy_nibbles; j < codeword_length; (j++, dw_offset++))
        {
            cw_buf[cw_offset + j] = cw_buf[dw_offset]; 
        }

        rs16_enc(cw_buf + cw_offset, codeword_length, hd, mode, sub(i, 6) < 0);

        cw_offset = add(cw_offset, codeword_length);
    }

    assert(cw_offset == 2 * slot_bytes && dw_offset == 2 * slot_bytes);

    fec_interleave_pack(iobuf, cw_buf, add(slot_bytes, slot_bytes), n_codewords);


}

FEC_STATIC void rs16_enc(uint8_t *iobuf, int16_t codeword_length, int16_t hamming_distance, int16_t fec_mode,
                         int16_t signal_mode)
/* expects (data polynomial) * x^(hamming_distance - 1) in iobuf */
{

    uint8_t const *gp;
    uint8_t        shift_buffer[RS16_CW_LEN_MAX + 1], lc;
    int32_t           i, j, deg_gp;

    memset(shift_buffer, 0, sizeof(shift_buffer));
    gp     = rs16_gp_by_hd[hamming_distance]; 
    deg_gp = sub(hamming_distance, 1);

    if (sub(hamming_distance, 1) > 0)
    {
        assert(codeword_length > deg_gp);

        /* initialize redundancy part to zero */
        memset(iobuf, 0, deg_gp);

        /* initialize shift_buffer */
        memmove(shift_buffer + 1, iobuf + codeword_length - deg_gp, deg_gp);

        /* calculate remainder */
        for(i = codeword_length - deg_gp - 1; i >= 0; i--)
        {
            shift_buffer[0] = iobuf[i];                             
            lc              = (uint8_t)shl(shift_buffer[deg_gp], 4); 
            for(j = deg_gp - 1; j >= 0; j--)
            {
                shift_buffer[j + 1] = GF16_ADD(shift_buffer[j], GF16_MUL0(gp[j], lc)); 
            }
        }

        /* add remainder to shifted data polynomial */
        for(i = 0; i < deg_gp; i++)
        {
            iobuf[i] = shift_buffer[i + 1]; 
        }

        /* add signaling polynomial */
        if (signal_mode)
        {
            assert(codeword_length > EP_SIG_POLY_DEG);
            for(i = 0; i <= EP_SIG_POLY_DEG; i++)
            {
                iobuf[i] = GF16_ADD(iobuf[i], sig_polys[fec_mode - 1][i]); 
            }
        }
    }

}

FEC_STATIC void fec_interleave_pack(uint8_t *out, uint8_t *in, int16_t n_nibbles, int16_t n_codewords)
{
    int16_t out_offset, cw_offset, codeword_length;
    int32_t    i, j;

    out_offset = 0; 
    cw_offset  = 0; 

    /* initialize output buffer to zero */
    memset(out, 0, shr(n_nibbles, 1));

    /* interleave and pack codewords */
    for(i = 0; i < n_codewords; i++)
    {
        codeword_length = get_codeword_length(n_codewords, n_nibbles, i);

        assert(codeword_length == (n_nibbles - i - 1) / n_codewords + 1);
        for(j = 0; j < codeword_length; j++)
        {
            out_offset = add(i_mult(j, n_codewords), i);
            out_offset = sub(n_nibbles, add(out_offset, 1));
            out[out_offset >> 1] =
                (uint8_t)s_or(out[out_offset >> 1], shl(in[cw_offset], shl(s_and(out_offset, 1), 2))); 
            cw_offset = add(cw_offset, 1);
        }
    }

    assert(cw_offset == n_nibbles);
}

/* Decoder */
FEC_STATIC void fec_data_postproc(int16_t mode, int16_t *epmr, uint8_t *obuf, int16_t data_bytes, uint8_t *cw_buf,
                                  int16_t slot_bytes, int16_t pc_split, int32_t *bfi)
{
    int16_t i;
    int16_t n_crc1, n_crc2;
    int16_t cw_buf_len;
    int16_t tmp_epmr;

    n_crc1 = crc1_bytes_by_mode1[mode]; 
    if (sub(slot_bytes, 40) == 0)
    {
        n_crc1 = crc1_bytes_by_mode0[mode]; 
    }

    n_crc2 = 0; 
    if (pc_split > 0)
    {
        n_crc2 = crc2_bytes_by_mode[mode]; 
    }

    assert(n_crc1 == (slot_bytes == 40 ? crc1_bytes_by_mode0[mode] : crc1_bytes_by_mode1[mode]));
    assert(n_crc2 == ((pc_split > 0) && (mode > 1) ? crc2_bytes_by_mode[mode] : 0));

    cw_buf_len = 2 * (data_bytes + n_crc1 + n_crc2);

    if (sub(mode, 1))
    {
        /* reverse bit-swap */
        dw0_bitswap(cw_buf, mode, slot_bytes);
        tmp_epmr = dw0_get_epmr(cw_buf, mode, slot_bytes);

        if (crc1(cw_buf + shl(add(n_crc1, n_crc2), 1), sub(shl(data_bytes, 1), pc_split), tmp_epmr, cw_buf, n_crc1, 1))
        {
            *bfi = 1; 

            return;
        }
        else
        {
            *epmr = tmp_epmr;
        }
    }

    
    if (pc_split > 0 && sub(*bfi, 2) != 0)
    {
        if (crc2(cw_buf + sub(shl(add(data_bytes, add(n_crc1, n_crc2)), 1), pc_split), pc_split,
                 cw_buf + shl(n_crc1, 1), n_crc2, 1))
        {
            *bfi = 2; 
        }
    }

    for(i = 0; i < data_bytes; i++)
    {
        obuf[i] = (uint8_t)s_or(cw_buf[cw_buf_len - 2 * i - 1], shl(cw_buf[cw_buf_len - 2 * i - 2], 4)); 
    }
}

int32_t fec_decoder(uint8_t *iobuf, int16_t slot_bytes, int32_t *data_bytes, int16_t *epmr, int16_t ccc_flag, int16_t *n_pccw,
                int32_t *bfi, int16_t *be_bp_left, int16_t *be_bp_right, int16_t *n_pc, int16_t *m_fec, void *scratch)
{
    uint8_t *my_scratch;
    uint8_t *cw_buf;
    uint8_t *array_of_trust;
    int16_t  i, j;
    int16_t  cw_offset, dw_offset;
    int16_t  n_codewords, redundancy_nibbles, codeword_length;
    int16_t  mode, error_report;
    int16_t  n_crc;
    int16_t  first_bad_cw;
    int16_t  pc_split;

    if (*bfi == 1)
    {
        return -1;
    }

    if (slot_bytes < FEC_SLOT_BYTES_MIN || slot_bytes > FEC_SLOT_BYTES_MAX)
    {
        *bfi = 1;
        return -1;
    }

    my_scratch = (uint8_t *)scratch; 
    cw_buf     = my_scratch;        
    my_scratch += 2 * slot_bytes;

    if (ccc_flag == 0)
    {
        *be_bp_left = -1; 
        *be_bp_right = -1; 
    }

    n_codewords = get_n_codewords(slot_bytes);

    array_of_trust = my_scratch; 
    my_scratch += n_codewords;

    /* extract and de-interleave nibbles */
    fec_deinterleave_unpack(cw_buf, iobuf, 2 * slot_bytes, n_codewords);

    /* mode detection and error correction */
    mode = rs16_detect_and_correct(cw_buf, 2 * slot_bytes, n_codewords, epmr, &error_report, bfi, array_of_trust,
                                   ccc_flag, n_pccw, (void *)my_scratch);

    /* for normal slots the maximal number of bit errors is limited */
    
#ifndef APPLY_MAX_ERRORS
    if (sub(slot_bytes, 40) == 0 && mode > 0)
    {
        if (sub(error_report, low_br_max_bit_errors_by_mode[mode]) > 0)
        {
            mode = -1; 
            *bfi = 1;  
        }
    }
#endif
    
    if (sub(*bfi, 1) == 0)
    {
        *data_bytes = 0; 

        return error_report;
    }

    /* initialization for decoding */
    *data_bytes = fec_get_data_size(mode, ccc_flag, slot_bytes); 
    pc_split    = fec_get_n_pc(mode, *n_pccw, slot_bytes);
    n_crc       = get_total_crc_size(slot_bytes, mode, pc_split);

    /* decoding of first code word */
    redundancy_nibbles = sub(hamming_distance_by_mode0[mode], 1);
    codeword_length    = get_codeword_length(n_codewords, add(slot_bytes, slot_bytes), 0);

    dw_offset = 0; 
    cw_offset = 0; 

    for(j = redundancy_nibbles; j < codeword_length; j++)
    {
        cw_buf[dw_offset++] = cw_buf[j]; 
    }
    cw_offset = add(cw_offset, codeword_length);

    /* decoding of remaining code words */
    redundancy_nibbles = sub(hamming_distance_by_mode1[mode], 1);

    for(i = 1; i < n_codewords; i++)
    {
        codeword_length = get_codeword_length(n_codewords, add(slot_bytes, slot_bytes), i);

        for(j = redundancy_nibbles; j < codeword_length; j++)
        {
            cw_buf[dw_offset++] = cw_buf[j + cw_offset]; 
        }

        cw_offset = add(cw_offset, codeword_length);
    }

    assert(2 * (*data_bytes + n_crc) == dw_offset && 2 * slot_bytes == cw_offset);

    /* data postproc: hash validation and re-ordering */

    fec_data_postproc(mode, epmr, iobuf, *data_bytes, cw_buf, slot_bytes, pc_split, bfi);

    if (sub(*bfi, 1) == 0)
    {
        *data_bytes = 0; 
        return error_report;
    }

    if (*bfi == 2)
    {
        first_bad_cw            = 0; 
        array_of_trust[*n_pccw] = 0; 
        while(array_of_trust[first_bad_cw] != 0)
        {
            first_bad_cw = add(first_bad_cw, 1);
        }
        if (sub(first_bad_cw, *n_pccw) == 0)
        {
            /* this is the case when CRC failed */
            *be_bp_left = 0; 
        }
        else
        {
            *be_bp_left = extract_l(L_mult0(fec_get_n_pc(mode, first_bad_cw, slot_bytes), 4)); 
        }

        for(i = *n_pccw - 1; i >= 0; i--)
        {
            if (!array_of_trust[i])
            {
                break;
            }
        }
        if (i < 0)
        {
            i = sub(*n_pccw, 1);
        }
        *be_bp_right = sub(extract_l(L_mult0(fec_get_n_pc(mode, i+1, slot_bytes), 4)), 1); 

    }

    if (ccc_flag == 0)
    {
        *n_pc  = pc_split; 
        *m_fec = mode;     
    }

    return error_report;
}

FEC_STATIC void fec_deinterleave_unpack(uint8_t *out, uint8_t *in, int16_t n_nibbles, int16_t n_codewords)
{
    int16_t in_offset, out_offset, codeword_length;
    int32_t    i, j;

    in_offset  = 0; 
    out_offset = 0; 

    /* unpack nibbles in input buffer and deinterleave codewords */
    for(i = 0; i < n_codewords; i++)
    {
        codeword_length = get_codeword_length(n_codewords, n_nibbles, i);
        for(j = 0; j < codeword_length; (j++, out_offset++))
        {
            in_offset       = add(i_mult(j, n_codewords), i);
            in_offset = sub(n_nibbles, add(in_offset, 1));
            out[out_offset] = (uint8_t)s_and(shr(in[in_offset >> 1], shl(s_and(in_offset, 1), 2)), 15); 
        }
    }

    assert(out_offset == n_nibbles);
}

FEC_STATIC int16_t fec_estimate_epmr_from_cw0(uint8_t *cw0, int8_t *t, uint8_t *syndromes, uint8_t *elp, int8_t *deg_elp,
                                            uint8_t *err_pos, uint8_t *err_symb, int16_t n_codewords, int16_t n_symb)
{
    int32_t    epmr_lowest_risk_exp;
    int32_t    start, inc, i, n_candidates;
    int32_t    first_codeword_length;
    int32_t    mode_counter;
    int16_t epmr;

    epmr_lowest_risk_exp   = 0;
    first_codeword_length = get_codeword_length(n_codewords, n_symb, 0);
    start                 = 2;
    inc                   = 1;
    n_candidates          = 0;

    /* test if first code word decodes in mode 0 or 1 without error correction */
    
    if (s_or(syndromes[SYNDROME_IDX(0, 0)], syndromes[SYNDROME_IDX(0, 0) + 1]) == 0 ||
        s_or(syndromes[SYNDROME_IDX(1, 0)], syndromes[SYNDROME_IDX(1, 0) + 1]) == 0)
    {
        epmr_lowest_risk_exp = risk_table_f[1][0].exponent; 
    }
    /* test if first code word decodes in mode 2 or 3 with lower risk */
    if (sub(deg_elp[DEG_ELP_IDX(2, 0)], t[2]) <= 0)
    {
        if (add(risk_table_f[2][deg_elp[DEG_ELP_IDX(2, 0)]].exponent, 8) <= 0)
        {
            n_candidates++;
            start = 2;
        }
    }

    if (sub(deg_elp[DEG_ELP_IDX(3, 0)], t[3]) <= 0)
    {
        if (add(risk_table_f[3][deg_elp[DEG_ELP_IDX(3, 0)]].exponent, 8) <= 0)
        {
            n_candidates++;
            start = 3;
        }
    }

    if (sub(n_candidates, 1) > 0)
    {
        /* decide on order if mode 2 and 3 are considered */
        if (simple_float_cmp(risk_table_f[2][deg_elp[DEG_ELP_IDX(2, 0)]], risk_table_f[3][deg_elp[DEG_ELP_IDX(3, 0)]]) <
            0)
        {
            start = 2;
            inc   = 1;
        }
        else
        {
            start = 3;
            inc   = -1;
        }
    }

    for((mode_counter = start, i = 0); i < n_candidates; (mode_counter += inc, i++))
    {
        if (sub(risk_table_f[mode_counter][deg_elp[DEG_ELP_IDX(mode_counter, 0)]].exponent, epmr_lowest_risk_exp) < 0)
        {
            if (!rs16_factorize_elp(err_pos + ERR_POS_IDX(mode_counter, 0), elp + ELP_IDX(mode_counter, 0),
                                    deg_elp[DEG_ELP_IDX(mode_counter, 0)], sub(first_codeword_length, 1)))
            {
                /* code word is decodable with error correction */
                epmr_lowest_risk_exp = risk_table_f[mode_counter][deg_elp[DEG_ELP_IDX(mode_counter, 0)]].exponent;

                rs16_calculate_errors(err_symb + ERR_SYMB_IDX(mode_counter, 0), err_pos + ERR_POS_IDX(mode_counter, 0),
                                      syndromes + SYNDROME_IDX(mode_counter, 0), deg_elp[DEG_ELP_IDX(mode_counter, 0)],
                                      t[mode_counter]);

                for(i = 0; i < deg_elp[DEG_ELP_IDX(mode_counter, 0)]; i++)
                {
                    cw0[err_pos[ERR_POS_IDX(mode_counter, 0) + i]] = GF16_ADD(
                        cw0[err_pos[ERR_POS_IDX(mode_counter, 0) + i]], err_symb[ERR_SYMB_IDX(mode_counter, 0) + i]);
                }
                break;
            }
        }
    }

    epmr = cw0_get_epmr(cw0, sub(first_codeword_length, 1));

    if (add(epmr_lowest_risk_exp, 16) > 0)
    {
        epmr = add(epmr, 4); 
    }
    if (add(epmr_lowest_risk_exp, 8) > 0)
    {
        epmr = add(epmr, 4); 
    }

    return epmr;
}

FEC_STATIC int32_t rs16_detect_and_correct(uint8_t *iobuf, int32_t n_symb, int32_t n_codewords, int16_t *epmr, int16_t *error_report,
                                       int32_t *bfi, uint8_t *array_of_trust, int32_t ccc_flag, int16_t *n_pccw, void *scratch)
{
    uint8_t *      syndromes;
    uint8_t *      elp;
    uint8_t *      err_pos;
    uint8_t *      err_symb;
    int8_t         t[FEC_N_MODES];
    int8_t *       deg_elp;
    uint8_t *      my_scratch;
    uint8_t        blacklist[FEC_N_MODES];
    uint8_t const *hamming_distance;

    int16_t       i, cw_counter, mode_counter, cw_offset;
    int16_t       codeword_length;
    int16_t       mode;
    int16_t       mode_candidates[4];
    int16_t       n_mode_candidates;
    int16_t       broken_cw, n_broken_cw;
    int16_t       j, idx_min;
    int16_t       n_pccw0;
    simple_float val_min_f;
    int16_t       tmp;
    int16_t       epmr_position;
    simple_float dec_risk_f[FEC_N_MODES];
    simple_float risk_min_f;
    simple_float ep_risk_thresh;

    int32_t epmr_dec_fail_increment;

    void (*syndr_calc[3])(uint8_t *, uint8_t *, int32_t);

    /* initialization */
    blacklist[0]        = 0; 
    blacklist[1]        = 0; 
    blacklist[2]        = 0; 
    blacklist[3]        = 0; 
    my_scratch          = (uint8_t *)scratch;
    hamming_distance    = &hamming_distance_by_mode0[1];
    mode                = -1;                      
    n_mode_candidates   = 0;                       
    risk_min_f.mantissa = SIMPLE_FLOAT_1_MANTISSA; 
    risk_min_f.exponent = 0;                       
    
    if (n_symb <= 80)
    {
    ep_risk_thresh.mantissa = EP_RISK_THRESH_NS_M; 
    ep_risk_thresh.exponent = EP_RISK_THRESH_NS_E; 
    }
    else
    {
    ep_risk_thresh.mantissa = EP_RISK_THRESH_OS_M; 
    ep_risk_thresh.exponent = EP_RISK_THRESH_OS_E; 
    }
    
    syndr_calc[0] = &rs16_calculate_two_syndromes;
    syndr_calc[1] = &rs16_calculate_four_syndromes;
    syndr_calc[2] = &rs16_calculate_six_syndromes;
    
    for(i = 0; i < FEC_N_MODES; i++)
    {
    t[i] = (int8_t)shr(sub(hamming_distance[i], 1), 1); 
    }
    
    syndromes = my_scratch;
    my_scratch += FEC_TOTAL_SYNDROME_SIZE;
    elp = my_scratch;
    my_scratch += FEC_TOTAL_ELP_SIZE;
    err_pos = my_scratch;
    my_scratch += FEC_TOTAL_ERR_POS_SIZE;
    err_symb = my_scratch;
    my_scratch += FEC_TOTAL_ERROR_SIZE;
    deg_elp = (int8_t *)my_scratch;
    my_scratch += FEC_TOTAL_DEG_ELP_SIZE;
    
    *error_report = 0; 
    *bfi          = 0; 
    
    /* mode detection (stage 1) */
    codeword_length = get_codeword_length(n_codewords, n_symb, 0);
    
    epmr_position = sub(codeword_length, 1);
    
    rs16_calculate_two_syndromes(syndromes + SYNDROME_IDX(0, 0), iobuf, sub(codeword_length, 1));
    
    if (s_or(syndromes[0 + SYNDROME_IDX(0, 0)], syndromes[1 + SYNDROME_IDX(0, 0)]) == 0)
    {
    
    /* data validation for fec mode 1 */
    *epmr = cw0_get_epmr(iobuf, epmr_position);
    
    dw0_bitswap(iobuf + 2, 1, n_symb / 2);
    
    if (!crc1(iobuf + 8, sub(n_symb, 8), *epmr, iobuf + 2, 3, 1))
    {
        mode = 0; 
        
        return add(mode, 1);
    }
    else
    {
        /* reverse bit swap */
        dw0_bitswap(iobuf + 2, 1, n_symb / 2);
        
        *epmr = add(*epmr, 4); 
    }
    }
    
    blacklist[0] = 1; 
    
    /* mode detection (stage 2) */
    
    /* calculate syndromes of code words 0 to 5 and modes 1 to 3 */
    cw_offset = 0; 
    
    for(cw_counter = 0; cw_counter < 6; cw_counter++)
    {
    codeword_length = get_codeword_length(n_codewords, n_symb, cw_counter);
    
    rs16_calculate_six_syndromes(syndromes + SYNDROME_IDX(1, cw_counter), iobuf + cw_offset,
                     sub(codeword_length, 1));
    
    cw_offset = add(cw_offset, codeword_length);
    
    for(mode_counter = FEC_N_MODES - 1; mode_counter >= 1; mode_counter--)
    {
        for(i = 0; i < sub(hamming_distance[mode_counter], 1); i++)
        {
        syndromes[SYNDROME_IDX(mode_counter, cw_counter) + i] = GF16_ADD(
            syndromes[SYNDROME_IDX(1, cw_counter) + i], sig_poly_syndr[mode_counter][i]); 
        }
    }
    }

    /* check for valid code words */
    for(mode_counter = 1; mode_counter < FEC_N_MODES; mode_counter++)
    {
    n_broken_cw = 0;
    for(cw_counter = 0; cw_counter < 6; cw_counter++)
    {
        broken_cw = 0;
        for(i = 0; i < sub(hamming_distance[mode_counter], 1); i++)
        {
        broken_cw = s_or(broken_cw, syndromes[SYNDROME_IDX(mode_counter, cw_counter) + i]); 
        }
        if (broken_cw != 0)
        {
        n_broken_cw = add(n_broken_cw, 1);
        }
    }
    
    if (n_broken_cw == 0)
    {
        mode      = mode_counter; 
        cw_offset = 0;            
        
        *epmr = cw0_get_epmr(iobuf, epmr_position);
        
        for(cw_counter = 0; cw_counter < 6; cw_counter++)
        {
        codeword_length = get_codeword_length(n_codewords, n_symb, cw_counter);
        for(i = 0; i <= EP_SIG_POLY_DEG; i++)
        {
            iobuf[cw_offset + i] = GF16_ADD(iobuf[cw_offset + i], sig_polys[mode][i]);
        }
        cw_offset = add(cw_offset, codeword_length);
        }
    }
    }
    
    if (mode < 0) /* mode hasn't been detected so far -> errors occurred in transmission */
    {
    /* calculate error locator polynomials for code words 0 to 5 */
    for(mode_counter = 1; mode_counter < FEC_N_MODES; mode_counter++)
    {
        for(cw_counter = 0; cw_counter < 6; cw_counter++)
        {
        deg_elp[DEG_ELP_IDX(mode_counter, cw_counter)] = rs16_calculate_elp(
            elp + ELP_IDX(mode_counter, cw_counter), syndromes + SYNDROME_IDX(mode_counter, cw_counter),
            t[mode_counter]); 
        if (sub(deg_elp[DEG_ELP_IDX(mode_counter, cw_counter)], t[mode_counter]) > 0)
        {
            blacklist[mode_counter] = 1; 
            break;
        }
        }
    }
    
    /* risk analysis for mode candidate selection */
    for(mode_counter = 1; mode_counter < FEC_N_MODES; mode_counter++)
    {
        dec_risk_f[mode_counter].mantissa = SIMPLE_FLOAT_1_MANTISSA; 
        dec_risk_f[mode_counter].exponent = 0;                       
        
        if (blacklist[mode_counter] == 0)
        {
        for(cw_counter = 0; cw_counter < 6; cw_counter++)
        {
            dec_risk_f[mode_counter] = simple_float_mul(
            dec_risk_f[mode_counter],
            risk_table_f[mode_counter][deg_elp[DEG_ELP_IDX(mode_counter, cw_counter)]]); 
        }
        
        if (simple_float_cmp(dec_risk_f[mode_counter], ep_risk_thresh) <= 0)
        {
            mode_candidates[n_mode_candidates++] = mode_counter; 
        }
        
        if (simple_float_cmp(dec_risk_f[mode_counter], risk_min_f) < 0)
        {
            risk_min_f = dec_risk_f[mode_counter]; 
        }
        }
    }
    assert(n_mode_candidates <= 4); // suppress false gcc warning when OPTIM=3
    
    /* sort mode candidates by risk */
    for(i = 0; i < n_mode_candidates; i++)
    {
        idx_min   = i;                              
        val_min_f = dec_risk_f[mode_candidates[i]]; 
        
        for(j = i + 1; j < n_mode_candidates; j++)
        {
        if (simple_float_cmp(dec_risk_f[mode_candidates[j]], val_min_f) < 0)
        {
            val_min_f = dec_risk_f[mode_candidates[j]]; 
            idx_min   = j;                              
        }
        }
        
        if (sub(idx_min, i) > 0)
        {    
        tmp                      = mode_candidates[i];       
        mode_candidates[i]       = mode_candidates[idx_min]; 
        mode_candidates[idx_min] = tmp;                      
        }
    }
    
    /* try out candidate modes */
    for(i = 0; i < n_mode_candidates; i++)
    {
        mode = mode_candidates[i]; 
        
        for(cw_counter = 0; cw_counter < 6; cw_counter++)
        {
        codeword_length = get_codeword_length(n_codewords, n_symb, cw_counter);
        
        if (deg_elp[DEG_ELP_IDX(mode, cw_counter)])
        {
            if (rs16_factorize_elp(err_pos + ERR_POS_IDX(mode, cw_counter), elp + ELP_IDX(mode, cw_counter),
                       deg_elp[DEG_ELP_IDX(mode, cw_counter)], sub(codeword_length, 1)))
            {
            /* elp did not split into distinct linear factors or error position was out of range */
            mode = -1; 
            break;
            }
        }
        }
        if (mode > 0)
        {
        /* decodable mode with lowest risk has been found */
        break;
        }
    }
    
    if (mode < 0)
    {
        /* no decodable mode has been found */
        *error_report = -1; 
        *bfi          = 1;  
        mode          = -1; 
        
        *epmr = fec_estimate_epmr_from_cw0(iobuf, t, syndromes, elp, deg_elp, err_pos, err_symb, n_codewords,
                           n_symb);
        
        return mode;
    }
    
    /* perform error correction */
    cw_offset     = 0; 
    *error_report = 0; 
    for(cw_counter = 0; cw_counter < 6; cw_counter++)
    {
        codeword_length = get_codeword_length(n_codewords, n_symb, cw_counter);
        
        if (deg_elp[DEG_ELP_IDX(mode, cw_counter)])
        {
        rs16_calculate_errors(
            err_symb + ERR_SYMB_IDX(mode, cw_counter), err_pos + ERR_POS_IDX(mode, cw_counter),
            syndromes + SYNDROME_IDX(mode, cw_counter), deg_elp[DEG_ELP_IDX(mode, cw_counter)], t[mode]);
        
        /* correct errors and sum up number of corrected bits */
        for(i = 0; i < deg_elp[DEG_ELP_IDX(mode, cw_counter)]; i++)
        {
            iobuf[err_pos[ERR_POS_IDX(mode, cw_counter) + i] + cw_offset] =
            GF16_ADD(iobuf[err_pos[ERR_POS_IDX(mode, cw_counter) + i] + cw_offset],
                 err_symb[ERR_SYMB_IDX(mode, cw_counter) + i]);
            *error_report = add(*error_report,
                rs16_bit_count_table[err_symb[ERR_SYMB_IDX(mode, cw_counter) + i]]); 
        }
        }
        
        for(i = 0; i <= EP_SIG_POLY_DEG; i++)
        {
        iobuf[cw_offset + i] = GF16_ADD(iobuf[cw_offset + i], sig_polys[mode][i]);
        }
        cw_offset = add(cw_offset, codeword_length);
    }
    
    /* set epmr according to risk value of cw0 */
    epmr_dec_fail_increment = 8;
    
    if (add(risk_table_f[mode][deg_elp[DEG_ELP_IDX(mode, 0)]].exponent, 8) <= 0)
    {
        epmr_dec_fail_increment = sub(epmr_dec_fail_increment, 4);
    }
    if (add(risk_table_f[mode][deg_elp[DEG_ELP_IDX(mode, 0)]].exponent, 16) <= 0)
    {
        epmr_dec_fail_increment = sub(epmr_dec_fail_increment, 4);
    }
    
    *epmr = cw0_get_epmr(iobuf, epmr_position) + epmr_dec_fail_increment;
    }
    
    /* mode has been successfully detected -> now check and try to correct remaining code words*/
    *n_pccw = fec_get_n_pccw(n_symb / 2, mode + 1, ccc_flag);
    if (ccc_flag == 0)
    {
    n_pccw0 = fec_get_n_pccw(n_symb / 2, mode + 1, ccc_flag);
    *n_pccw = n_pccw0;
    }
    else
    {
    n_pccw0 = 0;
    }
    
    for(cw_counter = 6; cw_counter < n_codewords; cw_counter++)
    {
    /* usual error correction scheme: syndromes -> elp's, errors, etc. */
    codeword_length                              = get_codeword_length(n_codewords, n_symb, cw_counter);
    array_of_trust[n_codewords - 1 - cw_counter] = 1; 
    
    syndr_calc[sub(t[mode], 1)](syndromes, iobuf + cw_offset, sub(codeword_length, 1));
    
    deg_elp[0] = rs16_calculate_elp(elp, syndromes, t[mode]); 
    
    if (sub(deg_elp[0], t[mode]) > 0)
    {
        cw_offset = add(cw_offset, codeword_length);
        if (cw_counter < n_codewords - n_pccw0)
        {
        *error_report = -1; 
        mode          = -1; 
        *bfi          = 1;  
        
        break;
        }
        else
        {
        *bfi                                         = 2; 
        array_of_trust[n_codewords - 1 - cw_counter] = 0; 
        continue;
        }
    }
    
    if (deg_elp[0])
    {
        if (rs16_factorize_elp(err_pos, elp, deg_elp[0], sub(codeword_length, 1)))
        {
        cw_offset = add(cw_offset, codeword_length);
        if (add(n_pccw0, sub(cw_counter, n_codewords)) < 0)
        {
            mode = -1; 
            *bfi = 1;  
            
            break;
        }
        else
        {
            *bfi                                         = 2; 
            array_of_trust[n_codewords - 1 - cw_counter] = 0; 
            continue;
        }
        }
        
        rs16_calculate_errors(err_symb, err_pos, syndromes, deg_elp[0], t[mode]);
        
        /* correct errors and sum up number of corrected bits */
        for(i = 0; i < deg_elp[0]; i++)
        {
        iobuf[err_pos[i] + cw_offset] = GF16_ADD(iobuf[err_pos[i] + cw_offset], err_symb[i]);
        *error_report                 = add(*error_report, rs16_bit_count_table[err_symb[i]]);
        }
    }
    cw_offset = add(cw_offset, codeword_length);
    if (add(risk_table_f[mode][deg_elp[0]].exponent, 16) > 0)
    {
        array_of_trust[n_codewords - 1 - cw_counter] = 0; 
    }
    }
    
    if (mode >= 0)
    {
    return add(mode, 1);
    }
    
    return -1;
}

FEC_STATIC void rs16_calculate_six_syndromes(uint8_t *syndromes, uint8_t *cw, int32_t cw_poly_deg)
{
    int32_t    i;
    uint8_t buffer[15];

    assert(cw_poly_deg >= 12);

    for(i = 0; i <= cw_poly_deg; i++)
    {
        buffer[i] = cw[i]; 
    }

    syndromes[0] = buffer[0]; 
    syndromes[1] = buffer[0]; 
    syndromes[2] = buffer[0]; 
    syndromes[3] = buffer[0]; 
    syndromes[4] = buffer[0]; 
    syndromes[5] = buffer[0]; 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[1], 32));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[1], 64));  
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[1], 128)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[1], 48));  
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[1], 96));  
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[1], 192)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[2], 64));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[2], 48));  
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[2], 192)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[2], 80));  
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[2], 112)); 
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[2], 240)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[3], 128)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[3], 192)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[3], 160)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[3], 240)); 
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[3], 16));  
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[3], 128)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[4], 48));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[4], 80));  
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[4], 240)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[4], 32));  
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[4], 96));  
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[4], 160)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[5], 96));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[5], 112)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[5], 16));  
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[5], 96));  
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[5], 112)); 
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[5], 16));  

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[6], 192)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[6], 240)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[6], 128)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[6], 160)); 
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[6], 16));  
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[6], 192)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[7], 176)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[7], 144)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[7], 192)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[7], 208)); 
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[7], 96));  
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[7], 240)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[8], 80));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[8], 32));  
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[8], 160)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[8], 64));  
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[8], 112)); 
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[8], 128)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[9], 160)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[9], 128)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[9], 240)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[9], 192)); 
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[9], 16));  
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[9], 160)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[10], 112)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[10], 96));  
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[10], 16));  
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[10], 112)); 
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[10], 96));  
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[10], 16));  

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[11], 224)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[11], 176)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[11], 128)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[11], 144)); 
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[11], 112)); 
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[11], 192)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[12], 240)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[12], 160)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[12], 192)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[12], 128)); 
    syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[12], 16));  
    syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[12], 240)); 

    if (sub(cw_poly_deg, 13) >= 0)
    {
        syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[13], 208)); 
        syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[13], 224)); 
        syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[13], 160)); 
        syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[13], 176)); 
        syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[13], 96));  
        syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[13], 128)); 
    }

    if (sub(cw_poly_deg, 14) >= 0)
    {
        syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[14], 144)); 
        syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[14], 208)); 
        syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[14], 240)); 
        syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[14], 224)); 
        syndromes[4] = GF16_ADD(syndromes[4], GF16_MUL0(buffer[14], 112)); 
        syndromes[5] = GF16_ADD(syndromes[5], GF16_MUL0(buffer[14], 160)); 
    }

}

FEC_STATIC void rs16_calculate_four_syndromes(uint8_t *syndromes, uint8_t *cw, int32_t cw_poly_deg)
{
    int32_t    i;
    uint8_t buffer[15];

    assert(cw_poly_deg >= 12);

    for(i = 0; i <= cw_poly_deg; i++)
    {
        buffer[i] = cw[i]; 
    }

    syndromes[0] = buffer[0]; 
    syndromes[1] = buffer[0]; 
    syndromes[2] = buffer[0]; 
    syndromes[3] = buffer[0]; 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[1], 32));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[1], 64));  
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[1], 128)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[1], 48));  

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[2], 64));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[2], 48));  
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[2], 192)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[2], 80));  

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[3], 128)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[3], 192)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[3], 160)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[3], 240)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[4], 48));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[4], 80));  
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[4], 240)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[4], 32));  

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[5], 96));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[5], 112)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[5], 16));  
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[5], 96));  

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[6], 192)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[6], 240)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[6], 128)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[6], 160)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[7], 176)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[7], 144)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[7], 192)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[7], 208)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[8], 80));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[8], 32));  
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[8], 160)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[8], 64));  

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[9], 160)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[9], 128)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[9], 240)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[9], 192)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[10], 112)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[10], 96));  
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[10], 16));  
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[10], 112)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[11], 224)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[11], 176)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[11], 128)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[11], 144)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[12], 240)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[12], 160)); 
    syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[12], 192)); 
    syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[12], 128)); 

    if (sub(cw_poly_deg, 13) >= 0)
    {
        syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[13], 208)); 
        syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[13], 224)); 
        syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[13], 160)); 
        syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[13], 176)); 
    }

    if (sub(cw_poly_deg, 14) >= 0)
    {
        syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[14], 144)); 
        syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[14], 208)); 
        syndromes[2] = GF16_ADD(syndromes[2], GF16_MUL0(buffer[14], 240)); 
        syndromes[3] = GF16_ADD(syndromes[3], GF16_MUL0(buffer[14], 224)); 
    }

}

FEC_STATIC void rs16_calculate_two_syndromes(uint8_t *syndromes, uint8_t *cw, int32_t cw_poly_deg)
{
    int32_t    i;
    uint8_t buffer[15];

    assert(cw_poly_deg >= 12);

    for(i = 0; i <= cw_poly_deg; i++)
    {
        buffer[i] = cw[i]; 
    }

    syndromes[0] = buffer[0]; 
    syndromes[1] = buffer[0]; 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[1], 32)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[1], 64)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[2], 64)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[2], 48)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[3], 128)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[3], 192)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[4], 48)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[4], 80)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[5], 96));  
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[5], 112)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[6], 192)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[6], 240)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[7], 176)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[7], 144)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[8], 80)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[8], 32)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[9], 160)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[9], 128)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[10], 112)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[10], 96));  

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[11], 224)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[11], 176)); 

    syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[12], 240)); 
    syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[12], 160)); 

    if (sub(cw_poly_deg, 13) >= 0)
    {
        syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[13], 208)); 
        syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[13], 224)); 
    }

    if (sub(cw_poly_deg, 14) >= 0)
    {
        syndromes[0] = GF16_ADD(syndromes[0], GF16_MUL0(buffer[14], 144)); 
        syndromes[1] = GF16_ADD(syndromes[1], GF16_MUL0(buffer[14], 208)); 
    }

}

FEC_STATIC int8_t rs16_calculate_elp(uint8_t *elp, uint8_t *syndromes, int16_t t)
/* calculates error locator polynomial vie Petterson's algorithm */
{
    int8_t  ret;
    uint8_t det, det_inv, aux, all_s, *s;
    uint8_t s22, s33, s44, s13, s14, s15;
    uint8_t s23, s24, s25, s34, s35;
    uint8_t a, b, c, d, e, f;

    ret    = 0;         
    all_s  = 0;         
    s      = syndromes; 
    elp[0] = 1;         
    memset(elp + 1, 0, 3);

    switch (t)
    {
    case 3:
    {
        /* check for errors */
        all_s = (uint8_t)s_or(s[0], s_or(s[1], s_or(s[2], s_or(s[3], s_or(s[4], s[5])))));

        if (all_s == 0)
        {
            break;
        }

        /* assume 3 errors */
        s22 = GF16_MUL(s[1], s[1]);
        s33 = GF16_MUL(s[2], s[2]);
        s44 = GF16_MUL(s[3], s[3]);
        s13 = GF16_MUL(s[0], s[2]);

        det = GF16_ADD(GF16_ADD(GF16_MUL(s13, s[4]), GF16_MUL(s44, s[0])),
                       GF16_ADD(GF16_MUL(s22, s[4]), GF16_MUL(s33, s[2])));

        if (det)
        {
            det_inv = (uint8_t)shl(gf16_inv_table[det], 4);

            s14 = GF16_MUL(s[0], s[3]);
            s15 = GF16_MUL(s[0], s[4]);

            s23 = GF16_MUL(s[1], s[2]);
            s24 = GF16_MUL(s[1], s[3]);
            s25 = GF16_MUL(s[1], s[4]);

            s34 = GF16_MUL(s[2], s[3]);
            s35 = GF16_MUL(s[2], s[4]);

            a = GF16_ADD(s35, s44) << 4;
            b = GF16_ADD(s15, s33) << 4;
            c = GF16_ADD(s13, s22) << 4;
            d = GF16_ADD(s34, s25) << 4;
            e = GF16_ADD(s23, s14) << 4;
            f = GF16_ADD(s24, s33) << 4;

            aux    = GF16_ADD(GF16_ADD(GF16_MUL0(a, s[3]), GF16_MUL0(d, s[4])), GF16_MUL0(f, s[5]));
            elp[3] = GF16_MUL0(aux, det_inv);

            aux    = GF16_ADD(GF16_ADD(GF16_MUL0(d, s[3]), GF16_MUL0(b, s[4])), GF16_MUL0(e, s[5]));
            elp[2] = GF16_MUL0(aux, det_inv);

            aux    = GF16_ADD(GF16_ADD(GF16_MUL0(f, s[3]), GF16_MUL0(e, s[4])), GF16_MUL0(c, s[5]));
            elp[1] = GF16_MUL0(aux, det_inv);

            if (elp[3] == 0)
            {
                ret = (int8_t) add(t, 1);
            }
            else
            {
                ret = 3; 
            }
            break;
        }

        /* assume two errors */
        det = GF16_ADD(GF16_MUL(syndromes[0], syndromes[2]), GF16_MUL(syndromes[1], syndromes[1]));

        if (det)
        {
            det_inv = (uint8_t)shl(gf16_inv_table[det], 4);

            aux    = GF16_ADD(GF16_MUL(syndromes[1], syndromes[2]), GF16_MUL(syndromes[0], syndromes[3]));
            elp[1] = GF16_MUL0(aux, det_inv);

            aux    = GF16_ADD(GF16_MUL(syndromes[2], syndromes[2]), GF16_MUL(syndromes[1], syndromes[3]));
            elp[2] = GF16_MUL0(aux, det_inv);

            /* check remaining LSF relations */
            aux = (uint8_t)s_or(GF16_ADD(GF16_ADD(GF16_MUL(elp[2], s[2]), GF16_MUL(elp[1], s[3])), s[4]),
                               GF16_ADD(GF16_ADD(GF16_MUL(elp[2], s[3]), GF16_MUL(elp[1], s[4])), s[5]));

            aux = (uint8_t)s_or(aux, elp[2] == 0);

            if (aux != 0)
            {
                ret = (int8_t) add(t, 1);
            }
            else
            {
                ret = 2; 
            }
            break;
        }

        /* assume one error */
        if (syndromes[0] != 0)
        {
            elp[1] = GF16_MUL(syndromes[1], gf16_inv_table[syndromes[0]]);

            /* check remaining LSF relations */
            aux = (uint8_t)s_or(s_or(GF16_ADD(GF16_MUL(elp[1], s[1]), s[2]), GF16_ADD(GF16_MUL(elp[1], s[2]), s[3])),
                               s_or(GF16_ADD(GF16_MUL(elp[1], s[3]), s[4]), GF16_ADD(GF16_MUL(elp[1], s[4]), s[5])));

            aux = (uint8_t)s_or(aux, elp[1] == 0);

            if (aux != 0)
            {
                ret = (int8_t) add(t, 1);
            }
            else
            {
                ret = 1; 
            }
            break;
        }

        ret = (int8_t) add(t, 1);
        break;
    }
    case 2:
    {
        all_s = (uint8_t)s_or(s[0], s_or(s[1], s_or(s[2], s[3])));

        if (all_s == 0)
        {
            break;
        }

        /* assume two errors */
        det = GF16_ADD(GF16_MUL(syndromes[0], syndromes[2]), GF16_MUL(syndromes[1], syndromes[1]));

        if (det)
        {
            det_inv = (uint8_t)shl(gf16_inv_table[det], 4);

            aux    = GF16_ADD(GF16_MUL(syndromes[1], syndromes[2]), GF16_MUL(syndromes[0], syndromes[3]));
            elp[1] = GF16_MUL0(aux, det_inv);

            aux    = GF16_ADD(GF16_MUL(syndromes[2], syndromes[2]), GF16_MUL(syndromes[1], syndromes[3]));
            elp[2] = GF16_MUL0(aux, det_inv);

            if (elp[2] == 0)
            {
                ret = (int8_t) add(t, 1);
            }
            else
            {
                ret = 2; 
            }
            break;
        }

        /* assume one error */
        if (syndromes[0] != 0)
        {
            elp[1] = GF16_MUL(syndromes[1], gf16_inv_table[syndromes[0]]);

            /* check remaining LSF relation */
            aux = (uint8_t)s_or(GF16_ADD(GF16_MUL(elp[1], s[1]), s[2]), GF16_ADD(GF16_MUL(elp[1], s[2]), s[3]));
            aux = (uint8_t)s_or(aux, elp[1] == 0);
            if (aux != 0)
            {
                ret = (int8_t) add(t, 1);
            }
            else
            {
                ret = 1; 
            }
            break;
        }

        ret = (int8_t) add(t, 1);
        break;
    }
    case 1:
    {
        all_s = (uint8_t)s_or(s[0], s[1]);

        if (all_s == 0)
        {
            break;
        }

        if (syndromes[0] != 0)
        {
            elp[1] = GF16_MUL(syndromes[1], gf16_inv_table[syndromes[0]]);
            if (elp[1] == 0)
            {
                ret = (int8_t) add(t, 1);
            }
            else
            {
                ret = 1; 
            }
            break;
        }

        ret = (int8_t) add(t, 1);
        break;
    }
    default: assert(0 && "calculating elp of this degree not implemented");
    }

    return ret;
}

FEC_STATIC int16_t rs16_factorize_elp(uint8_t *err_pos, uint8_t *elp, int16_t deg_elp, int16_t max_pos)
{
    uint8_t beta, gamma;
    int16_t zeros, err_pos0, err_pos1, err_pos2, ret;

    beta  = 0; 
    gamma = 0; 
    zeros = 0; 
    ret   = 0; 

    switch (deg_elp)
    {
    case 0: break;

    case 1:
        err_pos0 = gf16_log_g[elp[1]]; 
        if (sub(err_pos0, max_pos) > 0)
        {
            ret = 1; 
            break;
        }

        err_pos[0] = (uint8_t)err_pos0; 
        break;

    case 2:
        zeros = rs16_elp_deg2_table[s_or(elp[1], shl(elp[2], 4))]; 
        if (zeros == 0)
        {
            return 1;
        }

        err_pos0 = s_and(zeros, 15);
        err_pos1 = s_and(shr(zeros, 4), 15);

        if (sub(err_pos0, max_pos) > 0 || sub(err_pos1, max_pos) > 0)
        {
            ret = 1; 
            break;
        }

        err_pos[0] = (uint8_t)err_pos0; 
        err_pos[1] = (uint8_t)err_pos1; 
        break;

    case 3:
        /* beta = a*a + b, gamma = a*b + c */
        beta  = GF16_ADD(GF16_MUL(elp[1], elp[1]), elp[2]);
        gamma = GF16_ADD(GF16_MUL(elp[1], elp[2]), elp[3]);
        zeros = rs16_elp_deg3_table[beta | gamma << 4];

        if (zeros == 0)
        /* elp does not split over GF(16) or has multiple zeros */
        {
            ret = 1; 
            break;
        }

        /* remove shift from zeros */
        err_pos0 = GF16_ADD(s_and(zeros, 15), elp[1]);
        err_pos1 = GF16_ADD(s_and(shr(zeros, 4), 15), elp[1]);
        err_pos2 = GF16_ADD(s_and(shr(zeros, 8), 15), elp[1]);

        if (err_pos0 == 0 || err_pos1 == 0 || err_pos2 == 0)
        {  
            return 1;
        }

        err_pos0 = gf16_log_g[err_pos0];
        err_pos1 = gf16_log_g[err_pos1];
        err_pos2 = gf16_log_g[err_pos2];

        if (sub(err_pos0, max_pos) > 0 || sub(err_pos1, max_pos) > 0 || sub(err_pos2, max_pos) > 0)
        {
             
            ret = 1; 
            break;
        }

        err_pos[0] = (uint8_t)err_pos0; 
        err_pos[1] = (uint8_t)err_pos1; 
        err_pos[2] = (uint8_t)err_pos2; 

        break;

    default: assert(0 && "invalid degree in rs16_error_locator");
    }

    return ret;
}

FEC_STATIC void rs16_calculate_errors(uint8_t *err_symb, uint8_t *err_pos, uint8_t *syndromes, int8_t deg_elp, int8_t t)
{
    uint8_t det_inv;
    uint8_t x0, x1, x2;
    uint8_t x0sq, x1sq, x2sq;
    uint8_t c0, c1, c2;
    uint8_t s0, s1, s2;
    uint8_t tmp;

    assert(deg_elp <= t);

    switch (deg_elp)
    {
    case 0: break;

    case 1:
        err_symb[0] = GF16_MUL(gf16_g_pow[15 - err_pos[0]], syndromes[0]); 

        break;

    case 2:
        s0 = (uint8_t)shl(syndromes[0], 4);
        s1 = (uint8_t)shl(syndromes[1], 4);

        x0 = gf16_g_pow[err_pos[0]]; 
        x1 = gf16_g_pow[err_pos[1]]; 

        x0sq = GF16_MUL(x0, x0);
        x1sq = GF16_MUL(x1, x1);

        tmp     = GF16_ADD(GF16_MUL(x0sq, x1), GF16_MUL(x1sq, x0));
        det_inv = (uint8_t)shl(gf16_inv_table[tmp], 4);

        tmp         = GF16_ADD(GF16_MUL0(x1sq, s0), GF16_MUL0(x1, s1));
        err_symb[0] = GF16_MUL0(tmp, det_inv); 

        tmp         = GF16_ADD(GF16_MUL0(x0sq, s0), GF16_MUL0(x0, s1));
        err_symb[1] = GF16_MUL0(tmp, det_inv); 

        break;

    case 3:
        s0 = (uint8_t)shl(syndromes[0], 4);
        s1 = (uint8_t)shl(syndromes[1], 4);
        s2 = (uint8_t)shl(syndromes[2], 4);

        x0 = gf16_g_pow[err_pos[0]]; 
        x1 = gf16_g_pow[err_pos[1]]; 
        x2 = gf16_g_pow[err_pos[2]]; 

        x0sq = GF16_MUL(x0, x0);
        x1sq = GF16_MUL(x1, x1);
        x2sq = GF16_MUL(x2, x2);

        tmp     = GF16_MUL(GF16_ADD(x1, x0), GF16_ADD(x2, x0));
        tmp     = GF16_MUL(GF16_ADD(x2, x1), tmp);
        det_inv = (uint8_t)shl(gf16_inv_table[tmp], 4);

        c0 = GF16_ADD(GF16_MUL(x1, x2sq), GF16_MUL(x2, x1sq));
        c1 = GF16_ADD(x2sq, x1sq);
        c2 = GF16_ADD(x2, x1);

        err_symb[0] = GF16_ADD(GF16_ADD(GF16_MUL0(c0, s0), GF16_MUL0(c1, s1)), GF16_MUL0(c2, s2)); 

        c0 = GF16_ADD(GF16_MUL(x0, x2sq), GF16_MUL(x2, x0sq));
        c1 = GF16_ADD(x2sq, x0sq);
        c2 = GF16_ADD(x2, x0);

        err_symb[1] = GF16_ADD(GF16_ADD(GF16_MUL0(c0, s0), GF16_MUL0(c1, s1)), GF16_MUL0(c2, s2)); 

        c0 = GF16_ADD(GF16_MUL(x0, x1sq), GF16_MUL(x1, x0sq));
        c1 = GF16_ADD(x1sq, x0sq);
        c2 = GF16_ADD(x1, x0);

        err_symb[2] = GF16_ADD(GF16_ADD(GF16_MUL0(c0, s0), GF16_MUL0(c1, s1)), GF16_MUL0(c2, s2)); 

        tmp         = GF16_MUL0(err_symb[0], det_inv);
        err_symb[0] = GF16_MUL(tmp, gf16_inv_table[x0]); 

        tmp         = GF16_MUL0(err_symb[1], det_inv);
        err_symb[1] = GF16_MUL(tmp, gf16_inv_table[x1]); 

        tmp         = GF16_MUL0(err_symb[2], det_inv);
        err_symb[2] = GF16_MUL(tmp, gf16_inv_table[x2]); 

        break;

    default: assert(0 && "method not implemented\n"); break;
    }

}

/* hash functions for data validation */

/* hamming distance 4 */
static const uint32_t crc14_mask[16] = {0,      17989,  35978,  51919,  71956,  89937,  103838, 119771,
                                       143912, 160877, 179874, 194791, 207676, 224633, 239542, 254451};

/* hamming distance 4 */
static const uint32_t crc22_mask[16] = {0,        4788009,  9576018,  14356859, 19152036, 23933837, 28713718, 33500639,
                                       33650273, 38304072, 43214899, 47867674, 52775621, 57427436, 62346391, 67001278};

FEC_STATIC int16_t crc1(uint8_t *data, int16_t data_size, int16_t epmr, uint8_t *hash, int16_t hash_size, int16_t check)
{
    uint32_t const *mask;
    int32_t            shift, i, fail;
    uint32_t        rem;

    fail = 0; 
    rem  = 0; 

    assert(hash_size > 0);

    switch (hash_size)
    {
    case 2:
        shift = 14;         
        mask  = crc14_mask; 
        break;
    case 3:
        shift = 22;         
        mask  = crc22_mask; 
        break;
    default:
        shift = 0;
        mask = 0;
        assert(0 && "crc hash size not implemented");
    }

    /* data array contains 4-bit words */
    for(i = data_size - 1; i >= 0; i--)
    {               
        rem = UL_xor((rem << 4), data[i]);
        rem = UL_xor(rem, mask[UL_and(UL_lshr(rem, shift), 15)]);
    }

    rem = UL_xor((rem << 4), (epmr << 2));
    rem = UL_xor(rem, mask[UL_and(UL_lshr(rem, shift), 15)]);

    for(i = 0; i < 2 * hash_size - 1; i++)
    {
        rem = (rem << 4);        
        rem = UL_xor(rem, mask[UL_and(UL_lshr(rem, shift), 15)]);
    }

    rem = UL_xor(rem, ((uint32_t)epmr << shift));

    if (check)
    {
        /* test hash value */
        for(i = 0; i < 2 * hash_size; i++)
        {
            fail = s_or(fail, UL_xor(hash[i], UL_and(UL_lshr(rem, shl(i, 2)), 15))); 
        }
    }
    else
    {
        /* write hash value */
        for (i = 0; i < 2 * hash_size; i++)
        {
            hash[i] = (uint8_t)UL_and(UL_lshr(rem, shl(i, 2)), 15); 
        }
    }

    return fail;
}

/* hamming distance = 4 */
static const uint32_t crc16_mask[16] = {0,      107243, 190269, 214486, 289937, 380538, 428972, 469319,
                                       579874, 621513, 671263, 761076, 832947, 857944, 938638, 1044581};

FEC_STATIC int16_t crc2(uint8_t *data, int16_t data_size, uint8_t *hash, int16_t hash_size, int16_t check)
{
    uint32_t const *mask;
    int32_t            shift, i, fail;
    uint32_t        rem;

    fail = 0; 
    rem  = 0; 

    assert(hash_size > 0);

    switch (hash_size)
    {
    case 2:
        shift = 16;         
        mask  = crc16_mask; 
        break;
    default:
        shift = 0;
        mask = 0;
        assert(0 && "crc hash size not implemented");
    }

    /* data array contains 4-bit words */
    for(i = data_size - 1; i >= 0; i--)
    {               
        rem = UL_xor((rem << 4), data[i]);
        
        rem = UL_xor(rem, mask[UL_and(UL_lshr(rem, shift), 15)]); 
    }

    for(i = 0; i < 2 * hash_size; i++)
    {
        rem = (rem << 4);        
        rem = UL_xor(rem, mask[UL_and(UL_lshr(rem, shift), 15)]); 
    }

    if (check)
    {
        /* test hash value */
        for(i = 0; i < 2 * hash_size; i++)
        {
            fail = s_or(fail, UL_xor(hash[i], UL_and(UL_lshr(rem, shl(i, 2)), 15))); 
        }
    }
    else
    {
        /* write hash value */
        for(i = 0; i < 2 * hash_size; i++)
        {
            hash[i] = (uint8_t)UL_and(UL_lshr(rem, shl(i, 2)), 15); 
        }
    }

    return fail;
}

/* simple float implementation */

FEC_STATIC simple_float simple_float_mul(simple_float op1, simple_float op2)
{
    simple_float rop;
    int32_t       aux;

    aux          = L_shr(L_mult0(op1.mantissa, op2.mantissa), 14);
    rop.exponent = add(op1.exponent, op2.exponent);
    if (L_and(aux, 32768L))
    {
        aux          = L_shr(aux, 1);
        rop.exponent = add(rop.exponent, 1);
    }
    rop.mantissa = extract_l(aux);
    return rop;
}

/* Auxiliary */

FEC_STATIC int16_t simple_float_cmp(simple_float op1, simple_float op2)
/* returns 1 if op1 > op2, 0 if op1 = op2, and -1 if op1 < op2 */
{
    int16_t rval;
    int16_t mdiff;
    int16_t ediff;

    rval = 0; 

    ediff = sub(op1.exponent, op2.exponent);
    mdiff = sub(op1.mantissa, op2.mantissa);

    if (ediff == 0)
    {
        if (mdiff > 0)
        {
            rval = 1;
        }
        if (mdiff < 0)
        {
            rval = -1;
        }
    }
    else
    {
        if (ediff > 0)
        {
            rval = 1;
        }
        if (ediff < 0)
        {
            rval = -1;
        }
    }

    return rval;
}


