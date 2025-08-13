/*
 * EncoderFrame.hpp
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
#ifndef __LC3_ENCODER_RESIDUAL_HPP__
#define __LC3_ENCODER_RESIDUAL_HPP__

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak {namespace enc {
    class Lc3EncoderResidual :public Lc3Base
    {
    public:
        Lc3EncoderResidual(const Lc3Config& cfg);
        ~Lc3EncoderResidual();

        void registerDatapoints();
       
        void run(const int16_t* spec16, const float* spec32
            , uint16_t nbits_spec
            , uint16_t nbits_trunc
            , float gg
            , uint8_t* res_bits
        );
    public:
        int _nbits = 0;
        //uint8_t* res_bits;
    };

}}//namespace 
#endif 
