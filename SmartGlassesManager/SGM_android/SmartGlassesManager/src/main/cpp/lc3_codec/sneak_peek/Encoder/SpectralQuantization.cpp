/*
 * SpectralQuantization.cpp
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

#include "SpectralQuantization.hpp"
#include "SpectralDataTables.hpp"
#include <cmath>
#include <algorithm>
//#include "smf_debug.h"

using namespace sneak::enc;
//for test
//int _estimation_count = 0;
//int _quantize_count = 0;
//int _SpectralQuantization_count = 0;
//int _SpectralQuantization_cnt[64] = { 0 };
//
SpectralQuantization::SpectralQuantization(const Lc3Config&cfg)
    :Lc3Base(cfg),
    NE(cfg.NE),
    fs_ind(cfg.Fs_ind),
    //X_q(nullptr),
    lastnz(0),
    nbits_trunc(0),
    rateFlag(0),
    lsbMode(0),
    gg(0),
    lastnz_trunc(0),
    gg_ind(0),    
    gg_off(0),
    gg_min(0),
    nbits_offset(0),
    nbits_spec(0),
    nbits_spec_adj(0),
    nbits_est(0),
    reset_offset_old(false),
    nbits_offset_old(0),
    nbits_spec_old(0),
    nbits_est_old(0),
	gg_ind_last(0),
    pow2_31(pow(2.0f, -31.0f)),
    log2_10(log2(10))
{
    //X_q = AllocT<int16_t>(NE);
    //E = AllocT<float>(NE / 4);
}

SpectralQuantization::~SpectralQuantization()
{
    //Free(X_q);
    //Free(E);
}

void SpectralQuantization::updateGlobalGainEstimationParameter(uint16_t nbits, uint16_t nbits_spec_local)
{dbgCodecCp();
    if (reset_offset_old)
    {
        nbits_offset = 0;
    }
    else
    {
        nbits_offset =
            0.8 * nbits_offset_old +
            0.2 * __vminnm(40.f,__vmaxnm(-40.f,nbits_offset_old + nbits_spec_old - nbits_est_old));
    }

    nbits_spec_adj = static_cast<uint16_t>( nbits_spec_local + nbits_offset + 0.5);

    gg_off = -__vminnm( 115, nbits / (10*(fs_ind+1)) )
             - 105 - 5*(fs_ind+1);
}

void SpectralQuantization::computeSpectralEnergy(const float* X_f, float* E)
{
    dbgCodecCp();
    //const float _2_31 = std::pow(2.0f, -31.0f);
    auto NE_4 = NE>>2;
    //const float log2_10 = std::log2(10);
    for (uint16_t k=0; k < NE_4; k++)
    {
        float sum = pow2_31;//std::pow(2.0f, -31.0f);
        auto k4 = k << 2;
        auto Xs = X_f + k4;
        for (uint8_t n=0; n<=3; n++)
        {
            //sum += X_f[k4 + n]*X_f[k4 + n];
            //auto v = X_f[k4 + n];
            auto v = Xs[n];
            __vmla_(v,v,sum);
        }
		//log2(x)
        int exp = 0;
        if (sum<1.f) {
            while (sum<1.f) {
                sum *= 2;
                exp--;
            }
        }else if (sum>2.f) {
            while (sum>0x80000000) {
                sum /= 0x80000000;
                exp += 31;
            }
            int lead_zero = __clz((int)sum);
            auto e = 31-lead_zero;
            sum /= 1<<e;
            exp += e;
        }
        auto y = (int)((sum-1.f)*1024);
        auto res = exp + _log2x1024[y];
		//
        E[k] = (10.f * 28.0f / 20.0f)*res/log2_10;
        //E[k] = (10.f * 28.0f / 20.0f) * log10( sum );
    }
#if 0
    auto sum = _2_31;
    for (auto i = 0; i < NE; i++) {
        auto v = X_f[i];
        __vmla_(v, v, sum);
        if ((i & 3) == 3) {
            E[i>>2] = (10.f * 28.0f / 20.0f) * log10(sum);
            sum = _2_31;
        }
    }
#endif
}
void SpectralQuantization::globalGainEstimation(const float* X_f, float* E, float X_f_sum_new) {
    //auto E = temp;
    //float E[NE/4];
    //float*E=(float*)alloca(NE/4*sizeof(float));
    if (gg_ind_last == 0) {///for first frame
        computeSpectralEnergy(X_f, E);
        globalGainEstimation(E);
    }
    else if (X_f_sum) {///other
        auto diff = (X_f_sum_new - X_f_sum) / std::min(X_f_sum_new, X_f_sum);
        int err = diff * 10;
        auto err_abs = abs(err);
        //for test
        //if (err_abs > 63) 
        //    err_abs = 63;
        //_SpectralQuantization_cnt[err_abs]++;

        if (err_abs > 48) {///recompute gg_ind
            computeSpectralEnergy(X_f, E);
            globalGainEstimation(E);
        }
        else {///adjust gg_ind
            int limit = 12;
            if (err_abs > limit) {
                err = err > 0 ? limit : -limit;
            }
            gg_ind = gg_ind_last + err;
        }
    }
    else {//use last gg_ind.
        gg_ind = gg_ind_last;
    }
    //
    if (gg_ind > 255)gg_ind = 255;
}
void SpectralQuantization::globalGainEstimation(const float* E)
{
    dbgCodecCp();
    // converted pseudo-code from page 49/50  (d09r02_F2F)
    int16_t fac = 256;
    //𝑔𝑔𝑖𝑛𝑑 = 255;
    gg_ind = 255;
    int nbits_spec_adj0 = (int)(nbits_spec_adj* (1.4f * 28.f / 20.0f));
    auto NE_4 = NE>>2;
    for (uint8_t iter = 0; iter < 8; iter++)
    {
        fac >>= 1;
        //𝑔𝑔𝑖𝑛𝑑 -= fac;
        gg_ind -= fac;
        float tmp = 0;
        uint8_t iszero = 1;       
        float ggidx = gg_ind + gg_off;
        float ggidx2 = ggidx + ggidx;
        auto ggidx43 = ggidx + (43.0f*28.0f/20.0f);
        auto ggidx7 = ggidx - (7.0f*28.0f/20.0f);
        auto ggidx236 = ggidx2 + (36.0f*28.0f/20.0f);
        //for (i = 𝑁𝐸/4-1; i >= 0; i--)
        //for (int8_t i = 0; i < NE_4; i++)
        for (int8_t i = NE_4 - 1; i >= 0; i--)
        {
            auto e28_20 = E[i];// *(28.0f / 20.0f);
            //if (E[i]*28/20 < (𝑔𝑔𝑖𝑛𝑑+𝑔𝑔𝑜𝑓𝑓))
            if (e28_20 < ggidx)
            {
                //if (iszero == 0)
                //{
                //    tmp += (2.7f*28.0f/20.0f);
                //}
                __vfma_(2.7f*28.0f/20.0f, (float)(!iszero), tmp);
            }
            //if ((𝑔𝑔𝑖𝑛𝑑+𝑔𝑔𝑜𝑓𝑓) <= E[i]*28/20 - 43*28/20)
            else if (e28_20 <= ggidx43){//ggidx + (43.0f*28.0f/20.0f)) {
                //tmp += E[i]*28/20 – (𝑔𝑔𝑖𝑛𝑑+𝑔𝑔𝑜𝑓𝑓) + 7*28/20;
                tmp += e28_20 - ggidx7;//ggidx + (7.0f*28.0f/20.0f);
                iszero = 0;
            }
            else {
                //tmp += 2*E[i]*28/20 – 2*(𝑔𝑔𝑖𝑛𝑑+𝑔𝑔𝑜𝑓𝑓) - 36*28/20;
                tmp += e28_20 + e28_20 - ggidx236;//ggidx2 - (36.0f*28.0f/20.0f);
                iszero = 0;
            }

            //else
            //{
            //    //if ((𝑔𝑔𝑖𝑛𝑑+𝑔𝑔𝑜𝑓𝑓) < E[i]*28/20 - 43*28/20)
            //    //if (ggidx < e28_20 - (43.0f*28.0f/20.0f))
            //    if (e28_20 > ggidx + (43.0f*28.0f/20.0f))
            //    {
            //        //tmp += 2*E[i]*28/20 – 2*(𝑔𝑔𝑖𝑛𝑑+𝑔𝑔𝑜𝑓𝑓) - 36*28/20;
            //        tmp += e28_20 + e28_20 - ggidx2 - (36.0f*28.0f/20.0f);
            //    }
            //    else
            //    {
            //        //tmp += E[i]*28/20 – (𝑔𝑔𝑖𝑛𝑑+𝑔𝑔𝑜𝑓𝑓) + 7*28/20;
            //        tmp += e28_20 - ggidx + (7.0f*28.0f/20.0f);
            //    }
            //    iszero = 0;
            //}
            if ((tmp > nbits_spec_adj0) && (iszero == 0))
            {
                //𝑔𝑔𝑖𝑛𝑑 += fac;
                gg_ind += fac;
                break;
            }
        }
        //if (tmp > 𝑛𝑏𝑖𝑡𝑠𝑠𝑝𝑒𝑐′ *1.4*28/20 && iszero == 0)
        //if ( (tmp > nbits_spec_adj0) && (iszero == 0) )
        //{
        //    //𝑔𝑔𝑖𝑛𝑑 += fac;
        //    gg_ind += fac;
        //}
    }
	//for test
    //_estimation_count++;
	//
}

bool SpectralQuantization::globalGainLimitation()
{
    // -> not precisely clear where this limitation should occur
    // -> Is the following converted pseudo code meant?
    // -> Are the chosen datatypes appropriate?
    //float X_f_max = 0;
    if (X_f_max > 0)
    {
        gg_min = ceil(28*log10(X_f_max/(32768-0.375))) - gg_off;
    }
    else
    {
        gg_min = 0;
    }
    bool reset_offset = false;
    //if (𝑔𝑔𝑖𝑛𝑑 < 𝑔𝑔𝑚𝑖𝑛 || 𝑋𝑓𝑚𝑎𝑥 == 0)
    if ((gg_ind < gg_min) || X_f_max == 0)
    {
        //𝑔𝑔𝑖𝑛𝑑 = 𝑔𝑔𝑚𝑖𝑛;
        //𝑟𝑒𝑠𝑒𝑡𝑜𝑓𝑓𝑠𝑒𝑡 = 1;
        gg_ind = gg_min;
        reset_offset = true;
    }
    else
    {
        //𝑟𝑒𝑠𝑒𝑡𝑜𝑓𝑓𝑠𝑒𝑡 = 0;
        reset_offset = false;
    }
    return reset_offset;
}

void SpectralQuantization::quantizeSpectrum(const float* const X_f, int16_t*X_q)
{
    dbgCodecCp();
    if (gg_ind > 255)gg_ind = 255;
    gg = pow(10.f, (gg_ind+gg_off)/28.0f );
    auto gg_ = 1.0f / gg;
    int lastnz0 = 0;
    for (uint16_t n=0; n < NE; n++)
    {
        if (X_f[n]){
            auto diff = (X_f[n] > 0) ? 0.375f : -0.375f;
           // X_q[n] = X_f[n]* gg_ + 0.375f;
            X_q[n] = (int16_t)__vmla(X_f[n], gg_ , diff);
            if (X_q[n]) {
                lastnz0 = n;
            }
        }
        /*else if(X_f[n] < 0)
        {
            //X_q[n] = X_f[n]* gg_ - 0.375f;
            X_q[n] = (int16_t)__vnmls(X_f[n], gg_ , 0.375f);
            lastnz0 = n;
        }*/
        else {
            X_q[n] = 0;            
        }
    }
    lastnz0++;
    if (lastnz0&1) {
        lastnz0++;
    }
    lastnz = lastnz0;
	//for test
    //_quantize_count++;
}

