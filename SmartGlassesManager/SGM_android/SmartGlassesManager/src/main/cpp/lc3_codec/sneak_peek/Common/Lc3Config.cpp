/*
 * Lc3Config.cpp
 *
 * Copyright 2019 HIMSA II K/S - www.himsa.com. Represented by EHIMA - www.ehima.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "Lc3Config.hpp"
#include "BandIndexTables.hpp"
#include "MdctWindows.hpp"
#include <cmath>
#include <memory.h>

using namespace sneak;
bool Lc3Config::Inititalize(uint32_t Fs_, FrameDuration N_ms_, uint8_t Nc_, bool interlace){
    errorStatus = ERROR_FREE;
    Fs = Fs_;
    Fs_ind = getFs_ind(Fs);
    N_ms = N_ms_;
    NF = getNF(Fs, N_ms_);
    NE = getNE(NF, N_ms_);
    Z = getZ(NF, N_ms_);
    Nc = Nc_;
    N_b = getNB(Fs_ind, N_ms_);
	isInterlace = interlace;
    if (0==Nc) // we do not restrict the maximum yet (naturally limited to 255 because of the chosen datatype)
    {
        errorStatus |= INVALID_NUMBER_OF_CHANNELS;
        return false;
    }
    //runtime
    _runtime_temp32 = 0;
    memset(_runtime, 0, sizeof(_runtime));
    //
    I_fs_get(Fs_ind, (int)N_ms, _I_fs);
    auto mdct_size = lc3MdctWinGetSize(Fs_ind, (int)N_ms);
    _mdct_win = (float*)Alloc(mdct_size);
    lc3MdctWinGet(Fs_ind, (int)N_ms, _mdct_win);
    return true;
}

Lc3Config::~Lc3Config()
{
    Free((void*&)_mdct_win);
}

bool Lc3Config::isValid() const
{
    return ERROR_FREE == errorStatus;
}

uint8_t Lc3Config::getErrorStatus() const
{
    return errorStatus;
}

uint8_t Lc3Config::getFs_ind(uint16_t Fs)
{
    uint8_t fs_ind=0;
    switch(Fs)
    {
        case  8000: fs_ind=0; break;
        case 16000: fs_ind=1; break;
        case 24000: fs_ind=2; break;
        case 32000: fs_ind=3; break;
        case 44100: fs_ind=4; break;
        case 48000: fs_ind=4; break;
        default:
            errorStatus |= INVALID_SAMPLING_RATE;break;
    }
    return fs_ind;
}


uint16_t Lc3Config::getNF(uint16_t Fs, FrameDuration N_ms)
{
    uint16_t NF = 80;
    if (FrameDuration::d10ms == N_ms)
    {
        switch(Fs)
        {
            case  8000: NF=80; break;
            case 16000: NF=160; break;
            case 24000: NF=240; break;
            case 32000: NF=320; break;
            case 44100: NF=480; break;
            case 48000: NF=480; break;
            default :
                errorStatus |= INVALID_SAMPLING_RATE;break;
        }
    }
    else if (FrameDuration::d7p5ms == N_ms)
    {
        switch(Fs)
        {
            case  8000: NF=60; break;
            case 16000: NF=120; break;
            case 24000: NF=180; break;
            case 32000: NF=240; break;
            case 44100: NF=360; break;
            case 48000: NF=360; break;
            default :
                errorStatus |= INVALID_SAMPLING_RATE;break;
        }
    }
    else if (FrameDuration::d5ms == N_ms)
    {
        switch(Fs)
        {
            case  8000: NF=40; break;
            case 16000: NF=80; break;
            case 24000: NF=120; break;
            case 32000: NF=160; break;
            case 44100: NF=240; break;
            case 48000: NF=240; break;
            default :
                errorStatus |= INVALID_SAMPLING_RATE;break;
        }
    }
    else if (FrameDuration::d2p5ms == N_ms)
    {
        switch(Fs)
        {
            case  8000: NF=20; break;
            case 16000: NF=40; break;
            case 24000: NF=60; break;
            case 32000: NF=80; break;
            case 44100: NF=120; break;
            case 48000: NF=120; break;
            default :
                errorStatus |= INVALID_SAMPLING_RATE;break;
        }
    }
    else
    {
        // We never should reach this line unless
        // strange things happen. However, we want
        // to be on the safe side and thus handle
        // this case explicitly.
        errorStatus |= INVALID_FRAME_DURATION;
    }
    return NF;
}

uint16_t Lc3Config::getNE(uint16_t NF, FrameDuration N_ms)
{
    //3.3.4.3 Time-Frequency Transformation (d09r04_*implementorComments*)
    if (FrameDuration::d10ms == N_ms)
    {
        return (480==NF) ? 400:NF;
    }
    else if (FrameDuration::d7p5ms == N_ms)
    {
        return (360==NF) ? 300:NF;
    }
    else if (FrameDuration::d5ms == N_ms)
    {
        return (240==NF) ? 200:NF;
    }
    else if (FrameDuration::d2p5ms == N_ms)
    {
        return (120==NF) ? 100:NF;
    }
    return 0;
}

uint16_t Lc3Config::getZ(uint16_t NF, FrameDuration N_ms)
{
    if (FrameDuration::d10ms == N_ms)
    {
        return 3 * NF / 8;
    }
    else if (FrameDuration::d7p5ms == N_ms)
    {
        return 7 * NF / 30;
    }
    else if (FrameDuration::d5ms == N_ms)
    {
        return NF / 4;
    }
    else if (FrameDuration::d2p5ms == N_ms)
    {
        return 0;
    }
    return 0;
}

uint8_t Lc3Config::getNB(uint8_t Fs_ind, FrameDuration N_ms)
{
    if (FrameDuration::d10ms == N_ms)
    {
        return 64;
    }
    else if (FrameDuration::d7p5ms == N_ms)
    {
        if (Fs_ind == 0) {
            return 60;
        }else{
            return 64;
        }
    }
    else if (FrameDuration::d5ms == N_ms)
    {
        if (Fs_ind == 0) {
            return 39;
        }else if(Fs_ind == 1){
            return 50;
        }else if(Fs_ind == 2){
            return 52;
        }else if(Fs_ind == 3){
            return 54;
        }else if(Fs_ind == 4){
            return 55;
        }
    }
    else if (FrameDuration::d2p5ms == N_ms)
    {
        if (Fs_ind == 0) {
            return 20;
        }
        else if (Fs_ind == 1) {
            return 35;
        }
        else if (Fs_ind == 2) {
            return 40;
        }
        else if (Fs_ind == 3) {
            return 43;
        }
        else if (Fs_ind == 4) {
            return 44;
        }
    }
    return 0;
}

uint16_t Lc3Config::getByteCountFromBitrate(uint32_t bitrate) const
{
    // Section 3.2.5 Bit budget and bitrate (LC3_Specification_d09r06)
    double f_scal = getFscal();
    double N_ms_value = getNmsValue();
    return floor( (bitrate * N_ms_value  * f_scal)/8000.0 );
}

uint32_t Lc3Config::getBitrateFromByteCount(uint16_t nbytes) const
{
    // Section 3.2.5 Bit budget and bitrate (LC3_Specification_d1.0r03)
    // Notes:
    //  - this implementation includes Errata 15051
    //  - this utility function is not used within the LC3 code so far, but
    //    provided here for completeness
    double f_scal = getFscal();
    double N_ms_value = getNmsValue();
    return ceil(  (8000.0 * nbytes) /  (N_ms_value  * f_scal) );
}

float Lc3Config::getFscal() const
{
    // Section 3.2.2 Sampling rates (LC3_Specification_d1.0r03)
    return (44100==Fs)? 48000.0/44100.0 : 1.0;
}

float Lc3Config::getNmsValue() const
{
    //return (FrameDuration::d10ms == N_ms) ? 10.0 : 7.5;
    if (FrameDuration::d10ms == N_ms) {
        return 10.0;
    }else if(FrameDuration::d7p5ms == N_ms){
        return 7.5;
    }else if(FrameDuration::d5ms == N_ms){
        return 5;
    }else{
        return 2.5;
    }
}

void Lc3Config::SetInterlace(bool en) const {
    ((Lc3Config*)this)->isInterlace = en;
}

void* Lc3Config::Alloc(int size)const {
    return 0;
}
void Lc3Config::Free(void*& ptr) const{
    ptr = 0;
}
int Lc3Config::GetMemUsed() const {
    return 0;
}
int Lc3Config::GetMemUsedMax() const {
    return 0;
}

//void Lc3Config::addDatapoint(const char* label, const void* pData, uint16_t sizeInBytes) const{
//
//}
//void Lc3Config::log(const char* label, const void* pData, uint16_t sizeInBytes)const {
//
//}
int Lc3Config::print(int ch, const char* str, ...)const {
    return 0;
}
#ifndef WIN32
void* operator new(size_t size,void*buff) noexcept{
	return buff;
}
#endif
