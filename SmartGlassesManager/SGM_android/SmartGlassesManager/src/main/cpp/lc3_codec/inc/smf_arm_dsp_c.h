#pragma once 
#include <stdint.h>
#include <stdio.h>
#include <math.h>

#ifndef define_int8x8
#define define_int8x8
typedef union {
	int64_t i64;
	int32_t i32[2];
	int16_t i16[4];
	int8_t i8[8];
	uint64_t u64;
	uint32_t u32[2];
	uint16_t u16[4];
	uint8_t u8[8];
}int8x8;
typedef union {
	int32_t i32;
	int16_t i16[2];
	int8_t i8[3];
	uint32_t u32;
	uint16_t u16[2];
	uint8_t u8[4];
}int8x4;
#endif

//clean bits at pos
static inline uint32_t __bfc(uint32_t v, int pos, int bits) {
	return v & ~(((1u << bits) - 1) << pos);
}
//set bits at pos
static inline uint32_t __bfi(uint32_t v, int pos, int bits) {
	return v | (((1u << bits) - 1) << pos);
}
//32‑bit little‑endian data into big‑endian data.
static inline uint32_t __rev32(uint32_t v) {
	return (((v) << 24) | ((v) >> 24) | ((v) >> 8 << 24 >> 8) | ((v) << 8 >> 24 << 8));
}
//32‑bit little‑endian data into big‑endian data.
static inline uint32_t __rev(uint32_t v) {
	return __rev32(v);
}
//16‑bit little‑endian data into big‑endian data.
static inline uint16_t __rev16(uint16_t v) {
	return ((((v) & 0xff) << 8) | (((v) >> 8) & 0xff));
}
///signed 2byte reversal,and extend signed to 32bits
static inline int32_t __revsh(uint16_t v) {
	int32_t y= (((v) << 8) | ((v) >> 8));
	if (y & 0x8000)y |= 0xffff0000;
	return y;
}
//32‑bit signed little‑endian data into 16‑bit signed big‑endian data.
//static inline int16_t __revhs(int32_t v) {
//	return 0;//(((v) << 24) | ((v) >> 24) | ((v) >> 8 << 24 >> 8) | ((v) << 8 >> 24 << 8));
//}
///bit reversal
static inline uint32_t __rbit(uint32_t v) {
	uint32_t y=0;
	return y;
}

//PKHTB R4, R0, R2 ASR #1 ; Writes R2 shifted right by 1 bit to bottom halfword of R4, and writes top halfword of R0 to top halfword of R4
static inline int32_t __pkhtb(int32_t a, int32_t b){
	return (a&0xffff0000)|(b&0x0000ffff);
}

//PKHBT R3, R4, R5 LSL #0 ; Writes bottom halfword of R4 to bottom halfword of R3, writes top halfword of R5, unshifted, to top halfword of R3
static inline int32_t __pkhbt(int32_t a, int32_t b) {
	return (a & 0x0000ffff) | (b & 0xffff0000);	
}

//SSAT instruction applies the specified shift, then saturates to the signed range -2^(n-1) <= x <= 2^(n-1)-1. 
//1<=n<=32
static inline int32_t __ssat_x(int64_t a, int32_t b) {
	int v0 = (1 << (b - 1)) - 1;
	int v1 = -v0 - 1;
	if (a > v0)return v0;
	else if (a < v1)return v1;
	else return (int)a;
}
#define __ssat(a,b) __ssat_x(a,b)


//USAT instruction applies the specified shift, then saturates to the unsigned range 0 <= x <= 2^n-1.
//0<=n<=31
static inline uint32_t __usat_x(int64_t a,int32_t b){
	uint32_t v0 = (1<<b)-1;
	if(a>v0){
		return v0;
	}else if(a<0){
		a=0;
	}
	return (uint32_t)a;
}
#define __usat(a,b) __usat_x(a,b)
#if 0
//QADD8 R3, R1, R6 Adds bytes of R1 to the corresponding bytes of R6, saturates to 8 bits and writes to corresponding byte of R3.
static inline int32_t __qadd8(int32_t a, int32_t b)
{	
	int i = 0;
	int32_t c;
	for(i=0;i<4;i++){
		int16_t tmp = (int16_t)((int8_t*)&a)[i]+((int8_t*)&b)[i];
		((int8_t*)&c)[i]=(int8_t)__ssat((int64_t)tmp, 8);
	}
	return c;
}
static inline int32_t __qadd16(int32_t a, int32_t b)
{
	int i = 0;
	int32_t c;
	for(i=0;i<2;i++){
		int32_t tmp = (int32_t)((int16_t*)&a)[i]+((int16_t*)&b)[i];
		((int16_t*)&c)[i]=(int16_t)__ssat((int64_t)tmp, 16);
	}
	return c;
}
#endif
static inline int32_t __qadd(int32_t a, int32_t b)
{
	int64_t tmp = (int64_t)a+b;
	return __ssat(tmp, 32);
}
#if 0
static inline int32_t __qsub8(int32_t a, int32_t b)
{	
	int i = 0;
	int32_t c;
	for(i=0;i<4;i++){
		int16_t tmp = (int16_t)((int8_t*)&a)[i]-((int8_t*)&b)[i];
		((int8_t*)&c)[i]=(int8_t)__ssat((int64_t)tmp, 8);
	}
	return c;
}
static inline int32_t __qsub16(int32_t a, int32_t b)
{	
	int i = 0;
	int32_t c;
	for(i=0;i<2;i++){
		int32_t tmp = (int32_t)((int16_t*)&a)[i]-((int16_t*)&b)[i];
		((int16_t*)&c)[i]=(int16_t)__ssat((int64_t)tmp, 16);
	}
	return c;
}
#endif
static inline int32_t __qsub(int32_t a, int32_t b)
{
	int64_t tmp = (int64_t)a-b;
	return __ssat(tmp, 32);
}

