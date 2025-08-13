/*
 * ResidualSpectrum.hpp
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

#ifndef RESIDUAL_SPECTRUM_H_
#define RESIDUAL_SPECTRUM_H_

#include <cstdint>

#include "Lc3Base.h"
#include "Lc3Config.hpp"
#include "BitReader.hpp"
namespace sneak{ namespace dec
{

class ResidualSpectrum :public Lc3Base
{
    public:
        ResidualSpectrum(const Lc3Config&);

        ~ResidualSpectrum();

        void registerDatapoints();

        void run(
            Lc3BitsReader& bs,
            const uint16_t lastnz,
            int32_t* spec,
            uint16_t nbits_residual,
            const uint8_t& lsbMode,
            uint16_t& nf_seed,
            uint16_t& zeroFrame,
            const int16_t gg_ind,
            int16_t F_NF
        );

        const uint16_t NE;
        uint16_t nResBits;

    private:

};

}}//namespace sneak{ namespace dec

#endif // RESIDUAL_SPECTRUM_H_
