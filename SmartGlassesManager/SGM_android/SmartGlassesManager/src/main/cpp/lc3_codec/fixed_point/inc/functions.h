
#ifndef FUNCTIONS_H
#define FUNCTIONS_H

#include "basop_util.h"
#include "basop_mpy.h"
#include "constants.h"
#include "defines.h"
#include "lc3.h"
#include "rom_basop_util.h"
#include "setup_dec_lc3.h" /* for decoder state handle ptr  */
#include "setup_enc_lc3.h" /* for encoder state handle ptr  */
#include "stl.h"

#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PRINTF printf /* C console debug,     */
//#define ASSERT(test) assert(test)
#define ASSERT_LC3(cond)  do { if (!(cond)) { printf("[ASSERT]%s/" ,__FUNCTION__); while (1); } } while (0)

void WarnMsg(char *msg);
void ExitMsg(char *msg);
void AssertMsg(int32_t true_flag, char *msg);

void processTnsDecoder(int16_t rc_idx[], int32_t x[], int16_t xLen, int16_t order[], int16_t *x_e, int16_t BW_stopband_idx,
                          int16_t frame_dms, int8_t *scratchBuffer);

void processTnsCoder(int16_t *bits, int16_t indexes[], int32_t x[], int16_t BW_cutoff_idx, int16_t order[],
                        int16_t *numfilters, int16_t enable_lpc_weighting, int16_t nSubdivisions, int16_t frame_dms,
                        int16_t max_len, int8_t *scratchBuffer);

void TnsUpdate(int16_t *tns_numfilters, int16_t *long_startfreq, const int16_t **subdiv_startfreq,
                  const int16_t **subdiv_stopfreq, int16_t frame_length, int16_t tab_idx);

void processResidualDecoding(int32_t spectrum[], int16_t spectrum_e, int16_t L_spec, int16_t prm[], int16_t resQBits);

void processPreemph(int16_t *x, int16_t len, int16_t mem[], int16_t memLen, int16_t out[], int16_t *outLen, int16_t mu);

void processNoiseFilling(int32_t xq[], int16_t nfseed, int16_t xq_e, int16_t fac_ns_idx, int16_t BW_cutoff_idx,
                            int16_t frame_dms, int16_t fac_ns_pc, int16_t spec_inv_idx, int8_t *scratchBuffer);

#ifdef NONBE_LOW_BR_NF_TUNING
void processNoiseFactor(int16_t *fac_ns_idx, int16_t x_e, int32_t x[], int16_t xq[], int16_t gg, int16_t gg_e,
                           int16_t BW_cutoff_idx, int16_t frame_dms, int16_t target_bytes, int8_t *scratchBuffer);
#else
void processNoiseFactor(int16_t *fac_ns_idx, int16_t x_e, int32_t x[], int16_t xq[], int16_t gg, int16_t gg_e,
                           int16_t BW_cutoff_idx, int16_t frame_dms, int8_t *scratchBuffer);
#endif

void processMdctShaping(int32_t x[], int16_t scf[], int16_t scf_exp[], const int16_t bands_offset[], int16_t fdns_npts);

void processScfScaling(int16_t scf_exp[], int16_t fdns_npts, int16_t *x_e);

void processMdct(int16_t x[], int16_t x_exp, int16_t N, const int16_t w[], int16_t wLen, int16_t mem[], int16_t memLen,
                    int32_t y[], int16_t *y_e, int8_t *scratchBuffer);

void processLevinson(int32_t *lpc, int32_t *ac, int16_t N, int16_t *rc, int32_t *pred_err, int8_t *scratchBuffer);

void lpc2rc(int32_t *lpc, int16_t *rc, int16_t N);

void ProcessingIMDCT(int32_t y[], int16_t *y_e, const int16_t w[], int16_t mem[], int16_t *mem_e, int16_t x[], int16_t wLen,
                     int16_t N, int16_t memLen, int16_t frame_dms,
                     int16_t concealMethod, int16_t bfi, int16_t prev_bfi, int16_t nbLostFramesInRow, AplcSetup *plcAd,
                     int8_t *scratchBuffer);

void dct_IV(int32_t *pDat, int16_t *pDat_e, int16_t L, int32_t *workBuffer);

int16_t find_last_nz_pair(const int16_t x[], int16_t length);

PvqEntry_fx mpvq_index(const int16_t *vec_in, int16_t dim_in, int16_t k_val_local);
void        mpvq_deindex(const PvqEntry_fx *entry, uint32_t *h_mem, int16_t *vec_out);

