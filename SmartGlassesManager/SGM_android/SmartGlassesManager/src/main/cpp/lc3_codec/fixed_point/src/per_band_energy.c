
#include "functions.h"


void processPerBandEnergy(int32_t *d2_fx, int16_t *d2_fx_exp, int32_t *d_fx, int16_t d_fx_exp,
                             const int16_t *band_offsets, int16_t fs_idx, int16_t n_bands, int16_t linear, int16_t frame_dms,
                             int8_t *scratchBuffer)
{
    int32_t i, k, band;
    int16_t  s;
    int16_t  s1;
    int16_t  s2;
    int32_t  nrg;
    int16_t  smax;
    int16_t  tmp16;
    int16_t  nbands;
    int16_t  maxBwBin;
    int16_t  stopBand;
    int16_t  bandsOffsetOne;
    int16_t  bandsOffsetTwo;
    int16_t *d2_band_fx_exp;

    d2_band_fx_exp = (int16_t *)scratchBuffer; /* Size = 2 * MAX_BANDS_NUMBER_PLC bytes */

    maxBwBin = MAX_BW; 

    switch (frame_dms)
    {
    case 25:
        maxBwBin       = MAX_BW >> 2;                             
        bandsOffsetOne = bands_offset_with_one_max_2_5ms[fs_idx]; 
        bandsOffsetTwo = bands_offset_with_two_max_2_5ms[fs_idx]; 
        break;
    case 50:
        maxBwBin       = MAX_BW >> 1;                           
        bandsOffsetOne = bands_offset_with_one_max_5ms[fs_idx]; 
        bandsOffsetTwo = bands_offset_with_two_max_5ms[fs_idx]; 
        break;
    default:                                                /* 100 */
        bandsOffsetOne = bands_offset_with_one_max_10ms[fs_idx]; 
        bandsOffsetTwo = bands_offset_with_two_max_10ms[fs_idx]; 
        break;
    }

    if (linear == 1)
    {
        switch (frame_dms)
        {
        case 25:
            bandsOffsetOne = bands_offset_with_one_max_lin_2_5ms[fs_idx];  
            bandsOffsetTwo = bands_offset_with_two_max_lin_2_5ms[fs_idx];  
            break;
        case 50:
            bandsOffsetOne = bands_offset_with_one_max_lin_5ms[fs_idx]; 
            bandsOffsetTwo = bands_offset_with_two_max_lin_5ms[fs_idx]; 
            break;
        case 100:
            bandsOffsetOne = bands_offset_with_one_max_lin_10ms[fs_idx]; 
            bandsOffsetTwo = bands_offset_with_two_max_lin_10ms[fs_idx]; 
            break;
        }
    }

    /* start processing with band offsets == 1 */
    for(band = 0; band < bandsOffsetOne; band++)
    {
        ASSERT_LC3((band_offsets[band + 1] - band_offsets[band]) == 1);
        ASSERT_LC3(band < maxBwBin);

        s2 = 15; 
        s  = norm_l(d_fx[band]);
        if (d_fx[band] != 0)
            s2 = min(s2, s);

        tmp16 = extract_h(L_shl_pos(d_fx[band], s2));

        d2_fx[band]          = L_mult0(tmp16, tmp16);  
        d2_band_fx_exp[band] = 1 - shl_pos(s2, 1); 
    }

    /* start processing with band offsets == 2 */
    i = bandsOffsetOne; 
    for(; band < bandsOffsetTwo; band++)
    {
        ASSERT_LC3((band_offsets[band + 1] - band_offsets[band]) == 2);
        if ((i + 1) >= maxBwBin)
        {
            if (i >= maxBwBin)
            {
                d2_fx[band]          = 0; 
                d2_band_fx_exp[band] = 1 - shl_pos(15, 1);  
            }
            else
            {
                s2 = 15; 
                s  = norm_l(d_fx[band]);
                if (d_fx[band] != 0)
                    s2 = min(s2, s);

                tmp16 = extract_h(L_shl_pos(d_fx[band], s2));

                d2_fx[band]          = L_mult0(tmp16, tmp16);  
                d2_band_fx_exp[band] = 1 - shl_pos(s2, 1); 
            }
        }
        else
        {
            ASSERT_LC3(i + 1 < maxBwBin);

            s2 = 15; 
            s  = norm_l(d_fx[i]);
            if (d_fx[i] != 0)
                s2 = min(s2, s);
            s = norm_l(d_fx[i + 1]);
            if (d_fx[i + 1] != 0)
                s2 = min(s2, s);

            tmp16 = extract_h(L_shl_pos(d_fx[i], s2));
            nrg   = L_mult0(tmp16, tmp16);
            nrg   = min(nrg, 0x3FFFFFFF);
            tmp16 = extract_h(L_shl_pos(d_fx[i + 1], s2));

            d2_fx[band]          = L_shr_pos(L_mac0_1(nrg, tmp16, tmp16), 1); 
            d2_band_fx_exp[band] = 1 - shl_pos(s2, 1);                  
        }
        i += 2;

    }

    /* proceed with band offsets > 2 */
    for(; band < n_bands; band++)
    {
        /* normalization */
        k        = i;  
        s1       = 15; 

        stopBand = min(band_offsets[band + 1], maxBwBin);
        for(; k < stopBand; k++)
        {
            s = norm_l(d_fx[k]);
            if (d_fx[k] != 0)
                s1 = min(s1, s);
        }

        nbands = band_offsets[band + 1] - band_offsets[band];
        ASSERT_LC3(nbands < 32);
        nbands = min(max(0, nbands), 31);

        /* specify headroom, it can be reduced by one due to use of L_mac0_1 */
        s2 = s1 - bands_nrg_scale[nbands];

        /* calculate energy per band */
        nrg = 0; 

        for(; i < stopBand; i++)
        {
            tmp16 = extract_h(L_shl(d_fx[i], s2));
            nrg   = L_mac0_1(nrg, tmp16, tmp16);
        }
        i = band_offsets[band + 1];

        /* calculate mean value of energy */
        nrg = Mpy_32_16_asm(nrg, InvIntTable[nbands]);

        /* store normalized energy */
        s                    = norm_l(nrg);
        d2_fx[band]          = L_shl_pos(nrg, s);              
        d2_band_fx_exp[band] = 1 -(shl_pos(s2, 1) + s); 
    }

    /* Determine maximum exponent and rescale band energies */
    smax = -31; 
    for(band = 0; band < n_bands; band++)
    {
        smax = max(smax, d2_band_fx_exp[band]);
    }
    for(band = 0; band < n_bands; band++)
    {
        d2_fx[band] = L_shr_pos(d2_fx[band], min((smax- d2_band_fx_exp[band]), 31)); 
    }

    /* Save exponent for all bands */
    *d2_fx_exp = shl_pos(d_fx_exp, 1) + smax; 
}

