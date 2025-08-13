
#ifndef _BASIC_OP_H
#define _BASIC_OP_H

#include "cmsis_os.h"
#include "hal_trace.h"

#define HIDE_UNUSED_BASOP

/*___________________________________________________________________________
 |                                                                           |
 |   Constants and Globals                                                   |
 |___________________________________________________________________________|
*/
extern int32_t Overflow, Overflow2;
extern int32_t Carry;

#define MAX_32 (int32_t)0x7fffffffL
#define MIN_32 (int32_t)0x80000000L

#define MAX_16 (int16_t)0x7fff
#define MIN_16 (int16_t)0x8000

#define max(a,b)            (((a) > (b)) ? (a) : (b))
#define min(a,b)            (((a) < (b)) ? (a) : (b))


/* A list of functions that need saturation can be find below marked with an _sat */

static int32_t inline L_shl_sat (int32_t L_var1, int16_t var2);
static int32_t inline L_shr_sat (int32_t L_var1, int16_t var2);
static int16_t inline shl_sat (int16_t var1, int16_t var2);
static int16_t inline shr_sat (int16_t var1, int16_t var2);
static int32_t inline L_abs_sat (int32_t L_var1);
static int16_t inline abs_s_sat (int16_t var1);
static int32_t inline round_fx_sat (int32_t L_var1);
static int32_t inline L_mac_sat (int32_t L_var1, int16_t var1, int16_t var2);
static int32_t inline L_msu_sat (int32_t L_var1, int16_t var1, int16_t var2);
static int32_t inline L_mac0_sat (int32_t L_var1, int16_t var1, int16_t var2);
static int32_t inline L_add_sat (int32_t L_var1, int32_t L_var2);
static int32_t inline L_sub_sat (int32_t L_var1, int32_t L_var2);
static int16_t inline sub_sat (int16_t var1, int16_t var2);
static int16_t inline add_sat (int16_t var1, int16_t var2);
int16_t mac_r_sat (int32_t L_var1, int16_t var1, int16_t var_2);

#define L_shl_pos(x, y) (L_shl((x), (y)))
#define L_shr_pos(x, y) (L_shr((x), (y)))
#define L_shr_pos_pos(x, y) (L_shr((x), (y)))

#define shl_pos(x, y) (shl((x), (y)))
#define shr_pos(x, y) (shr((x), (y)))
#define shr_pos_pos(x, y) (shr((x), (y)))

#define lshl_pos(x, y) (lshl(x, y))
#define UL_lshr_pos(x, y) (UL_lshr(x, y))
#define UL_lshl_pos(x, y) (UL_lshl(x, y))



/*
 * Additional G.723.1 operators
*/
int32_t L_mls( int32_t, int16_t ) ;    /* Weight FFS; currently assigned 5 */
int16_t div_l( int32_t, int16_t ) ;    /* Weight FFS; currently assigned 32 */
static int16_t inline i_mult(int16_t a, int16_t b);  /* Weight FFS; currently assigned 3 */

/*
 *  New shiftless operators, not used in G.729/G.723.1
*/
static int32_t inline L_mult0(int16_t v1, int16_t v2); /* 32-bit Multiply w/o shift         1 */
static int32_t inline L_mac0_1(int32_t L_v3, int16_t v1, int16_t v2); /* 32-bit Mac w/o shift  1 */
static int32_t inline L_msu0(int32_t L_v3, int16_t v1, int16_t v2); /* 32-bit Msu w/o shift  1 */

#include "dspfns.h"

/*
 ******************************************************************************
 * The following three operators are not part of the original
 * G.729/G.723.1 set of basic operators and implement shiftless
 * accumulation operation.
 ******************************************************************************
*/

/*__________________________________________________________________________
|                                                                           |
|   Function Name : i_mult                                                  |
|                                                                           |
|   Purpose :                                                               |
|                                                                           |
|   Integer 16-bit multiplication with overflow control.                    |
|   No overflow protection is performed if ORIGINAL_G7231 is defined.       |
|                                                                           |
|   Complexity weight : 3 (it is performing something equivalent to         |
|                          extract_h( L_shl( L_mult0( v1, v2), 16))         |
|                                                                           |
|   Inputs :                                                                |
|                                                                           |
|    a                                                                      |
|             16 bit short signed integer (int16_t).                         |
|                                                                           |
|    b                                                                      |
|             16 bit short signed integer (int16_t).                         |
|                                                                           |
|   Outputs :                                                               |
|                                                                           |
|    none                                                                   |
|                                                                           |
|   Return Value :                                                          |
|                                                                           |
|             16 bit short signed integer (int16_t). No overflow checks      |
|             are performed if ORIGINAL_G7231 is defined.                   |
|___________________________________________________________________________|
*/
int16_t inline i_mult (int16_t a, int16_t b)
{
#ifdef ORIGINAL_G7231
   return a*b ;
#else
   int32_t /*register*/ c=a*b;
   return saturate(c) ;
#endif
}

