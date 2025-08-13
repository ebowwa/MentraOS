
#include "defines.h"
#include "functions.h"


/* initilize a short vector */
void plc_phEcu_initWord16(int16_t *     vec,   /*i/o : short vector pointer       */
                          const int16_t value, /*i   : short initialization value */
                          const int16_t len)   /*i   : number of elements         */
{
    int32_t n;

    for(n = 0; n < len; n++)
    {
        vec[n] = value; 
    }
}

void Scale_sig_sat(int16_t       x[], /* i/o: signal to scale                 Qx        */
                  const int16_t lg,   /* i  : size of x[]                     Q0        */
                  const int16_t exp0  /* i  : exponent: x = round(x << exp)   Qx ?exp  */
)
{
    int32_t i;
    int16_t  tmp;
    if (exp0 > 0)
    {
        for(i = 0; i < lg; i++)
        {
            x[i] = shl_sat(x[i], exp0);   /* no saturation warnings triggered here */
        }
        return;
    }
    if (exp0 < 0)
    {
        tmp = shl(-32768, max(exp0, -15)); /* we use negative to correctly represent 1.0 */
        for(i = 0; i < lg; i++)
        {
            x[i] = msu_r(0, x[i], tmp);   /* msu instead of mac because factor is negative */
        }
        return;
    }
}

void plc_phEcu_minval(const int16_t *inp,      /* i  : vector       */
                         const int16_t  len,      /* i  : length       */
                         int16_t       *minvalPtr /* o  : min  value Ptr    */
)
{
    int16_t  minTmp;
    int32_t pos;

    minTmp = inp[0];  
    assert(len>1);
    for(pos = 1; pos < len; pos++)
        minTmp = min(inp[pos], minTmp);

    *minvalPtr = minTmp;  
}

void plc_phEcu_maxval(const int16_t *inp,      /* i  : vector     */
                         const int16_t  len,      /* i  : length     */
                         int16_t       *maxvalPtr /* o  : *maxvalPtr */
)
{
    int16_t  maxTmp;
    int32_t pos;

    maxTmp = inp[0];
    assert(len>1);
    for(pos = 1; pos < len; pos++)
        maxTmp = max(inp[pos], maxTmp);

    *maxvalPtr = maxTmp;  
}

/* in case a  value (e.g max or min)  is already known , find the first corresponding array  index */
int16_t  plc_phEcu_find_ind(                        /* o  : output maximum  indx 0.. len-1    */
                              const int16_t *inp,      /* i  : vector     */
                              const int16_t  len,      /* i  : length     */
                              const int16_t  val   /* i  : value to find     */
)       
{
   int16_t  val_ind;
   int32_t pos;

   val_ind = -1;  
   for(pos = 0; pos < len; pos++)
   {
      if (sub(inp[pos], val) == 0)
         val_ind = pos;  
   }
   return   val_ind;
}

/*-----------------------------------------------------------------------------
 * ratio_fx()
 *
 * Divide the numerator by the denominator.
 *----------------------------------------------------------------------------*/
int16_t plc_phEcu_ratio(                     /* o : quotient   in Q14       */
                          const int32_t numer,  /* i : numerator               */
                          const int32_t denom,  /* i : denominator             */
                          int16_t *expo)        /* o : req shift of quotient   */
{
    int16_t expNumer, expDenom;
    int16_t manNumer, manDenom;
    int16_t quotient;

    expDenom = norm_l(denom);                     /* exponent */
    manDenom = extract_h(L_shl(denom, expDenom)); /* mantissa */
    expNumer = norm_l(numer);                     /* exponent */
    manNumer = extract_h(L_shl(numer, expNumer)); /* mantissa */
    manNumer = shr_pos(manNumer, 1);              /* Ensure the numerator < the denominator */
    quotient = div_s(manNumer, manDenom);         /* in Q14 */

    *expo = sub(expNumer, expDenom);
    return quotient; /* Q14 */
}

