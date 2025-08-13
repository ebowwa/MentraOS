/*
 * LongTermPostfilter.cpp
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

#include "LongTermPostfilter.hpp"
#include "LongTermPostfilterCoefficients.hpp"
#include <cmath>
#include <algorithm>

using namespace sneak::enc;

LongTermPostfilter::LongTermPostfilter(const Lc3Config& cfg) 
    :Lc3Base(cfg),
    _cfg(cfg),
    //len12p8( (_cfg.N_ms==Lc3Config::FrameDuration::d7p5ms) ? 96 : 128),
    //len6p4( (_cfg.N_ms==Lc3Config::FrameDuration::d7p5ms) ? 48 : 64),
    D_LTPF( (_cfg.N_ms==Lc3Config::FrameDuration::d7p5ms) ? 44 : 24),
    P( getP(_cfg.Fs) ),
    P_times_res_fac( (_cfg.Fs == 8000) ? 192000/8000/2 : getP(_cfg.Fs) ),
    gain_ltpf_on(0),
    pitch_index(0),
    pitch_present(0),
    ltpf_active(0),
    nbits_LTPF(0),
    T_prev(k_min),
    mem_pitch(0),
    mem_ltpf_active(0),
    mem_nc(0),
    mem_mem_nc(0),
    x_s_extended(nullptr),
    x_tilde_12p8D_extended(nullptr)

{
    if (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) {
        len12p8 = 128;
        len6p4 = 64;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms){
        len12p8 = 96;
        len6p4 = 48;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
        len12p8 = 64;
        len6p4 = 24;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d2p5ms){
        len12p8 = 32;
        len6p4 = 16;
    }
    //int c = 240 / P + _cfg.NF;
    int c = 240 / P * 2;
    x_s_extended = AllocT<float>(c);
    for (uint16_t n=0; n < c; n++)
    {
        x_s_extended[n]=0;
    }
    //
    c = len12p8 + D_LTPF + Nmem12p8D;
    x_tilde_12p8D_extended = AllocT<float>(c);
    for (uint16_t n=0; n < c; n++)
    {
        x_tilde_12p8D_extended[n] = 0;
    }
    //
    h50_mem[0] = 0.0;
    h50_mem[1] = 0.0;
    //
    c = 64 + k_max;
    x_6p4_extended = AllocT<float>(c);
    for (uint8_t n=0; n < c; n++)
    {
        x_6p4_extended[n] = 0;
    }
    //
    R_12p8 = AllocT<float>(256);
}

LongTermPostfilter::~LongTermPostfilter()
{
    Free(x_s_extended);
    Free(x_tilde_12p8D_extended);
    Free(x_6p4_extended);
    Free(R_12p8);
}
void LongTermPostfilter::update(uint16_t nbits) {
    gain_ltpf_on = getGainLtpfOn(nbits, _cfg);
}
uint8_t LongTermPostfilter::getP(uint16_t fs)
{
    // Note: we assume that the calling code ensures that
    //       only valid fs values are provided
    if (fs==44100)
    {
        return 4;
    }
    else
    {
        return 192000/fs;
    }
}

uint8_t LongTermPostfilter::getGainLtpfOn(uint16_t nbits, const Lc3Config& _cfg)
{
    // this is derived from pseudo-code in section 3.4.9.4 (d1.0r03) referenced
    // by Errata 15013; since the encode just needs to check gain_ltpf != 0,
    // the full code needed in the decoder is reduced to the simple computation of
    // gain_ltpf_on instead of gain_ltpf
    {
        uint16_t t_nbits =  nbits;

        if (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) {
            t_nbits =  __vcvta_u32(10.f/7.5f*nbits);
        }else if (_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
            t_nbits = (nbits << 1) - 160;
        }else if (_cfg.N_ms == Lc3Config::FrameDuration::d2p5ms){
            t_nbits = (nbits << 2) * 0.6f;
        }

        if (t_nbits < 560 + _cfg.Fs_ind*80)
        {
            return 1;
        }
        else
        {
            return 0;
        }
    }

}
#if 0
LongTermPostfilter& LongTermPostfilter::operator= ( const LongTermPostfilter & src)
{
    // TODO we should assert, that NF is equal in src and *this!
    T_prev          = src.T_prev;
    mem_pitch       = src.mem_pitch;
    mem_ltpf_active = src.mem_ltpf_active;
    mem_nc          = src.mem_nc;
    mem_mem_nc      = src.mem_mem_nc;
    for (uint16_t n=0; n<240/P+_cfg.NF; n++)
    {
        x_s_extended[n] = src.x_s_extended[n];
    }
    for (uint16_t n=0; n<len12p8+D_LTPF+Nmem12p8D; n++)
    {
        x_tilde_12p8D_extended[n] = src.x_tilde_12p8D_extended[n];
    }
    h50_mem[0] = src.h50_mem[0];
    h50_mem[1] = src.h50_mem[1];
    for (uint8_t n=0; n<64+k_max; n++)
    {
        x_6p4_extended[n] = src.x_6p4_extended[n];
    }

    return *this;
}
#endif

uint8_t LongTermPostfilter::pitchDetection(float& normcorr)
{
    //3.3.9.5 Pitch detection algorithm  (d09r02_F2F)
    const float* x_tilde_12p8D = &x_tilde_12p8D_extended[Nmem12p8D];
    static const float h_2[5] = {
            0.1236796411180537f, 0.2353512128364889f, 0.2819382920909148f,
            0.2353512128364889f, 0.1236796411180537f};

    float* x_6p4 = &x_6p4_extended[k_max]; // define current view on this signal
    for (uint8_t n = 0; n < len6p4; n++)
    {
        auto sum = 0.f;        
        auto x12p8 = &x_tilde_12p8D[(n<<1)-3];
        for (uint8_t k = 0; k < 5; k++)
        {
        	__vfma_(x12p8[k], h_2[k], sum);
            //x_6p4[n] += x_tilde_12p8D[2*n+k-3] * h_2[k];
        }
        x_6p4[n] = sum;
    }
    //
    float R_6p4[k_max-k_min+1];
    float R_w_6p4[k_max-k_min+1];
    uint8_t T1 = k_min;
    static float f_max_min = 0.5f / (k_max - k_min); // 0.5*k_k_min/(k_max - k_min)
    R_6p4[0] = 0.f;
    {
    	auto sum = 0.f;
    	for (uint8_t n = 0; n < len6p4; n++)
        {
        	__vfma_(x_6p4[n], x_6p4[n-k_min], sum);
        }
        R_6p4[0] = sum;
    }
    R_w_6p4[0] = R_6p4[0];
    float R_w_6p4_max = R_w_6p4[0];
    {
    	uint8_t k_k_min = 1;
        float w = 0.f;
        for (uint8_t k = k_min+1; k <= k_max; k++, k_k_min++)
        {
			
			R_6p4[k_k_min] = 0.f;
            auto sum = 0.f;
            for (uint8_t n = 0; n < len6p4; n++)
            {
            	__vfma_(x_6p4[n], x_6p4[n-k], sum);
            }
            R_6p4[k_k_min] = sum;
            w = 1.f - k_k_min * f_max_min;
            R_w_6p4[k_k_min] = w * R_6p4[k_k_min];
            if (R_w_6p4[k_k_min] > R_w_6p4_max)
            {
            	R_w_6p4_max = R_w_6p4[k_k_min];
                T1 = k;
            }
        }
    }

    {
    	//_cfg.log("R_6p4", &R_6p4[0], sizeof(float)*(k_max-k_min+1));
        //_cfg.log("R_w_6p4", &R_w_6p4[0], sizeof(float)*(k_max-k_min+1));
    }
    uint8_t k_s_min = (k_min < (T_prev-4))
    	? (T_prev-4) : k_min;
    uint8_t k_s_max = (k_max >(T_prev+4))
    	? (T_prev+4) : k_max;
    uint8_t T2 = k_s_min;
    float R_6p4_max = R_6p4[k_s_min-k_min];
    {
    	uint8_t k_k_min = k_s_min + 1 - k_min;
        for (uint8_t k = k_s_min+1; k <= k_s_max; k++, k_k_min++)
        {
        	if (R_6p4[k_k_min] > R_6p4_max)
            {
            	R_6p4_max = R_6p4[k_k_min];
                T2 = k;
            }
        }

    }
    //uint8_t T1 = k_min;
    //float R_w_6p4_max = R_w_6p4[0];
    //for (uint8_t k = k_min+1; k <= k_max; k++)
    //{
    //    if (R_w_6p4[k-k_min] > R_w_6p4_max)
    //    {
    //        R_w_6p4_max = R_w_6p4[k-k_min];
    //        T1 = k;
    //    }
    //}
    // the following is not working with the static const members
    //const uint8_t k_s_min = std::max( k_min, static_cast<uint8_t>(T_prev-4));
    //const uint8_t k_s_max = std::min( k_max, static_cast<uint8_t>(T_prev+4) );
    //uint8_t k_s_min = (k_min < (T_prev-4))
    //                ? (T_prev-4) : k_min;
    //uint8_t k_s_max = (k_max > (T_prev+4))
    //                ? (T_prev+4) : k_max;
    //uint8_t T2 = k_s_min;
    //float R_6p4_max = R_6p4[k_s_min-k_min];
    //for (uint8_t k = k_s_min+1; k <= k_s_max; k++)
    //{
    //    if (R_6p4[k-k_min] > R_6p4_max)
    //    {
    //        R_6p4_max = R_6p4[k-k_min];
    //        T2 = k;
    //    }
    //}

    // compute normalized correlation
    const uint8_t corr_len = len6p4;
    float normvalue0 = compute_normvalue(x_6p4, corr_len, 0);
    float normvalue1 = compute_normvalue(x_6p4, corr_len, T1);
    float normvalue = __vsqrt(normvalue0*normvalue1);
    float normcorr1 = 0.f; // is this a proper initialization?
    if (normvalue > 0.f)
    {
        normcorr1 = R_6p4[T1-k_min] / normvalue;
    }
    if (normcorr1 < 0.f) // implements max(0,normcorr1) from eq. (90) in (d09r06_KLG_AY_NH_FhG, 2019-12-20)
    {
        normcorr1 = 0.f;
    }
    float normcorr2 = normcorr1;
    if (T1 != T2)
    {
        float normvalue2 = compute_normvalue(x_6p4, corr_len, T2);
        normvalue = __vsqrt(normvalue0*normvalue2);
        if (normvalue > 0.f)
        {
            normcorr2 = R_6p4[T2-k_min] / normvalue;
        }
        if (normcorr2 < 0.f) // implements max(0,normcorr2) from eq. (90) in (d09r06_KLG_AY_NH_FhG, 2019-12-20)
        {
            normcorr2 = 0.f;
        }
    }
    uint8_t T_curr = T1;
    normcorr = normcorr1;
    if ( normcorr2 > 0.85f*normcorr1 )
    {
        T_curr   = T2;
        normcorr = normcorr2;
    }


    {
        //_cfg.log("T1", &T1, sizeof(T1) );
        //_cfg.log("T2", &T2, sizeof(T2) );
        //_cfg.log("T_curr", &T_curr, sizeof(T_curr) );
        //_cfg.log("T_prev", &T_prev, sizeof(T_prev) );
        //_cfg.log("normcorr1", &normcorr1, sizeof(normcorr1) );
        //_cfg.log("normcorr2", &normcorr2, sizeof(normcorr2) );
        //_cfg.log("normcorr", &normcorr, sizeof(normcorr) );
    }

    return T_curr;
}

float LongTermPostfilter::interp(const float* R_12p8, uint8_t pitch_int_rel, int8_t d)
{
    int8_t n0 = -16-d;
    auto tbl = &tab_ltpf_interp_R[15];
    auto xs = &R_12p8[pitch_int_rel];
    /*while (n0 < -15) 
    {
        n0 += 4;
    }*/
    auto err = -15 - n0;
    if (err > 0) {
        err = (err + 3) >> 2 << 2;
        n0 += err;
    }
    //
    //int8_t n1 = 16;
    float interp_d = 0;
    for (int8_t n = n0; n < 16; n+=4)
    {
        int8_t m = (n+d)>>2;
        //interp_d += R_12p8[pitch_int_rel + m] * tab_ltpf_interp_R[n+15];
        __vfma_(xs[m], tbl[n], interp_d);
    }    
	return interp_d;
}

