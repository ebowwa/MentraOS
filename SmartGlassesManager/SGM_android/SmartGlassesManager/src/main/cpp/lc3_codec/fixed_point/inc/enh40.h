
#ifndef _ENH40_H
#define _ENH40_H

#include "stl.h"
 
 /*****************************************************************************
 *
 *  Prototypes for enhanced 40 bit arithmetic operators
 *
 *****************************************************************************/

void Mpy_32_16_ss( int32_t L_var1, int16_t var2,   int32_t *L_varout_h, uint16_t *varout_l);
void Mpy_32_32_ss( int32_t L_var1, int32_t L_var2, int32_t *L_varout_h, uint32_t *L_varout_l);

#endif /*_ENH40_H*/


/* end of file */


