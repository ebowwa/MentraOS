
#ifndef _ENH1632_H
#define _ENH1632_H


/*****************************************************************************
 *
 *  Constants and Globals
 *
 *****************************************************************************/


#include "stl.h"


/*****************************************************************************
 *
 *  Prototypes for enhanced 16/32 bit arithmetic operators
 *
 *****************************************************************************/
int16_t shl_r(   int16_t var1,   int16_t var2);
int32_t L_shl_r( int32_t L_var1, int16_t var2);


int16_t lshl(    int16_t var1,   int16_t var2);
int16_t lshr(    int16_t var1,   int16_t var2);
int32_t L_lshl(  int32_t L_var1, int16_t var2);
int32_t L_lshr(  int32_t L_var1, int16_t var2);

int16_t rotr(    int16_t var1,   int16_t var2, int16_t *var3);
int16_t rotl(    int16_t var1,   int16_t var2, int16_t *var3);
int32_t L_rotr(  int32_t var1,   int16_t var2, int16_t *var3);
int32_t L_rotl(  int32_t var1,   int16_t var2, int16_t *var3);














/*****************************************************************************
 *
 *  Function Name : s_and
 *
 *  Purpose :
 *
 *    Performs logical AND of the two 16 bit input variables.
 *    var_out = var1 & var2
 *
 *  Complexity weight : 1
 *
 *  Inputs :
 *
 *    var1        16 bit short signed integer (int16_t) whose value
 *                falls in the range 0xffff 8000 <= var1 <= 0x0000 7fff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value
 *                falls in the range 0xffff 8000 <= var2 <= 0x0000 7fff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value :
 *
 *    var_out     16 bit short signed integer (int16_t) whose value
 *                falls in the range 0xffff 8000 <= var_out <= 0x0000 7fff.
 *
 *****************************************************************************/
static __inline int16_t s_and( int16_t var1, int16_t var2) {
   int16_t var_out;

   var_out = var1 & var2;


   return( var_out);
}


/*****************************************************************************
 *
 *  Function Name : L_and
 *
 *  Purpose :
 *
 *    Performs logical AND of the two 32 bit input variables.
 *    L_var_out = L_var1 & L_var2
 *
 *  Complexity weight : 1
 *
 *  Inputs :
 *
 *    L_var1      32 bit long signed integer (int32_t) whose value
 *                falls in the range 0x8000 0000 <= L_var1 <= 0x7fff ffff.
 *
 *    L_var2      32 bit long signed integer (int32_t) whose value
 *                falls in the range 0x8000 0000 <= L_var2 <= 0x7fff ffff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value :
 *
 *    L_var_out   32 bit long signed integer (int32_t) whose value
 *                falls in the range 0x8000 0000 <= L_var_out <= 0x7fff ffff.
 *
 *****************************************************************************/
static __inline int32_t L_and( int32_t L_var1, int32_t L_var2) {
   int32_t L_var_out;

   L_var_out = L_var1 & L_var2;


   return( L_var_out);
}


/*****************************************************************************
 *
 *  Function Name : s_or
 *
 *  Purpose :
 *
 *    Performs logical OR of the two 16 bit input variables.
 *    var_out = var1 | var2
 *
 *  Complexity weight : 1
 *
 *  Inputs :
 *
 *    var1        16 bit short signed integer (int16_t) whose value
 *                falls in the range 0xffff 8000 <= var1 <= 0x0000 7fff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value
 *                falls in the range 0xffff 8000 <= var2 <= 0x0000 7fff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value :
 *
 *    var_out     16 bit short signed integer (int16_t) whose value
 *                falls in the range 0xffff 8000 <= var_out <= 0x0000 7fff.
 *
 *****************************************************************************/
static __inline int16_t s_or( int16_t var1, int16_t var2) {
   int16_t var_out;

   var_out = var1 | var2;


   return( var_out);
}


/*****************************************************************************
 *
 *  Function Name : L_or
 *
 *  Purpose :
 *
 *    Performs logical OR of the two 32 bit input variables.
 *    L_var_out = L_var1 | L_var2
 *
 *  Complexity weight : 1
 *
 *  Inputs :
 *
 *    L_var1      32 bit long signed integer (int32_t) whose value
 *                falls in the range 0x8000 0000 <= L_var1 <= 0x7fff ffff.
 *
 *    L_var2      32 bit long signed integer (int32_t) whose value
 *                falls in the range 0x8000 0000 <= L_var2 <= 0x7fff ffff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value :
 *
 *    L_var_out   32 bit long signed integer (int32_t) whose value
 *                falls in the range 0x8000 0000 <= L_var_out <= 0x7fff ffff.
 *
 *****************************************************************************/
static __inline int32_t L_or( int32_t L_var1, int32_t L_var2) {

   int32_t L_var_out;

   L_var_out = L_var1 | L_var2;


   return( L_var_out);
}


/*****************************************************************************
 *
 *  Function Name : s_xor
 *
 *  Purpose :
 *
 *    Performs logical XOR of the two 16 bit input variables.
 *    var_out = var1 ^ var2
 *
 *  Complexity weight : 1
 *
 *  Inputs :
 *
 *    var1        16 bit short signed integer (int16_t) whose value
 *                falls in the range 0xffff 8000 <= var1 <= 0x0000 7fff.
 *
 *    var2        16 bit short signed integer (int16_t) whose value
 *                falls in the range 0xffff 8000 <= var2 <= 0x0000 7fff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value :
 *
 *    var_out     16 bit short signed integer (int16_t) whose value
 *                falls in the range 0xffff 8000 <= var_out <= 0x0000 7fff.
 *
 *****************************************************************************/
static __inline int16_t s_xor( int16_t var1, int16_t var2) {
   int16_t var_out;

   var_out = var1 ^ var2;

   return( var_out);
}


/*****************************************************************************
 *
 *  Function Name : L_xor
 *
 *  Purpose :
 *
 *    Performs logical OR of the two 32 bit input variables.
 *    L_var_out = L_var1 ^ L_var2
 *
 *  Complexity weight : 1
 *
 *  Inputs :
 *
 *    L_var1      32 bit long signed integer (int32_t) whose value
 *                falls in the range 0x8000 0000 <= L_var1 <= 0x7fff ffff.
 *
 *    L_var2      32 bit long signed integer (int32_t) whose value
 *                falls in the range 0x8000 0000 <= L_var2 <= 0x7fff ffff.
 *
 *  Outputs :
 *
 *    none
 *
 *  Return Value :
 *
 *    L_var_out   32 bit long signed integer (int32_t) whose value
 *                falls in the range 0x8000 0000 <= L_var_out <= 0x7fff ffff.
 *
 *****************************************************************************/
static __inline int32_t L_xor( int32_t L_var1, int32_t L_var2) {
   int32_t L_var_out;

   L_var_out = L_var1 ^ L_var2;

   return( L_var_out);
}



#endif /*_ENH1632_H*/

/* end of file */