void LongTermPostfilter::pitchLagParameter(uint8_t T_curr, uint8_t& pitch_int, int8_t& pitch_fr)
{
    // 3.3.9.7 LTPF pitch-lag parameter    (d09r02_F2F)
    uint8_t k_ss_min = (32 > (2*T_curr-4))
                    ? 32 : (2*T_curr-4);
    uint8_t k_ss_max = (228 < (2*T_curr+4))
                    ? 228 : (2*T_curr+4);

    const float* x_tilde_12p8D = &x_tilde_12p8D_extended[Nmem12p8D];
    //float R_12p8[k_ss_max+4-(k_ss_min-4)+1];
    //float*R_12p8=(float*)alloca((k_ss_max+4-(k_ss_min-4)+1)*sizeof(float));
    float R_12p8_max = 0.f;
    pitch_int = k_ss_min;
	uint8_t k_ss_min_4 = k_ss_min-4;
    uint8_t k_ss_max_4 = k_ss_max+4;
    uint8_t k_k_ss_min_4 = 0;
    for (uint8_t k = k_ss_min_4; k <= k_ss_max_4; k++, k_k_ss_min_4++)
    {
    	float corrv = 0.f;
        auto n_k = -k;
        for (uint8_t n = 0; n < len12p8; n++, n_k++)
        {
        	__vfma_(x_tilde_12p8D[n], x_tilde_12p8D[n_k], corrv);
            //corrv += x_tilde_12p8D[n] * x_tilde_12p8D[n-k];
        }
        R_12p8[k_k_ss_min_4] = corrv;
        if ((corrv > R_12p8_max) && (k>=k_ss_min) && (k<=k_ss_max))
        {
			R_12p8_max = corrv;
            pitch_int = k;
        }
    }

    {
        //_cfg.log("R12.8", &R_12p8[0], sizeof(float)*17 ); //Note: sometimes less than 17 values are given; ignore this for debugging purpose
    }

    uint8_t pitch_int_rel = pitch_int - k_ss_min_4;
    pitch_fr=0;
    if (32 == pitch_int)
    {
        float interp_d_max = 0;
        for (int8_t d=0; d <= 3; d++)
        {
            float interp_d = interp(R_12p8, pitch_int_rel, d);
            if (interp_d > interp_d_max)
            {
                interp_d_max = interp_d;
                pitch_fr = d;
            }
        }
    }
    else if ( (127 > pitch_int) && (pitch_int > 32) )
    {
        float interp_d_max = 0;
        for (int8_t d=-3; d <= 3; d++)
        {
            float interp_d = interp(R_12p8, pitch_int_rel, d);
            if (interp_d > interp_d_max)
            {
                interp_d_max = interp_d;
                pitch_fr = d;
            }
        }
    }
    else if ( (157 > pitch_int) && (pitch_int >= 127) )
    {
        float interp_d_max = 0;
        for (int8_t d=-2; d <= 2; d+=2)
        {
            float interp_d = interp(R_12p8, pitch_int_rel, d);
            if (interp_d > interp_d_max)
            {
                interp_d_max = interp_d;
                pitch_fr = d;
            }
        }
    }

    if (pitch_fr < 0)
    {
        pitch_int--;
        pitch_fr += 4;
    }

    if (127 > pitch_int)
    {
        pitch_index = 4*static_cast<uint16_t>(pitch_int) + pitch_fr - 128;
    }
    else if ( (157 > pitch_int) && (pitch_int >= 127) )
    {
        pitch_index = 2*static_cast<uint16_t>(pitch_int) + pitch_fr/2 + 126;
    }
    else
    {
        pitch_index = static_cast<uint16_t>(pitch_int) + 283;
    }
}

