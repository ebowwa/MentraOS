/*
 * EncoderFrame.cpp
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

#include "EncoderFrame.hpp"
#include "Lc3EncoderCommon.h"
#include <cstring>
#include <cmath>
#include <malloc.h>
using namespace sneak::enc;

EncoderFrame::EncoderFrame(const Lc3Config& cfg)
    :Lc3Base(cfg),
    nbytes(0),    
    mdctEnc(cfg),
    _eband(cfg),
    bandwidthDetector(cfg),
    attackDetector(cfg),
    spectralNoiseShaping(cfg, _eband.get_I_fs()),
    temporalNoiseShaping(cfg),
    longTermPostfilter(cfg),
    spectralQuantization(cfg),
    _residual(cfg),
    noiseLevelEstimation(cfg),
    bitstreamEncoding(cfg),
    frameN(0)
    , _input32((float*&)(cfg.Runtime< Lc3EncoderCommon>()._input32))
    , _spec32((float*&)(cfg.Runtime<Lc3EncoderCommon>()._spec32))
    , _temp32((float*&)(cfg._runtime_temp32))
{
    //res_bits = AllocT<uint8_t>(cfg.NE);
    //lsbs = AllocT<uint8_t>(cfg.NE);
    //if (!_spec16)_spec16 = AllocT<int16_t>(cfg.NE);
    if (!_input32)_input32 = AllocT<float>(cfg.NF);//16bits buff for temp
    if (!_spec32)_spec32 = AllocT<float>(cfg.NF);
    if (!_temp32)_temp32 = AllocT<float>(480);// cfg.NF);
}

EncoderFrame::~EncoderFrame()
{
    //Free(res_bits);
    //Free(lsbs);
    Free(_spec32);
    Free(_input32);
    Free(_temp32);
}
void EncoderFrame::update(int nbytes_) {
    if (nbytes == nbytes_)return;
    nbytes = nbytes_;
    auto nbits = nbytes * 8;
    longTermPostfilter.update(nbits);
}
//int16_t* EncoderFrame::getTempBuff16() const {
//    return _spec16;
//}
float* EncoderFrame::getInputBuff() const {
    return _input32;
}
//
typedef union encoder_temp_0_t {
    float temp32[480];
    struct {
        float E_B[64];
        //float x_att_extended[160+4];
        float sns_temp[480 - 64];
    };
    float E[100];
    float rc_q[16];
    struct {
        uint8_t res_bits[400];
        uint8_t lsbs[400];
    };
}encoder_temp_0_t;
void EncoderFrame::run(const float* x_s, uint8_t* bytes, uint16_t nbytes_)
{
    auto spec16 = (int16_t*)_input32;
    auto spec32 = _spec32;
    auto temp32 = (encoder_temp_0_t*)_temp32;
    // increment frame counter
    frameN++;
    update(nbytes_);

    // 3.3.3 Input signal scaling (d09r02_F2F)
    // -> should be made in calling code due to different data types being needed

    //3.3.4 Low delay MDCT analysis   (d09r02_F2F)
    mdctEnc.run(x_s,spec32, temp32->temp32);

    //   
    _eband.run(spec32, temp32->E_B);

    //3.3.5 Bandwidth detector   (d09r02_F2F)
    bandwidthDetector.run(temp32->E_B);

    //3.3.6 Time domain attack detector   (d09r02_F2F)
    //attackDetector.run(x_s, nbytes, temp32->x_att_extended);
    attackDetector.run(x_s, nbytes);

    //3.3.7 Spectral Noise Shaping (SNS)   (d09r02_F2F)
    spectralNoiseShaping.run(spec32, spec32, temp32->E_B, attackDetector._F_att, temp32->sns_temp);

    //3.3.8 Temporal Noise Shaping (TNS)   (d09r02_F2F)
    const uint16_t  nbits = nbytes * 8;
    temporalNoiseShaping.run(spec32, spec32, temp32->rc_q, bandwidthDetector.P_bw, nbits, _eband.near_nyquist_flag);

    //3.3.9 Long Term Postfilter  (d09r02_F2F)
    longTermPostfilter.run(x_s, _eband.near_nyquist_flag);

    //3.3.10 Spectral quantization  (d09r02_F2F)
    //3.3.10.1 Bit budget  (d09r02_F2F)
    auto nbits_spec = estimateBits(nbits);
    //
    spectralQuantization.run(spec32,spec16, temp32->E, nbits, nbits_spec);

    // 3.3.11 Residual coding  (d09r02_F2F)
    // nbits_residual_max = 𝑛𝑏𝑖𝑡𝑠𝑠𝑝𝑒𝑐 - 𝑛𝑏𝑖𝑡𝑠𝑡𝑟𝑢𝑛𝑐 + 4;
    _residual.run(spec16, spec32, nbits_spec
        , spectralQuantization.nbits_trunc
        , spectralQuantization.gg
        , temp32->res_bits
    );   

    // 3.3.12 Noise level estimation  (d09r02_F2F)
    noiseLevelEstimation.run(spec32,spec16,
        bandwidthDetector.P_bw,
        spectralQuantization.gg);


    // 3.3.13 Bitstream encoding  (d09r02_F2F)
    // 3.3.13.2 Initialization  (d09r02_F2F)
    bitstreamEncoding.init(bytes,nbytes);
    // 3.3.13.3 Side information  (d09r02_F2F)
    /* Bandwidth */
    bitstreamEncoding.bandwidth(bandwidthDetector.P_bw, bandwidthDetector.nbits_bw);
    /* Last non-zero tuple */
    bitstreamEncoding.lastNonzeroTuple(spectralQuantization.lastnz_trunc);
    /* LSB mode bit */
    bitstreamEncoding.lsbModeBit(spectralQuantization.lsbMode);
    /* Global Gain */
    bitstreamEncoding.globalGain(spectralQuantization.gg_ind);
    /* TNS activation flag */
    bitstreamEncoding.tnsActivationFlag(
        temporalNoiseShaping.num_tns_filters,
        temporalNoiseShaping.rc_order
        );
    /* Pitch present flag */
    bitstreamEncoding.pitchPresentFlag(longTermPostfilter.pitch_present);
    /* Encode SCF VQ parameters - 1st stage (10 bits) */
    bitstreamEncoding.encodeScfVq1stStage(
        spectralNoiseShaping.get_ind_LF(),
        spectralNoiseShaping.get_ind_HF()
        );
    /* Encode SCF VQ parameters - 2nd stage side-info (3-4 bits) */
    /* Encode SCF VQ parameters - 2nd stage MPVQ data */
    bitstreamEncoding.encodeScfVq2ndStage(
        spectralNoiseShaping.get_shape_j(),
        spectralNoiseShaping.get_Gind(),
        spectralNoiseShaping.get_LS_indA(),
        spectralNoiseShaping.get_index_joint_j()
        );
    /* LTPF data */
    if (longTermPostfilter.pitch_present != 0){
        bitstreamEncoding.ltpfData(
            longTermPostfilter.ltpf_active,
            longTermPostfilter.pitch_index
            );
    }
    /* Noise Factor */
    bitstreamEncoding.noiseFactor(noiseLevelEstimation.F_NF);

    
    {
        //_cfg.log("bytes_side_info", &bytes[0], sizeof(uint8_t)*nbytes);
    }

    // 3.3.13.4 Arithmetic encoding  (d09r02_F2F)
    /* Arithmetic Encoder Initialization */
    bitstreamEncoding.ac_enc_init();
    /* TNS data */
    bitstreamEncoding.tnsData(
        temporalNoiseShaping.tns_lpc_weighting,
        temporalNoiseShaping.num_tns_filters,
        temporalNoiseShaping.rc_order,
        temporalNoiseShaping.rc_i
        );
    /* Spectral data */
    //uint8_t lsbs[spectralQuantization.nbits_lsb]; // TODO check whether the degenerated case with nlsbs==0 works
    //uint8_t*lsbs = (uint8_t*)alloca(spectralQuantization.nbits_lsb); // TODO check whether the degenerated case with nlsbs==0 works
    //uint8_t* lsbs = (uint8_t*)_temp32;
    bitstreamEncoding.spectralData(
        spectralQuantization.lastnz_trunc,
        spectralQuantization.rateFlag,
        spectralQuantization.lsbMode,
        spec16,//spectralQuantization.X_q,
        spectralQuantization.nbits_lsb,
        temp32->lsbs
        );

    // 3.3.13.5 Residual data and finalization  (d09r02_F2F)
    bitstreamEncoding.residualDataAndFinalization(
        spectralQuantization.lsbMode,
        _residual._nbits,
        temp32->res_bits,
        temp32->lsbs
        );
    
    {
        //_cfg.log("nbits_spec", &nbits_spec, sizeof(nbits_spec) );
        //_cfg.log("bytes_ari", &bytes[0], sizeof(uint8_t)*nbytes);
    }

}
int EncoderFrame::estimateBits(int nbits) {
    //3.3.10 Spectral quantization  (d09r02_F2F)
    //3.3.10.1 Bit budget  (d09r02_F2F)
    uint16_t nbits_ari = ceil(log2(_cfg.NE / 2));
    if (nbits <= 1280){
        nbits_ari += 3;
    }
    else if (nbits <= 2560){
        nbits_ari += 4;
    }
    else{
        nbits_ari += 5;
    }

    const uint8_t nbits_gain = 8;
    const uint8_t nbits_nf = 3;
    int nbits_spec = nbits - (
        bandwidthDetector.nbits_bw +
        temporalNoiseShaping.nbits_TNS +
        longTermPostfilter.nbits_LTPF +
        spectralNoiseShaping.nbits_SNS +
        nbits_gain +
        nbits_nf +
        nbits_ari
        );
    return nbits_spec;
}
void EncoderFrame::registerDatapoints()
{
    

    {
        //bandwidthDetector.registerDatapoints();
        //longTermPostfilter.registerDatapoints();
        //bitstreamEncoding.registerDatapoints();
    }
}

