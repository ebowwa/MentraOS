
#include "basop_mpy.h"
#include "basop_util.h"
#include "rom_basop_util.h"
#include <assert.h>
#include <stdio.h>
#include "stl.h"


extern const int32_t SqrtTable[32];
extern const int16_t SqrtDiffTable[32];

extern const int32_t ISqrtTable[32];
extern const int16_t ISqrtDiffTable[32];

extern const int32_t InvTable[32];
extern const int16_t InvDiffTable[32];

int32_t LC3_Log2(int32_t x)
{
    int32_t exp;
    int16_t exp_e;
    int16_t nIn;
    int16_t accuSqr;
    int32_t accuRes;

    assert(x >= 0);

    if (x == 0)
    {

        return ((int32_t)MIN_32);
    }

    /* normalize input, calculate integer part */
    exp_e = norm_l(x);
    x     = L_shl(x, exp_e);
    exp   = L_deposit_l(exp_e);

    /* calculate (1-normalized_input) */
    nIn = extract_h(L_sub(MAX_32, x));

    /* approximate ln() for fractional part (nIn *c0 + nIn^2*c1 + nIn^3*c2 + ... + nIn^8 *c7) */

    /* iteration 1, no need for accumulation */
    accuRes = L_mult(nIn, ldCoeff[0]); /* nIn^i * coeff[0] */
    accuSqr = mult(nIn, nIn);          /* nIn^2, nIn^3 .... */

    /* iteration 2 */
    accuRes = L_mac(accuRes, accuSqr, ldCoeff[1]); /* nIn^i * coeff[1] */
    accuSqr = mult(accuSqr, nIn);                  /* nIn^2, nIn^3 .... */

    /* iteration 3 */
    accuRes = L_mac(accuRes, accuSqr, ldCoeff[2]); /* nIn^i * coeff[2] */
    accuSqr = mult(accuSqr, nIn);                  /* nIn^2, nIn^3 .... */

    /* iteration 4 */
    accuRes = L_mac(accuRes, accuSqr, ldCoeff[3]); /* nIn^i * coeff[3] */
    accuSqr = mult(accuSqr, nIn);                  /* nIn^2, nIn^3 .... */

    /* iteration 5 */
    accuRes = L_mac(accuRes, accuSqr, ldCoeff[4]); /* nIn^i * coeff[4] */
    accuSqr = mult(accuSqr, nIn);                  /* nIn^2, nIn^3 .... */

    /* iteration 6 */
    accuRes = L_mac(accuRes, accuSqr, ldCoeff[5]); /* nIn^i * coeff[5] */
    accuSqr = mult(accuSqr, nIn);                  /* nIn^2, nIn^3 .... */

    /* iteration 7, no need to calculate accuSqr any more */
    accuRes = L_mac(accuRes, accuSqr, ldCoeff[6]); /* nIn^i * coeff[6] */

    /* ld(fractional part) = ln(fractional part)/ln(2), 1/ln(2) = (1 + 0.44269504) */
    accuRes = L_mac0_1(L_shr(accuRes, 1), extract_h(accuRes), 14506);

    accuRes = L_shr(accuRes, LD_DATA_SCALE - 1); /* fractional part/LD_DATA_SCALE */
    exp     = L_shl(exp, (31 - LD_DATA_SCALE));  /* integer part/LD_DATA_SCALE */
    accuRes = L_sub(accuRes, exp);               /* result = integer part + fractional part */

    return (accuRes);
}

int32_t InvLog2(int32_t x)
{
    int16_t  frac;
    int16_t  exp;
    int32_t  retVal;
    uint32_t index3;
    uint32_t index2;
    uint32_t index1;
    uint32_t lookup3f;
    uint32_t lookup12;
    uint32_t lookup;

    if (x < -1040187392l /*-31.0/64.0 Q31*/)
    {

        return 0;
    }
    
    if ((L_sub(x, 1040187392l /*31.0/64.0 Q31*/) >= 0) || (x == 0))
    {

        return 0x7FFFFFFF;
    }

    frac = extract_l(L_and(x, 0x3FF));

    index3 = L_and(L_shr(x, 10), 0x1F);
    index2 = L_and(L_shr(x, 15), 0x1F);
    index1 = L_and(L_shr(x, 20), 0x1F);

    exp = extract_l(L_shr(x, 25));
    if (x > 0)
    {
        exp = sub(31, exp);
    }
    if (x < 0)
    {
        exp = negate(exp);
    }

    lookup3f = L_add(exp2x_tab_long_lc3[index3], L_shr(Mpy_32_16_asm(0x0016302F, frac), 1));
    lookup12 = Mpy_32_32(exp2_tab_long_lc3[index1], exp2w_tab_long_lc3[index2]);
    lookup   = Mpy_32_32(lookup12, lookup3f);

    retVal = L_shr(lookup, sub(exp, 3));

    return retVal;
}

