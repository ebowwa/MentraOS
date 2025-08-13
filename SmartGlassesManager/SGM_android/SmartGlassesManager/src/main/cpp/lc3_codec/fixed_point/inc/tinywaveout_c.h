

#ifndef __TINYWAVEOUT_C_H__
#define __TINYWAVEOUT_C_H__

#include <stdio.h>

/*#define SUPPORT_BWF*/

#ifdef SUPPORT_BWF
#include <string.h>
#endif

#if defined(__i386__) || defined(_M_IX86) || defined(_M_X64) || defined(__x86_64__) || defined(__arm__) ||             \
    defined(__aarch64__)
#define __TWO_LE /* _T_iny _W_ave _O_ut _L_ittle _E_ndian */
#endif

#if defined(__POWERPC__)
#define __TWO_BE /* _T_iny _W_ave _O_ut _B_ig _E_ndian */
#endif

#if defined(__sparc__)
#define __TWO_BE /* _T_iny _W_ave _O_ut _B_ig _E_ndian */
#endif

#if !defined(__TWO_LE) && !defined(__TWO_BE)
#error unknown processor
#endif

#define __TWO_SUCCESS (0)
#define __TWO_ERROR (-1)

/*--- local types/structs ----------------------------------*/

#if defined(_MSC_VER)
#pragma pack(push, 1)
#else
#pragma pack(1)
#endif

#ifndef TW_INT64
#if !(defined(WIN32))
#define TWO_INT64 long long
#else
#define TWO_INT64 __int64
#endif
#endif

#ifdef SUPPORT_BWF
typedef struct
{
    float loudnessVal;
    float loudnessRange;
    float maxTruePeakLevel;
    float maxMomentaryLoudnes;
    float maxShortTermLoudness;
} LOUDNESSINFO;
#else
typedef void LOUDNESSINFO;
#endif

typedef struct __tinyWaveOutHeader
{
    uint32_t riffType;
    uint32_t riffSize;

    uint32_t waveType;
} __tinyWaveOutHeader;

#ifdef SUPPORT_BWF
typedef struct __tinyWaveOutBextChunk
{
    uint32_t formatType; /* = 'bext' */
    uint32_t formatSize; /* size info */

    unsigned char  description[256];
    unsigned char  originator[32];
    unsigned char  originatorReference[32];
    unsigned char  originatorDate[10]; /* ASCII: <<yyyy:mm:dd>> */
    unsigned char  originationTime[8]; /* ASCII: <<hh:mm:ss>> */
    uint32_t   timeReferenceLow;
    uint32_t   timeReferenceHigh;
    unsigned short version;
    unsigned char  UMID[64]; /* Binary Bytes of SMPTE UMID */

    signed short loudnessVal;
    signed short loudnessRange;
    signed short maxTruePeakLevel;
    signed short maxMomentaryLoudnes;
    signed short maxShortTermLoudness;

    unsigned char Reserved[180];

    unsigned char codingHistory; /* ASCII: <<History coding>> - undefined length! */
                                 /* for variable length, mve this out of this struct */
} __tinyWaveOutBextChunk;
#endif

typedef struct __tinyWaveOutFmtChunk
{
    uint32_t formatType;
    uint32_t formatSize;

    unsigned short formatTag;
    unsigned short numChannels;
    uint32_t   sampleRate;
    uint32_t   bytesPerSecond;
    unsigned short blockAlignment;
    unsigned short bitsPerSample;

    /* wav fmt ext hdr here */
} __tinyWaveOutFmtChunk;

typedef struct __tinyWaveOutDataChunk
{
    uint32_t dataType;
    uint32_t dataSize;

} __tinyWaveOutDataChunk;

typedef struct __tinyWaveOutHandle
{
    FILE *       theFile;
    uint32_t dataSize;
    TWO_INT64    dataSizeLimit;
    uint32_t fmtChunkOffset;
#ifdef SUPPORT_BWF
    uint32_t bextChunkOffset;
#endif
    uint32_t dataChunkOffset;
    uint32_t bps;
    uint32_t clipCount;
} __tinyWaveOutHandle, WAVEFILEOUT;

/*--- local protos --------------------------------------------------*/
static __inline uint32_t BigEndian32(char, char, char, char);
static __inline uint32_t LittleEndian32(uint32_t);
static __inline uint32_t LittleEndian32s(int32_t);
static __inline short        LittleEndian16(short);
#ifdef SUPPORT_BWF
static uint32_t EncodeLoudness(float);
#endif
static __inline int32_t __dataSizeChk(WAVEFILEOUT *self, int32_t newbytes);

#if defined(_MSC_VER)
#pragma pack(pop)
#else
#pragma pack()
#endif

#ifdef SUPPORT_BWF
static void setDefaultLoudness(LOUDNESSINFO *x)
{
    x->loudnessVal          = 1.0f;
    x->loudnessRange        = 2.0f;
    x->maxTruePeakLevel     = 3.0f;
    x->maxMomentaryLoudnes  = 4.0f;
    x->maxShortTermLoudness = 5.0f;
}
#endif

#define MAX_PCM16 (+32767)
#define MIN_PCM16 (-32768)
static __inline int32_t CLIP_PCM16(int32_t sample, uint32_t *clipcount)
{
    int32_t tmp = sample;

    if (sample >= MAX_PCM16)
    {
        tmp = MAX_PCM16;
        (*clipcount)++;
    }
    else
    {
        if (sample <= MIN_PCM16)
        {
            tmp = MIN_PCM16;
            (*clipcount)++;
        }
    }

    return tmp;
}

