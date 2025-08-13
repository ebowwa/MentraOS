/*
 * SnsQuantization.cpp
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

#include "SnsQuantization.hpp"
#include "SnsQuantizationTables.hpp"
#include <cmath>
#include <limits>
using namespace sneak::enc;
#define fix_mul_add(a, b, sum) sum = sum + ((int64_t)(a) * (b) >> 16)
#define fix_mul_sub(a, b, sum) sum = sum - ((int64_t)(a) * (b) >> 16)
#define fix_mul(a, b) (int64_t)(a) * (b) >> 16

SnsQuantization::SnsQuantization(const Lc3Config&cfg) 
    :Lc3Base(cfg),
    ind_LF(0),
    ind_HF(0),
    shape_j(0),
    Gind(0),
    LS_indA(0),
    LS_indB(0),
    index_joint_j(0),
    idxA(0),
    idxB(0)
{
#if 0
    {
        int a = 0;        
        for (int i = 0; i < 32;i++) {
            int* lfs = (int* )LFCB16[i];
            //int* hfs = (int* )HFCB16[i];
            printf("\t{");
            for (int j = 0; j < 8; j++) {
                a = std::max(a, std::abs(lfs[j]));
                printf("0x%04x,",lfs[j]>>4);               
            }
            printf("},\n");
        }
        printf("\n");
        for (int i = 0; i < 32; i++) {
            //int* lfs = (int*)LFCB16[i];
            int* hfs = (int*)HFCB16[i];
            printf("\t{");
            for (int j = 0; j < 8; j++) {
                a = std::max(a, std::abs(hfs[j]));
                printf("0x%04x,", hfs[j] >> 4);
            }
            printf("},\n");
        }
        for (auto i = 0; i < 16; i++) {
            __temp[i] = scf[i] / 1024.f / 4.f;
        }
    }
#endif
#if 0
    {
        for (int i = 0; i < 16; i++) {
            printf("\t{");
            for (int j = 0; j < 1; j++) {                
                for (int j = 0; j < 16; j++) {
                    //a = std::max(a, std::abs(hfs[j]));
                    printf("0x%04x,", D16[j][i]);
                }                
            }
            printf("},\n");
        }
    }
#endif
}

SnsQuantization::~SnsQuantization()
{
}

void SnsQuantization::run(const int16_t* const scf,float* temp){
	//scf :3.12
    ///init memory
    int16_t* t2rot = (int16_t*)temp;// [Nscales] ;//3.12
    int16_t* absx = t2rot+16;// [16] ;
    int16_t* sns_Y0= absx +16;//[16];//int8_t sns_Y0[16];
    int16_t* sns_Y1= sns_Y0 +16;//[10];//int8_t sns_Y1[10];
    int16_t* sns_Y2= sns_Y1 +16;//[16];//int8_t sns_Y2[16];
    int16_t* sns_Y3= sns_Y2 +16;//[16];//int8_t sns_Y3[16];
    int16_t* sns_XQ0= sns_Y3 +16;//[Nscales];
    int16_t* sns_XQ1= sns_XQ0 +16;//[Nscales]; // do not minimize to 10 -> last 6 values are all zeros which is important for the inverse D-transform
    int16_t* sns_XQ2= sns_XQ1 +16;//[Nscales];
    int16_t* sns_XQ3= sns_XQ2 +16;//[Nscales];
    
    // 3.3.7.3.2 Stage 1  (d09r02_F2F)
    //if ( !std::numeric_limits<float>::has_infinity )
    //{
    //    // we never should reach this line, but really want to make sure to
    //    // go further when the assumed infinity() feature is not supported
    //    return;
    //}
    int32_t dMSE_LF_min = std::numeric_limits<int32_t>::max();
    int32_t dMSE_HF_min = std::numeric_limits<int32_t>::max();
    for (uint8_t i=0; i < 32; i++)
    {
        int32_t dMSE_LF_i = 0;
        int32_t dMSE_HF_i = 0;
        auto pLFCB = (int16_t *)LFCB12[i];
        auto pHFCB = (int16_t *)HFCB12[i];
        for (uint8_t n=0; n < 8; n++)
        {
            auto v0 = scf[n] - pLFCB[n];
            //dMSE_LF_i += v0 * v0;//(scf[n] - LFCB[i][n]) * (scf[n] - LFCB[i][n]);
            dMSE_LF_i = dMSE_LF_i+abs(v0);

            auto v1 = scf[n + 8] - pHFCB[n];
            //dMSE_HF_i += v1 * v1;//(scf[n+8] - HFCB[i][n]) * (scf[n+8] - HFCB[i][n]);
            dMSE_HF_i = dMSE_HF_i+abs(v1);
        }
        if (dMSE_LF_i < dMSE_LF_min)
        {
            ind_LF = i;
            dMSE_LF_min = dMSE_LF_i;
        }
        if (dMSE_HF_i < dMSE_HF_min)
        {
            ind_HF = i;
            dMSE_HF_min = dMSE_HF_i;
        }
    }

    //The first stage vector is composed as:
    int16_t r1[16];
    {
        auto pLFCB = (int16_t *)LFCB12[ind_LF];
        auto pHFCB = (int16_t *)HFCB12[ind_HF];
        for (uint8_t n = 0; n < 8; n++){
            r1[n] = scf[n] - pLFCB[n];
            r1[n + 8] = scf[n + 8] - pHFCB[n];
        }
    }

    // 3.3.7.3.3 Stage 2  (d09r02_F2F)
    // 3.3.7.3.3.3 Stage 2 target preparation  (d09r02_F2F)
    //float* abs_x = temps;// (float*)alloca(N * sizeof(float));
    //float proj_fac = 0;
    int16_t* abs_x = absx;// temps;//3.12
    int32_t proj_fac = 0;

    for (uint8_t n=0; n < 16; n++) {
        auto sum = 0;
        auto r132 = (int32_t*)r1;
        auto d1632 = (int32_t*)D16_[n];
        for (auto m = 0; m < 8; m++) {
            sum=__smlad(*r132++, *d1632++, sum);
        }
        //for (uint8_t row=0; row < 16; row++) {
            //sum += r1[row] * D[row][n];
            //__vmla_(r1[row] , D[row][n],sum);
            //fix_mul_add(r1[row], (int16_t)D16[row][n], sum);
        //}
        sum >>= 16;
        t2rot[n] = sum;//3.12
        proj_fac += abs_x[n] = abs(sum);
    }

    // 3.3.7.3.3.4 Shape candidates  (d09r02_F2F)
    // 3.3.7.3.3.5 Stage 2 shape search (d09r02_F2F)

    // step 1  -> y3,start
    //   Project to or below pyramid N=16, K=6,
    //   (and update energy energyy and correlation corrxy terms to reflect
    //   the pulses present in y3, start )
    uint8_t K = 6;
    uint8_t N = 16;
#if 0
    float proj_fac = 0;
    //float abs_x[N];
    float* abs_x = (float*)alloca(N*sizeof(float));
    for (uint8_t n =0; n < N; n++)
    {
        abs_x[n] = __vabs(t2rot[n]);
        proj_fac += abs_x[n];
    }
#endif

    //proj_fac = (int64_t)((K-1)*32768<<16) / proj_fac ;
    //auto fl_proj_fac = (K-1)*65536.f/proj_fac;
    auto fl_proj_fac = ((K-1)<<16)/proj_fac;
    uint8_t k = 0;
    //float corr_xy = 0;
    //float energy_y = 0;
    int32_t corr_xy = 0;
    int16_t energy_y = 0;
    for (uint8_t n =0; n < N; n++)
    {
        //auto y3 = sns_Y3[n] = floor( abs_x[n]*proj_fac );
        //auto y3 = sns_Y3[n] = floor(abs_x[n]/65536.f*fl_proj_fac);
        auto y3 = sns_Y3[n] = (int64_t)abs_x[n]*fl_proj_fac>>16;
        if (y3){
            k += y3;
            corr_xy += y3 *abs_x[n];
            energy_y += y3 * y3;
        }
    }

    // step 2 -> y3 -> y2,start
    //   Add unit pulses until you reach K=6 over N=16 samples, save y3
    //float corr_xy_last = corr_xy;
    //float energy_y_last = energy_y;
    int32_t corr_xy_last = corr_xy;
    int16_t energy_y_last = energy_y;
    for (/*start with existing k intentionally*/; k < K; k++)
    {
        uint8_t n_c = 0;
        uint8_t n_best = 0;
        int32_t corr_xy = corr_xy_last + abs_x[n_c];
        //float bestCorrSq = corr_xy * corr_xy;
        int32_t bestCorrSq = fix_mul(corr_xy, corr_xy);//8
        //float bestEn = energy_y_last + sns_Y3[n_c] + sns_Y3[n_c] + 1.f;
        auto bestEn = energy_y_last + sns_Y3[n_c] + sns_Y3[n_c] + 1;
        for (n_c=1; n_c < N; n_c++)
        {
            corr_xy  = corr_xy_last + abs_x[n_c];
            energy_y = energy_y_last + sns_Y3[n_c] + sns_Y3[n_c] + 1;
            //if ( corr_xy*corr_xy*bestEn > bestCorrSq*energy_y)
            if ((int32_t)(fix_mul(corr_xy, corr_xy)) * bestEn > bestCorrSq * energy_y)
            {
                n_best = n_c;
                bestCorrSq = fix_mul(corr_xy, corr_xy);
                bestEn     = energy_y;
            }
        }
        corr_xy_last  += abs_x[n_best];
        energy_y_last += sns_Y3[n_best] + sns_Y3[n_best] + 1;
        sns_Y3[n_best]++;
    }

    // step 3 -> y2 -> y1,pre-start
    //   Add unit pulses until you reach K=8 over N=16 samples, save y2
    N = 16;
    K = 8;
    for (uint8_t n=0; n < N; n++)
    {
        sns_Y2[n] = sns_Y3[n];
    }
    for (/*start with existing k intentionally*/; k < K; k++)
    {
        uint8_t n_c = 0;
        uint8_t n_best = 0;
        int32_t corr_xy = corr_xy_last + abs_x[n_c];
        //float bestCorrSq = corr_xy * corr_xy;
        //float bestEn = energy_y_last + sns_Y2[n_c] + sns_Y2[n_c] + 1.f;
        int32_t bestCorrSq = fix_mul(corr_xy, corr_xy);//8
        auto bestEn = energy_y_last + sns_Y2[n_c] + sns_Y2[n_c] + 1;
        for (n_c=1; n_c < N; n_c++)
        {
            corr_xy  = corr_xy_last + abs_x[n_c];
            energy_y = energy_y_last + sns_Y2[n_c] + sns_Y2[n_c] + 1;
            if ((int32_t)(fix_mul(corr_xy,corr_xy)) * bestEn > bestCorrSq * energy_y)
            {
                n_best = n_c;
                bestCorrSq = fix_mul(corr_xy,corr_xy);
                bestEn     = energy_y;
            }
        }
        corr_xy_last  += abs_x[n_best];
        energy_y_last += sns_Y2[n_best] + sns_Y2[n_best] + 1;
        sns_Y2[n_best]++;
    }

    // step 4 -> y1,start
    //   Remove any unit pulses in y1,pre-start that are not part of set A to yield y1, start
    N = 10;
    K = 10;
    for (uint8_t n=0; n < N; n++)
    {
        sns_Y1[n] = sns_Y2[n];
    }

    // step 5
    //   Update energy energyy and correlation corrxy terms to reflect the
    //   pulses present in y1, start
    for (uint8_t n=N; n < 16; n++)
    {
        auto y2 = sns_Y2[n];
        if (y2 != 0)
        {
            k -= y2;
            corr_xy_last  -= y2 *abs_x[n];
            energy_y_last -= y2 * y2;
        }
    }

    // step 6 ->  y1 -> y0,start
    //   Add unit pulses until you reach K=10 over N=10 samples (in set A),
    //   save y1
    for (/*start with existing k intentionally*/; k < K; k++)
    {
        uint8_t n_c = 0;
        uint8_t n_best = 0;
        int32_t corr_xy = corr_xy_last + abs_x[n_c];
        //float bestCorrSq = corr_xy * corr_xy;
        //float bestEn = energy_y_last + sns_Y1[n_c] + sns_Y1[n_c] + 1.f;
        int32_t bestCorrSq = fix_mul(corr_xy, corr_xy);
        auto bestEn = energy_y_last + sns_Y1[n_c] + sns_Y1[n_c] + 1;
        //std::cout << static_cast<uint16_t>(k) << " n_c: " << static_cast<uint16_t>(n_c) << " -> " <<  (bestCorrSq/bestEn) << " x: " << abs_x[n_c] << std::endl;
        for (n_c=1; n_c < N; n_c++)
        {
            corr_xy  = corr_xy_last + abs_x[n_c];
            energy_y = energy_y_last + sns_Y1[n_c] + sns_Y1[n_c] + 1;
            //std::cout << static_cast<uint16_t>(k) << " n_c: " << static_cast<uint16_t>(n_c) << " -> " <<  (corr_xy*corr_xy/energy_y) << " x: " << abs_x[n_c] <<  std::endl;
            if (int32_t(fix_mul(corr_xy, corr_xy)) * bestEn > bestCorrSq * energy_y)
            {
                n_best = n_c;
                bestCorrSq = fix_mul(corr_xy,corr_xy);
                bestEn     = energy_y;
            }
        }
        corr_xy_last  += abs_x[n_best];
        energy_y_last += sns_Y1[n_best] + sns_Y1[n_best] + 1;
        sns_Y1[n_best]++;
        //std::cout << static_cast<uint16_t>(k) << " n_best: " << static_cast<uint16_t>(n_best) << " -> " <<  (corr_xy_last*corr_xy_last/energy_y_last) << std::endl;
    }

    // step 7 -> y0
    //   Add unit pulses to y0,start until you reach K=1 over N=6 samples
    //  (in set B), save y0
    // A
    N = 10;
    K = 10;
    for (uint8_t n=0; n < N; n++)
    {
        sns_Y0[n] = sns_Y1[n];
    }
    // B
    N = 6;
    K = 1;
    int32_t max_abs_x = 0;
    uint8_t n_best = 0;
    for (uint8_t n_c=10; n_c < N+10; n_c++)
    {
        sns_Y0[n_c] = 0;
        if (abs_x[n_c] > max_abs_x)
        {
            max_abs_x = abs_x[n_c];
            n_best = n_c;
        }
    }
    sns_Y0[n_best] = 1;

    // step 8 -> y3, y2, y1, y0
    //   Add signs to non-zero positions of each yj vector from the target
    //   vector x, save y3, y2, y1, y0 as shape vector candidates (and for
    //   subsequent indexing of one of them)
    for (uint8_t n=0; n < 10; n++)
    {
        if (t2rot[n] < 0)
        {
            sns_Y0[n] = -sns_Y0[n];
            sns_Y1[n] = -sns_Y1[n];
            sns_Y2[n] = -sns_Y2[n];
            sns_Y3[n] = -sns_Y3[n];
        }
    }
    for (uint8_t n=10; n < 16; n++)
    {
        if (t2rot[n] < 0)
        {
            sns_Y0[n] = -sns_Y0[n];
            sns_Y2[n] = -sns_Y2[n];
            sns_Y3[n] = -sns_Y3[n];
        }
    }

    // step 9
    // Unit energy normalize each yj vector to candidate vector xq_j
    normalizeCandidate(sns_Y0, sns_XQ0, 16);
    normalizeCandidate(sns_Y1, sns_XQ1, 10);
    normalizeCandidate(sns_Y2, sns_XQ2, 16);
    normalizeCandidate(sns_Y3, sns_XQ3, 16);


    // 3.3.7.3.3.6 Adjustment gain candidates (d09r02_F2F)
    // 3.3.7.3.3.7 Shape and gain combination determination (d09r02_F2F)
    shape_j = 0;
    Gind    = 0;
    //float G_gain_i_shape_j = 0;
    //float* sns_XQ_shape_j = nullptr;
    //float dMSE_min = std::numeric_limits<float>::infinity();
    int16_t G_gain_i_shape_j = 0;
    int16_t *sns_XQ_shape_j = nullptr;
    int32_t dMSE_min = std::numeric_limits<int32_t>::max();
    for (uint8_t j=0; j < 4; j++)
    {
        uint8_t Gmaxind_j;
        //float* sns_vq_gains;
        //float* sns_XQ;
        const int16_t *sns_vq_gains;
        int16_t *sns_XQ;//3.12
        switch(j)
        {
            case 0: {
                Gmaxind_j = 1;
                sns_vq_gains = sns_vq_reg_adj_gains_12;
                sns_XQ = sns_XQ0;
                break;
            }
            case 1: {
                Gmaxind_j = 3;
                sns_vq_gains = sns_vq_reg_lf_adj_gains_12;
                sns_XQ = sns_XQ1;
                break;
            }
            case 2: {
                Gmaxind_j = 3;
                sns_vq_gains = sns_vq_near_adj_gains_12;
                sns_XQ = sns_XQ2;
                break;
            }
            case 3: {
                Gmaxind_j = 7;
                sns_vq_gains = sns_vq_far_adj_gains_12;
                sns_XQ = sns_XQ3;
                break;
            }
			default: { // intentionally fall through to case 0; just to avoid compiler warning
            	//case 0: 
                Gmaxind_j = 1;
                sns_vq_gains = sns_vq_reg_adj_gains_12;
                sns_XQ = sns_XQ0;
                break;
            }
        }
        for (uint8_t i=0; i <= Gmaxind_j; i++)
        {
            //float dMSE =0;
            int32_t dMSE = 0;
            auto gain12 = sns_vq_gains[i];
            for (uint8_t n=0; n < Nscales; n++)
            {
                //float diff = t2rot[n] - sns_vq_gains[i]*sns_XQ[n];
                auto diff = (t2rot[n]<<12) - (gain12 *sns_XQ[n]);
                //dMSE += diff * diff;
                dMSE += abs(diff);
            }
            if (dMSE < dMSE_min)
            {
                shape_j = j;
                Gind    = i;
                dMSE_min = dMSE;
                G_gain_i_shape_j = gain12;// sns_vq_gains[Gind];
                sns_XQ_shape_j   = sns_XQ;
            }
        }
    }
    uint8_t LSB_gain = Gind & 1;

    // 3.3.7.3.3.8 Enumeration of the selected PVQ pulse configurations     (d09r02_F2F)
    switch(shape_j)
    {
        case 0: 
            MPVQenum (
                idxA,
                LS_indA,
                10, /* i : dimension of vec_in */
                sns_Y0 /* i : PVQ integer pulse train */
                );
            MPVQenum (
                idxB,
                LS_indB,
                6, /* i : dimension of vec_in */
                &sns_Y0[10] /* i : PVQ integer pulse train */
                );
            index_joint_j = (2*idxB + LS_indB + 2)* 2390004u + idxA;
            break;        
        case 1: 
            MPVQenum (
                idxA,
                LS_indA,
                10, /* i : dimension of vec_in */
                sns_Y1 /* i : PVQ integer pulse train */
                );
            index_joint_j = LSB_gain * 2390004u + idxA;
            break;        
        case 2: 
            MPVQenum (
                idxA,
                LS_indA,
                16, /* i : dimension of vec_in */
                sns_Y2 /* i : PVQ integer pulse train */
                );
            index_joint_j = idxA;
            break;        
        case 3: 
            MPVQenum (
                idxA,
                LS_indA,
                16, /* i : dimension of vec_in */
                sns_Y3 /* i : PVQ integer pulse train */
                );
            index_joint_j = 15158272u + LSB_gain + (2*idxA);
            break;
        
    }


    // 3.3.7.3.4 Multiplexing of SNS VQ codewords (d09r02_F2F)
    // *** final multiplexing skipped for now ****
    //  computation of index_joint_j already done above
    
    // 5.3.7.3.5 Synthesis of the Quantized SNS scale factor vector (d09r01)
    // [3.3.7.3.4 got lost] Synthesis of the Quantized SNS scale factor vector  (d09r02_F2F)
    int32_t* stl16s[2] = { (int32_t*)LFCB16[ind_LF] ,(int32_t*)HFCB16[ind_HF] };
    for (uint8_t n = 0; n < Nscales; n++){
        int32_t factor = 0;//12+16
        auto sns32 = (int32_t*)sns_XQ_shape_j;//16bits
        auto d32 = (int32_t*)D16[n];//16bits
        for (uint8_t col = 0; col < 8; col++) {
            factor = __smlad(sns32[col], d32[col], factor);
        }        
        //scfQ[n] = st1[n] + (int32_t)((int64_t)G_gain_i_shape_j * factor >> (12 + 15));
        factor >>= 28-16-4;
        scfQ[n] = __smlawb(factor, G_gain_i_shape_j, *stl16s[n >> 3]++);
    }
}

