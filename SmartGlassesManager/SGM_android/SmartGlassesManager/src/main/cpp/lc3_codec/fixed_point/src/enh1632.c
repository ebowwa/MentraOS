
/*****************************************************************************
 *
 *  Include-Files
 *
 *****************************************************************************/
#include <stdio.h>
#include <stdlib.h>
#include "stl.h"

/*****************************************************************************
 *
 *   Constants and Globals
 *
 *****************************************************************************/

/*****************************************************************************
 *
 *   Functions
 *
 *****************************************************************************/

/*****************************************************************************
 *
 *  Function Name : lshl
 *
 *  Purpose :
 *
 *    Logically shifts left var1 by var2 positions.
 *    - If var2 is negative, var1 is shifted to the LSBits by (-var2)
 *      positions with insertion of 0 at the MSBit.
 *    - If var2 is positive, var1 is shifted to the MSBits by (var2)
 *      positions.
 *
 *  Complexity weight : 1
 *
 *  Inputs :
 *
 *    var1        16 bit short signed integer (int16_t) whose value falls in 
 *                the range 0xffff 8000 <= var1 <= 0x0000 7fff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value falls in 
 *                the range 0xffff 8000 <= var2 <= 0x0000 7fff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value:
 *
 *    var_out     16 bit short signed integer (int16_t) whose value falls in 
 *                the range 0xffff 8000 <= var_out <= 0x0000 7fff.
 *
 *****************************************************************************/
int16_t lshl( int16_t var1, int16_t var2) {
   int16_t var_out=0;

   if( var2 < 0) {
      var2 = -var2;
      var_out = lshr( var1, var2);


   } else {
      if( var2 == 0 || var1 == 0) {
         var_out = var1;
      } else if( var2 >= 16) {
         var_out = 0;

      } else {
         var_out = var1 << var2;
      }
   }


   return( var_out);
}

/*****************************************************************************
 *
 *  Function Name : lshr
 *
 *  Purpose :
 *
 *    Logically shifts right var1 by var2 positions.
 *    - If var2 is positive, var1 is shifted to the LSBits by (var2)
 *      positions with insertion of 0 at the MSBit.
 *    - If var2 is negative, var1 is shifted to the MSBits by (-var2)
 *      positions.
 *
 *  Complexity weight : 1
 *
 *  Inputs :
 *
 *    var1        16 bit short signed integer (int16_t) whose value falls in 
 *                the range 0xffff 8000 <= var1 <= 0x0000 7fff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value falls in 
 *                the range 0xffff 8000 <= var2 <= 0x0000 7fff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value:
 *
 *    var_out     16 bit short signed integer (int16_t) whose value falls in 
 *                the range 0xffff 8000 <= var_out <= 0x0000 7fff.
 *
 *****************************************************************************/
int16_t lshr( int16_t var1, int16_t var2) {
   int16_t var_out;


   if( var2 < 0) {
      var2 = -var2;
      var_out = lshl( var1, var2);


   } else {
      if( var2 == 0 || var1 == 0) {
         var_out = var1;
      } else if( var2 >= 16) {
         var_out = 0;

      } else {
         var_out = var1 >> 1;
         var_out = var_out & 0x7fff;
         var_out =  var_out >> ( var2-1);

      }
   }

   return( var_out);
}


/*****************************************************************************
 *
 *  Function Name : L_lshl
 *
 *  Purpose :
 *
 *    Logically shifts left L_var1 by var2 positions.
 *    - If var2 is negative, L_var1 is shifted to the LSBits by (-var2)
 *      positions with insertion of 0 at the MSBit.
 *    - If var2 is positive, L_var1 is shifted to the MSBits by (var2)
 *      positions.
 *
 *  Complexity weight : 1
 *
 *  Inputs :
 *
 *    L_var1      32 bit long signed integer (int32_t) whose value falls in 
 *                the range 0x8000 0000 <= L_var1 <= 0x7fff ffff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value falls in 
 *                the range 0xffff 8000 <= var2 <= 0x0000 7fff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value:
 *
 *    L_var_out   32 bit long signed integer (int32_t) whose value falls in 
 *                the range 0x8000 0000 <= L_var_out <= 0x7fff ffff.
 *
 *****************************************************************************/
