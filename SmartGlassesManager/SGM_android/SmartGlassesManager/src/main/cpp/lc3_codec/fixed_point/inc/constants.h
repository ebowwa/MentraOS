
#ifndef CONSTANTS_H
#define CONSTANTS_H

#include "defines.h"
#include "basop_util.h"


extern RAM_ALIGN const int16_t LowDelayShapes_n960_len[5];
extern RAM_ALIGN const int16_t LowDelayShapes_n960_la_zeroes[5];
extern RAM_ALIGN const int16_t *const LowDelayShapes_n960[5];
extern RAM_ALIGN const int16_t LowDelayShapes_n960_len_5ms[5];
extern RAM_ALIGN const int16_t LowDelayShapes_n960_la_zeroes_5ms[5];
extern RAM_ALIGN const int16_t *const LowDelayShapes_n960_5ms[5];
extern RAM_ALIGN const int16_t LowDelayShapes_n960_len_2_5ms[5];
extern RAM_ALIGN const int16_t LowDelayShapes_n960_la_zeroes_2_5ms[5];
extern RAM_ALIGN const int16_t *const LowDelayShapes_n960_2_5ms[5];

extern RAM_ALIGN const int32_t BW_thresh_quiet[4];
extern RAM_ALIGN const int16_t BW_thresh_quiet_exp;
extern RAM_ALIGN const int16_t BW_thresh_brickwall[4];
extern RAM_ALIGN const int16_t BW_brickwall_dist[4];
extern RAM_ALIGN const int16_t BW_cutoff_bin_all[MAX_BW_BANDS_NUMBER];
extern RAM_ALIGN const int16_t BW_cutoff_bin_2_5ms[MAX_BW_BANDS_NUMBER];
extern RAM_ALIGN const int16_t BW_cutoff_bin_5ms[MAX_BW_BANDS_NUMBER];
extern RAM_ALIGN const int16_t BW_cutoff_bin_10ms[MAX_BW_BANDS_NUMBER];

extern RAM_ALIGN const int16_t BW_cutoff_bits_all[MAX_BW_BANDS_NUMBER];
extern RAM_ALIGN const int16_t *const BW_warp_idx_start_all[MAX_BW_BANDS_NUMBER - 1];
extern RAM_ALIGN const int16_t *const BW_warp_idx_stop_all[MAX_BW_BANDS_NUMBER - 1];
extern RAM_ALIGN const int16_t *const BW_warp_idx_start_all_5ms[MAX_BW_BANDS_NUMBER - 1];
extern RAM_ALIGN const int16_t *const BW_warp_idx_stop_all_5ms[MAX_BW_BANDS_NUMBER - 1];
extern RAM_ALIGN const int16_t *const BW_warp_idx_start_all_2_5ms[MAX_BW_BANDS_NUMBER - 1];
extern RAM_ALIGN const int16_t *const BW_warp_idx_stop_all_2_5ms[MAX_BW_BANDS_NUMBER - 1];

extern RAM_ALIGN const int16_t *const tns_subdiv_startfreq[MAX_BW_BANDS_NUMBER];
extern RAM_ALIGN const int16_t *const tns_subdiv_stopfreq[MAX_BW_BANDS_NUMBER];
extern RAM_ALIGN const int16_t *const tns_subdiv_startfreq_5ms[MAX_BW_BANDS_NUMBER];
extern RAM_ALIGN const int16_t *const tns_subdiv_stopfreq_5ms[MAX_BW_BANDS_NUMBER];
extern RAM_ALIGN const int16_t *const tns_subdiv_startfreq_2_5ms[MAX_BW_BANDS_NUMBER];
extern RAM_ALIGN const int16_t *const tns_subdiv_stopfreq_2_5ms[MAX_BW_BANDS_NUMBER];
extern RAM_ALIGN const int16_t Tab_esc_nb[4];

