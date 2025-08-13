
#include "defines.h"
#include "functions.h"


static int16_t spectral_centroid_fx_lc(int16_t old_scf_q[], const int16_t *band_offsets, int16_t frame_length,
                                      int16_t fs_idx, int8_t *scratchBuffer);

void processPLCclassify(int16_t plcMeth, int16_t *concealMethod, int16_t *nbLostFramesInRow, int16_t bfi,
                           int16_t ltpf_mem_pitch_int, int16_t frame_length, int16_t frame_dms, int16_t fs_idx, int16_t yLen,
                           int16_t q_old_d_fx[], const int16_t *band_offsets, AplcSetup *plcAd, int8_t *scratchBuffer)
{
    int16_t scQ15 = 0;
    int32_t type = 0;

    if (plcAd)
        plcAd->norm_corrQ15_fx = 0; 

    if (bfi == 1)
    {
        /* increase counter of lost-frames-in-a-row */
        *nbLostFramesInRow = (*nbLostFramesInRow) + 1;
        if ((*nbLostFramesInRow) == 1)
        {
            *concealMethod = plcMeth; 
            if (plcMeth == 1)
            {
                if (ltpf_mem_pitch_int > 0)
                {
                    *concealMethod = 3;  /* TD-PLC */
                    /* no classifier features needed for 5ms mode, as PhaseECU-5ms is disabled */
                    if (frame_dms == 100)
                    {
                        /* Calculate Features */
                        plcAd->norm_corrQ15_fx = plc_xcorr_lc(plcAd->x_old_tot_fx, plcAd->max_len_pcm_plc,
                                                                 ltpf_mem_pitch_int, frame_length, fs_idx);
                        scQ15 = spectral_centroid_fx_lc(plcAd->old_scf_q, band_offsets, frame_length, fs_idx,scratchBuffer);

                        /* Classify */
                        type = L_mult(plcAd->norm_corrQ15_fx, 7640);
                        type = L_mac(type, scQ15, -32768);
                        type = L_add_sat(type, -335020208);

                        if (type <= 0)
                            *concealMethod = 2;  /* Phase ECU selected */
                    }
                }
                else
                    *concealMethod = 4;  /* Noise Substitution */
            }
        }
    }
    
}


int16_t spectral_centroid_fx_lc(int16_t old_scf_q[], const int16_t *band_offsets, int16_t frame_length, int16_t fs_idx,
                               int8_t *scratchBuffer)
{
        int32_t i, j;
        int32_t  den32, num32, tmp32;
        int16_t  s, sc, fac, freq, inv, startfreq, stopfreq;
        int16_t *old_scf_q_mod;
        int16_t *old_scf_q_mod_exp;

    //TRACE("PLC::spectral_centroid_fx_lc");

    old_scf_q_mod     = (int16_t *)scratchBuffer;                          /* Size = 2 * M */
    old_scf_q_mod_exp = (int16_t *)(((uint8_t *)old_scf_q_mod) + sizeof(*old_scf_q_mod) * M); /* Size = 2 * M */

    /* Linear Domain */
    for(i = 0; i < M; i++)
    {
        old_scf_q_mod[i] = InvLog2_16(old_scf_q[i], &old_scf_q_mod_exp[i]);
    }

    /* De-emphasis */
    for(i = 0; i < M; i++)
    {
        old_scf_q_mod[i]     = mult(old_scf_q_mod[i], lpc_warp_dee_emphasis[fs_idx][i]);      
        old_scf_q_mod_exp[i] = add(old_scf_q_mod_exp[i], lpc_warp_dee_emphasis_e[fs_idx][i]); 
    }

    den32 = 1; 
    num32 = 0; 
    inv   = div_s(1, frame_length);

    for(i = 0; i < M; i++)
    {
        freq      = 0; 
        startfreq = add(band_offsets[i * 4], 1);
        stopfreq  = band_offsets[i * 4 + 4];
        for(j = startfreq; j <= stopfreq; j++)
        {
            freq = add(freq, j);
        }

        tmp32 = L_mult(inv, freq);
        s     = norm_l(tmp32);
        tmp32 = L_mult(old_scf_q_mod[i], extract_h(L_shl(tmp32, s)));

        num32 = L_add(num32, L_shl(tmp32, add(add(-15, old_scf_q_mod_exp[i]), sub(15, s))));
        den32 = L_add(den32, L_shl(L_mult(old_scf_q_mod[i], stopfreq - startfreq + 1), old_scf_q_mod_exp[i]));
    }

    s = norm_l(den32);
    s = sub(16, s);

    sc = div_s(extract_l(L_shr(num32, s)), extract_l(L_shr(den32, s)));

    switch (fs_idx)
    {
    case 0:
        fac = 5461; 
        break;
    case 1:
        fac = 10922; 
        break;
    case 2:
        fac = 16384; 
        break;
    case 3:
        fac = 21845; 
        break;
    default:         /* case 4: */
        fac = 32767; 
        break;
    }
    sc = round_fx(L_mult(sc, fac));
    
    return sc;
}


