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

#include "MdctEnc.hpp"
#include "MdctWindows.hpp"
#include "BandIndexTables.hpp"
#include <cmath>
#include <malloc.h>

using namespace sneak::enc;


MdctEnc::MdctEnc(const Lc3Config& cfg)
    :Lc3Base(cfg),
    //X(nullptr),
    //E_B(nullptr),
    //near_nyquist_flag(0),
    dctIVDbl(_cfg.NF,_cfg),
    skipMdct(0),
    _ola(nullptr),
    _win(cfg._mdct_win)
    //I_fs(nullptr)
{
    //X = dctIVDbl.out;
    //X = AllocT<float>(_cfg.NF);
    //_temp = AllocT<float>(_cfg.NF);

    //E_B = AllocT<float>(_cfg.N_b);
    // initialization of E_B skipped since this will be fully re-computed on any run anyway

    auto tn = _cfg.NF - _cfg.Z;
    _ola = AllocT<float>(tn);
    for (uint16_t n=0; n < tn; n++){
        _ola[n]=0.f;
    }

    /*tw = AllocT<float>(_cfg.NF * 2);
    for (uint16_t n = 0; n < _cfg.NF * 2; n++)
    {
        tw[n] = 0;
    }*/
    // Note: we do not add additional configuration error checking at this level.
    //   We assume that there will be nor processing with invalid configuration,
    //   thus nonsense results for invalid _cfg.N_ms and/or _cfg.Fs_ind
    //   are accepted here.
    //I_fs = &I_8000[0]; // default initialization to avoid warnings
   
    //
    //_win = w_N80;        // default initialization to avoid warnings

    // Note: we do not add additional configuration error checking at this level.
    //   We assume that there will be nor processing with invalid configuration,
    //   thus nonsense results for invalid _cfg.N_ms and/or _cfg.Fs_ind
    //   are accepted here.
    //_win = lc3MdctWinGet(_cfg.Fs_ind, (int)_cfg.N_ms);
    _gain = 1.f;
#if 0
    if (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms)
    {
        switch(_cfg.Fs_ind){
            case 0:_win = w_N60_7p5ms;break;
            case 1:_win = w_N120_7p5ms;break;
            case 2:_win = w_N180_7p5ms;break;
            case 3:_win = w_N240_7p5ms;break;
            case 4:_win = w_N360_7p5ms;break;
        }
    }
    else
    {
        // Lc3Config::FrameDuration::d10ms (and other as fallback)
        switch(_cfg.Fs_ind){
            case 0:_win = w_N80;break;
            case 1:_win = w_N160;break;
            case 2:_win = w_N240;break;
            case 3:_win = w_N320;break;
            case 4:_win = w_N480;break;
        }
    }
#endif
    //
    //auto gain = dctIVDbl._gain / sqrt(2.0 * _cfg.NF);
    //int wn = _cfg.NF * 2 - _cfg.Z;
    //auto wNx = AllocT<float>(wn);
    //for (int n = 0; n < wn; n++) {
    //    wNx[n] = _win[n] * gain;
    //}
    //_win = wNx;
    //_gain = gain;
}

MdctEnc::~MdctEnc()
{
    Free(_ola);
    //Free(tw);
    //Free(E_B);
    //Free(_win);
    //Free(X);
    //Free(_temp);
}

//const int* MdctEnc::get_I_fs() const
//{
//    return I_fs;
//}

#if 0
void MdctEnc::MdctFastDbl(const float* const tw)
{
    auto N = _cfg.NF;
    auto N3_2 = 3 * _cfg.NF >> 1;
    auto N_2 = _cfg.NF >> 1;
    for (uint16_t n=0; n < N_2; n++)
    {
        dctIVDbl.in[n] = -tw[N3_2-1-n] - tw[N3_2+n] ;
    }
    for (uint16_t n= N_2; n < N; n++)
    {
        dctIVDbl.in[n] = tw[n- N_2] - tw[N3_2-1-n] ;
    }

    dctIVDbl.run();

    /*float gain = 1.0 / sqrt(2.0 * _cfg.NF);
    for (uint16_t k=0; k < _cfg.NF; k++)
    {
        dctIVDbl.out[k] *= gain;
    }*/
}
#endif

