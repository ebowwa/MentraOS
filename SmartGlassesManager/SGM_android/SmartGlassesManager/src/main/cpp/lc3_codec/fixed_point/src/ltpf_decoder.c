
#include "functions.h"


static void ltpf_synth_filter(int16_t *synth_ltp, int16_t *synth, int16_t length, int16_t pitch_int, int16_t pitch_fr,
                              int16_t gain, int16_t scale_fac_idx, int16_t fs_idx,
                              int16_t fade /* 0=normal, +1=fade-in, -1=fade-out */)
{
    int16_t *x0;
    int16_t *y0;
    int32_t  s;
    int16_t  alpha = 0;
    int16_t  step = 0;	
    int16_t  i, k;
    int32_t j, l;

    ASSERT_LC3(scale_fac_idx >= 0);

    x0    = &synth_ltp[-pitch_int + inter_filter_shift[fs_idx]];
    y0    = synth;

    if (fade != 0)
    {
        switch (length)
        {
            case 5:
                step = 6553;
                break;
            case 10:
                step = 3276;
                break;
            case 15:
                step = 2184;
                break;
            case 20:
                step = 1638;
                break;
            case 30:
                step = 1092;
                break;
            case 40:
                step = 819;
                break;
            case 60:
                step = 546;
                break;
            case 80:
                step = 409;
                break;
            case 120:
                step = 273;
                break;
        }

        if (fade < 0)
        {
            alpha = 0x7FFF;
            step = negate(step);
	}
    }

    for(j = 0; j < length; j++)
    {
        s = L_mult(x0[0], inter_filter[fs_idx][pitch_fr][0]);
        for(l = 1; l < inter_filter_len[fs_idx]; l++)
        {
            s = L_mac(s, x0[-l], inter_filter[fs_idx][pitch_fr][l]);
        }
        for(l = 0; l < tilt_filter_len[fs_idx]; l++)
        {
            s = L_msu(s, y0[-l], tilt_filter[fs_idx][scale_fac_idx][l]);
        }

        i = msu_r(s, y0[-l], tilt_filter[fs_idx][scale_fac_idx][l]);

        k = mult_r(gain, i);

        if (fade != 0)
            k = mult_r(k, alpha);

        synth_ltp[j] = add(synth[j], k);

        if (fade != 0)
            alpha += step;

        x0++;
        y0++;
    }
}

static void processLtpfDecoderstage1(int16_t bfi, int16_t ltpf, int16_t pitch_index, int16_t* gain, int16_t fs_idx,
	int16_t* pitch_int, int16_t* pitch_fr, int16_t scale_fac_idx, int16_t old_scale_fac_idx, int16_t ltpf_active, 
	int16_t mem_ltpf_active, int16_t old_pitch_int, int16_t old_pitch_fr, int16_t old_gain, int16_t damping, int16_t concealMethod)
{
    int16_t pitch = 0;

    /* Filter parameters */
    if (bfi != 1)
    {
        if (ltpf == 0)
        {
            *pitch_int = 0;
            *pitch_fr  = 0;
        }
        else
        {
            /* Decode pitch */
            if (pitch_index < 380)
            {
                *pitch_int = shr_pos((pitch_index + 64), 2);
                *pitch_fr  = add(sub(pitch_index, shl_pos(*pitch_int, 2)), 128);
            }
            else if (pitch_index < 440)
            {
                *pitch_int = shr_pos(sub(pitch_index, 126), 1);
                *pitch_fr  = sub(sub(shl_pos(pitch_index, 1), shl_pos(*pitch_int, 2)), 252);
            }
            else
            {
                *pitch_int = sub(pitch_index, 283);
                *pitch_fr  = 0;
            }
            pitch     = add(shl_pos(*pitch_int, 2), *pitch_fr);
            pitch     = mult_r(shl_pos(pitch, 2), pitch_scale[fs_idx]);
            *pitch_int = shr_pos(pitch, 2);
            *pitch_fr  = sub(pitch, shl_pos(*pitch_int, 2));
        }

        /* Decode gain */
        if (scale_fac_idx < 0)
        {
            ltpf_active = 0;
            ASSERT_LC3(!(old_scale_fac_idx < 0 && mem_ltpf_active == 1));
        }
        if (ltpf_active == 0)
            *gain = 0;
        else
        {
            ASSERT_LC3(scale_fac_idx >= 0);
            *gain = gain_scale_fac[scale_fac_idx];
        }
    }
    else
    {
        /* fix to avoid not initialized filtering for concelament 
           might be necessary in case of bit errors or rate switching */
        if (scale_fac_idx < 0) 
        {
            if (mem_ltpf_active && old_scale_fac_idx>=0)
                scale_fac_idx = old_scale_fac_idx;
        }
        
        ltpf_active = mem_ltpf_active;
#ifdef NONBE_PLC2_LTPF_FADEOUT_FIX
        if (concealMethod == 2)
        { /* always start fade off to save filtering WMOPS for the remaining 7.5 ms  */
            assert(bfi == 1);
            ltpf_active = 0;/*always start fade off , still maintain  *mem_ltpf_active */
        }
#endif
        *pitch_int = old_pitch_int;
        *pitch_fr  = old_pitch_fr;
        *gain      = mult_r(old_gain, damping);
    }
}

