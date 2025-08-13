
#include "defines.h"
#include "functions.h"


void processPLCmain(int16_t plcMeth, int16_t *concealMethod, int16_t *nbLostFramesInRow, int16_t bfi, int16_t prev_bfi,
                       int16_t frame_length, int16_t la_zeroes, const int16_t w[], int16_t x_fx[], int16_t ola_mem[],
                       int16_t *ola_mem_exp, int16_t q_old_d_fx[], int16_t *q_old_fx_exp, int32_t q_d_fx[],
                       int16_t *q_fx_exp, int16_t yLen, int16_t fs_idx, const int16_t *band_offsets, int16_t *damping,
                       int16_t old_pitch_int, int16_t old_pitch_fr, int16_t *ns_cum_alpha, int16_t *ns_seed,
                       AplcSetup *plcAd, int16_t frame_dms, int8_t *scratchBuffer)
{
    processPLCclassify(plcMeth, concealMethod, nbLostFramesInRow, bfi, old_pitch_int, frame_length, frame_dms,
                          fs_idx, yLen, q_old_d_fx, band_offsets, plcAd, scratchBuffer);

    processPLCapply(*concealMethod, *nbLostFramesInRow, bfi, prev_bfi, frame_length, la_zeroes, w, x_fx, ola_mem,
                       ola_mem_exp, q_old_d_fx, q_old_fx_exp, q_d_fx, q_fx_exp, yLen, fs_idx, damping, old_pitch_int,
                       old_pitch_fr, ns_cum_alpha, ns_seed, frame_dms, plcAd, scratchBuffer);

    if (bfi == 0)
        processPLCupdateSpec(q_old_d_fx, q_old_fx_exp, q_d_fx, q_fx_exp, yLen);

    if ((plcAd != NULL) &&  (plcAd->PhECU_frame_ms ==10) )  
        processPLCspec2shape(prev_bfi, bfi, q_old_d_fx, yLen, plcAd->PhECU_oold_grp_shape_fx, 
                                                   plcAd->PhECU_old_grp_shape_fx);
 
}