/* local function for Sqrt16 and Sqrt16norm */
static int16_t Sqrt16_common(int16_t m, int16_t e)
{
    int16_t index, frac;

    assert((m >= 0x4000) || (m == 0));

    /* get table index (upper 6 bits minus 32) */
    /* index = (m >> 9) - 32; */
    index = mac_r(-32768 - (32 << 16), m, 1 << 6);

    /* get fractional part for interpolation (lower 9 bits) */
    frac = s_and(m, 0x1FF); /* Q9 */

    /* interpolate */
    if (m != 0)
    {
        m = mac_r(SqrtTable[index], SqrtDiffTable[index], frac);
    }

    /* handle odd exponents */
    if (s_and(e, 1) != 0)
        m = mult_r(m, 0x5a82);

    return m;
}

/* local function for ISqrt16 and ISqrt16norm */
static int16_t ISqrt16_common(int16_t m, int16_t e)
{
    int16_t index, frac;

    assert(m >= 0x4000);

    /* get table index (upper 6 bits minus 32) */
    /* index = (m >> 9) - 32; */
    index = mac_r(-32768 - (32 << 16), m, 1 << 6);

    /* get fractional part for interpolation (lower 9 bits) */
    frac = s_and(m, 0x1FF); /* Q9 */

    /* interpolate */
    m = msu_r(ISqrtTable[index], ISqrtDiffTable[index], frac);

    /* handle even exponents */
    if (s_and(e, 1) == 0)
        m = mult_r(m, 0x5a82);

    return m;
}

int16_t Sqrt16(                  /*!< output mantissa */
              int16_t  mantissa, /*!< input mantissa */
              int16_t *exponent  /*!< pointer to exponent */
)
{
    int16_t preShift, e;

    assert(mantissa >= 0);

    /* normalize */
    preShift = norm_s(mantissa);

    e        = sub(*exponent, preShift);
    mantissa = shl(mantissa, preShift);

    /* calc mantissa */
    mantissa = Sqrt16_common(mantissa, e);

    /* e = (e + 1) >> 1 */
    *exponent = mult_r(e, 1 << 14); 

    return mantissa;
}

int16_t ISqrt16(                  /*!< output mantissa */
               int16_t  mantissa, /*!< input mantissa */
               int16_t *exponent  /*!< pointer to exponent */
)
{
    int16_t preShift, e;

    assert(mantissa > 0);

    /* normalize */
    preShift = norm_s(mantissa);

    e        = sub(*exponent, preShift);
    mantissa = shl(mantissa, preShift);

    /* calc mantissa */
    mantissa = ISqrt16_common(mantissa, e);

    /* e = (2 - e) >> 1 */
    *exponent = msu_r(1L << 15, e, 1 << 14); 

    return mantissa;
}

int16_t Inv16(                  /*!< output mantissa */
             int16_t  mantissa, /*!< input mantissa */
             int16_t *exponent  /*!< pointer to exponent */
)
{
    int16_t index, frac;
    int16_t preShift;
    int16_t m, e;

    assert(mantissa != 0);

    /* absolute */
    m = abs_s(max(mantissa, MIN_16 + 1));

    /* normalize */
    preShift = norm_s(m);

    e = sub(*exponent, preShift);
    m = shl(m, preShift);

    /* get table index (upper 6 bits minus 32) */
    /* index = (m >> 9) - 32; */
    index = mac_r(-32768 - (32 << 16), m, 1 << 6);

    /* get fractional part for interpolation (lower 9 bits) */
    frac = shl(s_and(m, 0x1FF), 1); /* Q10 */

    /* interpolate */
    m = msu_r(InvTable[index], InvDiffTable[index], frac);

    /* restore sign */
    if (mantissa < 0)
        m = negate(m);

    /* e = 1 - e */
    *exponent = sub(1, e); 

    return m;
}

