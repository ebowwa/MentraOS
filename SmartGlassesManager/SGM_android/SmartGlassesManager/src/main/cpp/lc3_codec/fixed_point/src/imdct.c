
#include "functions.h"


static inline int16_t ProcessingIMDCTstage1(int32_t y[], int16_t N, int16_t * y_e, int32_t *workBuffer)
{
    int16_t  y_s = 0;
    int32_t i = 0;

    /* Start Processing */
    y_s = getScaleFactor32_0(y, N);
    if (y_s < 32)
    {
        for(i = 0; i < N; i++)
            y[i] = L_shl(y[i], y_s);
        *y_e = (*y_e) - y_s;

        dct_IV(y, y_e, N, workBuffer);

        y_s  = getScaleFactor32(y, N);
        y_s  -= 1;
        *y_e = (*y_e) - (y_s + 3); /* mdct window is scaled by pow(2,x) */
        /* N<=20 only happens for 2.5ms frames in NB */
        if (N <= 20)
            *y_e = (*y_e) + 2;
        else if (N <= 120)
            *y_e = (*y_e) + 1;
    }
    else
        *y_e = 0;  //

    return y_s;
}

static inline void ProcessingIMDCTstage2(int16_t* mem_s, int16_t mem[], int16_t memLen, int16_t *mem_e, int16_t *y_e, int16_t* y_s)
{
    int16_t s = 0;

    *mem_s = getScaleFactor16_0(mem, memLen);
    if ((*mem_s) < 16)
    {
        *mem_s  -= 1;
        *mem_e = (*mem_e) - (*mem_s);
    }
    else
        *mem_e = *y_e;  //

    s = (*mem_e) - (*y_e);
    if (s > 0)
    {
        *y_s  -=  s;
        *y_e = (*y_e) + s;
    }
    else
    {
        *mem_s  = (*mem_s) + s;
        *mem_e = (*mem_e) - s;
    }

    *mem_s = max((*mem_s), -31);
    *y_s   = max((*y_s), -31);
}

static inline void ProcessingIMDCTstage3(int16_t o, int16_t mem[], int16_t mem_s, int32_t y[], int16_t y_s, 
	                                                                        const int16_t w[], int16_t z, int16_t m, int16_t x[])
{
    int32_t  L_tmp = 0;
    int32_t i = 0;;

    /* regular operation */
    for(i = 0; i < o; i++)
    {
        L_tmp = L_sub(L_shl(L_deposit_h(mem[i]), mem_s), Mpy_32_16(L_shl(y[m + i + z], y_s), w[4 * m - 1 - i - z]));
       x[i] = round_fx(L_tmp); 
    }
    for(i = 0; i < m; i++)
    {
        L_tmp = L_add(L_shl(L_deposit_h(mem[i + o]), mem_s), Mpy_32_16(L_shl(y[2 * m - 1 - i], y_s), w[3 * m - 1 - i]));
        x[i + o] = round_fx(L_tmp);
    }

    for(i = 0; i < m; i++)
    {
        L_tmp = L_negate(Mpy_32_16(L_shl(y[i], y_s), w[m - 1 - i]));
        x[3 * m - z + i] = round_fx(L_tmp);
    }

    for(i = 0; i < m; i++)
    {
        L_tmp = L_negate(Mpy_32_16(L_shl(y[i], y_s), w[m + i]));
        x[3 * m - z - 1 - i] = round_fx(L_tmp);
    }
}

void ProcessingIMDCT(
    int32_t       y[],       /* i:   spectra data */
    int16_t *     y_e,       /* i:   spectral data exponent */
    const int16_t w[],       /* i:   window coefficients including normalization of sqrt(2/N) and scaled by 2^4 */
    int16_t       mem[],     /* i/o: overlap add memory */
    int16_t *     mem_e,     /* i/o: overlap add exponent */
    int16_t       x[],       /* o:   time signal out */
    int16_t       wLen,      /* i:   window length */
    int16_t       N,         /* i:   block size */
    int16_t       memLen,    /* i:   overlap add buffer size */
    int16_t       frame_dms, /* i:   frame size in ms */
    int16_t     concealMethod,     /* i:   concealment method */
    int16_t     bfi,               /* i:   bad frame indicator */
    int16_t     prev_bfi,          /* i:   previous bad frame indicator */
    int16_t     nbLostFramesInRow, /* i: number of consecutive lost frames */
    AplcSetup *plcAd,             /* i: advanced plc struct */
    int8_t *scratchBuffer)
{
    int16_t  o, z, m;
    int16_t  y_s, mem_s, max_bw;
    int32_t *workBuffer;

    if ((bfi != 1) || (concealMethod == 0) || (concealMethod == 4) || (concealMethod == 5))
    {
        workBuffer = (int32_t *)scratchBuffer; /* Size = 4 * MAX_LEN bytes */

        /* Init (constant per sample rate) */
        z      = 2 * N - wLen; /* number of leading zeros in window */
        m      = N >> 1;       /* half block size */
        o      = m - z;
        max_bw = 0;

        switch (frame_dms)
        {
            case 25:
                max_bw = MAX_BW >> 2; //
                break;
            case 50:
                max_bw = MAX_BW >> 1; //
                break;
            case 100:
                max_bw = MAX_BW; //
                break;
        }
        
        if (N > max_bw)
            memset(&y[max_bw], 0, (N - max_bw) * sizeof(*y));

        y_s = ProcessingIMDCTstage1(y, N, y_e, workBuffer);

        ProcessingIMDCTstage2(&mem_s, mem, memLen, mem_e, y_e, &y_s);

        ProcessingIMDCTstage3(o, mem, mem_s, y, y_s, w, z, m, x);

        memmove(mem, &x[N], memLen * sizeof(int16_t));
        *mem_e = *y_e;
    }
}
/* End Processing */


