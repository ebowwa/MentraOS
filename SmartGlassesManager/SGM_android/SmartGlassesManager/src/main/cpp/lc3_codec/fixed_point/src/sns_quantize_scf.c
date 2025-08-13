
#include "functions.h"


static int16_t stage1_base(                    /* o  :  idx                                 */
                          const int16_t *t,    /* i  :  target SCFs                         */
                          const int16_t *cdbk, /* i  :  SCFs cdbk                           */
                          const int16_t  R     /* i  :  number of rows in codebook       */
)
{
    int32_t row;
    int16_t  k_ptr, idx;
    int32_t  L_min_mse, L_mse;
    int32_t col;
    int16_t  err;

    //TRACE("stage1_base");

/* find first vector error energy for  */
/* loop probably works with saturation , but it should not occur anyway */
    L_min_mse = L_add(0, 0);          /*  init acc with absolute  min mse sofar */
    for(col = 0; col < M / 2; col++) /* fixed to 8 elements */
    {
        err = sub(cdbk[col], t[col]); /* cdbk max abs value is 2048 = 2.^11 , max nb col is 2^3  max target is approx
                                         similar (2.^14/M)*2  = +/- 2048 , errmax is 4096   */
        L_min_mse = L_mac0_1(L_min_mse, err, err); /*  max L_min_mse is 8*4096*4096 =2.^(3+12+12) =  2.^27  */
    }

    idx = 0; 

    k_ptr = M / 2;  /* ptr init to second row */
    for(row = 1; row < R; row++)
    {
        /* loop probably works with saturation , but it should not occur anyway */

        L_mse = L_add(L_min_mse, 0);      /* init acc with min mse sofar , */
        for(col = 0; col < M / 2; col++) /* fixed to 8 elements */
        {
            err   = sub(cdbk[k_ptr++], t[col]);
            L_mse = L_msu0(L_mse, err,
                           err); /* NB subtraction  from best MSE error  sofar in acc , saturation may not occur */
        }

        L_min_mse = L_sub(L_min_mse, max(L_mse, 0L)); /* ALWAYS update best MSE  error sofar    */

        if (L_mse > 0L) /*  if acc value  still is positive a new lower error energy vector was found in this row   */
        {
            idx = row;  /* update  1-8 bits idx  */
        }

        /* this inner loop(always updating L_min_mse),          (L_msu, if )    consumes AV 19, WC  ~20 STL  cycles  ,
                                      compared to a conventional(L_mac, if ( ) )          AV 21  WC  ~23 STL  cycles per
           loop  */
    }
    ASSERT_LC3(idx >= 0 && idx < R);
    return idx;
}

static void first_stage_split_search(const int16_t *cbk_LF, const int16_t *cbk_HF, const int16_t *target,
                                     const int16_t nbCbkEntries, int16_t *idxLF, int16_t *idxHF)
{
    /* find  base index for  each   SCF split  */
    *idxLF = stage1_base(target, cbk_LF, nbCbkEntries);
    *idxHF = stage1_base((&target[M / 2]), cbk_HF, nbCbkEntries);
}

static void processDeQuantize_stage1ScfDecStage1(const int16_t *cbk_LF, const int16_t *cbk_HF, int16_t st1_idx0,
                                                    int16_t st1_idx1, int16_t *st1_vector)
{
    int32_t col;
    int16_t offset0, offset1;

    offset0 = st1_idx0 << 3; /* mult by M/2 */
    offset1 = st1_idx1 << 3;
    for(col = 0; col < M / 2; col++)
    {
        st1_vector[col]     = cbk_LF[offset0++];
        st1_vector[col + 8] = cbk_HF[offset1++];
    }
}

static void processQuantize_stage1ScfEncStage1_fx(const int16_t *target_st1, int16_t *st1_vector, int16_t *st1_idx0Ptr,
                                                  int16_t *st1_idx1Ptr)

{
    //TRACE("processQuantize_stage1ScfEncStage1_fx");

    first_stage_split_search(st1SCF0_7_base5_32x8_Q14, st1SCF8_15_base5_32x8_Q14, target_st1, SCF_STAGE1_NBCDKENTRIES,
                             st1_idx0Ptr, st1_idx1Ptr);

    processDeQuantize_stage1ScfDecStage1(st1SCF0_7_base5_32x8_Q14, st1SCF8_15_base5_32x8_Q14, *st1_idx0Ptr,
                                            *st1_idx1Ptr, st1_vector);
    return;
}