extern RAM_ALIGN const int8_t ari_spec_lookup[4096];
extern RAM_ALIGN const uint16_t ari_spec_cumfreq[64][17];
extern RAM_ALIGN const uint16_t ari_spec_freq[64][17];
extern RAM_ALIGN const uint16_t ari_spec_bits[64][17];

extern RAM_ALIGN const int32_t tnsAcfWindow[MAXLAG];
extern RAM_ALIGN const int16_t plus_ac_tns_order_bits[2][MAXLAG];
extern RAM_ALIGN const int16_t plus_ac_tns_order_freq[2][MAXLAG];
extern RAM_ALIGN const int16_t plus_ac_tns_order_cumfreq[2][MAXLAG];
extern RAM_ALIGN const int16_t plus_ac_tns_coef_bits[MAXLAG][TNS_COEF_RES];
extern RAM_ALIGN const int16_t plus_ac_tns_coef_freq[MAXLAG][TNS_COEF_RES];
extern RAM_ALIGN const int16_t plus_ac_tns_coef_cumfreq[MAXLAG][TNS_COEF_RES];
extern RAM_ALIGN const int16_t tnsQuantPts[TNS_COEF_RES];
extern RAM_ALIGN const int16_t tnsQuantThr[TNS_COEF_RES - 1];

extern RAM_ALIGN const int16_t *const lpc_pre_emphasis[5];
extern RAM_ALIGN const int16_t *const lpc_pre_emphasis_e[5];

extern RAM_ALIGN const int16_t *const lpc_lin_pre_emphasis_10ms[5];
extern RAM_ALIGN const int16_t *const lpc_lin_pre_emphasis_e_10ms[5];
extern RAM_ALIGN const int16_t *const lpc_lin_pre_emphasis_5ms[5];
extern RAM_ALIGN const int16_t *const lpc_lin_pre_emphasis_e_5ms[5];
extern RAM_ALIGN const int16_t *const lpc_lin_pre_emphasis_2_5ms[5];
extern RAM_ALIGN const int16_t *const lpc_lin_pre_emphasis_e_2_5ms[5];

extern RAM_ALIGN const int16_t *const lpc_warp_dee_emphasis[5];
extern RAM_ALIGN const int16_t *const lpc_warp_dee_emphasis_e[5];

extern RAM_ALIGN const int16_t bands_nrg_scale[32];

extern RAM_ALIGN const int16_t *const bands_offset[5];
extern RAM_ALIGN const int16_t bands_offset_with_one_max_10ms[5];
extern RAM_ALIGN const int16_t bands_offset_with_two_max_10ms[5];
extern RAM_ALIGN const int16_t bands_number_5ms[5];
extern RAM_ALIGN const int16_t *const bands_offset_5ms[5];
extern RAM_ALIGN const int16_t bands_offset_with_one_max_5ms[5];
extern RAM_ALIGN const int16_t bands_offset_with_two_max_5ms[5];
extern RAM_ALIGN const int16_t bands_number_2_5ms[5];
extern RAM_ALIGN const int16_t *const bands_offset_2_5ms[5];
extern RAM_ALIGN const int16_t bands_offset_with_one_max_2_5ms[5];
extern RAM_ALIGN const int16_t bands_offset_with_two_max_2_5ms[5];

extern RAM_ALIGN const int16_t pitch_max[5];
extern RAM_ALIGN const int16_t plc_preemph_fac[5];

extern RAM_ALIGN const int16_t TDC_high_16[11];
extern RAM_ALIGN const int16_t TDC_high_32[11];

extern RAM_ALIGN const int32_t *const lag_win[5];

