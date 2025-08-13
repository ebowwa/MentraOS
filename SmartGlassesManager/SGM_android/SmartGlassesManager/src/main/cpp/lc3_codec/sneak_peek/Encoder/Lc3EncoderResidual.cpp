/*
 * Lc3EncoderResidual.cpp
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

#include "Lc3EncoderResidual.hpp"
using namespace sneak::enc;

Lc3EncoderResidual::Lc3EncoderResidual(const Lc3Config& cfg)
    :Lc3Base(cfg)   
{
    //res_bits = AllocT<uint8_t>(cfg.NE);
}

Lc3EncoderResidual::~Lc3EncoderResidual()
{
    //Free(res_bits);
}
void Lc3EncoderResidual::run(const int16_t* spec16, const float* spec32
    , uint16_t nbits_spec
    , uint16_t nbits_trunc
    , float gg
    , uint8_t* res_bits
){  dbgCodecCp(); 
    // 3.3.11 Residual coding  (d09r02_F2F)
    // nbits_residual_max = 𝑛𝑏𝑖𝑡𝑠𝑠𝑝𝑒𝑐 - 𝑛𝑏𝑖𝑡𝑠𝑡𝑟𝑢𝑛𝑐 + 4;
    int16_t nbits_residual_max = nbits_spec - nbits_trunc + 4;
    if (nbits_residual_max < 0){
        nbits_residual_max = 0;
    }
    uint16_t nbits_residual = 0;
    //uint8_t res_bits[nbits_residual_max]; // TODO check whether the degenerated case with nbits_residual_max==0 works
    //uint8_t*res_bits=(uint8_t*)alloca(nbits_residual_max*sizeof(uint8_t)); // TODO check whether the degenerated case with nbits_residual_max==0 works
    if (nbits_residual_max > 0){// converted pseudo-code from page 54  (d09r02_F2F)
        uint16_t k = 0;
        while ( (k < _cfg.NE) && (nbits_residual < nbits_residual_max) ) {
            //if (𝑋𝑞[k]!= 0)
            //if (spectralQuantization.X_q[k]!= 0)
            if (spec16[k]!= 0){
                //if (𝑋𝑓[k] >= 𝑋𝑞[k]*gg)
                if (spec32[k] >= spec16[k]*gg){
                    res_bits[nbits_residual] = 1;
                }
                else{
                    res_bits[nbits_residual] = 0;
                }
                nbits_residual++;
            }
            k++;
        }
    }
    //
    _nbits = nbits_residual;
}

void Lc3EncoderResidual::registerDatapoints()
{

}