static void processLtpfDecoderstage2(int16_t ltpf_active, int16_t* mem_ltpf_active, int16_t *y_out, int16_t *x_in, 
	int16_t L_frame, int16_t *old_e, int16_t *x_e, int16_t *old_y, int16_t old_y_len, int16_t *old_x, int16_t old_x_len,
	int16_t pitch_int, int16_t pitch_fr, int16_t *old_pitch_int, int16_t *old_pitch_fr, int16_t *old_gain, 
	int16_t *old_scale_fac_idx, int16_t scale_fac_idx, int16_t fs_idx, int16_t gain, int16_t *z)
{
    int32_t i;
    int16_t  s, s0, s1;
    int16_t *x, *y;

    if (ltpf_active == 0 && *mem_ltpf_active == 0)
    {
        /* LTPF inactive */
        memmove(y_out, x_in, L_frame * sizeof(int16_t));

        /* Update */
        s = sub(*old_e, *x_e);
        if (s > 0)
        {
            memmove(old_y, &old_y[L_frame], (old_y_len - L_frame) * sizeof(int16_t));
            if (s > 15)
            {
                memset(&old_y[old_y_len - L_frame], 0, (L_frame) * sizeof(int16_t));
                memset(old_x, 0, (old_x_len) * sizeof(int16_t));
            }
            else
            {
                for(i = 0; i < L_frame; i++)
                    old_y[i + old_y_len - L_frame] = shr(x_in[i], s);

                for(i = 0; i < old_x_len; i++)
                    old_x[i] = shr(x_in[i + L_frame - old_x_len], s);
            }
        }
        else
        {
            if (s < -15)
                memset(old_y, 0, (old_y_len - L_frame) * sizeof(int16_t));
            else
            {
                for(i = 0; i < old_y_len - L_frame; i++)
                {
                    old_y[i] = shl(old_y[i + L_frame], s);
                }
            }

            memmove(&old_y[old_y_len - L_frame], x_in, (L_frame) * sizeof(int16_t));
            memmove(old_x, &x_in[L_frame - old_x_len], (old_x_len) * sizeof(int16_t));
            *old_e = *x_e;
        }
        *old_pitch_int   = pitch_int;
        *old_pitch_fr    = pitch_fr;
        *old_gain        = 0;
        *mem_ltpf_active = 0;
    }
    else
    {
        /* Input/Output buffers */
        x = old_x + old_x_len;
        y = old_y + old_y_len;
        /* Input */
        memmove(x, x_in, (L_frame) * sizeof(int16_t));

        /* Scaling */
        s0     = sub(min(getScaleFactor16_0(old_x, old_x_len), getScaleFactor16_0(old_y, old_y_len)), 1);
        *old_e = sub(*old_e, s0);
        s1     = sub(getScaleFactor16(x, L_frame), 1);
        *x_e   = sub(*x_e, s1);
        s      = sub(*old_e, *x_e);
        if (s > 0)
        {
            Scale_sig(x, L_frame, sub(s1, s));
            Scale_sig(old_x, old_x_len, s0);
            Scale_sig(old_y, old_y_len, s0);
            *x_e = *old_e;
        }
        else
        {
            Scale_sig(x, L_frame, s1);
            Scale_sig(old_x, old_x_len, add(s0, s));
            Scale_sig(old_y, old_y_len, add(s0, s));
            *old_e = *x_e;
        }

        /* Filtering */
        if (ltpf_active == 0)
            ltpf_synth_filter(y, x, L_frame / 4, *old_pitch_int, *old_pitch_fr, *old_gain, *old_scale_fac_idx, fs_idx, -1);
        else if (*mem_ltpf_active == 0)
            ltpf_synth_filter(y, x, L_frame / 4, pitch_int, pitch_fr, gain, scale_fac_idx, fs_idx, 1);
        else if (sub(pitch_int, *old_pitch_int) == 0 && sub(*old_pitch_fr, pitch_fr) == 0)
            ltpf_synth_filter(y, x, L_frame / 4, pitch_int, pitch_fr, gain, scale_fac_idx, fs_idx, 0);
        else
        {
            ltpf_synth_filter(y, x, L_frame / 4, *old_pitch_int, *old_pitch_fr, *old_gain, *old_scale_fac_idx, fs_idx, -1);
            memmove(z, y - tilt_filter_len[fs_idx], (L_frame / 4 + tilt_filter_len[fs_idx]) * sizeof(int16_t));
            ltpf_synth_filter(y, z + tilt_filter_len[fs_idx], L_frame / 4, pitch_int, pitch_fr, gain, scale_fac_idx, fs_idx, 1);
        }
        if (ltpf_active > 0)
            ltpf_synth_filter(y + L_frame / 4, x + L_frame / 4, 3 * L_frame / 4, pitch_int, pitch_fr, gain, scale_fac_idx, fs_idx, 0);
        else
            memmove(&y[L_frame / 4], &x[L_frame / 4], (3 * L_frame / 4) * sizeof(int16_t));

        /* Output */
        memmove(y_out, y, (L_frame) * sizeof(int16_t));
        /* Update */
        memmove(old_x, &old_x[L_frame], (old_x_len) * sizeof(int16_t));
        memmove(old_y, &old_y[L_frame], (old_y_len) * sizeof(int16_t));

        *old_pitch_int   = pitch_int;
        *old_pitch_fr    = pitch_fr;
        *old_gain        = gain;
        *mem_ltpf_active = ltpf_active;
    }
    *old_scale_fac_idx = scale_fac_idx;
}

