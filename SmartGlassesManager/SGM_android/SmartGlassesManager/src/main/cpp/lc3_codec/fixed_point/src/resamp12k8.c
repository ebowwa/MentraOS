
#include "functions.h"


void process_resamp12k8(int16_t x[], int16_t x_len, int16_t mem_in[], int16_t mem_in_len, int32_t mem_50[],
                           int16_t mem_out[], int16_t mem_out_len, int16_t y[], int16_t *y_len, int16_t fs_idx,
                           int16_t frame_dms, int8_t *scratchBuffer)
{
    int16_t *      buf;
    int16_t        index_int, index_frac, len_12k8;
    int16_t        resamp_upfac, resamp_off_int, resamp_off_frac, resamp_delay;
    const int16_t *resamp_filt;
    const int16_t *filt_coeff;
    int16_t *      filt_input;
    int32_t        filt_output, mem_50_0, mem_50_1;
    int32_t       n, m;
    int32_t        L_tmp;

    buf = (int16_t *)scratchBuffer; /* Size = 2 * (MAX_LEN + MAX_LEN / 8) bytes */

    resamp_upfac    = resamp_params[fs_idx][0]; 
    resamp_delay    = resamp_params[fs_idx][1]; 
    resamp_off_int  = resamp_params[fs_idx][2]; 
    resamp_off_frac = resamp_params[fs_idx][3]; 
    resamp_filt     = resamp_filts[fs_idx];     

    len_12k8 = LEN_12K8 / 4 * (frame_dms / 25); 
    *y_len   = len_12k8;                        

    /* Init Input Buffer */
    memmove(buf, mem_in, mem_in_len * sizeof(int16_t));
    memmove(&buf[mem_in_len], x, x_len * sizeof(int16_t));
    memmove(mem_in, &buf[x_len], mem_in_len * sizeof(int16_t));

    /* Init Input Indices */
    index_int  = 1; 
    index_frac = 0; 

    /* Resampling */
    for(n = 0; n < len_12k8; n++)
    {
        /* Init Filtering */
        filt_input = &buf[index_int];
        filt_coeff = &resamp_filt[index_frac * resamp_delay * 2];

/* Perform Filtering */
        filt_output = L_mult0(*filt_input, *filt_coeff);
        for(m = 1; m < resamp_delay * 2; m++)
        {
            filt_coeff++;
            filt_input++;
            if (*filt_coeff)
            {
                filt_output = L_mac0_1(filt_output, *filt_input, *filt_coeff);
            }
        }
        y[n] = round_fx(filt_output); 

        /* Update Input Indices */
        index_int  = add(index_int, resamp_off_int);
        index_frac = add(index_frac, resamp_off_frac);
        if (sub(resamp_upfac, index_frac) <= 0)
        {
            index_int  = add(index_int, 1);
            index_frac = sub(index_frac, resamp_upfac);
        }
    }

    /* High Pass Filtering (-3dB at 50Hz) */
    mem_50_0 = mem_50[0]; 
    mem_50_1 = mem_50[1]; 

    for(n = 0; n < len_12k8; n++)
    {
        filt_output = L_mac0_1(mem_50_0, highpass50_filt_num[0], y[n]);
        L_tmp       = L_mac0_1(Mpy_32_16_asm(filt_output, highpass50_filt_den[0]), highpass50_filt_num[1], y[n]);
        mem_50_0    = L_add(mem_50_1, L_shl_pos(L_tmp, 1));
        mem_50_1    = L_mac0_1(Mpy_32_16_asm(filt_output, highpass50_filt_den[1]), highpass50_filt_num[2], y[n]);
        y[n]        = round_fx(filt_output); 
    }
    mem_50[0] = mem_50_0; 
    mem_50[1] = mem_50_1; 

/* Output Buffer */
    memmove(buf, mem_out, mem_out_len * sizeof(int16_t));
    memmove(&buf[mem_out_len], y, len_12k8 * sizeof(int16_t));
    memmove(y, buf, (*y_len + 1) * sizeof(int16_t));
    memmove(mem_out, &buf[len_12k8], mem_out_len * sizeof(int16_t));

}

