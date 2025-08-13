/*
 * NoiseLevelEstimation.cpp
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

#include "NoiseLevelEstimation.hpp"
#include <cmath>
#include <algorithm>

using namespace sneak::enc;

NoiseLevelEstimation::NoiseLevelEstimation(const Lc3Config& cfg)
    :Lc3Base(cfg)
    ,F_NF(0)
{
}

NoiseLevelEstimation::~NoiseLevelEstimation()
{
}


void NoiseLevelEstimation::run(
        const float* const X_f,
        const int16_t* const X_q,
        uint8_t P_bw,
        float gg)
{dbgCodecCp();
    const uint16_t bw_stop_table_10ms[5] = {80, 160, 240, 320, 400};
    const uint16_t bw_stop_table_7p5ms[5] = {60, 120, 180, 240, 300};
    const uint16_t bw_stop_table_5ms[5] = {40, 80, 120, 160, 200};
    const uint16_t bw_stop_table_2p5ms[5] = {20, 40, 60, 80, 100};
    // const uint16_t bw_stop = (Lc3Config::FrameDuration::d10ms==_cfg.N_ms) ?  bw_stop_table_10ms[P_bw] : bw_stop_table_7p5ms[P_bw];
    // uint16_t NF_start  = (Lc3Config::FrameDuration::d10ms==_cfg.N_ms) ? 24 : 18;
    // uint16_t NF_width  = (Lc3Config::FrameDuration::d10ms==_cfg.N_ms) ? 3 : 2;
    uint16_t NF_start, NF_width, bw_stop;
    if (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) {
        bw_stop = bw_stop_table_10ms[P_bw];
        NF_start = 24;
        NF_width = 3;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms){
        bw_stop = bw_stop_table_7p5ms[P_bw];
        NF_start = 18;
        NF_width = 2;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
        bw_stop = bw_stop_table_5ms[P_bw];
        NF_start = 12;
        NF_width = 1;
    }else{
        bw_stop = bw_stop_table_2p5ms[P_bw];
        NF_start = 6;
        NF_width = 1;
    }

    float L_NF_numerator = 0;
    uint16_t L_NF_denominator = 0;
    auto min_NE_stop = _cfg.NE < bw_stop ? _cfg.NE : bw_stop;
    for (uint16_t k=NF_start; k < min_NE_stop/*(k < _cfg.NE) && (k < bw_stop)*/; k++)
    {
        bool I_NF_k = true;
        auto kNF_width1 = k+NF_width+1;
        auto min_stop_kwidth = bw_stop < kNF_width1 ? bw_stop : kNF_width1;
        for (uint16_t i=k-NF_width; i < min_stop_kwidth/*(i < bw_stop) && (i <= k+NF_width)*/; i++)
        {
            if (X_q[i] != 0)
            {
                // -> I_NF[k] = 0;
                I_NF_k = false;
                break;
            }
        }
        if (I_NF_k)
        {
            L_NF_numerator += __vabs(X_f[k]);
            //L_NF_numerator += (X_f[k]>0) ? X_f[k] : -X_f[k];
            L_NF_denominator++;
        }

    }
    float L_NF = 0;
    if ( (L_NF_denominator > 0) && (gg>0) )
    {
        //L_NF_numerator /= gg;
        L_NF = L_NF_numerator/gg/L_NF_denominator;
    }

    float diff = 8-16*L_NF;
    if (diff >= 0)
    {
        F_NF = std::min( static_cast<int>(diff+0.5), 7 ); // specification says rounding,
        //F_NF = std::min( static_cast<int>(ceil(diff)), 7 );  // but sometimes it seems like the reference encoder computes ceil(.)
    }
    else
    {
        F_NF = 0;
    }


    {
        //_cfg.log("L_NF", &L_NF, sizeof(L_NF) );
        //_cfg.log("L_NF_numerator", &L_NF_numerator, sizeof(L_NF_numerator) );
        //_cfg.log("L_NF_denominator", &L_NF_denominator, sizeof(L_NF_denominator) );
    }
}


void NoiseLevelEstimation::registerDatapoints()
{
    

    {
        //_cfg.addDatapoint( "F_NF", &F_NF, sizeof(F_NF) );
    }
}