float LongTermPostfilter::x_i_n_d(int16_t n, int8_t d)
{
    const float* x_tilde_12p8D = &x_tilde_12p8D_extended[Nmem12p8D+n];
    auto tbl = &tab_ltpf_interp_x12k8[7];
    float result = 0;
    int8_t h_i_index0 = -8-d;
    /*while (h_i_index0 < -7) {
        h_i_index0 += 4;
    }*/
    auto err = -7 - h_i_index0;
    if (err > 0) {
        err = (err + 3) >> 2 << 2;
        h_i_index0 += err;
    }
    int8_t h_i_index1 = 8;
    for (int8_t h_i_index = h_i_index0; h_i_index < h_i_index1; h_i_index += 4) 
    {
        int8_t k = (h_i_index+d) >> 2;
        __vfma_(x_tilde_12p8D[-k], tbl[h_i_index], result);
    }
    return result;    
}


void LongTermPostfilter::activationBit(uint8_t pitch_int, uint8_t pitch_fr, uint8_t near_nyquist_flag, float& nc, float& pitch)
{
    // Note: given tests confirm that float is sufficient (at least for 16 bit PCM input)
    float nc_numerator = 0;
    float nc_norm1 = 0;
    float nc_norm2 = 0;
    for (uint8_t n=0; n < len12p8; n++)
    {
        float x_i_n_0 = x_i_n_d(n, 0);
        float x_i_n_shifted = x_i_n_d(static_cast<int16_t>(n) - static_cast<int16_t>(pitch_int), static_cast<int8_t>(pitch_fr));

        __vfma_(x_i_n_0, x_i_n_shifted, nc_numerator);
        __vfma_(x_i_n_0, x_i_n_0, nc_norm1);
        __vfma_(x_i_n_shifted, x_i_n_shifted, nc_norm2);
        //nc_numerator += x_i_n_0 * x_i_n_shifted;
        //nc_norm1     += x_i_n_0 * x_i_n_0;
        //nc_norm2     += x_i_n_shifted * x_i_n_shifted;
    }
    float nc_denominator = sqrt( nc_norm1 * nc_norm2 );
    nc = 0; // Is this ok? Or should we set other values for nc_denominator==0
    if (nc_denominator > 0)
    {
        nc = nc_numerator / nc_denominator;
    }

    {
        //_cfg.log("nc_num", &nc_numerator, sizeof(nc_numerator) );
        //_cfg.log("nc_den", &nc_denominator, sizeof(nc_denominator) );
        //_cfg.log("nc", &nc, sizeof(nc) ); // somewhat redundant to "nc_ltpf", but never zeroed due to pitch_present
    }

    pitch = pitch_int + pitch_fr/4.f;

    // part of 3.3.9.8 LTPF activation bit including Errata 15013 (see d1.0r03) and Errate 15250
    if ( (gain_ltpf_on != 0) && (near_nyquist_flag==0) )
    {
        if (
            ( (mem_ltpf_active==0) && ( (_cfg.N_ms==Lc3Config::FrameDuration::d10ms) || (mem_mem_nc>0.94) ) &&
              (mem_nc>0.94) && (nc>0.94) ) ||
            ( (mem_ltpf_active==1) && (nc>0.9)) ||
            ( (mem_ltpf_active==1) && (fabs(pitch-mem_pitch)<2) && ((nc-mem_nc)>-0.1) && (nc>0.84) )
           )
        {
            ltpf_active = 1;
        }
        else
        {
            ltpf_active = 0;
        }
    }
    else
    {
        ltpf_active = 0;
    }

}

