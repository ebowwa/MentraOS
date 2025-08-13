
#ifndef _ENHUL32_H
#define _ENHUL32_H


/*****************************************************************************
 *
 *  Constants and Globals
 *
 *****************************************************************************/
#define ENHUL32               /* all  the  enhanced unsigned operators */
#define STL_TYPECASTS         /*  logical shift and bitwise manipulation functions              */
                              /*  algorithmically exact to existing signed L_lshr and L_lshr    */ 

/* #define DRAFT_UL_UPDATE  */  /* editorial corrections and speed improvements to UL_addNs and UL_subNs  */

#include "stl.h"


#ifndef UWord64 
#define UWord64 unsigned long long      /*  for local use inside UL_Mpy_32_*   */
#endif

#define maxUWord32 UINT32_MAX


/*****************************************************************************
 *
 *  Prototypes for enhanced unsigned 32 bit arithmetic operators
 *
 *****************************************************************************/
#if 0
uint32_t inline UL_addNs(uint32_t a, uint32_t b, uint16_t* wrap);  
#ifdef DRAFT_UL_UPDATE  
uint32_t inline     UL_subNs(uint32_t a, uint32_t b, uint16_t* sgn);  
#else
uint32_t inline     UL_subNs(uint32_t a, uint32_t b, uint16_t* wrap);  
#endif

uint32_t  inline UL_Mpy_32_32(uint32_t a, uint32_t b);                            
void inline Mpy_32_32_uu( uint32_t a, uint32_t b, uint32_t *c_h, uint32_t *c_l);   /* does not saturate */
void inline Mpy_32_16_uu( uint32_t a, uint16_t b,uint32_t *c_h, uint16_t *c_l);    /* does not saturate   */

/*  Other  */
int16_t  inline norm_ul (uint32_t UL_var1);  
uint32_t inline UL_deposit_l(uint16_t);      /* deposit low without sign extension ) */
#endif

/*****************************************************************************
 *
 *  Inline Functions
 *
 *****************************************************************************/

#if 0//def STL_TYPECASTS 
/*      (Reuse of existing signed STL "L" operators) with
        typecasting  to  make the resulting "UL" code a lot cleaner and more readable. */
uint32_t inline UL_lshl( uint32_t UL_var1, int16_t var2);
uint32_t inline UL_lshr( uint32_t UL_var1, int16_t var2);
static uint32_t UL_and(uint32_t UL_var1, uint32_t UL_var2 );
static uint32_t UL_or(uint32_t UL_var1, uint32_t UL_var2 );
static uint32_t UL_xor(uint32_t UL_var1, uint32_t UL_var2 );
static uint32_t inline UL_deposit_h(uint16_t uvar1);
static uint16_t inline u_extract_h(uint32_t UL_var1);
static uint16_t inline u_extract_l(uint32_t UL_var1);

/* enable convenient reuse of Non-saturating UL_subNs , UL_addNs  
   while "D"iscarding the sgn/wrap output flags */ 
uint32_t inline UL_subNsD(uint32_t UL_var1, uint32_t UL_var2 );
uint32_t inline UL_addNsD(uint32_t UL_var1, uint32_t UL_var2 );
#endif

/*****************************************************************************
 *
 *   Functions
 *
 *****************************************************************************/
#ifdef ENHUL32

/*___________________________________________________________________________
 |                                                                           |
 |   Function Name : UL_deposit_l                                            |
 |                                                                           |
 |   Purpose :                                                               |
 |                                                                           |
 |   Deposit the 16 bit var1 into the 16 LS bits of the 32 bit output. The   |
 |   16 MS bits of the output are not sign extended.                         |
 |                                                                           |
 |___________________________________________________________________________ */

uint32_t inline UL_deposit_l(uint16_t uvar){
   uint32_t UL_result;
   UL_result = (uint32_t)uvar;   /* no sign extension*/

   return (UL_result);
}