//QASX R7, R4, R2 ; Adds top halfword of R4 to bottom halfword of R2,saturates to 16 bits, writes to top halfword of R7
// 					Subtracts top highword of R2 from bottom halfword of R4, saturates to 16 bits and writes to bottom halfword of R7
static inline int32_t __qasx(int32_t a, int32_t b){
	int32_t c;
	int16_t a_top = ((int16_t*)&a)[1];
	int16_t a_bot = ((int16_t*)&a)[0];
	int16_t b_top = ((int16_t*)&b)[1];
	int16_t b_bot = ((int16_t*)&b)[0];
	int32_t tmp1 = (int32_t)a_top + b_bot;
	int32_t tmp2 = (int32_t)a_bot - b_top;
	((int16_t*)&c)[1] = (int16_t)__ssat((int64_t)tmp1,16);
	((int16_t*)&c)[0] = (int16_t)__ssat((int64_t)tmp2,16);
	return c;
}

//QSAX R0, R3, R5 ; Subtracts bottom halfword of R5 from top halfword of R3, saturates to 16 bits, writes to top halfword of R0
//				 	Adds bottom halfword of R3 to top halfword of R5, saturates to 16 bits, writes to bottom halfword of R0
static inline int32_t __qsax(int32_t a, int32_t b){
	int32_t c;
	int16_t a_top = ((int16_t*)&a)[1];
	int16_t a_bot = ((int16_t*)&a)[0];
	int16_t b_top = ((int16_t*)&b)[1];
	int16_t b_bot = ((int16_t*)&b)[0];
	int32_t tmp1 = (int32_t)a_top - b_bot;
	int32_t tmp2 = (int32_t)a_bot + b_top;
	((int16_t*)&c)[1] = (int16_t)__ssat((int64_t)tmp1, 16);
	((int16_t*)&c)[0] = (int16_t)__ssat((int64_t)tmp2, 16);
	return c;
}


//UQASX R7, R4, R2 ; Adds top halfword of R4 with bottom halfword of R2, saturates to 16 bits, writes to top halfword of R7
//					 Subtracts top halfword of R2 from bottom halfword of R4, saturates to 16 bits, writes to bottom halfword of R7
static inline uint32_t __uqasx(uint32_t a, uint32_t b){
	uint32_t c;
	uint16_t a_top = ((uint16_t*)&a)[1];
	uint16_t a_bot = ((uint16_t*)&a)[0];
	uint16_t b_top = ((uint16_t*)&b)[1];
	uint16_t b_bot = ((uint16_t*)&b)[0];
	int32_t tmp1 = (int32_t)a_top + b_bot;
	int32_t tmp2 = (int32_t)a_bot - b_top;
	((uint16_t*)&c)[1] = (uint16_t)__usat((int64_t)tmp1, 16);
	((uint16_t*)&c)[0] = (uint16_t)__usat((int64_t)tmp2, 16);
	return c;
}


//UQSAX R0, R3, R5 ; Subtracts bottom halfword of R5 from top halfword of R3, saturates to 16 bits, writes to top halfword of R0
//					 Adds bottom halfword of R4 to top halfword of R5 saturates to 16 bits, writes to bottom halfword of R0.
static inline uint32_t __uqsax(uint32_t a, uint32_t b){
	uint32_t c;
	uint16_t a_top = ((uint16_t*)&a)[1];
	uint16_t a_bot = ((uint16_t*)&a)[0];
	uint16_t b_top = ((uint16_t*)&b)[1];
	uint16_t b_bot = ((uint16_t*)&b)[0];
	int32_t tmp1 = (int32_t)a_top - b_bot;
	int32_t tmp2 = (int32_t)a_bot + b_top;
	((uint16_t*)&c)[1] = (uint16_t)__usat((int64_t)tmp1,16);
	((uint16_t*)&c)[0] = (uint16_t)__usat((int64_t)tmp2,16);
	return c;
}

//QDADD R7, R4, R2 ; Doubles and saturates R2 to 32 bits, adds R4, saturates to 32 bits, writes to R7
static inline int32_t __qdadd(int32_t a, int32_t b)
{
	int64_t y = (int64_t)b<<1;
	b = __ssat(y,32);
	y=(int64_t)a+b;	
	return __ssat(y,32);
}

//QDSUB R0, R3, R5 ; Subtracts R5 doubled and saturated to 32 bits from R3, saturates to 32 bits, writes to R0.
static inline int __qdsub(int a, int b)
{
	int y = (int64_t)b<<1;
	b=__ssat(y,32);
	y=(int64_t)a-b;	
	return __ssat(y,32);
}