/* gain-shape MSE search in warped SCF-residual domain,  synthesis in SCF resiudal domain allows for easy weighting */

static void pvq_enc_find_best_submode_pre_post_fx(
    const int16_t *target_st2, /* this target is in the linearized  warped domain , same as input to PVQ search  */
    const int16_t *enc_pulses_far, int16_t *enc_pulses_near, const int16_t *enc_pulsesA, const int16_t *enc_pulsesB,
    int16_t *sub_mode_ptr, int16_t *i_gain_ptr, int16_t *enc_adj_glob_warped_vec, int8_t *scratchBuffer) /* Size = 18 * M */
{

    int32_t       L_section, idx;
    const int16_t *search_en1shape[N_SCF_SHAPES_ST2];
    const int16_t *search_gainTab[N_SCF_SHAPES_ST2];
    int16_t        search_n_gains[N_SCF_SHAPES_ST2];
    int32_t        L_mse, L_mse_min, L_idx;
    int16_t *      pulses_far, *pulses_near, *pulsesAB, *pulsesA;
    int16_t *      target_w, *shape_far, *shape_near, *shapeAB, *shapeA;
    int16_t  tmp, err;
    int32_t i;

    pulses_near = (int16_t *)scratchBuffer; /* Size = 2 * M */

    pulsesAB = (int16_t *)(((uint8_t *)pulses_near) + sizeof(*pulses_near) * M); /* Size = 2 * M */

    pulsesA = (int16_t *)(((uint8_t *)pulsesAB) + sizeof(*pulsesAB) * M); /* Size = 2 * M */

    target_w = (int16_t *)(((uint8_t *)pulsesA) + sizeof(*pulsesA) * M); /* Size = 2 * M */

    shape_near = (int16_t *)(((uint8_t *)target_w) + sizeof(*target_w) * M); /* Size = 2 * M */

    shapeAB = (int16_t *)(((uint8_t *)shape_near) + sizeof(*shape_near) * M); /* Size = 2 * M */

    shapeA = (int16_t *)(((uint8_t *)shapeAB) + sizeof(*shapeAB) * M); /* Size = 2 * M */

    pulses_far = (int16_t *)(((uint8_t *)shapeA) + sizeof(*shapeA) * M); /* Size = 2 * M */

    shape_far = (int16_t *)(((uint8_t *)pulses_far) + sizeof(*pulses_far) * M); /* Size = 2 * M */

    //TRACE("pvq_enc_find_best_submode_pre_post_fx");

    /* construct pulse vectors and en1 normalized shape vectors  */ /* use shape Q in Q14 */
    memmove(pulses_far, enc_pulses_far, M * sizeof(*pulses_far));
    memmove(pulses_near, enc_pulses_near, M * sizeof(*pulses_near));
    memmove(target_w, target_st2, M * sizeof(*target_w));

    pvq_dec_en1_normQ14(shape_near, pulses_near, sns_Kval[2][0], M); /* near outlier mode  */
    pvq_dec_en1_normQ14(shape_far, pulses_far, sns_Kval[3][0], M);   /* far outlier mode  */

    /* regular mode(with a split),   prepare vectors  of full length M */
    memmove(pulsesAB, enc_pulsesA, N_SETA * sizeof(*pulsesAB));
    memmove(pulsesA, enc_pulsesA, N_SETA * sizeof(*pulsesA));

    for(i = N_SETA; i < M; i++)
    {
        pulsesAB[i] = enc_pulsesB[sub(i, N_SETA)]; 
    }

    if (M > N_SETA)
    {
        memset(&pulsesA[N_SETA], 0, (M - N_SETA) * sizeof(*pulsesA));
    }

    pvq_dec_en1_normQ14(shapeAB, pulsesAB, sns_Kval[0][0], M);
    /* regular AB , b_pulses = 1 ;*/ /* OPT: combine  with shapeA */

    pvq_dec_en1_normQ14(shapeA, pulsesA, sns_Kval[1][0], M);
    /* regular A ,  b_pulses = 0 */ /* OPT:  M-> N_SETA */

    /* setup search structure */

    /* now aligned with order of  j  {regular=0, regular_lf=1, outlier_near=2, outlier far=3}  */

    search_en1shape[0] = shapeAB;
    search_gainTab[0]  = sns_gaintabPtr[0];
    search_n_gains[0]  = sns_gainSz[0]; /* assumes whole bits */

    search_en1shape[1] = shapeA;
    search_gainTab[1]  = sns_gaintabPtr[1];
    search_n_gains[1]  = sns_gainSz[1]; /* assumes whole bits */

    search_en1shape[2] = shape_near;
    search_gainTab[2]  = sns_gaintabPtr[2];
    search_n_gains[2]  = sns_gainSz[2]; /*assume whole bits */

    search_en1shape[3] = shape_far;
    search_gainTab[3]  = sns_gaintabPtr[3];
    search_n_gains[3]  = sns_gainSz[3]; /*assume whole bits */

    /* start actual search loop */

    /* basic raw MSE loop,   */
    L_mse_min = INT32_MAX;         
    L_idx     = L_deposit_l(-1); /* section in low 2  bits* gain idx above */

    for(L_section = 0; L_section < N_SCF_SHAPES_ST2; L_section++)
    {
        /* raw MSE  over gain and shape */
        for(idx = 0; idx < search_n_gains[L_section]; idx++)
        {
            /* MSE ( proc_target_local[i]-adjGain[i]*en1Shape[i] ) */

            L_mse = L_deposit_l(0);
            for(i = 0; i < M; i++)
            {
                tmp   = mult_r(search_gainTab[L_section][idx], search_en1shape[L_section][i]); /* Q15+14+1-16= Q14 */
                err   = sub(target_w[i], tmp);                                                 /*  both in  Q14      */
                L_mse = L_mac0_1(L_mse, err, err);                                               /* Q14+14 = Q28 */
            }

            if (L_sub(L_mse, L_mse_min) < 0) /* OPT: always update L_mse_min) */
            {
                L_mse_min = L_mse;                          
                L_idx     = L_mac0_1(L_section, idx, 1 << 2); /* save both section and gain  idx */
            }
        } /* gains */
    }     /*submodes*/

    L_section = L_and(0x3L, L_idx); /* section was stored in two lowest bits */
    ASSERT_LC3(L_section >= 0 && L_section <= 3);
    *i_gain_ptr = extract_l(L_shr_pos(L_idx, 2)); /*1,2,3 bit gain */
    ASSERT_LC3(*i_gain_ptr >= 0 && *i_gain_ptr <= 7);

    /* returns a scaled and transformed vector, ___EXACTLY__ as a decoder would scale it */
    ASSERT_LC3(enc_adj_glob_warped_vec != NULL);
    {
        /* warp/rotate search result to SCF residual domain */
        idct16_fx(search_en1shape[L_section], target_w); /* fwd synthesis  warping */
        /* actual synthesis gain scaling in SCF-residual domain, for easy weighting analysis  */
        pvq_dec_scale_vec(target_w, search_gainTab[L_section][*i_gain_ptr], enc_adj_glob_warped_vec);
    }

    *sub_mode_ptr = extract_l(L_section);  /* 0,1,2,3 */
    return;
}

