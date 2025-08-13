/*
 * MdctEnc.hpp
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
#pragma once
#ifndef __LC3_ENCODER_ENERGY_BAND_H_
#define __LC3_ENCODER_ENERGY_BAND_H_

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{ namespace enc
{
    class Lc3EncoderEnergyBand :public Lc3Base
    {
    public:
        Lc3EncoderEnergyBand(const Lc3Config& cfg);
        ~Lc3EncoderEnergyBand();
    public:
        void registerDatapoints();
        void run(const float* const spec, float* E_B);
        const uint16_t* get_I_fs() const;
    public:
        //float* E_B = 0;
        uint8_t near_nyquist_flag = 0;
    private:
        //void MdctFastDbl(const float* const tw);        
        const uint16_t* I_fs;
    };

}}//namespace sneak{ namespace enc

#endif 