void SnsQuantization::normalizeCandidate(int16_t* y, int16_t* XQ, uint8_t N)
{
    int32_t normValue0 = 0;

    //for (uint8_t n = 0; n < N/2; n++)
    //{
        //if (y[n] != 0) // try to save some computations
        //{
            //normValue0 += y[n]*y[n];
            //normValue0 = __mla(y[n], y[n], normValue0);
        //}        
    //}
    auto y32s = (int32_t*)y;
    for (uint8_t n = 0; n < N / 2; n++){
        normValue0 = __smlad(y32s[n], y32s[n], normValue0);
    }
    auto normValue = __vsqrt((float)normValue0);
    //auto fix_normValue = (int32_t)(1.f / normValue * 32768);
    auto fix_normValue = (int)((1<<(12+16)) / normValue);
    for (uint8_t n = 0; n < N; n++) {
        XQ[n] = fix_normValue * y[n] >> 16;
    }
    // ensure trailing zero values for N<Nscales (e.g. for XQ1)
    for (uint8_t n = N; n < Nscales; n++)
    {
        XQ[n] = 0;
    }
}
void SnsQuantization::MPVQenum (
    int32_t& index,
    int32_t& lead_sign_ind,
    uint8_t dim_in, /* i : dimension of vec_in */
    int16_t vec_in[] /* i : PVQ integer pulse train */
    )
{dbgCodecCp();
    /* init */
    int32_t next_sign_ind = 0x80000000U; /* sentinel for first sign */
    int32_t k_val_acc = 0;
    int8_t pos = dim_in;
    index = 0;
    uint8_t n = 0;
    const unsigned int* row_ptr = &(MPVQ_offsets[n][0]);
    /* MPVQ-index composition loop */
    unsigned int tmp_h_row = row_ptr[0];
    for (pos--; pos >= 0; pos--)
    {
        int8_t tmp_val = vec_in[pos];

        //[index, next_sign_ind] = encPushSign(tmp_val, next_sign_ind, index);
        index = encPushSign(tmp_val, next_sign_ind, index);
        index += tmp_h_row;
        k_val_acc += (tmp_val<0)?-tmp_val:tmp_val;
        if ( pos != 0 )
        {
            n += 1; /* switch row in offset table MPVQ_offsets(n, k) */
        }
        row_ptr = &(MPVQ_offsets[n][0]);
        tmp_h_row = row_ptr[k_val_acc];
    }
    lead_sign_ind = next_sign_ind;
    //return [ index, lead_sign_ind ] ;
}

