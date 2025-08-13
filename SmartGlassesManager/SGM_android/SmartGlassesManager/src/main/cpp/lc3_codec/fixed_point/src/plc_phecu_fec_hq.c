
#include "defines.h"
#include "functions.h"
#include "math.h" /*dbg*/
#include "enh40.h"


/*---------------------------------------------------------------------*
 * Local constants
 *---------------------------------------------------------------------*/

#define DELTA_CORR 5        /* Tuning parameter - defining range for phase correction around peak */
#define DELTA_CORR_F0_INT 2 /* Tuning parameter - defining range for phase correction around peak */
 
#define MAX_INCREASE_GRPPOW_FX 0 /* max. amplification in case of transients (in dB scale) */

#if PLC2_FADEOUT_IN_MS   ==  0 
#define BURST_ATT_THRESH (4)  /* speech start attenuate with <burst_att_thresh> losses in a row  , stable content  is +1  */
#define ATT_PER_FRAME 2            /*  ptr to a table , regular voiced attenuation settings      table [0.4 dBx16 frames + 6dBx16 frames]    10 ms frame */
/* #define ATT_PER_FRAME 1      */      /*  ptr to a table , regular   attenuation settings  table [0.3 dBx16 frames + 6dBx16 frames]    10 ms frame */
#define BETA_MUTE_THR 20            /* time threshold from BFI start to start of beta-noise further energy attenuation,   by .5 each frame  */
/*  #define OFF_FRAMES_LIMIT 30       in defines.h   , table size and complete zero signal after BURST_ATT_THRESH + OFF_FRAMES_LIMIT  */        
#endif 

#if PLC2_FADEOUT_IN_MS   !=  0         /*   TD_PLC muting setting */
    /*% burst attenuation scheme is allowed to be indirectly controlled by a setting from TDC-PLC settings ,if negative PLC2_FADEOUT_IN_MS  */

#if (PLC2_FADEOUT_IN_MS < 0)
#define        FADEOUT_IN_MS  PLC_FADEOUT_IN_MS    /*% use TDC-SETTING as input */ 
#else
#define        FADEOUT_IN_MS  PLC2_FADEOUT_IN_MS  /*  % use a PLC2  individual settings as basis */
#endif
    
  /*  %Examples
    %   FADEOUT_IN_MS  ==30 ms --> shortest setting,  att per frame idx = 10    for PLC2   
    %   FADEOUT_IN_MS  ==40 ms --> att per frame idx = 8  setting for PLC2
    %   FADEOUT_IN_MS  ==60 ms --> att per frame idx = 6  setting for PLC2 (3+4) low decay then fast decay 
    %   FADEOUT_IN_MS  ==80 ms --> att per frame idx = 4  setting for PLC2
    %   FADEOUT_IN_MS ==100 ms --> att per frame idx = 2  longest = near original  setting for PLC2  
   */ 
#define    PLC_P800_SPEECH_FADEOUT_IN_FRAMES (FADEOUT_IN_MS/10)
#define    PLC2_FADEOUT_IN_FRAMES  MIN(OFF_FRAMES_LIMIT,MAX(6, (3*PLC_P800_SPEECH_FADEOUT_IN_FRAMES))) /* help variable */   
    
#define    BURST_ATT_THRESH_PRE   MIN(5,MAX(1,((1*PLC2_FADEOUT_IN_FRAMES)/6))) /* nominal 10-50 ms to start  actual  muting, will be thresh +1   */

#undef      ATT_PER_FRAME
#define     ATT_PER_FRAME     MIN(10, MAX(2, 2*(6-BURST_ATT_THRESH_PRE)))    /* we let the BURST_ATT_THRESH_PRE  control the initial table selection */   
/*   will eventually become  ATT_PER_FRAME-1 =    */
                                   /* table ptr  1,2 --> 16 low decay, 16 high decay, "0" */
                                   /* table ptr  3,4 -->  8 low decay, 24 high decay, "0" */
                                   /* table ptr  5,6 -->  4 low decay, 28 high decay , "0"*/
                                   /* table ptr  7,8 -->  2 low decay, 30  high decay, "0"*/
                                   /* table ptr 9,10 -->  1 low decay, 31  high decay, "0"*/
#undef      BURST_ATT_THRESH  
#define     BURST_ATT_THRESH    MIN(BURST_ATT_THRESH_PRE, 4 )   /* nominal 10-40 ms, of no regular muting , 20-50 ms   */
 
     /* beta mute starts to become active when the low decay mute has ended */
#undef      BETA_MUTE_THR 
#define     BETA_MUTE_THR        MIN( 4+(OFF_FRAMES_LIMIT/2)+1 , MAX(4, BURST_ATT_THRESH + 1 +(1<<(BURST_ATT_THRESH_PRE-1))))   /* nominal time  to start mandatory decrease of Xavg */
   


 
#if (ATT_PER_FRAME < 2)  ||  (ATT_PER_FRAME > 10) 
#pragma  message(" ROM table  POW_ATT_TABLES needs update  to change the ATT_PER FRAME constants supported are (1),2  (3), 4, (5) ,6   dB/frame ") 
#endif

#else
#if ( ATT_PER_FRAME != 2)   
#pragma (" ROM table  POW_ATT_TABLES needs update  to change the ATT_PER FRAME constants supported are (1),2    dB/frame ")
#endif
#endif   

#define CMPLMNT_PLOC_SENS_FX 2294            /* (1.0 - p_locator_sens) in Q15 */
#define FEC_HQ_ECU_ROOT2 23170 /*(0x5a83) */  /* sqrt(2) in Q14 */
#define FEC_TWOTHIRDS_Q15 21845 /* round(2^15*2/3)  */

static void get_sin_cosQ10opt(int16_t  phase,   /* Q10 0..1023  i.e. 1024=2*pi */
   int16_t *ptrSin,  /* Q15 */
   int16_t *ptrCos); /* Q15 */

static int16_t sqrt2ndOrder(const int16_t);

void my_wtda_fx(const int16_t *new_audio, /* i  : input audio to be windowed  Q0 20 ms , OPT can be output as well */
   const int16_t *const win2ms_init,    /* i:  2 ms initial part of pre_tda window */
   const int16_t *const win16ms_center, /* i:  16 ms combined part  of pre_tda IWHR+MDCT-ana  */
   int32_t *     L_wtda_audio, /* o  : tda audio  Q16       20 ms */
   const int16_t L, int8_t *scratchBuffer);

static void windowing_L(const int16_t *, int32_t *, const int16_t *, const int16_t, const int16_t);
static void windowing_ola(const int16_t *, int16_t *, const int16_t *, const int16_t);
static void ola_add(const int16_t *, const int16_t *, int16_t *, const int16_t);
static void intlvW32_2_flippedW16(int32_t *L_x, const int16_t numPairs, const int16_t L_prot, int16_t *x);
static void flippedW16_2_intlvW32(int16_t *x, const int16_t numPairs, const int16_t Lprot, int32_t *L_x);
static int16_t imax_fx(const int16_t *, const int16_t);


int16_t rand_phase(const int16_t seed, int16_t *sin_F, int16_t *cos_F);

static int16_t imax2_jacobsen_mag_fx(const int16_t *y_re, const int16_t *y_im, const int16_t special);
static void   fft_spec2_sqrt_approx_fx(const int16_t x[], int16_t xMagSqrt[], const int16_t N);
static int16_t sqrtMagnApprox_fx(const int16_t re, const int16_t im);

static void rotate_W16_fx(int16_t re_in, int16_t im_in, int16_t cosFactor, int16_t sinFactor, int16_t *re_out_ptr,
   int16_t *im_out_ptr)
{
   //TRACE("PhECU::rotate_W16_fx");
   *re_out_ptr = msu_r(L_mult(re_in, cosFactor), im_in, sinFactor); /* 2 ops no move when inlined */
   *im_out_ptr = mac_r(L_mult(re_in, sinFactor), im_in, cosFactor); /* 2 ops no move when inlined */
   
   return;
}

static void valley_magnitude_adj_fx(int16_t *re_ptr, int16_t *im_ptr, int16_t uniFactor, int16_t cosFactor)
{
   int16_t scale_fx;
   //TRACE("PhECU::valley_magnitude_adj_fx");

   /*  y =  0.5*((2*rand(1,10000) + 1*cos(2*pi*x))  - 1 */ /* y  will be in -1 to 1 range */
   /*  y =  1*((1*rand(1,10000) + 0.5*cos(2*pi*x))  - 1 */ /* y  will be in -1 to 1 range */

   scale_fx /*Q15*/ =  mac_r(L_mult(uniFactor, 16384), cosFactor, 16384); 
   /* make gain distribution more like N(0,1) than uniform  */

   scale_fx /*Q14*/ =  round_fx(L_mac((int32_t)(16384L << 16), scale_fx,  4096)); 
   /* create a random  gain scaling value  with mean 1.0 and max 1.25 and min 0.75 */
   ASSERT_LC3(scale_fx <= (16384 + 8192));
   ASSERT_LC3(scale_fx >= (-16384 - 8192));
   *re_ptr = mult_r(scale_fx, shl_sat(*re_ptr, 1)); /* no moves , should be inlined */
   *im_ptr = mult_r(scale_fx, shl_sat(*im_ptr, 1)); /* no moves , should be inlined */

   
   return;
}

/*------------------------------------------------------------------*
 * rand_phase()
 *
 * randomized phase in form of sin and cos components
 *------------------------------------------------------------------*/
int16_t rand_phase(const int16_t seed, int16_t *sin_F, int16_t *cos_F)
{
   /* 4x8+8 lookup scheme requiring ~40 Words of ROM  freqRes 90/8  = 11.25 degrees */

   /*    x=(0:(5*8-1))*(2*pi)/32; y=sin(x);y_int=max(-32768,min(32767,round(y*32768))), y_int/32768 */

   const int16_t *sincos_lowres_tab_cosQ15_fx =   sincos_lowres_tab_sinQ15_fx + 8; 
   /* position at 90 degrees ,  ptr init */
   int16_t seed2;
   int16_t seed2_shift;

   //TRACE("PhECU::rand_phase");

   seed2 = extract_l(L_mac0_1(13849, seed, 31821));
   seed2_shift = lshr(seed2, 11); 
   /* logical shift to get uniform random 5 msb  bits;   0-31  , 0 degrees  to 31*360/32= 348.75 */
   *sin_F = sincos_lowres_tab_sinQ15_fx[seed2_shift];   /* these moves can often be avoided by returning seed2shift and inlining */
   *cos_F = sincos_lowres_tab_cosQ15_fx[seed2_shift];   /* these moves can often be avoided by inlining */
/* total WC  5 ops */   
   return seed2;
}

/*-----------------------------------------------------------------------------
 * trans_burst_ana)
 *
 * Transient analysis
 *----------------------------------------------------------------------------*/