static void processQuantize_stage2ScfEncStage2_fx(const int16_t *target_st2, int16_t *st2_vector, int32_t *L_prm_idx,
                                                  int16_t submodes, int8_t *scratchBuffer) /* Size = 26 * M + 48 */
{                                                                                        /*func */
    int16_t *proc_target, *enc_pulses_far, *enc_pulses_near, *enc_pulsesA, *enc_pulsesB;

    int16_t *pulses_fin, *pulses_proj;
    int32_t  L_tmp;

    int8_t *buffer_pvq_enc_find_best_submode_pre_post_fx;

    PvqEntry_fx enc_PVQ_OA, enc_PVQ_B;
    int16_t      submode, i_gain, submodeMSB, submodeLSB;
    int32_t *    L_search_corr, *L_search_en;

    buffer_pvq_enc_find_best_submode_pre_post_fx = (int8_t *)scratchBuffer; /* Size = 18 * M */
    proc_target =
        (int16_t *)(((uint8_t *)buffer_pvq_enc_find_best_submode_pre_post_fx) +
                               sizeof(*buffer_pvq_enc_find_best_submode_pre_post_fx) * 18 * M); /* Size = 2 * M */

    enc_pulses_near = (int16_t *)(((uint8_t *)proc_target) + sizeof(*proc_target) * M);         /* Size = 2 * M */
    enc_pulsesA     = (int16_t *)(((uint8_t *)enc_pulses_near) + sizeof(*enc_pulses_near) * M); /* Size = 2 * N_SETA */
    enc_pulsesB     = (int16_t *)(((uint8_t *)enc_pulsesA) + sizeof(*enc_pulsesA) * N_SETA);    /* Size = 2 * N_SETB */
    pulses_fin = (int16_t *)(((uint8_t *)enc_pulsesB) + sizeof(*enc_pulsesB) * N_SETB); /* Size = 2 * N_SCF_SHAPES_ST2 */
    pulses_proj =
        (int16_t *)(((uint8_t *)pulses_fin) + sizeof(*pulses_fin) * N_SCF_SHAPES_ST2); /* Size = 2 * N_SCF_SHAPES_ST2 */
    L_search_corr =
        (int32_t *)(((uint8_t *)pulses_proj) + sizeof(*pulses_proj) * N_SCF_SHAPES_ST2); /* Size = 4 * N_SCF_SHAPES_ST2 */
    L_search_en    = (int32_t *)(((uint8_t *)L_search_corr) + 
                                         sizeof(*L_search_corr) * N_SCF_SHAPES_ST2); /* Size = 4 * N_SCF_SHAPES_ST2 */
    enc_pulses_far = (int16_t *)(((uint8_t *)L_search_en) + sizeof(*L_search_en) * N_SCF_SHAPES_ST2); /* Size = 2 * M */

    //TRACE("processQuantize_stage2ScfEncStage2_fx");

    /* fixed setup for a given  bitrate of 38 ,  no  moves needed */
    /* k_far  = sns_Kval[3][0]; */
    /* k_near = sns_Kval[2][0]; */
    /* kA     = sns_Kval[1][0]; */ /* regular, regular_lf */
                                   /* kB is always  1 */

    /* NB  these search indecese do not correspond exactly to specification shape_index j */

    pulses_fin[0] = sns_Kval[3][0]; /* far   6 */
    pulses_fin[1] = sns_Kval[2][0]; /* near  8 */
    pulses_fin[2] = sns_Kval[1][0]; /* section A     10 */
    pulses_fin[3] = sns_Kval[0][1]; /* section B     1 */

    pulses_proj[0] = sns_Kval[3][0];
    pulses_proj[1] = 0;
    pulses_proj[2] = 0;
    pulses_proj[3] = 0;

    /*  pre_process  */
    dct16_fx(target_st2, proc_target); /* enc analysis */

    /* get the initial four integer shape candidate vectors,  no normalization at this stage  */
    pvq_enc_search(proc_target, enc_pulses_far, enc_pulses_near, enc_pulsesA, enc_pulsesB, L_search_corr,
                      L_search_en, pulses_fin, pulses_proj, M, N_SETA);

    /* scale with gains a after a  unit energy fwd transform  */
    /* apply transform to each candidate shape vector priot  to gain-shape search loop */
    submode = submodes; /* used as input solely to debug/unit test a specific shape mode  */

    /*target should be in a  linearized residual domain target */
    /* search pre, synthesis  post*/
    pvq_enc_find_best_submode_pre_post_fx(proc_target, enc_pulses_far, enc_pulses_near, enc_pulsesA, enc_pulsesB,
                                          &submode, &i_gain, st2_vector,
                                          buffer_pvq_enc_find_best_submode_pre_post_fx); /* Q14 tr out */

    /* send parameters  to multiplexor as a series/vector  of Long Words */
    /*    0 :    0..3  submode  */
    /*    1 :    0..7  gain_ind  */
    /*    2 :    0..1  LeadSign ind */
    /*    3 :    25 bit     MPVQ index    outl_near or  A  part  */
    /*    4 :    3.7 to 21 bits  MPVQ index           B  part  OR   -2  */

    L_prm_idx[0] = L_deposit_l(submode); /*  complete submode fwd'ed  to ari_codec as  0,1,2,3  */

    submodeMSB = shr_pos(submode, 1);                       /* LSB of submode , sent as main submode bit  */
    submodeLSB = s_and(submode, 0x1); /* LSB of submode  */ /*   sent via shape param  */

    /* gain, shape indicese , incl. calls to  MPVQ indexing */
    if (submodeMSB == 0)
    { /* regular modes::   j=0(reg=AB)  or 1(reg_lf  A)  */ /* regular mode, with two or one shape indices  */

        /* assume regular_lf part ,  shape_j == 1 */
        enc_PVQ_OA =mpvq_index(enc_pulsesA, N_SETA, sns_Kval[submode][0]); /* o : leading_sign_index, index, size, k_val */
        L_prm_idx[2] = L_deposit_l(enc_PVQ_OA.lead_sign_ind);         /*LS set A */

        ASSERT_LC3(enc_PVQ_OA.size == (uint32_t)sns_MPVQ_Sz[submode][0]);
        L_prm_idx[3] = L_add(0L, (int32_t)enc_PVQ_OA.index); /* MPVQ shape index set A fractional   */

        /* section B always have low indexing dynamics and is  combined into one joint single  index */
        if (submodeLSB == 0)
        {                                                                              /* regular   AB  , shape_j == 0*/
            L_prm_idx[1] = L_deposit_l(i_gain); /* full established gain idx fwd'ed */ /*      2  possible values */
            enc_PVQ_B    = mpvq_index(enc_pulsesB, N_SETB, 1);
            ASSERT_LC3(((enc_PVQ_B.size << 1)) ==
                   (sns_MPVQ_Sz[submode][1])); /*  two lowest indeces indicate all_zero B section  */

            L_tmp        = L_shl_pos((int32_t)enc_PVQ_B.index, 1);            /* 2*section B  MPVQ index */
            L_prm_idx[4] = L_add(L_tmp, enc_PVQ_B.lead_sign_ind);  /* add joint section B and  LS index */

            ASSERT_LC3(L_prm_idx[4] >= 0 && L_prm_idx[4] < (int32_t)sns_MPVQ_Sz[submode][0]);
        }
        else
        {
            L_prm_idx[1] = L_deposit_l(i_gain);
            /* MSBs of established gain idx */ /*  2 or 4   total  possible values */
            L_prm_idx[4] = L_deposit_l(-2);
        }
    }
    else
    {
        /* outlier  modes   shape_j= 2(near, LSB=0) or 3(far, LSB=1)  */

        if (submodeLSB == 0)
        {
            L_prm_idx[1] = L_deposit_l(i_gain); /* established gain idx  */ /*   4  possible values */
            enc_PVQ_OA   = mpvq_index(enc_pulses_near, M,
                                       sns_Kval[submode][0]); /* o :  leading_sign_index,  index, size, k_val        */
            ASSERT_LC3(enc_PVQ_OA.size == sns_MPVQ_Sz[submode][0]);
            L_prm_idx[3] = L_add(0L, enc_PVQ_OA.index); /* MPVQ index  fractional bits */
            L_prm_idx[4] = L_deposit_l(-1);             /* no gain LSBs  */
        }
        else
        {
            L_prm_idx[1] = L_deposit_l(i_gain); /* established gain idx MSBs   */ /*   all 4 or 8   possible values */
            enc_PVQ_OA   = mpvq_index(enc_pulses_far, M,
                                       sns_Kval[submode][0]); /* o :  leading_sign_index,  index, size, k_val        */
            ASSERT_LC3(enc_PVQ_OA.size == sns_MPVQ_Sz[submode][0]);
            L_prm_idx[3] = L_add(0L, enc_PVQ_OA.index); /* MPVQ index  fractional bits */
            L_prm_idx[4] = L_deposit_l(-2);             /*  */
        }
        L_prm_idx[2] = L_deposit_l(enc_PVQ_OA.lead_sign_ind); /* LS shape single bit */
    }

    

    return;
}