/********************************************************************/
/*!
  \brief   Calculates the scalefactor needed to normalize input array

    The scalefactor needed to normalize the int16_t input array is returned <br>
    If the input array contains only '0', a scalefactor 0 is returned <br>
    Scaling factor is determined wrt a normalized target x: 16384 <= x <= 32767 for positive x <br>
    and   -32768 <= x <= -16384 for negative x
*/

int16_t getScaleFactor16(                    /* o: measured headroom in range [0..15], 0 if all x[i] == 0 */
                        const int16_t *x,    /* i: array containing 16-bit data */
                        const int16_t  len_x) /* i: length of the array to scan  */
{
    int32_t i;
    int16_t  i_min, i_max;
    int16_t  x_min, x_max;

    x_max = 0; 
    x_min = 0; 
    for(i = 0; i < len_x; i++)
    {
        if (x[i] >= 0)
            x_max = max(x_max, x[i]);
        if (x[i] < 0)
            x_min = min(x_min, x[i]);
    }

    i_max = 0x10; 
    i_min = 0x10; 

    if (x_max != 0)
        i_max = norm_s(x_max);

    if (x_min != 0)
        i_min = norm_s(x_min);

    i = s_and(min(i_max, i_min), 0xF);

    return i;
}

/********************************************************************/
/*!
  \brief   Calculates the scalefactor needed to normalize input array

    The scalefactor needed to normalize the int16_t input array is returned <br>
    If the input array contains only '0', a scalefactor 16 is returned <br>
    Scaling factor is determined wrt a normalized target x: 16384 <= x <= 32767 for positive x <br>
    and   -32768 <= x <= -16384 for negative x
*/

int16_t getScaleFactor16_0(                    /* o: measured headroom in range [0..15], 16 if all x[i] == 0 */
                          const int16_t *x,    /* i: array containing 16-bit data */
                          const int16_t  len_x) /* i: length of the array to scan  */
{
    int32_t i;
    int16_t  i_min, i_max;
    int16_t  x_min, x_max;

    x_max = 0;
    x_min = 0;
    for(i = 0; i < len_x; i++)
    {
        if (x[i] >= 0)
            x_max = max(x_max, x[i]);
        if (x[i] < 0)
            x_min = min(x_min, x[i]);
    }

    i_max = 0x10;
    i_min = 0x10;

    if (x_max != 0)
        i_max = norm_s(x_max);

    if (x_min != 0)
        i_min = norm_s(x_min);

    i = min(i_max, i_min);

    return i;
}

/********************************************************************/
/*!
  \brief   Calculates the scalefactor needed to normalize input array

    The scalefactor needed to normalize the int32_t input array is returned <br>
    If the input array contains only '0', a scalefactor 0 is returned <br>
    Scaling factor is determined wrt a normalized target x: 1073741824 <= x <= 2147483647 for positive x <br>
    and   -2147483648 <= x <= -1073741824 for negative x
*/

int16_t getScaleFactor32(                    /* o: measured headroom in range [0..31], 0 if all x[i] == 0 */
                        const int32_t *x,    /* i: array containing 32-bit data */
                        const int16_t  len_x) /* i: length of the array to scan  */
{
    int32_t i;
    int16_t  i_min, i_max;
    int32_t  x_min, x_max;

    x_max = L_add(0, 0);
    x_min = L_add(0, 0);
    for(i = 0; i < len_x; i++)
    {
        if (x[i] >= 0)
            x_max = max(x_max, x[i]);
        if (x[i] < 0)
            x_min = min(x_min, x[i]);
    }

    i_max = 0x20;
    i_min = 0x20;

    if (x_max != 0)
        i_max = norm_l(x_max);

    if (x_min != 0)
        i_min = norm_l(x_min);

    i = s_and(min(i_max, i_min), 0x1F);

    return i;
}

/********************************************************************/
/*!
  \brief   Calculates the scalefactor needed to normalize input array

    The scalefactor needed to normalize the int32_t input array is returned <br>
    If the input array contains only '0', a scalefactor 32 is returned <br>
    Scaling factor is determined wrt a normalized target x: 1073741824 <= x <= 2147483647 for positive x <br>
    and   -2147483648 <= x <= -1073741824 for negative x
*/

