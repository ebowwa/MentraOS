/*
 * ResidualSpectrum.cpp
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

#include "ResidualSpectrum.hpp"
#include "BitReader.hpp"

#include <cmath>
#include <malloc.h>
using namespace sneak::dec;

ResidualSpectrum::ResidualSpectrum(const Lc3Config&cfg)
    :Lc3Base(cfg),
    NE(cfg.NE),
    nResBits(0)
{
}

ResidualSpectrum::~ResidualSpectrum()
{
}

void ResidualSpectrum::run(
            Lc3BitsReader& bs,
            const uint16_t lastnz,
            int32_t* spec,
            uint16_t const nbits_residual, // the const is implementation dependent and thus not repeated in header declaration
            const uint8_t& lsbMode,
            uint16_t& nf_seed,
            uint16_t& zeroFrame,
            const int16_t gg_ind,
            int16_t F_NF
        )
{
    dbgCodecCp();
    // 3.4.2.6 Residual data and finalization (d09r02_F2F)
    /* Decode residual bits */

    //uint8_t resBits[nbits_residual];
    //uint8_t*resBits=(uint8_t * )alloca(nbits_residual);
    uint16_t remaining_nbits_residual = nbits_residual; // changed relative to specification to ensure const input into array allocation
    //nResBits = 0;
    if (lsbMode)   
    {
        for (uint16_t k = 0; k < lastnz; k+=2)
        {
            //if (save_lev[k] > 0)
            if (spec[k]&1)
            {
                spec[k] &= ~1;
                if (remaining_nbits_residual == 0)
                {
                    break;
                }
                uint8_t bit = read_bit(bs);
                remaining_nbits_residual--;
                if (bit == 1)
                {         
                    auto v0 = spec[k];
                    //if (𝑋𝑞 ̂[k] > 0)
                    if (v0 > 0)
                    {
                        //𝑋𝑞 ̂[k] += 1;
                        v0 += 16;
                    }
                    //else if (𝑋𝑞 ̂[k] < 0)
                    else if (v0 < 0)
                    {
                        //𝑋𝑞 ̂[k] -= 1;
                        v0 -= 16;
                    }
                    else
                    {
                        if (remaining_nbits_residual == 0)
                        {
                            break;
                        }
                        bit = read_bit(bs);
                        remaining_nbits_residual--;
                        if (bit == 0)
                        {
                            //𝑋𝑞 ̂[k] = 1;
                            v0 = 16;
                        }
                        else
                        {
                            //𝑋𝑞 ̂[k] = -1;
                            v0 = -16;
                        }
                    }
                    spec[k] = v0;
                }
                if (remaining_nbits_residual == 0)
                {
                    break;
                }
                bit = read_bit(bs);
                remaining_nbits_residual--;
                if (bit == 1)
                {
                    auto v1 = spec[k + 1];
                    //if (𝑋𝑞 ̂[k+1] > 0)
                    if (v1 > 0)
                    {
                        //𝑋𝑞 ̂[k+1] += 1;
                        v1 += 16;
                    }
                    //else if (𝑋𝑞 ̂[k+1] < 0)
                    else if (v1 < 0)
                    {
                        //𝑋𝑞 ̂[k+1] -= 1;
                        v1 -= 16;
                    }
                    else
                    {
                        if (remaining_nbits_residual == 0)
                        {
                            break;
                        }
                        bit = read_bit(bs);
                        remaining_nbits_residual--;
                        if (bit == 0)
                        {
                            //𝑋𝑞 ̂[k+1] = 1;
                            v1 = 16;
                        }
                        else
                        {
                            //𝑋𝑞 ̂[k+1] = -1;
                            v1 = -16;
                        }
                    }
                    spec[k + 1] = v1;
                }
            }
        }
    }

    /* Noise Filling Seed */
    int32_t tmp = 0;
    int16_t tmp_spec;
    //for (k = 0; k < 𝑁𝐸; k++)
    //for (uint16_t k = 0; k < NE; k++)
    for (uint16_t k = 0; k < lastnz; k++)
    {
        //tmp += abs(𝑋𝑞 ̂[k]) * k;
        tmp_spec = spec[k] >> 4;
        tmp += abs(tmp_spec) * k;
    }
    //nf_seed = tmp & 0xFFFF; /* Note that both tmp and nf_seed are 32-bit int*/
    nf_seed = tmp & 0xFFFF; /* Note that both tmp and nf_seed are 32-bit int*/
    /* Zero frame flag */
    //if (lastnz == 2 && 𝑋𝑞 ̂[0] == 0 && 𝑋𝑞 ̂[1] == 0 && 𝑔𝑔𝑖𝑛𝑑 == 0 && 𝐹𝑁𝐹 == 7)
    if (
        (lastnz == 2) && (!spec[0]) &&
        (!spec[1]) &&
        (gg_ind == 0) &&
        (F_NF == 7)
       )
    {
        zeroFrame = 1;
    }
    else
    {
        zeroFrame = 0;
    }


    //3.4.3 Residual decoding  (d09r02_F2F)
    //Residual decoding is performed only when lsbMode is 0.
    if (lsbMode == 0)
    {        
        //for (k = 0; k < 𝑁𝐸; k++)
        /*for (uint16_t k = 0; k < NE; k++)
        {
            //if (𝑋𝑞 ̂[k] != 0)
            if (spec[k] != 0)
            {
                if (nResBits == remaining_nbits_residual)
                {
                    break;
                }
                resBits[nResBits++] = read_bit(bs);
            }
        }*/
        
        const int16_t _0p1875 = (int16_t)(0.1875f * 16);
        const int16_t _0p3125 = (int16_t)(0.3125f * 16);
        uint16_t k = 0;
        //uint16_t n = 0;
        //while (k < 𝑁𝐸 && n < nResBits)
        //while (k < NE && n < nResBits)
        while (k < lastnz)
        {
            auto v = spec[k];
            //if (𝑋𝑞 ̂[k] != 0)
            if (v)
            {
                if (!remaining_nbits_residual--) {
                    break;
                }
                //if (resBits[n++] == 0)
                auto bit = read_bit(bs);
                if(bit==0)
                {
                    //if (𝑋𝑞 ̂[k] > 0)
                    if (v > 0)
                    {
                        //𝑋𝑞 ̂[k] -= 0.1875;
                        v -= _0p1875;
                    }
                    else
                    {
                        //𝑋𝑞 ̂[k] -= 0.3125;
                        v -= _0p3125;
                    }
                }
                else
                {
                    //if (𝑋𝑞 ̂[k] > 0)
                    if (v > 0)
                    {
                        //𝑋𝑞 ̂[k] += 0.3125;
                        v += _0p3125;
                    }
                    else
                    {
                        //𝑋𝑞 ̂[k] += 0.1875;
                        v += _0p1875;
                    }
                }
                spec[k] = v;
            }
            k++;
        }
    }

}


void ResidualSpectrum::registerDatapoints()
{

    {
        //_cfg.addDatapoint( "spec", &X_hat_q_residual[0], sizeof(float)*NE );
    }
}

