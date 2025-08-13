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

#ifndef __ENCODER_FRAME_HPP_
#define __ENCODER_FRAME_HPP_

#include <cstdint>
#include "MdctEnc.hpp"
#include "Lc3EncoderEnergyBand.hpp"
#include "BandwidthDetector.hpp"
#include "AttackDetector.hpp"
#include "SpectralNoiseShaping.hpp"
#include "TemporalNoiseShaping.hpp"
#include "LongTermPostfilter.hpp"
#include "SpectralQuantization.hpp"
#include "Lc3EncoderResidual.hpp"
#include "NoiseLevelEstimation.hpp"
#include "BitstreamEncoding.hpp"
#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak {namespace enc {
    class EncoderFrame :public Lc3Base
    {
    public:
        EncoderFrame(const Lc3Config& cfg);
        ~EncoderFrame();

        void registerDatapoints();

        void update(int nbytes);
        void run(const float* x_s, uint8_t* bytes, uint16_t nbytes);

        // input parameter
        //const Lc3Config& _cfg;
        uint16_t nbytes;

        //int16_t* getTempBuff16() const;
        float* getInputBuff() const;
    private:
        int estimateBits(int nbits);

    private:
        MdctEnc mdctEnc;
        Lc3EncoderEnergyBand _eband;
        BandwidthDetector bandwidthDetector;
        AttackDetector attackDetector;
        SpectralNoiseShaping spectralNoiseShaping;
        TemporalNoiseShaping temporalNoiseShaping;
        LongTermPostfilter longTermPostfilter;
        SpectralQuantization spectralQuantization;
        Lc3EncoderResidual _residual;
        NoiseLevelEstimation noiseLevelEstimation;
        BitstreamEncoding bitstreamEncoding;
    private:
        // states & outputs
        int16_t frameN;
    protected:
        //uint8_t* res_bits;
        //uint8_t* lsbs;

        float*& _input32;// = 0;
        float*& _spec32;// = 0;
        float*& _temp32;// = 0;
    };

}}//namespace 
#endif // __ENCODER_FRAME_HPP_