static int16_t scfdec_stage2(                          /* o: ber flag */
                               const int32_t *L_prm_idx,  /* set to -1 if not used */
                               int16_t *      st2_vector, /*o: Q14 */
                               int8_t *       scratchBuffer)
{
    /*   MPVQ deindexing, gainscaling transform and transform */
    int16_t  submode;
    int16_t  submodeLSB, submodeMSB;
    int16_t  gValQ13;
    int16_t  idxB;
    int16_t  maxK;
    int16_t  BER_dec;
    int16_t *dec_pulses;
    int16_t *dec_en1_vec;
    int16_t *dec_adj_glob_vec;

    //TRACE("scfdec_stage2_fx");

    dec_pulses       = (int16_t *)scratchBuffer;                      /* Size = 2 * M = 32 bytes */
    dec_en1_vec      = (int16_t *)(((uint8_t *)dec_pulses) + sizeof(*dec_pulses) * M);   /* Size = 2 * M = 32 bytes */
    dec_adj_glob_vec = (int16_t *)(((uint8_t *)dec_en1_vec) + sizeof(*dec_en1_vec) * M); /* Size = 2 * M = 32 bytes */

    /* get submode   */
    submode = extract_l(L_prm_idx[0]); /* 0..3 */

    submodeLSB = submode&0x1;
    submodeMSB = submode >> 1;

    /* get initial adjustment gain vector for  regular, outl_near   */
    ASSERT_LC3(L_prm_idx[1] >= 0 && L_prm_idx[1] < sns_gainSz[submode]);
    gValQ13 = sns_gaintabPtr[submode][L_prm_idx[1]];
    ASSERT_LC3(gValQ13 >= 0);

    /* gain, shape indices,  incl.calls  to MPVQ deindexing */
    if (submodeMSB != 0)
    {
        /* outlier_near or outlier_far  mode decoding */
        maxK    = sns_Kval[submode][0];
        BER_dec = pvq_dec_deidx(dec_pulses, maxK, M, extract_l(L_prm_idx[2]), (uint32_t)L_prm_idx[3]);
    }
    else
    { /* regular mode, with potentially two shape indices  */
        maxK    = sns_Kval[submode][0];
        BER_dec = pvq_dec_deidx(dec_pulses, maxK, N_SETA, extract_l(L_prm_idx[2]), (uint32_t)L_prm_idx[3]);

        if (submodeLSB == 0)
        {
            idxB = extract_l(L_prm_idx[4]); /* 0..11 */
            ASSERT_LC3(idxB >= 0 && idxB < (int16_t)sns_MPVQ_Sz[0][1]);
            BER_dec |= pvq_dec_deidx(&(dec_pulses[N_SETA]), sns_Kval[submode][1], N_SETB, s_and(idxB, 0x1),
                                        (uint32_t)L_deposit_l(shr_pos(idxB, 1)));
            /* maxK does not need to be increased as set B is not stacked  */
        }
        else
        { /* LSB gain bit already parsed */
            ASSERT_LC3(L_prm_idx[4] < 0);
            memset(&dec_pulses[N_SETA], 0, (N_SETB) * sizeof(*dec_pulses));
        }
    }

    /* normalize decoded integer vector , exactly as on encoder side !!  */
    pvq_dec_en1_normQ14(dec_en1_vec, dec_pulses, maxK, M);

    idct16_fx(dec_en1_vec, dec_adj_glob_vec); /* fwd warping  in unscaled domain */

    /* scaling aligend with encoder search  */
    pvq_dec_scale_vec(dec_adj_glob_vec, gValQ13, st2_vector);

    return BER_dec;
}

