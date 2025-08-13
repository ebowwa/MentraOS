/*
 * DecoderFrame.cpp
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

#include "DecoderFrame.hpp"
#include "BitReader.hpp"
#include "Lc3DecoderCommon.h"
#include <cstring>
#include <cmath>
//#include "stdio.h"
using namespace sneak::dec;
extern const float _rc_sin_tbl[];
extern const int32_t _rc_sin_tbl32[];

DecoderFrame::DecoderFrame(const Lc3Config& cfg)
    :Lc3Base(cfg),
    nbytes(0),
    nbits(0),

    sideInformation(cfg),
    arithmeticDec(cfg),
    residualSpectrum(cfg),
    noise(cfg),
    tns(cfg),
    spectralNoiseShaping(cfg),
    packetLossConcealment(cfg),
    mdctDec(cfg),
    //longTermPostfilter(_cfg),
    _ltpf(cfg),
    //
    frameN(0),
    lastnz(0),
    P_BW(0),
    lsbMode(0),
    gg_ind(0),
    num_tns_filters(0),
    pitch_present(0),
    pitch_index(0),
    ltpf_active(0),
    F_NF(0),
    ind_LF(0),
    ind_HF(0),
    Gind(0),
    LS_indA(0),
    LS_indB(0),
    idxA(0),
    idxB(0),
    nf_seed(0),
    zeroFrame(0),
    gg_off(0),
    _temp((float*&)cfg._runtime_temp32)
{
    rc_order[0] = 0;
    rc_order[1] = 0;  

    //_buff = AllocT<int32_t>(_cfg.NF*2);   
    //_buff = AllocT<int32_t>(_cfg.NF);  
    int buffsize = _cfg.NF;
    if (!_temp) buffsize += _cfg.NF;
    _buff = AllocT<float>(buffsize);
    _spec = _buff;
    if (!_temp) _temp = _spec+_cfg.NF;
    
	//for dctIV
    for (int i = _cfg.NE; i < _cfg.NF; i++) {
        _spec[i] = 0;
        _temp[i] = 0;
    }
}

DecoderFrame::~DecoderFrame()
{
    Free(_buff);
    //Free(_temp);
}
void DecoderFrame::update(int nbytes_) {
    if (nbytes == nbytes_)return;
    nbytes = nbytes_;
    nbits = nbytes_ * 8;
    _ltpf.UpdateBitRate(nbits);
    //longTermPostfilter.SetGainParams(nbits);
    arithmeticDec.update(nbits);
    //update gg_off
    int16_t v1 = nbits / (10 * (_cfg.Fs_ind + 1));
    if (v1 > 115) {
        gg_off = -115;
    }
    else {
        gg_off = -v1;
    }
    gg_off -= 105;
    gg_off -= 5 * (_cfg.Fs_ind + 1);
}

void DecoderFrame::applyGlobalGain(int32_t*spec32,float* spec)
{
    dbgCodecCp();
    //3.4.5 Global gain (d09r02_F2F)
    //The global gain is applied to the spectrum after noise filling has been applied using the following formula (110) & (111)
    //int16_t v1 = nbits / (10*(_cfg.Fs_ind+1));
    //if (v1 > 115) {
    //    gg_off = -115;
    //}
    //else {
    //    gg_off = -v1;
    //}
    //gg_off -= 105;
    //gg_off -= 5*(_cfg.Fs_ind+1);

    float exponent = (gg_ind + gg_off) / 28.0f;
    float gg = pow( 10.0f, exponent);
    gg /= 16.f;
    gg *= mdctDec._gain;
    //for (int16_t k = 0; k < _cfg.NE; k++)
    for (int k = 0; k < lastnz; k++)
    {
        //X_hat_f[k] = gg * X_hat_q_nf[k];
        spec[k] = gg * spec32[k];
    }
    for (int k = lastnz; k < _cfg.NE; k++) {
        spec[k] = 0;
    }
    //printf("[lc3][%d][%5d]%d,%d,%d,%d.%06d\n", __LINE__, frameN, nbytes,gg_off,gg_ind, (int)gg,(int)((gg-(int)gg)*1000000));
}

void DecoderFrame::runFloat(const uint8_t *bytes, uint8_t BFI, uint8_t& BEC_detect){    
    // increment frame counter
    //printf("[%d]\n", frameN);
    auto tmp = _spec;
    _spec = _temp;
    _temp = tmp;
    frameN++;    
    // 5.4.2.2 Initialization
    BEC_detect = BFI;  // Note: the base specification initializes BEC_detect with zero, but initialization with BFI is more meaningful
    ///init bitstream
    Lc3BitsReader bs;    
    if (!BEC_detect) {
        read_bits_init(bs, (uint8_t*)bytes, nbytes);
    }
    //if (BEC_detect)printf("[lc3][err][%d]BEC_detect:%d\n", __LINE__,BEC_detect);
    // 5.4.2.3 Side information
    if (!BEC_detect)
    {
        sideInformation.run(
            bs,
            P_BW,
            lastnz,
            lsbMode,
            gg_ind,
            num_tns_filters,
            rc_order,
            pitch_present,
            pitch_index,
            ltpf_active,
            F_NF,
            ind_LF,
            ind_HF,
            Gind,
            LS_indA,
            LS_indB,
            idxA,
            idxB,
            BEC_detect
        );
    }
    //if (BEC_detect)printf("[lc3][err][%d]BEC_detect:%d\n", __LINE__, BEC_detect);
    // 3.4.2.4 Bandwidth interpretation (d09r02_F2F)
    // ...included somewhere else?
    //switch spec buffer (2)
    auto spec = _spec;    
    auto spec32 = (int32_t*)spec;
    // 3.4.2.5 Arithmetic decoding (d09r02_F2F)
    if (!BEC_detect)
    {
        arithmeticDec.run(
            bs,
            spec32,
            num_tns_filters,
            rc_order,
            lsbMode,
            lastnz,
            nbits,
            BEC_detect
        );
    }
    //if (BEC_detect)printf("[lc3][err][%d]BEC_detect:%d\n", __LINE__, BEC_detect);
    if (!BEC_detect)
    {
        /* Decode residual bits */
        // and 3.4.3 Residual decoding  (d09r02_F2F)
        residualSpectrum.run(
            bs,
            lastnz,
            spec32,
            arithmeticDec.nbits_residual,
            lsbMode,
            nf_seed,
            zeroFrame,
            gg_ind,
            F_NF
        );

        //3.4.4 Noise filling (d09r02_F2F)
        //noiseFilling(spec32);
        noise.run(spec32, (int32_t *)_temp, F_NF, P_BW, nf_seed, zeroFrame, lastnz);

        //3.4.5 Global gain (d09r02_F2F)
        applyGlobalGain(spec32,spec);

        // 3.4.6 TNS decoder (d09r02_F2F)
        //temporalNoiseShaping(specfloat);
        tns.run(spec
            , arithmeticDec.rc_order_ari
            , num_tns_filters
            , arithmeticDec.rc_i
            , P_BW
            , lastnz
            );

        //3.4.7 SNS decoder (d09r02_F2F)
        spectralNoiseShaping.run(
            spec,
            ind_LF,
            ind_HF,
            sideInformation.submodeMSB,
            sideInformation.submodeLSB,
            Gind,
            LS_indA,
            LS_indB,
            idxA,
            idxB
        );
    }

    // Appendix B. Packet Loss Concealment   (d09r02_F2F)
    // packetLossConcealment.run(BEC_detect, spec, ltpf_active);
    packetLossConcealment.mdctplcrun(BEC_detect, spec, ltpf_active, spectralNoiseShaping.scfQ, 0);
