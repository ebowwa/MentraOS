/*
 * DecoderFrame.hpp
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

#ifndef __DECODER_FRAME_HPP_
#define __DECODER_FRAME_HPP_

#include <cstdint>

#include "SideInformation.hpp"
#include "ArithmeticDec.hpp"
#include "ResidualSpectrum.hpp"
#include "Lc3DecoderNoiseFilling.h"
#include "Lc3DecoderTns.h"
#include "SpectralNoiseShaping.hpp"
#include "PacketLossConcealment.hpp"
#include "MdctDec.hpp"
//#include "LongTermPostfilter.hpp"
#include "Lc3DecoderLtpf.h"
#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{ namespace dec
{

class DecoderFrame :public Lc3Base
{
    public:
        DecoderFrame(const Lc3Config& cfg);
        ~DecoderFrame();
    public:
        void registerDatapoints();
        void update(int nbits);
        void run(const uint8_t* bytes,
            uint16_t nbytes,
            uint8_t BFI,
            uint8_t bits_depth,
            uint8_t bits_align,
            void* x_out,
            uint8_t& BEC_detect
        );        

        // per instance constant parameter
        uint16_t nbytes;
        uint16_t nbits;
        //const Lc3Config& _cfg;

    private:
        void runFloat(const uint8_t *bytes, uint8_t BFI, uint8_t& BEC_detect);
        void output16(int16_t* x_out);        
        void output32(int32_t* x_out);
        void output24(void* x_out, int bits_align = 0);

        void noiseFilling(float*spec);
        void applyGlobalGain(int32_t*spec32,float*spec);
        void temporalNoiseShaping(float* spec);

        SideInformation sideInformation;
        ArithmeticDec arithmeticDec;
        ResidualSpectrum residualSpectrum;
        Lc3DecoderNoiseFilling noise;
        Lc3DecoderTns tns;
        SpectralNoiseShaping spectralNoiseShaping;
        PacketLossConcealment packetLossConcealment;
        MdctDec mdctDec;
        //LongTermPostfilter longTermPostfilter;
        Lc3DecoderLtpf _ltpf;

        // states & outputs
        int16_t frameN;

        int16_t lastnz;
        int16_t P_BW;
        uint8_t lsbMode;
        int16_t gg_ind;
        int16_t num_tns_filters;
        int16_t rc_order[2];
        uint8_t pitch_present;
        int16_t pitch_index;
        int16_t ltpf_active;
        int16_t F_NF;
        int16_t ind_LF;
        int16_t ind_HF;
        int16_t Gind;
        int16_t LS_indA;
        int16_t LS_indB;
        int32_t idxA;
        int16_t idxB;
        uint16_t nf_seed;
        uint16_t zeroFrame;
        int16_t gg_off;
        //
        float* _buff;
        float* _spec;
        float*& _temp;
        //
        float* _pcm;
};

}}//namespace sneak{ namespace dec

#endif // __DECODER_FRAME_HPP_