void LongTermPostfilter::run(const float* const x_s_, uint8_t near_nyquist_flag)
{dbgCodecCp();
    // not to compute pitch if can't active ltpf.
    if ((!gain_ltpf_on) || (near_nyquist_flag)) {
        nbits_LTPF = 1;
        return;
    }
    // 3.3.9.2 Time-domain signals  (d09r02_F2F)
    // ...just some Notes on dependencies on samples in the previous block

    // shift x_tilde_12p8D_extended by one frame
    uint16_t D_LTPF_Nmem12p8D = D_LTPF+Nmem12p8D;
    for (uint16_t n = 0; n < D_LTPF_Nmem12p8D; n++)
    {
        x_tilde_12p8D_extended[n] = x_tilde_12p8D_extended[n+len12p8];
    }
    // shift x_6p4_extended by one frame
    for (uint8_t n = 0; n < k_max; n++)
    {
        x_6p4_extended[n] = x_6p4_extended[n+len6p4];
    }
    // 3.3.9.3 Resampling  (d09r02_F2F)    
    auto x_12p8 = &x_tilde_12p8D_extended[D_LTPF_Nmem12p8D];      
    resample12p8(x_s_, x_12p8);

    // 3.3.9.4 High-pass filtering  (d09r02_F2F)
    filterH50(x_12p8); // in-place

    //3.3.9.5 Pitch detection algorithm  (d09r06_FhG)
    float normcorr=0;
    uint8_t T_curr = pitchDetection(normcorr);


    // 3.3.9.7 LTPF pitch-lag parameter    (d09r02_F2F)
    uint8_t pitch_int;
    int8_t pitch_fr;
    pitchLagParameter(T_curr, pitch_int, pitch_fr);

    // 3.3.9.8 LTPF activation bit   (d09r06_FhG)
    float nc = 0;
    float pitch = 0;
    activationBit(pitch_int, pitch_fr, near_nyquist_flag, nc, pitch);


    // 3.3.9.6 LTPF Bitstream  (d09r06_KLG_AY_NH_FhG, 2019-12-20)
    pitch_present = (normcorr > 0.6f) ? 1 : 0;

    nbits_LTPF = (0==pitch_present) ? 1 : 11;

    if (0==pitch_present)
    {
        // resetting of these variables not found explicitly within the specification, but the
        // specified intermediate encoder results suggest that the reset is needed here
        pitch_index = 0;
        nc = 0;
    }


    {
        //_cfg.log("pitch_int", &pitch_int, sizeof(pitch_int) );
        //_cfg.log("pitch_fr", &pitch_fr, sizeof(pitch_fr));
        //_cfg.log("nc_ltpf", &nc, sizeof(nc) );
        //_cfg.log("mem_ltpf_active", &mem_ltpf_active, sizeof(mem_ltpf_active) );
        //_cfg.log("mem_nc_ltpf", &mem_nc, sizeof(mem_nc) );
    }

    // prepare states for next run
    T_prev = T_curr;
    mem_mem_nc = mem_nc;
    if (0==pitch_present)
    {
        mem_pitch = 0;
        mem_ltpf_active = 0;
        mem_nc = 0;
    }
    else
    {
        mem_pitch = pitch;
        mem_ltpf_active = ltpf_active; // is it ok to set this here?
        mem_nc = nc;
    }
}
#if 1
void LongTermPostfilter::resample12p8(const float* const in, float* out) {
    dbgCodecCp();
    ///|----P_240----|----P_240----|------------NF-P_240------------|
    ///|-----old-----|---overlay---|-------------other--------------|
    ///|---------x_s_extended------|
    ///              |----------------------in----------------------|
    int16_t P_120 = 120 / P;
    int16_t P_240 = 240 / P;
    int16_t n15_0 = 15 / P;
    int16_t n15_1 = 15 % P;
    int16_t n15_p0 = -P_120;// n15 / P - P_120;
    int16_t n15_p1 = 0;// -n15 % P;
    int16_t P_120P = P_120 * P;
    auto h_12p8 = &tab_resamp_filter[119 - P_120P + P];
    auto h_12p8_0 = &tab_resamp_filter[0];
    auto h_12p8_1 = &tab_resamp_filter[239];
    auto xs0 = x_s_extended + P_240;
    ///copy overlay data
    for (int n = 0; n < P_240; n++) {
        xs0[n] = in[n];
    }
    xs0 -= P_120 - 1;
    auto xs1 = in - P_120 + 1;//&in[-P_120 + 1];
    const float* xs = xs0;
    for (int16_t n = 0; n < len12p8; n++) {
        if (n15_p0 >= P_120)
            xs = xs1;
        const float* x_sx = xs + n15_p0;        
        auto h_12p8x = h_12p8 - n15_p1;
        auto sum = 0.f;
        while (h_12p8x < h_12p8_1) {
            __vfma_(*x_sx, *h_12p8x, sum);
            x_sx++;
            h_12p8x += P;
        }
        //
        out[n] = sum * P_times_res_fac; // P x res_fac according to Errata 15217
        //
        n15_p0 += n15_0;
        n15_p1 += n15_1;
        if (n15_p1 >= P) {
            n15_p0++;
            n15_p1 -= P;
        }
    }
    ///save old data
    xs1 = in + _cfg.NF - P_240;
    for (int n = 0; n < P_240; n++) {
        x_s_extended[n] = xs1[n];
    }
}
#endif
#if 0
void LongTermPostfilter::resample12p8(const float* const in, float* out) {
    dbgCodecCp();
    ///|----P_240----|----------------------NF----------------------|x_s_extended
    ///|-----old-----|----------------------in----------------------|
    // shift x_s_extended by one frame and append new input "in" 
    uint16_t P_240 = 240 / P;
    auto x_s_ = x_s_extended + P_240;
    {        
        auto x_old = x_s_extended + _cfg.NF;
        for (uint16_t m = 0; m < P_240; m++) {
            x_s_extended[m] = x_old[m];
        }
        for (uint16_t m = 0; m < _cfg.NF; m++) {
            x_s_[m] = in[m];
        }
    }    
    //
    int16_t P_120 = 120 / P;
    int16_t n15_0 = 15 / P;
    int16_t n15_1 = 15 % P;
    int16_t n15_p0 = -P_120;// n15 / P - P_120;
    int16_t n15_p1 = 0;// -n15 % P;
    int16_t P_120P = P_120 * P;
    auto h_12p8 = &tab_resamp_filter[119 - P_120P + P];
    auto h_12p8_0 = &tab_resamp_filter[0];
    auto h_12p8_1 = &tab_resamp_filter[239];
    auto x_s = &x_s_[-P_120 + 1];
    for (int16_t n = 0; n < len12p8; n++) {
        auto x_sx = x_s + n15_p0;
        auto h_12p8x = h_12p8 - n15_p1;
        auto sum = 0.f;
        while (h_12p8x < h_12p8_1) {
            __vfma_(*x_sx, *h_12p8x, sum);
            x_sx++;
            h_12p8x += P;
        }
        //
        out[n] = sum * P_times_res_fac; // P x res_fac according to Errata 15217
        //
        n15_p0 += n15_0;
        n15_p1 += n15_1;
        if (n15_p1 >= P) {
            n15_p0++;
            n15_p1 -= P;
        }
    }
}
#endif
#if 0
void LongTermPostfilter::resample12p8(const float* const in, float* out) {
    dbgCodecCp();
    ///|----P_240----|----------------------NF----------------------|x_s_extended
    ///|-----old-----|----------------------in----------------------|
    int16_t P_120 = 120 / P;
    int16_t n15_0 = 15 / P;
    int16_t n15_1 = 15 % P;
    int16_t n15_p0 = -P_120;// n15 / P - P_120;
    int16_t n15_p1 = 0;// -n15 % P;
    int16_t P_120P = P_120 * P;
    auto h_12p8 = &tab_resamp_filter[119 - P_120P + P];
    auto h_12p8_0 = &tab_resamp_filter[0];
    auto h_12p8_1 = &tab_resamp_filter[239];
    auto x_s = &in[-P_120 + 1];
    for (int16_t n = 0; n < len12p8; n++) {
        auto x_sx = x_s + n15_p0;
        auto h_12p8x = h_12p8 - n15_p1;
        auto sum = 0.f;
        while (h_12p8x < h_12p8_1) {
            __vfma_(*x_sx, *h_12p8x, sum);
            x_sx++;
            h_12p8x += P;
        }
        //
        out[n] = sum * P_times_res_fac; // P x res_fac according to Errata 15217
        //
        n15_p0 += n15_0;
        n15_p1 += n15_1;
        if (n15_p1 >= P) {
            n15_p0++;
            n15_p1 -= P;
        }
    }
}
#endif
#if 0
void LongTermPostfilter::resample12p8(const float const* in, float* out) {dbgCodecCp();
    auto h_12p8 = &tab_resamp_filter[119];
    uint16_t P_120 = 120 / P;
    int n15 = 0;
    for (int16_t n = 0; n < len12p8; n++, n15 += 15) {
        int16_t n15_p_P_120 = n15 / P - P_120;
        int16_t n15_P = -n15 % P;
        int16_t index_h = P;//_n15_P - 120;
        auto x_sx = &in[n15_p_P_120];
        auto h_12p8x = &h_12p8[n15_P];
        auto sum = x_sx[0] * h_12p8x[0];
        int16_t k = 1;
        for (; k < P_120; k++, index_h += P) {
            __vfma_(x_sx[+k], h_12p8x[+index_h], sum);
            __vfma_(x_sx[-k], h_12p8x[-index_h], sum);
        }
        if (n15_P + index_h < 120) {
            __vfma_(x_sx[+k], h_12p8x[+index_h], sum);
            //__vfma_(x_sx[-k], h_12p8x[-index_h], sum);
        }
        out[n] = sum * P_times_res_fac; // P x res_fac according to Errata 15217
        printf("[%d]%f,%d,%d\n",n,out[n], n15_p_P_120, n15_P);
    }
}
#endif
#if 0
void LongTermPostfilter::resample12p8(const float const* in, float* out) {dbgCodecCp();
    auto h_12p8 = &tab_resamp_filter[119];
    for (int16_t n = 0; n < len12p8; n++){
        float sum = 0.f;
        for (int16_t k = -120 / P; k <= 120 / P; k++){
            const int16_t index_x_s = (15 * n) / P + k - 120 / P;
            const int16_t index_h = P * k - ((15 * n) % P);
            if ((-120 < index_h) && (index_h < 120)){
                sum += in[index_x_s] * h_12p8[index_h];
            }
        }
        out[n] = sum * P_times_res_fac; // P x res_fac according to Errata 15217
    }
}
#endif