#if 0
    //3.4.8 Low delay MDCT synthesis   (d09r02_F2F)    
    _pcm = longTermPostfilter.GetBuffInput();
    auto temp = _temp;//_ltpf.GetBuffTemp();
    mdctDec.run(spec, _pcm, _spec, lastnz);

    //3.4.9 Long Term Postfilter   (d09r02_F2F)
    //longTermPostfilter.setInputX(_pcm);
    _pcm = longTermPostfilter.run(ltpf_active, pitch_index);
#else
    //3.4.8 Low delay MDCT synthesis   (d09r02_F2F)   
    _pcm = _ltpf.GetBuffInput();
    auto temp = _temp;//_ltpf.GetBuffTemp();
    mdctDec.run(spec, _pcm, temp, lastnz);

    //3.4.9 Long Term Postfilter   (d09r02_F2F)   
    _pcm = _ltpf.Process(ltpf_active, pitch_present, pitch_index, temp);
#endif

    //_decFrmN++;
    ///switch spec and temp
}
void DecoderFrame::run(const uint8_t* bytes, uint16_t nbytes_,
    uint8_t BFI,
    uint8_t bits_depth,
    uint8_t bits_align,
    void* x_out,
    uint8_t& BEC_detect
)
{
    if (!_cfg.isValid()) {
        return;
    }
    update(nbytes_);
    // main decoder implementation: 3.4.1 until 3.4.9 (d09r06)
    runFloat(bytes, BFI, BEC_detect);
    // 3.4.10 Output signal scaling and rounding   (d09r06)
    if (bits_depth == 16)
        output16((int16_t*)x_out);
    else if (bits_depth == 24)
        output24(x_out, bits_align);
    else if (bits_depth == 32)
        output32((int32_t*)x_out);
    else
        ;
}

void DecoderFrame::output16(int16_t* x_out) {dbgCodecCp();
    //auto gain = _gain * mdctDec._gain;
    int skip = _cfg.isInterlace?_cfg.Nc:1;
    for (uint16_t k = 0; k < _cfg.NF; k++){
        auto x_hat_clip_local = (int32_t)(__vcvta_s32(_pcm[k]));// * gain;
        *x_out = (int16_t)__ssat(x_hat_clip_local, 16);
        x_out+=skip;
    }
}