int32_t winEnCalc(                          /* o:  output summed energy Ltot */
                 const int16_t *x,          /* i: Input signal */
                 const int16_t headroom_shift,    /* i: headroom_shift */
                 const int16_t *win,        /* i: left side Window coefficients */
                 const int16_t  rectLength, /* i: Offset in between the 1st and 2nd symmetric halves of the Hamming window */
                 const int16_t  halfLength,  /* i: Half of the total length of a complete Hamming window. */
                 int16_t    *exp             /* i/o : i exp of int16_t variable x ,  o:Lexp of output int32_t sum */     
                 )
{
    int32_t       i;
    int32_t        L_tot; 
    const int16_t *pX, *pW;
    int16_t        tmp, tmp_RL;

    //TRACE("PhECU::GF::winEnCalc");

    L_tot = INT32_MAX;  /*acc is on negative side , but as all accumulatio is positive, we make use of one extra bit   */
    pX   = x;
    pW   = win;

    assert( headroom_shift>=0 );
    for(i = 0; i < halfLength; i++) /* 1st symmetric half of the Hamming window */
    {
          tmp   = mult(*pX++, *pW++);   
          tmp   = shr_pos(tmp, headroom_shift);  /* shr  may/create  bias on the negative side , costly options are shr_r or use msu_r */
          L_tot = L_msu0(L_tot, tmp, tmp);       /* acc on negative energy side */
    }

    /* Periodic filter - one more rect sample before end tapering */
    tmp_RL = add(rectLength, 1);
    ASSERT_LC3(rectLength != 0);

    for(i = 0; i < tmp_RL; i++) /* If rectLength is zero, it's a pure Hamming window; otherwise Hamming-Rectangular. */
    {    
          tmp   = shr_pos( *pX++, headroom_shift);
          L_tot = L_msu0(L_tot, tmp, tmp); /* acc on negative side */
    }

    tmp_RL = sub(halfLength, 1);
    ASSERT_LC3(rectLength != 0);

    for(i = 0; i < tmp_RL; i++) /* 2nd symmetric half of the Hamming window. */
    {
        tmp   = mult(*pX++, *(--pW));   
        tmp   = shr_pos(tmp, headroom_shift);
        L_tot = L_msu0(L_tot, tmp, tmp);
    }

  /*  Lexp = 2*(incoming_exp + dnshift) + 1  , 2x for square + 1(for msu0 DSP dn shift)*/
   *exp   =   add(shl_pos(add(*exp, headroom_shift),1),1);  

     /* handle wrap on zero point */
    if ( L_tot >= 0 )
    {  /* L_tot positive           --> less than 32 bits needed, */
       L_tot = L_add(L_tot,(INT32_MIN+1));
       if( L_tot == 0 )
       {      
          *exp =  LTOT_MIN_EXP; /* WC is actually (-(15+4)*2 + 1 +1  -31) */ ;  
       }  
       L_tot =  min(L_tot, -1);     /* make sure there is energy for future ratio calculations */
    } 
    else 
    {   /* L_tot negative --> more than 31 bits needed for sum , scale  32 bit sum within 31 bits  and  adjust exp */
 
         L_tot = L_shr_pos(L_add(L_tot,1),1);  /* rnd by adding 1,  then use 50% contribution from negative  side */
         L_tot = L_add(L_tot, INT32_MIN>>1);     /* add 50% contribution from positive side */      
    
        *exp =  add(*exp, 1);              
    } 

    L_tot = max( -(INT32_MAX), L_tot);  /* guard against max accumulation on the  negative side , should only occur for rectangle windows */
    L_tot = L_negate(L_tot); /* no saturation here */

    /* activate when xfp_exp is not used any longer */  
    /*  pre-maximize the mantissa for  the following  steps  in burst_ana_dx  */
    tmp   = norm_l(L_tot);
    L_tot =  L_shl(L_tot,tmp);
    *exp  =  sub(*exp, tmp);     
    return L_tot;
}