void pvq_enc_search(const int16_t *x,       /* i:   target vector to quantize             Qin      */
                       int16_t *      rt_far,  /* o:   outl_far o, raw pulses  (non-scaled short) Q0      */
                       int16_t *      rt_near, /* o:   outl_near o, raw pulses  (non-scaled short) Q0      */
                       int16_t *      rtA,     /* o:   A section  raw pulses  (non-scaled short) Q0    */
                       int16_t *      rtB,     /* o:   B section  raw pulses  (non-scaled short) Q0     */
                       int32_t *L_corr,      /* o:   4 un-normalized correlation sums for outl_far, near, outl, A, AB  */
                       int32_t *L_search_en, /* o:   4 energy sums for out_far, outl_near, A, AB  */
                       int16_t *pulses_fin,  /* i:   number of allocated pulses  to outl A, AB section  */
                       int16_t *pulses_proj, /* i:   number of proj pulses  pulses to outl, A , AB section     */

                       const int16_t dim, /* i:   Length of vector */
                       const int16_t dimA /* i:   Length of vector A section */
);

PvqEntry_fx get_size_mpvq_calc_offset(int16_t dim_in, int16_t k_val_in, uint32_t *h_mem);

int16_t pvq_dec_deidx(                          /* out BER detected 1 , ok==0 */
                        int16_t *      y,          /* o:   decoded vector (non-scaled int32_t)  */
                        const int16_t  k_val,      /* i:   number of allocated pulses       */
                        const int16_t  dim,        /* i:   Length of vector                 */
                        const int16_t  LS_ind,     /* i; lS index              1 bit      */
                        const uint32_t UL_MPVQ_ind /* i; MPVQ  index                      */
);

void pvq_dec_en1_norm(                            /*  */
                         int16_t *      xq,           /* o:   normalized decoded vector (Q15)             */
                         const int16_t *y,            /* i:   decoded vector (non-scaled int32_t)  */
                         const int16_t  kval_max,     /* i:   max possible K   in Q0 kO or kA   */
                         const int16_t  dim,          /* i:   Length of vector                 */
                         const int16_t  neg_glob_gain /* i:   a Global Gain   (negated to fit 1.0 in Q15 as -1.0) */
);

void pvq_dec_en1_normQ14(                         /*  Have to be used by both encoder and decoder */
                            int16_t *      xq,        /* o:   en1 normalized decoded vector (Q14)        */
                            const int16_t *y,         /* i:   decoded vector (non-scaled int32_t)  */
                            const int16_t  k_val_max, /* i:   max possible K   in Q0 kO or kA   */
                            const int16_t  dim        /* i:   Length of vector                 */
);

void pvq_dec_scale_vec(const int16_t *inQ14, int16_t adjGainQ13, int16_t *vecQ14);

int16_t ArithmeticEncoder(uint8_t *bytes, int16_t bp_side, int16_t mask_side, int16_t nbbits, int16_t xq[],
                            int16_t *tns_order, int16_t tns_numfilters, int16_t *tns_idx, int16_t lastnz,
                            int16_t *codingdata, int8_t *resBits, int16_t numResBits, int16_t lsbMode,
                            int16_t enable_lpc_weighting, int8_t *scratchBuffer);

void ArithmeticDecoder(uint8_t *bytes, int16_t *bp_side, int16_t *mask_side, int16_t nbbits, int16_t L_spec,
                          int16_t fs_idx, int16_t enable_lpc_weighting, int16_t tns_numfilters, int16_t lsbMode,
                          int16_t lastnz, int16_t *bfi, int16_t *tns_order, int16_t fac_ns_idx, int16_t gg_idx,
                          int16_t frame_dms,
                          int16_t n_pc, int16_t be_bp_left, int16_t be_bp_right, int16_t enc, int16_t *spec_inv_idx, int16_t *b_left,
                          int16_t *resBits, int16_t *x, int16_t *nf_seed, int16_t *resQdata, int16_t *tns_idx,
                          int16_t *zero_frame, int8_t *scratchBuffer);

void ArithmeticDecoderScaling(int16_t *data16, int16_t dataLen, int32_t *data32, int16_t *data_e);

void processApplyGlobalGain(int32_t x[], int16_t *x_e, int16_t xLen, int16_t global_gain_idx, int16_t global_gain_off);

void processPerBandEnergy(int32_t *d2_fx, int16_t *d2_fx_exp, int32_t *d_fx, int16_t d_fx_exp,
                             const int16_t *band_offsets, int16_t fs_idx, int16_t n_bands, int16_t linear, int16_t frame_dms,
                             int8_t *scratchBuffer);

void processDetectCutoffWarped(int16_t *bw_idx, int32_t *d2_fx, int16_t d2_fx_exp, int16_t fs_idx, int16_t frame_dms);