uint8_t SpectralQuantization::computeBitConsumption(const int16_t* const X_q,uint16_t nbits)
{
    dbgCodecCp();
    //if (nbits > (160 + 𝑓𝑠𝑖𝑛𝑑 * 160))
    auto fs_ind160 = fs_ind * 160;
    if (nbits > (160 + fs_ind160))
    {
        rateFlag = 512;
    }
    else
    {
        rateFlag = 0;
    }
    uint8_t modeFlag = 0;
    //if (nbits >= (480 + 𝑓𝑠𝑖𝑛𝑑 * 160))
    if (nbits >= (480 + fs_ind160))
    {
        modeFlag = 1;
    }
    else
    {
        modeFlag = 0;
    }

    //lastnz = 𝑁𝐸;
    /*lastnz = NE;
    //while (lastnz>2 && 𝑋𝑞[lastnz-1] == 0 && 𝑋𝑞[lastnz-2] == 0)
    while ( (lastnz>2) && (X_q[lastnz-1] == 0) && (X_q[lastnz-2] == 0) )
    {
        lastnz -= 2;
    }*/

    //𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 = 0;
    //𝑛𝑏𝑖𝑡𝑠𝑡𝑟𝑢𝑛𝑐 = 0;
    //𝑛𝑏𝑖𝑡𝑠𝑙𝑠𝑏 = 0;
    uint32_t nbits_est_local = 0;
    uint32_t nbits_trunc_local = 0;
    nbits_lsb = 0;
    lastnz_trunc = 2;
    uint16_t c = 0;
    auto NE_2 = NE >> 1;
    for (uint16_t n = 0; n < lastnz; n=n+2)
    {
        uint16_t t = c + rateFlag;
        //if (n > 𝑁𝐸/2)
        if (n > NE_2)
        {
            t += 256;
        }
        //a = abs(𝑋𝑞[n]);
        uint16_t a = abs(X_q[n]);
        uint16_t a_lsb = a;
        //b = abs(𝑋𝑞[n+1]);
        uint16_t b = abs(X_q[n+1]);
        uint16_t b_lsb = b;
        uint16_t lev = 0;
        //while (max(a,b) >= 4)
        uint8_t pki;
        uint16_t m = a > b ? a : b;
        //while (max(a,b) >= 4)
        //{dbgCodecCp(); 
        auto X_q_nozero = 0;
        if (a_lsb > 0)
        {
            nbits_est_local += 2048;
            X_q_nozero = 1;
        }
        if (b_lsb > 0) 
        {
            nbits_est_local += 2048;
            X_q_nozero = 1;
        }
        //{dbgCodecCp();
        if (m >= 4) 
        {
            pki = ac_spec_lookup[t];
            //𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 += ac_spec_bits[pki][16];
            nbits_est_local += ac_spec_bits[pki][16];
            if (modeFlag == 1)
            {
                //𝑛𝑏𝑖𝑡𝑠𝑙𝑠𝑏 += 2;
                nbits_lsb += 2;
                //a_lsb >>= 1;
                //b_lsb >>= 1;
                //if (a_lsb == 0 && 𝑋𝑞[n] != 0)
                if (a_lsb == 1)
                {
                    //𝑛𝑏𝑖𝑡𝑠𝑙𝑠𝑏++;
                    nbits_lsb++;
                }
                //if (b_lsb == 0 && 𝑋𝑞[n+1] != 0)
                if (b_lsb == 1)
                {
                    //𝑛𝑏𝑖𝑡𝑠𝑙𝑠𝑏++;
                    nbits_lsb++;
                }
            }else{
                //𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 += 2*2048;
                nbits_est_local += (2*2048);
            }
            a >>= 1;
            b >>= 1;
            m >>= 1;
            //lev = std::min(lev+1, 3);
            lev++;
            //lev = lev < 3 ? lev : 3;
            while (m >= 4)
            {
                //pki = ac_spec_lookup[t+lev*1024];
                pki = ac_spec_lookup[t+(lev<<10)];
                //𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 += ac_spec_bits[pki][16];
                nbits_est_local += ac_spec_bits[pki][16];
                //𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 += 2*2048;
                nbits_est_local += (2*2048);
                a >>= 1;
                b >>= 1;
                m >>= 1;
                lev++;
                lev = lev < 3 ? lev : 3;
            }
            pki = ac_spec_lookup[t+(lev<<10)];
            //uint16_t sym = a + 4*b;
            uint16_t sym = a + (b<<2);
            //𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 += ac_spec_bits[pki][sym];
            nbits_est_local += ac_spec_bits[pki][sym];
            if (lev > 1)
            {
                t = 12 + lev;
            }
            else
            {
                t = 1 + ((a+b)<<1);
            }
        }else{
            pki = ac_spec_lookup[t];
            //uint16_t sym = a + 4*b;
            uint16_t sym = a + (b<<2);
            //𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 += ac_spec_bits[pki][sym];
            nbits_est_local += ac_spec_bits[pki][sym];
            t = 1 + a + b;
        }
        //}
        //pki = ac_spec_lookup[t+lev*1024];
        
        //a_lsb = abs(𝑋𝑞[n]); -> implemented earlier
        //b_lsb = abs(𝑋𝑞[n+1]); -> implemented earlier
        //𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 += (min(a_lsb,1) + min(b_lsb,1)) * 2048;
        //nbits_est_local += (std::min(a_lsb,static_cast<uint16_t>(1))
        //              + std::min(b_lsb,static_cast<uint16_t>(1))) * 2048;
        // alternative implementation (more clear, more performant?)

        //if ((𝑋𝑞[n] != 0 || 𝑋𝑞[n+1] != 0) && (𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 <= 𝑛𝑏𝑖𝑡𝑠𝑠𝑝𝑒𝑐*2048))
        //if (((X_q[n] != 0) || (X_q[n+1] != 0)) && (nbits_est_local <= nbits_spec*2048))
        //if (((X_q[n] != 0) || (X_q[n+1] != 0)) && (ceil(nbits_est_local/2048.0) <= nbits_spec))
        //{dbgCodecCp();
        //if (((X_q[n] != 0) || (X_q[n+1] != 0)) && (((nbits_est_local+2047)>>11) <= nbits_spec))
        if(X_q_nozero && (((nbits_est_local+2047)>>11) <= nbits_spec))
        {
            lastnz_trunc = n + 2;
            //𝑛𝑏𝑖𝑡𝑠𝑡𝑟𝑢𝑛𝑐 = 𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡;
            nbits_trunc_local = nbits_est_local;
        }
        //c = (c&15)*16 + t;
        c = ((c&15)<<4) + t;
        //}
    }
    //𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 = ceil(𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡/2048) + 𝑛𝑏𝑖𝑡𝑠𝑙𝑠𝑏;
    //nbits_est = ceil(nbits_est_local/2048.0) + nbits_lsb;
    nbits_est = ((nbits_est_local+2047)>>11) + nbits_lsb;
    //𝑛𝑏𝑖𝑡𝑠𝑡𝑟𝑢𝑛𝑐 = ceil(𝑛𝑏𝑖𝑡𝑠𝑡𝑟𝑢𝑛𝑐/2048);
    //nbits_trunc = ceil(nbits_trunc_local/2048.0);
    nbits_trunc = ((nbits_trunc_local+2047)>>11);
    return modeFlag;
}