/*___________________________________________________________________________
 |                                                                           |
 |   Function Name : norm_ul                                                  |
 |                                                                           |
 |   Purpose :                                                               |
 |                                                                           |
 |   Produces the number of left shifts needed to normalize the 32 bit varia-|
 |   ble UL_var1 for positive values on the interval with minimum of         |
 |   0 and maximum of 0xffffffff, ; in order to normalize the                | 
 |   result, the following operation must be done :                          |
 |                                                                           |
 |      norm_UL_var1 = UL_lshl(UL_var1, norm_ul(UL_var1)).                    |
 |                                                                           |
 |   Complexity weight : 1                                                   |
 |                                                                           |
 |   Inputs :                                                                |
 |                                                                           |
 |    UL_var1                                                                |
 |          32 bit long unsigned integer (uint32_t) whose value falls in the  |
 |          range : 0x0000 0000 <= var1 <= 0xffff ffff.                   |
 |                                                                           |
 |   Outputs :                                                               |
 |                                                                           |
 |    none                                                                   |
 |                                                                           |
 |   Return Value :                                                          |
 |                                                                           |
 |    var_out                                                                |
 |             16 bit short signed integer (int16_t) whose value falls in the |
 |             range : 0x0000 0000 <= var_out <= 0x0000 001f. (0..31d)       |
 |___________________________________________________________________________|
*/
static int16_t inline norm_ul( uint32_t UL_var1)
{
    int16_t var_out;

    if (UL_var1 == 0)
    {
        var_out = 0;
    }
    else
    {
            /* simply test shift up until  highest bit is set */
            for (var_out = 0; UL_var1 < (uint32_t) 0x80000000U; var_out++)
            {
                UL_var1 <<= 1;
            }       
    }

    return (var_out);
}


#ifdef  DRAFT_UL_UPDATE

/*___________________________________________________________________________
 |                                                                           |
 |   Function : UL_addNs                                                     |
 |                                                                           |
 |    addition of  two unsigned 32 bit inputs                                |
 |    no saturation                                                          |
 |                                                                           |
 |    Outputs :                                                              |
 |        *wrap    =  1 if wrap occured, otherwize 0                         |
 |                                                                           |
 |    Return Value :                                                         | 
 |        UL_var3 =  modulo(UL_var1+UL_var2,32)                              | 
 |___________________________________________________________________________|
*/

static uint32_t  inline UL_addNs(uint32_t UL_var1, uint32_t UL_var2, uint16_t * wrap )
{
  uint32_t UL_var3; 
  
  /*  no update of Overflow flag  */      
  UL_var3 = UL_var1 + UL_var2;  /* 32 bit wrap  may occur, like in C */
  *wrap = 0; 
  if ( ( ((UWord64)UL_var1 + (UWord64)UL_var2) ) >  ((UWord64) maxUWord32 )  )  
  { 
     *wrap = 1;  /* wrapped output */
  }

  return  UL_var3;
}

#else
/*___________________________________________________________________________
 |                                                                           |
 |   Function Name : UL_addNs                                                |
 |                                                                           |
 |   Purpose :                                                               |
 |                                                                           |
 |   32 bits addition of the two unsigned 32 bits variables                  |
 |   (L_var1+L_var2) with overflow control, but without saturation           |
 |
 |   Outputs :                                                               |
 |        *wrap    =  1 if wrap occured, otherwize 0                                                                      |
 |                                        
 |    Return Value :   
 |        UL_var3 =  modulo(UL_var1+UL_var2,32)  
 |___________________________________________________________________________|
*/

static uint32_t  inline UL_addNs(uint32_t UL_var1, uint32_t UL_var2, uint16_t* wrap )
{
  uint32_t UL_var3; 
  
  /*  STL Overflow flag is not updated */ 
     
  UL_var3 = UL_var1 + UL_var2;        /* 32bit wrap  may occur, like in C */
   
  if ( ( ((UWord64)UL_var1 + (UWord64)UL_var2) ) >  ((UWord64) maxUWord32 )  )  
  { 
     *wrap = 1;  /* wrapped output */
  }
  else
  {
    *wrap = 0; 
  }


  return  UL_var3;
}
#endif


#ifdef DRAFT_UL_UPDATE
/*___________________________________________________________________________
 |                                                                           |
 |   Function Name : UL_subNs                                                |
 |                                                                           |                                                          
 |   unsigned  subtraction between two 32 bit values                         |
 |   no saturation                                                           |
 |                                                                           |
 |   Outputs :                                                               |
 |        *wrap    =  1 if wrap (to "negative" occured, otherwise 0          |   
 |                                                                           |
 |    Return Value :                                                         |    
 |        UL_var3 =  modulo(UL_var1-UL_var2, 32)                             | 
 |___________________________________________________________________________|
*/

22uint32_t inline UL_subNs(uint32_t UL_var1, uint32_t UL_var2, uint16_t* wrap)
{
  uint32_t UL_var3;

  UL_var3 = UL_var1 - UL_var2;  /*  wrap  may occur, like in C */
  *wrap = 0;                      
  if (UL_var1 < UL_var2)
  { 
    *wrap = 1;  /* "negative" , wrapped output */
  }

  return  UL_var3;
}
#else
/*___________________________________________________________________________
 |                                                                           |
 |   Function Name : UL_subNs                                                 |
 |                                                                           |
 |   Purpose :                                                               |
 |                                                                           |
 |   32 bits subtraction of the two unsigned 32 bits variables               |
 |   (L_var1-L_var2) with  overflow control, but without saturation          |
 |
 |   Outputs :                                                               |
 |        *sgn    =  1 if wrap (to "negative" occured, otherwise 0                                                                      |
 |                                        
 |    Return Value :   
 |        UL_var3 =  modulo(UL_var1-UL_var2,32) 
 |___________________________________________________________________________|
*/

