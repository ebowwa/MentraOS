/*
 * LongTermPostfilter.hpp
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

#ifndef LONG_TERM_POSTFILTER_H_
#define LONG_TERM_POSTFILTER_H_

#include <cstdint>
#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{namespace dec{

class LongTermPostfilter :public Lc3Base
{
    public:
        LongTermPostfilter(const Lc3Config& lc3Config_);
        ~LongTermPostfilter();

        void registerDatapoints();

        LongTermPostfilter& operator= ( const LongTermPostfilter & );

        //void setInputX(const float* const x_hat);
        float* GetBuffInput()const { return x_hat_ltpfin; }
        float* run(int16_t ltpf_active, int16_t pitch_index);

        void SetGainParams(uint16_t nbits);
    private:
        const uint8_t numMemBlocks;
        float* x_hat_ltpf;

        void computeFilterCoeffs(uint16_t pitch_index);

        int16_t ltpf_active_prev;
        uint16_t blockStartIndex;
        float *c_num;
        float *c_den;
        float *c_num_mem;
        float *c_den_mem;
        float *x_hat_ltpfin;
        float *x_hat_mem;
        float *x_hat_ltpf_mem;

        uint8_t L_num;
        uint8_t L_den;

        float gain_ltpf;
        uint8_t gain_ind;

        uint16_t p_int;
        uint16_t p_fr;
        uint16_t p_int_mem;
        uint16_t p_fr_mem;    
        //
        int _nbits = 0;
};

}}

#endif // LONG_TERM_POSTFILTER_H_
