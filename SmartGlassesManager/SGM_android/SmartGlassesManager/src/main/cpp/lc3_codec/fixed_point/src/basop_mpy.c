
#include "basop_mpy.h"
#include "stl.h"

#if 0
void cplxMpy_32_16(int32_t *c_Re, int32_t *c_Im, const int32_t a_Re, const int32_t a_Im, const int16_t b_Re,
                   const int16_t b_Im)
{
    *c_Re = L_sub(Mpy_32_16_asm(a_Re, b_Re), Mpy_32_16_asm(a_Im, b_Im));
    *c_Im = L_add(Mpy_32_16_asm(a_Re, b_Im), Mpy_32_16_asm(a_Im, b_Re));
}
#endif