void processSnsQuantizeScfEncoder(int16_t  scf[],        /* i: input scf M */
                                     int32_t *L_prm_idx,    /* o: indeces . negative == unused */
                                     int16_t *scf_q,        /* o: quantized scf M */
                                     int8_t * scratchBuffer) /* Size = 28 * M + 52 */
{
    int32_t col;
    int16_t *target_st2;
    int16_t *st1_idx; /* stage 1 indices */
    int8_t * buffer_processQuantize_stage2ScfEncStage2_fx;

    target_st2 = (int16_t *)scratchBuffer;                    /* Size = 2 * M */
    st1_idx    = (int16_t *)(((uint8_t *)target_st2) + sizeof(*target_st2) * M); /* Size = 2 * 2 */
    buffer_processQuantize_stage2ScfEncStage2_fx = (int8_t *)st1_idx + sizeof(*st1_idx) * 2;
    /* Size = 26 * M + 48 */

    /* TBD needs update  */

    /* 1st stage trained VQ   */
    processQuantize_stage1ScfEncStage1_fx(scf, scf_q, &st1_idx[0], &st1_idx[1]);
    L_prm_idx[0] = L_deposit_l(st1_idx[0]);
    L_prm_idx[1] = L_deposit_l(st1_idx[1]);

/* 2nd stage PVQ-based SCF quantizer   */
    for(col = 0; col < M; col++)
    {
        target_st2[col] = sub(scf[col], scf_q[col]);
    }
    processQuantize_stage2ScfEncStage2_fx(target_st2, scf_q, &L_prm_idx[2], VQMODES26,   /* 0xF means all submodes */
                                          buffer_processQuantize_stage2ScfEncStage2_fx); /*  PVQ  in stage 2 */
}

int16_t processSnsQuantizeScfDecoder(                                      /* o: BER flag */
                                       int32_t *L_prm_idx,                    /* i: indeces */
                                       int16_t scf_q[], int8_t *scratchBuffer) /* o:  M */
{
    int16_t BER_flag;

    /* Decode First Stage */
    processDeQuantize_stage1ScfDecStage1(st1SCF0_7_base5_32x8_Q14, st1SCF8_15_base5_32x8_Q14,
                                            extract_l(L_prm_idx[0]), extract_l(L_prm_idx[1]), scf_q);

    /* Decode Second Stage */
    BER_flag = scfdec_stage2(&(L_prm_idx[2]), scf_q, scratchBuffer);

    return BER_flag;
}

