/*
 * BandwidthDetector.cpp
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

#include "BandwidthDetector.hpp"
#include <cmath>

using namespace sneak::enc;

static const uint8_t I_bw_start_table[5][4] = {
    {53,  0,  0,  0}, // N_bw=1
    {47, 59,  0,  0}, // N_bw=2
    {44, 54, 60,  0}, // N_bw=3
    {41, 51, 57, 61}  // N_bw=4
};

static const uint8_t I_bw_stop_table[5][4] = {
    {63,  0,  0,  0}, // N_bw=1
    {56, 63,  0,  0}, // N_bw=2
    {52, 59, 63,  0}, // N_bw=3
    {49, 55, 60, 63}  // N_bw=4
};

static const uint8_t I_bw_start_table_7p5ms[5][4] = {
    {51,  0,  0,  0}, // N_bw=1
    {45, 58,  0,  0}, // N_bw=2
    {42, 53, 60,  0}, // N_bw=3
    {40, 51, 57, 61}  // N_bw=4
};

static const uint8_t I_bw_stop_table_7p5ms[5][4] = {
    {63,  0,  0,  0}, // N_bw=1
    {55, 63,  0,  0}, // N_bw=2
    {51, 58, 63,  0}, // N_bw=3
    {48, 55, 60, 63}  // N_bw=4
};

static const uint8_t I_bw_start_table_5ms[5][4] = {
    {39,  0,  0,  0}, // N_bw=1
    {35, 47,  0,  0}, // N_bw=2
    {34, 44, 50,  0}, // N_bw=3
    {32, 42, 48, 52}  // N_bw=4
};

static const uint8_t I_bw_stop_table_5ms[5][4] = {
    {49,  0,  0,  0}, // N_bw=1
    {44, 51,  0,  0}, // N_bw=2
    {42, 49, 53,  0}, // N_bw=3
    {40, 46, 51, 54}  // N_bw=4
};

static const uint8_t I_bw_start_table_2p5ms[5][4] = {
    {24,  0,  0,  0}, // N_bw=1
    {24, 35,  0,  0}, // N_bw=2
    {24, 33, 39,  0}, // N_bw=3
    {22, 31, 37, 41}  // N_bw=4
};

static const uint8_t I_bw_stop_table_2p5ms[5][4] = {
    {34,  0,  0,  0}, // N_bw=1
    {32, 39,  0,  0}, // N_bw=2
    {31, 38, 42,  0}, // N_bw=3
    {29, 35, 40, 43}  // N_bw=4
};

static const uint8_t  nbits_bw_table[5] = {0, 1, 2, 2, 3}; // see 3.4.2.4 Bandwidth interpretation (d09r02_F2F)

static const uint8_t T_Q[4] = {20, 10, 10, 10};
static const uint8_t T_C[4] = {15, 23, 20, 20};
static const uint8_t L_10ms[4]  = {4, 4, 3, 1};
static const uint8_t L_7p5ms[4] = {4, 4, 3, 2};

BandwidthDetector::BandwidthDetector(const Lc3Config& cfg) 
    :Lc3Base(cfg),

    N_bw(calc_N_bw(_cfg.Fs_ind)),
    nbits_bw(nbits_bw_table[calc_N_bw(_cfg.Fs_ind)]),
    P_bw(0),
    // I_bw_start( (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ?  I_bw_start_table[N_bw-1] : I_bw_start_table_7p5ms[N_bw-1] ),
    // I_bw_stop( (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ?  I_bw_stop_table[N_bw-1] : I_bw_stop_table_7p5ms[N_bw-1] ),
    L( (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? L_10ms : L_7p5ms )
{
    if(_cfg.N_ms == Lc3Config::FrameDuration::d10ms){
        I_bw_start = I_bw_start_table[N_bw-1];
        I_bw_stop = I_bw_stop_table[N_bw-1];
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms){
        I_bw_start = I_bw_start_table_7p5ms[N_bw-1];
        I_bw_stop = I_bw_stop_table_7p5ms[N_bw-1];
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
        I_bw_start = I_bw_start_table_5ms[N_bw-1];
        I_bw_stop = I_bw_stop_table_5ms[N_bw-1];
    }else{
        I_bw_start = I_bw_start_table_2p5ms[N_bw-1];
        I_bw_stop = I_bw_stop_table_2p5ms[N_bw-1];
    }
}

BandwidthDetector::~BandwidthDetector()
{
}

uint8_t BandwidthDetector::calc_N_bw(uint8_t fs_ind)
{
    // see Table 3.5: Parameter table bandwidth detector
    // 3.3.5.2 Parameters (d09r02_F2F)
    return fs_ind;
}

void BandwidthDetector::run(const float* const E_B)
{dbgCodecCp();
    if (0 == N_bw)
    {
        return;
    }


    // 3.3.5.1 Algorithm (first stage)  (d09r02_F2F)
    // Note: it seems like there is no need to compute
    //   the entire specified sequence of flahs F_Q[k]
    //   when we start searching for an active band
    //   from the highest fequency band to lower bands
    uint8_t bw_0 = 0;
    for (uint8_t k=N_bw-1; k < N_bw; k--) // stops when 0-- goes to 255
    {
        uint8_t width = I_bw_stop[k] - I_bw_start[k] +1;
        float Q = 0.0;
        for (uint8_t n = I_bw_start[k]; n <= I_bw_stop[k]; n++)
        {
            Q += E_B[n] / width;
        }
        if ( Q >= T_Q[k] )
        {
            // activity detected (not quiet) -> this is the band index to be selected
            bw_0 = k+1;
            break;
        }
    }

    // 3.3.5.1 Algorithm (second stage)  (d09r02_F2F)
    if (N_bw == bw_0)
    {
        P_bw = bw_0;
    }
    else
    {
        float Cmax=0;
        for (uint8_t n = I_bw_start[bw_0]-L[bw_0]+1; n <= I_bw_start[bw_0]+1; n++)
        {
            float C = 10*log10( E_B[n-L[bw_0]] / E_B[n] );
            if (C > Cmax)
            {
                Cmax = C;
            }
        }
        if (Cmax > T_C[bw_0])
        {
            P_bw = bw_0;
        }
        else
        {
            P_bw = N_bw;
        }
    }

}


void BandwidthDetector::registerDatapoints()
{

    {
        //_cfg.addDatapoint( "P_bw", &P_bw, sizeof(P_bw) );
    }
}

