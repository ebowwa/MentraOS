/*
 * SnsQuantization.hpp
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

#ifndef SNS_QUANTIZATION_H_
#define SNS_QUANTIZATION_H_

#include <cstdint>

#include "Lc3Base.h"
#include "Lc3Config.hpp"

namespace sneak{ namespace enc
{

class SnsQuantization :public Lc3Base
{
    public: // methods
        SnsQuantization(const Lc3Config&cfg);
        ~SnsQuantization();

        void registerDatapoints();

        void run(const int16_t* const scf,float* temp);

    private: // methods
        void normalizeCandidate(int16_t *y, int16_t *XQ, uint8_t N);
        static inline void MPVQenum (
            int32_t& index,
            int32_t& lead_sign_ind,
            uint8_t dim_in, /* i : dimension of vec_in */
            int16_t vec_in[] /* i : PVQ integer pulse train */
            );
        static inline uint32_t encPushSign(
            int8_t val,
            int32_t& next_sign_ind_in,
            int32_t index_in
            );

    public: // members
        static const uint8_t Nscales = 16;

        //float scfQ[Nscales];
        int32_t scfQ[Nscales];//3.12
        uint8_t ind_LF;
        uint8_t ind_HF;
        uint8_t shape_j;
        uint8_t Gind;
        int32_t LS_indA;
        int32_t LS_indB;
        uint32_t index_joint_j;

    private: // members
        int32_t idxA;
        int32_t idxB;
        //int16_t t2rot[Nscales];
        //int8_t sns_Y0[16];
        //int8_t sns_Y1[10];
        //int8_t sns_Y2[16];
        //int8_t sns_Y3[16];
        //int16_t sns_XQ0[Nscales];
        //int16_t sns_XQ1[Nscales]; // do not minimize to 10 -> last 6 values are all zeros which is important for the inverse D-transform
        //int16_t sns_XQ2[Nscales];
        //int16_t sns_XQ3[Nscales];
        //int16_t absx[16];
};

}}//namespace sneak{ namespace enc

#endif // SNS_QUANTIZATION_H_
