#pragma once

#ifndef EXTERNC
#ifdef __cplusplus
#define EXTERNC extern "C" 
#else
#define EXTERNC
#endif
#endif


/*! Maximum number of samples per channel that can be stored in one LC3 frame. */
#define LC3_MAX_SAMPLES 480

/*! Maximum number of bytes of one LC3 frame. */
#define LC3_MAX_BYTES 870

//#define LC3_DEC_MAX_SIZE_MONO 1024*18	//48000,10ms,32+136+18216=18384
#define LC3_DEC_MAX_SIZE_MONO 1024*22	//48000,10ms,32+272+21288=21592/22528
//#define LC3_DEC_MAX_SIZE_STEREO 1024*27	//48000,10ms,32+144+26624=26800
#define LC3_DEC_MAX_SIZE_STEREO 1024*30 //48000,10ms,32+272+29664=29968/30720

//#define LC3_ENC_MAX_SIZE_MONO 1024*16	//48000,10ms,56+136+16616=16808
#define LC3_ENC_MAX_SIZE_MONO 1024*19	//48000,10ms,40+272+18752=19064/19456
//#define LC3_ENC_MAX_SIZE_STEREO 1024*22 //48000,10ms,48+144+21808=22000
#define LC3_ENC_MAX_SIZE_STEREO 1024*25 //48000,10ms,40+272+24784=25096/25600

