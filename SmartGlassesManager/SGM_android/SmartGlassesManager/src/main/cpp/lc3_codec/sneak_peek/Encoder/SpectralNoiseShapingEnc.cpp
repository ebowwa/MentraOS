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
#include "BandIndexTables.hpp"
#include "SnsQuantizationTables.hpp"
#include <cmath>
#define fix_mul_add(a, b, sum) sum = sum + ((int64_t)(a) * (b) >> 16)
#define fix_mul_sub(a, b, sum) sum = sum - ((int64_t)(a) * (b) >> 16)
#define fix_mul(a, b) (int64_t)(a) * (b) >> 16

using namespace sneak::enc;

static const uint8_t g_tilt_table[5] = {
    14, //fs= 8000
    18, //fs=16000
    22, //fs=24000
    26, //fs=32000
    30  //fs=44100, 48000
};

//static const float w[6] = {
//    1.0/12,
//    2.0/12,
//    3.0/12,
//    3.0/12,
//    2.0/12,
//    1.0/12
//};
static const int16_t w[6] = {
        (int16_t)(1.0/12*65536),
        (int16_t)(2.0/12*65536),
        (int16_t)(3.0/12*65536),
        (int16_t)(3.0/12*65536),
        (int16_t)(2.0/12*65536),
        (int16_t)(1.0/12*65536)
};

SpectralNoiseShaping::SpectralNoiseShaping(const Lc3Config& cfg, const uint16_t* const I_fs_)
    :Lc3Base(cfg),

    //g_tilt(g_tilt_table[_cfg.Fs_ind]),
    //fix_exponent_part(pow(10.0f, g_tilt* (1.0f / (10.0f * 63.0f)))),
    pow10(pow(10.0f, g_tilt_table[_cfg.Fs_ind] * (1.0f / (10.0f * 63.0f)))),
    //X_S(nullptr),
    noise_floor(pow(2.0f, -32)),
    //I_fs(I_fs_),
    I_fs(cfg._I_fs),
    snsQuantization(cfg)
{
    //X_S = AllocT<float>(_cfg.NE);
}

SpectralNoiseShaping::~SpectralNoiseShaping()
{    
    //Free(X_S);
}

uint8_t SpectralNoiseShaping::get_ind_LF()
{
    return snsQuantization.ind_LF;
}

uint8_t SpectralNoiseShaping::get_ind_HF()
{
    return snsQuantization.ind_HF;
}

uint8_t SpectralNoiseShaping::get_shape_j()
{
    return snsQuantization.shape_j;
}

uint8_t SpectralNoiseShaping::get_Gind()
{
    return snsQuantization.Gind;
}

int32_t SpectralNoiseShaping::get_LS_indA()
{
    return snsQuantization.LS_indA;
}

int32_t SpectralNoiseShaping::get_LS_indB()
{
    return snsQuantization.LS_indB;
}

uint32_t SpectralNoiseShaping::get_index_joint_j()
{
    return snsQuantization.index_joint_j;
}

