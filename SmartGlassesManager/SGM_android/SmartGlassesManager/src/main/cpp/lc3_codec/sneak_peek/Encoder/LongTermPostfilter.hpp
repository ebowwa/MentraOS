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

#ifndef LONG_TERM_POSTFILER_H_
#define LONG_TERM_POSTFILER_H_

#include <cstdint>

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{ namespace enc
{

class LongTermPostfilter :public Lc3Base
{
    public:
        LongTermPostfilter(const Lc3Config& cfg);
        ~LongTermPostfilter();

        //LongTermPostfilter& operator= ( const LongTermPostfilter & );

        static uint8_t getP(uint16_t fs);
        static uint8_t getGainLtpfOn(uint16_t nbits, const Lc3Config& _cfg);

        void registerDatapoints();

        void update(uint16_t nbits);
        void run(const float* const x_s_, uint8_t near_nyquist_flag);

    private:
        void filterH50(float* xy);
        float compute_normvalue(const float* const x, uint8_t L, uint8_t T);
        uint8_t pitchDetection(float& normcorr);
        float interp(const float* R_12p8, uint8_t pitch_int_rel, int8_t d);
        void pitchLagParameter(uint8_t T_curr, uint8_t& pitch_int, int8_t& pitch_fr);
        float x_i_n_d(int16_t n, int8_t d);
        void activationBit(uint8_t pitch_int, uint8_t pitch_fr, uint8_t near_nyquist_flag, float& nc, float& pitch);

        void resample12p8(const float* const in, float* out);
        //void resample12p8_0(const float const* in, float* out);
        //void resample12p8_1(const float const* in, float* out);
    public:
        static const uint8_t Nmem12p8D = 232;
        static const uint8_t k_min = 17;
        static const uint8_t k_max = 114;

        const Lc3Config& _cfg;
        //const uint8_t len12p8;
        //const uint8_t len6p4;
        uint8_t len12p8;
        uint8_t len6p4;
        const uint8_t D_LTPF;
        const uint8_t P;
        const uint8_t P_times_res_fac;
        uint8_t gain_ltpf_on;

        uint16_t pitch_index;
        uint8_t pitch_present;
        uint8_t ltpf_active;
        uint8_t nbits_LTPF;

    private:
        uint8_t T_prev;
        float   mem_pitch;
        uint8_t mem_ltpf_active;
        float   mem_nc;
        float   mem_mem_nc;
        float* x_s_extended;
        float* x_tilde_12p8D_extended;
        float h50_mem[2];
        float* x_6p4_extended;//[64 + k_max] ;
    private:
        float* R_12p8;        
};

}}//namespace sneak{ namespace enc

#endif // LONG_TERM_POSTFILER_H_