/*
 ******************************************************************************
 * The following three operators are not part of the original
 * G.729/G.723.1 set of basic operators and implement shiftless
 * accumulation operation.
 ******************************************************************************
*/

/*___________________________________________________________________________
 |
 |   Function Name : L_mult0
 |
 |   Purpose :
 |
 |   L_mult0 is the 32 bit result of the multiplication of var1 times var2
 |   without one left shift.
 |
 |   Complexity weight : 1
 |
 |   Inputs :
 |
 |    var1     16 bit short signed integer (int16_t) whose value falls in the
 |             range : 0xffff 8000 <= var1 <= 0x0000 7fff.
 |
 |    var2     16 bit short signed integer (int16_t) whose value falls in the
 |             range : 0xffff 8000 <= var1 <= 0x0000 7fff.
 |
 |   Return Value :
 |
 |    L_var_out
 |             32 bit long signed integer (int32_t) whose value falls in the
 |             range : 0x8000 0000 <= L_var_out <= 0x7fff ffff.
 |___________________________________________________________________________
*/
int32_t inline L_mult0 (int16_t var1,int16_t var2)
{
  int32_t L_var_out;

  L_var_out = (int32_t)var1 * (int32_t)var2;

  return(L_var_out);
}

/*___________________________________________________________________________
 |
 |   Function Name : L_mac0_1
 |
 |   Purpose :
 |
 |   Multiply var1 by var2 (without left shift) and add the 32 bit result to
 |   L_var3 with saturation, return a 32 bit result:
 |        L_mac0_1(L_var3,var1,var2) = L_add(L_var3,(L_mult0(var1,var2)).
 |
 |   Complexity weight : 1
 |
 |   Inputs :
 |
 |    L_var3   32 bit long signed integer (int32_t) whose value falls in the
 |             range : 0x8000 0000 <= L_var3 <= 0x7fff ffff.
 |
 |    var1     16 bit short signed integer (int16_t) whose value falls in the
 |             range : 0xffff 8000 <= var1 <= 0x0000 7fff.
 |
 |    var2     16 bit short signed integer (int16_t) whose value falls in the
 |             range : 0xffff 8000 <= var1 <= 0x0000 7fff.
 |
 |   Return Value :
 |
 |    L_var_out
 |             32 bit long signed integer (int32_t) whose value falls in the
 |             range : 0x8000 0000 <= L_var_out <= 0x7fff ffff.
 |___________________________________________________________________________
*/
int32_t inline L_mac0_1 (int32_t L_var3, int16_t var1, int16_t var2)
{
    int32_t L_var_out;

    asm("smlabb %0, %1, %2, %3"    
            : "=r" (L_var_out)    
            : "r" (var1), "r" (var2), "r" (L_var3));

    return(L_var_out);
}

/*___________________________________________________________________________
 |
 |   Function Name : L_msu0
 |
 |   Purpose :
 |
 |   Multiply var1 by var2 (without left shift) and subtract the 32 bit
 |   result to L_var3 with saturation, return a 32 bit result:
 |        L_msu0(L_var3,var1,var2) = L_sub(L_var3,(L_mult0(var1,var2)).
 |
 |   Complexity weight : 1
 |
 |   Inputs :
 |
 |    L_var3   32 bit long signed integer (int32_t) whose value falls in the
 |             range : 0x8000 0000 <= L_var3 <= 0x7fff ffff.
 |
 |    var1     16 bit short signed integer (int16_t) whose value falls in the
 |             range : 0xffff 8000 <= var1 <= 0x0000 7fff.
 |
 |    var2     16 bit short signed integer (int16_t) whose value falls in the
 |             range : 0xffff 8000 <= var1 <= 0x0000 7fff.
 |
 |   Return Value :
 |
 |    L_var_out
 |             32 bit long signed integer (int32_t) whose value falls in the
 |             range : 0x8000 0000 <= L_var_out <= 0x7fff ffff.
 |___________________________________________________________________________
*/
int32_t inline L_msu0 (int32_t L_var3, int16_t var1, int16_t var2)
{
  int32_t L_var_out;
  int32_t L_product;

  L_product = L_mult0(var1,var2);
  L_var_out = L_sub(L_var3,L_product);

  return(L_var_out);
}