//UQADD16 R7, R4, R2; Adds halfwords in R4 to corresponding halfword in R2, saturates to 16 bits, writes to corresponding halfword of R7
static inline uint32_t __uqadd16(uint32_t a, uint32_t b){
	uint32_t c;
	int32_t tmp1 = (int32_t)((uint16_t*)&a)[0] + ((uint16_t*)&b)[0];
	int32_t tmp2 = (int32_t)((uint16_t*)&a)[1] + ((uint16_t*)&b)[1];
	((uint16_t*)&c)[0] = (uint16_t)__usat((int64_t)tmp1, 16);
	((uint16_t*)&c)[1] = (uint16_t)__usat((int64_t)tmp2, 16);
	return c;
}
//UQADD8 R4, R2, R5 ; Adds bytes of R2 to corresponding byte of R5, saturates to 8 bits, writes to corresponding bytes of R4
static inline uint32_t __uqadd8(uint32_t a, uint32_t b){
	uint32_t c;
	int16_t tmp1 = (int16_t)((uint8_t*)&a)[0] + ((uint8_t*)&b)[0];
	int16_t tmp2 = (int16_t)((uint8_t*)&a)[1] + ((uint8_t*)&b)[1];
	int16_t tmp3 = (int16_t)((uint8_t*)&a)[2] + ((uint8_t*)&b)[2];
	int16_t tmp4 = (int16_t)((uint8_t*)&a)[3] + ((uint8_t*)&b)[3];

	((uint8_t*)&c)[0] = (uint8_t)__usat((int64_t)tmp1, 8);
	((uint8_t*)&c)[1] = (uint8_t)__usat((int64_t)tmp2, 8);
	((uint8_t*)&c)[2] = (uint8_t)__usat((int64_t)tmp3, 8);
	((uint8_t*)&c)[3] = (uint8_t)__usat((int64_t)tmp4, 8);
	return c;
}
//UQSUB16 R6, R3, R0; Subtracts halfwords in R0 from corresponding halfword in R3, saturates to 16 bits, writes to corresponding halfword in R6
static inline uint32_t __uqsub16(uint32_t a, uint32_t b){
	uint32_t c;
	int32_t tmp1 = (int32_t)((uint16_t*)&a)[0] - ((uint16_t*)&b)[0];
	int32_t tmp2 = (int32_t)((uint16_t*)&a)[1] - ((uint16_t*)&b)[1];
	((uint16_t*)&c)[0] = (uint16_t)__usat((int64_t)tmp1, 16);
	((uint16_t*)&c)[1] = (uint16_t)__usat((int64_t)tmp2, 16);
	return c;
}
//UQSUB8 R1, R5, R6; Subtracts bytes in R6 from corresponding byte of R5, saturates to 8 bits, writes to corresponding byte of R1.
static inline uint32_t __uqsub8(uint32_t a, uint32_t b){
	uint32_t c;
	int16_t tmp1 = (int16_t)((uint8_t*)&a)[0] - ((uint8_t*)&b)[0];
	int16_t tmp2 = (int16_t)((uint8_t*)&a)[1] - ((uint8_t*)&b)[1];
	int16_t tmp3 = (int16_t)((uint8_t*)&a)[2] - ((uint8_t*)&b)[2];
	int16_t tmp4 = (int16_t)((uint8_t*)&a)[3] - ((uint8_t*)&b)[3];
	((uint8_t*)&c)[0] = (uint8_t)__usat((int64_t)tmp1, 8);
	((uint8_t*)&c)[1] = (uint8_t)__usat((int64_t)tmp2, 8);
	((uint8_t*)&c)[2] = (uint8_t)__usat((int64_t)tmp3, 8);
	((uint8_t*)&c)[3] = (uint8_t)__usat((int64_t)tmp4, 8);
	return c;
}

static inline int __clz(int a)
{
	if (a == (int)0x80000000)
		return 0;
	if (!a)
		return 32;
	unsigned v = a < 0 ? -1 : a;	
	int i = 0;	
	while (!(v & 0x80000000)) {
		v <<= 1; i++;
	}
	return i;
}

//Performs two 16-bit signed integer add.
//SADD16 R1, R0; Adds the halfwords in R0 to the corresponding halfwords of; R1 and writes to corresponding halfword of R1.
static inline int32_t __sadd16(int32_t a,int32_t b){
	//a0+=b0;a1+=b1
	int32_t c;
	((int16_t*)&c)[1] = ((int16_t*)&a)[1]+((int16_t*)&b)[1];
	((int16_t*)&c)[0] = ((int16_t*)&a)[0]+((int16_t*)&b)[0];
	return c;
}

//SADD8 R4, R0, R5; Adds bytes of R0 to the corresponding byte in R5 and writes; to the corresponding byte in R4.
static inline int32_t __sadd8(int32_t a,int32_t b){
	//a0+=b0;a1+=b1;a2+=b2;a3+=b3;
	int32_t c;
	((int8_t*)&c)[0] = ((int8_t*)&a)[0]+((int8_t*)&b)[0];
	((int8_t*)&c)[1] = ((int8_t*)&a)[1]+((int8_t*)&b)[1];
	((int8_t*)&c)[2] = ((int8_t*)&a)[2]+((int8_t*)&b)[2];
	((int8_t*)&c)[3] = ((int8_t*)&a)[3]+((int8_t*)&b)[3];
	return c;
}


//
//SSUB16 R1, R0 ; Subtracts halfwords in R0 from corresponding halfword of R1 and writes to corresponding halfword of R1.
//Performs two 16-bit signed integer subtractions.
static inline int32_t __ssub16(int32_t a,int32_t b){
	int32_t c;
	((int16_t*)&c)[1] = ((int16_t*)&a)[1]-((int16_t*)&b)[1];
	((int16_t*)&c)[0] = ((int16_t*)&a)[0]-((int16_t*)&b)[0];
	return c;
}

//SSUB8 R4, R0, R5 ; Subtracts bytes of R5 from corresponding byte in R0, and writes to corresponding byte of R4.
//Performs four 8-bit signed integer subtractions.
static inline int32_t __ssub8(int32_t a,int32_t b){
	int32_t c;
	((int8_t*)&c)[0] = ((int8_t*)&a)[0]-((int8_t*)&b)[0];
	((int8_t*)&c)[1] = ((int8_t*)&a)[1]-((int8_t*)&b)[1];
	((int8_t*)&c)[2] = ((int8_t*)&a)[2]-((int8_t*)&b)[2];
	((int8_t*)&c)[3] = ((int8_t*)&a)[3]-((int8_t*)&b)[3];
	return c;
}

//SASX R0, R4, R5 ; Adds top halfword of R4 to bottom halfword of R5 and writes to top halfword of R0.
//					Subtracts top halfword of R5 from bottom halfword of R4 and writes to bottom halfword of R0.
static inline int32_t __sasx(int32_t a,int32_t b){
	int32_t c;
	int16_t a_top = ((int16_t*)&a)[1];
	int16_t a_bot = ((int16_t*)&a)[0];
	int16_t b_top = ((int16_t*)&b)[1];
	int16_t b_bot = ((int16_t*)&b)[0];
	((int16_t*)&c)[1] = (int16_t)((int32_t)a_top + b_bot);
	((int16_t*)&c)[0] = (int16_t)((int32_t)a_bot - b_top);
	return c;
}