void process_resamp12k8(int16_t x[], int16_t x_len, int16_t mem_in[], int16_t mem_in_len, int32_t mem_50[],
                           int16_t mem_out[], int16_t mem_out_len, int16_t y[], int16_t *y_len, int16_t fs_idx,
                           int16_t frame_dms, int8_t *scratchBuffer);

void process_olpa(int16_t *mem_s6k4_exp, int16_t mem_s12k8[], int16_t mem_s6k4[], int16_t *pitch, int16_t *s12k8,
                     int16_t len, int16_t *normcorr, int16_t *mem_pitch, int16_t s12k8_exp, int8_t *scratchBuffer);

void process_ltpf_coder(int16_t *bits, int16_t ol_pitch, int16_t ltpf_enable, int16_t *old_wsp_exp, int16_t *old_wsp,
                           int16_t old_wsplen, int16_t *param, int16_t *wsp, int16_t len, int16_t *mem_normcorr,
                           int16_t *mem_mem_normcorr, int16_t ol_normcorr, int16_t *mem_ltpf_on, int16_t *mem_ltpf_pitch,
                           int16_t wsp_exp, int16_t frame_dms, int8_t *scratchBuffer);

void processLtpfDecoder(int16_t *x_e, int16_t L_frame, int16_t old_x_len, int16_t fs_idx, int16_t old_y_len,
                             int16_t *old_e, int16_t *x, int16_t *old_x, int16_t *y, int16_t *old_y, int16_t ltpf,
                             int16_t ltpf_active, int16_t pitch_index, int16_t *old_pitch_int, int16_t *old_pitch_fr,
                             int16_t *old_gain, int16_t *mem_ltpf_active, int16_t scale_fac_idx, int16_t bfi,
                             int16_t concealMethod,
                             int16_t damping, int16_t *old_scale_fac_idx, int8_t *scratchBuffer);

void processOutputScaling(int16_t* x_fx, void* s_out, int32_t bits_per_sample, int16_t q_fx_exp, int16_t frame_length);

void attack_detector(LC3_Enc *enc, EncSetup *setup, int16_t *input, int16_t input_scaling, void *scratch);

void processSnsComputeScf(int32_t *d2_fx, int16_t d2_fx_exp, int16_t fs_idx, int16_t n_bands, int16_t *scf,
                             int16_t scf_smoothing_enabled, int8_t *scratchBuffer);

void processSnsQuantizeScfEncoder(int16_t  scf[],     /* i: input scf M */
                                     int32_t *L_prm_idx, /* o: indeces . negative == unused */
                                     int16_t *scf_q,     /* o: quantized scf M */
                                     int8_t * scratchBuffer);

int16_t processSnsQuantizeScfDecoder(                                       /* o: BER flag */
                                       int32_t *L_prm_idx,                     /* i: indeces */
                                       int16_t scf_q[], int8_t *scratchBuffer); /* o:  M */

void processSnsInterpolateScf(int16_t *scf_q, int16_t mdct_scf[], int16_t mdct_scf_exp[], int16_t inv_scf,
                                 int16_t n_bands, int8_t *scratchBuffer);

void processPLCmain(int16_t plcMeth, int16_t *concealMethod, int16_t *nbLostFramesInRow, int16_t bfi, int16_t prev_bfi,
                       int16_t frame_length, int16_t la_zeroes, const int16_t w[], int16_t x_fx[], int16_t ola_mem[],
                       int16_t *ola_mem_exp, int16_t q_old_d_fx[], int16_t *q_old_fx_exp, int32_t q_d_fx[],
                       int16_t *q_fx_exp, int16_t yLen, int16_t fs_idx, const int16_t *band_offsets, int16_t *damping,
                       int16_t old_pitch_int, int16_t old_pitch_fr, int16_t *ns_cum_alpha, int16_t *ns_seed,
                       AplcSetup *plcAd, int16_t frame_dms, int8_t *scratchBuffer);

void processPLCupdate(AplcSetup *plcAd, int16_t x_fx[], int16_t q_fx_exp, int16_t concealMethod, int16_t frame_length,
                         int16_t fs_idx, int16_t *nbLostFramesInRow, int16_t *prev_prev_bfi, int16_t *prev_bfi, int16_t bfi,
                         int16_t scf_q[], int16_t ola_mem_fx[], int16_t ola_mem_fx_exp, int16_t *ns_cum_alpha);

void processPLCupdateSpec(int16_t q_old_d_fx[], int16_t *q_old_fx_exp, int32_t q_d_fx[], int16_t *q_fx_exp, int16_t yLen);


void processPLCspec2shape(int16_t prev_bfi, int16_t bfi, int16_t q_old_d_fx[], int16_t yLen, int16_t *PhECU_oold_grp_shape_fx, int16_t *PhECU_old_grp_shape_fx);


