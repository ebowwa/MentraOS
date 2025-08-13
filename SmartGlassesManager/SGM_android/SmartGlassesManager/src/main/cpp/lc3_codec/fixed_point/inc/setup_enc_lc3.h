
#ifndef SETUP_ENC_LC3_H
#define SETUP_ENC_LC3_H

#include "constants.h"

/* Channel state and bitrate-derived values go in this struct */
typedef struct
{
    int16_t *stEnc_mdct_mem; /* MDCT_MEM_LEN_MAX */
    int32_t *mdct_mem32;     /* MDCT_MEM_LEN_MAX */
    int32_t  targetBitsOff;
    int16_t  targetBytes;
    int16_t  total_bits;
    int16_t  targetBitsInit;
    int16_t  targetBitsAri;
    int16_t  enable_lpc_weighting;
    int16_t  ltpf_enable;
    int16_t  quantizedGainOff;
    int16_t  tns_bits;
    int16_t  targetBitsQuant;
    int16_t  olpa_mem_s6k4_exp;
    int16_t  olpa_mem_pitch;
    int16_t  ltpf_mem_in_exp;
    int16_t  ltpf_mem_normcorr;
    int16_t  ltpf_mem_mem_normcorr;
    int16_t  ltpf_mem_ltpf_on;
    int16_t  ltpf_mem_pitch;
    int16_t  mem_targetBits;
    int16_t  mem_specBits;
    int16_t  x_exp;
    int16_t  resamp_exp;
    int16_t  attack_handling; /* flag to enable attack handling */
    int16_t  attdec_filter_mem[2];
    int16_t  attdec_detected;
    int16_t  attdec_position;
    int32_t  attdec_acc_energy;
    int16_t  attdec_scaling;
    int32_t  resamp_mem32[60];
    int32_t  r12k8_mem_50[2];
    int16_t  r12k8_mem_in[60];
    int16_t  r12k8_mem_out[24];
    int16_t  olpa_mem_s12k8[3];
    int16_t  olpa_mem_s6k4[LEN_6K4 + MAX_PITCH_6K4];
    int16_t  ltpf_mem_in[LTPF_MEMIN_LEN + LEN_12K8 + 1];
    int16_t n_pccw;
    int16_t n_pc;
} EncSetup;

/* Constants and sampling rate derived values go in this struct */
struct LC3_Enc
{
    EncSetup *    channel_setup[MAX_CHANNELS];
    const int16_t *W_fx;
    const int16_t *bands_offset;

    int32_t fs;           /* encoder sampling rate 44.1 -> 48 */
    int32_t fs_in;        /* input sampling rate */
    int32_t bitrate;      /* global bitrate */
    int16_t fs_idx;       /* sampling rate index */
    int16_t frame_length; /* audio samples / frame */
    int16_t channels;     /* number of channels */
    int16_t epmode;       /* error protection mode */
    int16_t frame_dms;    /* frame length in dms (decimilliseconds, 10^-4)*/
    int8_t  lc3_br_set;   /* indicate if bitrate has been set */

    int16_t yLen;
    int16_t W_size;
    int16_t la_zeroes;
    int16_t stEnc_mdct_mem_len;
    int16_t bands_number;
    int16_t nSubdivisions;
    int16_t ltpf_mem_in_len;
    int16_t envelope_bits;
    int16_t global_gain_bits;
    int16_t noise_fac_bits;
    int16_t BW_cutoff_bits;
    int16_t r12k8_mem_in_len;
    int16_t r12k8_mem_out_len;

    int16_t epmr;
    int16_t combined_channel_coding;
    int32_t bandwidth;
    int16_t bw_ctrl_cutoff_bin;
    int16_t bw_index;
};

#endif
