/*
 * TemporalNoiseShaping.cpp
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

#include "TemporalNoiseShaping.hpp"
#include "TemporalNoiseShapingTables.hpp"
#include <cmath>

using namespace sneak::enc;
extern const float __exp_factor_tbl[];
extern const float __e_tbl[];
extern const float _rc_sin_tbl[];

TemporalNoiseShaping::TemporalNoiseShaping(const Lc3Config& cfg) 
    :Lc3Base(cfg),
    nbits_TNS(0),
    //X_f(nullptr),
    tns_lpc_weighting(0),
    num_tns_filters(0)
{
    //X_f = AllocT<float>(_cfg.NE);
    for(int i = 0; i < 16; i++)
    {
        rc_i[i] = 0;
    }
}

TemporalNoiseShaping::~TemporalNoiseShaping()
{  
    //Free(X_f);
}


void TemporalNoiseShaping::run(const float* const X_s, float* Y_S, float* temp, uint8_t P_BW, uint16_t nbits, uint8_t near_nyquist_flag)
{dbgCodecCp();
    float* rc_q = temp;
    // 3.3.8.1 Overview / Table 3.14: TNS encoder parameters  (d09r06_FhG)
#if 0
    uint16_t start_freq[2];
    uint16_t stop_freq[2];
    uint16_t sub_start[2][3];
    uint16_t sub_stop[2][3];    
    if (_cfg.N_ms==Lc3Config::FrameDuration::d10ms)
    {
        start_freq[0] = 12;
        if (4!=P_BW)
        {
            start_freq[1] = 160;
        }
        else
        {
            start_freq[1] = 200;
        }
        switch(P_BW)
        {
            default:
                // Note: this default setting avoids uninitialized variables, but in
                //       practice the calling code has the responsiblity to
                //       ensure proper values of P_BW
            case 0:
                num_tns_filters = 1;
                stop_freq[0] = 80;
                sub_start[0][0] = 12;
                sub_start[0][1] = 34;
                sub_start[0][2] = 57;
                sub_stop[0][0] = 34;
                sub_stop[0][1] = 57;
                sub_stop[0][2] = 80;
                break;
            case 1:
                num_tns_filters = 1;
                stop_freq[0] = 160;
                sub_start[0][0] = 12;
                sub_start[0][1] = 61;
                sub_start[0][2] = 110;
                sub_stop[0][0] = 61;
                sub_stop[0][1] = 110;
                sub_stop[0][2] = 160;
                break;
            case 2:
                num_tns_filters = 1;
                stop_freq[0] = 240;
                sub_start[0][0] = 12;
                sub_start[0][1] = 88;
                sub_start[0][2] = 164;
                sub_stop[0][0] = 88;
                sub_stop[0][1] = 164;
                sub_stop[0][2] = 240;
                break;
            case 3:
                num_tns_filters = 2;
                stop_freq[0] = 160;
                stop_freq[1] = 320;
                sub_start[0][0] = 12;
                sub_start[0][1] = 61;
                sub_start[0][2] = 110;
                sub_start[1][0] = 160;
                sub_start[1][1] = 213;
                sub_start[1][2] = 266;
                sub_stop[0][0] = 61;
                sub_stop[0][1] = 110;
                sub_stop[0][2] = 160;
                sub_stop[1][0] = 213;
                sub_stop[1][1] = 266;
                sub_stop[1][2] = 320;
                break;
            case 4:
                num_tns_filters = 2;
                stop_freq[0] = 200;
                stop_freq[1] = 400;
                sub_start[0][0] = 12;
                sub_start[0][1] = 74;
                sub_start[0][2] = 137;
                sub_start[1][0] = 200;
                sub_start[1][1] = 266;
                sub_start[1][2] = 333;
                sub_stop[0][0] = 74;
                sub_stop[0][1] = 137;
                sub_stop[0][2] = 200;
                sub_stop[1][0] = 266;
                sub_stop[1][1] = 333;
                sub_stop[1][2] = 400;
                break;
        }
    }
    //else
    {//7.5ms frame duration
        start_freq[0] = 9;
        if (4!=P_BW)
        {
            start_freq[1] = 120; // Errata 15098 implemented
        }
        else
        {
            start_freq[1] = 150;
        }
        switch(P_BW)
        {
            default:
                // Note: this default setting avoids uninitialized variables, but in
                //       practice the calling code has the responsiblity to
                //       ensure proper values of P_BW
            case 0:
                num_tns_filters = 1;
                stop_freq[0] = 60;
                sub_start[0][0] = 9;
                sub_start[0][1] = 26;
                sub_start[0][2] = 43;
                sub_stop[0][0] = 26;
                sub_stop[0][1] = 43;
                sub_stop[0][2] = 60;
                break;
            case 1:
                num_tns_filters = 1;
                stop_freq[0] = 120; // Errata 15098 implemented
                sub_start[0][0] = 9;
                sub_start[0][1] = 46;
                sub_start[0][2] = 83;
                sub_stop[0][0] = 46;
                sub_stop[0][1] = 83;
                sub_stop[0][2] = 120;
                break;
            case 2:
                num_tns_filters = 1;
                stop_freq[0] = 180;
                sub_start[0][0] = 9;
                sub_start[0][1] = 66;
                sub_start[0][2] = 123;
                sub_stop[0][0] = 66;
                sub_stop[0][1] = 123;
                sub_stop[0][2] = 180;
                break;
            case 3:
                num_tns_filters = 2;
                stop_freq[0] = 120;
                stop_freq[1] = 240;
                sub_start[0][0] = 9;
                sub_start[0][1] = 46;
                sub_start[0][2] = 82;
                sub_start[1][0] = 120; // Errata 15098 implemented
                sub_start[1][1] = 159;
                sub_start[1][2] = 200;
                sub_stop[0][0] = 46;
                sub_stop[0][1] = 82;
                sub_stop[0][2] = 120; // Errata 15098 implemented
                sub_stop[1][0] = 159;
                sub_stop[1][1] = 200;
                sub_stop[1][2] = 240;
                break;
            case 4:
                num_tns_filters = 2;
                stop_freq[0] = 150;
                stop_freq[1] = 300;
                sub_start[0][0] = 9;
                sub_start[0][1] = 56;
                sub_start[0][2] = 103;
                sub_start[1][0] = 150;
                sub_start[1][1] = 200;
                sub_start[1][2] = 250;
                sub_stop[0][0] = 56;
                sub_stop[0][1] = 103;
                sub_stop[0][2] = 150;
                sub_stop[1][0] = 200;
                sub_stop[1][1] = 250;
                sub_stop[1][2] = 300;
                break;
        }
    }
#endif

    uint16_t start_freq[2];
    uint16_t stop_freq[2];
    const uint16_t* sub_start[2];
    const uint16_t* sub_stop[2]; 
    {
        const uint16_t* tbl = 0;
        if (P_BW > 4)P_BW = 4;
        if (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) {
            static const uint16_t _tns_sub_tbl_10ms[5][7] = {
               {12,34,57,80,0,0,0}
               ,{12,61,110,160,0,0,0}
               ,{12,88,164,240,0,0,0}
               ,{12,61,110,160,213,266,320}
               ,{12,74,137,200,266,333,400}
            };            
            tbl = _tns_sub_tbl_10ms[P_BW];            
        }
        else if (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) {
            static const uint16_t _tns_sub_tbl_7p5ms[5][7] = {
               {9,26,43,60,0,0,0}
               ,{9,46,83,120,0,0,0}
               ,{9,66,123,180,0,0,0}
               ,{9,46,82,120,159,200,240}
               ,{9,56,103,150,200,250,300}
            };
            tbl = _tns_sub_tbl_7p5ms[P_BW];
        }        
        else if (_cfg.N_ms == Lc3Config::FrameDuration::d5ms) {
            static const uint16_t _tns_sub_tbl_5ms[5][7] = {
               {6,23,40,0,0,0,0}
               ,{6,43,80,0,0,0,0}
               ,{6,63,120,0,0,0,0}
               ,{6,43,80,120,160,0,0}
               ,{6,53,100,150,200,0,0}
            };
            tbl = _tns_sub_tbl_5ms[P_BW];
        }
        else if (_cfg.N_ms == Lc3Config::FrameDuration::d2p5ms) {
            static const uint16_t _tns_sub_tbl_2p5ms[5][7] = {
               {3,10,20,0,0,0,0}
               ,{3,20,40,0,0,0,0}
               ,{3,30,60,0,0,0,0}
               ,{3,40,80,0,0,0,0}
               ,{3,50,100,0,0,0,0}
            };
            tbl = _tns_sub_tbl_2p5ms[P_BW];
        }
        //
        if (_cfg.N_ms == Lc3Config::FrameDuration::d10ms || _cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) {
            sub_start[0] = &tbl[0];
            sub_start[1] = &tbl[3];
            sub_stop[0] = &tbl[1];
            sub_stop[1] = &tbl[4];
            start_freq[0] = sub_start[0][0];
            start_freq[1] = sub_start[1][0];
            stop_freq[0] = sub_stop[0][2];
            stop_freq[1] = sub_stop[1][2];
        }else{
            sub_start[0] = &tbl[0];
            sub_start[1] = &tbl[2];
            sub_stop[0] = &tbl[1];
            sub_stop[1] = &tbl[3];
            start_freq[0] = sub_start[0][0];
            start_freq[1] = sub_start[1][0];
            stop_freq[0] = sub_stop[0][1];
            stop_freq[1] = sub_stop[1][1];
        }
        num_tns_filters = stop_freq[1] ? 2 : 1;
    }

    // 3.3.8.2 TNS analysis  (d09r02_F2F, d09r08)
    // tns_lpc_weighting = (nbits < ((_cfg.N_ms==Lc3Config::FrameDuration::d10ms) ? 480 : 360)  ) ? 1 : 0;
    if (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) {
        tns_lpc_weighting = nbits < 480 ? 1 : 0;
        maxOrder = 8;
        nSubdivisions = 3;
        movr_f = 3;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms){
        tns_lpc_weighting = nbits < 360 ? 1 : 0;
        maxOrder = 8;
        nSubdivisions = 3;
        movr_f = 3;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
        tns_lpc_weighting = nbits < 240 ? 1 : 0;
        maxOrder = 4;
        nSubdivisions = 2;
        movr_f = 3;
    }else{
        tns_lpc_weighting = nbits < 120 ? 1 : 0;
        maxOrder = 4;
        nSubdivisions = 2;
        movr_f = 2;
    }
    //
    uint32_t nzflags = 0;
    //float e8[8] = { 0.f };
    {dbgCodecCp();    
    for (uint8_t f=0; f < num_tns_filters; f++)
    {
        float rw[9];
        //k=0;
        //rw[0] = 3.f;
        rw[0] = nSubdivisions;
        //
        float ess[3];
        {dbgCodecCp();
        for (uint8_t s = 0; s < nSubdivisions; s++) {
            float es = 0.f;
            auto sub_stopfs = sub_stop[f][s];
            for (int16_t n = sub_start[f][s]; n < sub_stopfs; n++) {
                //es += X_s[n]*X_s[n];
                auto X_s_n = X_s[n];
                __vfma_(X_s_n, X_s_n, es);
            }
            if (es == 0.f)
                ess[s] = es;
            else
                ess[s] = 1.f/es;
        }
        }
        float a_memory[2][9];
        float *a = a_memory[0];
        float *a_last = a_memory[1];
        float e = rw[0];
        float tmp_predGain1 = 0.f;
        a[0] = 1.f;
        {dbgCodecCp();
        for (uint8_t k=1; k<=maxOrder; k++){
            float rk = 0.f;
            for (uint8_t s=0; s < nSubdivisions; s++){
                float es = ess[s];
                if (!es) {
                    rk = 0.f;
                    break;
                }
                float ac = 0.f;
                auto sub_stopfs = sub_stop[f][s];
                auto sub_stopfs_k = sub_stopfs - k;
                for (int16_t n = sub_start[f][s]; n < sub_stopfs_k; n++) {
                    //ac += X_s[n]*X_s[n+k];
                    __vfma_(X_s[n], X_s[n + k], ac);
                }
                __vfma_(ac, es, rk);
            }
            rw[k] = rk * __exp_factor_tbl[k];
            float *tmp = a_last;
            a_last = a;
            a = tmp;
            // a:=a^k; a_last:=a^(k-1)
            float rc = 0.f;
            for (uint8_t n = 0; n < k; n++)
            {
                //rc -= a_last[n] * rw[k-n];
                __vfms_(a_last[n], rw[k-n], rc);
            }
            if (0.f==e)
            {
                // is this handling to avoid division by 0 ok?
                e = 1.f;
            }
            rc /= e;
            a[0] = 1.f;
            for (uint8_t n = 1; n < k; n++)
            {
                //a[n] = a_last[n] + rc*a_last[k-n];
                a[n] = __vfma(rc, a_last[k-n], a_last[n]);
            }
            a[k] = rc;
            //e = (1.f-rc*rc)*e;
            e = __vfms(rc, rc, 1.f)*e;
            //e8[k-1] = e;
            if (e > __e_tbl[k])
                break;
        }
        //dbgInfoPXL("e8,%f,%f,%f,%f,%f,%f,%f,%f", e8[0], e8[1], e8[2], e8[3], e8[4], e8[5], e8[6], e8[7]);
        }

        // The Levinson-Durbin recursion is used to obtain LPC coefficients
        // and a predictor error
#if 0
        float a_memory[2][9];
        float* a = a_memory[0];
        float* a_last = a_memory[1];
        float e = rw[0];
        a[0] = 1.f;
        for (uint8_t k=1; k <= 8; k++)
        {
            // swap buffer for a and a_last
            float* tmp = a_last;
            a_last = a;
            a = tmp;
            // a:=a^k; a_last:=a^(k-1)
            float rc = 0.f;
            for (uint8_t n=0; n < k; n++)
            {
                //rc -= a_last[n] * rw[k-n];
                __vfms_(a_last[n], rw[k-n], rc);
            }
            if (0.f==e)
            {
                // is this handling to avoid division by 0 ok?
                e = 1.f;
            }
            rc /= e;
            a[0] = 1.f;
            for (uint8_t n=1; n < k; n++)
            {
                //a[n] = a_last[n] + rc*a_last[k-n];
                a[n] = __vfma(rc, a_last[k-n], a_last[n]);
            }
            a[k] = rc;
            e = (1.f-rc*rc)*e;
        }
#endif
        
        //
        float predGain = rw[0]/e; // again a suspicious possible division-by-zero! (should be handled above)
        const float thresh = 1.5f;
        if (  (predGain <= thresh) || (near_nyquist_flag>0) )
        {
            // turn TNS filter f off
            //float* rc = &rc_q[f*8+0];
            //for (uint8_t n=0; n < 8; n++)
            //{
            //    rc[n] = 0.f;
            //}
        }
        else
        {
            dbgCodecCp();
            // turn TNS filter f on
            // -> we need to compute reflection coefficients
            float gamma = 1.f;
            const float thresh2 = 2.f;
            if ( (tns_lpc_weighting>0) && (predGain < thresh2) )
            {
                const float gamma_min = 0.85f;
                gamma -= (1.f-gamma_min) / (thresh2-thresh) * (thresh2-predGain);
            }
            float* aw = a; // compute in-place
            float gammak = 1.f;
            for (uint8_t k=0; k < maxOrder+1; k++)
            {
                //aw[k] = pow(gamma, k)*a[k];
                aw[k] = gammak*a[k];
                gammak *= gamma;
            }
            float* rc = &rc_q[f<<movr_f];
            float* a_k   = aw;
            float* a_km1 = a_last;
            //float rca_max = 0;
            for (uint8_t k=maxOrder; k > 0; k--)
            {
                auto rc_k_1 = a_k[k];
                rc[k - 1] = rc_k_1;
                //rca_max = __vmaxnm(__vabs(rc_k_1), rca_max);
                //rc[k_1] = a_k[k];
                float e = (1-rc_k_1*rc_k_1);
                for (uint8_t n=1; n < k; n++)
                {
                    //a_km1[n] = a_k[n] - rc_k_1*a_k[k-n];
                    auto a_km1_n = __vfms(rc_k_1, a_k[k-n], a_k[n]);
                    a_km1_n /= e;
                    a_km1[n] = a_km1_n;
                }
                // swap buffer for a_k and a_km1
                float* tmp = a_k;
                a_k = a_km1;
                a_km1 = tmp;
            }

            //rc non-zero bits flags;
            nzflags |= 1 << f;           
        }
    }
    if (!nzflags) {
        rc_order[0] = rc_order[1] = 0;
        nbits_TNS = num_tns_filters;
        return;
    }
    }

    // 3.3.8.3 Quantization  (d09r02_F2F)
    // with Δ =π/17    
    {dbgCodecCp();
    const float quantizer_stepsize = PI / 17;
    for (uint8_t f=0; f < num_tns_filters; f++){        
        if (nzflags & (1 << f)) {
            float* rc = &rc_q[f << movr_f]; // source (see above)   
            auto order = 0;
            for (uint8_t k = 0; k < maxOrder; k++){

                auto rck = rc[k];
                // attention: rc in place of rc_q!            
                //rc_i[f8k] = __vcvta_s32( asin(rc[k]) / quantizer_stepsize ) + 8;
#if 1         
                auto rci = rck ? __vcvta_s32(asin(rc[k]) / quantizer_stepsize) : 0;
                if (rci)
                    order = k;
                rci += 8;
                auto tbl = _rc_sin_tbl;
#else         
                auto rci = 8;
                auto tbl = _rc_sin_tbl;
                if (rck) {
                    int rc1 = 16;
                    if (rck < 0) {
                        rci = 0;
                        rc1 = 8;
                    }
                    rci += 1;
                    for (; rci <= rc1; rci++) {
                        if (rck <= tbl[rci]) {
                            if (tbl[rci] - rck > rck - tbl[rci - 1]) {
                                rci--;
                            }
                            break;
                        }
                    }
                    if (rci > 16)
                        rci = 16;
                    if (rci != 8)
                        order = k;
                }
                //if (rci != rci0)
                //    printf("err:%d,%d\n", rci0, rci);
#endif         
                auto f8k = (f << 3) + k;
                rc_i[f8k] = rci;
                //rc_q[f8k] = sin( quantizer_stepsize * (rc_i[f8k]-8) );
                //rc_q[f8k] = sin( quantizer_stepsize * rci):0;
                rc_q[f8k] = tbl[rci];

            }   
            rc_order[f] = order + 1;
        }
        else {
            rc_order[f] = 0;
        }
        
        // determine order of quantized reflection coefficients
        /*int8_t k=7; // need signed to stop while properly
        //while( (k>=0) && (0==rc_q[f*8+k]) ) // specification
        while( (k>=0) && (8==rc_i[f8+k]) )  // alternative solution that should be more robust (and faster)
        {
            k--;
        }
        rc_order[f] = k+1;*/
    }
    /*for (uint8_t f=num_tns_filters; f < 2; f++)
    {
        for (uint8_t k=0; k < 8; k++)
        {
            auto f8k = f*8+k;
            rc_i[f8k] = 8;
            rc_q[f8k] = 0;
        }
        rc_order[f] = 0;
    }*/
    }

    // bit budget    
    {dbgCodecCp(); 
    nbits_TNS = 0;
    for (uint8_t f=0; f < num_tns_filters; f++)
    {
        uint32_t nbits_TNS_order = 0;
        if (rc_order[f] > 0)
        {
            nbits_TNS_order = ac_tns_order_bits[tns_lpc_weighting][rc_order[f]-1];
        }
        uint32_t nbits_TNS_coef = 0;
        for (uint8_t k=0; k < rc_order[f]; k++)
        {
            nbits_TNS_coef += ac_tns_coef_bits[k][rc_i[(f<<movr_f)+k]];
        }

        
        {
            if (f==0)
            {
                //_cfg.log("nbits_TNS_order_0", &nbits_TNS_order, sizeof(uint32_t));
                //_cfg.log("nbits_TNS_coef_0", &nbits_TNS_coef, sizeof(uint32_t));
            }
            else
            {
                //_cfg.log("nbits_TNS_order_1", &nbits_TNS_order, sizeof(uint32_t));
                //_cfg.log("nbits_TNS_coef_1", &nbits_TNS_coef, sizeof(uint32_t));
            }
        }

        uint32_t nbits_TNS_local = 2048 + nbits_TNS_order + nbits_TNS_coef;
        //nbits_TNS += ceil( nbits_TNS_local / 2048.0 ); // this code integrates Errata 15028 (see d1.0r03)
        nbits_TNS += __vcvtp_u32(nbits_TNS_local / 2048.f);
    }
    }

    // 3.3.8.4 Filtering  (d09r02_F2F)
    {dbgCodecCp();
    /*for (uint16_t k = 0; k < _cfg.NE; k++)
    {
        X_f[k] = X_s[k];
    }*/
    float st[8];
    for (uint8_t k = 0; k<maxOrder; k++)
    {
        st[k]=0;
    }
    for (uint8_t f=0; f < num_tns_filters; f++)
    {
        if (rc_order[f]>0)
        {
            //if (!(nzbs & (1 << f)))
            //    int a = 0;
            auto order = rc_order[f] - 1;
            for (uint16_t n = start_freq[f]; n < stop_freq[f]; n++)
            {
                float t = X_s[n];
                float st_save = t;
                //auto rc_qf8 = &rc_q[f * 8];                
                auto rc_qf8 = &rc_q[f << movr_f];
                //for (uint8_t k=0; k < rc_order[f]-1; k++)
                for (uint8_t k=0; k < order; k++)
                {
                    //float st_tmp = rc_q[f*8+k] * t + st[k];
                    //auto st_tmp = rc_qf8[k] * t + st[k];
                    auto st_tmp = __vmla(rc_qf8[k] , t , st[k]);
                    //t       += rc_q[f*8+k] * st[k];
                    //t       += rc_qf8[k] * st[k];
                    __vmla_( rc_qf8[k] , st[k], t);
                    st[k]    = st_save;
                    st_save  = st_tmp;
                }
                //t += rc_q[f*8 + rc_order[f]-1] * st[rc_order[f]-1];
                //t += rc_qf8[rc_order[f]-1] * st[rc_order[f]-1];
                //t += rc_qf8[order] * st[order];
                __vmla_(rc_qf8[order] , st[order],t);
                //st[rc_order[f]-1] = st_save;
                st[order] = st_save;
                Y_S[n] = t;
            }
        }
    }
    }
}