uint32_t inline UL_subNs(uint32_t UL_var1, uint32_t UL_var2, uint16_t * sgn)
{
  uint32_t UL_var3;

  UL_var3 = UL_var1 - UL_var2;  /*wrap  may occur, like in C */
  if (UL_var1 >= UL_var2)
  { 
    *sgn = 0;
  }
  else
  {
    *sgn = 1; /* "negative" , wrapped output */
  }

  return  UL_var3;
}

#endif


/*****************************************************************************
 *
 *  Function Name :  Mpy_32_16_uu
 *
 *  Purpose :
 *
 *    Multiplies the 2 unsigned values UL_var1 and uvar2 
 *    with saturation control on 48-bit.( does not happen for unsigned)
 *    The operation is performed in fractional mode :
 *    - UL_var1 is supposed to be in Q32 format.
 *    - var2   is supposed to be in Q16 format.
 *    - The result is produced in Q48 format : UL_varout_h points to the
 *      32 MSBits while varout_l points to the 16 LSBits.
 *
 *  Complexity weight : 2
 *
 *  Inputs :
 *
 *    UL_var1     32 bit long unsigned integer (uint32_t) whose value falls in
 *                the range : 0x0000 0000 <= L_var1 <= 0xffff ffff.
 *
 *    var2        16 bit short unsigned integer (uint16_t) whose value falls in 
 *                the range : 0x0000 <= var2 <= 0x0000 ffff.
 *
 *  Outputs :
 *
 *    *UL_varout_h 32 bit long unsigned integer (uint32_t) whose value falls in
 *                 the range : 0x0000 0000 <= UL_varout_h <= 0xffff ffff.
 *
 *    *varout_l   16 bit short unsigned integer (uint16_t) whose value falls in
 *                the range : 0x0000 0000 <= varout_l <= 0x0000 ffff.
 *
 *  Return Value :
 *
 *    none
 *
 *****************************************************************************/
static void inline Mpy_32_16_uu( uint32_t UL_var1, uint16_t uvar2, uint32_t *UL_varout_h, uint16_t *varout_l) {  
   UWord64  UL64_var1; 

   /* 4294967295  * 65535  <  281474976710655 */
   /* (uint64(2)^16-1 )*(uint64(2)^32-1) < (uint64(2)^(16+32)-1) */
   { 
      UL64_var1   = ( UWord64) UL_var1 * ( UWord64)uvar2 ;

      *varout_l   = ( uint16_t)( UL64_var1 );

      *UL_varout_h = (uint32_t)(UL64_var1>>16);
   }

   return;
}


/*****************************************************************************
 *
 *  Function Name :  Mpy_32_32_uu
 *
 *  Purpose :
 *
 *    Multiplies the 2 unsigned values UL_var1 and UL_var2 
 *    with saturation control on 64-bit. (not needed for unsigned) 
 *    The operation is performed in fractional mode :
 *    - UL_var1 and UL_var2 are supposed to be in Q32 format.
 *    - The result is produced in Q64 format : UL_varout_h points to the
 *      32 MSBits while UL_varout_l points to the 32 LSBits.
 *
 *  Complexity weight : 4
 *
 *  Inputs :
 *
 *    UL_var1      32 bit long unsigned integer (uint32_t) whose value falls in the
 *                range : 0x0000 0000  <= L_var1 <= 0xffff ffff.
 *
 *    UL_var2      32 bit long unsigned integer (uint32_t) whose value falls in the
 *                range : 0x0000 0000  <= L_var2 <= 0xffff ffff.
 *
 *  Outputs :
 *
 *    *UL_varout_h 32 bit long signed integer (int32_t) whose value falls in
 *                 the range : 0x0000 0000 <= UL_varout_h <= 0xffff ffff.
 *
 *    *UL_varout_l 32 bit short unsigned integer (uint32_t) whose value falls in
 *                 the range : 0x0000 0000 <= UL_varout_l <= 0xffff ffff.
 *
 *
 *  Return Value :
 *
 *    none
 *
 *****************************************************************************/