int32_t winEnCalc(const int16_t *, const int16_t , const int16_t *, const int16_t, const int16_t,int16_t *);

void processPLCUpdateAfterIMDCT(int16_t x_fx[], int16_t q_fx_exp, int16_t concealMethod, int16_t xLen, int16_t fs_idx,
                                   int16_t *nbLostFramesInRow, int16_t *prev_prev_bfi, int16_t *prev_bfi, int16_t bfi, int16_t scf_q[],
                                   int16_t *ns_cum_alpha, AplcSetup *plcAd);

void processPLCclassify(int16_t plcMeth, int16_t *concealMethod, int16_t *nbLostFramesInRow, int16_t bfi,
                           int16_t ltpf_mem_pitch_int, int16_t frame_length, int16_t frame_dms, int16_t fs_idx, int16_t yLen,
                           int16_t q_old_d_fx[], const int16_t *band_offsets, AplcSetup *plcAd, int8_t *scratchBuffer);

void processPLCapply(int16_t concealMethod, int16_t nbLostFramesInRow, int16_t bfi, int16_t prev_bfi,
                        int16_t frame_length, int16_t la_zeroes, const int16_t w[], int16_t x_fx[], int16_t ola_mem[],
                        int16_t *ola_mem_exp, int16_t q_old_d_fx[], int16_t *q_old_fx_exp, int32_t q_d_fx[],
                        int16_t *q_fx_exp, int16_t yLen, int16_t fs_idx, int16_t *damping, int16_t old_pitch_int,
                        int16_t old_pitch_fr, int16_t *ns_cum_alpha, int16_t *ns_seed, int16_t frame_dms, AplcSetup *plcAd,
                        int8_t *scratchBuffer);

#ifndef NONBE_PLC4_ADAP_DAMP
void processPLCNoiseSubstitution(int32_t spec[], int16_t spec_prev[], int16_t L_spec, int16_t nbLostFramesInRow,
                                    int16_t stabFac, int16_t frame_dms, int16_t *alpha, int16_t *cum_alpha, int16_t *seed);
#else
void processPLCNoiseSubstitution(int32_t spec[], int16_t spec_prev[], int16_t L_spec);
void processPLCDampingScrambling_main(int16_t bfi, int16_t concealMethod, int16_t ns_nbLostFramesInRow,
                                         int16_t pc_nbLostFramesInRow, int16_t *ns_seed, int16_t *pc_seed, int16_t pitch_present_bfi1,
                                         int16_t pitch_present_bfi2, int32_t spec[], int16_t *q_fx_exp, int16_t *q_old_d_fx,
                                         int16_t *q_old_fx_exp, int16_t L_spec, int16_t stabFac, int16_t frame_dms,
                                         int16_t *cum_fading_slow, int16_t *cum_fading_fast, int16_t *alpha, int16_t spec_inv_idx);
void processPLCDampingScrambling(int32_t spec[], int16_t L_spec, int16_t nbLostFramesInRow, int16_t stabFac,
                                    int16_t pitch_present, int16_t frame_dms, int16_t *cum_fading_slow,
                                    int16_t *cum_fading_fast, int16_t *alpha, int16_t *seed, int16_t spec_inv_idx);
#endif

void processLagwin(int32_t r[], const int32_t w[], int16_t m);

void processInverseODFT(int32_t *r_fx, int16_t *r_fx_exp, int32_t *d2_fx, int16_t d2_fx_exp, int16_t n_bands,
                           int16_t lpc_order, int8_t *scratchBuffer);

void processPreEmphasis(int32_t *d2_fx, int16_t *d2_fx_exp, int16_t fs_idx, int16_t n_bands, int16_t frame_dms, int8_t *scratchBuffer);

void processPLCLpcScaling(int32_t tdc_A_32[], int16_t tdc_A_16[], int16_t m);

#ifdef BE_MOVED_STAB_FAC
void processPLCcomputeStabFac_main(int16_t scf_q[], int16_t old_scf_q[], int16_t old_old_scf_q[], int16_t bfi, int16_t prev_bfi,
                              int16_t prev_prev_bfi, int16_t *stab_fac);
void processPLCcomputeStabFac(int16_t scf_q[], int16_t old_scf_q[], int16_t prev_bfi, int16_t *stab_fac);
#endif