int32_t L_lshl( int32_t L_var1, int16_t var2) {
   int32_t L_var_out=0;


   if( var2 < 0) {
      var2 = -var2;
      L_var_out = L_lshr( L_var1, var2);

   } else {
      if( var2 == 0 || L_var1 == 0) {
         L_var_out = L_var1;
      } else if( var2 >= 32) {
         L_var_out = 0;

      } else {
         L_var_out = L_var1 << var2;

      }
   }


   return( L_var_out);
}


/*****************************************************************************
 *
 *  Function Name : L_lshr
 *
 *  Purpose :
 *
 *    Logically shifts right L_var1 by var2 positions.
 *    - If var2 is positive, L_var1 is shifted to the LSBits by (var2)
 *      positions with insertion of 0 at the MSBit.
 *    - If var2 is negative, L_var1 is shifted to the MSBits by (-var2)
 *      positions.
 *
 *  Complexity weight : 1
 *
 *  Inputs :
 *
 *    L_var1      32 bit long signed integer (int32_t) whose value falls in 
 *                the range 0x8000 0000 <= L_var1 <= 0x7fff ffff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value falls in 
 *                the range 0xffff 8000 <= var2 <= 0x0000 7fff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value:
 *
 *    L_var_out   32 bit long signed integer (int32_t) whose value falls in 
 *                the range 0x8000 0000 <= L_var_out <= 0x7fff ffff.
 *
 *****************************************************************************/
int32_t L_lshr( int32_t L_var1, int16_t var2) {
   int32_t   L_var_out;


   if( var2 < 0) {
      var2 = -var2;
      L_var_out = L_lshl( L_var1, var2);


   } else {
      if( var2 == 0 || L_var1 == 0) {
         L_var_out = L_var1;
      } else if( var2 >= 32) {
         L_var_out = 0;

      } else {
         L_var_out = L_var1 >> 1;
         L_var_out = L_var_out & 0x7fffffff;
         L_var_out =  L_var_out >> (var2 - 1);
      }
   }

   return( L_var_out);
}


/*****************************************************************************
 *
 *  Function Name : shl_r
 *
 *  Purpose :
 *
 *    Identical to shl( var1, var2) but with rounding. Saturates the result
 *    in case of underflows or overflows.
 *
 *  Complexity weight : 3
 *
 *  Inputs :
 *
 *    var1        16 bit short signed integer (int16_t) whose value falls in 
 *                the range : 0xffff 8000 <= var1 <= 0x0000 7fff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value falls in 
 *                the range : 0xffff 8000 <= var2 <= 0x0000 7fff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value :
 *
 *    var_out     16 bit short signed integer (int16_t) whose value falls in 
 *                the range : 0xffff 8000 <= var_out <= 0x0000 7fff.
 *
 *****************************************************************************/
int16_t shl_r( int16_t var1, int16_t var2){
   int16_t var_out;

   if( var2 >= 0) {
      var_out = shl( var1, var2);


   } else {
      var2 = -var2;
      var_out = shr_r( var1, var2);

   }


   return( var_out);
}


/*****************************************************************************
 *
 *  Function Name : L_shl_r
 *
 *  Purpose :
 *
 *   Same as L_shl( var1, var2) but with rounding. Saturates the result in
 *   case of underflows or overflows.
 *
 *  Complexity weight : 3
 *
 *  Inputs :
 *
 *    L_var1      32 bit long signed integer (int32_t) whose value falls in 
 *                the range : 0x8000 0000 <= L_var1 <= 0x7fff ffff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value falls in 
 *                the range : 0xffff 8000 <= var2 <= 0x0000 7fff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value :
 *
 *    L_var_out   32 bit long signed integer (int32_t) whose value falls in 
 *                the range : 0x8000 0000 <= var_out <= 0x7fff ffff.
 *
 *****************************************************************************/
int32_t L_shl_r( int32_t L_var1, int16_t var2) {
   int32_t var_out;

   if( var2 >= 0) {
      var_out = L_shl( L_var1, var2);


   } else {
      var2 = -var2;
      var_out = L_shr_r( L_var1, var2);

   }


   return( var_out);
}


/*****************************************************************************
 *
 *  Function Name : rotr
 *
 *  Purpose :
 *
 *    Performs a 16-bit logical rotation of var1 by 1 bit to the LSBits. The
 *    MSBit is set to var2 bit 0. The LSBit of var1 is kept in *var3 bit 0.
 *
 *  Complexity weight : 3
 *
 *  Inputs :
 *
 *    var1        16 bit short signed integer (int16_t) whose value falls in
 *                the range : 0xffff 8000 <= var1 <= 0x0000 7fff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value must be 0
 *                or 1.
 *
 *  Outputs :
 *
 *    *var3       Points on a 16 bit short signed integer (int16_t) whose 
 *                value will be 0 or 1.
 *
 *  Return Value :
 *
 *    var_out     16 bit short signed integer (int16_t) whose value falls in
 *                the range : 0xffff 8000 <= var_out <= 0x0000 7fff.
 *
 *****************************************************************************/