/*void MdctEnc::run(const int16_t* const x_s)
{dbgCodecCp();
    run(x_s, X, _temp);
}*/
void MdctEnc::run(const float* x_s, float* output, float* temp)
{dbgCodecCp();
    if (skipMdct)
    {
        return;
    }
    //
#if 1
    const auto N = _cfg.NF;
    const auto Z = _cfg.Z;
    const auto N2 = N << 1;
    const auto N_2 = N >> 1;
    const auto N3_2 = N + N_2;
    //float*tw=(float*)alloca(N2*sizeof(float));
    /*int n = 0;
    for (; n < (N - Z); n++)
    {
        tw[n] = _win[n] * t[n];
        t[n] = x_s[Z + n];
    }
    int m = 0;
    for (; n < (N2 - Z); n++, m++)
    {
        tw[n] = _win[n] * x_s[m];
    }*/
    /*for (; n < N2; n++) {
        tw[n] = 0;
    }*/
#else
    // 3.3.4.2 Update time buffer (LC3 Specification d09r02_F2F)
    // Note: specification has strange loop indices
    //  -> corrected start index appropriately
    for (uint16_t n=0; n<(_cfg.NF-_cfg.Z); n++)
    {
        t[n] = t[_cfg.NF+n];
    }
    for (uint16_t n=_cfg.NF-_cfg.Z; n<(2*_cfg.NF-_cfg.Z); n++)
    {
        t[n] = x_s[_cfg.Z-_cfg.NF+n];
    }

    // 3.3.4.3 Time-Frequency Transformation (LC3 Specification d09r02_F2F)
    //float tw[2*_cfg.NF];
    //float*tw=(float*)alloca(2*_cfg.NF*sizeof(float));
    for (uint16_t n=0; n<2*_cfg.NF; n++)
    {
        tw[n] = _win[n] * t[n];
    }
#endif
    //MdctFastDbl(tw);
    //auto N = _cfg.NF;    
    //output== dctIVDbl.in
    auto dctIVDbl_in = temp;
    auto dctIVDbl_out = output;
    auto dctIVDbl_tmp = temp;
    auto tw = output;
    //N/2 -> N
    int n = 0;
    auto wn = _win;
    for (; n < (N - Z); n++){
        tw[n] = *wn++ * _ola[n];
        _ola[n] = x_s[Z + n];
    }
    auto xs = x_s;
    for (; n < N; n++){
        tw[n] = *wn++ * *xs++;
    }
    for (uint16_t i = N_2; i < N; i++){
        dctIVDbl_in[i] = tw[i - N_2] - tw[N3_2 - 1 - i];
    }
    //0 -> N/2
    n = 0;
    for (; n < (N - Z); n++){
        tw[n] = *wn++ * *xs++;
    }
    for (; n < N; n++){
        tw[n] = 0;
    }
    for (uint16_t i = 0; i < N_2; i++){
        //dctIVDbl_in[i] = -tw[N3_2 - 1 - i] - tw[N3_2 + i];
        dctIVDbl_in[i] = -tw[N_2 - 1 - i] - tw[N_2 + i];
    }

	//
    dctIVDbl.run(dctIVDbl_in, dctIVDbl_out, dctIVDbl_tmp, 0);
#if 0
    //3.3.4.4 Energy estimation per band   (d09r02_F2F)
    auto ys = dctIVDbl_out;
    for (uint8_t b = 0; b < _cfg.N_b; b++)
    {
        auto sum = 0.0f;        
        for (uint16_t k = I_fs[b]; k < I_fs[b+1]; k++)
        {
            //sum += X[k]*X[k] ;
            auto y = ys[k];
            __vmla_(y,y,sum) ;
        }
        uint16_t width = I_fs[b + 1] - I_fs[b];
        E_B[b] = sum / width;
    }

    //3.3.4.5 Near Nyquist Detector (LC3 Specification d1.0r03; Errata 15041)
    if (_cfg.Fs <= 32000)
    {
        const uint16_t nn_idx = (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) ? _cfg.N_b-4 : _cfg.N_b-2;
        float upperBandsEnergy = 0;
        float lowerBandsEnergy = 0;
        for (uint8_t n=0; n < _cfg.N_b; n++)
        {
            if (n < nn_idx)
            {
                lowerBandsEnergy += E_B[n];
            }
            else
            {
                upperBandsEnergy += E_B[n];
            }
        }
        const float NN_thresh = 30;
        near_nyquist_flag = ( upperBandsEnergy > NN_thresh * lowerBandsEnergy) ? 1 : 0;
    }
    else
    {
        near_nyquist_flag = 0;
    }
#endif
}


void MdctEnc::registerDatapoints()
{

    {
        //_cfg.addDatapoint( "skipMdct", &skipMdct, sizeof(skipMdct) );
        //_cfg.addDatapoint( "X", &X[0], sizeof(float)*_cfg.NF );
        //_cfg.addDatapoint( "E_B", &E_B[0], sizeof(float)*_cfg.N_b);
        //_cfg.addDatapoint( "near_nyquist_flag", &near_nyquist_flag, sizeof(near_nyquist_flag));
    }
}