void SpectralNoiseShaping::run(const float* const X, float* Y, const float* E_B, bool F_att, float* temp)
{
    dbgCodecCp();
    // 3.3.7.2 SNS analysis  (d09r06_FhG)
    // 3.3.7.2.1 Padding  (d09r06_FhG)
    float* E_B_patched = temp;// [N_b] ; // TODO: can we optimize out this buffer that is needed for a rare case only?
    temp += N_b;
#if 0
    const uint8_t n2 = N_b - _cfg.N_b;
    for (uint8_t i = 0; i < n2; i++)
    {
        // Note: at the inverse operation (see end of this function) there is a factor 0.5.
        //       Is this definition consistent?
        E_B_patched[i + i + 0] = /*0.25f * */E_B[i]; 
        E_B_patched[i + i + 1] = /*0.25f * */E_B[i];
    }
    for (uint8_t i = 0; i < _cfg.N_b; i++)
    {
        E_B_patched[n2 + n2 + i] = /*0.25f * */E_B[n2 + i];
    }
#else
    if (_cfg.N_b < 32)
    {
        const uint8_t n4 = 32 - _cfg.N_b;//__vcvta_s32(__vabs(1 - 32.f / _cfg.N_b) * _cfg.N_b);
        const uint8_t n2 = _cfg.N_b - n4;
        for (uint8_t i = 0; i < n4; i++) {
            E_B_patched[i << 2] = E_B_patched[i];
            E_B_patched[(i << 2) + 1] = E_B_patched[i];
            E_B_patched[(i << 2) + 2] = E_B_patched[i];
            E_B_patched[(i << 2) + 3] = E_B_patched[i];
        }
        auto n42 = n4 << 1;
        for (uint8_t i = n4; i < _cfg.N_b; i++) {
            E_B_patched[(i << 1) + n42] = E_B_patched[i];
            E_B_patched[(i << 1) + 1 + n42] = E_B_patched[i];
        }
    }else
    {
        const uint8_t n2 = N_b - _cfg.N_b;
        for (uint8_t i = 0; i < n2; i++)
        {
            // Note: at the inverse operation (see end of this function) there is a factor 0.5.
            //       Is this definition consistent?
            E_B_patched[i + i + 0] = /*0.25f * */E_B[i];
            E_B_patched[i + i + 1] = /*0.25f * */E_B[i];
        }
        for (uint8_t i = 0; i < _cfg.N_b; i++)
        {
            E_B_patched[n2 + n2 + i] = /*0.25f * */E_B[n2 + i];
        }
    }
#endif


    // 3.3.7.2.1 Smoothing  (d09r02_F2F)
    float* E_local = temp;// [N_b] ;  // Note: memory will be re-used step-by-step    
    temp += N_b;
    //int16_t E_fix[N_b+2];//5.10
    int16_t* E_fix = (int16_t*)E_local;//N_b+2
    auto E_local_fix = E_fix + 1;
    {
        //float* E_S = E_local;
        float* E_P = E_local;
        float noiseFloor = noise_floor;
        //
        auto v = E_B_patched[0] + E_B_patched[0] + E_B_patched[0] + E_B_patched[1];
        auto vv = v * 0.25f;
        E_P[0] = vv;
        auto E_total = vv;
        auto pow10v = pow10 * 0.25f;
        for (uint8_t b = 1; b < N_b - 1; b++)
        {
            //auto v = 0.25f * E_B_patched[b - 1] + 0.5f * E_B_patched[b] + 0.25f * E_B_patched[b + 1];
            auto v = E_B_patched[b - 1] +  E_B_patched[b] +  E_B_patched[b] +  E_B_patched[b + 1];       
            auto vv = v * pow10v;
            E_P[b] = vv;
            E_total += vv;
            pow10v *= pow10;
        }
        //v = 0.25f * E_B_patched[N_b - 2] + 0.75f * E_B_patched[N_b - 1];
        v = E_B_patched[N_b - 2] + E_B_patched[N_b - 1] + E_B_patched[N_b - 1] + E_B_patched[N_b - 1];
        vv = v * pow10v;
        E_P[N_b - 1] = vv;
        E_total += vv;
        //
        static const float scale = (1.0f / 64.f * pow(10.0, -40.f / 10.f));
        E_total *= scale;// (1.0f / 64.f * pow(10.0, -40.f / 10.f));
        //E_total *= pow(10.0, -40.f / 10.f);
        if (noiseFloor < E_total){
            noiseFloor = E_total;
        }
        //
        //float* E_P2 = E_local;
        for (uint8_t b = 0; b < N_b; b++){
            //E_P2[b] = (E_P[b] > noiseFloor) ? E_P[b] : noiseFloor;
            auto E_P_b = E_P[b];
            //_E_P_max = std::max(_E_P_max, std::abs(E_P_b));
            if (E_P_b < noiseFloor)
                E_P_b = noiseFloor;
            //
            //E_P[b] = log2(1e-31 + E_P[b]) * 0.5f;
            {//log2
                E_P_b += 1e-31;
                int exp = 0;
                if (E_P_b < 1.f) {
                    while (E_P_b < 1.f) {
                        E_P_b *= 2;
                        exp--;
                    }
                }
                else if (E_P_b > 2.f) {
                    while (E_P_b > 0x80000000) {
                        E_P_b /= 0x80000000;
                        exp += 31;
                    }
                    int lead_zero = __clz((int)E_P_b);
                    auto e = 31 - lead_zero;
                    E_P_b /= 1 << e;
                    exp += e;
                }
                auto y = (int)((E_P_b - 1.f) * 1024);
                //int32_t res = (exp + _log2x1024[y]) * 65536;
                //E_P[b] = res * 0.5f;
                int32_t res = (int)((exp << (8 + 1)) + _log2x1024[y] * (256 * 2));//5.10
                E_local_fix[b] = res;//(int32_t)(E_P[b] * 65536); //16 bit point
            }
        }
        E_fix[0] = E_fix[1];
        E_fix[N_b + 1] = E_fix[N_b];
    }
#if 0
    // 3.3.7.2.2 Pre-emphasis (d09r02_F2F)
    float* E_P = E_local;
    {
        //const float fix_exponent_part = g_tilt * (1.0f / (10.0f * 63.0f));
        //const auto pow10 = pow(10.0f, g_tilt * (1.0f / (10.0f * 63.0f));
        auto pow10v = 1.0f;
        for (uint8_t b = 0; b < N_b; b++)
        {
            //E_P[b] = E_S[b] * pow( 10.0, b*fix_exponent_part);
            E_P[b] = E_S[b] * pow10v;
            //auto test = E_S[b] * pow10v;
            pow10v *= pow10;
        }
    }
#endif
    // 3.3.7.2.3 Noise floor (d09r02_F2F)
#if 0
    float noiseFloor = pow(2.0, -32);
    {
        float E_total = 0;
        for (uint8_t b = 0; b < N_b; b++)
        {
            E_total += E_P[b];
        }
        E_total /= 64;
        E_total *= pow(10.0, -40 / 10);
        if (E_total > noiseFloor)
        {
            noiseFloor = E_total;
        }
    }
#endif
#if 0
    float* E_P2 = E_local;
    for (uint8_t b = 0; b < N_b; b++)
    {
        E_P2[b] = (E_P[b] > noiseFloor) ? E_P[b] : noiseFloor;
    }
#endif
    // 3.3.7.2.4 Logarithm (d09r02_F2F)
    //float* E_L = E_local;  
    //auto E_L = E_local_fix;
#if 0
    for (uint8_t b = 0; b < N_b; b++)
    {
        E_L[b] = log2(1e-31 + E_P2[b]) * 0.5f;
    }
#endif
    // 3.3.7.2.5 Band energy grouping (d09r02_F2F)
    //float E_L4[Nscales];    
    //float E4_total = 0;
    //int16_t E_L4[Nscales];
    int16_t* E_L4 = E_fix+N_b+2;//Nscales
    int32_t E4_total = 0;
    {        
        auto E_L32 = (int32_t*)E_fix;
        auto w32 = (int32_t*)w;
        for (auto b2 = 0; b2 < 16; b2++) {
            int32_t sum = 0;
            auto e32 = &E_L32[b2 << 1];
            for (uint8_t k = 0; k < 3; k++) {
                sum = __smlad(w32[k], e32[k], sum);//16+8
            }
            //_sum_max = std::max(_sum_max, std::abs(sum));
            //E_local[b2] = sum / 65536.f / 256.f / 4;
            sum >>= 16;
            E_L4[b2] = sum;//5.10            
            E4_total += sum;//5.10
        }
        //E4_total *= 1.0f/Nscales;
        //E4_total = fix_mul(65536/Nscales, E4_total);
        E4_total >>= 4;
    }
    // 3.3.7.2.7 Mean removal and scaling, attack handling (d09r06_FhG)
#if 0
    float E4_total = 0;
    {//avg
        for (uint8_t b2 = 0; b2 < Nscales; b2++)
        {
            E4_total += E_L4[b2];
        }
        E4_total /= Nscales;
    }
#endif
    //float scf_buffer[Nscales];
    //float* scf_0 = scf;
    //int16_t scf_buffer[Nscales];
    //int16_t* scf_buffer = E_L4 + Nscales;// [Nscales] ;
    //auto scf_0 = scf;
    //if (F_att)
    //{
    //    scf_0 = scf_buffer;
    //}
    auto scf = E_L4;
    for (uint8_t b2=0; b2 < Nscales; b2++){
        //scf_0[b2] = 0.85 * (E_L4[b2] -  E4_total);
		//adjust 5.10->3.12
        auto sc = ((E_L4[b2] - E4_total)<<2) * 85 / 100;
        scf[b2] = sc;//3.12 
    }
    if (F_att)
    {
        // Note:
        //  This section is not covered by intermediate encoder output
        //  in section C.3. "Encoder intermediate output"  (d09r02_F2F)
        auto scf_0 = scf;
        auto scf_1 = scf+ Nscales;
        int32_t scf_1_total = 0;
        //scf_1_total += scf_1[0] = (scf_0[0] + scf_0[1] + scf_0[2]) * (1.0f / 3.0f);
        //scf_1_total += scf_1[1] = (scf_0[0] + scf_0[1] + scf_0[2] + scf_0[3]) * (1.f/ 4.f);
        scf_1_total += scf_1[0] = (scf_0[0] + scf_0[1] + scf_0[2] )/3;
        scf_1_total += scf_1[1] = (scf_0[0] + scf_0[1] + scf_0[2] + scf_0[3]) >> 2;
        auto sum = (scf_0[0] + scf_0[1] + scf_0[2] + scf_0[3]);
        for (uint8_t n=2; n <= 13; n++)
        {            
            /*auto sum = 0.f;
            for (int8_t m=-2; m <= 2; m++)
            {
                sum += scf_0[n+m];
            }*/
            sum += scf_0[n + 2];
            //scf_1_total += scf_1[n] = sum * (1.f/5.f);
            //scf_1_total += scf_1[n] = fix_mul(sum, (int32_t)(65536/5));
            scf_1_total += scf_1[n] = sum/5;
            sum -= scf_0[n - 2];
        }
        //scf_1_total += scf_1[14] = (scf_0[12] + scf_0[13] + scf_0[14] + scf_0[15]) * (1.f / 4.f);
        //scf_1_total += scf_1[15] = (scf_0[13] + scf_0[14] + scf_0[15]) * (1.f / 3.f);
        scf_1_total += scf_1[14] = (scf_0[12] + scf_0[13] + scf_0[14] + scf_0[15]) >> 2;
        scf_1_total += scf_1[15] = (scf_0[13] + scf_0[14] + scf_0[15])/3;
        //{
        //    _cfg.log("scf_0", scf_0, sizeof(float)*Nscales);
        //    _cfg.log("scf_1", scf_1, sizeof(float)*Nscales);
        //}
#if 0
        float scf_1_total = 0;
        //avg
        for (uint8_t b=0; b<Nscales; b++)
        {
            scf_1_total += scf_1[b];
        }
#endif
        //scf_1_total *= 1.0f/Nscales;
        //scf_1_total = fix_mul(scf_1_total, 65536/Nscales);
        scf_1_total >>= 4;
        //
        //const float f_att = (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 0.5f : 0.3f;
        static const int32_t f_att = (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) ? (0.3f * 65536) : (0.5f * 65536);
        for (uint8_t n=0; n<Nscales; n++){
            //scf[n] = f_att * (scf_1[n] - scf_1_total);
            scf[n] = __smulwb(f_att, scf_1[n] - scf_1_total);
        }
    }
    // 3.3.7.3 SNS quantization (d09r02_F2F)
    snsQuantization.run(scf, temp);

    // 3.3.7.4 SNS scale factors interpolation (d09r02_F2F)
    //const float* scfQ = snsQuantization.scfQ;
    int32_t* scfQint = (int32_t*)E_local;// [N_b] ;
    {
        auto scfQ = snsQuantization.scfQ;
        //float tmp_scfQ[Nscales];
        //for (uint8_t n = 0; n<Nscales; n++)
        //{
        //    scfQ[n] *= 4;
        //}
        //float scfQint[N_b];
        //int32_t scfQint[N_b];        
        scfQint[0] = scfQ[0];
        scfQint[1] = scfQ[0];
        for (uint8_t n = 0; n <= 14; n++){
            auto n4 = n << 2;
            //auto scf8 = fix_mul(1.0f / 8.0f * 65536, scfQ[n + 1] - scfQ[n]);
            auto scf8 = (scfQ[n + 1] - scfQ[n]) >> 3;
            auto scf4 = scf8 + scf8;
            auto scfv = scfQ[n] + scf8;
            scfQint[n4 + 2] = scfv; scfv += scf4;//scfQ[n] + (1.0/8.0 * (scfQ[n+1] - scfQ[n]));
            scfQint[n4 + 3] = scfv; scfv += scf4;//scfQ[n] + (3.0/8.0 * (scfQ[n+1] - scfQ[n]));
            scfQint[n4 + 4] = scfv; scfv += scf4;//scfQ[n] + (5.0/8.0 * (scfQ[n+1] - scfQ[n]));
            scfQint[n4 + 5] = scfv; //scfv += scf4;//scfQ[n] + (7.0/8.0 * (scfQ[n+1] - scfQ[n]));
        }
        {
            //auto scf8 = fix_mul(1.0f / 8.0f * 65536, scfQ[15] - scfQ[14]);
            auto scf8 = (scfQ[15] - scfQ[14]) >> 3;
            auto scf4 = scf8 + scf8;
            auto scfv = scfQ[15] + scf8;
            scfQint[62] = scfv;         //scfQ[15] + 1 / 8.0 * (scfQ[15] - scfQ[14]);
            scfQint[63] = scfv + scf4;  //scfQ[15] + 3 / 8.0 * (scfQ[15] - scfQ[14]);
        }

        // add special handling for N_b_in=60 (happens for 7.5ms and fs=8kHz)
        // (see end of section 3.3.7.4 SNS scale factors interpolation (d09r06_FhG)
#if 0
        for (uint8_t i = 0; i < n2; i++){
            int i2 = i << 1;
            scfQint[i] = (scfQint[i2] + scfQint[i2 + 1]) >> 1; // *0.5
        }
        if (n2 != 0){
            // code is consistent with Errata 15012 (see d1.0r03)
            for (uint8_t i = n2; i < _cfg.N_b; i++) {
                scfQint[i] = scfQint[i + n2];
            }
        }
#else
        if (_cfg.N_b < 32) {
            const uint8_t n4 = __vcvta_s32(__vabs(1 - 32.f / _cfg.N_b) * _cfg.N_b);
            const uint8_t n2 = _cfg.N_b - n4;
            for (int i = 0; i < n4; i++) {
                scfQint[i] = (scfQint[i << 2] + scfQint[(i << 2) + 1] + scfQint[(i << 2) + 2] + scfQint[(i << 2) + 3]) >> 2;
            }
            auto n44 = n4 << 2;
            for (int i = 0; i < n2; i++) {
                scfQint[n4 + i] = (scfQint[n44 + (i << 1)] + scfQint[n44 + (i << 1) + 1]) >> 1;
            }
        }
        else if (_cfg.N_b < 64)
        {
            const uint8_t n2 = N_b - _cfg.N_b;
            for (uint8_t i = 0; i < n2; i++) {
                int i2 = i << 1;
                scfQint[i] = (scfQint[i2] + scfQint[i2 + 1]) >> 1; // *0.5
            }
            if (n2 != 0) {
                // code is consistent with Errata 15012 (see d1.0r03)
                for (uint8_t i = n2; i < _cfg.N_b; i++) {
                    scfQint[i] = scfQint[i + n2];
                }
            }
        }
#endif
    }
    // The scale factors are transformed back into the linear domain
    //for (uint8_t b = 0; b < _cfg.N_b; b++)
    //{
    //    g_SNS[b] = exp2(-scfQint[b]);
    //}

    // 3.3.7.5 Spectral shaping (d09r02_F2F)
    for (uint8_t b=0; b < _cfg.N_b; b++){
        //auto sns = exp2(-scfQint[b]);
        auto v = -scfQint[b];
        auto va = abs(v);
        //if (va < 32)continue;//y==1.0f
        auto v0 = va >> 16;
        auto v1 = va & 0xffff;
        auto y = (1u << v0) * _exp2x1024[(v1 + 32) >> 6];
        if (v != va)
            y = 1.f / y;
        auto sns = y;
        //printf("[%d]%f\n", b, sns);
        for (uint16_t k=I_fs[b]; k < I_fs[b+1] ; k++) {
            //X_S[k] = X[k] * g_SNS[b];
            Y[k] = X[k] * sns;// g_SNS[b];
        }
    }

}


void SpectralNoiseShaping::registerDatapoints()
{
    

    {
        //_cfg.addDatapoint( "scf", &scf[0], sizeof(float)*Nscales );
        //_cfg.addDatapoint( "g_sns", &g_SNS[0], sizeof(float)*N_b );
        //_cfg.addDatapoint( "X_S", &X_S[0], sizeof(float)*_cfg.NE );

        //snsQuantization.registerDatapoints();
    }
}
