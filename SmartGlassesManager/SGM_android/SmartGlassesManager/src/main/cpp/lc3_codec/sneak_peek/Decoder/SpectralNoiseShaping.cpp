/*
 * SpectralNoiseShaping.cpp
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

#include "SpectralNoiseShaping.hpp"
#include "SnsQuantizationTables.hpp"
#include "BandIndexTables.hpp"
#include "MPVQ.hpp"

#include <cmath>

using namespace sneak::dec;


SpectralNoiseShaping::SpectralNoiseShaping(const Lc3Config& cfg)
    :Lc3Base(cfg),

    I_fs(cfg._I_fs)
{
    // Note: we do not add additional configuration error checking at this level.
    //   We assume that there will be nor processing with invalid configuration,
    //   thus nonsense results for invalid _cfg.N_ms and/or _cfg.Fs_ind
    //   are accepted here.
    /*if (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms)
    {
        switch(_cfg.Fs_ind)
        {
            case 0:
                I_fs = &I_8000_7p5ms[0];
                break;
            case 1:
                I_fs = &I_16000_7p5ms[0];
                break;
            case 2:
                I_fs = &I_24000_7p5ms[0];
                break;
            case 3:
                I_fs = &I_32000_7p5ms[0];
                break;
            case 4:
                I_fs = &I_48000_7p5ms[0];
                break;
        }
    }
    else
    {
        // Lc3Config::FrameDuration::d10ms (and other as fallback)
        switch(_cfg.Fs_ind)
        {
            case 0:
                I_fs = &I_8000[0];
                break;
            case 1:
                I_fs = &I_16000[0];
                break;
            case 2:
                I_fs = &I_24000[0];
                break;
            case 3:
                I_fs = &I_32000[0];
                break;
            case 4:
                I_fs = &I_48000[0];
                break;
        }
    }*/

}

SpectralNoiseShaping::~SpectralNoiseShaping()
{
}