//SSAX R7, R3, R2 ; Subtracts bottom halfword of R2 from top halfword of R3 and writes to bottom halfword of R7.
//					Adds bottom halfword of R3 with top halfword of R2 and writes to top halfword of R7.
static inline int32_t __ssax(int32_t a,int32_t b){
	int32_t c;
	int16_t a_top = ((int16_t*)&a)[1];
	int16_t a_bot = ((int16_t*)&a)[0];
	int16_t b_top = ((int16_t*)&b)[1];
	int16_t b_bot = ((int16_t*)&b)[0];
	((int16_t*)&c)[1] = (int16_t)((int32_t)a_top - b_bot);
	((int16_t*)&c)[0] = (int16_t)((int32_t)a_bot + b_top);
	return c;
}

//SHADD16 R1, R0 ;adds bytes of R0 to corresponding byte in R5 and writes halved result to corresponding byte in R4.
static inline int32_t __shadd16(int32_t a,int32_t b){
	int32_t c;
	((int16_t*)&c)[0]=(((int16_t*)&a)[0]+((int16_t*)&b)[0])>>1;
	((int16_t*)&c)[1]=(((int16_t*)&a)[1]+((int16_t*)&b)[1])>>1;
	return c;

}
//SHSUB16 R1, R0 ;Subtracts bytes of R0 to corresponding byte in R5 and writes halved result to corresponding byte in R4.
static inline int32_t __shsub16(int32_t a,int32_t b){
	int32_t c;
	((int16_t*)&c)[0]=(((int16_t*)&a)[0]-((int16_t*)&b)[0])>>1;
	((int16_t*)&c)[1]=(((int16_t*)&a)[1]-((int16_t*)&b)[1])>>1;
	return c;

}

//SHADD8 R4, R0, R5 ; Adds halfwords in R0 to corresponding halfword of R1 and writes halved result to corresponding halfword in R1.
static inline int32_t __shadd8(int32_t a,int32_t b){
	int32_t c;
	((int8_t*)&c)[0]=(((int8_t*)&a)[0]+((int8_t*)&b)[0])>>1;
	((int8_t*)&c)[1]=(((int8_t*)&a)[1]+((int8_t*)&b)[1])>>1;
	((int8_t*)&c)[2]=(((int8_t*)&a)[2]+((int8_t*)&b)[2])>>1;
	((int8_t*)&c)[3]=(((int8_t*)&a)[3]+((int8_t*)&b)[3])>>1;
	return c;
}
//SHSUB8 R1, R0 ; Subtracts halfwords in R0 from corresponding halfword of R1 and writes halved result to corresponding halfword in R1.
static inline int32_t __shsub8(int32_t a,int32_t b){
	int32_t c;
	((int8_t*)&c)[0]=(((int8_t*)&a)[0]-((int8_t*)&b)[0])>>1;
	((int8_t*)&c)[1]=(((int8_t*)&a)[1]-((int8_t*)&b)[1])>>1;
	((int8_t*)&c)[2]=(((int8_t*)&a)[2]-((int8_t*)&b)[2])>>1;
	((int8_t*)&c)[3]=(((int8_t*)&a)[3]-((int8_t*)&b)[3])>>1;
	return c;
}


//SHASX R7, R4, R2 ; Adds top halfword of R4 to bottom halfword of R2 and writes halved result to top halfword of R7.
// 					Subtracts top halfword of R2 from bottom halfword of R4 and writes halved result to bottom halfword of R7.
static inline int32_t __shasx(int32_t a,int32_t b){
	int32_t c;
	int16_t a_top = ((int16_t*)&a)[1];
	int16_t a_bot = ((int16_t*)&a)[0];
	int16_t b_top = ((int16_t*)&b)[1];
	int16_t b_bot = ((int16_t*)&b)[0];
	((int16_t*)&c)[1] = (a_top + b_bot)>>1;
	((int16_t*)&c)[0] = (a_bot - b_top)>>1;
	return c;
}

//SHSAX R0, R3, R5 ; Subtracts bottom halfword of R5 from top halfword of R3 and writes halved result to top halfword of R0.
//					Adds top halfword of R5 to bottom halfword of R3 and writes halved result to bottom halfword of R0.
static inline int32_t __shsax(int32_t a,int32_t b){
	int32_t c;
	int16_t a_top = ((int16_t*)&a)[1];
	int16_t a_bot = ((int16_t*)&a)[0];
	int16_t b_top = ((int16_t*)&b)[1];
	int16_t b_bot = ((int16_t*)&b)[0];
	((int16_t*)&c)[1] = (a_top - b_bot)>>1;
	((int16_t*)&c)[0] = (a_bot + b_top)>>1;
	return c;
}

//32=32*32+32
//MLA R10, R2, R1, R5 ; Multiply with accumulate, R10 = (R2 * R1) + R5
static inline int32_t __mla(int32_t a,int32_t b,int32_t c){
	return (int32_t)(c+(int64_t)a*b);	
}

//32=32-32*32
//MLS R4, R5, R6, R7 ; Multiply with subtract, R4 = R7 - (R5 * R6)
static inline int32_t __mls(int32_t a,int32_t b,int32_t c){
	return (int32_t)(c-(int64_t)a*b);
}

///Signed Multiply Accumulate 
//16*16+32=32
//SMLABB R5, R6, R4, R1 ; Multiplies bottom halfwords of R6 and R4, adds R1 and writes to R5.
static inline int32_t __smlabb(int32_t a,int32_t b,int32_t c){
	return (int32_t)((int16_t*)&a)[0]*((int16_t*)&b)[0]+c;
	//return (int32_t)a*b+c;
}

//16b*16b+32=>32
//SMLATT R5, R6, R4, R1 ; Multiplies top halfwords of R6 and R4, adds R1 and writes the sum to R5.
static inline int32_t __smlatt(int32_t a,int32_t b,int32_t c){
	return (a>>16)*(b>>16)+c;	
}