int16_t getScaleFactor32_0(                    /* o: measured headroom in range [0..31], 32 if all x[i] == 0 */
                          const int32_t *x,    /* i: array containing 32-bit data */
                          const int16_t  len_x) /* i: length of the array to scan  */
{
    int32_t i;
    int16_t  i_min, i_max;
    int32_t  x_min, x_max;

    x_max = L_add(0, 0);
    x_min = L_add(0, 0);
    for(i = 0; i < len_x; i++)
    {
        if (x[i] >= 0)
            x_max = max(x_max, x[i]);
        if (x[i] < 0)
            x_min = min(x_min, x[i]);
    }

    i_max = 0x20;
    i_min = 0x20;

    if (x_max != 0)
        i_max = norm_l(x_max);

    if (x_min != 0)
        i_min = norm_l(x_min);

    i = min(i_max, i_min);
    return i;
}

int16_t Divide3216_Scale(           /* o: result of division x/y, not normalized  */
                                   int32_t  x, /* i: numerator, signed                       */
                                   int16_t  y, /* i: denominator, signed                     */
                                   int16_t *s) /* o: scaling, 0, if x==0                     */
{
    int16_t z;
    int16_t sx;
    int16_t sy;
    int16_t sign;

    /*assert (x > (int32_t)0);
    assert (y >= (int16_t)0);*/

    /* check, if numerator equals zero, return zero then */
    if (x == (int32_t)0)
    {
        *s = 0; 

        return ((int16_t)0);
    }

    sign = s_xor(extract_h(x), y); /* just to exor the sign bits */
    x    = L_abs(max(x, MIN_32 + 1));
    y    = abs_s(max(y, MIN_16 + 1));
    sx   = sub(norm_l(x), 1);
    x    = L_shl(x, sx);
    sy   = norm_s(y);
    y    = shl(y, sy);
    *s   = sub(sy, sx); 

    z = div_s(round_fx(x), y);

    if (sign < 0) /* if sign bits differ, negate the result */
    {
        z = negate(z);
    }

    return z;
}

int16_t Divide1616_Scale(int16_t x, int16_t y, int16_t *s)
{
    int16_t z;
    int16_t sx;
    int16_t sy;
    int16_t sign;

    /* assert (x >= (int16_t)0); */
    assert(y != (int16_t)0);

    sign = 0; 

    if (x < 0)
    {
        x    = negate(x);
        sign = s_xor(sign, 1);
    }

    if (y < 0)
    {
        y    = negate(y);
        sign = s_xor(sign, 1);
    }

    if (x == (int16_t)0)
    {
        *s = 0; 

        return ((int16_t)0);
    }

    sx = norm_s(x);
    x  = shl(x, sx);
    x  = shr(x, 1);
    *s = sub(1, sx); 

    sy = norm_s(y);
    y  = shl(y, sy);
    *s = add(*s, sy); 

    z = div_s(x, y);

    if (sign != 0)
    {
        z = negate(z);
    }

    return z;
}

int32_t Norm32Norm(const int32_t *x, const int16_t headroom, const int16_t length, int16_t *result_e)
{
    int32_t  L_tmp, L_tmp2, inc;
    int16_t  s, shift, tmp;
    int32_t i;

    shift = headroom; 

    L_tmp = L_deposit_l(0);

    for(i = 0; i < length; i++)
    {
        L_tmp2 = L_sub(L_tmp, 0x40000000);
        if (L_tmp2 >= 0)
            shift = sub(shift, 1);
        if (L_tmp2 >= 0)
            L_tmp = L_shr(L_tmp, 2);

        tmp   = round_fx_sat(L_shl_sat(x[i], shift));
        L_tmp = L_mac0_1(L_tmp, tmp, tmp); /* exponent = (1-shift*2) , Q(30+shift*2) */
    }

    /* Consider an increase of 0xfffd per sample in case that the pre-shift factor
       in the acf is 1 bit higher than the shift factor estimated in this function.
       This prevent overflows in the acf. */
    if (L_tmp != 0)
    {
        s     = norm_s(length);
        inc   = L_shl(Mpy_32_16_asm(0x0000fffd, shl(length, s)), sub(15, s));
        L_tmp = L_add(L_tmp, inc);
    }

    *result_e = sub(1, shl(shift, 1)); 

    return L_tmp;
}

