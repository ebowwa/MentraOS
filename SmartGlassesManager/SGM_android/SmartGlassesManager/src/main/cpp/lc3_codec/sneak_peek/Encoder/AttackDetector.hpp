/*
 * AttackDetector.hpp
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

#ifndef ATTACK_DETECTOR_H_
#define ATTACK_DETECTOR_H_

#include <cstdint>

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{ namespace enc
{

    class AttackDetector :public Lc3Base
    {
    public:
        AttackDetector(const Lc3Config& cfg);
        ~AttackDetector();

        void registerDatapoints();

        //void run(const float* const x_s, uint16_t nbytes, float* temp32);
        void run(const float* const x_s, uint16_t nbytes);

        //const Lc3Config& _cfg;
        //const uint8_t M_F;
#if 0
        uint8_t F_att;        
    private:
        float x_att_last[2];
        float E_att_last;
        float A_att_last;
        int8_t P_att_last;
#endif
    public:
        bool _F_att = false;
    private:        
        int _x_att_last[2];
        //int64_t _E_att_last=0;
        int64_t _A_att_last=0;
        int8_t _P_att_last=0;
    };

}}//namespace sneak{ namespace enc

#endif // ATTACK_DETECTOR_H_