static void inline Mpy_32_32_uu( uint32_t UL_var1, uint32_t UL_var2, uint32_t *UL_varout_h, uint32_t *UL_varout_l) 
{
    UWord64 UL64_var1;

 /* (uint64(2)^32-1 )*(uint64(2)^32-1) < (uint64(2)^(32+32)-1) */
   {
      UL64_var1     = ((UWord64) UL_var1)*((UWord64) UL_var2); 
      *UL_varout_h  = (uint32_t)(UL64_var1>>32);     
      *UL_varout_l  = (uint32_t)(UL64_var1);     
   }

   return;
}

/*****************************************************************************
 *
 *  Function Name :  UL_Mpy_32_32
 *
 *  Purpose :
 *
 *    Multiplies the 2 unsigned values UL_var1 and UL_var2 
 *    and returns the lower 32 bits, without saturation control. 
 *   
 *    - UL_var1 and UL_var2 are supposed to be in Q32 format.
 *    - The result is produced in Q64 format,  (the 32 LSBits. )
 * 
 *      operates like a  regular 32-by-32 bit uint32_t  multiplication in ANSI-C.
 *          uint32_t) = (uint32_t)*(uint32_t);
 *                 
 *
 *  Complexity weight : 2
 *
 *  Inputs :
 *
 *    UL_var1     32 bit long unsigned integer (uint32_t) whose value falls in the
 *                range : 0x0000 0000  <= UL_var1 <= 0xffff ffff.
 *
 *    UL_var2     32 bit long unsigned integer (uint32_t) whose value falls in the
 *                range : 0x0000 0000  <= UL_var2 <= 0xffff ffff.
 *
 *  Outputs :
 *
 *  Return Value : 
 *     *UL_varout_l 32 bit short unsigned integer (uint32_t) whose value falls in
 *      the range : 0x0000 0000 <= UL_varout_l <= 0xffff ffff.
 *
 *    none
 *
 *****************************************************************************/
static uint32_t inline UL_Mpy_32_32( uint32_t UL_var1, uint32_t UL_var2) 
{
    uint32_t UL_varout_l;

#define MASK32  0xFFFFFFFFU
    /* MASK32 may be needed in case Hardware is using larger than 32 bits for uint32_t type) */  
    UL_varout_l       =  (UL_var1&MASK32)*(UL_var2&MASK32);      
    UL_varout_l       =  (UL_varout_l&MASK32);
#undef MASK32      


    return UL_varout_l;
}

static uint32_t inline UL_lshl( uint32_t UL_var1, int16_t var2) {
   return( (uint32_t)L_lshl( (int32_t) UL_var1, var2));
}

static uint32_t inline UL_lshr( uint32_t UL_var1, int16_t var2) {
   return( (uint32_t)L_lshr( (int32_t) UL_var1, var2) );
}

static uint32_t inline UL_deposit_h(uint16_t uvar1)
{
   return (uint32_t) L_deposit_h((int32_t)uvar1);
}

static uint16_t inline u_extract_h(uint32_t UL_var1)
{
   return (uint16_t) extract_h((int32_t)UL_var1);
}

static uint16_t inline u_extract_l(uint32_t UL_var1)
{
   return (uint32_t)extract_l((int32_t)UL_var1);
}

/* enable convenient reuse of Non-saturating UL_subNs , UL_addNs  while "D"iscarding the sgn/wrap output flags */ 
static uint32_t inline UL_subNsD(uint32_t UL_var1, uint32_t UL_var2 )
{ 
    uint16_t dummy_sign;
    return UL_subNs(UL_var1,UL_var2,&dummy_sign );
}

static uint32_t inline UL_addNsD(uint32_t UL_var1, uint32_t UL_var2 )
{  
   uint16_t dummy_wrap;
   return UL_addNs(UL_var1,UL_var2,&dummy_wrap );
}


#ifdef STL_TYPECASTS 
/*     (Reuse of existing signed STL "L" operators) with
        typecasting  to  make the resulting "UL" code a lot cleaner and more readable. */


static uint32_t inline UL_and(uint32_t UL_var1, uint32_t UL_var2 )
{
   return (uint32_t) L_and((int32_t)UL_var1,(int32_t) UL_var2);
}

static uint32_t inline UL_or(uint32_t UL_var1, uint32_t UL_var2 )
{
   return (uint32_t) L_or((int32_t)UL_var1,(int32_t) UL_var2);
}

static uint32_t inline UL_xor(uint32_t UL_var1, uint32_t UL_var2 )
{
   return (uint32_t) L_xor((int32_t)UL_var1,(int32_t) UL_var2);
}


#endif

#endif /* ENHUL32 */

#endif /*_ENHUL32_H*/

/* end of file */