extern RAM_ALIGN const int16_t *const bands_offset_lin[5];
extern RAM_ALIGN const int16_t bands_offset_with_one_max_lin_10ms[5];
extern RAM_ALIGN const int16_t bands_offset_with_two_max_lin_10ms[5];
extern RAM_ALIGN const int16_t *const bands_offset_lin_5ms[5];
extern RAM_ALIGN const int16_t *const bands_offset_lin_10ms[5];
extern RAM_ALIGN const int16_t bands_offset_with_one_max_lin_5ms[5];
extern RAM_ALIGN const int16_t bands_offset_with_two_max_lin_5ms[5];
extern RAM_ALIGN const int16_t *const bands_offset_lin_2_5ms[5];
extern RAM_ALIGN const int16_t bands_offset_with_one_max_lin_2_5ms[5];
extern RAM_ALIGN const int16_t bands_offset_with_two_max_lin_2_5ms[5];

extern RAM_ALIGN const int32_t inv_odft_twiddle_80_re[M];
extern RAM_ALIGN const int32_t inv_odft_twiddle_80_im[M];
extern RAM_ALIGN const int32_t inv_odft_twiddle_60_re[M];
extern RAM_ALIGN const int32_t inv_odft_twiddle_60_im[M];
extern RAM_ALIGN const int32_t inv_odft_twiddle_40_re[M];
extern RAM_ALIGN const int32_t inv_odft_twiddle_40_im[M];
extern RAM_ALIGN const int32_t inv_odft_twiddle_20_re[M];
extern RAM_ALIGN const int32_t inv_odft_twiddle_20_im[M];

#ifdef SUBSET_SQ
extern RAM_ALIGN const int16_t resamp_filt_16k[240];
#else
extern RAM_ALIGN const int16_t resamp_filt_16k[1];
#endif
#ifdef SUBSET_HQ
extern RAM_ALIGN const int16_t resamp_filt_24k[240];
#else
extern RAM_ALIGN const int16_t resamp_filt_24k[1];
#endif
#ifdef SUBSET_SWB
extern RAM_ALIGN const int16_t resamp_filt_32k[240];
#else
extern RAM_ALIGN const int16_t resamp_filt_32k[1];
#endif
#ifdef SUBSET_FB
extern RAM_ALIGN const int16_t resamp_filt_48k[240];
#else
extern RAM_ALIGN const int16_t resamp_filt_48k[1];
#endif

extern RAM_ALIGN const int16_t resamp_params[5][4];
extern RAM_ALIGN const int16_t *const resamp_filts[5];

extern RAM_ALIGN const int16_t highpass50_filt_num[3];
extern RAM_ALIGN const int16_t highpass50_filt_den[2];

extern RAM_ALIGN const int16_t olpa_ac_weighting[98];

extern RAM_ALIGN const int16_t ltpf_ac_interp_filt[7][9];
extern RAM_ALIGN const int16_t inter_filter[5][4][12];
extern RAM_ALIGN const int16_t inter_filter_shift[5];
extern RAM_ALIGN const int16_t inter_filter_len[5];
extern RAM_ALIGN const int16_t tilt_filter[5][4][11];
extern RAM_ALIGN const int16_t tilt_filter_len[5];
extern RAM_ALIGN const int16_t gain_scale_fac[4];
extern RAM_ALIGN const int16_t pitch_scale[5];

typedef struct
{
    int16_t  lead_sign_ind; /* this MPVQ index  is the first  part   of the total PVQ index  */
    uint32_t index, size;   /* this MPVQ index  is the second part  of the total PVQ index */
    int16_t  dim, k_val;
    int16_t  vec[PVQ_MAX_VEC_SIZE]; /* integer vector */
} PvqEntry_fx;

extern RAM_ALIGN const int16_t sns_vq_reg_adj_scf[2];
extern RAM_ALIGN const int16_t sns_vq_reg_lf_adj_scf[4];
extern RAM_ALIGN const int16_t sns_vq_near_adj_scf[4];
extern RAM_ALIGN const int16_t sns_vq_far_adj_scf[8];
extern RAM_ALIGN const int16_t *const sns_gaintabPtr[4];
extern RAM_ALIGN const int16_t sns_gainSz[4];
extern RAM_ALIGN const int16_t plus_sns_gainMSBbits[4];
extern RAM_ALIGN const int16_t plus_sns_gainLSBbits[4];
extern RAM_ALIGN const int16_t sns_Kval[4][2];
extern RAM_ALIGN const uint32_t sns_MPVQ_Sz[4][2];

