
#include "defines.h"
#include "constants.h"
#include "functions.h"


void processPCmain(int16_t rframe, int16_t *bfi, int16_t prev_bfi, int16_t yLen, int16_t frame_dms, int16_t q_old_res_fx[],
                      int16_t *q_old_res_fx_exp, int16_t q_res_fx[], int16_t q_old_d_fx[], int16_t spec_inv_idx,
                      int16_t pitch_present, int16_t stab_fac, int32_t q_d_fx[], int16_t *q_fx_exp,
                      int16_t gg_idx, int16_t gg_idx_off, int16_t *prev_gg, int16_t *prev_gg_e, int16_t *BW_cutoff_idx_nf,
                      int16_t *prev_BW_cutoff_idx_nf, int16_t fac_ns_idx, int16_t *prev_fac_ns_fx, int16_t *pc_nbLostFramesInRow)
{
    int16_t fac, fac_e;
    
    fac = 32767; fac_e = 0;

    if ((*bfi) == 2)
        processPCclassify(pitch_present, frame_dms, q_old_d_fx, q_old_res_fx, yLen, spec_inv_idx, stab_fac, prev_bfi, bfi);

    if ((*bfi) == 2)
        processPCapply(yLen, q_old_res_fx, q_old_res_fx_exp, q_res_fx, q_old_d_fx, spec_inv_idx,
                          &fac, &fac_e, q_d_fx, q_fx_exp, gg_idx, gg_idx_off, *prev_gg, *prev_gg_e, pc_nbLostFramesInRow);

    if ((*bfi) != 1)
        processPCupdate(*bfi, yLen, q_old_res_fx, q_old_res_fx_exp, q_res_fx, spec_inv_idx, gg_idx, gg_idx_off, prev_gg,
                           prev_gg_e, rframe, BW_cutoff_idx_nf, prev_BW_cutoff_idx_nf, fac_ns_idx, prev_fac_ns_fx, fac, fac_e);

    if ((*bfi) != 2)
        *pc_nbLostFramesInRow = 0;  

}