void trans_burst_ana(
   const int16_t *xfp,          /* i  : Input signal  (, only used if time_offset==0)     now in  up_scaled  *Q_spec  */
   int16_t *      mag_chg,      /* o  : Magnitude modification  vector                           Q15 */
   int16_t *      ph_dith,      /* o  : Phase dither, 2*PI is not included (Q15, i.e., between 0.0 and 1.0) */
   int16_t *      mag_chg_1st,  /* i/o: per band magnitude modifier for transients         Q15 */
   const int16_t  output_frame, /* i  : Frame length                                           */
   const int16_t  time_offs,    /* i  : Time offset (integral multiple of output_frame)        */
   const int16_t  est_stab_content, /* i  : 0.0=dynamic ... 1.0=Stable    (==st->env_stab )     */
   int16_t *      alpha,           /*  o  : Magnitude modification factors for fade to average     */
   int16_t *      beta,            /*    : Magnitude modification factors for fade to average     */
   int16_t *      beta_mute,       /* i/o  : Factor for long-term mute                              */
   int16_t *      Xavg,            /* o  : Frequency group average gain to fade to  in same Q as X_sav */
   int16_t Q_spec, int32_t L_oold_xfp_w_E_fx, int16_t oold_xfp_w_E_exp_fx, int16_t oold_Ltot_exp_fx,
   int16_t *oold_grp_shape_fx,

   int32_t L_old_xfp_w_E_fx, int16_t old_xfp_w_E_exp_fx, int16_t old_Ltot_exp_fx, int16_t *old_grp_shape_fx,
   int8_t *scratchBuffer /* Size = 4*4 * MAX_LTRANA + (2*4 + 1*2) * MAX_LGW  + 8 */
)
{
   int16_t        att_val, attDegreeFrames;
   int32_t *      L_pGrPowLeft, *L_pGrPowRight;
   int32_t *      L_gr_pow_left, *L_gr_pow_right;
   int16_t        Lgw, i, k, burst_len;
   int16_t        man, expo;
   int16_t        att_always = 0; /* fixed attenuation per frequency group if set to  1 */
   int16_t        oneOverFrame, roundEstMusContent, tmp16; 
   int16_t        burst_att_thresh = BURST_ATT_THRESH; 
   int16_t        att_per_frame    = ATT_PER_FRAME;
   int16_t *      tr_dec;
   int32_t        L_acc;
   int16_t fs_scale;
   int16_t scale_sh;

   int32_t L_oold_tmp, L_old_tmp;
   int16_t oold_exp_fx, old_exp_fx;
   int16_t margin_oold, margin_old;
   int16_t fs_idx;
   int16_t exp_diff; 
   int16_t Xavg_exp_fx, Xavg_mod_exp_fx;
   int16_t tr_rise[MAX_LGW];
   int16_t tr_decay[MAX_LGW];
   int16_t  man_in,    expo_in,  tmp;
    int32_t L_tmp, L_tmp2;
    int16_t thresh_tr_rise_lin_Q15;
    int16_t thresh_tr_decay_lin_Q15;

   UNUSED(xfp);
    UNUSED(oold_xfp_w_E_exp_fx);
    UNUSED(old_xfp_w_E_exp_fx);

   if (time_offs == 0)
   {
      //TRACE("PhECU::trans_burst_ana(1st)");
   }
   else
   {
      //TRACE("PhECU::trans_burst_ana(N)");
   }

   fs_idx = mult(output_frame, (int16_t)(32768.0 / 99.0)); /* truncation needed , i.e no rounding can be applied here */
   ASSERT_LC3(fs_idx == (output_frame / 100));

   L_gr_pow_left = (int32_t *)scratchBuffer; /* Size = 4 * MAX_LGW */ /* Size = 4 * MAX_LGW */

   L_gr_pow_right = (int32_t *)(((uint8_t *)L_gr_pow_left) + sizeof(*L_gr_pow_left) * MAX_LGW); /* Size = 4 * MAX_LGW */

   tr_dec = (int16_t *)(((uint8_t *)L_gr_pow_right) + sizeof(*L_gr_pow_right) * MAX_LGW); /* Size = 2bytes * MAX_LGW */


#ifdef  NONBE_PLC2_MUTING_DCSYNT_FIX 
   oneOverFrame = oneOverFrameQ15Tab[fs_idx];
   Lgw          = min(add(fs_idx, LGW8K), LGW48K);  /* 4,5,6,7, (7/8) */
#else
   /* Initialize for 48k to prevent warnings */
   oneOverFrame = INV_L_FRAME48K_Q15; 
   Lgw = LGW48K;  

   if (sub(output_frame, L_FRAME32K) == 0)
   {
      oneOverFrame = INV_L_FRAME32K_Q15; 
      Lgw = LGW32K; 

   }
   else if (sub(output_frame, L_FRAME24K) == 0)
   {
      oneOverFrame = INV_L_FRAME24K_Q15;   
      Lgw = LGW24K;   

   }
   else if (sub(output_frame, L_FRAME16K) == 0)
   {
      oneOverFrame = INV_L_FRAME16K_Q15;  
      Lgw = LGW16K;  

   }
   else if (sub(output_frame, L_FRAME8K) == 0)
   {
      oneOverFrame = INV_L_FRAME8K_Q15;  
      Lgw = LGW8K;  
   }

 
#endif

   burst_len = add(mult_r(time_offs, oneOverFrame), 1);

   UNUSED(est_stab_content);
   UNUSED(roundEstMusContent);
   burst_att_thresh = add(BURST_ATT_THRESH, 1);    /* in Q0 , stable setting */
   att_per_frame = sub(ATT_PER_FRAME, 1);       /* in Q0 , stable  setting */
 
#ifdef    PLC_FADEOUT_IN_MS 
  ASSERT_LC3(att_per_frame >= 1 &&  att_per_frame <=10 ); /* table based lookup restriction */
#else
 ASSERT_LC3(att_per_frame == 1 || att_per_frame == 2); /* table based lookup restriction */
#endif

    *ph_dith = 0; /*  peak scrambling, not in use  */

   attDegreeFrames = 0; 
   if (sub(burst_len, burst_att_thresh) > 0)
   {
      att_always = 1; 
      /* increase degree of attenuation */

      /* N.B. To facilitate the subsequent 10^(-att_degree/20) implementation
       * so as to use direct table-lookup,
       * the first (burstLen - burst_att_thresh) are  NOT multiplied by "att_per_frame". */
      attDegreeFrames = sub(burst_len, burst_att_thresh); /*   multiplied by 1.0  , */
      /* Furthermore, in order to minimize the size of the lookup-table required to
       * implement 10^(-att_degree/10), hard limit attDegreeFrames to (30% of 100)=30.
       * If attDegreeFrames is greater than 30, it means there are more than 30  successive
       * bad frames. */
      if (sub(attDegreeFrames, OFF_FRAMES_LIMIT) > 0)
      {/* Hard limit the  no. of frames, for table lookup */
         attDegreeFrames = OFF_FRAMES_LIMIT;   
      }
   }

   plc_phEcu_initWord16(alpha, 32767, MAX_LGW);
   memset(beta, 0, (MAX_LGW) * sizeof(int16_t));
   if (sub(burst_len, 1) <= 0)
   {
        *beta_mute = BETA_MUTE_FAC_INI;  
        *beta_mute = shr_pos(*beta_mute , 1);  /* perceptual decrease  */
   }

   if (sub(burst_len, 1) <= 0)
   {
      L_pGrPowLeft = &L_gr_pow_left[0];  /* ptr init*/
      L_pGrPowRight = &L_gr_pow_right[0]; /* ptr init*/

      fs_scale = xfp_wE_MDCT2FFTQ11[fs_idx];  
      scale_sh = 4; /* 15-11 */ 
      /*   L_*old_xfp_w_E_fx, always upscaled to max from the calculating function */


      L_oold_tmp = Mpy_32_16(L_oold_xfp_w_E_fx, fs_scale);
      L_old_tmp = Mpy_32_16(L_old_xfp_w_E_fx, fs_scale);

      oold_exp_fx = add(oold_Ltot_exp_fx, scale_sh);
      old_exp_fx = add(old_Ltot_exp_fx, scale_sh);

      /*re-normalize L_mantissas and adjust exps */
      margin_oold = norm_l(L_oold_tmp);
      L_oold_tmp = L_shl_pos(L_oold_tmp, margin_oold);
      oold_exp_fx = sub(oold_exp_fx, margin_oold);

      margin_old = norm_l(L_old_tmp);
      L_old_tmp = L_shl_pos(L_old_tmp, margin_old);
      old_exp_fx = sub(old_exp_fx, margin_old);

      /*  now time to analyze how the actual L_tot exponent scaling should be done */
      /*  bring up the lowest exp  to the same exp as the higher exp, and scale down the corresponding mantissa  */
      exp_diff = sub(old_exp_fx, oold_exp_fx); /* energy increase from oold to old  in log2 shifts */

      /* Overflow2  fix */
      exp_diff = max(-31, exp_diff);
      exp_diff = min(31, exp_diff);
      if (exp_diff > 0)
      { /*   oold_exp <  old_exp                            */
         /*  old_exp is limiting,  shift down oold mantissa */
         L_oold_tmp = L_shr_pos(L_oold_tmp, exp_diff);
      }
      if (exp_diff < 0)
      { /*  oold_exp > old_exp    */
         /*  oold_exp is limiting,  shift down old mantissa */
         L_old_tmp = L_shr_pos(L_old_tmp, negate(exp_diff));
      }
      oold_exp_fx = max(oold_exp_fx, old_exp_fx);
      old_exp_fx = oold_exp_fx;  

      /* safety set lowest energy to 2   , as one bit is shifted away in avg calculation */
      L_oold_tmp = max(L_oold_tmp, 2L);
      L_old_tmp = max(L_old_tmp, 2L);

      for(k = 0; k < Lgw; k++) /* NB Lgw may be shorter than all defined bands , e.g at at 48k */
      {
         L_gr_pow_left[k] = Mpy_32_16_asm(L_oold_tmp, oold_grp_shape_fx[k]);
         L_gr_pow_right[k] = Mpy_32_16_asm(L_old_tmp, old_grp_shape_fx[k]);

         /*Xavg[k] = sqrt(0.5f*(gr_pow_left[k]+gr_pow_right[k])/(float)(gw[k+1]-gw[k]));*/
         Xavg_exp_fx = sub(old_exp_fx, 1); /* virtual pre divide X_avg  by 2 too keep precision in summation */
         L_acc = L_add(L_shr_pos(L_gr_pow_left[k], 1), L_shr_pos(L_gr_pow_right[k], 1));
         L_acc = L_shr_pos(L_acc, gw_len_inv_shift_fx[k]); /* divide by (bandwidth/2) in bins   */

         { /* new Xavg_fx calculation */                 
            L_acc = max(L_acc, 1L);
            tmp = norm_l(L_acc);
            Xavg_exp_fx = sub(Xavg_exp_fx, tmp);
            L_acc = L_shl_pos(L_acc, tmp); /* now between 0.5 an 1.0*/

            expo_in = add(Xavg_exp_fx, 0);
            man_in = round_fx_sat(L_acc);

            /* now allow both positive and negative expos into sqrt  */
            man = sqrt2ndOrder(man_in);
            if (s_and(expo_in, 1) != 0)
            {
               man = mult_r(man, FEC_HQ_ECU_ROOT2); /* odd exp operation */ /* 1/sqrt(2) */
            }
            expo = shr_r(expo_in, 1); /*  apply even part of exp , square root operation. shr_r needed for positive side exps */



            L_acc = L_deposit_h(man);
            Xavg_exp_fx = add(expo, 0);
            /*Note: sqrt approximaton may overshoot  e.g- sqrt(1.0) may become 1.0001 i.e. saturation is needed when eventually applying expo  */


    /*  Xavg (unscaled flt in L_acc*2^(exp-31)) needs to be saved in the same scale + Q as the stored 16bit
     *  Xsav_fx, for use in subst_spec() */
     /*   move Xavg   fft scale  to fx domain fx-fft scale*/
            L_acc = Mpy_32_16_asm(L_acc, PhEcu_Xsav_Flt2FxScaleQ15[fs_idx]); /* fs fixed fractional change */
            Xavg_mod_exp_fx = sub(Xavg_exp_fx, PhEcu_Xsav_Flt2FxDnShift[fs_idx]);  /* fs fixed         exp change*/
            Xavg_mod_exp_fx = add(Xavg_mod_exp_fx, Q_spec);                        /* signal adaptive  exp change*/

            /*   :: move to  Q_spec domain of Xsav ,  Q fixed in  first BFI frames  */

            /* extract Q0 value shift so that the mantissa is in the high part with  man*2,^(0-15) */
            exp_diff = sub(15, Xavg_mod_exp_fx);


            exp_diff = min(31, exp_diff); /* limit to meaningfull DSP shifts  as  described by up to 6 bits  */
            exp_diff = max(-32, exp_diff);
            if (exp_diff > 0)
            {
               L_acc = L_shr_pos(L_acc, exp_diff); /* may underflow */
            }

            if (exp_diff < 0)
            {
               L_acc = L_shr_sat(L_acc, exp_diff);
            }
            Xavg[k] = round_fx_sat(L_acc); /* extract high part */

         } /*end of new Xavg_fx calculation */
        /* internal transition detection  */

         { /* pure percentage based transient detection  */
            thresh_tr_rise_lin_Q15 = PhEcu_frac_thr_rise_lin_Q15[k];
            thresh_tr_decay_lin_Q15 = PhEcu_frac_thr_decay_lin_Q15[k];

            /* analyse rise */
            /* one of L_left or  L_right should be pre-upshifted to a near max  mantissa, (in one band ) */
            L_tmp2 = L_deposit_h(0);
            L_tmp = Mpy_32_16_asm(*L_pGrPowRight, thresh_tr_rise_lin_Q15);
            if (L_sub(*L_pGrPowLeft, L_tmp) <= 0)
            {
               L_tmp2 = L_deposit_l(1);
            }

            if (*L_pGrPowLeft == 0) /* denominator zero special cases */
            {
               /* rise:   Right/Left ;  " * / 0 " --> tr_rise=1 ;  "0/0"  --> tr_rise = 0 */
               L_tmp2 = min(*L_pGrPowRight, 1L);
            }
            tr_rise[k] = extract_l(L_tmp2);   

            /* analyse decay */
            L_tmp2 = L_deposit_h(0);
            L_tmp = Mpy_32_16_asm(*L_pGrPowLeft, thresh_tr_decay_lin_Q15);
            if (L_sub(L_tmp, *L_pGrPowRight) >= 0)
            {
               L_tmp2 = L_deposit_l(1);
            }
            if (*L_pGrPowRight == 0) /* right side no energy  ,  special cases */
            {
               /* decay:   Right/Left ;  " 0 / * " --> tr_decay=0 ;  "0/0"  --> tr_decay = 0 */
               L_tmp2 = L_deposit_h(0);
            }
            tr_decay[k] = extract_l(L_tmp2);  

            tr_dec[k] = max(tr_rise[k], tr_decay[k]); 

         } /* percentage tr_dec */
         /* magnitude modification, calculated for decay only  */
         if (add(tr_dec[k], att_always) != 0)
         {

#if MAX_INCREASE_GRPPOW_FX != 0
#error trans_burst_ana-- The following implementation is incorrect
#endif
            att_val = 32767;    
            if (L_sub(*L_pGrPowRight, 0) > 0)
            {
               if (L_sub(*L_pGrPowRight, *L_pGrPowLeft) < 0) /* decay , i.e., (gr_pow_right/gr_pow_left) < 1.0 */
               {
                  /* Compute sqrt(grp_pow_chg), where grp_pow_chg = gr_pow_right/gr_pow_left. */
                  tmp16 = plc_phEcu_ratio(*L_pGrPowRight, *L_pGrPowLeft, &expo); /* output tmp16 in Q14 */

                  expo  = sub(expo, (15 - 14)); /* Now, tmp16 is considered in Q15 */
                  i     = norm_s(tmp16);
                  man   = shl_pos(tmp16, i); /* Mandatory normalization before sqrtNthOrder(). */
                  expo  = add(expo, i);
                  man   = sqrt2ndOrder(man); 
                  if (s_and(expo, 1) != 0) /* Check even or odd. */
                  {
                     man = mult_r(man, FEC_HQ_ECU_ROOT2);
                  }
                  expo    = shr_pos(expo, 1); /* Divided by 2-- square root operation. */
                  att_val = shr(man, expo);   /* Denormalize the mantissa back to Q15. */
               }
               /* else
                {
                  do nothing because (gr_pow_right/gr_pow_left) >= 1.0
                }
                */
            }

            mag_chg_1st[k] = att_val;  
            mag_chg[k]     = att_val;  
         }
         else
         {
            mag_chg_1st[k] = 32767; 
            mag_chg[k] = 32767;  /* Set to ]1.0 in Q15 */
         }

         L_pGrPowLeft++;
         L_pGrPowRight++;
      } /* FOR band k */
   }
   else /* sub(burst_len, 1) <= 0) */
   {
      /* BURST path */

      /* Since attDegreeFrames is discrete (integer) and hard limited to OFF_FRAMES_LIMIT,
       * it is easier to implement 10^(-att_degree/20.0) by a simply direct
       * table-lookup. Also, att_per_frame is discrete as well and can be
       * either ATT_PER_FRAME-1 or ATT_PER_FRAME and nothing else. This
       * means only 2 tables of size=(OFF_FRAMES_LIMIT+1) each are required.
       * To take square root into account, it is divided by 20 instead of 10. */
      for(k = 0; k < Lgw; k++) /* Lgw may be shorter than all bands at 48k */
      {
         /* global burst attenuation */
 #if PLC2_FADEOUT_IN_MS   != 0 
         /* att_per_frame idx = "1:10")  */
         att_val = POW_ATT_TABLES[att_per_frame][min(OFF_FRAMES_LIMIT, attDegreeFrames)];   
#else 
         /* att_per_frame idx = "1:2")   */
         att_val = POW_ATT_TABLES[att_per_frame][min(OFF_FRAMES_LIMIT, attDegreeFrames)];   
         /* 10^(-attDegreeFrames*(att_per_frame = "1 or 2")/20) */
#endif 

         mag_chg[k] = mult_r(mag_chg_1st[k], att_val); /* Q15 */
 
         if (sub(burst_len, BETA_MUTE_THR) > 0)  /* BETA_MUTE_THR ~= (5+15)  coincides/close to  stronger 6dB muting phase  */
         {
            *beta_mute = shr_pos_pos(*beta_mute, 1);
         }

         alpha[k] = mag_chg[k];  
         ASSERT_LC3(beta[k] == 0); /* initialization required */
         if (sub(alpha[k], 32766) < 0)
         {
            /* beta_pre[k] = sqrt(1.0f - SQR(alpha[k])); */
            /* beta[k] = beta_pre[k]* *beta_mute;*/
            /* (1.0-alpha.^2), in exp 1 due to L_mult0; */

            L_acc = L_sub((INT32_MAX >> 1) + 1, L_mult0(alpha[k], alpha[k])); 
            {

               /* use lower complex(WMOPS/ROM)  2nd-order sqrt approximation */
               int32_t  L_man, L_acc2 = L_acc;
               int16_t tmp,  expo_in, expo2, man_in, man;  
               /* updated code using the 2nd order approximation routine */
               /*  form is  flt=(L_acc2*2.^(-31 + 1) */

                 tmp     = norm_l(L_acc2); /* tmp is always 1 or higher due to Lmac0 downshift */
                 man_in  = round_fx_sat(L_shl_pos(L_acc2, tmp));
                 expo_in = sub(1, tmp); /* 1  due to original 1 bit margin gain in L_mult0  */

                 /*  both positive and negative expos into sqrt  */           
                 man = sqrt2ndOrder(man_in);
                 if (s_and(expo_in, 1) != 0)
                 {
                    man = mult_r(man, FEC_HQ_ECU_ROOT2); /* odd exp operation */ /* sqrt(2)/2 */
                 }
                  
                 expo2 = shr_r(expo_in, 1); /*  apply   square root operation. shr_r needed for pos and neg  exps */
                 ASSERT_LC3(expo2 <= 1);

                 L_man = L_deposit_h(man);
                 L_man = L_shl_sat(L_man, expo2);    /* move to a zero exp ,   _sat needed for  1.0  input (due to approximation overshoot)  */

                 man   = round_fx_sat(L_man);     /* better perf with round here */


                 beta[k] = mult_r(*beta_mute, man);  
              }

            /* bw Lowpass shape additive component  */
            /* tab[LGW48K + 1] = { 1.0, ....1.0,    0.5,0.5, ... 0.1, 0.1  } */

            if (sub(k, LGW32K - 1) >= 0)
            {
               beta[k] = mult_r(beta[k], 3277); /* 0.1 in Q15 */
            }
            else if (sub(k, LGW16K - 1) >= 0)
            {
               beta[k] = mult_r(beta[k], 16384); /* 0.5 in Q15 */
            }

            /*
            % limit Xavg noise contribution further in case of offset/tr_decay
            % attenuation was already active

             if (burst_len <= burst_att_thresh)  && ( stPhECU_mag_chg_1st(k) < (32766/32768) )
                 XavgFadeinFactor = (burst_len-1)/burst_att_thresh;
                 XavgFadeinFactor = min(1.0, XavgFadeinFactor);
                 beta(k)          = beta(k)*XavgFadeinFactor;
                 % limit initial Xavg noise contribution until We have reached regular burst attenuation
             end
           end
           */
            if ( sub(mag_chg_1st[k], 32767) <0 )
            {   /* offset muting was started before  burst muting phase */
                /* Xavg  noise gradually increased during a short period */
               int16_t XavgFadeinFactor = 32767;
               int16_t ratio2_3_4_5tab[4][5 - 1] = {
                  {(int16_t)(.5 * 32768.0), (int16_t)(1.0 * 32767.0), (int16_t)(1.0 * 32767.0), (int16_t)(1.0 * 32767.0)}, /* 1/2*/
                  {(int16_t)(.333 * 32768.0), (int16_t)(.666 * 32768.0), (int16_t)(1.0 * 32767.0), (int16_t)(1.0 * 32767.0)}, /* 1/3*/
                  {(int16_t)(.25 * 32768.0), (int16_t)(.5 * 32768.0), (int16_t)(.75 * 32768.0), (int16_t)(1.0 * 32767.0)}, /* 1/4 */
                  {(int16_t)(.2 * 32768.0), (int16_t)(.4 * 32768.0), (int16_t)(.6 * 32768.0), (int16_t)(.8 * 32768.0)} /* 1/5 */
               
               };
               ASSERT_LC3(burst_att_thresh >= 1 &&  burst_att_thresh <= 5);
               ASSERT_LC3(burst_len >= 2);
               if (sub(burst_len,burst_att_thresh) <= 0)
               {
                   ASSERT_LC3(burst_len - 2 < (5-1));
                   ASSERT_LC3(burst_att_thresh-1-1 < (4));
                   XavgFadeinFactor = ratio2_3_4_5tab[burst_att_thresh-1-1][burst_len - 2]; /* second bfi frame burst_len= is 2  */
               }
               beta[k] = mult_r(beta[k], XavgFadeinFactor); /*  n Q15 */
            }
         } /*  if (sub(alpha[k], 32766) < 0)     */
      } /* for k*/

   } /* BURST */

 

   if (sub(output_frame, L_FRAME48K) == 0)
   { /* for 48kHz set/handle scalings of last group/band the same way as previous lower freq band(s)  */

      for(k = Lgw; k < MAX_LGW; k++)
      {
         tr_dec[k]      = tr_dec[k - 1];       /* only available in first bfi frame */
         Xavg[k]        = Xavg[k - 1];        
         mag_chg_1st[k] = mag_chg_1st[k - 1]; 
         mag_chg[k]     = mag_chg[k - 1];     
         alpha[k]       = alpha[k - 1];         
         beta[k]        = beta[k - 1];        
      }
   }
   
}