#define MAX_PCM24 (+8388607)
#define MIN_PCM24 (-8388608)
static __inline int32_t CLIP_PCM24(int32_t sample, uint32_t *clipcount)
{
    int32_t tmp = sample;

    if (sample >= MAX_PCM24)
    {
        tmp = MAX_PCM24;
        (*clipcount)++;
    }
    else
    {
        if (sample <= MIN_PCM24)
        {
            tmp = MIN_PCM24;
            (*clipcount)++;
        }
    }

    return tmp;
}

#define MAX_FLOAT32 (+1.0f)
#define MIN_FLOAT32 (-1.0f)
static __inline float CLIP_FLOAT32(float sample, uint32_t *clipcount)
{
    float tmp = sample;

    if (sample >= MAX_FLOAT32)
    {
        tmp = MAX_FLOAT32;
        (*clipcount)++;
    }
    else
    {
        if (sample <= MIN_FLOAT32)
        {
            tmp = MIN_FLOAT32;
            (*clipcount)++;
        }
    }

    return tmp;
}

/* this function expects normalized values in the range +-1.0 */
#define MAX_FL (+2.0f * 8388608.0f)
#define MIN_FL (-2.0f * 8388608.0f)
#define CLIP_FL(x) (((x) >= MAX_FL) ? MAX_FL : (((x) <= MIN_FL) ? MIN_FL : (x)))
/* static int32_t WriteWavFloat(
                         WAVEFILEOUT* self,
                         float        sampleBuffer[],
                         uint32_t nSamples
                         )
{
  uint32_t i;
  int32_t err = __TWO_SUCCESS;

  if (!self)         return __TWO_ERROR;
  if (!sampleBuffer) return __TWO_ERROR;
  if (__dataSizeChk(self, nSamples * sizeof(float))) return __TWO_ERROR;

  for (i=0; i<nSamples; i++) {
    if(self->bps == 32)
    {
      err = __WriteSample32(self, sampleBuffer[i]);
    }
    else
    {
      float tmp = CLIP_FL(sampleBuffer[i] * 8388608.0f);
      err = __WriteSampleInt(self, (int32_t) tmp, 24);
    }
    if (err != __TWO_SUCCESS) return err;
  }

  return __TWO_SUCCESS;
}
*/



#ifdef SUPPORT_BWF
static int32_t CloseBWF(WAVEFILEOUT *self, LOUDNESSINFO bextData)
{
    int32_t wordData;

    if (!self)
        return __TWO_ERROR;

    if (self->bextChunkOffset)
    {
        /* Offset for Loudness Data in bext-chunk: 8: Chunck-Header, 412:prev.Data */
        fseek(self->theFile, self->bextChunkOffset + 8 + 412, SEEK_SET);

        wordData = LittleEndian32(EncodeLoudness(bextData.loudnessVal));
        fwrite(&wordData, 2, 1, self->theFile);

        wordData = LittleEndian32(EncodeLoudness(bextData.loudnessRange));
        fwrite(&wordData, 2, 1, self->theFile);

        wordData = LittleEndian32(EncodeLoudness(bextData.maxTruePeakLevel));
        fwrite(&wordData, 2, 1, self->theFile);

        wordData = LittleEndian32(EncodeLoudness(bextData.maxMomentaryLoudnes));
        fwrite(&wordData, 2, 1, self->theFile);

        wordData = LittleEndian32(EncodeLoudness(bextData.maxShortTermLoudness));
        fwrite(&wordData, 2, 1, self->theFile);
    }

    return CloseWav(self);
}
#endif

/*------------- local subs ----------------*/


static __inline uint32_t BigEndian32(char a, char b, char c, char d)
{
#ifdef __TWO_LE
    return (uint32_t)d << 24 | (uint32_t)c << 16 | (uint32_t)b << 8 | (uint32_t)a;
#else
    return (uint32_t)a << 24 | (uint32_t)b << 16 | (uint32_t)c << 8 | (uint32_t)d;
#endif
}

static __inline uint32_t LittleEndian32(uint32_t v)
{
#ifdef __TWO_LE
    return v;
#else
    return (v & 0x000000FF) << 24 | (v & 0x0000FF00) << 8 | (v & 0x00FF0000) >> 8 | (v & 0xFF000000) >> 24;
#endif
}

/* signed version of the above */
static __inline uint32_t LittleEndian32s(int32_t v)
{
#ifdef __TWO_LE
    return v;
#else
    return (v & 0x000000FF) << 24 | (v & 0x0000FF00) << 8 | (v & 0x00FF0000) >> 8 | (v & 0xFF000000) >> 24;
#endif
}

static __inline short LittleEndian16(short v)
{
#ifdef __TWO_LE
    return v;
#else
    return ((v << 8) & 0xFF00) | ((v >> 8) & 0x00FF);
#endif
}

#ifdef SUPPORT_BWF
static uint32_t EncodeLoudness(float x)
{
    int32_t s = (x > 0) - (x < 0);
    return (int32_t)(x * 100.0f + s * 0.5f);
}
#endif

static __inline int32_t __dataSizeChk(WAVEFILEOUT *self, int32_t newbytes)
{
    if (!self)
        return __TWO_ERROR;

    if ((((TWO_INT64)self->dataSize) + ((TWO_INT64)newbytes)) > self->dataSizeLimit)
    {
        return __TWO_ERROR;
    }

    return __TWO_SUCCESS;
}

#endif /* __TINYWAVEOUT_C_H__ */