void Processing_ITDA_WIN_OLA(
    int32_t       L_x_tda[], /* i:     X_TDA buffer data   =  "y"  DCT-IV output */
    int16_t *     y_e,       /* i/o:   x_tda  input exponent "y_e"   ,   x output exponent */
    const int16_t w[],       /* i:     window coefficients including normalization of sqrt(2/N) and scaled by 2^4 */
    int16_t       mem[],     /* i/o:  overlap add memory */
    int16_t *     mem_e,     /* i/o:  overlap add exponent */
    int16_t       x[],       /* o:   time signal out */
    int16_t       wLen,      /* i:   window length */
    int16_t       N,         /* i:   block size */
    int16_t       memLen     /* i:   overlap add buffer size */
    )
{
    /* Declarations */
    int16_t  i, o, z, m, s;
    int16_t  y_s, mem_s;
    int32_t  L_tmp;
    int32_t *L_y;
    int16_t fs_idx, tmp_w, w_factor;
    int16_t factorITDA[5]= { 25905 ,      18318   ,    22435   ,    25905   ,    31727};

    /* Init (constants  per sample rate) */
    z = 2 * N - wLen; /* number of leading zeros in window */
    m = N >> 1;       /* half block size */
    o = m - z;
    L_y = L_x_tda; /* use same variables naming as in IMDCT for DCT-IV output  signal y */ 
    y_s = getScaleFactor32(L_y, N);        
    y_s -= 1; /*  add 1 bit margin  , y_s is now initial tda upscaling factor */
    *y_e = (((*y_e) + 1) - y_s); /*  handle W scale down by 2^(3) , as mdct synthesis window  was upscaled by  pow(2,x)  x=2 for NB otherwise 3  */
    mem_s = getScaleFactor16_0(mem, memLen);
    if (mem_s < 16)
    {
        mem_s  -= 1;      /* one bit margin */
        *mem_e = (*mem_e) - mem_s; /*adjusted mem exponent due to new scale */
    }
    else
        *mem_e = 0;  

    s = (*mem_e) - (*y_e); /*  */

    if (s > 0)
    {
        y_s  -= s;     /*  new , reduced upshift of TDA  in window application  loop */
        *y_e = (*y_e) + s;    /*  resulting new exp y_e  for output signal  */
    }
    else
    {
        mem_s  += s;   /*  s negative or zero,  new , decreased upshift of OLAmem   in loop */
        *mem_e = (*mem_e) - s;   /*   resulting new exp mem_e  for OLA_mem output signal  */
    }

    fs_idx = mult(N,(int16_t)(32768.0/99.0)); /* truncation needed , i.e no rounding can be applied here */  
    w_factor = factorITDA[fs_idx]; 
    for(i = 0; i < o; i++)
    {   
        tmp_w = mult_r(w[4 * m - 1 - i - z], w_factor);
        L_tmp = L_sub(L_shl_sat(L_deposit_h(mem[i]), mem_s), Mpy_32_16(L_shl(L_y[m + i + z], y_s), tmp_w ));
        x[i] = round_fx_sat(L_tmp);  
    }

    for(i = 0; i < m; i++)
    {   
        tmp_w = mult_r( w[3 * m - 1 - i] , w_factor  );
        L_tmp = L_add(L_shl_sat(L_deposit_h(mem[i + o]), mem_s), Mpy_32_16(L_shl(L_y[2 * m - 1 - i], y_s),tmp_w ));
        x[i + o] = round_fx_sat(L_tmp);  
    }

    for(i = 0; i < m; i++)
    {
        tmp_w = mult_r( w[m - 1 - i] , w_factor );
        L_tmp = L_negate(Mpy_32_16(L_shl(L_y[i], y_s), tmp_w));
        x[3 * m - z + i] = round_fx(L_tmp);  
    }

    for(i = 0; i < m; i++)
    {
        tmp_w =  mult_r( w[m + i] , w_factor  );
        L_tmp = L_negate(Mpy_32_16(L_shl(L_y[i], y_s), tmp_w ));
        x[3 * m - z - 1 - i] = round_fx(L_tmp);  
    }

    for(i = 0; i < memLen; i++)
        mem[i] = x[N + i];  
    *mem_e = *y_e;   /* set OLA mem  exp to  x_Fx exponent*/
}