/*-----------------------------------------------------------------------------
 * imax_fx()
 *
 * Get interpolated maximum position
 *-----------------------------------------------------------------------------*/
static int16_t imax_fx(                      /* o: The location, relative to the middle of the 3 given data point, of the maximum. (Q15) */
                     const int16_t *y,      /* i: The 3 given data points. */
                     const int16_t  special /* i: -1 = left edge special case, 0 = normal, +1 = right edge special case */
)
{
   int16_t        posi;
   int16_t        man, expo, edge;
   const int16_t *pY;
   int32_t        L_y1, L_y2, L_y3, L_numer, L_denom, L_sign, L_acc, L_y3_y1;

   //TRACE("PhECU::imax_fx");

   /* Seek the extremum of the parabola P(x) defined by 3 consecutive points
      so that P([-1 0 1]) = [y1 y2 y3] */
   pY = y;
   L_y1 = L_deposit_l(*pY++), L_y2 = L_deposit_l(*pY++), L_y3 = L_deposit_l(*pY);

   /* The extremum value:
    *   y2i = -0.125f * SQR(y3_y1) / (y1+y3-2*y2)+y2
    * is not computed. Alternatively, the derivative of the parabola evaluated at y=0,
    * dP/dy|y=0, is used to determine whether the extremum is maximum or not.
    */

    /* Compute the extremum location: posi = (y3 - y1)/(4*y2 - 2*y1 - 2*y3). */
   L_y3_y1 = L_sub(L_y3, L_y1);
   L_acc = L_shl_pos(L_y2, 1);      /* N.B. y2 is multiplied by 2 not 4. */
   L_acc = L_sub(L_acc, L_y1);      /* N.B. Y1 is not multiplied by 2. */
   L_denom = L_sub(L_acc, L_y3);      /* N.B. Y3 is not multiplied by 2. */
   L_sign = L_xor(L_y3_y1, L_denom); /* Preserve the sign since div_s() only takes positive arguments. */
   L_numer = L_abs(L_y3_y1);
   L_denom = L_abs(L_denom);

   
   if (L_numer == 0 || L_denom == 0)
   {
      posi = 0;  /* flat top , exit with center freq. */
   }
   else
   {

      if (L_sub(L_denom, L_shr_pos_pos(L_numer, 1)) > 0)
      {
      /* Although the output of ratio() is in Q14, adding the missing factor of 2 (See above)
       * in the denominator, the output is now considered to be in Q15. */
      man = plc_phEcu_ratio(L_numer, L_denom, &expo); /* The mantissa is considered in Q15 */

      posi = shr_sat(man, expo); /* in Q15 (Due to saturation, it is automatically bound inside [-1.0,1.0].) */
   }
   else
   {
      posi = 0x7fff; 
   }

   if (L_sign < 0) /* Restore the sign. */
   {
      posi = negate(posi);
   }

   /* For both edges (left and right), the extremum found above may be minimum.
    * It needs to reject the minimum. */
   if (special != 0) /* Either edge special case. */
   {
      edge = 0x7fff; /* 1 in Q15 for the right edge special case */ 
      if (special < 0)
      {
         edge = 0; /* Left edge special case */ 
      }

      /* The derivative (slope) of the interpolating parabola = 2*A*y + B,
       *   where A = (y3 + y1)/2 - y2
       *     and B = (y3 - y1)/2.
       * Therefore, the slope at y=0 is simply B. Use this slope to determine
       * if the parabola is concave upward or downward.
       */
      if (posi > 0) /* The extremum is in between the middle and the right given data points. */
      {
         posi = sub(0x7fff, posi);   /* maximum case */
         if (L_sub(L_y3, L_y1) <= 0) /* Check the slope at y=0, i.e., at the middle given data point. */
         {
            posi = edge; /* minimum case */ 
         }
      }
      else /* The extremum is in between the left and the middle given data points. */
      {
         posi = add(0x7fff, posi); /* maximum case */
         if (L_sub(L_y3, L_y1) >= 0)
         {
            posi = edge; /* minimum case */ 
         }
      }
   }
   }   
   return posi; 
   /* Q15. The position either left or right relative to the index of the middle of the 3 given data   points. */
}

      /*-----------------------------------------------------------------------------
       * spec_ana()
       *
       * Spectral analysis
       *-----------------------------------------------------------------------------*/
       /* OPT add the FB transient input flags , and skip peakfinder if fullband transient is set */
      void spec_ana(int16_t *     xfp,          /* i/o : Input 16ms pre-upscaled time signal,  output  xfp utility buffer */
         int16_t *     plocs,        /* o : The indicies of the identified peaks             Q0  */
         int32_t *     L_plocsi,     /* o : Interpolated positions of the identified peaks   Q16 */
         int16_t *     num_plocs,    /* o : Number of identified peaks                       Q0  */
         int16_t *     X_sav,        /* o : Stored fft spectrum                                  */
         const int16_t output_frame, /* i : Frame length                                     Q0  */
         const int16_t bwidth_fx,    /* i : Encoded Fs        index                          Q0  */
         const int16_t *sp_ana_win,      /* i : spectral analysis window                         Q15 */
         const int16_t  f0hzLtpBinQ7,    /* i : LTP bin frequency in normalized Hz                Q7 */
         const int16_t  norm_corrQ15_fx, /* i : correlation for lag at f0hzLtpBinQ7                  */
         int16_t maxLprot, int16_t maxPlocs,
         int8_t *scratchBuffer /* Size = 4 * (MAX_LPROT + MAX_LPROT_RED + 1) + 2 * MAX_PLOCS */
      )
      {
         int32_t n, k;
         int16_t  nJacob, Lprot, hamm_len2 = 0, Lprot2, Lprot2p1;
         int32_t *L_xfp;

         int16_t *pXfp;
         int16_t *pPlocs;
         int16_t  Xmax, Xmin, sens;
         int16_t  rectLength, fraction;
         int32_t *pPlocsi_L;
         int32_t  L_acc;
         int16_t  peak_range_1;
         int16_t  stop_band_start;
         int16_t  stop_band_length;
         int16_t  fft_scale;
         int8_t * buffer_fft;
         int16_t currPlocs, endPlocs;
         int16_t P_in_plocs;

         //TRACE("PhECU::spec_ana(1st)");
         /* Initialize for 48k to avoid warnings
            Lprot            -  length of saved prototype samples
            hamm_len2        -  half Hamming window length
            pFftTbl          -  Table for real input FFT
            LprotLog2Minus1  -  FFT stages for complex input FFT
         */


         L_xfp = (int32_t *)scratchBuffer;       /* Size = 4 * MAX_LPROT bytes */
         buffer_fft = (int8_t *)(((uint8_t *)L_xfp) + sizeof(*L_xfp) * maxLprot); /* Size = 4 * (MAX_LPROT_RED + 1) + 2 * MAX_PLOCS */

         ASSERT_LC3(bwidth_fx >= 0 && bwidth_fx <= 4); /* avoid  bwidth_fx  variable warning */

         Lprot = LprotSzPtr[bwidth_fx];
         
         hamm_len2 = i_mult(3, mult(output_frame, (int16_t)(3277) /* divBy10 + floor */)); /* 3 ms */
         fft_scale = PhEcuFftScale[bwidth_fx];
          /* 32,16,8 kHz all have  fft scale 0, 24 has 8, 48 has 4  */
         Lprot2 = shr_pos(Lprot, 1);
         Lprot2p1 = add(Lprot2, 1); /* Magnitude lengths  */
         rectLength = sub(Lprot, shl_pos(hamm_len2, 1));
         /* The length of the rectangular portion of the Hamming-Rectangular window. */
         {
            //TRACE("PhECU::WhrAnaWin+fft");

      /* Apply hamming-rect window */
            windowing_L(xfp, L_xfp, sp_ana_win, rectLength, hamm_len2);
            LC3_rfftN(L_xfp, Lprot, &fft_scale, buffer_fft);
         }
          /* anawin+fft */

         /* Convert 32 Bit intlv FFT into phecu 16 bit flipped fft  format */
         /* can not yet be an inplace operation */

         intlvW32_2_flippedW16(L_xfp, sub(Lprot2, 1), Lprot, xfp);

         /* Apply zeroing of non-coded FFT spectrum above 20 kHz */
         if (sub(output_frame, ((L_FRAME48K) * 40) / 48) >= 0) /* only relevant for 48kHz in LC3 */
         {
            stop_band_start = ((LPROT48K / 2) * 40) / 48; /* initial start position in real part , 320  */
            stop_band_length = ((LPROT48K * 8) / 48) - 1;  /* real tail and into  Im parts ,        128-1 */
            stop_band_start = add(stop_band_start, 1);    /* exclude DC   ... */

            memset(xfp + stop_band_start, 0, (stop_band_length) * sizeof(int16_t));
         }

         peak_range_1 = min(Lprot2p1, MAX_LPROT_RED / 2 + 1); /* limit preliminary only active for 48k  to save WMOPS */

         memmove(X_sav, xfp, (Lprot) * sizeof(int16_t));

         /* Magnitude representation */
         fft_spec2_sqrt_approx_fx(xfp, xfp, Lprot);
         /*  inplace, i.e. [ Dc, real part of xfp ,Fs/2 ]  will be replaced by magnitude(scaled by .5) */

         /* Find global maximum and minimum. */
         plc_phEcu_maxval(xfp, peak_range_1, &Xmax);
         plc_phEcu_minval(xfp, peak_range_1, &Xmin);
         sens = mult_r(sub(Xmax, Xmin), CMPLMNT_PLOC_SENS_FX);
   
         plc_phEcu_peak_locator(xfp, peak_range_1, plocs, num_plocs, sens, Xmax, Xmin, MAX_LPROT_RED, buffer_fft);


         //TRACE("PhECU::Peaks_refine");

         /* Refine peaks */
         pPlocsi_L = L_plocsi;
         pPlocs = plocs;
         /*    n = sub(*num_plocs, 1); */ /* -1 so as to exclude the very last peak. */
         n = *num_plocs;                  /* number of peaks to process */
         /* Special case-- The very 1st peak if it is at 0 index position (DC) */
         /* With DELTA_CORR_F0_INT == 2 one needs to handle both *pPlocs==0 and *pPlocs==1 */
         
         if ((n > 0) && (sub(*pPlocs, 0) == 0)) /* Very 1st peak position possible to have a peak at 0/DC index position. */
         {
            fraction = imax_fx(xfp, -1); /* -1 signifies special left edge case. */
            L_acc = L_deposit_h(*pPlocs++); /* N.B., (*pPlocs) must be zero here. */
            *pPlocsi_L++ = L_mac(L_acc, fraction, 1);        /* in Q16 */
            n = sub(n, 1); /* This special case is taken care of -- one less  peak to go */
         }
         
         if ((n > 0) && (sub(*pPlocs, 1) == 0)) /* Also 2nd peak position uses DC which makes jacobsen unsuitable. */
         {
            fraction = imax_fx(xfp, 0); /* for parabolic this is not a special case. */
            L_acc = L_deposit_h(*pPlocs++); /* N.B., (*pPlocs) must be 1 here. */
            *pPlocsi_L++ = L_mac(L_acc, fraction, 1);          /* in Q16 */
            n = sub(n, 1); /* This special case is taken care of -- one less  peak to go */
         }

         /* All remaining peaks except the very last two possible integer positions    */
         currPlocs = *pPlocs++;  
         endPlocs = sub(Lprot2p1, DELTA_CORR_F0_INT); /* last *pPlocs position for Jacobsen */

            /* precompute number of turns based on endpoint integer location  and make  into  a proper for loop */      
            if (n > 0)
            {
               nJacob = n;  
               if ( sub( endPlocs, plocs[sub(*num_plocs, 1)]) <= 0  )
               {
                  nJacob = sub(nJacob, 1);
               }

               for(k = 0;  k < nJacob; k++)
               {        
                   fraction = imax2_jacobsen_mag_fx(&(X_sav[currPlocs - 1]), &(X_sav[Lprot - 1 - currPlocs]), 0);    /* in Q15 */ /* not endpoint */
                      /* account for inloop indirect  ptrs into Xsav   */
                  
                   L_acc        = L_deposit_h(currPlocs);
                   *pPlocsi_L++ = L_mac(L_acc, fraction, 1);  /* in Q16. Append the fractional part to the integral part. */
                   currPlocs    = *pPlocs++;  
               }
               n = sub(n, nJacob);
            }

         /* At this point there should at most two plocs left to process */
         /* the position before fs/2 and fs/2 both use the same magnitude points */

         if (n > 0)
         {
            /* [ . . .            .  .  .  . ]   Lprot/2+1 positions  */
            /*   |                   |     |           */
            /*   0         (Lprot/2-2)     (Lprot/2)   */

            pXfp = xfp + sub(Lprot2, 2);
            if (sub(currPlocs, sub(Lprot2p1, DELTA_CORR_F0_INT)) == 0)
               /* Also 2nd last peak position uses fs/2  which makes jacobsen less  suitable. */
            {
               fraction = imax_fx(pXfp, 0); /* for parabolic this is not a special case. */

               L_acc = L_deposit_h(currPlocs); /* N.B., (*pPlocs) must be 1 here. */
               *pPlocsi_L++ = L_mac(L_acc, fraction, 1);  /* in Q16 */
               currPlocs = *pPlocs++;                    
               n = sub(n, 1); /* This special case is taken care of -- one less  peak to go */
            }

            /* Here the only remaining point would be a  fs/2 plocs */
            /*    pXfp = xfp + sub(Lprot2,1); already set just a reminder where it whould point */
            if (n > 0) /* fs/2 which makes special case . */
            {
               fraction = imax_fx(pXfp, 1); /* for parabolic this is a special case. */

               L_acc = L_deposit_h(currPlocs); /* N.B., (*pPlocs) must be 1 here. */
               *pPlocsi_L++ = L_mac(L_acc, fraction, 1);    /* in Q16 */
               currPlocs = *pPlocs++; 
               n = sub(n, 1); /* This special case is taken care of -- one less  peak to go */
            }
         }

         /* here n should be 0 if all peaks  have been processed */
         ASSERT_LC3(n == 0);

         /* Check number of plocs   within an assumed pitch range */
         P_in_plocs = 0; 
         for(n = 0; n < *num_plocs; n++)
         {
            /* count number of peaks in  locations   1,2,3,4,5,6   , ~= 60 Hz ... 380 Hz */
            fraction = min(1, plocs[n]); /* 0 stays zero , otherwise 1  */
            if (sub(plocs[n], 7) < 0)
            {
               P_in_plocs = add(P_in_plocs, fraction);
            }
         }

          /* peaks refine */

         
         if (f0hzLtpBinQ7 > 0 && P_in_plocs > 0)
         {
            int16_t n_plocs_in, n_plocs_out;

            n_plocs_in = *num_plocs;  

            /* NB LF peak analysis may add adjacent peaks in { plocs, L_plocsi},  (output from peakfinder did not have
             * adjacent peaks ) */
            plc_phEcu_LF_peak_analysis(plocs /* i/o */, num_plocs /* i/o */, L_plocsi /* i/o */, xfp, f0hzLtpBinQ7,
               norm_corrQ15_fx, 2, maxPlocs, buffer_fft);
            n_plocs_out = *num_plocs;   

            if (sub(n_plocs_in, n_plocs_out) == 0)
            {
               /* adjust first peak coinciding  with LTPF0  measures if it indicates  so */
               plc_phEcu_F0_refine_first(plocs /* i/o */, *num_plocs, L_plocsi /* i/o */, f0hzLtpBinQ7, norm_corrQ15_fx,
                  3);
            }
         }
         /*    moved inside spec_ana  , to include validated pitch peak  P_in_plocs*/
         {
            int16_t peak_limits_fx[5] = { 14 /*NB*/, 14 /*WB*/, 14 /*sWB*/, 14 /*SWB*/,
                                 14 /* FB */ }; /* to be trained for each BW */

            
            
            if ((sub(norm_corrQ15_fx, 0) > 0) && /* == 0 indicates a negative correlation,  which could be likely stable   */
               (sub((int16_t)(0.5 * 32768), norm_corrQ15_fx) > 0) && (sub(*num_plocs, peak_limits_fx[bwidth_fx]) > 0))
            {
               if (P_in_plocs > 0)
               {
                  *num_plocs = 0;  /*activate noise only path only if normcorr vas valid energywise   */
               }
            }
         }
         
      }

      /*-------------------------------------------------------------------*
       * subst_spec()
       *
       * Substitution spectrum calculation
       *-------------------------------------------------------------------*/

      void subst_spec(
         const int16_t *plocs,        /* i   : The indices of the identified peaks                Q0  */
         const int32_t *L_plocsi,     /* i   : Interpolated positions of the identified peaks     Q16 */
         int16_t *      num_plocs,    /* i/o : Number of identified peaks                         Q0  */
         const int16_t  time_offs,    /* i   : Time offset                                        Q0  */
         int16_t *      X,            /* i/o : FFT spectrum                                           */
         const int16_t *mag_chg,      /* i   : Magnitude modification                             Q15 */
         const int16_t  ph_dith,      /* i   : Phase dither, 2*PI is not included. (Q15, i.e., between 0.0 and 1.0) */
         const int16_t *is_trans,     /* i : (Transient) noise generation flags (either 0 or not 1 )             */
         const int16_t  output_frame, /* i   : Frame length                                       Q0  */
         int16_t *      seed,         /* i/o : Random seed                                            */
         const int16_t *alpha,        /* i   : Magnitude modification factors for fade to average Q15 */
         const int16_t *beta,         /* i   : Magnitude modification factors for fade to average Q15 */
         const int16_t *Xavg,         /* i   : Frequency group averages to fade to                Q0  */
         const int16_t  t_adv         /* i   : time adjustement excluding time_offs               Q0  */
      )
      {
         int16_t  Xph_short;
         int32_t  L_corr_phase[MAX_PLOCS], L_Xph;
         int32_t *pCorrPhase_L;
         int16_t  cos_F, sin_F, tmp;
         int16_t peak_sin_F, peak_cos_F;
         int16_t sin_F_fade2avg, cos_F_fade2avg;
         int16_t fs_idx;
         int16_t        Lprot, m, i, e, im_ind, delta_corr_up, delta_corr_dn, delta_tmp;
         uint16_t       lsb;
         int16_t        j, re, im, *pReX, *pImX, lastPeak, lprotBy2Minus1, segmentLen;
         int16_t        pkLocation_1, pkLocation, pkLocation1;
         const int16_t *pPlocs;
         const int32_t *pPlocsi_L;
         int32_t        L_acc;
         int16_t        Lprot_inv;
         int16_t        k;
         int16_t        tmp2;
         int16_t        alpha_local;
         int32_t        tmp_L;
         int16_t        mag_chg_local;
         const int16_t *gwlpr_fxPlus1;
         int16_t one_peak_flag_mask;
         int16_t noise_mag_scale_neg;
         int16_t up_shift_adj;

         if (time_offs == 0)
         {
            //TRACE("PhECU::subst_spec(1st)");
         }
         else
         {
            //TRACE("PhECU::subst_spec(N)");
         }

         gwlpr_fxPlus1 = &(gwlpr_fx[1]); /* ptr init */
         fs_idx = mult(output_frame, (int16_t)(32768.0 / 99.0)); /* truncation needed , i.e no rounding can be applied here */
         ASSERT_LC3(fs_idx == (output_frame / 100));
         Lprot = LprotSzPtr[fs_idx];
         Lprot_inv = InvLprot_Q22[fs_idx];  


#ifdef  NONBE_PLC2_MUTING_DCSYNT_FIX 
         tmp2 = add(mult_r(time_offs, oneOverFrameQ15Tab[fs_idx]), 1);/* save a local burst_len for  securing DC  and fs/2 muting */
#endif


         /* Correction/evolution  phase of the identified peaks */
         if (s_or(is_trans[0], is_trans[1]) != 0)
         {
            *num_plocs = 0; 
         }
         else
         {

            tmp = t_adv;

            tmp = add_sat(tmp, time_offs);
            /*  NB tmp can be stored in int16_t Q0  as max used value is  684+(OFF FRAMELIMIT==60)*480 =  29484 */
            tmp_L = L_mult0(tmp, Lprot_inv);


            tmp = norm_l(tmp_L);
            up_shift_adj = max(0, sub(4, tmp)); /* 48kHz :  PLC frame  1..49 ->   tmp_L<<4  ,  frame 50..60 -> tmpL<<3  */
            tmp_L = L_shl_sat(tmp_L, sub(4, up_shift_adj));
            tmp = round_fx_sat( tmp_L); 


            pPlocsi_L = L_plocsi;
            pCorrPhase_L = L_corr_phase;
            for(m = 0; m < *num_plocs; m++)
            {

               /* tmp has variable resolution 10 or 9 bits  */
               ASSERT_LC3( up_shift_adj >= 0);
               Mpy_32_16_ss(L_shl_pos(*pPlocsi_L++, up_shift_adj), tmp, &L_acc, &lsb);
               L_acc = L_add(L_shl_pos(L_acc, 5),  lshr(lsb, 11));
               /*  5 lsb's actually unused though, as 6 bits are shifted out  */
               *pCorrPhase_L++ = L_acc; /* in Q16. 2*PI is not included. */            
            }
         }

         one_peak_flag_mask = (int16_t)0xFFFF;  /* all ones mask -> keep  */
         
         if ((*num_plocs > 0) && sub(*num_plocs, 3) < 0)
         {
            one_peak_flag_mask = 0x0000;   /* all zeroes  mask -> zero  */
         }

         noise_mag_scale_neg = 0;   /* no change of valley noise magnitude */
         
         if ((*num_plocs == 0) || (time_offs != 0))
         { /* only adj_scale noise amplitude when we have no WC path , or in  all noise frame  */
            noise_mag_scale_neg = -32768;  /* all ones --> scale_noise   */
         }

         if (*num_plocs == 0)
         {
            X[0]                 = 0;   /* reset DC if there are no  peaks */
            X[shr_pos(Lprot, 1)] = 0;   /* also reset fs/2 if there are no peaks */
         }

#ifdef  NONBE_PLC2_MUTING_DCSYNT_FIX 
         if (sub(tmp2, (BURST_ATT_THRESH+1)) > 0)
         {
            /*   also start DC  scaling attenuation  */
            X[0] = mult(alpha[0], X[0]); 
            /*  start fs/by2   attenuation  */
            X[shr_pos(Lprot, 1)] = mult(alpha[min(add(fs_idx, LGW8K), LGW48K)], X[shr_pos(Lprot, 1)]); 
         }
#endif



         lprotBy2Minus1 = sub(shr_pos(Lprot, 1), 1);

         /* for 48k the last (63+1+63) 128/2-1   values above  20 kHz   are always zeroes */
         { /*  after a last, peak  no need to evolve above  20kHz  ,  those coeffs have been/ will be zeroed already */
            /*     DC, Xused,ReZeroed, fs/2, ImZeroed, ImUsed    */
            /*N:    1,  320 , 63      , 1   ,  63    , 320       */
            /*Cind: 0, 1-320, 321-383 , 384 , 385-447, 448 -767  */
            lprotBy2Minus1 = min( lprotBy2Minus1, 320); 
            /*only process up to bin X[320] , 63 coeffs X[321]  fwd should already be zeroed  */
         }

         i = 1;  /* index in the X[DC, ReX part of X_Sav ,i.e  *pReX == X[i]  */
         k = 0; 

         pReX         = X + i;
         im_ind       = (Lprot - 1); /* ptr init */
         pImX         = X + im_ind;
         pPlocs       = plocs;
         pCorrPhase_L = L_corr_phase;
         pkLocation   = *pPlocs;    /* N.B. No post-increment */
         pkLocation1  = *pPlocs++;  
         lastPeak     = sub(*num_plocs, 1);
         for(m = 0; m < *num_plocs; m++)
         {
            pkLocation_1 = pkLocation; /* plocs[m - 1] */ 
            pkLocation   = pkLocation1; /* plocs[m] */
            pkLocation1  = *pPlocs++; /* plocs[m + 1] */ 
            delta_tmp = shr_pos(sub(sub(pkLocation, pkLocation_1), 1), 1);
            if (m == 0)
            {
               delta_tmp = DELTA_CORR;   /* first peak special case */
            }
            delta_corr_dn = min(delta_tmp, DELTA_CORR);

            delta_tmp = shr_pos(sub(sub(pkLocation1, pkLocation), 1), 1);
            if (sub(m, lastPeak) >= 0)
            {
               delta_tmp = DELTA_CORR; 
            }
            delta_corr_up = min(delta_tmp, DELTA_CORR); /* last peak special case */


            /* Input Xph */
            segmentLen = sub(sub(pkLocation, delta_corr_dn), i); /* may be negative */

            ASSERT_LC3(pReX == &(X[i]));
            ASSERT_LC3(*pReX == X[i]); /*before first, nth valley*/

            for(j = 0; j < segmentLen; j++) /* valley section , may be skipped for segmentlen < 0 */
            {

               *seed = rand_phase(*seed, &sin_F, &cos_F);

               /* phase scrambling */
               rotate_W16_fx(*pReX, *pImX, cos_F, sin_F, &tmp, &im); /* tmp=real part, should be inlined */
               UNUSED(re);

               /* i.e. add a bit of magnitude scrambling around 1.0 in longer bursts  */
               *seed = rand_phase(*seed, &sin_F_fade2avg, &cos_F_fade2avg);
               if (noise_mag_scale_neg != 0)
               {
                  valley_magnitude_adj_fx(&tmp, &im, *seed, cos_F);
                  /* use two random variables */ /*reuse cosF from regular X scrambling, + reuse  *seed from fade2avg
                                          */
               }
                
               if ( beta[k] != 0 )
               {
                  alpha_local = alpha[k]; /* no move as alpha_local is only needed for debug */
                  /* the fade2avg mixing  branch,  fade2avg and transient downscaling and evolution rotation   */
                  tmp2 = mult_r(beta[k], Xavg[k]);

                  {
                     tmp2 = s_and(tmp2, one_peak_flag_mask);
                     tmp  = s_and(tmp, one_peak_flag_mask);
                     im   = s_and(im, one_peak_flag_mask);
                  }

                  *pReX++ = mac_r(L_mult(alpha_local, tmp), tmp2, cos_F_fade2avg); 
                  *pImX-- = mac_r(L_mult(alpha_local, im), tmp2, sin_F_fade2avg); 
               }
               else
               { /* the no fade2avg mixing  branch,  only transient downscaling and evolution rotation   */
                  {
                     tmp = s_and(tmp, one_peak_flag_mask);
                     im  = s_and(im, one_peak_flag_mask);
                  }
 

                  *pReX++ = mult_r(mag_chg[k], tmp); 
                  *pImX-- = mult_r(mag_chg[k], im);  
               }
               i = add(i, 1);
               ASSERT_LC3(pReX == &(X[i])); /* nth Valley */
               ASSERT_LC3(*pReX == X[i]);   /* nth Valley */
               if (sub(i, gwlpr_fxPlus1[k]) >= 0)
               {
                  k = add(k, 1);
               }
            } /* segment_len  1st++  etc  valley excluding last */

            /*  peak area section */

            e = min(lprotBy2Minus1, add(pkLocation, delta_corr_up));
            segmentLen = sub(e, sub(i, 1));


            L_Xph = *pCorrPhase_L;   
            /*  rounding here, add "0.5"  before extracting the 10 bits for table lookup                          */
            Xph_short = s_and(extract_l(L_shr_pos_pos(L_add(L_Xph, (1L << (16 - 10 - 1))), 16 - 10)), 0x3ff);
            /* 10 bits precision after radix point, for a virtual 0-1023 sin/cos table lookup */


            get_sin_cosQ10opt(Xph_short, &peak_sin_F, &peak_cos_F);


            ASSERT_LC3(pReX == &(X[i])); /*before peak*/
            for(j = 0; j < segmentLen; j++)
            {
               mag_chg_local = mag_chg[k];  /* mag_chg_local actually only need for debugging , no move16()*/
 
               UNUSED(ph_dith);
               *seed = extract_l(L_mac0_1(13849, *seed, 31821));
               rotate_W16_fx(*pReX, *pImX, peak_cos_F, peak_sin_F, &tmp, &im); /* should be inlined */
               UNUSED(re);

               *seed = rand_phase(*seed, &sin_F, &cos_F);        

               if ( beta[k] != 0 )
               { /*  fade2avg path    alpha*X_sav + beta *Xavg  */
                  alpha_local = mag_chg_local; /* no move alpha_local only needed for dbg */
                  tmp2 = mult_r(beta[k], Xavg[k]);


                  *pReX++ = mac_r(L_mult(alpha_local, tmp), tmp2, cos_F);  
                  *pImX-- = mac_r(L_mult(alpha_local, im), tmp2, sin_F);  
               }
               else
               {
                  *pReX++ = mult_r(mag_chg_local, tmp); 
                  *pImX-- = mult_r(mag_chg_local, im); 
               }

               i = add(i, 1);
               ASSERT_LC3(pReX == &(X[i]));
               ASSERT_LC3(*pReX == X[i]);
               if (sub(i, gwlpr_fxPlus1[k]) > 0)
               {
                  k = add(k, 1);
               }
            } /* segment_length Peak*/
            pCorrPhase_L++;
         }

         segmentLen = sub(lprotBy2Minus1, sub(i, 1)); /* tail/valley    noise-bins */

         /* for 48k the last 63+1+63 =   values above  20 kHz   */
         { /*  after last, peak  no need to scramble above  20kHz  ,  those coeffs have been/ will be zeroed already */
            /*     DC, Xused,ReZeroed, fs/2, ImZeroed, ImUsed    */
            /*N:    1,  320 , 63      , 1   ,  63    , 320       */
            /*ind:  0, 1-320, 321-383  ,384 , 385-447, 448 -767  */
            /*  segmentLen = sub(320, i-1); */ /*only process up to bin X[320] , 63 coeffs X[321]  fwd should already be
                                         zeroed  */
                                         /* ASSERT_LC3(i-1+ segmentLen  == lprotBy2Minus1 ); */
         }

         ASSERT_LC3(*pReX == X[i]); /* before a final valley*/
         for(j = 0; j < segmentLen; j++)
         {


            *seed = rand_phase(*seed, &sin_F, &cos_F);
            rotate_W16_fx(*pReX, *pImX, cos_F, sin_F, &tmp, &im); /* should be inlined , tmp=real part */

            *seed = rand_phase(*seed, &sin_F_fade2avg, &cos_F_fade2avg);
            /* i.e. add a bit of magnitude scrambling around 1.0 in longer bursts  */
            if (noise_mag_scale_neg != 0)
            {
               valley_magnitude_adj_fx(&tmp, &im, *seed, cos_F); 
                /*reuse cosF from regular X scrambling, + reuse  *seed from fade2avg */
            }

            tmp = s_and(tmp, one_peak_flag_mask);
            im  = s_and(im, one_peak_flag_mask);
            if (beta[k] != 0)
            { /* fade2avg path  never in first BFI frame */

               alpha_local = alpha[k];        /* no move as alpha_local  is only needed for debug */
               tmp2 = mult_r(beta[k], Xavg[k]);
               {
                  tmp2 = s_and(tmp2, one_peak_flag_mask);
               }


               *pReX++ = mac_r(L_mult(alpha_local, tmp), tmp2, cos_F_fade2avg);  
               *pImX-- = mac_r(L_mult(alpha_local, im), tmp2, sin_F_fade2avg);   
            }
            else
            {

               *pReX++ = mult_r(mag_chg[k], tmp);   
               *pImX-- = mult_r(mag_chg[k], im);  
            }
            i = add(i, 1);
            ASSERT_LC3(*pReX == X[i]);
            if (sub(i, gwlpr_fxPlus1[k]) > 0)
            {
               k = add(k, 1);
            }
         } /* segment_len  last valley */
         
      }

      void my_wtda_fx(const int16_t *new_audio, /* i  : input audio to be windowed  Q0 20 ms , OPT can be output as well */
         const int16_t *const win2ms_init,      /* i:  2 ms initial part of pre_tda window */
         const int16_t *const win16ms_center,   /* i:  16 ms combined part  of pre_tda IWHR+MDCT-ana  */
         int32_t *L_wtda_audio,                 /* o  : tda audio  Q16       20 ms */
         const int16_t L, int8_t *scratchBuffer) /* Size = 8 * MAX_L_FRAME */
      {
         int16_t i, L2; /*,L4;*/
         const int16_t *pX;
         const int16_t *pW;
         int32_t *p1_L, *p2_L, *p3_L, *p4_L;
         int32_t *L_w_audio; /*OPt 1 use input buffer ,  OPT2,  may be shortened from 20 ms to 16 ms due to
                                      zeroed parts*/
         int32_t *pY_L, *pa1_L, *pa2_L;

         //TRACE("PhECU::my_wtda_fx");

         L_w_audio = (int32_t *)scratchBuffer; /* Size = 4 * 2 * MAX_L_FRAME */

         /*   |111111|222222|333333|444444 */
         /*   |p1        p2|    p3||p4    */

         /* Apply analysis window */

         pX = new_audio;
         pY_L = L_w_audio;

         pW = win2ms_init;
         for(i = 0; i < ((2 * L / 10)); i++) /* Loop over 2ms window MDCT-ana length */
         {
            *pY_L++ = L_mult(*pX++, *pW++);   
         }

         pW = win16ms_center;
         /* 20 ms - 2ms -  3.75 ms = 14.25 ms */
         for(i = 0; i < (2 * L - (2 * L / 10) - ((3 * 2 * L) / 16));
         i++) /* Loop over remaining 14.25ms,  currently out of a 16 ms stored length */
         {
            *pY_L++ = L_mult(*pX++, *pW++);   
         }


         /* tda */
         L2 = shr_pos_pos(L, 1); /* length of tda blocks */

         p1_L = L_w_audio;              /* block 1 fwd */
         p2_L = L_w_audio + L - 1;      /* block 2 rev */
         p3_L = L_w_audio + L + L2 - 1; /* block 3 rev */
         p4_L = L_w_audio + L + L2;     /* block 4 fwd */

         pa1_L = L_wtda_audio;      /* first part output */
         pa2_L = L_wtda_audio + L2; /* second part output */

         for(i = 0; i < (L / 8); i++)
         {
            /* first 1.25ms part of  tda signal -p3_rev -p4_fwd */
            *pa1_L++ = L_negate(L_add_sat(*p3_L--, *p4_L++));  
         }
         for(; i < L2; i++)
         {
            /* first front part 3.75 ms  p4_l is zeroes  -p3_rev +  (-p4_fwd==0) */
            *pa1_L++ = L_negate(*p3_L--);   
         }

         for(i = 0; i < L2; i++)
         {
            /* second part of tda signal p1 -p2_rev */
            *pa2_L++ = L_sub_sat(*p1_L++, *p2_L--);   
         }         
         return;
      }

      /*--------------------------------------------------------------------------
       *  rec_wtda()
       *
       *  Windowing and TDA of reconstructed frame
       *--------------------------------------------------------------------------*/   


      static void
         rec_wtda_fx(
            int16_t *X,                          /* i  : iFFT(X-evolved) TD-signal   o: dbg   16 ms       */
            int32_t *L_ecu_rec,                  /* o  : Reconstructed frame in tda domain  Qx?    */
            const int16_t output_frame,          /* i  : Frame length                          */
            const int16_t Lprot,                 /* i  : Prototype frame length                */
            const int16_t *const win2ms_init,    /* i:  2 ms initial part of pre_tda window */
            const int16_t *const win16ms_center, /* i:  16 ms combined part  of pre_tda IWHR+MDCT-ana  */
            const int16_t maxLen,
            const int16_t *prevsynth,
            const int16_t Q_psMinus1, /*i:  Q prev_synth minus 1  , (-1 to match Q of Xsav in first bfi frame ) */
            int8_t *scratchBuffer) /* Size = 12 * MAX_L_FRAME */
      {
         int16_t l, Lprot2;
         int16_t *rec_buf;
         int16_t *xsubst_;                            /*,*out_ptr;*/
 
         int16_t ola_old[COPY_LEN_48K + OLA_LEN_48K]; /* 3.75 ms */
         int16_t work_len;
         int16_t copy_len;
         int16_t ola_len;
 

         int8_t *buffer_wtda;

         //TRACE("PhECU::rec_wtda_fx");

         rec_buf = (int16_t *)scratchBuffer;                                      /* Size = 2 * 2 * MAX_L_FRAME */
         buffer_wtda = (int8_t *)rec_buf + sizeof(*rec_buf) * (2 * maxLen); /* Size = 4 * 2 * MAX_L_FRAME */

         xsubst_ = rec_buf;
         Lprot2 = shr_pos_pos(Lprot, 1);

         /* extract reconstructed frame with ld window  into rec_buf  */
         l = sub(output_frame, Lprot2);
         memmove(xsubst_ + l, X, (Lprot) * sizeof(int16_t));                    /* 16 ms IFFT raw output */
         copy_len = COPY_LEN[FRAME2FS_IDX(output_frame)];
         ola_len  = OLA_LEN[FRAME2FS_IDX(output_frame)];
         work_len = add(copy_len, ola_len);
         /* Copy and scale copy part 2ms  from prevsynth */
         memmove(rec_buf, &prevsynth[Lprot - work_len], (copy_len) * sizeof(int16_t)); /* 2ms out of 3.75 ms  copied */
         Scale_sig_sat(rec_buf, copy_len, sub(-3, Q_psMinus1)); /* inplace scaling  by 2^(-Q_ps-4) */


         /* Copy, window and scale 1.75 ms ola part from prevsynth , into a temporary buffer ola_old  */


         windowing_ola(&prevsynth[Lprot - ola_len], ola_old, w_old[FRAME2FS_IDX(output_frame)], ola_len); /* 1.75 ms */

         Scale_sig_sat(ola_old, ola_len, sub(-3, Q_psMinus1)); /* inplace   scaling by 2^(-Qps-4) */

         /* Window 1.75 ms length inplace recreated X=IFFT(prototype) signal copied into rec_buf signal */
         windowing_ola(&rec_buf[copy_len], &rec_buf[copy_len], w_new[FRAME2FS_IDX(output_frame)], ola_len);
         /* mix add the two windowed components */
         ola_add(&rec_buf[copy_len], ola_old, &rec_buf[copy_len], ola_len); /* OPT:  sat check */


/*#endif   */ /*  TBD belongs to what  IFdef ? */


         my_wtda_fx(rec_buf,
            win2ms_init,    /* i:  2 ms initial part of pre_tda window */
            win16ms_center, /* i:  16 ms combined part  of pre_tda IWHR+MDCT-ana  */
            L_ecu_rec, output_frame, buffer_wtda); /* */         

         return;
      }

      /*--------------------------------------------------------------------------
       *  rec_frame()
       *
       *  Frame reconstruction
       *--------------------------------------------------------------------------*/
      void rec_frame(int16_t * x,                /* i  : FFT spectrum 16 ms, o: ifft() TD debug  signal 16ms  */
         int32_t * L_ecu_rec,        /* o  : Reconstructed frame in tda domain  10ms buffer  */
         const int16_t output_frame, /* i  : Frame length */
         const int16_t Q,            /* i  :   Xsav  Q   */
         const int16_t *const win2ms_init,    /* i:  2 ms initial part of pre_tda window */
         const int16_t *const win16ms_center, /* i:  16 ms combined part  of pre_tda IWHR+MDCT-ana  */
         int16_t maxLprot,
         const int16_t *prevsynth,
         const int16_t Q_prevsynthMinus1, /* i  :   prevsynthQ-1  or  xfp Q   */
         int8_t *scratchBuffer /* Size = 4 * MAX_LPROT + 12 * MAX_L_FRAME */
      )
      {
         int32_t i;
         int16_t  Lprot;
         int32_t *L_x;
         int32_t *pX_L;
         int16_t *pX;
         int16_t  fft_scale;
         int8_t * buffer_fft;

         //TRACE("PhECU::rec_frame");

         L_x = (int32_t *)scratchBuffer;            /* Size = 4 * MAX_LPROT */
         buffer_fft = (int8_t *)L_x + sizeof(*L_x) * maxLprot; /* Size = 4* (2+1) * MAX_L_FRAME */

         /* Initialize to FB constants */
         Lprot = mult(output_frame, (int16_t)(32768.0 / 99.0)); /* truncation needed , i.e no rounding can be applied here */
         ASSERT_LC3(Lprot == (output_frame / 100));
         Lprot = LprotSzPtr[Lprot];   


         /* Convert   stored 16 bit into 32bit for fft */
         flippedW16_2_intlvW32(x, sub(shr_pos_pos(Lprot, 1), 1), Lprot, L_x); 
          /*scratch x  now free for re-use */

         fft_scale = -1;    

         //TRACE("PhECU::IFFT_fx");
         LC3_irfftN(L_x, Lprot, &fft_scale, buffer_fft);
         

         pX_L = &L_x[0];
         pX   = &x[0];   /* scratch  x reused */

         {
            for(i = 0; i < Lprot; i++)
            {
               *pX++ = extract_h(L_shl(*pX_L++, fft_scale)); 
            }
         }
         /* Scratch  L_x may be released */


         /* Saturation possible when rescaling to Q0 if there are random bit errors in the bit stream
          * One may use one guard bit to better handle this - though it should not be needed for normal
          * operation.
          */
         Scale_sig_sat(x, Lprot, negate(Q)); /* scale by 2^(-Q)  */

         /*scratch x is Lprot word16 */
         /* scatch need for win-TDA  XXX */
         /* scrcatch need for TDA  XXX */

         rec_wtda_fx(x, L_ecu_rec, output_frame, Lprot,
            win2ms_init,    /* i:  2 ms initial part of pre_tda window */
            win16ms_center, /* i:  16 ms combined part  of pre_tda IWHR+MDCT-ana  */
            max(output_frame, 160), 
            prevsynth,
            Q_prevsynthMinus1, /* NB:  prevsynth Q may change  from prev_bfi=0 to prev_bfi==1, due to phase
                             of signal or PLC2-muting  */
            buffer_fft);         
         return;
      }

      /*--------------------------------------------------------------------------
       *  hq_phase_ecu()
       *
       *  Main routine for HQ phase ECU
       *--------------------------------------------------------------------------*/
      void hq_phase_ecu(
         const int16_t *prevsynth,    /* i  : buffer of previously synthesized signal  currently 16ms  */
         int32_t *      L_ecu_rec,    /* o  : reconstructed frame in tda domain  , also tmp w32_fft buffer        */
         int16_t *      time_offs,    /* i/o: Sample offset for consecutive frame losses*/
         int16_t *      X_sav,        /* i/o: Stored spectrum of prototype frame        */
         int16_t *      Q_spec,       /*  o: Q value of stored spectrum                */
         int16_t *      num_p,        /* i/o: Number of identified peaks                */
         int16_t *      plocs,        /* i/o: Peak locations                            */
         int32_t *      L_plocsi,     /* i/o: Interpolated peak locations           Q16 */
         const int16_t  env_stab,     /* i  : Envelope stability parameter              */
         const int16_t  f0hzLtpBinQ7, /* i:  LTP bin frequency in normalized Hz  Q7 */
         const int16_t  norm_corrQ15_fx,     /*i : correlation for lag at f0hzLtpBinQ7 */
         const int16_t  prev_bfi,            /* i   : indicating burst frame error             */
         int16_t        old_is_transient[2], /* i/o   : flags indicating  noise generation  frames */
         int16_t *      mag_chg_1st,         /* i/o: per band magnitude modifier for transients*/
         int16_t *     mag_chg_gr,           /*  o: per band magnitude modifier, incl burst attenuation   */
         int16_t *      Xavg,                /* i/o: Frequency group average gain to fade to   */
         int16_t *      beta_mute,           /* o   : Factor for long-term mute                */
         const int16_t  bwidth_fx,           /* i  : Encoded bandwidth                         */
         const int16_t  output_frame,        /* i   : frame length                             */
         int16_t *      seed_out_fxPtr,      /* o: utput  dbg NULL may be used*/
         int16_t *      X_out,               /* o: utput dbg NUll may be used */
         const int16_t t_adv, /* i  : time adjustment including time_offs       */
         const int16_t *const win2ms_init,    /* i:  2 ms initial part of pre_tda window */
         const int16_t *const win16ms_center, /* i:  16 ms combined part  of pre_tda IWHR+MDCT-ana  */
         const int16_t *sp_ana_win,   /* i  : whr 3+10+3  window */
         int16_t        q_fx_old_exp, /* i  : exp of prev_synth  */

         int16_t maxLprot, /* i  :   maz spectrum buffer size    */
         int16_t maxPlocs, /* i  :   max nb of peaks  */
         int32_t L_oold_xfp_w_E_fx, int16_t oold_xfp_w_E_exp_fx,                          /* exp of time signale */
         int16_t  oold_Ltot_exp_fx,                                                      /*true exp of energy */
         int16_t *oold_grp_shape_fx, int32_t L_old_xfp_w_E_fx, int16_t old_xfp_w_E_exp_fx, /* exp of time signale */
         int16_t  old_Ltot_exp_fx,                                                       /*true exp of energy */
         int16_t *old_grp_shape_fx,
         int16_t  margin_prevsynth,
         int8_t *scratchBuffer /* Size = 2 * MAX_LGW + 8 * MAX_LPROT + 12 * MAX_L_FRAME */
      )
      {
         int16_t  lprot;
         int16_t *mag_chg, ph_dith, *X;
         int16_t *xfp;
         int16_t  seed;
         int16_t  alpha[MAX_LGW], beta[MAX_LGW] ;
         int16_t  prevsynth_man_upshift;
         int16_t Q_prevsynthMinus1;
         int8_t *buffer;

         if (!prev_bfi)
         {
            //TRACE("PhECU::hq_phase_ecu(1st)");
         }
         else
         {
            //TRACE("PhECU::hq_phase_ecu(N)");
         }

         mag_chg = (int16_t *)scratchBuffer;                    /* Size = 2 * MAX_LGW */
         X       = (int16_t *)(((uint8_t *)mag_chg) + sizeof(*mag_chg) * MAX_LGW); /* Size = 2 * MAX_LPROT == 1 int16_t*MAX_LPROT */
         xfp     = (int16_t *)(((uint8_t *)X) + sizeof(*X) * maxLprot);            /* Size = 2 * MAX_LPROT == 1 int16_t*MAX_LPROT */
         buffer  = (int8_t *)xfp + sizeof(*xfp) * maxLprot; /* Size = 4 * MAX_LPROT + 12 * MAX_L_FRAME */
         
          /* buffer size = int32_t * MAX_LPROT (FFT, IFFT) DRAM
                         + 3*int32_t  * MAX_L_FRAME   */

          memset(alpha, 0, MAX_LGW*sizeof(int16_t));
          memset(beta, 0, MAX_LGW*sizeof(int16_t));

         lprot   = LprotSzPtr[bwidth_fx]; 

          
         ASSERT_LC3(prev_bfi >= 0 && prev_bfi <= 1);
         if ( prev_bfi == 0 ) /* inside PhECU we can chek vs 0 */
         {
            *time_offs = 0; 
            /* analysis made outside,  up/down scaling here from static RAM to dynamic RAM */
            /*  prevsynth_in_flt =   prev_synth_man*2.^(-15 + exp_old)   */
            /*  X_sav_flt        =   X_man/2.^(Q_spec)                   */

            /*  1 bit headroom needed in xfp_tmp_buf for  FFT processing into X_sav           */
            /*  margin_prevsynth = actual margin in incoming  16 ms xpf segment               */
            /*                     q_fx_old_exp was computed on full 21+ ms updatepcm buffer) */

            ASSERT_LC3(margin_prevsynth >= 0 && (margin_prevsynth <= 16));

            prevsynth_man_upshift = margin_prevsynth - 1; /* 0 --> -1(==down),  1--> 0 ,  2 -->  1(==up),  ... */
            ASSERT_LC3(prevsynth_man_upshift >= -16 && prevsynth_man_upshift <= 15); /* avoid Overflow  in shr, shl */
            *Q_spec = (15 - (q_fx_old_exp -prevsynth_man_upshift));
            /*  Q_spec  target is to create 1 additional bit of margin in the xfp TD buffer , before converting to
             * Xsav
             */

            if (margin_prevsynth == 0)
            {
               int16_t Qold = 15 - (q_fx_old_exp + 1);
               int16_t tmp_man_upshift = margin_prevsynth - 1; /* 1 ..   -15 */
               int16_t Qnew = 15 - (q_fx_old_exp - tmp_man_upshift);
               assert(Qold == Qnew);
            }
            if (margin_prevsynth == 1)
            {
               int16_t Qold = 15 - (q_fx_old_exp + 0);
               assert(*Q_spec == Qold);
            }
            if (margin_prevsynth == 2)
            {
               int16_t Qold = 15 - (q_fx_old_exp - 1);
               assert(*Q_spec == Qold);
            }
            Q_prevsynthMinus1 = sub(15, add(q_fx_old_exp, +1)); /* dbg to use non-scaled prevsynth for OLA  */
   
            /*  Q of prev_synth now separated from prev_bfi=0 and prev_bfi==1  */

#ifdef USE_TMPXFP_IN_OLA
            Q_prevsynthMinus1 = *Q_spec; /* a possibly  upscaled Q */
#endif


            Copy_Scale_sig(
               prevsynth, xfp, lprot,
               prevsynth_man_upshift); /* unscaled prevsynth is still used by rec_frame,  copy to a temporary
                                    xfp analysis buffer,  and scale down to a margin of 1 bit  */


            trans_burst_ana(((void *)NULL),mag_chg, &ph_dith, mag_chg_1st, output_frame, *time_offs, env_stab,
                                          alpha, beta, beta_mute, Xavg,(*Q_spec), L_oold_xfp_w_E_fx, oold_xfp_w_E_exp_fx, 
                                          oold_Ltot_exp_fx, oold_grp_shape_fx, L_old_xfp_w_E_fx, old_xfp_w_E_exp_fx, 
                                          old_Ltot_exp_fx, old_grp_shape_fx, buffer);

            spec_ana(&(xfp[0]), plocs, L_plocsi, num_p, X_sav, output_frame, bwidth_fx,
               sp_ana_win, f0hzLtpBinQ7, norm_corrQ15_fx, maxLprot, maxPlocs, buffer);
         }
         else
         {
            /* analysis made outside,  possible up/down scaling here from static RAM to dynamic RAM */
            ASSERT_LC3(margin_prevsynth >= 0 && (margin_prevsynth <= 15));

         /*  prev_synth may have been scaled  outside by update_pcm() function  */
         /*  prevsynth_in_flt =   prev_synth_man*2.^(-15 + exp_old)   */
         /*     first bfi frame:   X_sav_flt        =   X_man/2.^(*Q_spec)                 */
         /*     this  bfi frame prev_synth(TD)  is mixed with ifft signal(TD,from Q_spec) in rec_frame
                 variable Q_prevsynthMinus1 provided to rec_frame for this TD+TD mixing
          */

         Q_prevsynthMinus1 = sub(15, add(q_fx_old_exp, +1)); /*  for now, "old"  use of unscaled prevsynth for added OLA */

#ifdef USE_TMPXFP_IN_OLA
                  { /* DBG   target here is to instead upshift to  a zero margin     */
                     /* but Q value is maintained to match the save Xsav *Q_spec which is used with an offset of " -1" */
                     /* prevsynth_man_upshift =  -prevsynth_margin ; */
                     int16_t tmp, worklen = (hamm_len2Tab[bwidth_fx] + shr(hamm_len2Tab[bwidth_fx], 2));
                     tmp = mult(7680, lprot); /* needs to truncate to integer  */
                     ASSERT_LC3(tmp == worklen);
                     Copy_Scale_sig(&prevsynth[lprot - worklen], &xfp[lprot - worklen], worklen,
                                 margin_prevsynth);                                 /* only scale up last 3.75 ms */
                     Q_prevsynthMinus1 = (15 -(q_fx_old_exp + margin_prevsynth)); /*-1 does not make sense */
                  }
#endif

                  *time_offs = add_sat(*time_offs, output_frame);

                  trans_burst_ana(
                     ((void *)NULL),
                     mag_chg, &ph_dith, mag_chg_1st, output_frame, *time_offs, env_stab, alpha, beta, beta_mute, Xavg,
                     (0), /* *Q_spec input only used in first bfi frames for burst analysis  */
                     L_oold_xfp_w_E_fx, oold_xfp_w_E_exp_fx, oold_Ltot_exp_fx, oold_grp_shape_fx, L_old_xfp_w_E_fx,
                     old_xfp_w_E_exp_fx, old_Ltot_exp_fx, old_grp_shape_fx,
                     buffer);
         }
         /* cpy LPROT int16_t from Static RAM Xsav to working DRAM/scratch buffer X ;*/
         memmove(X, X_sav, (lprot) * sizeof(int16_t));
         /* seed for own_rand2 */
         seed = *time_offs;  

         if (mag_chg_gr != NULL)        /*  o: dbg per band magnitude modifier, incl. burst attenuation   */
         {
            int32_t k; 
            int16_t  lgw_local = min((bwidth_fx + LGW8K), LGW48K); /* 4,5,6,7, (7/8) */
            for (k = 0; k < lgw_local; k++) 
             {
               mag_chg_gr[k] = mag_chg[k]; /* dbg SNR  output */
             }
         }

         subst_spec(plocs, L_plocsi, num_p, *time_offs, X, mag_chg, ph_dith, old_is_transient, output_frame,
            &seed, alpha, beta,
            Xavg, t_adv
         );

         if (seed_out_fxPtr != NULL)
         {
            *seed_out_fxPtr = seed; /* verify seed synch after subst_spec */
         }


         if (X_out != NULL)
         {
            int16_t ii;
            for (ii = 0; ii < lprot; ii++)
            {
               X_out[ii] = X[ii]; /* evolve spectrum, no moves counted as  this is a dbg-vector  info cpy */
            }
         }

         /* reconstructed frame in tda domain */
         /* NB *Q_spec only updated in first bfi frame  */
         
         /*Scratch Analysis at this point */
         /* X  fft input needed as  evolved  spectrum Lprot* int16_t */
         /* xfp  not needed any longer    int16_t* Lprot */
         /* IFFT operation needs  int32_t*Lprot in and int32_t*Lprot out   */
         /* MDCT win operation may be inplace   2x MAX_L_FRAME  */
         /* TDA output is                       1x MAX_L_FRAME  */  

         rec_frame(X, L_ecu_rec, output_frame, *Q_spec,
            win2ms_init, win16ms_center,
            maxLprot,
#ifdef USE_TMPXFP_IN_OLA
            xfp, /* only last 3.75 ms used, in both prevbfi=0 and  prevBfi=1  i.e   frames,  xfp is an
                  upscaled prev_synth */
#else
            prevsynth, /*only last 3.75 ms used in both prevbfi=0 and  prevBfi=1  i.e   frames */
#endif
            Q_prevsynthMinus1,
            buffer);         
      }


      static int16_t sqrt2ndOrder(               /* o: in Q15 (2nd order least square approx.) */
         const int16_t x /* i: x must be in between 0.5 and 1.0 (Q15). */
      )
      {
         int32_t acc;
         int16_t z;
         //TRACE("PhECU::sqrt2ndOrder");

         ASSERT_LC3(x >= 16384);

         acc = 1890205600L; /*  0.880195572812922 in Q31 */ 
         z = mac_r(acc, x, -6506); /* -0.198537395405340 in Q15 */
         acc = 682030261L;           /*  0.317595089462249 in Q31 */  
         z = mac_r(acc, z, x); /* in Q15 */


         
         return z;
      }


      /* Modified version to produce int32_t input to FFT */
      static void windowing_L(
         const int16_t *x,          /* i: Input signal */
         int32_t *      L_y,        /* o: Windowed output */
         const int16_t *win,        /* i: Window coefficients */
         const int16_t  rectLength, /* i: Offset in between the 1st and 2nd symmetric halves of the Hamming window */
         const int16_t  halfLength  /* i: Half of the total length of a complete Hamming window. */
      )
      {
         int32_t       i;
         int32_t *      pY_L;
         const int16_t *pX, *pW;
         int16_t        tmp_RL;

         //TRACE("PhECU::windowing_L");

         pX = x;
         pW = win;
         pY_L = L_y;

         for(i = 0; i < halfLength; i++) /* 1st symmetric half of the Hamming window */
         {
            *pY_L++ = L_mult(*pX++, *pW++);   
         }
         /* Periodic filter - one more rect sample before end tapering */

         tmp_RL = add(rectLength, 1);

         if (rectLength == 0)
         {
            tmp_RL = 0;   
         }
         /* If rectLength is zero, it's a pure Hamming window; otherwise Hamming-Rectangular. */
         for(i = 0; i < tmp_RL;i++) 
         {
            *pY_L++ = L_deposit_h(*pX++);   
         }
         tmp_RL = sub(halfLength, 1);
         if (rectLength == 0)
         {
            tmp_RL = halfLength;    
         }
         for(i = 0; i < tmp_RL; i++) /* 2nd symmetric half of the Hamming window. */
         {
            *pY_L++ = L_mult(*pX++, *(--pW));   
         }
         
      }

      /* Modified version to produce int16_t input to FFT */
      static void windowing_ola(const int16_t *x,     /* i: Input signal */
         int16_t *      y,     /* o: Windowed output */
         const int16_t *win,   /* i: Window coefficients */
         const int16_t  Length /* i: Half of the total length of a complete Hamming window. */
      )
      {
         int32_t       i;
         int16_t *      pY;
         const int16_t *pX, *pW;

         //TRACE("PhECU::windowing_ola");

         pX = x;
         pW = win;
         pY = y;

         for(i = 0; i < Length; i++) /* 1st symmetric half of the Hamming window */
         {
            *pY++ = mult_r(*pX++, *pW++);   
         }
         
      }

      /* Modified version to produce int16_t input to FFT */
      static void ola_add(const int16_t *x,     /* i: Input signal 1 */
         const int16_t *y,     /* i: Input signal 2 */
         int16_t *      z,     /* o: Output signal */
         const int16_t  Length /* i: Half of the total length of a complete   window. */
      )
      {
         int32_t       i;
         int16_t *      pZ;
         const int16_t *pX, *pY;

         pX = x;
         pY = y;
         pZ = z;

         for(i = 0; i < Length; i++) /* 1st symmetric half of the Hamming window */
         {
            *pZ++ = add_sat(*pX++, *pY++);   
         }       
      }

      /*-----------------------------------------------------------------------------
       * magnSqrtApprox_fx()
       *
       * Approximation of sqrt(Square magnitude) of fft spectrum
       * if min_abs <= 0.4142135*max_abs
       *     abs = 0.99*max_abs + 0.197*min_abs
       * else
       *     abs = 0.84*max_abs + 0.561*min_abs
       * end
       *
       * Note: even to handle the dynamics of sqrt(re^2+im^2) located on
       *       a scaled unit circle. One need to scale down the results
       *       with a factor 2, that is Q_out = Q_in - 1
       *       sqrt(32768.^2+32768.^2) results in = 23170 Q0-1,
       *       which corresponds to 46341 in the Q0 domain
       *----------------------------------------------------------------------------*/
      int16_t sqrtMagnApprox_fx(                 /* o : sqrt of magnitude square spectrum  Q_in-1*/
         const int16_t re, /* i : Real part                          Q_in */
         const int16_t im  /* i : Imag part                          Q_in */
      )
      {
         /* Constants for Approximation of sqrt(Square magnitude) of fft spectrum
          * >> num2str(round(0.4142135]*2.^15))
          *    ans = 13573
          * >> num2str(round([0.99 0.197 0.84 0.561]*2.^14))
          *    ans = 16220   3228  13763   9191
          */

#define C_0p4142135_Q15 13573

#define C_0p99_Q14 16220
#define C_0p197_Q14 3228
#define C_0p84_Q14 13763
#define C_0p561_Q14 9191
         int16_t sgn_bit, re_abs, im_abs, max_abs, min_abs, sum;
         int16_t jcoeffs[2][2] = { {C_0p99_Q14, C_0p197_Q14}, {C_0p84_Q14, C_0p561_Q14} };

         //TRACE("PhECU::sqrtMagnApprox_fx");

         /* Get values and move pointers */
         re_abs = abs_s(re); /* 1 cycle */
         im_abs = abs_s(im); /* 1 cycle */

         /* Find max and min value */
         min_abs = min(re_abs, im_abs); /* 1 cycle */
         max_abs = max(re_abs, im_abs); /* 1 cycle  */

         /* Calc approximation depending on relation */
         sgn_bit = lshr(sub(mult(max_abs, C_0p4142135_Q15), min_abs), 15);                    /* 3 cycles */
         sum     = mac_r(L_mult(max_abs, jcoeffs[sgn_bit][0]), min_abs, jcoeffs[sgn_bit][1]); /* 2 cycles */
         
         return sum;
      }

      /*-----------------------------------------------------------------------------
       * fft_spec2_sqrt_approx_fx()
       *
       * Approximation of sqrt(Square magnitude) of fft spectrum
       * if min_abs <= 0.4142135*max_abs
       *     abs = 0.99 max_abs + 0.197*min_abs
       * else
       *     abs = 0.84 max_abs + 0.561*min_abs
       * end
       *
       * Note: even to handle the dynamics of sqrt(re^2+im^2) located on
       *       a scaled unit circle. One need to scale down the results
       *       with a factor 2, that is Q_out = Q_in - 1
       *       sqrt( -32768.^2 + -32768.^2 ) results in = 23170 Qin-1,
       *       which corresponds to 46341 in the Qin domain
       *----------------------------------------------------------------------------*/

      void fft_spec2_sqrt_approx_fx(const int16_t x[],        /* i : Input vector: complex spectrum ,  Qin */
         int16_t       xMagSqrt[], /* o : sqrt of magnitude square spectrum  Qout=Qin-1*/
         const int16_t N           /* i : Input vector x length */
      )
      {
         int32_t       i;
         int16_t        l;
         const int16_t *pRe, *pIm;
         int16_t *      pMagSqrt;

         //TRACE("PhECU::fft_spec2_sqrt_approx_fx");

         /* Magnitude at 0. only real component */
         pMagSqrt    = &xMagSqrt[0];
         pRe         = &x[0];
         *pMagSqrt++ = mult(abs_s(*pRe++), C_0p99_Q14);  

         /* From 1 to (N/2 - 1). */
         pIm = &x[N - 1];

         l = sub(shr_pos_pos(N, 1), 1); /* N/2 - 1. */
         l = min(l, (LPROT48K_RED / 2 - 1) +    DELTA_CORR_F0_INT); 
         /* at 48 k the top 8 khz are always zero, and further peaks are not
                              located above LPROT48K_RED 32 kHz  */
         for(i = 0; i < l; i++)
         {
            *pMagSqrt++ = sqrtMagnApprox_fx(*pRe++, *pIm--);  
         }

         /* The sqrt magnitude square at N/2 - only real component */
         *pMagSqrt = mult(abs_s(*pRe), C_0p99_Q14);           
         return;
      }

      int16_t
         imax2_jacobsen_mag_fx(/* o: The location, relative to the middle of the 3 given data point, of the maximum.
                            (Q15) */
            const int16_t *y_re, /* i: The 3 given data points. real part order -1 0 1  */
            const int16_t *y_im, /* i: The 3 given data points. imag part order  1 0 -1 (from FFT)*/
            const int16_t
            special /* i: -1 = left edge special case, 0 = normal, +1 = right edge special case */
         )
      {
         int16_t        posi;
         int16_t        man, expo;
         const int16_t *pY;
         int16_t        y_m1_re, y_0_re, y_p1_re;
         int16_t        y_m1_im, y_0_im, y_p1_im;

         int16_t D_re, D_im, N_re, N_im;

         int32_t L_sign, L_denom, L_numer;

         //TRACE("PhECU::imax2_jacobsen_mag_fx");

         /* Jacobsen estimates peak offset relative y_0 using
          *                 X_m1 - X_p1
          *  d = REAL ( ------------------- ) * c_jacob
          *              2*X_0 - X_m1 -Xp1
          *
          *  Where c_jacob is a window  dependent constant
          */
#define C_JACOB_Q14 18725 /*    c_jacob = 1.1429;   % assume 0.1875 hammrect window 'periodic' */

         ASSERT_LC3(special == 0); /* always use other imax for edges cases */

         /* Get the bin parameters into variables */
         pY = y_re;
         y_m1_re = *pY++;
         y_0_re = *pY++;
         y_p1_re = *pY++;

         /* Same for imaginary parts - note reverse order from FFT */
         pY = y_im;
         y_p1_im = *pY++;
         y_0_im = *pY++;
         y_m1_im = *pY++;

         
         if ( norm_s(y_0_re) == 0 || norm_s(y_0_im) == 0 )
         {
#define JACOB_MARGIN 2
            /* for very high peaks the  Complex denominator values may need to be downshifted  2 steps  */
            y_0_re = shr_pos(y_0_re, JACOB_MARGIN);
            y_0_im = shr_pos(y_0_im, JACOB_MARGIN);

            y_m1_re = shr_pos(y_m1_re, JACOB_MARGIN);
            y_m1_im = shr_pos(y_m1_im, JACOB_MARGIN);

            y_p1_re = shr_pos(y_p1_re, JACOB_MARGIN);
            y_p1_im = shr_pos(y_p1_im, JACOB_MARGIN);
         }

         /* prepare numerator real and imaginary parts*/
         N_re = sub(y_m1_re, y_p1_re);
         N_im = sub(y_m1_im, y_p1_im);

         /* prepare denominator real and imaginary parts */

         D_re = sub(sub(shl_pos(y_0_re, 1), y_m1_re), y_p1_re);
         D_im = sub(sub(shl_pos(y_0_im, 1), y_m1_im), y_p1_im); 

         /* REAL part of complex division  */
         L_numer = L_mac0_1(L_mult0(N_re, D_re), N_im, D_im);
         L_denom = L_mac0_1(L_mult0(D_re, D_re), D_im, D_im);
         L_sign = L_xor(L_numer, L_denom); /* Preserve the sign since div_s() only takes positive arguments. */

         L_numer = L_abs(L_numer);
         L_denom = L_abs(L_denom);

         
         if (L_numer != 0 && L_denom != 0)
         {

            man = plc_phEcu_ratio(L_numer, L_denom, &expo); /* The mantissa is considered in   Q15   */

            man = mult_r(man, C_JACOB_Q14);
            posi = shr_sat(   man, sub(expo, 2)); 
            /* to Q15 (and due to saturation, it is automatically bound inside [-1.0,1.0].) */

            if (L_sign < 0) /* Restore the sign. */
            {
               posi = negate(posi);
            }
         }
         else
         {
            posi = 0;   /* flat top,  division is not possible choose center freq */
         }
         
         return posi; /* Q15. The position either left or right relative to the index of the middle of the 3 given
                     data points. */
      }

      /* Convert  32 Bit FFT into   16 bit fft domain  */
      static void intlvW32_2_flippedW16(
         int32_t * L_x,          /* i : interleaved  coeffs  DC, Fs/2, Re(1),Im(1), Re(2),Im(2), ...  ]     */
         const int16_t numPairs, /* i:  typically (fft-size/2 -1),    re/im coeffs to copy  */
         const int16_t Lprot,    /* i: fft size ,   including DC+fs/2 */
         int16_t *     x         /* o : flipped  coeffs , [DC, Re(1),.. Re(N-1/2) , Fs/2, Im(N-1/2) ... Im(1) ] */
      )
      {

         /*   reorder  real and imag components, and apply fractional scale for 24/48Khz  */
         int32_t m;
         int32_t numPairsLocal;
         int32_t *pX_L  = &L_x[2];       /*ptr init*/
         int16_t *pX_Re = &x[1];         /*ptr init*/
         int16_t *pX_Im = &x[Lprot - 1]; /*ptr init*/

#define FHG_FFT_UPSHIFT 2

         //TRACE("PhECU::intlvW32_2_flippedW16");
         /*   make the scaling of  8/3= 4*0.666  here for 24 kHz and  48 kHz using   16x16  instead or 32x16 ops
            a limited loss of SNR */

         
         if (sub(numPairs, 383) == 0 || sub(numPairs, 191) == 0)
         {                                              /* 24,48 kHz , 16 ms , scale by  8/3 = .666*4  */
            numPairsLocal = min(numPairs, 383 - 63); /* do not copy bins above  20 kHz  */
            /*   for 48 kHz is to only go up to 40 kHz pairs ,    */
            for(m = 0; m < numPairsLocal; m++)
            {
               /* multiply by     (8/3)*(2.^FHG_FFT_UPSHIFT) */
               /* note: multiplication by 2/3 need to preceed upshift , due to FFT scaling being very close to the 48/24 3
                * split   kHz bit margin  */
               *pX_Re++ = extract_h(L_shl_pos(Mpy_32_16(*pX_L++, FEC_TWOTHIRDS_Q15), FHG_FFT_UPSHIFT + 2));
               
               *pX_Im-- = extract_h(L_shl_pos(Mpy_32_16(*pX_L++, FEC_TWOTHIRDS_Q15), FHG_FFT_UPSHIFT + 2));
               
            }
            /* Place the two real only components */
            x[0] = extract_h(L_shl_pos(Mpy_32_16(L_x[0], FEC_TWOTHIRDS_Q15), FHG_FFT_UPSHIFT + 2)); /* DC   */
            
            m = shr_pos_pos(Lprot, 1);
            x[m] = extract_h(L_shl_pos(Mpy_32_16(L_x[1], FEC_TWOTHIRDS_Q15), FHG_FFT_UPSHIFT + 2)); /* fs/2 */
            
         }
         else
         { /* 8,16,32 kHz 16 ms  no additional scaling by 8/3 */

            for(m = 0; m < numPairs; m++)
            {
               *pX_Re++ = extract_h(L_shl_pos(*pX_L++, FHG_FFT_UPSHIFT));
               
               *pX_Im-- = extract_h(L_shl_pos(*pX_L++, FHG_FFT_UPSHIFT));
               
            }

         /* Place the two real only components */
         x[0] = extract_h(L_shl_pos(L_x[0], FHG_FFT_UPSHIFT)); /* DC   */ 
         m = shr_pos_pos(Lprot, 1);
         x[m] = extract_h(L_shl_pos(L_x[1], FHG_FFT_UPSHIFT)); /* fs/2 */  
         }         
      }

      static void flippedW16_2_intlvW32(
         int16_t * x,            /* i : flipped  coeffs , [DC, Re(1),.. Re(N-1/2) , Fs/2, Im(N-1/2) ... Im(1) ] */
         const int16_t numPairs, /* i:  typically (fft-size/2 -1),    re/im coeffs to copy  */
         const int16_t Lprot,    /* i: fft size ,   including DC+fs/2 */
         int32_t *     L_x       /* o : interleaved  coeffs  DC, Fs/2, Re(1),Im(1), Re(2),Im(2), ...  ]     */
      )
      {
         int32_t i;
         int32_t numPairsLocal;
         int32_t *pX_L;
         int16_t *pX_re, *pX_im;
         //TRACE("PhECU::flippedW16_2_intlvW32");
         /* Convert   stored 16 bit into 32bit for fft */
         /* Note during save FFT output was left shifted FHG_FFT_UPSHIFT */
         /* this needs to be restored before one calls ifft to avoid overflow */

         pX_L  = &L_x[2];       /*ptr init*/
         pX_re = &x[1];         /*ptr init*/
         pX_im = &x[Lprot - 1]; /*ptr init*/

         numPairsLocal = min(320, numPairs); /* 48kHz optimization */
         for(i = 0; i < numPairsLocal; i++)
         {
            *pX_L++ = L_shr_pos(L_deposit_h(*pX_re++), FHG_FFT_UPSHIFT);  
            *pX_L++ = L_shr_pos(L_deposit_h(*pX_im--), FHG_FFT_UPSHIFT);  
         }
         /* at 48KHz zero tail 2x63= 126 bins for int32_t  IFFT input */
         memset(pX_L, 0, sizeof(int32_t) * shl_pos(sub(numPairs, numPairsLocal), 1));

         /* Place the two real only components */
         L_x[0] = L_shr_pos(L_deposit_h(x[0]), FHG_FFT_UPSHIFT);         
         L_x[1] = L_shr_pos(L_deposit_h(x[Lprot / 2]), FHG_FFT_UPSHIFT); 
         
      }