void processLtpfDecoder(int16_t *x_e, int16_t L_frame, int16_t old_x_len, int16_t fs_idx, int16_t old_y_len,
                             int16_t *old_e, int16_t *x_in, int16_t *old_x, int16_t *y_out, int16_t *old_y, int16_t ltpf,
                             int16_t ltpf_active, int16_t pitch_index, int16_t *old_pitch_int, int16_t *old_pitch_fr,
                             int16_t *old_gain, int16_t *mem_ltpf_active, int16_t scale_fac_idx, int16_t bfi,
                             int16_t concealMethod,
                             int16_t damping, int16_t *old_scale_fac_idx, int8_t *scratchBuffer)
{
    int16_t  gain, pitch_int, pitch_fr = 0;
    int16_t *z;

    z = (int16_t *)scratchBuffer; /* Size = MAX_LEN / 4 + 10 */

#ifdef NONBE_PLC2_LTPF_FADEOUT_FIX
    if ((bfi == 1) && (concealMethod == 0))
#else
    if ((bfi == 1) && (concealMethod == 2) || concealMethod == 0))
#endif
    {
        ltpf        = 0;
        ltpf_active = 0;
#ifndef NONBE_PLC_LTPF_FIX
        *mem_ltpf_active = 0;
        bfi = 0;
#endif
    }

    processLtpfDecoderstage1(bfi, ltpf, pitch_index, &gain, fs_idx,&pitch_int, &pitch_fr, scale_fac_idx, *old_scale_fac_idx,
		                ltpf_active, *mem_ltpf_active, *old_pitch_int, *old_pitch_fr, *old_gain, damping, concealMethod);

    processLtpfDecoderstage2(ltpf_active, mem_ltpf_active, y_out, x_in, L_frame, old_e, x_e, old_y, old_y_len, old_x,
		     old_x_len,  pitch_int, pitch_fr, old_pitch_int, old_pitch_fr, old_gain, old_scale_fac_idx, scale_fac_idx, fs_idx, gain, z);

}


