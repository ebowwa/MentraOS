
#include "defines.h"
#include "functions.h"


void processInverseODFT(int32_t *r_fx, int16_t *r_fx_exp, int32_t *d2_fx, int16_t d2_fx_exp, int16_t n_bands,
                           int16_t lpc_order, int8_t *scratchBuffer)
{
    int32_t  i;
    int16_t  s;
    int16_t  n_bands2;
    int32_t *x;
    const int32_t *inv_odft_twiddle_re;
    const int32_t *inv_odft_twiddle_im;
    int8_t * buffer_LC3_rfftN;

    x = (int32_t *)scratchBuffer;                     /* Size = 320 bytes */
    buffer_LC3_rfftN = (int8_t *)x + sizeof(*x) * (MAX_BANDS_NUMBER_PLC + MAX_BANDS_NUMBER_PLC/2); /* Size = 480 bytes */

    ASSERT_LC3(lpc_order <= M);
    ASSERT_LC3(n_bands == 80 || n_bands == 60 || n_bands == 40 || n_bands == 20);

    n_bands2 = shr_pos_pos(n_bands, 1);
    if ((n_bands == 20) || (n_bands == 60))
    {
      /* sort input samples */
        for(i = 0; i < n_bands2; i++)
        {
            x[2*i] = d2_fx[2 * i];                 
            x[2*i+1] = 0;                            
            x[n_bands + 2*i] = d2_fx[n_bands - 1 - 2 * i]; 
            x[n_bands + 2*i + 1] = 0;                      
        }
        LC3_cfft(&x[0], &x[1], n_bands, 2, &d2_fx_exp, (int32_t*)buffer_LC3_rfftN);
    }
    else
    {
        /* sort input samples */
        for(i = 0; i < n_bands2; i++)
        {
            x[i] = d2_fx[2 * i];               
            x[n_bands2 + i] = d2_fx[n_bands - 1 - 2 * i]; 
        }
        LC3_rfftN(x, n_bands, &d2_fx_exp, buffer_LC3_rfftN);
    }

    inv_odft_twiddle_re = inv_odft_twiddle_80_re;
    inv_odft_twiddle_im = inv_odft_twiddle_80_im;
    if (n_bands == 20)
    {
        inv_odft_twiddle_re = inv_odft_twiddle_20_re;
        inv_odft_twiddle_im = inv_odft_twiddle_20_im;
    }
    else if (n_bands == 40)
    {
        inv_odft_twiddle_re = inv_odft_twiddle_40_re;
        inv_odft_twiddle_im = inv_odft_twiddle_40_im;
    }
    else if (n_bands == 60)
    {
        inv_odft_twiddle_re = inv_odft_twiddle_60_re;
        inv_odft_twiddle_im = inv_odft_twiddle_60_im;
    }

    s = norm_l(x[0]);
    /* imag[0] is always zero */
    r_fx[0] = L_shl_pos(x[0], s); 
    /* r_fx[0] = r_fx[0] * 1.0001 */
    r_fx[0] = Mpy_32_32(r_fx[0], 0x4001A36E); 
    if (norm_l(r_fx[0]) > 0)
        r_fx[0] = L_shl_pos(r_fx[0], 1);
    else
        s -= 1;

    /* post-twiddle */
    for(i = 1; i <= lpc_order; i++)
        r_fx[i] = L_add(Mpy_32_32(L_shl(x[2 * i], s), inv_odft_twiddle_re[i - 1]), Mpy_32_32(L_shl(x[2 * i + 1], s), inv_odft_twiddle_im[i - 1])); 

    *r_fx_exp = d2_fx_exp - s; 

    /* r_fx[0] must not be zero */
    if (r_fx[0] == 0)
    {
        r_fx[0] = (int32_t)0x7FFFFFFF; 
        for(i = 1; i <= lpc_order; i++)
            r_fx[i] = 0; 
        *r_fx_exp = 0; 
    }
}