#ifdef NONBE_PLC2_SINQ10_WMOPS_SAVE
      void get_sin_cosQ10optOpt(int16_t phase,    /* Q10 0..1023  i.e. 1024=2*pi */
         int16_t * ptrSin, /* Q15 */
         int16_t * ptrCos  /* Q15 */
      )
      {
         int16_t   idx;
         int16_t segm_sin ;
         int16_t  offset_sub[5] = { 0,256,512,768,1024 };
         int16_t  neg_flags_sin[5] = { 32767, 32767, -32768,-32768, 32767 };
         int16_t  rev_flags_sin[5]     = { 0,1,0,1,0 };
  
         int16_t  *rev_flags_cos, *neg_flags_cos;

         //TRACE("PhECU::get_sin_cosQ10optOpt");

         /* sin table  has a range up to  pi/2  (256+1)=257 coeffs*/

         rev_flags_cos = &(rev_flags_sin[1]); /*ptr init */
         neg_flags_cos = &(neg_flags_sin[1]); /*ptr init */

         segm_sin = shr_pos_pos(phase, 8);
         ASSERT_LC3(segm_sin <= 3);

         idx = sub(phase, offset_sub[segm_sin]);   
         if ( rev_flags_sin[segm_sin] != 0)
         {
            idx = sub(256, idx); /* conditional rev for  sin  part  */
         }

         ASSERT_LC3(idx >= 0 && idx <= 256);


         *ptrSin = mult(sin_quarterQ15_fx[idx], neg_flags_sin[segm_sin]) ;  /* no move if inlined*/

         /*cos*/
         idx = sub( 256, idx );  /* always rev for cos part  */
         
         ASSERT_LC3(idx >= 0 && idx <= 256);

         *ptrCos = mult(sin_quarterQ15_fx[idx], neg_flags_cos[segm_sin]) ;           
      }
