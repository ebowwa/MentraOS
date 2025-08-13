
#include "defines.h"
#include "functions.h"


void processPreEmphasis(int32_t *d2_fx, int16_t *d2_fx_exp, int16_t fs_idx, int16_t n_bands, int16_t frame_dms, int8_t *scratchBuffer)
{
    int16_t        s;
    int32_t        nrg;
    int16_t        smax;
    int32_t       band;
    const int16_t *pre_emph;
    const int16_t *pre_emph_e;
    int16_t *      d2_band_fx_exp;

    d2_band_fx_exp = (int16_t *)scratchBuffer; /* Size = 2 * MAX_BANDS_NUMBER_PLC = 160 bytes */
    pre_emph   = lpc_lin_pre_emphasis_10ms[fs_idx];
    pre_emph_e = lpc_lin_pre_emphasis_e_10ms[fs_idx];
    switch (frame_dms)
    {
        case 25: 
            pre_emph   = lpc_lin_pre_emphasis_2_5ms[fs_idx];
            pre_emph_e = lpc_lin_pre_emphasis_e_2_5ms[fs_idx];
            break;
        case 50:
            pre_emph   = lpc_lin_pre_emphasis_5ms[fs_idx];
            pre_emph_e = lpc_lin_pre_emphasis_e_5ms[fs_idx];
            break;
    }   
    ASSERT_LC3(n_bands==20 || n_bands==40 || n_bands==60 || n_bands ==80);

    /* start processing */
    smax = -31; 
    for(band = 0; band < n_bands; band++)
    {
        nrg = Mpy_32_16(d2_fx[band], pre_emph[band]);

        if (nrg == 0)
            s = 31; 

        if (nrg != 0)
            s = norm_l(nrg);

        d2_fx[band] = L_shl_pos(nrg, s);        
        d2_band_fx_exp[band] = pre_emph_e[band] - s;
        smax = max(smax, d2_band_fx_exp[band]);
    }

/* Rescale band energies */
    for(band = 0; band < n_bands; band++)
        d2_fx[band] = L_shr_pos(d2_fx[band], min((smax - d2_band_fx_exp[band]), 31)); 

    /* Save common exponent for all bands */
    *d2_fx_exp = (*d2_fx_exp) + smax; 
}