//16t*16b+32
//SMLATB R5, R6, R4, R1 ; Multiplies top halfword of R6 with bottom halfword of R4, adds R1 and writes to R5
static inline int32_t __smlatb(int32_t a,int32_t b,int32_t c){
	//return (a>>16)*b+c;
	return (int32_t)(a>>16)*((int16_t*)&b)[0]+c;
	
}

//16b*16t+32
//SMLABT R5, R6, R4, R1 ; Multiplies bottom halfword of R6 with top halfword of R4, adds R1 and writes to R5.
static inline int32_t __smlabt(int32_t a,int32_t b,int32_t c){
	return (int32_t)((int16_t*)&a)[0]*(b>>16)+c;
}
//SMLABT R4, R3, R2 ; Multiplies bottom halfword of R4 with top halfword of R3, adds R2 and writes to R4
// static inline int32_t __smlabt(int32_t a,int32_t b,int32_t c){
// 	int32_t tmp = (int32_t)((int16_t*)&a)[0]*(b>>16);
// 	dbgPrintf("%s,%08x\n",__FUNCTION__, tmp);
// 	return (int32_t)(a>>16)*(b>>16)+c;
// }

//(a32*b16>>16)+c32
//SMLAWB R10, R2, R5, R3 ; Multiplies R2 with bottom halfword of R5, adds R3 to the result and writes top 32-bits to R10. 
static inline int32_t __smlawb(int32_t a,int32_t b,int32_t c){
	return (int32_t)(((int64_t)a*((int16_t*)&b)[0])>>16)+c;
}

//(32*16t>>16)+32
//SMLAWT R10, R2, R1, R5 ; Multiplies R2 with top halfword of R1, adds R5 and writes top 32-bits to R10.
static inline int32_t __smlawt(int32_t a,int32_t b,int32_t c){
	return (int32_t)(((int64_t)a*((int16_t*)&b)[1])>>16)+c;
}

//16*16+16*16+32
//SMLAD R10, R2, R1, R5 ; Multiplies two halfword values in R2 with corresponding halfwords in R1, adds R5 and writes to R10.
static inline int32_t __smlad(int32_t a,int32_t b,int32_t c){
	return (int32_t)((int16_t*)&a)[0]*((int16_t*)&b)[0]+(int32_t)((int16_t*)&a)[1]*((int16_t*)&b)[1]+c;
}

//16t*16b+16b*16t+32
//SMLADX R0, R2, R4, R6 ; Multiplies top halfword of R2 with bottom halfword of R4, multiplies bottom halfword of R2 with top
//  halfword of R4, adds R6 and writes to R0.
static inline int32_t __smladx(int32_t a,int32_t b,int32_t c){
	return (int32_t)((int16_t*)&a)[1]*((int16_t*)&b)[0]+(int32_t)((int16_t*)&a)[0]*((int16_t*)&b)[1]+c;
}

///64+=16*16
//SMLALBT R2, R1, R6, R7 ;Multiplies bottom halfword of R6 with top halfword of R7, sign extends to 32-bit, adds R1:R2 and writes to R1:R2.
static inline int64_t __smlalbt(int16_t a,int32_t b,int64_t y){
	return a*(b>>16)+y;	
}

///64+=16*16
//SMLALTB R2, R1, R6, R7 ; Multiplies top halfword of R6 with bottom halfword of R7,sign extends to 32-bit, adds R1:R2 and writes to R1:R2.
static inline int64_t __smlaltb(int32_t a,int16_t b,int64_t y){
	return (a>>16)*b+y;
}

//64+=16*16+16*16
//SMLALD R6, R8, R5, R1 ; Multiplies top halfwords in R5 and R1 and bottom halfwords of R5 and R1, adds R8:R6 and writes to R8:R6.
static inline int64_t __smlald(int32_t a,int32_t b,int64_t c){
	int64_t tmp = (int64_t)((int16_t*)&a)[0]*((int16_t*)&b)[0]+(int64_t)((int16_t*)&a)[1]*((int16_t*)&b)[1];
	c+=tmp;
	return c;
}
#define __smlald_(a2,b2,sum64) sum64 = __smlald(a2,b2,sum64)

//64+=16*16+16*16 x
//SMLALDX R6, R8, R5, R1 ; Multiplies top halfword in R5 with bottom halfword of R1, and bottom halfword of R5 with top halfword of R1, adds R8:R6 and writes to R8:R6.
static inline int64_t __smlaldx(int32_t a,int32_t b,int64_t c){
	int32_t tmp = (int32_t)((int16_t*)&a)[1]*((int16_t*)&b)[0]+(int32_t)((int16_t*)&a)[0]*((int16_t*)&b)[1];
	c+=tmp;
	return c;
}

////////////////////
//sub
//16x16-16*16+32
//SMLSD R0, R4, R5, R6 ; Multiplies bottom halfword of R4 with bottom halfword of R5, multiplies top halfword of R4 with top halfword of R5, subtracts second from
// first, adds R6, writes to R0.
static inline int32_t __smlsd(int32_t a,int32_t b,int32_t c){
	return ((int16_t*)&a)[0]*((int16_t*)&b)[0]-((int16_t*)&a)[1]*((int16_t*)&b)[1]+c;
}

//16x16-16*16+32 x
//SMLSDX R1, R3, R2, R0 ; Multiplies bottom halfword of R3 with top halfword of R2, multiplies top halfword of R3 with bottom halfword of R2, subtracts second from
// first, adds R0, writes to R1.
static inline int32_t __smlsdx(int32_t a,int32_t b,int32_t c){
	return  (int32_t)((int16_t*)&a)[0]*((int16_t*)&b)[1]- (int32_t)((int16_t*)&a)[1]*((int16_t*)&b)[0]+c;
}

//64+=16*16-16*16
//SMLSLD R3, R6, R2, R7 ; Multiplies bottom halfword of R7 with bottom halfword of R2, multiplies top halfword of R7 with top halfword of R2, subtracts second from
// first, adds R6:R3, writes to R6:R3.
static inline int64_t __smlsld(int32_t a,int32_t b,int64_t c){
	//c=R6:R3 a=R2 b=R7
	int32_t tmp1 = (int32_t)((int16_t*)&a)[0]*((int16_t*)&b)[0]-(int32_t)((int16_t*)&a)[1]*((int16_t*)&b)[1];
	c+=tmp1;
	return c;
}