void processPLCUpdateXFP_w_E_hist(int16_t prev_bfi, int16_t bfi, 
                                     int16_t *xfp_fx, int16_t xfp_exp_fx,int16_t margin_xfp, 
                                     int16_t fs_idx, 
                                     int32_t *L_oold_xfp_w_E_fx, int16_t *oold_xfp_w_E_exp_fx, 
                                     int32_t *L_old_xfp_w_E_fx, int16_t *old_xfp_w_E_exp_fx,                                   
                                     int16_t *oold_Ltot_exp_fx, int16_t *old_Ltot_exp_fx);    
void processTimeDomainConcealment_Apply(const int16_t pitch_int, const int16_t preemphFac_fx, const int16_t *A_fx,
                                           const int16_t lpc_order, const int16_t *pcmbufHist_fx, const int16_t frame_length,
                                           const int16_t frame_dms, const int16_t fs_idx, const int16_t nbLostFramesInRow,
                                           const int16_t overlap, const int16_t stabFac_fx, int16_t *fract,
                                           int16_t *seed_fx, int16_t *gain_p_fx, int32_t *gain_c_fx, int16_t *cum_alpha,
                                           int16_t *synth_fx, int16_t *Q_syn, int16_t *alpha, int16_t max_len_pcm_plc,
                                           int8_t *scratchBuffer);

void processTdac(int16_t *ola_mem, int16_t *ola_mem_exp, const int16_t *synth, const int16_t synth_exp,
                    const int16_t *win, const int16_t la_zeroes, const int16_t frame_len, int8_t *scratchBuffer);

void plc_phEcu_F0_refine_first(int16_t *plocs, const int16_t n_plocs_in, int32_t *L_f0est,
                                  const int16_t stPhECU_f0hzLtpBinQ7, const int16_t stPhECU_f0gainLtpQ15,
                                  const int16_t nSubm);
void plc_phEcu_LF_peak_analysis(int16_t *plocs, int16_t *n_plocs, int32_t *L_f0estQ16, const int16_t *mag,
                                   const int16_t stPhECU_f0hzLtpBinQ7, const int16_t stPhECU_f0gainLtpQ15,
                                   const int16_t nSubm, int16_t maxPlocs, int8_t *scratchBuffer);

int16_t plc_phEcuSetF0Hz(int16_t fs_idx, int16_t old_pitch_int, int16_t old_pitch_fr);

void create_sin2_taper(int16_t *, int16_t, int16_t);

void plc_phEcu_initWord16(int16_t *     vec,   /*i/o : vector pointer             */
                          const int16_t value, /*i   : short initialization value */
                          const int16_t len);  /*i   : number of elements         */

int16_t plc_phEcu_ratio(const int32_t, const int32_t, int16_t *);

void plc_phEcu_minval(const int16_t *inp,  /* i  : vector       */
                         const int16_t  len,  /* i  : length       */
                         int16_t *      minvalPtr); /* o  : min  value Ptr    */

void plc_phEcu_maxval(const int16_t *inp,  /* i  : vector     */
                         const int16_t  len,  /* i  : length     */
                         int16_t *      maxvalPtr); /* o  : *maxvalPtr */

void Scale_sig_sat(int16_t       x[],   /* i/o: signal to scale,  possibly saturated      Qx        */
                   const int16_t lg,    /* i  : size of x[]                     Q0        */
                   const int16_t exp0); /* i  : exponent: x = round(x << exp)   Qx ?exp  */

void Processing_ITDA_WIN_OLA(int32_t L_x_tda[], int16_t *y_e, const int16_t w[], int16_t mem[], int16_t *mem_e, int16_t x[],
                             int16_t wLen, int16_t N, int16_t memLen);

void trans_burst_ana(const int16_t *xfp,     /* i  : Input signal                                       Qspec */
                        int16_t *      mag_chg, /* o  : Magnitude modification                             Q15 */
                        int16_t *ph_dith, /* o  : Phase dither, 2*PI is not included (Q15, i.e., between 0.0 and 1.0) */
                        int16_t *mag_chg_1st,          /* i/o: per band magnitude modifier for transients         Q15 */
                        const int16_t output_frame,    /* i  : Frame length                                           */
                        const int16_t time_offs,       /* i  : Time offset (integral multiple of output_frame)        */
                        const int16_t est_stab_content, /* i  : 0.0=dynamic ... 1.0=stable    (==st->env_stab )     */
                        int16_t *     alpha,           /*  o  : Magnitude modification factors for fade to average     */
                        int16_t *     beta,            /*    : Magnitude modification factors for fade to average     */
                        int16_t *     beta_mute, /* i/o  : Factor for long-term mute                              */
                        int16_t *     Xavg,      /* o  : Frequency group average gain to fade to                */
                     int16_t Q_spec,
                     int32_t L_oold_xfp_w_E_fx,
                     int16_t oold_xfp_w_E_exp_fx,
                     int16_t oold_Ltot_exp_fx,
                     int16_t *oold_grp_shape_fx,
                     int32_t L_old_xfp_w_E_fx,
                     int16_t old_xfp_w_E_exp_fx,
                     int16_t old_Ltot_exp_fx,
                     int16_t *old_grp_shape_fx,
                        int8_t *scratchBuffer);

