/*
 * TemporalNoiseShaping.hpp
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

#ifndef TEMPORAL_NOISE_SHAPING_H_
#define TEMPORAL_NOISE_SHAPING_H_

#include <cstdint>

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{ namespace enc
{

class TemporalNoiseShaping :public Lc3Base
{
    public:
        TemporalNoiseShaping(const Lc3Config& cfg);
        ~TemporalNoiseShaping();

        void registerDatapoints();

        void run(const float* const X_S, float* Y_S, float*temp,uint8_t P_BW, uint16_t nbits, uint8_t near_nyquist_flag);

        //static int8_t nint(float x);

        //const Lc3Config& _cfg;

        uint16_t nbits_TNS;
        //float* X_f;
        uint8_t tns_lpc_weighting;
        uint8_t num_tns_filters;
        uint8_t rc_order[2];
        uint8_t rc_i[2*8];

        uint8_t maxOrder;
        uint8_t nSubdivisions;
        uint8_t movr_f;

    //private:
        //float rc_q[2*8];
};

}}//namespace sneak{ namespace enc

#endif // TEMPORAL_NOISE_SHAPING_H_
