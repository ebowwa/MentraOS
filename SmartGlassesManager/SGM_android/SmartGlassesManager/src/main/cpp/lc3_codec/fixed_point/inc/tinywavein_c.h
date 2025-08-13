
#ifndef __TINYWAVEIN_C_H__
#define __TINYWAVEIN_C_H__

/*#define SUPPORT_BWF*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(__i386__) || defined(_M_IX86) || defined(__x86_64__) || defined(_M_X64) || defined(__arm__) ||             \
    defined(__aarch64__)
#define __TWI_LE /* _T_iny _W_ave _I_n _L_ittle _E_ndian */
#endif

#if defined(__POWERPC__)
#define __TWI_BE /* _T_iny _W_ave _I_n _B_ig _E_ndian */
#endif

#if !defined(__TWI_LE) && !defined(__TWI_BE)
#error unknown processor
#endif

#define __TWI_SUCCESS (0)
#define __TWI_ERROR (-1)

#ifdef SUPPORT_BWF
typedef struct
{
    float loudnessVal;
    float loudnessRange;
    float maxTruePeakLevel;
    float maxMomentaryLoudnes;
    float maxShortTermLoudness;
} WAVEIN_LOUDNESSINFO;
#endif

typedef struct __tinyWaveInHandle
{
    FILE *       theFile;
    fpos_t       dataChunkPos;
    uint32_t position;
    uint32_t length;
    uint32_t bps;
#ifdef SUPPORT_BWF
    WAVEIN_LOUDNESSINFO *loudnessInfo;
#endif
} __tinyWaveInHandle, WAVEFILEIN;

typedef struct
{
    short        compressionCode;
    short        numberOfChannels;
    uint32_t sampleRate;
    uint32_t averageBytesPerSecond;
    short        blockAlign;
    short        bitsPerSample;
    /* short extraFormatBytes ; */
} SWavInfo;

#ifdef SUPPORT_BWF
typedef struct
{
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

    unsigned char codingHistory; /* ASCII: <<History coding>> */
} SBwfWav;
#endif

typedef struct
{
    char         chunkID[4];
    uint32_t chunkSize;
    /* long dataOffset ; */ /* never used */
} SChunk;

/* local wrapper, always returns correct endian */
//static size_t fread_LE(void *ptr, size_t size, size_t nmemb, FILE *stream);

#ifdef __TWI_BE
static short BigEndian16(short v);
static int32_t   BigEndian32(int32_t v);
#endif


#ifdef SUPPORT_BWF
static void ReadBWF(WAVEFILEIN *self, WAVEIN_LOUDNESSINFO **wavInLoudness)
{
    *wavInLoudness = self->loudnessInfo;
}
#endif
#if 0
static int32_t __ReadSample16(WAVEFILEIN *self, int32_t *sample)
{
    size_t cnt;
    short  v = 0;

    cnt = fread(&v, 2, 1, self->theFile);

    if (cnt != 1)
    {
        return __TWI_ERROR;
    }

    self->position += 1;

#ifdef __TWI_BE
    v = BigEndian16(v);
#endif
    *sample = v;
    return __TWI_SUCCESS;
}

static int32_t __ReadSample24(WAVEFILEIN *self, int32_t *sample)
{
    size_t cnt;
    int32_t    v = 0;

    cnt = fread(&v, 3, 1, self->theFile);

    if (cnt != 1)
    {
        return __TWI_ERROR;
    }

    self->position += 1;

#ifdef __TWI_BE
    v = BigEndian32(v);
#endif

    if (v >= 0x800000)
    {
        v |= 0xff000000;
    }

    *sample = v;

    return __TWI_SUCCESS;
}

static int32_t __ReadSample32(WAVEFILEIN *self, int32_t *sample)
{
    size_t cnt;
    int32_t    v = 0;

    cnt = fread(&v, 4, 1, self->theFile);

    if (cnt != 1)
    {
        return __TWI_ERROR;
    }

    self->position += 1;

#ifdef __TWI_BE
    v = BigEndian32(v);
#endif

    *sample = v >> 8;

    return __TWI_SUCCESS;
}

static int32_t __ReadSampleInternal(WAVEFILEIN *self, int32_t *sample, int32_t scale)
{
    int32_t err;

    if (!self)
    {
        return __TWI_ERROR;
    }

    switch (scale)
    {

    case 16: err = __ReadSample16(self, sample); break;

    case 24: err = __ReadSample24(self, sample); break;

    case 32: err = __ReadSample32(self, sample); break;

    default: err = __TWI_ERROR; break;
    }

    return err;
}

/* this function returns normalized values in the range +8388607..-8388608 */
static int32_t ReadWavInt(WAVEFILEIN *self, int32_t sampleBuffer[], uint32_t nSamplesToRead, uint32_t *nSamplesRead)
{
    uint32_t i;
    int32_t          err = __TWI_SUCCESS;
    *nSamplesRead    = 0;

    if (!sampleBuffer)
    {
        return __TWI_ERROR;
    }

    /* check if we have enough samples left, if not,
       set nSamplesToRead to number of samples left. */
    if (self->position + nSamplesToRead > self->length)
    {
        nSamplesToRead = self->length - self->position;
    }

    for (i = 0; i < nSamplesToRead; i++)
    {

        int32_t tmp;
        err = __ReadSampleInternal(self, &tmp, self->bps);
        if (err != __TWI_SUCCESS)
        {
            return err;
        }
        sampleBuffer[i] = tmp;
        *nSamplesRead += 1;
    }

    return __TWI_SUCCESS;
}
#endif

/*
static int32_t ResetWavIn(WAVEFILEIN* self)
{
  if (self) {
    if (self->theFile) {
        fsetpos(self->theFile, &self->dataChunkPos);
        self->position = 0;
    }
  }
  return __TWI_SUCCESS;
}
*/
/*------------- local subs ----------------*/
#if 0
static size_t fread_LE(void *ptr, size_t size, size_t nmemb, FILE *stream)
{
#ifdef __TWI_LE
    return fread(ptr, size, nmemb, stream);
#endif
#ifdef __TWI_BE

    unsigned char  x[sizeof(int32_t)];
    unsigned char *y = (unsigned char *)ptr;
    int32_t            i;
    int32_t            len;

    len = fread(x, size, nmemb, stream);

    for (i = 0; i < size * nmemb; i++)
    {
        *y++ = x[size * nmemb - i - 1];
    }

    return len;
#endif
}
#endif
#ifdef __TWI_BE
static short BigEndian16(short v)
{
    short a = (v & 0x0ff);
    short b = (v & 0x0ff00) >> 8;

    return a << 8 | b;
}

static int32_t BigEndian32(int32_t v)
{
    int32_t a = (v & 0x0ff);
    int32_t b = (v & 0x0ff00) >> 8;
    int32_t c = (v & 0x0ff0000) >> 16;
    int32_t d = (v & 0xff000000) >> 24;

    return a << 24 | b << 16 | c << 8 | d;
}
#endif

#endif /* __TINYWAVEIN_C_H__ */
