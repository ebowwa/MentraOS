/*
 * MdctEnc.cpp
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

#include "Lc3EncoderEnergyBand.hpp"
#include "BandIndexTables.hpp"
#include <cmath>

using namespace sneak::enc;


Lc3EncoderEnergyBand::Lc3EncoderEnergyBand(const Lc3Config& cfg)
    :Lc3Base(cfg) 
    , I_fs(cfg._I_fs)
{
#if 0
    //E_B = AllocT<float>(_cfg.N_b);    
    I_fs = &I_8000[0]; // default initialization to avoid warnings

    // Note: we do not add additional configuration error checking at this level.
    //   We assume that there will be nor processing with invalid configuration,
    //   thus nonsense results for invalid _cfg.N_ms and/or _cfg.Fs_ind
    //   are accepted here.
    if (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms){
        switch(_cfg.Fs_ind){
            case 0:I_fs = &I_8000_7p5ms[0];break;
            case 1:I_fs = &I_16000_7p5ms[0];break;
            case 2:I_fs = &I_24000_7p5ms[0];break;
            case 3:I_fs = &I_32000_7p5ms[0];break;
            case 4:I_fs = &I_48000_7p5ms[0];break;
        }
    }
    else{
        // Lc3Config::FrameDuration::d10ms (and other as fallback)
        switch(_cfg.Fs_ind){
            case 0:I_fs = &I_8000[0];break;
            case 1:I_fs = &I_16000[0];break;
            case 2:I_fs = &I_24000[0];break;
            case 3:I_fs = &I_32000[0];break;
            case 4:I_fs = &I_48000[0];break;
        }
    }   
#endif
}

Lc3EncoderEnergyBand::~Lc3EncoderEnergyBand(){ 
    //Free(E_B);
}

const uint16_t* Lc3EncoderEnergyBand::get_I_fs() const{
    return I_fs;
}

void Lc3EncoderEnergyBand::run(const float* const spec,float* E_B){dbgCodecCp();
    //3.3.4.4 Energy estimation per band   (d09r02_F2F)
    auto ys = spec;
    for (uint8_t b = 0; b < _cfg.N_b; b++){
        auto sum = 0.0f;        
        for (uint16_t k = I_fs[b]; k < I_fs[b+1]; k++){
            //sum += X[k]*X[k] ;
            auto y = ys[k];
            __vmla_(y,y,sum) ;
        }
        uint16_t width = I_fs[b + 1] - I_fs[b];
        E_B[b] = sum / width;
    }

    //3.3.4.5 Near Nyquist Detector (LC3 Specification d1.0r03; Errata 15041)
    if (_cfg.Fs <= 32000 && (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms || _cfg.N_ms == Lc3Config::FrameDuration::d10ms)){
        const uint16_t nn_idx = (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) ? _cfg.N_b-4 : _cfg.N_b-2;
        float upperBandsEnergy = 0;
        float lowerBandsEnergy = 0;
        for (uint8_t n=0; n < _cfg.N_b; n++){
            if (n < nn_idx){
                lowerBandsEnergy += E_B[n];
            }
            else{
                upperBandsEnergy += E_B[n];
            }
        }
        const float NN_thresh = 30;
        near_nyquist_flag = ( upperBandsEnergy > NN_thresh * lowerBandsEnergy) ? 1 : 0;
    }
    else{
        near_nyquist_flag = 0;
    }
}


void Lc3EncoderEnergyBand::registerDatapoints()
{
    {       
        //_cfg.addDatapoint( "E_B", &E_B[0], sizeof(float)*_cfg.N_b);
        //_cfg.addDatapoint( "near_nyquist_flag", &near_nyquist_flag, sizeof(near_nyquist_flag));
    }
}