//64+=16*16-16*16
//SMLSLDX R3, R6, R2, R7 ; Multiplies bottom halfword of R2 with top halfword of R7, multiplies top halfword of R2 with bottom halfword of R7, subtracts second from
// first, adds R6:R3, writes to R6:R3.
static inline int64_t __smlsldx(int32_t a,int32_t b,int64_t c){
	int32_t tmp1 = (int32_t)((int16_t*)&a)[0]*((int16_t*)&b)[1]-(int32_t)((int16_t*)&a)[1]*((int16_t*)&b)[0];
	c+=tmp1;
	return c;
}

///(32*32>>32) +32
//SMMLA  R0, R4, R5, R6 ; Multiplies R4 and R5, extracts top 32 bits, adds R6, truncates and writes to R0.
static inline int32_t __smmla(int32_t a,int32_t b,int32_t c){
	return (int32_t)(((int64_t)a*b)>>32)+c;
}

///(32*32>>32) +32
//SMMLAR R6, R2, R1, R4 ; Multiplies R2 and R1, extracts top 32 bits, adds R4, rounds and writes to R6.
static inline int32_t __smmlar(int32_t a,int32_t b,int32_t c){
	return (int32_t)(((int64_t)a*b+0x80000000ll)>>32)+c;	
}

//32-(32*32)>>32
//SMMLS  R4, R5, R3, R8 ; Multiplies R5 and R3, extracts top 32 bits, subtracts R8, truncates and writes to R4.
static inline int32_t __smmls(int32_t a,int32_t b,int32_t c){
	return c-(int32_t)(((int64_t)a*b)>>32)-1;
}

//32-(32*32)>>32 r
//SMMLSR R3, R6, R2, R7 ; Multiplies R6 and R2, extracts top 32 bits, subtracts R7, rounds and writes to R3.
static inline int32_t __smmlsr(int32_t a,int32_t b,int32_t c){
	return c-(int32_t)(((int64_t)a*b+0x80000000ll)>>32);	
}

//(32*32)>>32
//SMMUL R0, R4, R5 ; Multiplies R4 and R5, truncates top 32 bits and writes to R0.
static inline int32_t __smmul(int32_t a,int32_t b){
	return (int32_t)(((int64_t)a*b)>>32);	
}

//(32*32)>>32 r
//SMMULR R6, R2 ; Multiplies R6 and R2, rounds the top 32 bits and writes to R6.
static inline int32_t __smmulr(int32_t a,int32_t b){
	return (int32_t)(((int64_t)a*b+0x80000000ll)>>32);	
}

//16*16+16*16
//SMUAD R0, R4, R5 ; Multiplies bottom halfword of R4 with the bottom halfword of R5, adds multiplication of top halfword of R4 with top halfword of R5, writes to R0.
static inline int32_t __smuad(int32_t a,int32_t b){
	int16_t a_top = ((int16_t*)&a)[1];
	int16_t a_bot = ((int16_t*)&a)[0];
	int16_t b_top = ((int16_t*)&b)[1];
	int16_t b_bot = ((int16_t*)&b)[0];
	return a_bot*b_bot + a_top*b_top;
}

//16*16+16*16 x
//SMUADX R3, R7, R4 ; Multiplies bottom halfword of R7 with top halfword of R4, adds multiplication of top halfword of R7 with bottom halfword of R4, writes to R3.
static inline int32_t __smuadx(int32_t a,int32_t b){
	int16_t a_top = ((int16_t*)&a)[1];
	int16_t a_bot = ((int16_t*)&a)[0];
	int16_t b_top = ((int16_t*)&b)[1];
	int16_t b_bot = ((int16_t*)&b)[0];
	return a_bot*b_top + a_top*b_bot;
}

//16*16-16*16
//SMUSD R3, R6, R2 ; Multiplies bottom halfword of R4 with bottom halfword of R6, subtracts multiplication of top halfword of R6 with top halfword of R3, writes to R3.
static inline int32_t __smusd(int32_t a,int32_t b){
	int16_t a_top = ((int16_t*)&a)[1];
	int16_t a_bot = ((int16_t*)&a)[0];
	int16_t b_top = ((int16_t*)&b)[1];
	int16_t b_bot = ((int16_t*)&b)[0];
	return a_bot*b_bot - a_top*b_top;
}

//16*16-16*16 x
//SMUSDX R4, R5, R3; Multiplies bottom halfword of R5 with top halfword of R3, subtracts multiplication of top halfword of R5 with bottom halfword of R3, writes to R4.
static inline int32_t __smusdx(int32_t a,int32_t b){
	int16_t a_top = ((int16_t*)&a)[1];
	int16_t a_bot = ((int16_t*)&a)[0];
	int16_t b_top = ((int16_t*)&b)[1];
	int16_t b_bot = ((int16_t*)&b)[0];
	return a_bot*b_top - a_top*b_bot;
}

//16*16 x
//SMULBT R0, R4, R5 ; Multiplies the bottom halfword of R4 with the top halfword of R5, multiplies results and writes to R0.
static inline int32_t __smulbt(int32_t a,int32_t b){
	return ((int16_t*)&a)[0]*((int16_t*)&b)[1];
}

//16*16
//SMULBB R0, R4, R5 ; Multiplies the bottom halfword of R4 with the bottom halfword of R5, multiplies results and writes to R0.
static inline int32_t __smulbb(int32_t a,int32_t b){
	return ((int16_t*)&a)[0]*((int16_t*)&b)[0];
}

//16*16 t
//SMULTT R0, R4, R5 ; Multiplies the top halfword of R4 with the top halfword of R5, multiplies results and writes to R0.
static inline int32_t __smultt(int32_t a,int32_t b){
	return ((int16_t*)&a)[1]*((int16_t*)&b)[1];
}

