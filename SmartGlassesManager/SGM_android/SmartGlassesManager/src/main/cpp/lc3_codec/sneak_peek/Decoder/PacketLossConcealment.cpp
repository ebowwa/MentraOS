/*
 * PacketLossConcealment.cpp
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

#include "PacketLossConcealment.hpp"

using namespace sneak::dec;

PacketLossConcealment::PacketLossConcealment(const Lc3Config&cfg)
    :Lc3Base(cfg),
    NE(cfg.NE),
    plc_seed(24607), // this initialization need not be done every frame as clarified by Errata 15114
    nbLostCmpt(0),
    alpha(1),
    _last(nullptr),
    cum_fading_slow(1),
    cum_fading_fast(1)
{
    for (int i = 0; i < 16; i++) {
        scf_q[i] = 0;
        old_scf_q[i] = 0;
    }
    if (cfg.N_ms == Lc3Config::FrameDuration::d10ms) {
        N_ms = 10.f;
    }
    else if (cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) {
        N_ms = 7.5f;
    }
    else if (cfg.N_ms == Lc3Config::FrameDuration::d5ms) {
        N_ms = 5.f;
    }
    else {
        N_ms = 2.5f;
    }

    plc_start_inFrames = 20 / N_ms;
    plc_end_inFrames = 60 / N_ms;
    plc_duration_inFrames = plc_end_inFrames - plc_start_inFrames;
}

PacketLossConcealment::~PacketLossConcealment()
{

}

void PacketLossConcealment::run(uint8_t BEC_detect, float* spec, int16_t& ltpf_active)
{
    dbgCodecCp();
    // Appendix B. Packet Loss Concealment   (d09r02_F2F)
    if (0==BEC_detect)
    {
        nbLostCmpt = 0;
        alpha = 1;
        _last = spec;
    }
    else if(_last)
    {
        ltpf_active = 0; // errata 15097 implemented

        if (nbLostCmpt < 0xFF)
        {
            nbLostCmpt++;
        }

        // Note: from (d09r02_F2F) its is not perfectly clear,
        //   whether alpha is modified before or after applying
        //   it to the spectrum -> we may have to check the
        //   given implementation with the LC3.exe reference
        if (nbLostCmpt >= 8)
        {
            alpha = 0.85f;// *alpha;
        }
        else if (nbLostCmpt >= 4)
        {
            alpha = 0.9f;// *alpha;
        }

        for (uint16_t k=0; k < NE; k++)
        {
            plc_seed = (16831 + plc_seed*12821) & 0xFFFF;
            if (plc_seed < 0x8000)
            {
                spec[k] = alpha*_last[k];
            }
            else
            {
                spec[k] = -alpha*_last[k];
            }
        }
        _last = spec;
    }

}

void PacketLossConcealment::mdctplcrun(uint8_t BEC_detect, float *spec, int16_t &ltpf_active, int32_t *sns_scf_q, int32_t skip_mdct)
{
    if (0==BEC_detect)
     {
         nbLostCmpt = 0;
         cum_fading_slow = 1;
         cum_fading_fast = 1;
         _last = spec;
         //memmove(old_scf_q, scf_q, 16);
         //memmove(scf_q, sns_scf_q, 16);
         for (int i = 0; i < 16; i++) {
             old_scf_q[i] = scf_q[i];
             scf_q[i] = sns_scf_q[i] / 65536.f;
         }
     }else if (_last)
     {
         //ltpf_active = 0; // errata 15097 implemented

         if (nbLostCmpt < 0xFF)
         {
             nbLostCmpt++;
         }
         if (nbLostCmpt > 1) {
             theta = 0.8;
         }else{
             auto sum = 0.f;
             for (int i = 0; i < 16; i++) {
                 sum += (scf_q[i] - old_scf_q[i]) * (scf_q[i] - old_scf_q[i]);
             }
             sum /= 25;
             if (sum < 0.25) {
                 theta = 1;
             }
             else if (sum > 1.25)
             {
                 theta = 0;
             }
             else {
                 theta = 1.25 - sum;
             }
         }

         auto x = std::max(plc_start_inFrames, std::min((float)nbLostCmpt, plc_end_inFrames));
         auto m = -1 / plc_duration_inFrames;
         auto b = -plc_end_inFrames;
         auto linFuncStartStop = m * (x + b);
         auto randThreshold = -32768 * linFuncStartStop;

         if (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms)
         {
             for (uint16_t k = 0; k < _cfg.NF; k++)
             {
                 plc_seed = (16831 + plc_seed * 12821) & 0xFFFF;
                 if (plc_seed < linFuncStartStop)
                 {
                     spec[k] = _last[k];
                 }
                 else
                 {
                     spec[k] = -_last[k];
                 }
             }
         }
         else {
             for (uint16_t k = 0; k < _cfg.NF; k++)
             {
                 plc_seed = (16831 + plc_seed * 12821) & 0xFFFF;
                 if (plc_seed < randThreshold)
                 {
                     spec[k] = -_last[k];
                 }
                 else
                 {
                     spec[k] = _last[k];
                 }
             }
         }

         auto nbLostCmpt_loc = (nbLostCmpt + 10 / N_ms - 1) / (10 / N_ms);

         if (nbLostCmpt_loc > 6) {
             slow = 0.f;
             fast = 0.f;
         }else if(nbLostCmpt_loc > 2){
             auto tmp = (6 - nbLostCmpt_loc) / (6 - nbLostCmpt_loc + 1);
             slow = 0.8 + 0.2 * theta;
             slow *= tmp;
             fast = 0.3 + 0.2 * theta;
             fast *= tmp;
             if (N_ms == 2.5) {
                 slow = sqrt(slow);
                 slow = sqrt(slow);
             }else if(N_ms == 5){
                 slow = sqrt(slow);
             }
             cum_fading_slow *= slow;
             cum_fading_fast *= fast;
         }else{
             slow = 0.8 + 0.2 * theta;
             fast = 0.3 + 0.2 * theta;
             if (N_ms == 2.5) {
                 slow = sqrt(slow);
                 slow = sqrt(slow);
             }
             else if (N_ms == 5) {
                 slow = sqrt(slow);
             }
             cum_fading_slow *= slow;
             cum_fading_fast *= fast;
         }

         auto ad_ThreshFac_start = 10.f;
         auto ad_ThreshFac_end = 1.2f;
         auto ad_threshFac = (ad_ThreshFac_start - ad_ThreshFac_end) * linFuncStartStop + ad_ThreshFac_end;

         auto frame_energy = 0.f;
         for (uint16_t i = 0; i < _cfg.NF; i++)
         {
             frame_energy += spec[i] * spec[i];
         }
         frame_energy /= _cfg.NF;
         auto enegyThreshold = ad_threshFac * frame_energy;
         for (uint16_t i = 0; i < _cfg.NF; i++) {
             auto X_m = 0.f;
             auto X_n = 0.f;
             if (spec[i] * spec[i] < enegyThreshold) {
                 X_m = cum_fading_slow;
                 X_n = 0;
             }else {
                 X_m = cum_fading_fast;
                 auto sign = spec[i] > 0 ? 1 : -1;
                 X_n = (cum_fading_slow - cum_fading_fast) * sqrt(enegyThreshold) * sign;
             }
             spec[i] = X_m * spec[i] + X_n;
         }
         _last = spec;
     }
}

void PacketLossConcealment::registerDatapoints()
{
    {
        //_cfg.addDatapoint( "X_hat_last", &_last[0], sizeof(float)*NE);
    }
}



