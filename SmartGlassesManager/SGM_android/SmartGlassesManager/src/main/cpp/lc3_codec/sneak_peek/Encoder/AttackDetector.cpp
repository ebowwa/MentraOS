/*
 * AttackDetector.cpp
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

#include "AttackDetector.hpp"
#include <cmath>
#include <malloc.h>
using namespace sneak::enc;

AttackDetector::AttackDetector(const Lc3Config& cfg) 
    :Lc3Base(cfg)

    //M_F( (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 160 : 120), // 16*N_ms
    //F_att(0),
    //E_att_last(0),
    //A_att_last(0),
    //P_att_last(-1)
{
    // make sure these states are initially zero as demanded by the specification
    //x_att_last[0] = 0;
    //x_att_last[1] = 0;
    //
    //x_att_extended = AllocT<float>((M_F + 2));

    _x_att_last[0] = 0;
    _x_att_last[1] = 0;
}

AttackDetector::~AttackDetector()
{
    //Free(x_att_extended);
}
#if 0
void AttackDetector::run(const int16_t* const x_s, uint16_t nbytes, float*temp32)
{dbgCodecCp();
    auto x_att_extended = temp32;
    const auto M_F = (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 160 : 120; // 16*N_ms
    // 3.3.6.1 Overview (d09r06_FhG)
    // -> attack detection active only for higher bitrates and fs>=32000; otherwise defaults are set
    F_att = 0;
    if ( _cfg.Fs < 32000 )
    {
        return;
    }
    bool isActive =
            ( (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) && (_cfg.Fs==32000) && (nbytes>80) ) ||
            ( (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) && (_cfg.Fs>=44100) && (nbytes>=100) ) ||
            ( (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) && (_cfg.Fs==32000) && (nbytes>=61) && (nbytes<150) ) ||
            ( (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) && (_cfg.Fs>=44100) && (nbytes>=75) && (nbytes<150) );
    if ( !isActive )
    {
        // Note: in bitrate switching situations we have to set proper states
        E_att_last = 0;
        A_att_last = 0;
        P_att_last = -1;
        return;
    }

    // 3.3.6.2 Downsampling and filtering of input signal (d09r02_F2F)
    // Note: the following section might be converted to int32 instead
    //       of double computation (maybe something for optimization)
    //float x_att_extended[M_F+2];
    //float* x_att_extended = (float*)alloca((M_F+2)*sizeof(float));
    x_att_extended[0] = x_att_last[0];
    x_att_extended[1] = x_att_last[1];
    float* x_att = &x_att_extended[2];
    {
        auto NF_M_F = _cfg.NF/M_F;
        auto NF_M_F_n = 0;
        for (uint8_t n = 0; n < M_F; n++)  // downsampling
        {
            x_att[n] = 0;
            auto sum = 0;
            for (uint8_t m = 0; m < NF_M_F; m++)
            {
                sum += x_s[NF_M_F_n + m];
            }
            x_att[n] = sum;
            NF_M_F_n += NF_M_F;
        }
    }
    x_att_last[0] = x_att[M_F-2];
    x_att_last[1] = x_att[M_F-1];
    float* x_hp = x_att_extended; // just for improve readability
    for (uint8_t n=0; n < M_F; n++)  // highpass-filtering (in-place!)
    {
        x_hp[n] = 0.375*x_att[n] - 0.5*x_att[n-1] + 0.125*x_att[n-2];
    }

    // 3.3.6.3 Energy calculation & 3.3.6.4 Attack detection (d09r06_FhG)
    int8_t P_att = -1;
    const uint8_t N_blocks = (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 4 : 3; // N_ms/2.5
    for (uint8_t n=0; n < N_blocks; n++)
    {
        float E_att = 0;
        for (uint8_t l=40*n; l <= (40*n+39); l++)
        {
            E_att += x_hp[l]*x_hp[l];
        }
        float A_att = (0.25*A_att_last > E_att_last) ? 0.25*A_att_last : E_att_last;
        if (E_att > 8.5*A_att)
        {
            // attack detected
            P_att = n;
        }
        E_att_last = E_att;
        A_att_last = A_att;
    }
    const uint8_t T_att = (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 2 : 1; // floor(N_blocks/2)
    F_att = (P_att >= 0) || (P_att_last >= T_att);
    P_att_last = P_att; // prepare next frame

    run(x_s, nbytes);
}
#endif
void AttackDetector::run(const float* const x_s, uint16_t nbytes)
{dbgCodecCp();
    //auto x_att_extended = temp32;
    // 3.3.6.1 Overview (d09r06_FhG)
    // -> attack detection active only for higher bitrates and fs>=32000; otherwise defaults are set
    _F_att = 0;
    if ( _cfg.Fs < 32000 )
    {
        return;
    }
    bool isActive =
            ( (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) && (_cfg.Fs==32000) && (nbytes>80) ) ||
            ( (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) && (_cfg.Fs>=44100) && (nbytes>=100) ) ||
            ( (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) && (_cfg.Fs==32000) && (nbytes>=61) && (nbytes<150) ) ||
            ( (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) && (_cfg.Fs>=44100) && (nbytes>=75) && (nbytes<150) );
    if ( !isActive )
    {
        // Note: in bitrate switching situations we have to set proper states
        //_E_att_last = 0;
        _A_att_last = 0;
        _P_att_last = -1;
        return;
    }

    // 3.3.6.2 Downsampling and filtering of input signal (d09r02_F2F)
    // Note: the following section might be converted to int32 instead
    //       of double computation (maybe something for optimization)
    // 3.3.6.3 Energy calculation & 3.3.6.4 Attack detection (d09r06_FhG)

    const auto M_F = (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 160 : 120; // 16*N_ms
    const auto N_blocks = (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 4 : 3; // N_ms/2.5
    const auto NF_M_F = _cfg.NF/M_F;
    auto xs = x_s;
    auto last2 = _x_att_last[0];
    auto last1 = _x_att_last[1];
    int8_t P_att = -1;        
    for (int b = 0; b < N_blocks;b++) {
        uint64_t E_att = 0;
        for (uint8_t n = 0; n < 40; n++){             
            float sum = 0.f;
            for (uint8_t m = 0; m < NF_M_F; m++){// downsampling
                sum += *xs++;
            }
            //auto xhp = 0.375 * sum - 0.5 * last1 + 0.125 * last2;// highpass-filtering (in-place!)
            //auto xhp = sum*3 - last1*4 + last2;// highpass-filtering (in-place!)
            //auto xhp = sum + (sum<<1) - (last1<<2) + last2;//x8, highpass-filtering (in-place!)
            auto xhp = (int)(sum*3) - (last1<<2) + last2;//x8, highpass-filtering (in-place!)
            last2 = last1;
            last1 = sum;
            //
            E_att += (int64_t)xhp * xhp;//x64
        }
        //
        //float A_att = (0.25f * _A_att_last > _E_att_last) ? 0.25f * _A_att_last : _E_att_last;
        auto A_att = _A_att_last;// ((_A_att_last >> 2) > _E_att_last) ? (_A_att_last >> 2) : _E_att_last;

        //if (E_att > 8.5f * A_att) {
        if (E_att * 10 > A_att * 85) {
            // attack detected
            P_att = b;
        }
        //_E_att_last = E_att;
        //_A_att_last = A_att;
        _A_att_last = ((A_att >> 2) > E_att) ? (A_att >> 2) : E_att;
    }
    _x_att_last[0] = last2;
    _x_att_last[1] = last1;
    //
    const uint8_t T_att = N_blocks >> 1;//(_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 2 : 1; // floor(N_blocks/2)
    _F_att = (P_att >= 0) || (_P_att_last >= T_att);
    _P_att_last = P_att; // prepare next frame
    //
    //if (_F_att) 
    //    int a = 0;    
    //if (_F_att != F_att)
    //    int a = 0;
    //if (_P_att_last != P_att_last)
    //    int a = 1;
}


void AttackDetector::registerDatapoints()
{

    {
        //_cfg.addDatapoint( "F_att", &F_att, sizeof(F_att) );
    }
}



