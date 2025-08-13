/*
 * BitstreamEncoding.hpp
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

#ifndef BITSTREAM_ENCODING_H_
#define BITSTREAM_ENCODING_H_

#include <cstdint>

#include "Lc3Base.h"
#include "Lc3Config.hpp"

namespace sneak{ namespace enc
{

class BitstreamEncoding :public Lc3Base
{
    public:
        BitstreamEncoding(const Lc3Config&);
        ~BitstreamEncoding();

        void registerDatapoints();

        void init(uint8_t* bytes_,uint16_t nbytes);
        void bandwidth(uint8_t P_bw, uint8_t nbits_bw);
        void lastNonzeroTuple(uint16_t lastnz_trunc);
        void lsbModeBit(uint8_t lsbMode);
        void globalGain(uint8_t gg_ind);
        void tnsActivationFlag(uint8_t num_tns_filters, uint8_t rc_order[]);
        void pitchPresentFlag(uint8_t pitch_present);
        void encodeScfVq1stStage(uint8_t ind_LF, uint8_t ind_HF);
        void encodeScfVq2ndStage(
                uint8_t shape_j,
                uint8_t gain_i,
                uint8_t LS_indA,
                uint32_t index_joint_j);
        void ltpfData(uint8_t ltpf_active, uint16_t pitch_index);
        void noiseFactor(uint8_t F_NF);

        void ac_enc_init();
        void tnsData(
            uint8_t tns_lpc_weighting,
            uint8_t num_tns_filters,
            uint8_t rc_order[],
            uint8_t rc_i[]
            );
        void spectralData(
            uint16_t lastnz_trunc,
            uint16_t rateFlag,
            uint8_t lsbMode,
            int16_t* X_q,
            uint16_t nbits_lsb,
            uint8_t *lsbs_
            );
        void residualDataAndFinalization(uint8_t lsbMode, uint16_t nbits_residual, uint8_t* res_bits, uint8_t* lsbs);

    //private:
        //void write_bit_backward(uint8_t bytes[], uint16_t* bp, uint8_t* mask, uint8_t bit);
        //void write_uint_backward(uint8_t bytes[], uint16_t* bp, uint8_t* mask, uint16_t val, uint8_t numbits);
        //void write_uint_forward(uint8_t bytes[], uint16_t bp, uint16_t val, uint8_t numbits);
    public:
        struct ac_enc_state {
            //uint32_t low;
			uint64_t low;
            uint32_t range;
            //int32_t cache;
            //int32_t carry;
            //int32_t carry_count;
            uint16_t* output;         
            uint32_t low_bits;
        };
        struct ac_enc_side {
            uint32_t cache;
            uint32_t* bytes;
            uint32_t bits;
        };
    private:
        //void ac_shift(uint8_t bytes[], uint16_t* bp, struct ac_enc_state* st);
        //void ac_encode(uint8_t bytes[], uint16_t* bp, struct ac_enc_state* st, short cum_freq, short sym_freq);
        //void ac_enc_finish(uint8_t bytes[], uint16_t* bp, struct ac_enc_state* st);

        uint16_t nbits_side_written();
        uint16_t nbits_ari_forecast();
        uint16_t nbits_spec_written();

    public:
        const uint16_t NE;
        uint16_t nbytes;
        uint16_t nbits;

    private:
        uint8_t* bytes;
        //uint16_t bp;
        //uint16_t bp_side;
        //uint8_t mask_side;
        uint16_t nbits_side_initial;
        uint16_t nlsbs;
        //uint8_t* lsbs;
        struct ac_enc_state st;
        struct ac_enc_side bs;
};

}}//namespace sneak{ namespace enc

#endif // BITSTREAM_ENCODING_H_