void spec_ana(int16_t *xfp, int16_t *, int32_t *, int16_t *, int16_t *, const int16_t, const int16_t,
                 const int16_t *, const int16_t, const int16_t, int16_t maxLprot, int16_t maxPlocs, int8_t *scratchBuffer);

void subst_spec(const int16_t *, const int32_t *, int16_t *, const int16_t, int16_t *, const int16_t *, const int16_t,
                   const int16_t *, const int16_t, int16_t *, const int16_t *, const int16_t *,
                   const int16_t *, const int16_t
);

void rec_frame(int16_t *     X,            /* i  : FFT spectrum */
                  int32_t *     L_ecu_rec,    /* o  : Reconstructed frame in tda domain */
                  const int16_t output_frame, /* i  : Frame length */
                  const int16_t Q,
                  const int16_t *const win2ms_init ,   /* i:  2 ms initial part of pre_tda window */
                  const int16_t *const win16ms_center, /* i:  16 ms combined part  of pre_tda IWHR+MDCT-ana  */

                  int16_t maxLprot,
                  const int16_t *prevsynth,
                  const int16_t Q_prevsynth,
                  int8_t *scratchBuffer);

int16_t rand_phase(const int16_t seed, int16_t *sin_F, int16_t *cos_F);

void hq_phase_ecu(const int16_t *prevsynth, /* i  : buffer of previously synthesized signal   */
                     int32_t *L_ecu_rec, /* o  : reconstructed frame in tda domain  , also tmp w32_fft buffer        */
                     int16_t *time_offs, /* i/o: Sample offset for consecutive frame losses*/
                     int16_t *X_sav,     /* i/o: Stored spectrum of prototype frame        */
                     int16_t *Q_spec,    /*  o: Q value of stored spectrum                */
                     int16_t *num_p,     /* i/o: Number of identified peaks                */
                     int16_t *plocs,     /* i/o: Peak locations                            */
                     int32_t *L_plocsi,  /* i/o: Interpolated peak locations           Q16 */
                     const int16_t env_stab,            /* i  : Envelope stability parameter              */
                     const int16_t f0hzLtpBinQ7,        /* i:  LTP bin frequency in normalized Hz  Q7 */
                     const int16_t norm_corrQ15_fx,     /*i : correlation for lag at f0hzLtpBinQ7 */
                     const int16_t prev_bfi,            /* i   : indicating burst frame error             */
                     int16_t old_is_transient[2], /* i/o   : flags indicating noise generation */
                     int16_t *     mag_chg_1st,         /* i/o: per band magnitude modifier for transients */
                     int16_t *     mag_chg_gr,          /*  o: per band magnitude modifier incl burst attenuation   */
                     int16_t *     Xavg,                /* i/o: Frequency group average gain to fade to   */
                     int16_t *     beta_mute,           /* o   : Factor for long-term mute                */
                     const int16_t bwidth_fx,           /* i  : Encoded bandwidth                         */
                     const int16_t output_frame,        /* i   : frame length                             */
                     int16_t * seed_out_fxPtr,           /* o: seed synch analysis */ 
                     int16_t * X_out ,                   /* o: utput  evolved spectrum  */  
                     const int16_t  t_adv,      /* i  : time adjustment including time_offs       */
                     const int16_t *const win2ms_init ,   /* i:  2 ms initial part of pre_tda window */
                     const int16_t *const win16ms_center, /* i:  16 ms combined part  of pre_tda IWHR+MDCT-ana  */
                     const int16_t *sp_ana_win, /* i  : whr hamming window */
                     int16_t q_fx_old_exp, int16_t maxLprot,
                     int16_t maxPlocs,
                     int32_t L_oold_xfp_w_E_fx,
                     int16_t oold_xfp_w_E_exp_fx, /* exp of time signal */
                     int16_t oold_Ltot_exp_fx, /*true exp of energy */
                     int16_t *oold_grp_shape_fx,
                     int32_t L_old_xfp_w_E_fx,
                     int16_t old_xfp_w_E_exp_fx, /* exp of time signal */
                     int16_t old_Ltot_exp_fx,   /*true exp of energy */
                     int16_t *old_grp_shape_fx,
                     int16_t  margin_prev_synth,   /* i: margin in prev_synth(16ms for first bfi , 3.75 ms for other bfi frames ) ,  from  plcAd.PhECU_margin_xfp */
                     int8_t *scratchBuffer /* Size = 2 * MAX_LGW + 8 * MAX_LPROT + 12 * MAX_L_FRAME */
);