static int32_t inline L_abs_sat (int32_t L_var1)
{
    int32_t ret;
    
    ret = L_abs(L_var1);
    
    return ret;
}

static int16_t inline abs_s_sat (int16_t var1)
{
    int16_t ret;
    
    ret = abs_s(var1);
    
    return ret;
}

static int32_t inline L_add_sat (int32_t L_var1, int32_t L_var2)
{
    int32_t ret;
    
    ret = L_add(L_var1, L_var2);
    
    return ret;
}

static int32_t inline L_sub_sat (int32_t L_var1, int32_t L_var2)
{
    int32_t ret;
    
    ret = L_sub(L_var1, L_var2);
    
    return ret;
}

static int16_t inline sub_sat (int16_t var1, int16_t var2)
{
    int16_t ret;
    
    ret = sub(var1, var2);
    
    return ret;
}

static int16_t inline add_sat (int16_t var1, int16_t var2)
{
    int16_t ret;
    
    ret = add(var1, var2);
    
    return ret;
}

/*___________________________________________________________________________
 |                                                                           |
 |   Function Name : round_fx                                                |
 |                                                                           |
 |   Purpose :                                                               |
 |                                                                           |
 |   Round the lower 16 bits of the 32 bit input number into the MS 16 bits  |
 |   with saturation. Shift the resulting bits right by 16 and return the 16 |
 |   bit number:                                                             |
 |               round_fx(L_var1) = extract_h(L_add(L_var1,32768))           |
 |                                                                           |
 |   Complexity weight : 1                                                   |
 |                                                                           |
 |   Inputs :                                                                |
 |                                                                           |
 |    L_var1                                                                 |
 |             32 bit long signed integer (int32_t ) whose value falls in the |
 |             range : 0x8000 0000 <= L_var1 <= 0x7fff ffff.                 |
 |                                                                           |
 |   Outputs :                                                               |
 |                                                                           |
 |    none                                                                   |
 |                                                                           |
 |   Return Value :                                                          |
 |                                                                           |
 |    var_out                                                                |
 |             16 bit short signed integer (int16_t) whose value falls in the |
 |             range : 0xffff 8000 <= var_out <= 0x0000 7fff.                |
 |___________________________________________________________________________|
*/
static int16_t inline round_fx (int32_t L_var1)
{
    int16_t var_out;
    int32_t L_rounded;

    L_rounded = L_add (L_var1, (int32_t) 0x00008000L);
    var_out = extract_h (L_rounded);

    return (var_out);
}







static int32_t inline round_fx_sat (int32_t L_var1)
{
    int32_t ret;
    
    ret = round_fx(L_var1);
    
    return ret;
}

static int32_t inline L_mac_sat (int32_t L_var1, int16_t var1, int16_t var2)
{
    int32_t ret;
    
    ret = L_mac(L_var1, var1, var2);
    
    return ret;
}

static int32_t inline L_msu_sat (int32_t L_var1, int16_t var1, int16_t var2)
{
    int32_t ret;
    
    ret = L_msu(L_var1, var1, var2);
    
    return ret;
}

static int32_t inline L_mac0_sat (int32_t L_var1, int16_t var1, int16_t var2)
{
    int32_t ret;
    
    ret = L_mac0_1(L_var1, var1, var2);
    
    return ret;
}


static int32_t inline L_shl_sat (int32_t L_var1, int16_t var2)
{
    int32_t ret;
    
    ret = L_shl(L_var1, var2);
    
    return ret;
}


static int32_t inline L_shr_sat (int32_t L_var1, int16_t var2)
{
    int32_t ret;
    
    ret = L_shr(L_var1, var2);
    
    return ret;
}

static int16_t inline shl_sat (int16_t var1, int16_t var2)
{
    int32_t ret;
    
    ret = shl(var1, var2);
    
    return ret;
}

static int16_t inline shr_sat (int16_t var1, int16_t var2)
{
    int32_t ret;
    
    ret = shr(var1, var2);
    
    return ret;
}





#endif /* ifndef _BASIC_OP_H */


/* end of file */