#endif 


      void get_sin_cosQ10opt(int16_t phase,    /* Q10 0..1023  i.e. 1024=2*pi */
         int16_t * ptrSin, /* Q15 */
         int16_t * ptrCos  /* Q15 */
      )
      {
         int16_t sign_val, idx, idx2, idx3;
         //TRACE("PhECU::get_sin_cosQ10opt");

         /* sin table  has a range up to  pi/2  (256+1)=257 coeffs*/

         sign_val = shr_pos_pos(phase, 9);   /* highest bit is  the sinus sign */
         idx      = s_and(phase, 0x1ff); /* mask away sign */

         idx2 = sub(idx, 256);
         if (idx2 < 0)
         { /*rising sine part */
            *ptrSin = sin_quarterQ15_fx[idx];   
         }

         idx3 = sub(512, idx);
         if (idx2 >= 0)
         { /* decaying part, reverse idx */
            *ptrSin = sin_quarterQ15_fx[idx3];   
         }

         if (sign_val != 0)
         {
            *ptrSin = negate(*ptrSin); /*no move when inlined , no sat as max in table is 32767 */
         }

         /*cos*/
         idx = add(phase, 256);   /* +pi/2,  i.e. move to cos phase */
         idx = s_and(idx, 0x3ff); /* wrap on 10 bits  limit  */

         sign_val = shr_pos_pos(idx, 9);   /* highest bit is  the sign */
         idx      = s_and(idx, 0x1ff);      /*  mask away sign */

         idx2 = sub(idx, 256);
         if (idx2 < 0)
         { /*rising sine part */
            *ptrCos = sin_quarterQ15_fx[idx];   
         }

         idx3 = sub(512, idx);
         if (idx2 >= 0)
         { /* decaying part, reverse idx*/
            *ptrCos = sin_quarterQ15_fx[idx3];   
         }

         if (sign_val != 0)
         {
            *ptrCos = negate(*ptrCos); /* no move when inlined , no sat as max in table is 32767  */
         }         

#ifdef NONBE_PLC2_SINQ10_WMOPS_SAVE
#endif 
      }