int16_t plc_xcorr_lc(/* o: quantized output xcorr in Q15  [ 0 ..32767 ] = [0. 1.0[  */
                int16_t *pcmbuf_fx, /* NB should be an  already dynamically upscaled buffer  with about 0...1  bits margin */
                int16_t buflen,    /* Q0 size of pcmbuf_fx */
                int16_t  pitch_int, /* Q0  in Fs, lag value to evaluate, corresponding to the current f0    fr pcm_buf   */
                int16_t nom_corr_len, /* nominal correlation length to use for lags <= MAX_PITCH */
                int16_t fs_idx);
 
void plc_phEcu_peak_locator(const int16_t *, const int16_t, int16_t *, int16_t *, const int16_t, const int16_t, const int16_t, int16_t, int8_t *);

int16_t  plc_phEcu_find_ind(const int16_t*  , const int16_t   , const int16_t   );


int16_t initQV(int16_t SR_idx, int32_t BR);

void processEstimateGlobalGain(int32_t x[], int16_t x_e, int16_t lg, int16_t sqTargetBits, int16_t *gain, int16_t *gain_e,
                                  int16_t *quantizedGain, int16_t *quantizedGainMin, int16_t quantizedGainOff,
                                  int32_t *targetBitsOff, int16_t *old_targetBits, int16_t old_specBits,
                                  int8_t *scratchBuffer);

void processAdjustGlobalGain(int16_t *gg_idx, int16_t gg_idx_min, int16_t gg_idx_off, int16_t *gain, int16_t *gain_e,
                                int16_t target, int16_t nBits, int16_t *gainChange, int16_t fs_idx);

void processScalarQuant(int32_t x[], int16_t x_e, int16_t xq[], int16_t L_frame, int16_t gain, int16_t gain_e);

void processQuantizeSpec(int32_t x[], int16_t x_e, int16_t gain, int16_t gain_e, int16_t xq[], int16_t nt, int16_t target,
                            int16_t totalBits, int16_t *nBits, int16_t *nBits2, int16_t fs_idx, int16_t *lastnz,
                            int16_t *codingdata, int16_t *lsbMode, int16_t mode);

void processResidualCoding(int16_t x_e, int32_t x[], int16_t xq[], int16_t gain, int16_t gain_e, int16_t L_spec,
                              int16_t targetBits, int16_t nBits, int8_t *resBits, int16_t *numResBits);

void lc3_pre_encoding_process(int32_t* input, int16_t* output,
    LC3_Enc * pEncoder, EncSetup * pEncSetup, int32_t bits_per_sample, void*scratch);


/* al_fec.c */
int16_t fec_get_n_pccw(int16_t slot_bytes, int16_t fec_mode, int16_t ccc_flag);
int16_t fec_get_data_size(int16_t fec_mode, int16_t ccc_flag, int16_t slot_bytes);
int16_t fec_get_n_pc(int16_t fec_mode, int16_t n_pccw, int16_t slot_bytes);

void fec_encoder(int16_t mode, int16_t epmr, uint8_t *iobuf, int16_t data_bytes, int16_t slot_bytes, int16_t n_pccw,
                 void *scratch);

int32_t fec_decoder(uint8_t *iobuf, int16_t slot_bytes, int32_t *data_bytes, int16_t *epmr, int16_t ccc_flag, int16_t *n_pccw,
                int32_t *bfi, int16_t *be_bp_left, int16_t *be_bp_right, int16_t *n_pc, int16_t *m_fec, void *scratch);

void processPCmain(int16_t rframe, int16_t *bfi, int16_t prev_bfi, int16_t yLen, int16_t frame_dms, int16_t q_old_res_fx[],
                      int16_t *q_old_res_fx_exp, int16_t q_res_fx[], int16_t q_old_d_fx[], int16_t spec_inv_idx,
                      int16_t pitch_present, int16_t stab_fac, int32_t q_d_fx[], int16_t *q_fx_exp,
                      int16_t gg_idx, int16_t gg_idx_off, int16_t *prev_gg, int16_t *prev_gg_e, int16_t *BW_cutoff_idx_nf,
                      int16_t *prev_BW_cutoff_idx_nf, int16_t fac_ns_idx, int16_t *prev_fac_ns_fx, int16_t *pc_nbLostFramesInRow);
void processPCclassify(int16_t pitch_present, int16_t frame_dms, int16_t q_old_d_fx[], int16_t q_old_res_fx[],
                          int16_t yLen, int16_t spec_inv_idx, int16_t stab_fac, int16_t prev_bfi, int16_t *bfi);