//[ index, next_sign_ind ] =
//encPushSign( val, next_sign_ind_in, index_in)
uint32_t SnsQuantization::encPushSign(
    int8_t val,
    int32_t& next_sign_ind_in,
    int32_t index_in
    )
{
    int32_t index = index_in;
    if ( ((next_sign_ind_in & 0x80000000U) == 0) && (val != 0) )
    {
        index = 2*index_in + next_sign_ind_in;
    }
    //next_sign_ind = next_sign_ind_in;
    if ( val < 0 )
    {
        next_sign_ind_in = 1;
    }
    if ( val > 0 )
    {
        next_sign_ind_in = 0;
    }
    /* if val==0, there is no new sign information to “push”,
    i.e. next_sign_ind is not changed */
    //return [ index, next_sign_ind ];
    return index;
}

void SnsQuantization::registerDatapoints()
{
    

    {
        //_cfg.addDatapoint( "ind_LF", &ind_LF, sizeof(ind_LF) );
        //_cfg.addDatapoint( "ind_HF", &ind_HF, sizeof(ind_HF) );
        //_cfg.addDatapoint( "shape_j", &shape_j, sizeof(shape_j) );
        //_cfg.addDatapoint( "Gind", &Gind, sizeof(Gind) );
        //_cfg.addDatapoint( "LS_indA", &LS_indA, sizeof(LS_indA) );
        //_cfg.addDatapoint( "LS_indB", &LS_indB, sizeof(LS_indB) );
        //_cfg.addDatapoint( "idxA", &idxA, sizeof(idxA) );
        //_cfg.addDatapoint( "idxB", &idxB, sizeof(idxB) );

        //_cfg.addDatapoint( "t2rot", &t2rot[0], sizeof(float)*Nscales );
        //_cfg.addDatapoint( "scfQ", &scfQ[0], sizeof(float)*Nscales );

        //_cfg.addDatapoint( "sns_Y0", &sns_Y0[0], sizeof(int8_t)*16 );
        //_cfg.addDatapoint( "sns_Y1", &sns_Y1[0], sizeof(int8_t)*10 );
        //_cfg.addDatapoint( "sns_Y2", &sns_Y2[0], sizeof(int8_t)*16 );
        //_cfg.addDatapoint( "sns_Y3", &sns_Y3[0], sizeof(int8_t)*16 );
        //
        //_cfg.addDatapoint( "sns_XQ0", &sns_XQ0[0], sizeof(float)*16 );
        //_cfg.addDatapoint( "sns_XQ1", &sns_XQ1[0], sizeof(float)*10 );
        //_cfg.addDatapoint( "sns_XQ2", &sns_XQ2[0], sizeof(float)*16 );
        //_cfg.addDatapoint( "sns_XQ3", &sns_XQ3[0], sizeof(float)*16 );
    }
}

