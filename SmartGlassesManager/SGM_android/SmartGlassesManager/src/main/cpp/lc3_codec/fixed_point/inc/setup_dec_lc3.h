
#ifndef SETUP_DEC_LC3_H
#define SETUP_DEC_LC3_H

#include "constants.h"

typedef struct
{
    int16_t *x_old_tot_fx;      /* MAX_LEN_PCM_PLC_TOT    */
    int32_t *PhECU_f0est;       /* MAX_PLOCS            interpolated plocs  */
    int16_t *PhECU_xfp_fx;      /* MAX_LPROT */
    int16_t *PhECU_X_sav_fx;    /* MAX_LPROT */
    int16_t *PhECU_plocs;       /* MAX_PLOCS */
    int16_t *PhECU_fg_wintaper; /* MDCT_MEM_LEN_MAX */
    int16_t *PhECU_win_pre_tda; /* MAX_WIN_PRE_TDA */
    int16_t  tdc_gain_p;
    int32_t  tdc_gain_c;
    int16_t  stab_fac;
    int16_t  tdc_fract;
    int16_t  tdc_seed;
    int16_t  tdc_cum_damp;
    int16_t  tdc_preemph_fac;
    int16_t  tdc_lpc_order;
    int16_t  cum_fading_slow;
    int16_t  cum_fading_fast;
    int16_t  PhECU_LprotOrg_fx; /* needed to change the Prot size  adaptively  */
    int16_t  PhECU_Lprot_fx;
    int16_t  PhECU_fs_idx_fx;
    int16_t  PhECU_frame_ms;  /* needed in PLC_Update and PLCMain functons*/  
    int16_t  PhECU_seed_fx;
    int16_t  PhECU_xfp_exp_fx;
    int16_t  PhECU_time_offs;
    int16_t  PhECU_X_savQ_fx;
    int16_t  PhECU_num_plocs;
    int16_t  PhECU_f0hzLtpBinQ7; /*  ltp F0 in bins  if available  */
    int16_t  PhECU_short_flag_prev;
    int16_t  PhECU_whr_tot_taper;
    int16_t  PhECU_whr_tot_flat;
    int16_t  PhECU_LDWIN_OLAP;
    int16_t  PhECU_LA;
    int16_t  PhECU_t_adv;
    int16_t  PhECU_beta_mute;
    int16_t  norm_corrQ15_fx;
    int16_t  q_fx_old_exp;
    int16_t  max_len_pcm_plc;
    int16_t  max_lprot;
    int16_t  max_plocs;
    
    /* int32_t L_tot W_energy sum exponent */ 
    int16_t  PhECU_oold_Ltot_exp_fx; 
    int16_t  PhECU_old_Ltot_exp_fx;
    int32_t  PhECU_L_oold_xfp_w_E_fx;
    int32_t  PhECU_L_old_xfp_w_E_fx;
    int16_t  PhECU_oold_xfp_w_E_exp_fx;   /* input int16_t xfp exponnet  */
    int16_t  PhECU_old_xfp_w_E_exp_fx;  
    int16_t  PhECU_oold_grp_shape_fx[MAX_LGW];
    int16_t  PhECU_old_grp_shape_fx[MAX_LGW];
    int16_t  PhECU_margin_xfp; 
    int16_t  PhECU_mag_chg_1st[MAX_LGW];
    int16_t  PhECU_Xavg[MAX_LGW];
    int16_t  old_scf_q[M];
    int16_t  old_old_scf_q[M];
    int16_t  tdc_A[M + 1];
    /* for now 20 ms saved Q14  or ptr to a combined ifft win and MDCT  preTDA synthesis window  16  ms */
} AplcSetup;

/* Channel state and bitrate-derived values go in this struct */
typedef struct
{
    int16_t *ltpf_mem_x;       /* LTPF_MEM_X_LEN */
    int16_t *ltpf_mem_y;       /* LTPF_MEM_Y_LEN */
    int16_t *stDec_ola_mem_fx; /* MDCT_MEM_LEN_MAX */
    AplcSetup *plcAd;
    int16_t *   q_old_d_fx; /* MAX_BW */
    int16_t     q_old_fx_exp;
    int16_t     ns_seed;
    int16_t     ns_cum_alpha;
    int16_t  pc_seed;
    int16_t  pc_nbLostFramesInRow;
    int16_t *q_old_res_fx;
    int16_t  q_old_res_fx_exp;
    int16_t  prev_gg;
    int16_t  prev_gg_e;
    int16_t  prev_BW_cutoff_idx_nf;
    int16_t prev_fac_ns_fx;
    int16_t total_bits;
    int16_t enable_lpc_weighting;
    int16_t stDec_ola_mem_fx_exp;
    int16_t targetBytes;
    int16_t ltpf_mem_e;
    int16_t ltpf_mem_pitch_int;
    int16_t ltpf_mem_pitch_fr;
    int16_t ltpf_mem_gain;
    int16_t ltpf_mem_active;
    int16_t ltpf_scale_fac_idx;
    int16_t ltpf_mem_scale_fac_idx;
    int16_t quantizedGainOff;
    int16_t prev_bfi;
    int16_t prev_prev_bfi;
    int16_t concealMethod;
    int16_t nbLostFramesInRow;
    int16_t plc_damping;
    int16_t last_size;
} DecSetup;

/* Constants and sampling rate derived values go in this struct */
struct LC3_Dec
{
    DecSetup *    channel_setup[MAX_CHANNELS];
    const int16_t *W_fx;
    const int16_t *bands_offset;
    int32_t        fs;           /* sampling rate, 44.1 maps to 48 */
    int32_t        fs_out;       /* output sampling rate */
    int16_t        fs_idx;       /* sampling rate index */
    int16_t        frame_length; /* sampling rate index */
    int16_t        channels;     /* number of channels */
    int16_t        plcMeth;      /* PLC method for all channels */
    int16_t        frame_dms;    /* frame length in dms (decimilliseconds, 10^-4)*/
    int16_t        last_size;    /* size of last frame, without error protection */
    int16_t        ep_enabled;   /* error protection enabled */
    int16_t        error_report; /* corrected errors in last frame or -1 on error */

    int16_t isInterlace;
    int16_t n_pccw;
    int16_t be_bp_left;
    int16_t be_bp_right;
    int16_t n_pc;
    int16_t m_fec;
    int16_t epmr;
    int16_t combined_channel_coding;

    int16_t yLen;
    int16_t W_size;
    int16_t la_zeroes;
    int16_t stDec_ola_mem_fx_len;
    int16_t bands_number;
    int16_t ltpf_mem_x_len;
    int16_t ltpf_mem_y_len;
    int16_t BW_cutoff_bits;
};

#endif