void DecoderFrame::output24(void* x_out,int bits_align) {
    //auto gain = _gain * mdctDec._gain;+
    if ((bits_align == 0) || (bits_align == 24)) {
        float gain = 255.9999999999f;
        int skip = _cfg.isInterlace ? (_cfg.Nc * 3) : 3;
        int8_t* out = (int8_t*)x_out;
        for (uint16_t k = 0; k < _cfg.NF; k++) {
            auto x_hat_clip_local = (int32_t)(__vcvta_s32(_pcm[k] * gain));// * gain;
            auto tmp = __ssat(x_hat_clip_local, 24);
            int8_t* tmp_out = (int8_t*)&tmp;
            out[0] = tmp_out[0];
            out[1] = tmp_out[1];
            out[2] = tmp_out[2];
            out += skip;
        }
    }
    else if (bits_align == 32) {
        float gain = 255.9999999999f;
        int skip = _cfg.isInterlace ? _cfg.Nc : 1;
        int32_t* out = (int32_t*)x_out;
        for (uint16_t k = 0; k < _cfg.NF; k++) {
            auto x_hat_clip_local = (int32_t)(__vcvta_s32(_pcm[k] * gain));// * gain;
            *out = (int32_t)__ssat(x_hat_clip_local, 24);
            out += skip;
        }
    }
    //dbgTestDump(x_out, 16);
}

void DecoderFrame::output32(int32_t* x_out) {
    dbgCodecCp();
    //auto gain = _gain * mdctDec._gain;
    float gain = 65535.9999999999f;
	int skip = _cfg.isInterlace?_cfg.Nc:1;
    for (uint16_t k = 0; k < _cfg.NF; k++)
    {
        //auto x_hat_clip_local = (int32_t)(longTermPostfilter.x_hat_ltpf[k]*gain);// *(1.f / GlobalGain));
        auto x_hat_clip_local = (int64_t)(__vcvta_s32(_pcm[k]*gain));
        *x_out = (int32_t)__ssat(x_hat_clip_local, 32);
		x_out+=skip;
    }
}
void DecoderFrame::registerDatapoints()
{

    {
        //_cfg.addDatapoint( "fs_idx", &_cfg.Fs_ind, sizeof(_cfg.Fs_ind) );
        //
        //_cfg.addDatapoint( "frameN", &frameN, sizeof(frameN) );
        //
        //_cfg.addDatapoint( "lastnz", &lastnz, sizeof(lastnz) );
        //_cfg.addDatapoint( "P_BW", &P_BW, sizeof(P_BW) );
        //_cfg.addDatapoint( "lsbMode", &lsbMode, sizeof(lsbMode) );
        //_cfg.addDatapoint( "gg_ind", &gg_ind, sizeof(gg_ind) );
        //_cfg.addDatapoint( "num_tns_filters", &num_tns_filters, sizeof(num_tns_filters) );
        //_cfg.addDatapoint( "rc_order", &rc_order[0], sizeof(rc_order) );
        //_cfg.addDatapoint( "pitch_index", &pitch_index, sizeof(pitch_index) );
        //_cfg.addDatapoint( "pitch_present", &pitch_present, sizeof(pitch_present) );
        //_cfg.addDatapoint( "ltpf_active", &ltpf_active, sizeof(ltpf_active) );
        //_cfg.addDatapoint( "F_NF", &F_NF, sizeof(F_NF) );
        //_cfg.addDatapoint( "ind_LF", &ind_LF, sizeof(ind_LF) );
        //_cfg.addDatapoint( "ind_HF", &ind_HF, sizeof(ind_HF) );
        //_cfg.addDatapoint( "Gind", &Gind, sizeof(Gind) );
        //_cfg.addDatapoint( "LS_indA", &LS_indA, sizeof(LS_indA) );
        //_cfg.addDatapoint( "idxA", &idxA, sizeof(idxA) );
        //_cfg.addDatapoint( "idxB", &idxB, sizeof(idxB) );
        //
        //_cfg.addDatapoint( "nf_seed", &nf_seed, sizeof(nf_seed) );
        //_cfg.addDatapoint( "zeroFrame", &zeroFrame, sizeof(zeroFrame) );

        //_cfg.addDatapoint( "gg_off", &gg_off, sizeof(gg_off) );
        //_cfg.addDatapoint( "rc_i_tns", &arithmeticDec.rc_i[0], sizeof(arithmeticDec.rc_i[0])*8 );

        //_cfg.addDatapoint( "X_hat_q_nf", &X_hat_q_nf[0], sizeof(float)*_cfg.NE );
        //_cfg.addDatapoint( "X_s_tns", &X_s_tns[0], sizeof(float)*_cfg.NE );
        //_cfg.addDatapoint( "X_hat_ss", &X_hat_ss[0], sizeof(float)*_cfg.NE );

        /*if (nullptr==x_hat_clip)
        {
            x_hat_clip = (float *)Alloc(_cfg.NE*sizeof(float));
        }
        _cfg.addDatapoint( "x_hat_clip", &x_hat_clip[0], sizeof(float)*_cfg.NF );*/

        //sideInformation.registerDatapoints();
        //arithmeticDec.registerDatapoints();
        //longTermPostfilter.registerDatapoints();
    }
}