void Scale_sig(int16_t       x[], /* i/o: signal to scale                 Qx        */
               const int16_t lg,  /* i  : size of x[]                     Q0        */
               const int16_t exp0 /* i  : exponent: x = round(x << exp)   Qx ?exp  */
)
{
    int32_t i;
    int16_t  tmp;
    if (exp0 > 0)
    {
        for(i = 0; i < lg; i++)
            x[i] = shl(x[i], exp0); /* saturation can occur here */
        return;
    }
    if (exp0 < 0)
    {
        tmp = shl(-32768, max(exp0, -15)); /* we use negative to correctly represent 1.0 */
        for(i = 0; i < lg; i++)
            x[i] = msu_r(0, x[i], tmp);/* msu instead of mac because factor is negative */
        return;
    }
}

void Copy_Scale_sig(const int16_t x[], /* i  : signal to scale input           Qx        */
                    int16_t       y[], /* o  : scaled signal output            Qx        */
                    const int16_t lg,  /* i  : size of x[]                     Q0        */
                    const int16_t exp0 /* i  : exponent: x = round(x << exp)   Qx ?exp  */
)
{
    int32_t i;
    int16_t  tmp;

    if (exp0 == 0)
    {
        memmove(y, x, lg * sizeof(int16_t));

        return;
    }
    if (exp0 < 0)
    {
        tmp = shl(-32768, exp0); /* we use negative to correctly represent 1.0 */
        for(i = 0; i < lg; i++)
        {
            y[i] = msu_r(0, x[i], tmp); 
        }
        return;
    }
    for(i = 0; i < lg; i++)
    {
        y[i] = shl(x[i], exp0);  /* saturation can occur here */
    }
}

int32_t LC3_Add_Mant32Exp /*!< o: normalized result mantissa */
    (int32_t  a_m,               /*!< i: Mantissa of 1st operand a  */
     int16_t  a_e,               /*!< i: Exponent of 1st operand a  */
     int32_t  b_m,               /*!< i: Mantissa of 2nd operand b  */
     int16_t  b_e,               /*!< i: Exponent of 2nd operand b  */
     int16_t *ptr_e)             /*!< o: exponent of result         */
{
    int32_t L_tmp;
    int16_t shift;

    /* Compare exponents: the difference is limited to +/- 30
       The int32_t mantissa of the operand with lower exponent is shifted right by the exponent difference.
       Then, the unshifted mantissa of the operand with the higher exponent is added. The addition result
       is normalized and the result represents the mantissa to return. The returned exponent takes into
       account all shift operations.
    */

    if (!a_m)
        a_e = add(b_e, 0);

    if (!b_m)
        b_e = add(a_e, 0);

    shift = sub(a_e, b_e);
    shift = max(-31, shift);
    shift = min(31, shift);
    if (shift < 0)
    {
        /* exponent of b is greater than exponent of a, shr a_m */
        a_m = L_shl(a_m, shift);
    }
    if (shift > 0)
    {
        /* exponent of a is greater than exponent of b */
        b_m = L_shr(b_m, shift);
    }
    a_e   = add(max(a_e, b_e), 1);
    L_tmp = L_add(L_shr(a_m, 1), L_shr(b_m, 1));
    shift = norm_l(L_tmp);
    if (shift)
        L_tmp = L_shl(L_tmp, shift);
    if (L_tmp == 0)
        a_e = add(0, 0);
    if (L_tmp != 0)
        a_e = sub(a_e, shift);
    *ptr_e = a_e;

    return (L_tmp);
}

int16_t LC3_Cmp_Mant32Exp /*!< o: flag: result of comparison */
                                /*      0, if a == b               */
                                /*      1, if a > b                */
                                /*     -1, if a < b                */
    (int32_t a_m,                /*!< i: Mantissa of 1st operand a  */
     int16_t a_e,                /*!< i: Exponent of 1st operand a  */
     int32_t b_m,                /*!< i: Mantissa of 2nd operand b  */
     int16_t b_e)                /*!< i: Exponent of 2nd operand b  */