void processPCapply(int16_t yLen, int16_t q_old_res_fx[], int16_t q_res_fx[], int16_t *q_old_res_fx_exp, int16_t q_old_d_fx[],
                       int16_t spec_inv_idx, int16_t *fac, int16_t *fac_e, int32_t q_d_fx[], int16_t *q_fx_exp,
                       int16_t gg_idx, int16_t gg_idx_off, int16_t prev_gg, int16_t prev_gg_e, int16_t *pc_nbLostFramesInRow);
void processPCupdate(int16_t bfi, int16_t yLen, int16_t q_old_res_fx[], int16_t *q_old_res_fx_exp,
                        int16_t q_res_fx[], int16_t spec_inv_idx, int16_t gg_idx, int16_t gg_idx_off,
                        int16_t *prev_gg, int16_t *prev_gg_e, int16_t rframe, int16_t *BW_cutoff_idx_nf,
                        int16_t *prev_BW_cutoff_idx_nf, int16_t fac_ns_idx, int16_t *prev_fac_ns_fx, int16_t fac, int16_t fac_e);
void processPcApplyDamping(int32_t x[], int16_t xLen, int16_t fac, int16_t spec_inv_idx);

void process_cutoff_bandwidth(int32_t d_fx[], int16_t len, int16_t bw_bin);

void dct16_fx(const int16_t *in, int16_t *out);
void idct16_fx(const int16_t *in, int16_t *out);

/* Functions used in arithmetic coder */

void write_bit_backward(uint8_t *ptr, int16_t *bp, int16_t *mask, int16_t bit);
void write_indice_backward(uint8_t *ptr, int16_t *bp, int16_t *mask, int16_t indice, int16_t numbits);

void processEncoderEntropy(uint8_t *bytes, int16_t *bp_side, int16_t *mask_side, int16_t nbbits, int16_t targetBytes,
                           int16_t L_spec, int16_t BW_cutoff_bits, int16_t tns_numfilters,
                           int16_t lsbMode, int16_t lastnz, int16_t *tns_order, int16_t fac_ns_idx, int16_t gg_idx,
                           int16_t BW_cutoff_idx, int16_t *ltpf_idx, int32_t *L_scf_idx, int16_t bfi_ext, int16_t fs_idx);

void DecoderSideInformation(uint8_t *bytes, int16_t *bp_side, int16_t *mask_side, int16_t nbbits,
                              int16_t L_spec, int16_t fs_idx, int16_t BW_cutoff_bits, int16_t *tns_numfilters,
                              int16_t *lsbMode, int16_t *lastnz, int16_t *bfi, int16_t *tns_order, int16_t *fac_ns_idx,
                              int16_t *gg_idx, int16_t *BW_cutoff_idx, int16_t *ltpf_idx, int32_t *L_scf_idx,
                              int16_t frame_dms);

#ifdef ENABLE_PADDING
int32_t paddingDecoder(uint8_t *bytes, int16_t nbbits, int16_t L_spec, int16_t BW_cutoff_bits, int16_t ep_enabled,
                   int16_t *total_padding, int16_t *np_zero);
#endif

int16_t read_bit(uint8_t *ptr, int16_t *bp, int16_t *mask);

/* setup_enc_lc3.c */
int32_t get_encoder_mem_size(int32_t samplerate, int32_t channels);
int32_t       alloc_encoder(LC3_Enc *encoder, int32_t samplerate, int32_t channels);
void      set_enc_frame_params(LC3_Enc *encoder);
LC3_Error update_enc_bitrate(LC3_Enc *encoder, int32_t bitrate);
LC3_Error FillEncSetup(LC3_Enc *encoder, int32_t samplerate, int32_t channels);

/* setup_dec_lc3.c */
int32_t       alloc_decoder(LC3_Dec *decoder, int32_t samplerate, int32_t channels, LC3_PlcMode plc_mode);
void      set_dec_frame_params(LC3_Dec *decoder);
LC3_Error update_dec_bitrate(LC3_Dec *decoder, int32_t ch, int16_t nBytes);
LC3_Error FillDecSetup(LC3_Dec *decoder, int32_t samplerate, int32_t channels, LC3_PlcMode plc_mode);

int32_t       Enc_LC3(LC3_Enc *encoder, void **input, int32_t bits_per_sample, uint8_t *output, void *scratch, int16_t bfi_ext);
LC3_Error Dec_LC3(LC3_Dec *decoder, uint8_t *input, int32_t input_bytes, void **output, int32_t bits_per_sample, void *scratch, int32_t bfi_ext);

void *balloc(void *base, size_t *base_size, size_t size);


#endif