void SpectralNoiseShaping::run(
            float* spec,
            int16_t ind_LF,
            int16_t ind_HF,
            int16_t submodeMSB,
            int16_t submodeLSB,
            int16_t Gind,
            int16_t LS_indA,
            int16_t LS_indB,
            int32_t idxA,
            int16_t idxB
        )
{
    dbgCodecCp();
    //3.4.7 SNS decoder (d09r02_F2F)
    // 3.4.7.2 SNS scale factor decoding  (d09r02_F2F)
    // 3.4.7.2.1 Stage 1 SNS VQ decoding  (d09r02_F2F)
    // already done earlier (see SideInformation)

    //The first stage vector is composed as:
    //𝑠𝑡1(𝑛) = 𝐿𝐹𝐶𝐵𝑖𝑛𝑑_𝐿𝐹 (𝑛), 𝑓𝑜𝑟 𝑛 = [0 … 7], # (33)
    //𝑠𝑡1(𝑛 + 8) = 𝐻𝐹𝐶𝐵𝑖𝑛𝑑_𝐻𝐹(𝑛), 𝑓𝑜𝑟 𝑛 = [0 … 7], # (34)
    //float st1[16];
    //for (uint8_t n = 0; n<8; n++)
    //{
    //    st1[n]   = LFCB[ind_LF][n];
    //    st1[n+8] = HFCB[ind_HF][n];
    //}

    // 3.4.7.2.2 Stage 2 SNS VQ decoding   (d09r02_F2F)
    // already done earlier -> submodeMSB, Gind, LS_indA, LS_indB, idxA, idxB
    int16_t shape_j = (submodeMSB<<1) + submodeLSB;
    int16_t gain_i = Gind;

    //int16_t y[16];
	int32_t y32s[8];    
    int16_t* y = (int16_t*)y32s;   
    switch (shape_j)
    {
        case 0: 
            MPVQdeenum(10, 10, LS_indA, idxA, y);
            MPVQdeenum(6, 1, LS_indB, idxB, y+10);
            break;        
        case 1:
            MPVQdeenum(10, 10, LS_indA, idxA, y);
            for (uint8_t n=10; n < 16; n++)
            {
                y[n] = 0;
            }
            break;
        case 2:
            MPVQdeenum(16, 8, LS_indA, idxA, y);
            break;
        case 3:
            MPVQdeenum(16, 6, LS_indA, idxA, y);
            break;
    }
#if 0
	float yNorm = 0;
    for (uint8_t n=0; n < 16; n++)
    {
        //yNorm += y[n]*(y[n]*1.0);
        yNorm += y[n]*y[n];
    }
    yNorm = std::sqrt(yNorm);
#else
    int64_t yNorm0 = 0;
    for (uint8_t n = 0; n < 8; n++)
    {
		//yNorm0 += y[n]*y[n];
        __smlald_(y32s[n], y32s[n], yNorm0);
    }
    float yNorm = __vsqrt((float)yNorm0);
#endif
    // Note: we skipped intermediate signal xq_shape_j and applied yNorm
    //  directly together with G_gain_i_shape_j

    float G_gain_i_shape_j = sns_vq_far_adj_gains[gain_i]; // default initialization to avoid warnings
    switch (shape_j)
    {
        case 0:
            G_gain_i_shape_j = sns_vq_reg_adj_gains[gain_i];
            break;
        case 1:
            G_gain_i_shape_j = sns_vq_reg_lf_adj_gains[gain_i];
            break;
        case 2:
            G_gain_i_shape_j = sns_vq_near_adj_gains[gain_i];
            break;
        case 3:
            G_gain_i_shape_j = sns_vq_far_adj_gains[gain_i];
            break;
    }
    if (0.0 != yNorm) // do we have to make this even more robust???
    {
        G_gain_i_shape_j /= yNorm;
    }

    // Synthesis of the Quantized SNS scale factor vector
    // int32_t scfQ[16];
    //int32_t st1[16];
    auto st1 = scfQ;
    for (uint8_t n = 0; n < 8; n++)
    {
        st1[n] = LFCB16[ind_LF][n];
        st1[n + 8] = HFCB16[ind_HF][n];
    }
    for (uint8_t n = 0; n < 16; n++)
    {
#if 0
        float factor=0;
        for (uint8_t col=0; col < 16; col++)
        {
            factor += y[col] * D[n][col];
        }
        scfQ[n] = st1[n] + G_gain_i_shape_j * factor;
        //scfQ[n] = __vfma(G_gain_i_shape_j , factor, st1[n]);
#else
        int64_t factor = 0;
        int32_t* Dn = (int32_t*)D16[n];
        for (uint8_t col = 0; col < 8; col++)
        {
            //factor += (float)y[col] * Dn[col];
            //factor = __vfma(y[col],Dn[col],factor);
            __smlald_(y32s[col], Dn[col], factor);
        }
        scfQ[n] = st1[n] + (int32_t)(G_gain_i_shape_j * factor);
        //scfQ[n] = st1[n] + G_gain_i_shape_j * (float)factor * (1.0f / 65536.f);
        //scfQ[n] = __vfma(G_gain_i_shape_j, (float)factor, st1[n]);
#endif
    }

    // 3.4.7.3 SNS scale factors interpolation  (d09r02_F2F)
    int32_t scfQint[64];
    scfQint[0] = scfQ[0];
    scfQint[1] = scfQ[0];
    for (uint8_t n=0; n <= 14; n++)
    {
        //scfQint[4*n+2] = scfQ[n] + (1.0/8.0 * (scfQ[n+1] - scfQ[n]));
        //scfQint[4*n+3] = scfQ[n] + (3.0/8.0 * (scfQ[n+1] - scfQ[n]));
        //scfQint[4*n+4] = scfQ[n] + (5.0/8.0 * (scfQ[n+1] - scfQ[n]));
        //scfQint[4*n+5] = scfQ[n] + (7.0/8.0 * (scfQ[n+1] - scfQ[n]));

        int n4 = n << 2;// n * 4;
        auto scf = (scfQ[n + 1] - scfQ[n]) >> 3;// *(1.0f / 8.0f);
        auto scf2 = scf + scf;
        scf += scfQ[n];
        scfQint[n4 + 2] = scf; scf += scf2;//(1.0f * scf);
        scfQint[n4 + 3] = scf; scf += scf2;//(3.0f * scf);
        scfQint[n4 + 4] = scf; scf += scf2;//(5.0f * scf);
        scfQint[n4 + 5] = scf; //scf += scf2;//(7.0f * scf);
    }
    {
        //scfQint[62] = scfQ[15] + 1 / 8.0 * (scfQ[15] - scfQ[14]);
        //scfQint[63] = scfQ[15] + 3 / 8.0 * (scfQ[15] - scfQ[14]);
        auto scf = (scfQ[15] - scfQ[14]) >> 3;// *(1.0f / 8.0f);
        auto scf2 = scf + scf;
        scf += scfQ[15];
        scfQint[62] = scf;
        scfQint[63] = scf + scf2;
    }

    // add special handling for _cfg.N_b=60 (happens for 7.5ms and fs=8kHz)
    // see section 3.4.7.3 SNS scale factors interpolation (d1.0r03 including Errata 15036)
#if 0
    const uint8_t n2 = 64 - _cfg.N_b;
    if ( n2 != 0 )
    {

        for (uint8_t i=0; i < n2; i++)
        {
            //scfQint[i] = (scfQint[2*i]+scfQint[2*i+1])/2;
            scfQint[i] = (scfQint[i << 1] + scfQint[(i << 1) + 1]) >> 1;// *0.5f;
        }
        for (uint8_t i=n2; i < _cfg.N_b; i++)
        {
            scfQint[i] = scfQint[i+n2];
        }
    }
#else
    if(_cfg.N_b < 32){
        const uint8_t n4 = __vcvta_s32(__vabs(1 - 32.f / _cfg.N_b) * _cfg.N_b);
        const uint8_t n2 = _cfg.N_b - n4;
        for (int i = 0; i < n4; i++) {
            scfQint[i] = (scfQint[i << 2] + scfQint[(i << 2) + 1] + scfQint[(i << 2) + 2] + scfQint[(i << 2) + 3]) >> 2;
        }
        auto n44 = n4 << 2;
        for (int i = 0; i < n2; i++) {
            scfQint[n4 + i] = (scfQint[n44 + (i << 1)] + scfQint[n44 + (i << 1) + 1]) >> 1;
        }
    }else if(_cfg.N_b < 64){
        const uint8_t n2 = 64 - _cfg.N_b;
        for (uint8_t i=0; i < n2; i++)
        {
            //scfQint[i] = (scfQint[2*i]+scfQint[2*i+1])/2;
            scfQint[i] = (scfQint[i << 1] + scfQint[(i << 1) + 1]) >> 1;// *0.5f;
        }
        for (uint8_t i=n2; i < _cfg.N_b; i++)
        {
            scfQint[i] = scfQint[i+n2];
        }
    }
#endif

    /*float g_SNS[64];
    for (uint8_t b = 0; b < _cfg.N_b; b++)
    {
        g_SNS[b] = exp2(scfQint[b]);
    }*/

    // 3.4.7.4 Spectral Shaping   (d09r02_F2F)
    //for (b=0; b<𝑁𝑏; b++)
    for (uint8_t b=0; b<_cfg.N_b; b++)
    {
        //auto sns = exp2(scfQint[b]*(1.f/65536.f));
        auto v = scfQint[b];
        auto va = abs(v);
        auto v0 = va >> 16;
        auto v1 = va & 0xffff;
        auto y = (1u << v0) * _exp2x1024[(v1 + 32) >> 6];
        if (v != va)
            y = 1.f / y;
        auto sns = y;
        //for (k=𝐼𝑓𝑠 (𝑏); k< 𝐼𝑓𝑠 (𝑏 + 1); k++)
        for (uint16_t k=I_fs[b]; k < I_fs[b+1] ; k++)
        {
            //𝑋 ̂(𝑘) = 𝑋𝑆 ̂(𝑘) ∙ 𝑔𝑆𝑁𝑆 (𝑏)
            //X_hat_ss[k] = X_s_tns[k] * g_SNS[b];
            spec[k] = spec[k] * sns;
        }
    }

}

void SpectralNoiseShaping::registerDatapoints()
{
}

