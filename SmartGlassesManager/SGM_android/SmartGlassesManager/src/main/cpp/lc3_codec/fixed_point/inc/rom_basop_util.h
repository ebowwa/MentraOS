
#ifndef __BASOP_UTIL_ROM_H__
#define __BASOP_UTIL_ROM_H__

#ifndef COUNT_ROM
#include "functions.h"
#endif

#define LD_INT_TAB_LEN 120
#define INV_TABLE_SIZE 256
#define SQRT_TABLE_SIZE 256

#ifndef CHEAP_NORM_SIZE
#define CHEAP_NORM_SIZE 161
#endif

#define MINSFTAB 7
#define MAXSFTAB 25

#define SHC(x) ((int16_t)x)

/**
 * \brief  Lookup-Table for binary logarithm
 */
extern const int16_t ldCoeff[7];

/**
  \brief     Lookup-Table for binary power algorithm
*/
extern const uint32_t exp2_tab_long_lc3[32];

/**
  \brief     Lookup-Table for binary power algorithm
*/
extern const uint32_t exp2w_tab_long_lc3[32];

/**
  \brief     Lookup-Table for binary power algorithm
*/
extern const uint32_t exp2x_tab_long_lc3[32];

/**
 * \brief 1/x, x=[0,1,2,3...]  table
 */
extern const int16_t InvIntTable[32];

/**
 * \ brief Sine tables
 */
extern const PWord16 SineTable480_1[241];
extern const PWord16 SineTable320[161];

/**
 * \ brief Lookup for sine tables and windows.
 */
void LC3_getTables(const PWord16 **ptwiddle, const PWord16 **sin_twiddle, int16_t *sin_step, int16_t length);

extern const int32_t RealFFT20_twid[6];
extern const int32_t RealFFT32_twid[10];
extern const int32_t RealFFT40_twid[12];
extern const int32_t RealFFT60_twid[17];
extern const int32_t RealFFT64_twid[18];
extern const int32_t RealFFT80_twid[22];
extern const int32_t RealFFT96_twid[26];
extern const int32_t RealFFT128_twid[34];
extern const int32_t RealFFT192_twid[50];
extern const int32_t RealFFT256_twid[66];
extern const int32_t RealFFT384_twid[98];
extern const int32_t RealFFT512_twid[130];
extern const int32_t RealFFT768_twid[194];

extern const int32_t RotVector_32_32[2 * 20];
extern const int32_t RotVector_40_32[2 * 28];
extern const int16_t RotVector_320[2 * (320 - 20)];
extern const int16_t RotVector_360[2 * (360 - 30)];
extern const int16_t RotVector_480[2 * (480 - 30)];
extern const int16_t RotVector_32_8[2 * (256 - 32)];
extern const int16_t RotVector_32_12[2 * (384 - 32)];

extern const int32_t isqrt_table[128 + 2];

extern const int32_t Log2_16_table1[16];
extern const int16_t Log2_16_table2[16];

extern const int32_t InvLog2_16_table1[64];
extern const int16_t InvLog2_16_table2[64];

extern const uint8_t  gf16_mult_table[256];
extern const uint8_t  rs16_elp_deg2_table[256];
extern const uint16_t rs16_elp_deg3_table[256];

#endif
