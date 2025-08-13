/*
 * LongTermPostfilter.cpp
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

#include "LongTermPostfilter.hpp"
#include "LongTermPostfilterCoefficients.hpp"
#include <cmath>
using namespace sneak::dec;

LongTermPostfilter::LongTermPostfilter(const Lc3Config& cfg) :
    Lc3Base(cfg),
    numMemBlocks( (_cfg.N_ms==Lc3Config::FrameDuration::d10ms) ? 2:3 ),
    x_hat_ltpf(nullptr),
    ltpf_active_prev(0),
    blockStartIndex(0),
    c_num(nullptr),
    c_den(nullptr),
    c_num_mem(nullptr),
    c_den_mem(nullptr),
    x_hat_ltpfin(nullptr),
    x_hat_mem(nullptr),
    x_hat_ltpf_mem(nullptr),
    p_int(0),
    p_fr(0),
    p_int_mem(0),
    p_fr_mem(0)
{
    x_hat_ltpfin = AllocT<float>(_cfg.NF*sizeof(float));
    x_hat_mem = AllocT<float>(_cfg.NF*numMemBlocks*sizeof(float));
    x_hat_ltpf = AllocT<float>(_cfg.NF*sizeof(float));
    x_hat_ltpf_mem = AllocT<float>(_cfg.NF*numMemBlocks*sizeof(float));

    for (uint16_t n=0; n < _cfg.NF*numMemBlocks; n++)
    {
        x_hat_mem[n] = 0.0;
        x_hat_ltpf_mem[n] = 0.0;
    }

    //SetGainParams(nbits);

    L_den = ceil(_cfg.Fs/4000.0);
    if (L_den < 4) L_den = 4;
    L_num = L_den -2;

    c_num = AllocT<float>((L_num+1)*sizeof(float));
    c_den = AllocT<float>((L_den+1)*sizeof(float));
    c_num_mem = AllocT<float>((L_num+1)*sizeof(float));
    c_den_mem = AllocT<float>((L_den+1)*sizeof(float));
}

LongTermPostfilter::~LongTermPostfilter()
{
    Free(x_hat_ltpfin);
    Free(x_hat_mem);
    Free(x_hat_ltpf);
    Free(x_hat_ltpf_mem);
    Free(c_num);
    Free(c_den);
    Free(c_num_mem);
    Free(c_den_mem);
}

LongTermPostfilter& LongTermPostfilter::operator= ( const LongTermPostfilter & src)
{
    // TODO we should assert, that NF is equal in src and *this!

    ltpf_active_prev = src.ltpf_active_prev;
    blockStartIndex  = src.blockStartIndex;
    p_int     = src.p_int;
    p_fr      = src.p_fr;
    p_int_mem = src.p_int_mem;
    p_fr_mem  = src.p_fr_mem;

    for (uint16_t k = 0; k < _cfg.NF; k++)
    {
        x_hat_ltpfin[k]      = src.x_hat_ltpfin[k];
        x_hat_mem[k]         = src.x_hat_mem[k];
        x_hat_mem[k+_cfg.NF]      = src.x_hat_mem[k+_cfg.NF];
        if (numMemBlocks>2)
        {
            x_hat_mem[k+_cfg.NF*2]    = src.x_hat_mem[k+_cfg.NF*2];
        }
        x_hat_ltpf[k]        = src.x_hat_ltpf[k];
        x_hat_ltpf_mem[k]    = src.x_hat_ltpf_mem[k];
        x_hat_ltpf_mem[k+_cfg.NF] = src.x_hat_ltpf_mem[k+_cfg.NF];
        if (numMemBlocks>2)
        {
            x_hat_ltpf_mem[k+_cfg.NF*2] = src.x_hat_ltpf_mem[k+_cfg.NF*2];
        }
    }
    for (uint8_t k = 0; k < L_num+1; k++)
    {
        c_num[k]     = src.c_num[k];
        c_num_mem[k] = src.c_num_mem[k];
    }
    for (uint8_t k = 0; k < L_den+1; k++)
    {
        c_den[k]     = src.c_den[k];
        c_den_mem[k] = src.c_den_mem[k];
    }

    return *this;
}


void LongTermPostfilter::SetGainParams(uint16_t nbits)
{
    if (nbits == _nbits)return;
    _nbits = nbits;
    uint16_t t_nbits = (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) ?
            round(nbits*10/7.5) : nbits;

    if (t_nbits < 320 + _cfg.Fs_ind*80)
    {
        gain_ltpf = 0.4;
        gain_ind = 0;
    }
    else if (t_nbits < 400 + _cfg.Fs_ind*80)
    {
        gain_ltpf = 0.35;
        gain_ind = 1;
    }
    else if (t_nbits < 480 + _cfg.Fs_ind*80)
    {
        gain_ltpf = 0.3;
        gain_ind = 2;
    }
    else if (t_nbits < 560 + _cfg.Fs_ind*80)
    {
        gain_ltpf = 0.25;
        gain_ind = 3;
    }
    else
    {
        gain_ltpf = 0;
        gain_ind = 4;  // just a guess so far!
    }
}

void LongTermPostfilter::computeFilterCoeffs(uint16_t pitch_index)
{
    uint16_t pitch_int;
    float pitch_fr;
    if (pitch_index >= 440)
    {
        pitch_int = pitch_index - 283;
        pitch_fr = 0.0;
    }
    else if (pitch_index >= 380)
    {
        pitch_int = pitch_index/2 - 63;
        pitch_fr = 2*pitch_index - 4*pitch_int - 252;
    }
    else
    {
        pitch_int = pitch_index/4 + 32;
        pitch_fr = pitch_index - 4*pitch_int + 128;
    }
    float pitch = pitch_int + pitch_fr/4;

    float pitch_fs = pitch * ( 8000* ceil(_cfg.Fs/8000.0) / 12800.0);
    uint16_t p_up = (pitch_fs*4) + 0.5;

    // update index parameters for current frame
    p_int = p_up / 4;
    p_fr  = p_up - 4*p_int;

    const float* tab_ltpf_num_fs = tab_ltpf_num_8000[ gain_ind ]; // default to avoid warnings
    const float* tab_ltpf_den_fs = tab_ltpf_den_8000[ p_fr ]; // default to avoid warnings
    switch(_cfg.Fs)
    {
        case 8000:
            tab_ltpf_num_fs = tab_ltpf_num_8000[ gain_ind ];
            tab_ltpf_den_fs = tab_ltpf_den_8000[ p_fr ];
            break;
        case 16000:
            tab_ltpf_num_fs = tab_ltpf_num_16000[ gain_ind ];
            tab_ltpf_den_fs = tab_ltpf_den_16000[ p_fr ];
            break;
        case 24000:
            tab_ltpf_num_fs = tab_ltpf_num_24000[ gain_ind ];
            tab_ltpf_den_fs = tab_ltpf_den_24000[ p_fr ];
            break;
        case 32000:
            tab_ltpf_num_fs = tab_ltpf_num_32000[ gain_ind ];
            tab_ltpf_den_fs = tab_ltpf_den_32000[ p_fr ];
            break;
        case 44100:
        case 48000:
            tab_ltpf_num_fs = tab_ltpf_num_48000[ gain_ind ];
            tab_ltpf_den_fs = tab_ltpf_den_48000[ p_fr ];
            break;
    }

    for (uint8_t k=0; k <= L_num; k++)
    {
        c_num[k] = 0.85 * gain_ltpf * tab_ltpf_num_fs[ k ];
    }
    for (uint8_t k=0; k <= L_den; k++)
    {
        c_den[k] = gain_ltpf * tab_ltpf_den_fs[ k ];
    }
}

/*void LongTermPostfilter::setInputX(const float* const x_hat)
{
    for (uint16_t n=0; n<_cfg.NF; n++)
    {
        x_hat_ltpfin[n] = x_hat[n];
    }
}*/


