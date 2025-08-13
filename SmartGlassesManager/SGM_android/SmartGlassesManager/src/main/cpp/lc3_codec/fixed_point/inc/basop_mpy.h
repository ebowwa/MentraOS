
#ifndef __BASOP_MPY_H
#define __BASOP_MPY_H

#include "stl.h"

/**
 * \brief     32*16 Bit fractional Multiplication using 40 bit OPS
 *          Performs a multiplication of a 32-bit variable x by
 *          a 16-bit variable y, returning a 32-bit value.
 *
 * \param[i] x
 * \param[i] y
 *
 * \return x*y
 */
static int32_t inline Mpy_32_16(int32_t x, int16_t y);

/**
 * \brief     32*32 Bit fractional Multiplication using 40 bit OPS
 *
 *          Performs a multiplication of a 32-bit variable x by
 *          a 32-bit variable y, returning a 32-bit value.
 *
 * \param[i] x
 * \param[i] y
 *
 * \return x*y
 */
static int32_t inline Mpy_32_32(int32_t x, int32_t y);

static inline void cplxMpy32_32_16_2( int *c_Re,int *c_Im, 
                                                         const int a_Re, const int a_Im, 
                                                         const short b_Re, const short b_Im)
{    
    int tmp1, tmp2;

    asm("smulwb %0, %3, %5;\n"     /* %7   = -a_Im * b_Im */        
    "rsb %1,%0,#0;\n"        
    "smlawb %0, %2, %4, %1;\n" /* tmp1 =  a_Re * b_Re - a_Im * b_Im */        
    "smulwb %1, %2, %5;\n"     /* %7   =  a_Re * b_Im */        
    "smlawb %1, %3, %4, %1;\n" /* tmp2 =  a_Im * b_Re + a_Re * b_Im */        
    : "=&r"(tmp1), "=&r"(tmp2)        
    : "r"(a_Re), "r"(a_Im), "r"(b_Re), "r"(b_Im)        
    );

    *c_Re = tmp1;     
    *c_Im = tmp2;

}

//void cplxMpy_32_16(int32_t *c_Re, int32_t *c_Im, const int32_t a_Re, const int32_t a_Im, const int16_t b_Re,
//                   const int16_t b_Im);


static int32_t inline Mpy_32_16_2 (const int32_t a, const int16_t b)
{  
    int32_t result ;  
    asm("smulwb %0, %1, %2"    
            : "=r" (result)    
            : "r" (a), "r" (b));  

    return result ;
}

static int32_t inline Mpy_32_16_asm(int32_t x, int16_t y)
{
    int32_t tmp1 = 0;
    int32_t tmp2 = 0;

    asm("smull    %0, %1, %2, %3;\n"
            //"mov %0, %0, lsr #15;\n"
            "lsr %0, %0, #15;\n"
            "orr  %0, %0, %1, lsl #17;\n"
            : "=&r"(tmp1), "=&r"(tmp2)
            :"r"(x), "r"(y));

    return tmp1 ;
}

static int32_t inline Mpy_32_16(int32_t x, int16_t y)
{
    int32_t mh;

    mh = ((long long)x * y) >> 15;

    return (mh);
}

static int32_t inline Mpy_32_32(int32_t x, int32_t y)
{
    int32_t tmp1 = 0;
    int32_t tmp2 = 0;

    asm("smull    %0, %1, %2, %3;\n"
            "mov %0, %0, lsr #30;\n"
            "orr    %0, %0, %1, lsl #1;\n"
            : "=&r"(tmp1), "=&r"(tmp2)
            :"r"(x), "r"(y));

    return tmp1 ;
}

static inline void cplxMpy_32_16(int32_t *c_Re, int32_t *c_Im, const int32_t a_Re, const int32_t a_Im, const int16_t b_Re,
                   const int16_t b_Im)
{
    *c_Re = L_sub(Mpy_32_16_asm(a_Re, b_Re), Mpy_32_16_asm(a_Im, b_Im));
    *c_Im = L_add(Mpy_32_16_asm(a_Re, b_Im), Mpy_32_16_asm(a_Im, b_Re));
}

#endif /* __BASOP_SETTINGS_H */