float LongTermPostfilter::compute_normvalue(const float* const x, uint8_t L, uint8_t T)
{
    float normvalue = 0.f;
    int L_T = L - T;
    for (int n = -T; n < L_T; n++)
    {
    	//__vfma_(x[n_T], x[n_T], normvalue);
    	__vfma_(x[n], x[n], normvalue);
        //normvalue += x[n-T]*x[n-T];
    }
    return normvalue;
}

void LongTermPostfilter::filterH50(float* xy) // operate in-place
{
    // TODO: check whether this implementation in Direct-Form_II
    //       is appropriate here (mainly in terms of robustness)
    const float b0 = 0.9827947082978771f;
    const float b1 = -1.965589416595754f;
    const float b2 = 0.9827947082978771f;
    const float a1 = -1.9652933726226904f;
    const float a2 = 0.9658854605688177f;
    float* x = xy;
    float* y = xy;
    float v = 0.f;
    auto m0 = h50_mem[0];
    auto m1 = h50_mem[1];
    for (uint8_t n = 0; n < len12p8; n++)
    {
    	//v          = x[n] - a1*m0 - a2*m1;
        //y[n]       = b0*v + b1*m0 + b2*m1;
        v = __vmls(a2 , m1 , __vmls(a1, m0, x[n]));
        y[n] = __vmla(b0 , v , __vmla(b1 , m0 , (b2 * m1)));
        m1 = m0;
        m0 = v;
    }
    h50_mem[0] = m0;
    h50_mem[1] = m1;
}


void LongTermPostfilter::registerDatapoints()
{ 
    {
        //_cfg.addDatapoint( "x_tilde_12.8D", &x_tilde_12p8D_extended[Nmem12p8D], sizeof(float)*(len12p8+1) );
        //_cfg.addDatapoint( "x_tilde_12.8D_ext", &x_tilde_12p8D_extended[0], sizeof(float)*(len12p8+D_LTPF+Nmem12p8D) );
        //_cfg.addDatapoint( "x_6p4", &x_6p4_extended[k_max], sizeof(float)*64 );
        //
        //_cfg.addDatapoint( "pitch_index", &pitch_index, sizeof(pitch_index) );
        //_cfg.addDatapoint( "pitch_present", &pitch_present, sizeof(pitch_present) );
        //_cfg.addDatapoint( "ltpf_active", &ltpf_active, sizeof(ltpf_active) );
        //_cfg.addDatapoint( "nbits_LTPF", &nbits_LTPF, sizeof(nbits_LTPF) );
    }
}

