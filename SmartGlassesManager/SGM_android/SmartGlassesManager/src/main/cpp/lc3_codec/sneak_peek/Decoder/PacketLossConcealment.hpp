/*
 * PacketLossConcealment.hpp
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

#ifndef PACKET_LOSS_CONCEALMENT_H_
#define PACKET_LOSS_CONCEALMENT_H_

#include <cstdint>

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{ namespace dec
{

class PacketLossConcealment :public Lc3Base
{
    public:
        PacketLossConcealment(const Lc3Config&);
        ~PacketLossConcealment();

        void registerDatapoints();

        void run(uint8_t BER_DETECT, float* X_hat, int16_t& ltpf_active);
        void mdctplcrun(uint8_t BEC_detect, float *spec, int16_t &ltpf_active, int32_t *sns_scf_q, int32_t skip_mdct);

        const uint16_t NE;

    private:
        uint16_t plc_seed;
        uint8_t nbLostCmpt;
        float alpha;
        float* _last;

        uint8_t scf_q_set;
        float N_ms;

        float cum_fading_slow;
        float cum_fading_fast;

        float old_scf_q[16];
        float scf_q[16];

        float theta;

        float plc_duration_inFrames;
        float plc_start_inFrames;
        float plc_end_inFrames;

        float slow;
        float fast;
};

}}//namespace sneak{ namespace dec

#endif // PACKET_LOSS_CONCEALMENT_H_