//int8_t TemporalNoiseShaping::nint(float x)
//{
//    if (x >= 0)
//    {
//        return static_cast<int8_t>(x+0.5);
//    }
//    else
//    {
//        return -static_cast<int8_t>(-x+0.5);
//    }
//}

void TemporalNoiseShaping::registerDatapoints()
{
    

    {
        //_cfg.addDatapoint( "X_f", &X_f[0], sizeof(float)*_cfg.NE );
        //_cfg.addDatapoint( "num_tns_filters", &num_tns_filters, sizeof(num_tns_filters) );
        //_cfg.addDatapoint( "rc_order", &rc_order[0], sizeof(uint8_t)*2 );
        //_cfg.addDatapoint( "rc_i_1", &rc_i[0], sizeof(uint8_t)*8 );
        //_cfg.addDatapoint( "rc_i_2", &rc_i[8], sizeof(uint8_t)*8 );
        //_cfg.addDatapoint( "rc_q_1", &rc_q[0], sizeof(float)*8 );
        //_cfg.addDatapoint( "rc_q_2", &rc_q[8], sizeof(float)*8 );
        //_cfg.addDatapoint( "nbits_TNS", &nbits_TNS, sizeof(nbits_TNS) );
    }
}

const float __exp_factor_tbl[]{
  1.000000f,
  0.998028f,
  0.992135f,
  0.982392f,
  0.968911f,
  0.951850f,
  0.931405f,
  0.907808f,
  0.881323f,
};

//err≈0
const float __e_tbl[]{
    0.f,
    3.f,
    2.9998f,
    2.9951f,
    2.9885f,
    2.9191f,
    2.8655f,
    2.6425f,
    2.f
};

//err<0.001
const float __e_tbl1[]{
    0.f,
    3.f,
    2.9995f,
    2.9914f,
    2.9658f,
    2.9138f,
    2.7978f,
    2.3488f,
    2.f
};

//err<0.002
const float __e_tbl2[]{
    0.f,
    3.f,
    2.9992f,
    2.9914f,
    2.9344f,
    2.8617f,
    2.6603f,
    2.3488f,
    2.f
};

//err<0.005
const float __e_tbl3[]{
    0.f,
    3.f,
    2.9989f,
    2.9914f,
    2.9049f,
    2.7287f,
    2.6139f,
    2.3488f,
    2.f
};