{
    int32_t diff_m;
    int16_t diff_e, shift, result;

    /*
       This function compares two input parameters, both represented by a 32-bit mantissa and a 16-bit exponent.
       If both values are identical, 0 is returned.
       If a is greater b, 1 is returned.
       If a is less than b, -1 is returned.
    */

    /* Check, if both mantissa and exponents are identical, when normalized: return 0 */
    shift = norm_l(a_m);
    if (shift)
        a_m = L_shl(a_m, shift);
    if (shift)
        a_e = sub(a_e, shift);

    shift = norm_l(b_m);
    if (shift)
        b_m = L_shl(b_m, shift);
    if (shift)
        b_e = sub(b_e, shift);

    /* align exponent, if any mantissa is zero */
    if (!a_m)
        a_e = add(b_e, 0);
    if (!b_m)
        b_e = add(a_e, 0);

    if (a_m > 0 && b_m < 0)
    {
        diff_m = 1; 
    }
    else if (a_m<0 && b_m> 0)
    {
        diff_m = -1; 
    }
    else
    {
        diff_m = L_sub(a_m, b_m);
    }

    diff_e = sub(a_e, b_e);

    
    if (diff_m == 0 && diff_e == 0)
    {
        return 0;
    }

    /* Check sign, exponent and mantissa to identify, whether a is greater b or not */
    result = sub(0, 1);

    if (a_m >= 0)
    {
        /* a is positive */
        if (b_m < 0)
        {
            result = add(1, 0);
        }

          
        if ((b_m >= 0) && ((diff_e > 0) || (diff_e == 0 && diff_m > 0)))
        {
            result = add(1, 0);
        }
    }
    else
    {
        /* a is negative */
          
        if ((b_m < 0) && ((diff_e < 0) || (diff_e == 0 && diff_m > 0)))
        {
            result = add(1, 0);
        }
    }
    return result;
}

/*----------------------------------------------------------------------------------*
 *  Function: Isqrt
 *
 *  Description:
 *
 *    The function computes 1/sqrt(x).
 *    The mantissa of the input value must be in the range of 1.0 > x >= 0.5.
 *    The computation of the inverse square root is an approach with a lookup table
 *    and linear interpolation.
 *
 *    result = x * 2^x_e
 *
 *  Parameter:
 *
 *    x    [i]    mantissa (Q31)
 *    x_e  [i/o]  pointer to exponent (Q0)
 *
 *  Return value:
 *
 *    mantissa (Q31)
 *
 *----------------------------------------------------------------------------------*/
int32_t Isqrt(int32_t  x,  /* mantissa */
             int16_t *x_e /* pointer to exponent */
)
{
    int16_t s;
    int32_t y;
    int32_t idx;
    int32_t diff;
    int16_t fract;

    if (x <= 0)
    {
        *x_e = 0; 
        return 0x7FFFFFFF;
    }

    /* check if exponent is odd */
    s = s_and(*x_e, 0x0001);

    /* get table index (upper 8 bits) */
    idx = L_and(L_shr(x, (31 - 8)), 0x00000007f);

    /* get fractional part for interpolation (lower 23 bits) */
    fract = extract_h(L_shl(L_and(x, 0x007FFFFF), 8));

    /* interpolate */
    diff = L_sub(isqrt_table[idx + 1], isqrt_table[idx]);
    y    = L_add(isqrt_table[idx], Mpy_32_16_asm(diff, fract));

    /* if exponent is odd apply sqrt(0.5) */
    if (s != 0)
    {
        y = Mpy_32_16_asm(y, 0x5A82 /*0x5A827999*/);
    }

    /* if exponent is odd shift 1 bit left */
    if (s != 0)
    {
        y = L_shl(y, s);
    }

    /* change sign, shift right and add 1 to exponent (implicit exponent of isqrt_table) */
    *x_e = mac_r(32768, *x_e, -16384); 

    return y;
}

int16_t LC3_Log2_16(int32_t x, int16_t x_e)
{
    int16_t shift, tmp1, tmp2;
    int16_t outInt, outFrac, out;

    assert(x >= 0);

    if (x == 0)
    {
        return (MIN_16);
    }

    /* Scale Input */
    shift = norm_l(x);
    x     = L_shl(x, sub(shift, 10));

    /* Integer part */
    outInt = shl(sub(sub(x_e, shift), 1), 9);

    /* Fractional part */
    tmp1    = mac_r(x, -33, 16384);
    tmp2    = lshr(extract_l(x), 6);
    outFrac = mac_r(Log2_16_table1[tmp1], Log2_16_table2[tmp1], tmp2);

    /* Output */
    out = add(outInt, outFrac);

    return out;
}

int16_t InvLog2_16(int16_t x, int16_t *y_e)
{
    int16_t tmp1, tmp2, y;

    tmp1 = shr(s_and(x, 2047), 5);
    tmp2 = shl(s_and(x, 31), 4);
    y    = mac_r(InvLog2_16_table1[tmp1], InvLog2_16_table2[tmp1], tmp2);
    *y_e = add(shr_pos(x, 11), 1);

    return y;
}