//16*16 tx
//SMULTB R0, R4, R5 ; Multiplies the top halfword of R4 with the bottom halfword of R5, multiplies results and and writes to R0.
static inline int32_t __smultb(int32_t a,int32_t b){
	return ((int16_t*)&a)[1]*((int16_t*)&b)[0];
}

//32*16t>>16
//SMULWT R4, R5, R3 ; Multiplies R5 with the top halfword of R3, extracts top 32 bits and writes to R4.
static inline int32_t __smulwt(int32_t a,int32_t b){
	//int64_t tmp = ((int64_t)a*(b>>16))>>16;
	return (int32_t)(((int64_t)a*(b>>16))>>16);

}

//32*16>>16
//SMULWB R4, R5, R3 ; Multiplies R5 with the bottom halfword of R3, extracts top 32 bits and writes to R4.
static inline int32_t __smulwb(int32_t a,int32_t b){
	return (int32_t)(((int64_t)a*((int16_t*)&b)[0])>>16);
}

//UMULL Unsigned Multiply Long.
//u64=32*32
//UMULL R0, R4, R5, R6 ; Unsigned (R4,R0) = R5 * R6
static inline uint64_t __umull(uint32_t a,uint32_t b){
	uint64_t c = (uint64_t)a*b;
	return c;
}
//u64+=32*32
//UMLAL Unsigned Multiply, with Accumulate Long.
static inline uint64_t __umlal(uint32_t a,uint32_t b, uint64_t c){
	c += (uint64_t)a*b;
	return c;
}
//u32*32+32+32
//UMAAL Unsigned Long Multiply with Accumulate Accumulate.
static inline uint64_t __umaal(uint32_t a,uint32_t b, uint32_t c, uint32_t d){
	return (uint64_t)c*d+a+b;
}

//64=32*32
//SMULL Signed Multiply Long.
static inline int64_t __smull(int32_t a,int32_t b){
	int64_t c = (int64_t)a*b;
	return c;
}
//SMLAL Signed Multiply, with Accumulate Long.
//64+=32*32 
//SMLAL R4, R5, R3, R8 ;Signed (R5,R4) = (R5,R4) + R3 * R8
static inline int64_t __smlal(int32_t a,int32_t b, int64_t c){
	c +=(int64_t)a*b;
	return c;
}

//SBFX R0, R1, #20, #4 ; Extract bit 20 to bit 23 (4 bits) from R1 and sign extend to 32 bits and then write the result to R0. 
static inline int32_t __sbfx(int32_t a){
	int32_t b = (a>>20)&0x0000000f;
	if(a<0){
		return b|0xfffffff0;
	}else{
		return b;
	}
	// int32_t b = (data>>start)&(1<<leng-1);
	// if(data<0){
	// 	return b|~(1<<leng-1);
	// }else{
	// 	return b;
	// }

}

//R0=(R1>>20) & ((1<<4)-1)
//UBFX R0, R1, #20, #4 ; Extract bit 20 to bit 23 (4 bits) from R1 and zero extend to 32 bits and then write the result to R0.
static inline int32_t __ubfx(int32_t a){
	// int32_t b = (data>>start)&(1<<leng-1);
	return (a>>20)&0x0000000f;
}
//R0=(R1>>20) & ((1<<4)-1)

///vfp
///a+b  Adds the values in the two floating-point operand registers, places the results in the destination floating-point register, the results in the destination floating-point register.
static inline float __vadd(const float a, const float b) {
	return a+b;
}
///a-b  Subtracts one floating-point value from another floating-point value, places the results in the destination floating-point register.
static inline float __vsub(const float a, const float b) {
	return a-b;
}
///a*b Multiplies two floating-point values, places the results in the destination register.
static inline float __vmul(const float a, const float b) {
	return a*b;
}
///a/b Divides one floating-point value by another floating-point value, writes the result to the floating-point destination register.
static inline float __vdiv(const float a, const float b) {
	return a/b;	
}

// fabs(a) Takes the absolute value of the operand floating-point register, places the results in the destination floating-point register.
static inline float __vabs(const float a) {
	// return a < 0.f || a == -0.f? -a:a;
	unsigned int *b = (unsigned int *)&a;
	return *b & 0x80000000? -a:a;
}

// sqrt(a) Calculates the square root of the value in a floating-point register, writes the result to another floating-point register.
static inline float __vsqrt(const float a) {
#if 1
	return (float)sqrt(a);
#else
	if(a == 0.f || a == -0.f)
		return a;
	if(a < -0.f)
		return NAN;
	double val = a;
    double last;
    do
    {
        last = val;
        val =(val + a/val) / 2;
    }while(val != last);
    return val;
#endif
}

//The VMAXNM instruction compares two source registers, and moves the largest to the destination register.
static inline float __vmaxnm(const float a, const float b) {
	return a > b? a:b;
}

//The VMINNMinstruction compares two source registers, and moves the smallest to the destination register
static inline float __vminnm(const float a, const float b) {
	return a > b? b:a;
}

///VCVT<rmode>.S32.F32 Sd, Sm
//A Round to nearest ties away.
//M Round to nearest even.
//N Round towards plus infinity.
//P Round towards minus infinity.
///A Round to nearest ties away.
static inline int __vcvta_s32(float a) {
	return (int)(a > 0.f? a+0.5f : a-0.5f); 
}
///M Round to nearest even.
static inline int __vcvtm_s32(float a) {
	int b = (int)a;
	if(a > 0.f){
		return (int)a;
	}else{
		if (a == (float)b){
			return (int)a;
		}else{
			return (int)(a-1.0f);
		}
	}
}
///N Round towards plus infinity.
static inline int __vcvtn_s32(float a) {
	bool _Even = false;
	int _add = 0;
	int b = (int)(a*10);
	if(a*10 == (float)b){
		if(b%10 && !(b%5)){
			_Even = true;
			_add = (b/10)%2? 1 : 0;
		}
	}
	if(_Even){
		if(_add){
			return (int)(a > 0.f? a+0.5 : a-0.5);
		}else{
			return (int)a;
		}
	}else{
		return (int)(a > 0.f? a+0.5 : a-0.5);
	}
}
///P Round towards minus infinity.
static inline int __vcvtp_s32(float a) {
	int b = (int)a;
	if(a > 0.f){
		if(a == (float)b){
			return (int)a;
		}else{
			return (int)(a+1.0f);
		}
	}else{
		return (int)a;
	}
}
///Round towards Zero.
static inline int __vcvt_s32(float a) {
	return (int)a;
}