int16_t rotr( int16_t var1, int16_t var2, int16_t *var3) {
   int16_t var_out;

   *var3 = s_and( var1, 0x1);
   var_out = s_or( lshr( var1, 1),
                   lshl( var2, 15));

  return( var_out);
}


/*****************************************************************************
 *
 *  Function Name : rotl
 *
 *  Purpose :
 *
 *    Performs a 16-bit logical rotation of var1 by 1 bit to the MSBits. The
 *    LSBit is set to var2 bit 0. The MSBit of var1 is kept in *var3 bit 0.
 *
 *  Complexity weight : 3
 *
 *  Inputs :
 *
 *    var1        16 bit short signed integer (int16_t) whose value falls in
 *                the range : 0xffff 8000 <= var1 <= 0x0000 7fff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value must be 0
 *                or 1.
 *
 *  Outputs :
 *
 *    *var3       Points on a 16 bit short signed integer (int16_t) whose 
 *                value will be 0 or 1.
 *
 *  Return Value :
 *
 *    var_out     16 bit short signed integer (int16_t) whose value falls in
 *                the range : 0xffff 8000 <= var_out <= 0x0000 7fff.
 *
 *****************************************************************************/
int16_t rotl( int16_t var1, int16_t var2, int16_t *var3) {
   int16_t var_out;

   *var3 = lshr( var1, 15);

   var_out = s_or( lshl( var1, 1),
                   s_and( var2, 0x1));


   return( var_out);
}


/*****************************************************************************
 *
 *  Function Name : L_rotr
 *
 *  Purpose :
 *
 *    Performs a 32-bit logical rotation of L_var1 by 1 bit to the LSBits. The
 *    MSBit is set to var2 bit 0. The LSBit of L_var1 is kept in *var3 bit 0.
 *
 *  Complexity weight : 3
 *
 *  Inputs :
 *
 *    L_var1      32 bit long signed integer (int32_t) whose value falls in
 *                the range : 0x8000 0000 <= L_var1 <= 0x7fff ffff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value must be 0
 *                or 1.
 *
 *  Outputs :
 *
 *    *var3       Points on a 16 bit short signed integer (int16_t) whose 
 *                value will be 0 or 1.
 *
 *  Return Value :
 *
 *    L_var_out   32 bit long signed integer (int32_t) whose value falls in
 *                the range : 0x8000 0000 <= L_var_out <= 0x7fff ffff.
 *
 *****************************************************************************/
int32_t L_rotr( int32_t L_var1, int16_t var2, int16_t *var3) {
   int32_t L_var_out;

   *var3 = s_and( extract_l( L_var1), 0x1);

   L_var_out = L_or( L_lshr( L_var1, 1),
                     L_lshl( L_deposit_l( var2), 31));


   return( L_var_out);
}


/*****************************************************************************
 *
 *  Function Name : L_rotl
 *
 *  Purpose :
 *
 *    Performs a 32-bit logical rotation of L_var1 by 1 bit to the MSBits. The
 *    LSBit is set to var2 bit 0. The MSBit of L_var1 is kept in *var3 bit 0.
 *
 *  Complexity weight : 3
 *
 *  Inputs :
 *
 *    L_var1      32 bit long signed integer (int32_t) whose value falls in
 *                the range : 0x8000 0000 <= L_var1 <= 0x7fff ffff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value must be 0
 *                or 1.
 *
 *  Outputs :
 *
 *    *var3       Points on a 16 bit short signed integer (int16_t) whose 
 *                value will be 0 or 1.
 *
 *  Return Value :
 *
 *    L_var_out   32 bit long signed integer (int32_t) whose value falls in
 *                the range : 0x8000 0000 <= L_var_out <= 0x7fff ffff.
 *
 *****************************************************************************/
int32_t L_rotl( int32_t L_var1, int16_t var2, int16_t *var3) {
   int32_t L_var_out;

   *var3 = extract_l( L_lshr( L_var1, 31));

   L_var_out = L_or( L_lshl( L_var1, 1),
                     L_deposit_l( s_and( var2, 0x1)));


   return( L_var_out);
}


/* end of file */
