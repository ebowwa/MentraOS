/*
 * SpectralNoiseShaping.hpp
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

#ifndef SPECTRAL_NOISE_SHAPING_H_
#define SPECTRAL_NOISE_SHAPING_H_

#include <cstdint>

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{ namespace dec
{

class SpectralNoiseShaping :public Lc3Base
{
    public:
        SpectralNoiseShaping(const Lc3Config& cfg);

        ~SpectralNoiseShaping();

        void registerDatapoints();

        void run(
            float* spec32,
            int16_t ind_LF,
            int16_t ind_HF,
            int16_t submodeMSB,
            int16_t submodeLSB,
            int16_t Gind,
            int16_t LS_indA,
            int16_t LS_indB,
            int32_t idxA,
            int16_t idxB
        );

        int32_t scfQ[16];
        //const Lc3Config& _cfg;

    private:
        const uint16_t* I_fs;

};

}}//namespace sneak{ namespace dec

#endif // SPECTRAL_NOISE_SHAPING_H_