bool SpectralQuantization::globalGainAdjustment(const float* const X_f,float* E)
{
    static const uint16_t t1[5] = {80, 230, 380, 530, 680};
    static const uint16_t t2[5] = {500, 1025, 1550, 2075, 2600};
    static const uint16_t t3[5] = {850, 1700, 2550, 3400, 4250};

    const auto tt1 = t1[fs_ind];
    const auto tt2 = t2[fs_ind];
    const auto tt3 = t3[fs_ind];
    //int gg_ind_v = gg_ind;
    uint16_t gg_ind_origin = gg_ind;
    int16_t delta;
    //float delta2;
    //if (𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 < t1[𝑓𝑠𝑖𝑛𝑑])
    //if (nbits_est < t1[fs_ind])
    if (nbits_est < tt1)
    {
        //delta = (𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡+48)/16.f;
        //delta = (nbits_est+48)/16.f;
        delta = (nbits_est+(48 + 8))>>4;
    }
    //else if (𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 < t2[𝑓𝑠𝑖𝑛𝑑])
    //else if (nbits_est < t2[fs_ind])
    else if (nbits_est < tt2)
    {
        //tmp1 = t1[𝑓𝑠𝑖𝑛𝑑]/16+3;
        //tmp2 = t2[𝑓𝑠𝑖𝑛𝑑]/48;
        //delta = (𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡-t1[𝑓𝑠𝑖𝑛𝑑])*(tmp2-tmp1)/(t2[𝑓𝑠𝑖𝑛𝑑]-t1[𝑓𝑠𝑖𝑛𝑑]) + tmp1;
        //float tmp1 = t1[fs_ind]/16.f +3;
        //float tmp2 = t2[fs_ind]/48.f;
        //delta = (nbits_est-t1[fs_ind])*(tmp2-tmp1)/(t2[fs_ind]-t1[fs_ind]) + tmp1;
        float tmp1 = tt1 / 16.f + 3;
        float tmp2 = tt2 / 48.f;
        auto d = (nbits_est - tt1) * (tmp2 - tmp1) / (tt2 - tt1) + tmp1;
        delta = (int16_t)(d + 0.5f);
    }
    //else if (𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 < t3[𝑓𝑠𝑖𝑛𝑑])
    //else if (nbits_est < t3[fs_ind])
    else if (nbits_est < tt3)
    {
        //delta = 𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡/48;
        //delta = nbits_est/48.f;
        delta = (nbits_est+24)/48;
    }
    else
    {
        //delta = t3[𝑓𝑠𝑖𝑛𝑑]/48;
        //delta = t3[fs_ind]/48.f;
        //delta = tt3/48.f;
        delta = (tt3+24)/48;
    }
    //delta = nint(delta); // this looks like we need floating point
    // nint(.) is the rounding-to-nearest-integer function.
    //delta = static_cast<int16_t>(delta+0.5f); // this looks like we need floating point
    int16_t delta2 = delta + 2;

    /*
    if ((𝑔𝑔𝑖𝑛𝑑 < 255 && 𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 > 𝑛𝑏𝑖𝑡𝑠𝑠𝑝𝑒𝑐) ||
        (𝑔𝑔𝑖𝑛𝑑 > 0 && 𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 < 𝑛𝑏𝑖𝑡𝑠𝑠𝑝𝑒𝑐 – delta2))
    {
        if (𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 < 𝑛𝑏𝑖𝑡𝑠𝑠𝑝𝑒𝑐 – delta2)
        {
            𝑔𝑔𝑖𝑛𝑑 -= 1;
        }
        else if (𝑔𝑔𝑖𝑛𝑑 == 254 || 𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 < 𝑛𝑏𝑖𝑡𝑠𝑠𝑝𝑒𝑐 + delta)
        {
            𝑔𝑔𝑖𝑛𝑑 += 1;
        }
        else
        {
            𝑔𝑔𝑖𝑛𝑑 += 2;
        }
            𝑔𝑔𝑖𝑛𝑑 = max(𝑔𝑔𝑖𝑛𝑑, 𝑔𝑔𝑚𝑖𝑛);
    }
    */
    auto diff = nbits_est - nbits_spec;
    
    auto err = 0;
    if (diff < -delta2) {
        auto diff0 = diff - delta2;
        err = diff0 / delta;        
    }
    else if (diff > 0) { 
        auto diff0 = diff + delta;
        err = diff0 / delta;
    }
    if (abs(err)>= 6) {//6:test optimal value 
        //reEstimation
		//float* E = temp;
        computeSpectralEnergy(X_f, E);
        globalGainEstimation(E);
        globalGainLimitation();
        gg_ind_last = gg_ind;
        //reQuantize
        return true;
    }
    else if(err){
        auto ggind = gg_ind + err;
        //ggind = std::max(ggind, (int)gg_min);
        //ggind = std::min(ggind, (int)256);
        if (ggind < gg_min)ggind = gg_min;
        if (ggind > 255)ggind = 255;        
        gg_ind_last = ggind;
        //reQuantize
        auto gg_ind_min = gg_ind - 2;
        auto gg_ind_max = gg_ind + 3;
        if (ggind < gg_ind_min)ggind = gg_ind_min;
        if (ggind > gg_ind_max)ggind = gg_ind_max;
        gg_ind = ggind;
        return true;
    }
    else {
        gg_ind_last = gg_ind;
        return false;
    }  
}

