#pragma once 
#ifndef __ARM_M33STAR_H__
#define __ARM_M33STAR_H__
#include <stdio.h>
#include <stdint.h>

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

///return (((v) << 24) | ((v) >> 24) | ((v) >> 8 << 24 >> 8) | ((v) << 8 >> 24 << 8));
static inline uint32_t __rev32(uint32_t v) {
	uint32_t y;
	__asm(
	"rev %0,%1;\n"
		:"=r"(y)
		: "r"(v)
		);
	return y;
}
///return (((v) << 8) | ((v) >> 8));
static inline uint16_t __rev16(uint16_t v) {
	uint16_t y;
	__asm(
	"rev16 %0,%1;\n"
		:"=r"(y)
		: "r"(v)
		);
	return y;
}
///signed 2byte reversal,and extend signed to 32bits
static inline int32_t __revsh(int16_t v) {
	int32_t y;
	__asm(
	"revsh %0,%1;\n"
		:"=r"(y)
		: "r"(v)
		);
	return y;
}
///bit reversal
static inline uint32_t __rbit(uint32_t v) {
	uint32_t y;
	__asm(
	"rbit %0,%1;\n"
		:"=r"(y)
		: "r"(v)
		);
	return y;
}

//PKHBT R3, R4, R5 LSL #0 ; Writes bottom halfword of R4 to bottom halfword of R3, writes top halfword of R5, unshifted, to top halfword of R3
static inline int32_t __pkhbt(int32_t a, int32_t b)
{
	//y = (a&0x0000ffff)|(b&0xffff0000);
	int32_t y;
	__asm(
	"pkhbt %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//PKHTB R4, R0, R2 ASR #1 ; Writes R2 shifted right by 1 bit to bottom halfword of R4, and writes top halfword of R0 to top halfword of R4
static inline int32_t __pkhtb(int32_t a, int32_t b)
{
	//y = (a&0xffff0000)|(b&0x0000ffff);
	int32_t y;
	__asm(
	"pkhtb %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
#if 1
//QADD8 R3, R1, R6 Adds bytes of R1 to the corresponding bytes of R6, saturates to 8 bits and writes to corresponding byte of R3.
static inline int32_t __qadd8(int32_t a, int32_t b)
{
	int32_t y;
	__asm(
	"qadd8 %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
//QADD16 R7, R4, R2 ; Adds halfwords of R4 with corresponding halfword of R2, saturates to 16 bits and writes to corresponding halfword of R7.
static inline int32_t __qadd16(int32_t a, int32_t b)
{
	int32_t y;
	__asm(
	"qadd16 %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
#endif
static inline int32_t __qadd(int32_t a, int32_t b)
{
	int32_t y;
	__asm(
	"qadd %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
#if 1
//QSUB8 R4, R2, R5 ; Subtracts bytes of R5 from the corresponding byte in R2, saturates to 8 bits, writes to corresponding byte of R4.
static inline int32_t __qsub8(int32_t a, int32_t b)
{
	int32_t y;
	__asm(
	"qsub8 %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
//QSUB16 R4, R2, R3 ; Subtracts halfwords of R3 from corresponding halfword of R2, saturates to 16 bits, writes to corresponding halfword of R4.
static inline int32_t __qsub16(int32_t a, int32_t b)
{
	int32_t y;
	__asm(
	"qsub16 %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
#endif
static inline int32_t __qsub(int32_t a, int32_t b)
{
	int32_t y;
	__asm(
	"qsub %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//QASX R7, R4, R2 ; Adds top halfword of R4 to bottom halfword of R2,saturates to 16 bits, writes to top halfword of R7	Subtracts top highword of R2 from bottom halfword of R4, saturates to 16 bits and writes to bottom halfword of R7
static inline int32_t __qasx(int32_t a, int32_t b)
{
	int32_t y;
	__asm(
	"qasx %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}


//QSAX R0, R3, R5 ; Subtracts bottom halfword of R5 from top halfword of R3, saturates to 16 bits, writes to top halfword of R0
//				 	Adds bottom halfword of R3 to top halfword of R5, saturates to 16 bits, writes to bottom halfword of R0
static inline int32_t __qsax(int32_t a, int32_t b)
{
	int32_t y;
	__asm(
	"qsax %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
//UQASX R7, R4, R2 ; Adds top halfword of R4 with bottom halfword of R2, saturates to 16 bits, writes to top halfword of R7
//					 Subtracts top halfword of R2 from bottom halfword of R4, saturates to 16 bits, writes to bottom halfword of R7
static inline uint32_t __uqasx(uint32_t a, uint32_t b)
{
	uint32_t y;
	__asm(
	"uqasx %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//UQSAX R0, R3, R5 ; Subtracts bottom halfword of R5 from top halfword of R3, saturates to 16 bits, writes to top halfword of R0
//					 Adds bottom halfword of R4 to top halfword of R5 saturates to 16 bits, writes to bottom halfword of R0.
static inline uint32_t __uqsax(uint32_t a, uint32_t b)
{
	uint32_t y;
	__asm(
	"uqsax %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}


//QDADD R7, R4, R2 ; Doubles and saturates R4 to 32 bits, adds R2, saturates to 32 bits, writes to R7
//y=a*2+b
static inline int32_t __qdadd(int32_t a, int32_t b)
{
	int32_t y;
	__asm(
	"qdadd %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
//QDSUB R0, R3, R5 ; Subtracts R3 doubled and saturated to 32 bits from R5, saturates to 32 bits, writes to R0.
//y=b-a*2
static inline int32_t __qdsub(int32_t a, int32_t b)
{
	int32_t y;
	__asm(
	"qdsub %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//UQADD16 R7, R4, R2; Adds halfwords in R4 to corresponding halfword in R2, saturates to 16 bits, writes to corresponding halfword of R7
static inline uint32_t __uqadd16(uint32_t a, uint32_t b)
{
	uint32_t y;
	__asm(
	"uqadd16 %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}
// //UQADD8 R4, R2, R5 ; Adds bytes of R2 to corresponding byte of R5, saturates to 8 bits, writes to corresponding bytes of R4
static inline uint32_t __uqadd8(uint32_t a, uint32_t b)
{
	uint32_t y;
	__asm(
	"uqadd8 %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
//UQSUB16 R6, R3, R0; Subtracts halfwords in R0 from corresponding halfword in R3, saturates to 16 bits, writes to corresponding halfword in R6
static inline uint32_t __uqsub16(uint32_t a, uint32_t b)
{
	uint32_t y;
	__asm(
	"uqsub16 %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
//UQSUB8 R1, R5, R6; Subtracts bytes in R6 from corresponding byte of R5, saturates to 8 bits, writes to corresponding byte of R1.
static inline uint32_t __uqsub8(uint32_t a, uint32_t b)
{
	uint32_t y;
	__asm(
	"uqsub8 %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//SSAT instruction applies the specified shift, then saturates to the signed range −2^(n–1) ≤ x ≤ 2^(n–1)−1. 
//1<=n<=32
static inline int32_t __ssat_32(int32_t a)
{
	int32_t y;
	__asm(
	"ssat %0,#32,%1;\n"
		:"=r"(y)
		: "r"(a)
		);
	return y;
}

static inline int32_t __ssat_16(int32_t a)
{
	int32_t y;
	__asm(
	"ssat %0,#16,%1;\n"
		:"=r"(y)
		: "r"(a)
		);
	return y;
}

static inline int32_t __ssat_24(int32_t a)
{
    int32_t y;
    __asm(
        "ssat %0,#24,%1;\n"  // 将输入值a饱和到24位有符号整数范围
        : "=r"(y)            // 输出：结果存储到寄存器，赋值给y
        : "r"(a)             // 输入：变量a的值传入寄存器
        );
    return y;
}

#define __ssat_x(a,b) __ssat_##b(a)
#define __ssat(a,b) __ssat_x(a,b)


//USAT instruction applies the specified shift, then saturates to the unsigned range 0 ≤ x ≤ 2^n−1.
//0<=n<=31
static inline uint32_t __usat_31(uint32_t a)
{
	int32_t y;
	__asm(
	"usat %0,#31,%1;\n"
		:"=r"(y)
		: "r"(a)
		);
	return y;
}

static inline uint32_t __usat_15(uint32_t a)
{
	uint32_t y;
	__asm(
	"usat %0,#15,%1;\n"
		:"=r"(y)
		: "r"(a)
		);
	return y;
}
#define __usat_x(a,b) __usat_##b(a)
#define __usat(a,b) __usat_x(a,b)



//SSAT16 R7, #9, R2; Saturates the top and bottom highwords of R2 as 9-bit values, writes to corresponding halfword of R7.
static inline int32_t __ssat16x2_9(int32_t a)
{
	int32_t y;
	__asm(
	"ssat16 %0,#9,%1;\n"
		:"=r"(y)
		: "r"(a)
		);
	return y;
}

//USAT16 R0, #13, R5 ; Conditionally saturates the top and bottom halfwords of R5 as 13-bit values, writes to corresponding halfword of R0.
static inline uint32_t __usat16x2_13(uint32_t a)
{
	uint32_t y;
	__asm(
	"usat16 %0,#13,%1;\n"
		:"=r"(y)
		: "r"(a)
		);
	return y;
}


static inline int32_t __clz(int32_t a)
{
	int32_t y;
	__asm(
	"clz %0,%1;\n"
		:"=r"(y)
		: "r"(a)
		);
	return y;
}

//Performs two 16-bit signed integer add.
//SADD16 R1, R0; Adds the halfwords in R0 to the corresponding halfwords of R1 and writes to corresponding halfword of R1.
static inline int32_t __sadd16(int32_t a,int32_t b){
	//a0+=b0;a1+=b1
	int32_t y;
	__asm(
	"sadd16 %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}

//SADD8 R4, R0, R5; Adds bytes of R0 to the corresponding byte in R5 and writes; to the corresponding byte in R4.
static inline int32_t __sadd8(int32_t a,int32_t b){
	//a0+=b0;a1+=b1;a2+=b2;a3+=b3;
	int32_t y;
	__asm(
	"sadd8 %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}

//
//SSUB16 R1, R0 ; Subtracts halfwords in R0 from corresponding halfword of R1 and writes to corresponding halfword of R1.
//Performs two 16-bit signed integer subtractions.
static inline int32_t __ssub16(int32_t a,int32_t b){
	//a0-=b0;a1-=b1
	int32_t y;
	__asm(
	"ssub16 %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}

//SSUB8 R4, R0, R5 ; Subtracts bytes of R5 from corresponding byte in R0, and writes to corresponding byte of R4.
//Performs four 8-bit signed integer subtractions.
static inline int32_t __ssub8(int32_t a,int32_t b){
	//a0-=b0;a1-=b1;a2-=b2;a3-=b3;
	int32_t y;
	__asm(
	"ssub8 %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}
//SASX R0, R4, R5 ; Adds top halfword of R4 to bottom halfword of R5 and writes to top halfword of R0.
//					Subtracts bottom halfword of R5 from top halfword of R4 and writes to bottom halfword of R0.
static inline int32_t __sasx(int32_t a,int32_t b){
	//a0+=b0;a1-=b1
	int32_t y;
	__asm(
	"sasx %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}

//SSAX R7, R3, R2 ; Subtracts top halfword of R2 from bottom halfword of R3 and writes to bottom halfword of R7.
//					Adds top halfword of R3 with bottom halfword of R2 and writes to top halfword of R7.
static inline int32_t __ssax(int32_t a,int32_t b){
	//a0-=b0;a1+=b1
	int32_t y;
	__asm(
	"ssax %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}

//SHADD16 R1, R0 ;adds bytes of R0 to corresponding byte in R5 and writes halved result to corresponding byte in R4.
static inline int32_t __shadd16(int32_t a,int32_t b){
	//a0=(a0+b0)>>1;a1=(a1+b1)>>1;
	int32_t y;
	__asm(
	"shadd16 %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}
//SHSUB16 R1, R0 ;Subtracts bytes of R0 to corresponding byte in R5 and writes halved result to corresponding byte in R4.
static inline int32_t __shsub16(int32_t a,int32_t b){
	//a0=(a0-b0)>>1;a1=(a1-b1)>>1;
	int32_t y;
	__asm(
	"shsub16 %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}

//SHADD8 R4, R0, R5 ; Adds halfwords in R0 to corresponding halfword of R1 and writes halved result to corresponding halfword in R1.
static inline int32_t __shadd8(int32_t a,int32_t b){
	//a0=(a0+b0)>>1;a1=(a1+b1)>>1;a2=(a2+b2)>>1;a3=(a3+b3)>>1;
	int32_t y;
	__asm(
	"shadd8 %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}
//SHSUB8 R1, R0 ; Subtracts halfwords in R0 from corresponding halfword of R1 and writes halved result to corresponding halfword in R1.
static inline int32_t __shsub8(int32_t a,int32_t b){
	//a0=(a0-b0)>>1;a1=(a1-b1)>>1;a2=(a2-b2)>>1;a3=(a3-b3)>>1;
	int32_t y;
	__asm(
	"shsub8 %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}


//SHASX R7, R4, R2 ; Adds top halfword of R4 to bottom halfword of R2 and writes halved result to top halfword of R7.
// 					Subtracts top halfword of R2 from bottom halfword of R4 and writes halved result to bottom halfword of R7.
static inline int32_t __shasx(int32_t a,int32_t b){
	//a0=(a0+b0)>>1;a1=(a1-b1)>>1;
	int32_t y;
	__asm(
	"shasx %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}

//SHSAX R0, R3, R5 ; Subtracts bottom halfword of R5 from top halfword of R3 and writes halved result to top halfword of R0.
//					Adds top halfword of R5 to bottom halfword of R3 and writes halved result to bottom halfword of R0.
static inline int32_t __shsax(int32_t a,int32_t b){
	//a0=(a0-b0)>>1;a1=(a1+b1)>>1;
	int32_t y;
	__asm(
	"shsax %0,%1,%2;\n"
		:"=r"(y)
		:"r"(a),"r"(b)
		);
	return y;
}



//MLA R10, R2, R1, R5 ; Multiply with accumulate, R10 = (R2 × R1) + R5
static inline int32_t __mla(int32_t a,int32_t b,int32_t c){
	//y=c+a*b;
	int32_t y;
	__asm(
	"mla %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b), "r"(c)
		);
	return y;
}

//MLS R4, R5, R6, R7 ; Multiply with subtract, R4 = R7 - (R5 × R6)
static inline int32_t __mls(int32_t a,int32_t b,int32_t c){
	//y=c-a*b;
	int32_t y;
	__asm(
	"mls %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b), "r"(c)
		);
	return y;
}


//32*16=>32
//SMULWB R4, R5, R3 ; Multiplies R5 with the bottom halfword of R3,extracts top 32 bits and writes to R4
static inline int32_t __smulwb(int32_t a,int32_t b){
	//y=(int32_t)((int64_t)a*b>>16);
	int32_t y;
	__asm(
	"smulwb %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
///Signed Multiply Accumulate 
//16*16+32=32
//SMLABB R5, R6, R4, R1 ; Multiplies bottom halfwords of R6 and R4, adds R1 and writes to R5.
static inline int32_t __smlabb(int32_t a,int32_t b,int32_t c){
	//y=(int32_t)a*b+c;
	int32_t y;
	__asm(
	"smlabb %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//16*16+32=>32
//SMLATT R5, R6, R4, R1 ; Multiplies top halfwords of R6 and R4, adds R1 and writes the sum to R5.
static inline int32_t __smlatt(int32_t a,int32_t b,int32_t c){
	//y=(a>>16)*(b>>16)+c;
	int32_t y;
	__asm(
	"smlatt %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//SMLATB R5, R6, R4, R1 ; Multiplies top halfwords of R6 and R4, adds R1 and writes the sum to R5.
static inline int32_t __smlatb(int32_t a,int32_t b,int32_t c){
	//y=(a>>16)*b+c;
	int32_t y;
	__asm(
	"smlatb %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//SMLABT R5, R6, R4, R1 ; Multiplies top halfwords of R6 and R4, adds R1 and writes the sum to R5.
static inline int32_t __smlabt(int32_t a,int32_t b,int32_t c){
	//y=a*(b>>16)+c;
	int32_t y;
	__asm(
	"smlabt %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//SMLAWB R10, R2, R5, R3 ; Multiplies R2 with bottom halfword of R5, adds R3 to the result and writes top 32-bits to R10. 
static inline int32_t __smlawb(int32_t a,int32_t b,int32_t c){
	//y=(int32_t)(((int64_t)a*b+c)>>16);
	int32_t y;
	__asm(
	"smlawb %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//SMLAWT R10, R2, R1, R5 ; Multiplies R2 with top halfword of R1, adds R5 and writes top 32-bits to R10.
static inline int32_t __smlawt(int32_t a,int32_t b,int32_t c){
	//y=(int32_t)(((int64_t)a*(b>>16)+c)>>16);
	int32_t y;
	__asm(
	"smlawt %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//SMLAD R10, R2, R1, R5 ; Multiplies two halfword values in R2 with corresponding halfwords in R1, adds R5 and writes to R10.
static inline int32_t __smlad(int32_t a,int32_t b,int32_t c){
	//y=(a0*b0+a1*b1+c);
	int32_t y;
	__asm(
	"smlad %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//SMLADX R0, R2, R4, R6 ; Multiplies top halfword of R2 with bottom halfword of R4, multiplies bottom halfword of R2 with top
//  halfword of R4, adds R6 and writes to R0.
static inline int32_t __smladx(int32_t a,int32_t b,int32_t c){
	//y=(a0*b1+a1*b0+c);
	int32_t y;
	__asm(
	"smladx %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

///64+=16*16
//SMLALBT R2, R1, R6, R7 ;Multiplies bottom halfword of R6 with top halfword of R7, sign extends to 32-bit, adds R1:R2 and writes to R1:R2.
static inline int64_t __smlalbt(int32_t a,int32_t b, int64_t c){
	//c+=a*(b>>16);
	int32_t* y=(int32_t*)&c;
	__asm(
	"smlalbt %0,%1,%2,%3;\n"
		:"+r"(y[0]), "+r"(y[1])
		: "r"(a), "r"(b)
		);
	return c;
}

///64+=16*16
//SMLALTB R2, R1, R6, R7 ; Multiplies top halfword of R6 with bottom halfword of R7,sign extends to 32-bit, adds R1:R2 and writes to R1:R2.
static inline int64_t __smlaltb(int32_t a,int32_t b, int64_t c){
	//c+=(a>>16)*(b)+c;
	int32_t* y=(int32_t*)&c;
	__asm(
	"smlaltb %0,%1,%2,%3;\n"
		:"+r"(y[0]), "+r"(y[1])
		: "r"(a), "r"(b)
		);
	return c;
}

#define __smlald_x(a2,b2,sum0,sum1) __asm("smlald %0,%1,%2,%3;\n":"+r"(sum0), "+r"(sum1): "r"(a2), "r"(b2))
#define __smlald_(a2,b2,sum64) __asm("smlald %0,%1,%2,%3;\n":"+r"(((int*)&sum64)[0]), "+r"(((int*)&sum64)[1]): "r"(a2), "r"(b2))
//64+=16*16+16*16
//SMLALD R6, R8, R5, R1 ; Multiplies top halfwords in R5 and R1 and bottom halfwords of R5 and R1, adds R8:R6 and writes to R8:R6.
static inline int64_t __smlald(int32_t a,int32_t b, int64_t c){
	int32_t* y=(int32_t*)&c;
	__asm(
	"smlald %0,%1,%2,%3;\n"
		:"+r"(y[0]), "+r"(y[1])
		: "r"(a), "r"(b)
		);
	return c;
}

//64+=16*16+16*16
//SMLALDX R6, R8, R5, R1 ; Multiplies top halfword in R5 with bottom halfword of R1, and bottom halfword of R5 with top halfword of R1, adds R8:R6 and writes to R8:R6.
static inline int64_t __smlaldx(int32_t a,int32_t b, int64_t c){
	int32_t* y=(int32_t*)&c;
	__asm(
	"smlaldx %0,%1,%2,%3;\n"
		:"+r"(y[0]), "+r"(y[1])
		: "r"(a), "r"(b)
		);
	return c;
}


////////////////////
//sub
//SMLSD R0, R4, R5, R6 ; Multiplies bottom halfword of R4 with bottom halfword of R5, multiplies top halfword of R4 with top halfword of R5, subtracts second from
// first, adds R6, writes to R0.
static inline int32_t __smlsd(int32_t a,int32_t b,int32_t c){
	//y=(a0*b0-a1*b1+c);
	int32_t y;
	__asm(
	"smlsd %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}
//SMLSDX R1, R3, R2, R0 ; Multiplies bottom halfword of R3 with top halfword of R2, multiplies top halfword of R3 with bottom halfword of R2, subtracts second from
// first, adds R0, writes to R1.
static inline int32_t __smlsdx(int32_t a,int32_t b,int32_t c){
	//y=(a0*b1-a1*b0+c);
	int32_t y;
	__asm(
	"smlsdx %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//64+=16*16-16*16
//SMLSLD R3, R6, R2, R7 ; Multiplies bottom halfword of R6 with bottom halfword of R2, multiplies top halfword of R6 with top halfword of R2, subtracts second from
// first, adds R6:R3, writes to R6:R3.
static inline int64_t __smlsld(int32_t a, int32_t b,int64_t c){
	//c+=a0*b0-a1*b1;
	int32_t* y=(int32_t*)&c;
	__asm(
	"smlsld %0,%1,%2,%3;\n"
		:"+r"(y[0]), "+r"(y[1])
		: "r"(a), "r"(b)
		);
	return c;
}

//64+=16*16-16*16
//SMLSLDX R3, R6, R2, R7 ; Multiplies bottom halfword of R6 with top halfword of R2, multiplies top halfword of R6 with bottom halfword of R2, subtracts second from
// first, adds R6:R3, writes to R6:R3.
static inline int64_t __smlsldx(int32_t a,int32_t b,int64_t c){
	//c+=a0*b1+a0*b1;
	int32_t* y=(int32_t*)&c;
	__asm(
	"smlsldx %0,%1,%2,%3;\n"
		:"+r"(y[0]), "+r"(y[1])
		: "r"(a), "r"(b)
		);
	
	return c;
}

///(32*32>>32) +32
//SMMLA  R0, R4, R5, R6 ; Multiplies R4 and R5, extracts top 32 bits, adds R6, truncates and writes to R0.
static inline int32_t __smmla(int32_t a,int32_t b,int32_t c){
	//y=(int32_t)((int64)a*b>>32)+c;
	int32_t y;
	__asm(
	"smmla %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

///(32*32>>32) +32
//SMMLAR R6, R2, R1, R4 ; Multiplies R2 and R1, extracts top 32 bits, adds R4, rounds and writes to R6.
static inline int32_t __smmlar(int32_t a,int32_t b,int32_t c){
	//y=(int32_t)((int64)a*b>>32)+c;
	int32_t y;
	__asm(
	"smmlar %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//SMMLS  R4, R5, R3, R8 ; Multiplies R5 and R3, extracts top 32 bits, subtracts R8, truncates and writes to R4.
static inline int32_t __smmls(int32_t a,int32_t b,int32_t c){
	//y=(int32_t)((int64)a*b>>32)-c;
	int32_t y;
	__asm(
	"smmls %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//SMMLSR R3, R6, R2, R7 ; Multiplies R6 and R2, extracts top 32 bits, subtracts R7, rounds and writes to R3.
static inline int32_t __smmlsr(int32_t a,int32_t b,int32_t c){
	//y=(int32_t)((int64)a*b>>32)-c;
	int32_t y;
	__asm(
	"smmlsr %0,%1,%2,%3;\n"
		:"=r"(y)
		: "r"(a), "r"(b) , "r"(c)
		);
	return y;
}

//SMMUL R0, R4, R5 ; Multiplies R4 and R5, truncates top 32 bits and writes to R0.
static inline int32_t __smmul(int32_t a,int32_t b){
	//y=(int32_t)((int64)a*b>>32);
	int32_t y;
	__asm(
	"smmul %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//SMMULR R6, R2 ; Multiplies R6 and R2, rounds the top 32 bits and writes to R6.
static inline int32_t __smmulr(int32_t a,int32_t b){
	//y=(int32_t)((int64)a*b>>32);
	int32_t y;
	__asm(
	"smmulr %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//SMUAD R0, R4, R5 ; Multiplies bottom halfword of R4 with the bottom halfword of R5, adds multiplication of top halfword of R4 with top halfword of R5, writes to R0.
static inline int32_t __smuad(int32_t a,int32_t b){
	//y=(a0*b0+a1*b1);
	int32_t y;
	__asm(
	"smuad %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//SMUADX R3, R7, R4 ; Multiplies bottom halfword of R7 with top halfword of R4, adds multiplication of top halfword of R7 with bottom halfword of R4, writes to R3.
static inline int32_t __smuadx(int32_t a,int32_t b){
	//y=(a0*b1+a1*b0);
	int32_t y;
	__asm(
	"smuadx %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//SMUSD R3, R6, R2 ; Multiplies bottom halfword of R4 with bottom halfword of R6, subtracts multiplication of top halfword of R6 with top halfword of R3, writes to R3.
static inline int32_t __smusd(int32_t a,int32_t b){
	//y=(a0*b0+a0*b0);
	int32_t y;
	__asm(
	"smusd %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//SMUSDX R4, R5, R3; Multiplies bottom halfword of R5 with top halfword of R3, subtracts multiplication of top halfword of R5 with bottom halfword of R3, writes to R4.
static inline int32_t __smusdx(int32_t a,int32_t b){
	//y=(a0*b1-a1*b0);
	int32_t y;
	__asm(
	"smusdx %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//SMULBT R0, R4, R5 ; Multiplies the bottom halfword of R4 with the top halfword of R5, multiplies results and writes to R0.
static inline int32_t __smulbt(int32_t a,int32_t b){
	//y=(a0*b1-a1*b0);
	int32_t y;
	__asm(
	"smulbt %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

//SMULBB R0, R4, R5 ; Multiplies the bottom halfword of R4 with the bottom halfword of R5, multiplies results and writes to R0.
static inline int32_t __smulbb(int32_t a,int32_t b){
	//y=(a0*b1-a1*b0);
	int32_t y;
	__asm(
	"smulbb %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
//SMULTT R0, R4, R5 ; Multiplies the top halfword of R4 with the top halfword of R5, multiplies results and writes to R0.
static inline int32_t __smultt(int32_t a,int32_t b){
	//y=(a0*b1-a1*b0);
	int32_t y;
	__asm(
	"smultt %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
//SMULTB R0, R4, R5 ; Multiplies the top halfword of R4 with the bottom halfword of R5, multiplies results and and writes to R0.
static inline int32_t __smultb(int32_t a,int32_t b){
	//y=(a0*b1-a1*b0);
	int32_t y;
	__asm(
	"smultb %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}
//SMULWT R4, R5, R3 ; Multiplies R5 with the top halfword of R3, extracts top 32 bits and writes to R4.
static inline int32_t __smulwt(int32_t a,int32_t b){
	//y=(a0*b1-a1*b0);
	int32_t y;
	__asm(
	"smulwt %0,%1,%2;\n"
		:"=r"(y)
		: "r"(a), "r"(b)
		);
	return y;
}

// //UMULL Unsigned Multiply Long.
//UMULL R0, R4, R5, R6 ; Unsigned (R4,R0) = R5 × R6
static inline uint64_t __umull(uint32_t a,uint32_t b){
	uint64_t c = 0;
	uint32_t* y=(uint32_t*)&c;
	__asm(
	"umull %0,%1,%2,%3;\n"
		:"+r"(y[0]), "+r"(y[1])
		: "r"(a), "r"(b)
		);
	return c;
}

//UMLAL Unsigned Multiply, with Accumulate Long.
static inline uint64_t __umlal(uint32_t a,uint32_t b, uint64_t c){
	//y=(a0*b1-a1*b0);
	uint32_t* y=(uint32_t*)&c;
	__asm(
	"umlal %0,%1,%2,%3;\n"
		:"+r"(y[0]), "+r"(y[1])
		: "r"(a), "r"(b)
		);
	return c;
}
//UMAAL Unsigned Long Multiply with Accumulate Accumulate.
static inline uint64_t __umaal(uint32_t a,uint32_t b, uint32_t c, uint32_t d){
	//y=(a0*b1-a1*b0);
	// uint32_t* y=(uint32_t*)&c;
	// __asm(
	// "umaal %0,%1,%2,%3;\n"
	// 	:"+r"(y[0]), "+r"(y[1])
	// 	: "r"(a), "r"(b)
	// 	);
	uint64_t y;
	__asm(
	"umaal %0,%1,%2,%3;\n"
		:"+r"(a),"+r"(b)
		:"r"(c), "r"(d)
		);
	((uint32_t*)&y)[0]=a;
	((uint32_t*)&y)[1]=b;
	return y;
}
//SMULL Signed Multiply Long.
static inline int64_t __smull(int32_t a,int32_t b){
	//y=(a*b);
	int64_t c = 0;
	int32_t* y=(int32_t*)&c;
	__asm(
	"smull %0,%1,%2,%3;\n"
		:"+r"(y[0]), "+r"(y[1])
		: "r"(a), "r"(b)
		);
	return c;
}
//SMLAL Signed Multiply, with Accumulate Long.
//SMLAL R4, R5, R3, R8 ;Signed (R5,R4) = (R5,R4) + R3 × R8
static inline int64_t __smlal(int32_t a,int32_t b, int64_t c){
	//y=(a0*b1-a1*b0);
	int32_t* y=(int32_t*)&c;
	__asm(
	"smlal %0,%1,%2,%3;\n"
		:"+r"(y[0]), "+r"(y[1])
		: "r"(a), "r"(b)
		);
	return c;
}


//SBFX R0, R1, #20, #4 ; Extract bit 20 to bit 23 (4 bits) from R1 and sign extend to 32 bits and then write the result to R0. 
static inline int32_t __sbfx(int32_t a){
	//y=(a0*b1-a1*b0);

	int32_t y;
	__asm(
	"sbfx %0,%1,#20,#4;\n"
		:"=r"(y)
		: "r"(a)
		);
	// __asm(
	// "sbfx %0,%1,%2,%3;\n"
	// 	:"=r"(y)
	// 	: "r"(data),"r"(start),"r"(leng)
	// 	);
	return y;
}
//R0=(R1>>20) & ((1<<4)-1)
//UBFX R0, R1, #20, #4 ; Extract bit 20 to bit 23 (4 bits) from R1 and zero extend to 32 bits and then write the result to R0.
//R0=(R1>>20) & ((1<<4)-1)
static inline int32_t __ubfx(int32_t a){
	//y=(a0*b1-a1*b0);
	int32_t y;
	__asm(
	"ubfx %0,%1,#20,#4;\n"
		:"=r"(y)
		: "r"(a)
		);
	// int32_t y;
	// __asm(
	// "ubfx %0,%1,%2,%3;\n"
	// 	:"=r"(y)
	// 	: "r"(data),"r"(start),"r"(leng)
	// 	);
	return y;
}

///vfp
///a+b
static inline float __vadd(const float a, const float b) {
	//VADD{cond}.F32 Sd, Sn, Sm
	float c;
	__asm__("vadd.f32 %0, %1, %2" : "=w"(c) : "w"(a), "w"(b));
	return c;
}
///a-b
static inline float __vsub(const float a, const float b) {
	//VSUB{cond}.F32 Sd, Sn, Sm
	float c;
	__asm__("vsub.f32 %0, %1, %2" : "=w"(c) : "w"(a), "w"(b));
	return c;
}
///a*b
static inline float __vmul(const float a, const float b) {
	//VMUL{cond}.F32 Sd, Sn, Sm
	float c;
	__asm__("vmul.f32 %0, %1, %2" : "=w"(c) : "w"(a), "w"(b));
	return c;
}
///a/b
static inline float __vdiv(const float a, const float b) {
	//VDIV{cond}.F32 Sd, Sn, Sm
	float c;
	__asm__("vdiv.f32 %0, %1, %2" : "=w"(c) : "w"(a), "w"(b));
	return c;
}

static inline float __vsqrt(const float a) {
	//VSQRT{cond}.F32 Sd, Sm
	float result;
	__asm__("vsqrt.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}

static inline float __vabs(const float a) {
	//VABS{cond}.F32 Sd, Sm 
	float result;
	__asm__("vabs.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}

static inline float __vmaxnm(const float a, const float b) {
	//VMAXNM.F32 Sd, Sn, Sm
	float result;
	__asm__("vmaxnm.f32 %0, %1, %2" : "=w"(result) : "w"(a), "w"(b));
	return result;
}

static inline float __vminnm(const float a, const float b) {
	//VMINNM.F32 Sd, Sn, Sm
	float result;
	__asm__("vminnm.f32 %0, %1, %2" : "=w"(result) : "w"(a), "w"(b));
	return result;
}

///VCVT<rmode>.S32.F32 Sd, Sm
//A Round to nearest ties away.
//M Round to nearest even.
//N Round towards plus infinity.
//P Round towards minus infinity.
///A Round to nearest ties away.
static inline int __vcvta_s32(float a) {
	int result;
	__asm__("vcvta.s32.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///M Round to nearest even.
static inline int __vcvtm_s32(float a) {
	int result;
	__asm__("vcvtm.s32.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///N Round towards plus infinity.
static inline int __vcvtn_s32(float a) {
	int result;
	__asm__("vcvtn.s32.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///P Round towards minus infinity.
static inline int __vcvtp_s32(float a) {
	int result;
	__asm__("vcvtp.s32.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///Round towards Zero.
static inline int __vcvt_s32(float a) {
	int result;
	__asm__("vcvt.s32.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}

//
///A Round to nearest ties away.
static inline uint32_t __vcvta_u32(float a) {
	uint32_t result;
	__asm__("vcvta.u32.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///M Round to nearest even.
static inline uint32_t __vcvtm_u32(float a) {
	uint32_t result;
	__asm__("vcvtm.u32.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///N Round towards plus infinity.
static inline uint32_t __vcvtn_u32(float a) {
	uint32_t result;
	__asm__("vcvtn.u32.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///P Round towards minus infinity.
static inline uint32_t __vcvtp_u32(float a) {
	uint32_t result;
	__asm__("vcvtp.u32.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///Round towards Zero.
static inline uint32_t __vcvt_u32(float a) {
	uint32_t result;
	__asm__("vcvt.u32.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}

#if 0
///uses the rounding mode specified by the FPSCR
static inline int __vcvtr(float a) {
	int result;
	__asm__("vcvtr.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
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
	float result;
	__asm__("vrinta.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///N:Round to nearest even.
static inline float __vrintn(float a) {
	float result;
	__asm__("vrintn.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///P:Round towards plus infinity.
static inline float __vrintp(float a) {
	float result;
	__asm__("vrintp.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///M:Round towards minus infinity.
static inline float __vrintm(float a) {
	float result;
	__asm__("vrintm.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}
///Z:Round towards Zero.
static inline float __vrintz(float a) {
	float result;
	__asm__("vrintz.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}

//-a
static inline float __vneg(float a) {
	float result;
	__asm__("vneg.f32 %0, %1" : "=w"(result) : "w"(a));
	return result;
}

///-a*b
static inline float __vnmul(const float a, const float b) {
	//VNMUL{cond}.F32 Sd, Sn, Sm
	float c;
	__asm__("vnmul.f32 %0, %1, %2" : "=w"(c) : "w"(a), "w"(b));
	return c;
}

///sum+a*b
#define __vmla_(a,b,sum) __asm__("vmla.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b))
static inline float __vmla(const float a, const float b, float sum) {
	//VMLA{cond}.F32 Sd, Sn, Sm
	__asm__("vmla.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b));
	return sum;
}
///-sum-a*b
#define __vnmla_(a,b,sum) __asm__("vnmla.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b))
static inline float __vnmla(const float a, const float b, float sum) {
	//VNMLA{cond}.F32 Sd, Sn, Sm
	__asm__("vnmla.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b));
	return sum;
}
///sum-a*b
//#define __vmls_(a,b,sum) __asm__("vmls.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b))
#define __vmls_(a,b,sum) sum = __vmls(a,b,sum)
static inline float __vmls(const float a, const float b, float sum) {
	//VMLS{cond}.F32 Sd, Sn, Sm
	__asm__("vmls.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b));
	return sum;
}
///-sum+a*b
#define __vnmls_(a,b,sum) __asm__("vnmls.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b))
static inline float __vnmls(const float a, const float b, float sum) {
	//VNMLS{cond}.F32 Sd, Sn, Sm
	__asm__("vnmls.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b));
	return sum;
}
//sum += a*b;
#define __vfma_(a,b,sum) __asm__("vfma.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b))
static inline float __vfma(const float a, const float b, float sum) {
	//VFMA{cond}.F32 Sd, Sn, Sm
	__asm__("vfma.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b));
	return sum;
}
//sub -= a*b
//#define __vfms_(a,b,sum) __asm__("vfms.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b))
#define __vfms_(a,b,sum) sum = __vfms(a,b,sum)
static inline float __vfms(const float a, const float b, float sum) {
	//VFMS{cond}.F32 Sd, Sn, Sm
	__asm__("vfms.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b));
	return sum;
}
//sum = -(sum+a*b)
static inline float __vfnma(const float a, const float b, float sum) {
	//VFNMA{cond}.F32 Sd, Sn, Sm
	__asm__("vfnma.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b));
	return sum;
}
//sub = -(sub-a*b)
static inline float __vfnms(const float a, const float b, float sum) {
	//VFNMA{cond}.F32 Sd, Sn, Sm
	__asm__("vfnms.f32 %0, %1, %2" : "+w"(sum) : "w"(a), "w"(b));
	return sum;
}

#endif /* ARM_M33STAR_H */




