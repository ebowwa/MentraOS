/*
 * ArithmeticDec.hpp
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

#ifndef __ARITHMETIC_DEC_HPP_
#define __ARITHMETIC_DEC_HPP_

#include <cstdint>

#include "Lc3Config.hpp"
#include "Lc3Base.h"
#include "BitReader.hpp"
namespace sneak{ namespace dec
{

struct ac_dec_state {
    uint32_t low;
    uint32_t range;
    const uint8_t* bytes0;
    uint8_t* bytes;
    //uint16_t bp;
    uint8_t* BEC_detect;
};

class ArithmeticDec :public Lc3Base
{
    public:
        ArithmeticDec(const Lc3Config& _cfg);
        ~ArithmeticDec();

        void registerDatapoints();
        void update(int nbits);
        void run(
            Lc3BitsReader& bs,
            int32_t* spec,
            int16_t& num_tns_filters,
            int16_t rc_order[],
            const uint8_t& lsbMode,
            const int16_t& lastnz,
            uint16_t nbits,
            uint8_t& BEC_detect
        );

        //const Lc3Config& _cfg;
        const uint16_t NF;
        const uint16_t NE;
        uint16_t rateFlag;
        uint8_t tns_lpc_weighting;

        // states & outputs
        int16_t nf_seed;
        int16_t rc_order_ari[2];
        uint8_t rc_i[2*8]; // [max(rc_order[f])=8][max(num_tns_filters)=2]
        //float rc_f[2 * 8];
        uint16_t nbits_residual;

    private:
        //struct ac_dec_state st;
        int16_t _nbits;
};

}}//namespace sneak{ namespace dec

#endif // __ARITHMETIC_DEC_HPP_