void SpectralQuantization::run(const float* const X_f, int16_t* X_q, float* E, uint16_t nbits, uint16_t nbits_spec_local)
{dbgCodecCp();
    nbits_spec = nbits_spec_local;
    //float* E = temp;//NE/4
	//scan X_f
    float X_f_max0 = 0;
    float X_f_sum0 = 0;
    for (uint16_t n = 0; n < NE; n++){
        auto v = __vabs(X_f[n]);
        X_f_max0 = __vmaxnm(X_f_max0, v);
        X_f_sum0 += v;
    }
    X_f_max = X_f_max0;
	//
    //3.3.10.2 First global gain estimation  (d09r02_F2F)
    updateGlobalGainEstimationParameter(nbits, nbits_spec_local);

    //estimation gg
    globalGainEstimation(X_f, E, X_f_sum0);
    //
    // Finally, the quantized gain index is limited such that
    // the quantized spectrum stays within the range [-32768,32767]
    bool reset_offset = globalGainLimitation();

    // 3.3.10.3 Quantization   (d09r02_F2F)
    quantizeSpectrum(X_f, X_q);

    // 3.3.10.4 Bit consumption    (d09r02_F2F)
    uint8_t modeFlag = computeBitConsumption(X_q,nbits);
    /*{
        //_cfg.log("gg_ind", &gg_ind, sizeof(gg_ind));
        //_cfg.log("gg", &gg, sizeof(gg)  );
        //_cfg.log("X_q", X_q, sizeof(int16_t)*NE);
        //_cfg.log("lastnz", &lastnz, sizeof(lastnz));
        //_cfg.log("lastnz_trunc", &lastnz_trunc, sizeof(lastnz_trunc));
        //_cfg.log("nbits_est", &nbits_est, sizeof(nbits_est) );
        //_cfg.log("nbits_trunc", &nbits_trunc, sizeof(nbits_trunc) );
    }*/

    // Note: states needs to be transferred prior
    // to spectrum re-quantization!
    nbits_spec_old = nbits_spec;
    nbits_est_old = nbits_est;
    reset_offset_old = reset_offset;
    nbits_offset_old = nbits_offset;

    // 3.3.10.6 Global gain adjustment        (d09r02_F2F)
    bool isAdjusted = globalGainAdjustment(X_f,E);
    if (isAdjusted){
        quantizeSpectrum(X_f,X_q);
        modeFlag = computeBitConsumption(X_q, nbits);
    }

    // 3.3.10.5 Truncation   (d09r02_F2F)
    for (uint16_t k = lastnz_trunc; k < lastnz; k++){
        //𝑋𝑞[k] = 0;
        X_q[k] = 0;
    }

    //if (modeFlag == 1 && 𝑛𝑏𝑖𝑡𝑠𝑒𝑠𝑡 > 𝑛𝑏𝑖𝑡𝑠𝑠𝑝𝑒𝑐)
    if ((modeFlag == 1) && (nbits_est > nbits_spec)){
        lsbMode = 1;
    }
    else{
        lsbMode = 0;
    }

    //
    /*{
        _cfg.log("lsbMode", &lsbMode, sizeof(lsbMode));
    }*/

    {
        //_cfg.log("isAdjusted", &isAdjusted, sizeof(isAdjusted));
        //_cfg.log("gg_ind_adj", &gg_ind, sizeof(gg_ind));
        //_cfg.log("gg_adj", &gg, sizeof(gg)  );
        //_cfg.log("X_q_req", X_q, sizeof(int16_t)*NE);
        //_cfg.log("lastnz_req", &lastnz_trunc, sizeof(lastnz_trunc));
        //_cfg.log("nbits_est_req", &nbits_est, sizeof(nbits_est) );
        //_cfg.log("nbits_trunc_req", &nbits_trunc, sizeof(nbits_trunc) );
        //_cfg.log("lsbMode_req", &lsbMode, sizeof(lsbMode) );

    }
    //
    X_f_sum = X_f_sum0;
    //dbgChnX(f,",%4d,%d,%d,%d,%d\n", _frame_index++, _estimation_count,gg_ind, gg_ind_last, _quantize_count);
}


void SpectralQuantization::registerDatapoints()
{  
    {
        //_cfg.addDatapoint( "gg_off", &gg_off, sizeof(gg_off) );
        //_cfg.addDatapoint( "gg_min", &gg_min, sizeof(gg_min) );
        //_cfg.addDatapoint( "nbits_offset", &nbits_offset, sizeof(nbits_offset) );
    }
}