extern RAM_ALIGN const int16_t st1SCF0_7_base5_32x8_Q14[256];
extern RAM_ALIGN const int16_t st1SCF8_15_base5_32x8_Q14[256];

/* PVQ deindexing tables */
extern RAM_ALIGN const uint32_t h_memN16K12[12 + 2];
extern RAM_ALIGN const uint32_t h_memN10K22[22 + 2];
extern RAM_ALIGN const uint32_t h_memN6K2[2 + 2];
extern RAM_ALIGN const int16_t tabledKMAX[16 + 1];
extern RAM_ALIGN const uint32_t *const MPVQ_offs_ptr[16 + 1];

extern RAM_ALIGN const int16_t isqrt_Q16tab[1 + SQRT_EN_MAX_FX];

extern RAM_ALIGN const int16_t adjust_global_gain_tables[5][5];


extern RAM_ALIGN const int16_t sqrt_table_phecu[];
extern RAM_ALIGN const int16_t  POW_ATT_TABLE0[];
extern RAM_ALIGN const int16_t  POW_ATT_TABLE1[];
#ifdef PLC2_FADEOUT_IN_MS 
#if PLC2_FADEOUT_IN_MS == 0
extern RAM_ALIGN const int16_t* const POW_ATT_TABLES[3];
#else
extern RAM_ALIGN const int16_t* const POW_ATT_TABLES[11];
#endif
#else
extern RAM_ALIGN const int16_t* const POW_ATT_TABLES[3];
#endif

extern RAM_ALIGN const int16_t e_tot_headroom[];
extern RAM_ALIGN const int16_t xfp_wE_MDCT2FFTQ11[];
 
extern RAM_ALIGN const int16_t num_FsByResQ0[5];
extern RAM_ALIGN const int16_t* const LprotSzPtr;  
extern RAM_ALIGN const   int16_t  InvLprot_Q22[5];
extern RAM_ALIGN const   int16_t PhEcuFftScale[5];
#ifdef  NONBE_PLC2_MUTING_DCSYNT_FIX 
extern RAM_ALIGN const    int16_t  oneOverFrameQ15Tab[5];
#endif
extern RAM_ALIGN const    int16_t PhEcu_Xsav_Flt2FxDnShift[];
extern RAM_ALIGN const    int16_t PhEcu_Xsav_Flt2FxScaleQ15[];  
extern RAM_ALIGN const    int16_t PhEcu_frac_thr_rise_lin_Q15[];
extern RAM_ALIGN const    int16_t PhEcu_frac_thr_decay_lin_Q15[];

extern RAM_ALIGN const int16_t mdct_grp_bins_fx[];
extern RAM_ALIGN const int16_t xavg_N_grp_fx[];
extern RAM_ALIGN const int16_t spec_shape_headroom[];
extern RAM_ALIGN const   int16_t rectLengthTab[];
extern RAM_ALIGN const   int16_t hamm_len2Tab[];

extern RAM_ALIGN const int16_t gw_len_inv_shift_fx[];
extern RAM_ALIGN const int16_t gwlpr_fx[];

extern RAM_ALIGN const int16_t sin_quarterQ15_fx[];
extern RAM_ALIGN const int16_t sincos_lowres_tab_sinQ15_fx[];

extern RAM_ALIGN const int16_t *const PhECU_wins[5][3];

extern   RAM_ALIGN const  int16_t *const w_new[];
extern   RAM_ALIGN const  int16_t *const w_old[];

/* extern    RAM_ALIGN const  int16_t WORK_LEN[]; */
extern    RAM_ALIGN const  int16_t COPY_LEN[];
extern    RAM_ALIGN const int16_t OLA_LEN[];


#endif