float* LongTermPostfilter::run(int16_t ltpf_active, int16_t pitch_index){
    dbgCodecCp();
    // further register updates (maybe move to explicit registerUpdate method)
    p_int_mem = p_int;
    p_fr_mem  = p_fr;
    for (uint8_t k=0; k <= L_num; k++)
    {
        c_num_mem[k] = c_num[ k ];
    }
    for (uint8_t k=0; k <= L_den; k++)
    {
        c_den_mem[k] = c_den[ k ];
    }

    // compute new coefficients
    if (1==ltpf_active)
    {
        computeFilterCoeffs(pitch_index);
    }
    else
    {
        p_int = 0;
        p_fr  = 0;
        for (uint8_t k=0; k <= L_num; k++)
        {
            c_num[k] = 0;
        }
        for (uint8_t k=0; k <= L_den; k++)
        {
            c_den[k] = 0;
        }
    }

    // start processing of input signal
    for (uint16_t n=0; n<_cfg.NF; n++)
    {
        x_hat_mem[blockStartIndex+n] = x_hat_ltpfin[n];
    }
    float norm = (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? _cfg.NF/4 : _cfg.NF/3;
    uint16_t sample2p5ms = (_cfg.Fs==44100) ? 48000/400 : _cfg.Fs/400;

    if ( (0==ltpf_active) && (0==ltpf_active_prev))
    {
        //*** transition case 1 **********************************************
        for (uint16_t n=0; n<_cfg.NF; n++)
        {
            x_hat_ltpf_mem[blockStartIndex+n] = x_hat_mem[blockStartIndex+n];
        }
    }
    else if ( (1==ltpf_active) && (0==ltpf_active_prev) )
    {
        //*** transition case 2 **********************************************
        for (uint16_t n=0; n < sample2p5ms; n++)
        {
            x_hat_ltpf_mem[blockStartIndex+n] = x_hat_mem[blockStartIndex+n];
            float filtOut = 0.0;
            for (uint16_t k=0; k <= L_num; k++)
            {
                int16_t x_hat_index = blockStartIndex + n - k;
                if (x_hat_index < 0)
                {
                    x_hat_index += numMemBlocks*_cfg.NF;
                }
                filtOut += c_num[k] * x_hat_mem[x_hat_index];
            }
            for (uint16_t k=0; k <= L_den; k++)
            {
                int16_t x_hat_ltpf_index = blockStartIndex + n - p_int + L_den/2 - k;
                if (x_hat_ltpf_index < 0)
                {
                    x_hat_ltpf_index += numMemBlocks*_cfg.NF;
                }
                filtOut -= c_den[k] * x_hat_ltpf_mem[x_hat_ltpf_index];
            }
            filtOut *= n / norm;
            x_hat_ltpf_mem[blockStartIndex+n] -= filtOut;
        }

        for (uint16_t n=sample2p5ms; n < _cfg.NF; n++)
        {
            x_hat_ltpf_mem[blockStartIndex+n] = x_hat_mem[blockStartIndex+n];
            float filtOut = 0.0;
            for (uint16_t k=0; k <= L_num; k++)
            {
                int16_t x_hat_index = blockStartIndex + n - k;
                if (x_hat_index < 0)
                {
                    x_hat_index += numMemBlocks*_cfg.NF;
                }
                filtOut += c_num[k] * x_hat_mem[x_hat_index];
            }
            for (uint16_t k=0; k <= L_den; k++)
            {
                int16_t x_hat_ltpf_index = blockStartIndex + n - p_int + L_den/2.0 - k;
                if (x_hat_ltpf_index < 0)
                {
                    x_hat_ltpf_index += numMemBlocks*_cfg.NF;
                }
                filtOut -= c_den[k] * x_hat_ltpf_mem[x_hat_ltpf_index];
            }
            x_hat_ltpf_mem[blockStartIndex+n] -= filtOut;
        }

    }
    else if ( (0==ltpf_active) && (1==ltpf_active_prev) )
    {
        //*** transition case 3 **********************************************
        for (uint16_t n=0; n < sample2p5ms; n++)
        {
            x_hat_ltpf_mem[blockStartIndex+n] = x_hat_mem[blockStartIndex+n];
            float filtOut = 0.0;
            for (uint16_t k=0; k <= L_num; k++)
            {
                int16_t x_hat_index = blockStartIndex + n - k;
                if (x_hat_index < 0)
                {
                    x_hat_index += numMemBlocks*_cfg.NF;
                }
                filtOut += c_num_mem[k] * x_hat_mem[x_hat_index];
            }
            for (uint16_t k=0; k <= L_den; k++)
            {
                int16_t x_hat_ltpf_index = blockStartIndex + n - p_int_mem + L_den/2 - k;
                if (x_hat_ltpf_index < 0)
                {
                    x_hat_ltpf_index += numMemBlocks*_cfg.NF;
                }
                filtOut -= c_den_mem[k] * x_hat_ltpf_mem[x_hat_ltpf_index];
            }
            filtOut *= 1 - (n / norm);
            x_hat_ltpf_mem[blockStartIndex+n] -= filtOut;
        }

        for (uint16_t n=sample2p5ms; n < _cfg.NF; n++)
        {
            x_hat_ltpf_mem[blockStartIndex+n] = x_hat_mem[blockStartIndex+n];
        }

    }
    else
    {
        if ( (p_int == p_int_mem) && (p_fr == p_fr_mem) )
        {
            //*** transition case 4 **********************************************
            for (uint16_t n=0; n < _cfg.NF; n++)
            {
                x_hat_ltpf_mem[blockStartIndex+n] = x_hat_mem[blockStartIndex+n];
                float filtOut = 0.0;
                for (uint16_t k=0; k <= L_num; k++)
                {
                    int16_t x_hat_index = blockStartIndex + n - k;
                    if (x_hat_index < 0)
                    {
                        x_hat_index += numMemBlocks*_cfg.NF;
                    }
                    filtOut += c_num[k] * x_hat_mem[x_hat_index];
                }
                for (uint16_t k=0; k <= L_den; k++)
                {
                    int16_t x_hat_ltpf_index = blockStartIndex + n - p_int + L_den/2 - k;
                    if (x_hat_ltpf_index < 0)
                    {
                        x_hat_ltpf_index += numMemBlocks*_cfg.NF;
                    }
                    filtOut -= c_den[k] * x_hat_ltpf_mem[x_hat_ltpf_index];
                }
                x_hat_ltpf_mem[blockStartIndex+n] -= filtOut;
            }

        }
        else
        {
            //*** transition case 5 **********************************************
            for (uint16_t n=0; n < sample2p5ms; n++)
            {
                x_hat_ltpf_mem[blockStartIndex+n] = x_hat_mem[blockStartIndex+n];
                float filtOut = 0.0;
                for (uint16_t k=0; k <= L_num; k++)
                {
                    int16_t x_hat_index = blockStartIndex + n - k;
                    if (x_hat_index < 0)
                    {
                        x_hat_index += numMemBlocks*_cfg.NF;
                    }
                    filtOut += c_num_mem[k] * x_hat_mem[x_hat_index];
                }
                for (uint16_t k=0; k <= L_den; k++)
                {
                    int16_t x_hat_ltpf_index = blockStartIndex + n - p_int_mem + L_den/2 - k;
                    if (x_hat_ltpf_index < 0)
                    {
                        x_hat_ltpf_index += numMemBlocks*_cfg.NF;
                    }
                    filtOut -= c_den_mem[k] * x_hat_ltpf_mem[x_hat_ltpf_index];
                }
                filtOut *= 1- (n / norm);
                x_hat_ltpf_mem[blockStartIndex+n] -= filtOut;
            }

            //float x_hat_ltpf_temp[numMemBlocks*_cfg.NF];  // is it good to place such a buffer on the stack?
            float* x_hat_ltpf_temp = (float*)alloca(numMemBlocks * _cfg.NF * sizeof(float));
            for (int16_t m= -L_num; m < norm; m++)
            {
                int16_t idx = blockStartIndex + m;
                if (idx < 0)
                {
                    idx += numMemBlocks*_cfg.NF;
                }
                x_hat_ltpf_temp[idx] = x_hat_ltpf_mem[idx];
            }

            for (uint16_t n=0; n < sample2p5ms; n++)
            {
                x_hat_ltpf_mem[blockStartIndex+n] = x_hat_ltpf_temp[blockStartIndex+n];
                float filtOut = 0.0;
                for (uint16_t k=0; k <= L_num; k++)
                {
                    int16_t x_hat_index = blockStartIndex + n - k;
                    if (x_hat_index < 0)
                    {
                        x_hat_index += numMemBlocks*_cfg.NF;
                    }
                    filtOut += c_num[k] * x_hat_ltpf_temp[x_hat_index];
                }
                for (uint16_t k=0; k <= L_den; k++)
                {
                    int16_t x_hat_ltpf_index = blockStartIndex + n - p_int + L_den/2 - k;
                    if (x_hat_ltpf_index < 0)
                    {
                        x_hat_ltpf_index += numMemBlocks*_cfg.NF;
                    }
                    filtOut -= c_den[k] * x_hat_ltpf_mem[x_hat_ltpf_index];
                }
                filtOut *= (n / norm);
                x_hat_ltpf_mem[blockStartIndex+n] -= filtOut;

            }

            for (uint16_t n=sample2p5ms; n < _cfg.NF; n++)
            {
                x_hat_ltpf_mem[blockStartIndex+n] = x_hat_mem[blockStartIndex+n];
                float filtOut = 0.0;
                for (uint16_t k=0; k <= L_num; k++)
                {
                    int16_t x_hat_index = blockStartIndex + n - k;
                    if (x_hat_index < 0)
                    {
                        x_hat_index += numMemBlocks*_cfg.NF;
                    }
                    filtOut += c_num[k] * x_hat_mem[x_hat_index];
                }
                for (uint16_t k=0; k <= L_den; k++)
                {
                    int16_t x_hat_ltpf_index = blockStartIndex + n - p_int + L_den/2.0 - k;
                    if (x_hat_ltpf_index < 0)
                    {
                        x_hat_ltpf_index += numMemBlocks*_cfg.NF;
                    }
                    filtOut -= c_den[k] * x_hat_ltpf_mem[x_hat_ltpf_index];
                }
                x_hat_ltpf_mem[blockStartIndex+n] -= filtOut;
            }
        }
    }

    // copy to output x_hat_ltpf
    for (uint16_t n=0; n < _cfg.NF; n++)
    {
        x_hat_ltpf[n] = x_hat_ltpf_mem[blockStartIndex+n];
    }

    // increment current block in block-ringbuffer
    blockStartIndex += _cfg.NF;
    if (blockStartIndex > (numMemBlocks-1)*_cfg.NF)
    {
        blockStartIndex = 0;
    }

    // register updates
    ltpf_active_prev = ltpf_active;
    //
    return x_hat_ltpf;
}

void LongTermPostfilter::registerDatapoints()
{    
    {
        //_cfg.addDatapoint( "x_hat_ltpfin", x_hat_ltpfin, sizeof(float)*_cfg.NF );
        //_cfg.addDatapoint( "x_hat_ltpf", x_hat_ltpf, sizeof(float)*_cfg.NF );
        //_cfg.addDatapoint( "x_hat_ltpf_mem", x_hat_ltpf_mem, sizeof(float)*_cfg.NF*numMemBlocks );
        //_cfg.addDatapoint( "x_hat_mem", x_hat_mem, sizeof(float)*_cfg.NF*numMemBlocks );
        //_cfg.addDatapoint( "c_num", c_num, sizeof(float)*(L_num+1) );
        //_cfg.addDatapoint( "c_den", c_den, sizeof(float)*(L_den+1) );
        //_cfg.addDatapoint( "c_num_mem", c_num_mem, sizeof(float)*(L_num+1) );
        //_cfg.addDatapoint( "c_den_mem", c_den_mem, sizeof(float)*(L_den+1) );
        //_cfg.addDatapoint( "p_int", &p_int, sizeof(p_int) );
    }
}