//
///A Round to nearest ties away.
static inline uint32_t __vcvta_u32(float a) {
	return (uint32_t)(a+0.5);
}
///M Round to nearest even.
static inline uint32_t __vcvtm_u32(float a) {
	return (uint32_t)a;
}
///N Round towards plus infinity.
static inline uint32_t __vcvtn_u32(float a) {
	bool _Even = false;
	int _add = 0;
	int b = (int)(a*10);
	if(a*10 == (float)b){
		if(b%10 && !(b%5)){
			_Even = true;
			_add = (b/10)%2? 1 : 0;
		}
	}
	if(_Even){
		if(_add){
			return (uint32_t)(a+0.5f);
		}else{
			return (uint32_t)a;
		}
	}else{
		return (uint32_t)(a+0.5f);
	}
}
///P Round towards minus infinity.
static inline uint32_t __vcvtp_u32(float a) {
	int b = (int)a;
	if(a == (float)b){
		return (uint32_t)a;
	}else{
		return (uint32_t)(a+1.0f);
	}
}
///Round towards Zero.
static inline uint32_t __vcvt_u32(float a) {
	return (uint32_t)a;

}

#if 0
///uses the rounding mode specified by the FPSCR
static inline int __vcvtr(float a) {
}
#endif

//VRINT<rmode>.F32 Sd, Sm
//A Round to nearest ties away.
//N Round to Nearest Even.
//P Round towards Plus Infinity.
//M Round towards Minus Infinity.
//Z Round towards Zero.
///A:Round to nearest ties away.
static inline float __vrinta(float a) {
	unsigned int *b = (unsigned int *)&a;
	if((a > -1.f && a < -0.f) || *b == 0x80000000)
		return -0.f;
	int c = __vcvta_s32(a);
	return (float)c;
}
///N:Round to nearest even.
static inline float __vrintn(float a) {
	unsigned int *b = (unsigned int *)&a;
	if((a > -1.f && a < -0.f) || *b == 0x80000000)
		return -0.f;
	int c = __vcvtn_s32(a);
	return (float)c;
}
///P:Round towards plus infinity.
static inline float __vrintp(float a) {
	unsigned int *b = (unsigned int *)&a;
	if((a > -1.f && a < -0.f) || *b == 0x80000000)
		return -0.f;
	int c = __vcvtp_s32(a);
	return (float)c;
}
///M:Round towards minus infinity.
static inline float __vrintm(float a) {
	unsigned int *b = (unsigned int *)&a;
	if(*b == 0x80000000)
		return -0.f;
	int c = __vcvtm_s32(a);
	return (float)c;
}
///Z:Round towards Zero.
static inline float __vrintz(float a) {
	unsigned int *b = (unsigned int *)&a;
	if((a > -1.f && a < -0.f) || *b == 0x80000000)
		return -0.f;
	int c = __vcvt_s32(a);
	return (float)c;
}

//-a
static inline float __vneg(float a) {
	return -a;
}

///-a*b
static inline float __vnmul(const float a, const float b) {
	//VNMUL{cond}.F32 Sd, Sn, Sm
	return __vmul(__vneg(a), b);
}
///c+a*b
static inline float __vmla(const float a, const float b, float c) {
	//VMLA{cond}.F32 Sd, Sn, Sm
	return __vadd(c, __vmul(a, b));
}
#define __vmla_(a,b,sum) sum=__vmla(a,b,sum)

///-c-a*b
static inline float __vnmla(const float a, const float b, float c) {
	//VNMLA{cond}.F32 Sd, Sn, Sm
	return __vneg(__vmla(a, b, c));
}
#define __vnmla_(a,b,sum) sum=__vnmla(a,b,sum)

///c-a*b
static inline float __vmls(const float a, const float b, float c) {
	//VMLS{cond}.F32 Sd, Sn, Sm
	return __vsub(c, __vmul(a, b));
}
#define __vmls_(a,b,sum) sum=__vmls(a,b,sum)

///-c+a*b
static inline float __vnmls(const float a, const float b, float c) {
	//VNMLS{cond}.F32 Sd, Sn, Sm
	return __vneg(__vmls(a, b, c));
}
#define __vnmls_(a,b,sum) sum=__vnmls(a,b,sum)

//sum += a*b;
static inline float __vfma(const float a, const float b, float c) {
	//VFMA{cond}.F32 Sd, Sn, Sm
	return __vadd(c, __vmul(a, b));
}
#define __vfma_(a,b,sum) sum=__vfma(a,b,sum)

//sub -= a*b
static inline float __vfms(const float a, const float b, float c) {
	//VFMS{cond}.F32 Sd, Sn, Sm
	return __vsub(c, __vmul(a, b));
}
#define __vfms_(a,b,sum) sum=__vfms(a,b,sum)
//-c-a*b
//sum = -(sum+a*b)
static inline float __vfnma(const float a, const float b, float c) {
	//VFNMA{cond}.F32 Sd, Sn, Sm
	return __vneg(__vfma(a, b, c));
}
#define __vfnma_(a,b,sum) sum=__vfnma(a,b,sum)
//-c+a*b
//sub = -(sub-a*b)
static inline float __vfnms(const float a, const float b, float c) {
	//VFNMS{cond}.F32 Sd, Sn, Sm
	return __vneg(__vfms(a, b, c));
}
#define __vfnms_(a,b,sum) sum=__vfnms(a,b,sum)


/* ARM_M33STAR_H */