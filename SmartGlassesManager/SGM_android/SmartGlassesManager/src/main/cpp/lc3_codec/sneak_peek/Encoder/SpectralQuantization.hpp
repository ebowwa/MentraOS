/*
 * SpectralQuantization.hpp
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

#ifndef SPECTRAL_QUANTIZATION_H_
#define SPECTRAL_QUANTIZATION_H_

#include <cstdint>

#include "Lc3Base.h"
#include "Lc3Config.hpp"

namespace sneak{ namespace enc
{

class SpectralQuantization :public Lc3Base
{
    public:
        SpectralQuantization(const Lc3Config&cfg);
        ~SpectralQuantization();

        void registerDatapoints();

        void run(const float* const X_f, int16_t* X_q, float* temp, uint16_t nbits, uint16_t nbits_spec_local);

    private:
        void updateGlobalGainEstimationParameter(uint16_t nbits, uint16_t nbits_spec_local);
        void computeSpectralEnergy(const float* X_f,float* E);
        void globalGainEstimation(const float* E);
        void globalGainEstimation(const float* X_f, float* temp, float X_f_sum_new);
        bool globalGainLimitation();
        bool globalGainLimitation(const float* const X_f);
        void quantizeSpectrum(const float* const X_f, int16_t* X_q);
        uint8_t computeBitConsumption(const int16_t* const X_q, uint16_t nbits);
        bool globalGainAdjustment(const float* const X_f,float*temp);

    public:
        static const uint8_t N_b = 64;

        const uint16_t NE;
        const uint8_t fs_ind;

        //int16_t* X_q;
        uint16_t lastnz;
        uint16_t nbits_lsb;
        uint16_t nbits_trunc;
        uint16_t rateFlag;
        uint8_t lsbMode;
        float gg;
        uint16_t lastnz_trunc;
        int16_t gg_ind;

    private:
        int16_t gg_off;
        int16_t gg_min;
        float nbits_offset;
        uint16_t nbits_spec;
        uint16_t nbits_spec_adj;
        uint16_t nbits_est;

        // states
        bool reset_offset_old;
        float nbits_offset_old;
        uint16_t nbits_spec_old;
        uint16_t nbits_est_old;

        //float* E;
        float X_f_max = 0;
        float X_f_sum = 0;
		int16_t gg_ind_last = 0;
		
		//
		int _frame_index = 0;
        //
        const float pow2_31 = 0;
        const float log2_10 = 0;
};

}}//namespace sneak{ namespace enc

#endif // SPECTRAL_QUANTIZATION_H_
