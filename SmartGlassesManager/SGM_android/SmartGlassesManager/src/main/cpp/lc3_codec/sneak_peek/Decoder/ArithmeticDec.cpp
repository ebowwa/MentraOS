/*
 * ArithmeticDec.cpp
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

#include "ArithmeticDec.hpp"
#include "TemporalNoiseShapingTables.hpp"
#include "SpectralDataTables.hpp"

#include "BitReader.hpp"

#include <cstring>
#include <cmath>

#include <algorithm>    // std::min
 
using namespace sneak::dec;
ArithmeticDec::ArithmeticDec(const Lc3Config& cfg)
    : Lc3Base(cfg),

    NF(_cfg.NF),
    NE(_cfg.NE),
    rateFlag(0),
    tns_lpc_weighting(0),
    nf_seed(0),
    nbits_residual(0)
    , _nbits(0)
{
 }

ArithmeticDec::~ArithmeticDec()
{
}
void ArithmeticDec::update(int nbits) {
    if (_nbits == nbits)return;
    _nbits = nbits;
    //tns_lpc_weighting = (nbits < ((_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 480 : 360)) ? 1 : 0;
    if (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) {
        tns_lpc_weighting = nbits < 480 ? 1 : 0;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms){
        tns_lpc_weighting = nbits < 360 ? 1 : 0;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
        tns_lpc_weighting = nbits < 240 ? 1 : 0;
    }else{
        tns_lpc_weighting = nbits < 120 ? 1 : 0;
    }
    rateFlag = (nbits > (160 + _cfg.Fs_ind * 160)) ? 512 : 0;
}
static inline void ac_dec_init(Lc3BitsReader& bs, struct ac_dec_state& st, uint8_t& BEC_detect)
{
#if 1
	uint8_t* bytes = bs.bytes0;
	st.low = ((uint32_t)bytes[0] << 16) | ((uint32_t)bytes[1] << 8) | ((uint32_t)bytes[2]);
    st.range = 0x00ffffff;
	st.bytes = bytes;
    st.bytes = bytes + 3;
    st.BEC_detect = &BEC_detect;
#else
	//
    //uint8_t* bytes = bs.bytes0;
	st.bytes = bs.bytes0;
	st.bytes0 = bs.bytes0;
    //st.bp = 0;
	st.low = 0;
    st.range = 0x00ffffff;
    for (uint8_t i = 0; i < 3; i++)
    {
        st.low <<= 8;
        //st.low += st.bytes0[(st.bp)++];
        st.low += *st.bytes++;
    }
#endif
}

static inline uint8_t ac_decode(
    //const uint8_t bytes[],
    //uint16_t& bp,
    struct ac_dec_state& st,
    const int16_t cum_freq[],
    const int16_t sym_freq[],
    //const uint16_t p[],
    const uint8_t p[],
    uint8_t numsym//,
    //uint8_t& BEC_detect
)
{
    dbgCodecCp();
    uint32_t tmp = st.range >> 10;
    
    //if (st.low >= (tmp << 10))
    //{
    //    *st.BEC_detect = 1;
    //    return 0;
    //}
    
#if 1
    auto low0 = (st.low) / (tmp);
    auto val = p[low0 >> 6];
    while (low0 < cum_freq[val]) {
        val--;
    }
#else
    auto val = numsym - 1;
    auto low0 = (st.low) / tmp;
    while (low0 < cum_freq[val]) {
        val--;
    }
#endif

    st.low -= tmp * cum_freq[val];
    //st.range = tmp * (cum_freq[val + 1] - cum_freq[val]);
    st.range = tmp * sym_freq[val];

    while (st.range < 0x10000)
    {
        //st.low += *st.bytes++;
        st.range <<= 8;
        st.low <<= 8;
        st.low &= 0x00ffffff;
        st.low += *st.bytes++;

    }

    return val;
}


void ArithmeticDec::run(
    Lc3BitsReader& bs,
    int32_t* spec,
    int16_t& num_tns_filters,
    int16_t rc_order[],
    const uint8_t& lsbMode,
    const int16_t& lastnz,
    uint16_t nbits,
    uint8_t& BEC_detect
    )
{

    update(nbits);
    // make local copy of rc_order (is this really what we want)
    rc_order_ari[0] = rc_order[0];
    rc_order_ari[1] = rc_order[1];

    /* Arithmetic Decoder Initialization */
    struct ac_dec_state st;
    ac_dec_init(bs, st, BEC_detect);
    const int NE_2 = NE >> 1;
    /* TNS data */
    // Note: some initialization code like that below can be found in d09r02,
    //       but there has been none in d09r01. However, the complete initialization
    //       has been added here, in order to get a proper match to the reference output data
    for (uint8_t i = 0; i < 2 * 8; i++) {
        rc_i[i] = 0;
    }

    for (uint8_t f = 0; f < num_tns_filters; f++)
    {
        //if (�������(�) > 0)
        if (rc_order[f] > 0)
        {
            //�������(�) = ac_decode(bytes, bp, &st,
            if (st.low >= st.range)
            {
                BEC_detect = 1;
                return;
            }
            rc_order_ari[f] = ac_decode(st,
                ac_tns_order_cumfreq[tns_lpc_weighting],
                ac_tns_order_freq[tns_lpc_weighting],
                ac_tns_order_p[tns_lpc_weighting], 8
            );



            rc_order_ari[f]++;// = rc_order_ari[f] + 1;
            // specification (d09r02_F2F) proposes initialization
            // of rc_i at this place; here implemented above in order
            // to be performed independet from num_tns_filters
            uint8_t f8 = f << 3;
            //auto rc_f8 = &rc_f[f8];
            auto rc_i8 = &rc_i[f8];
            for (uint8_t k = 0; k < rc_order_ari[f]; k++)
            {
                //���(�,�) = ac_decode(bytes, bp, &st, ac_tns_coef_cumfreq[k],ac_tns_coef_freq[k], 17);
                //rc_i[k][f] = ac_decode(bytes, bp, &st, ac_tns_coef_cumfreq[k],ac_tns_coef_freq[k], 17);
                if (st.low >= st.range)
                {
                    BEC_detect = 1;
                    return;
                }
                auto rc = ac_decode(st, ac_tns_coef_cumfreq[k], ac_tns_coef_freq[k], ac_tns_coef_p[k], 17);
                static const float quantizer_stepsize = PI / 17.0f;
                rc_i8[k] = rc;

            }
        }
    }

    /* Spectral data */
    uint16_t c = 0, t;
    uint8_t pki, nbit, bit1;
    uint32_t bit;
    int32_t ari0 = 0;
    int32_t ari1 = 0;

    for (uint16_t k = 0; k < lastnz; k += 2)
    {
        t = c + rateFlag;
        if (k > NE_2)
        {
            t += 256;
        }
        //��̂[k] = ��̂[k+1] = 0;
        int levf = 0;

        uint8_t lev = 0;
        uint8_t sym = 0;
        pki = ac_spec_lookup[t];
        if (st.low >= st.range)
        {
            BEC_detect = 1;
            return;
        }
        sym = ac_decode(st, ac_spec_cumfreq[pki],ac_spec_freq[pki], ac_spec_p[pki], 17);
        if (sym == 16)
        {
            lev = 1;
            pki = ac_spec_lookup[t + 1024];
            if (st.low >= st.range)
            {
                BEC_detect = 1;
                return;
            }
            sym = ac_decode(st, ac_spec_cumfreq[pki], ac_spec_freq[pki], ac_spec_p[pki], 17);
            if (sym == 16)
            {
                lev = 2;
                pki = ac_spec_lookup[t + 2048];
                if (st.low >= st.range)
                {
                    BEC_detect = 1;
                    return;
                }
                sym = ac_decode(st, ac_spec_cumfreq[pki], ac_spec_freq[pki], ac_spec_p[pki], 17);

                if (sym == 16)
                {
                    lev = 3;
                    pki = ac_spec_lookup[t + 3072];
                    for (; lev < 14; lev++)
                    {
                        if (st.low >= st.range)
                        {
                            BEC_detect = 1;
                            return;
                        }
                        sym = ac_decode(st, ac_spec_cumfreq[pki], ac_spec_freq[pki], ac_spec_p[pki], 17);
                        if (sym < 16)
                        {
                            ari0 = sym & 0x3;
                            ari1 = sym >> 2;
                            t = 15;
                            break;
                        }
                    }
                    if (lev == 14)
                    {
                        BEC_detect = 1;
                        return;
                    }
                }
                else
                {
                    ari0 = sym & 0x3;
                    ari1 = sym >> 2;
                    t = 14;
                }
            }
            else
            {
                ari0 = sym & 0x3;
                ari1 = sym >> 2;
                t = 1 + ((ari0 + ari1) << 1);
            }
        }
        else
        {
            ari0 = sym & 0x3;
            ari1 = sym >> 2;
            t = 1 + ari0 + ari1;
        }



        if (lev) {
            ari0 <<= lev;
            ari1 <<= lev;
            if (lsbMode == 0) {        
                nbit = lev << 1;
                bit = read_uint(bs, nbit);
                ari0 |= ari_sym[bit & 255] & 15;
                ari1 |= ari_sym[bit & 255] >> 4;
                bit = bit >> 8;
                for (int i = 4; i < lev; i++) {
                    ari0 |= (bit & 1) << i;
                    bit >>= 1;
                    ari1 |= (bit & 1) << i;
                    bit >>= 1;
                }
            }
            else
            {
                levf = 1;
                if (lev > 1) {

                    nbit = (lev - 1) << 1;
                    bit = read_uint(bs, nbit);
                    ari0 |= (ari_sym[bit & 255] & 15) << 1;
                    ari1 |= (ari_sym[bit & 255] >> 4) << 1;
                    bit = bit >> 8;
                    for (int i = 4; i < lev - 1; i++) {
                        ari0 |= (bit & 1) << (i + 1);
                        bit >>= 1;
                        ari1 |= (bit & 1) << (i + 1);
                        bit >>= 1;
                    }
                    //ari0 = ari0 << 1;
                    //ari1 = ari1 << 1;
                }
            }
        }



        if (ari0)
        {
            bit1 = read_bit(bs);
            if (bit1)
            {
                ari0 = -ari0;
            }
        }

        if (ari1)
        {
            bit1 = read_bit(bs);
            if (bit1)
            {
                ari1 = -ari1;
            }

        }

        spec[k] = (ari0 << 4) | levf;
        spec[k + 1] = ari1 << 4;
        c = ((c & 15) << 4) + t;
        // Note: specification of the following line hase been changed from d09r01 to d09r02_F2F
        //read_bit_sync(bs);
        //if (st.bp - bs.bp > 3)
        if (st.bytes - bs.bytes > 3 + 4)
        {
            BEC_detect = 1;
            return;
        }
    }
    // reset remaining fields in array spec32 to simplify testing
    for (int16_t k = lastnz; k < NE; k++)
    {
        spec[k] = 0;
    }
    
    //uint16_t bp = st.bp;//st.bytes - bs.bytes0;
    //uint16_t bp_side = bs.bp;
    //uint8_t mask_side = bs.mask;
    uint16_t bp = st.bytes - bs.bytes0;
    uint16_t bp_side = 0;
    uint8_t mask_side = 0;
    read_bit_sync(bs, mask_side, bp_side);
    // 3.4.2.6 Residual data and finalization (d09r02_F2F)
    /* Number of residual bits */
    //int16_t nbits_side = nbits - (8 * bp_side + 8 - log2(mask_side));
    int16_t nbits_side = nbits - ((bp_side << 3) + 8 - (31 - __clz(mask_side)));
    //int16_t nbits_ari = (bp - 3) * 8;
    int16_t nbits_ari = (bp - 3) << 3;
    //nbits_ari += 25 - floor(log2(st.range));
    nbits_ari += (25 - 31) + __clz(st.range);
    int16_t nbits_residual_tmp = nbits - (nbits_side + nbits_ari);
    if (nbits_residual_tmp < 0)
    {
        BEC_detect = 1;
        return;
    }
    nbits_residual = nbits_residual_tmp;
}

void ArithmeticDec::registerDatapoints()
{

    {
        //_cfg.addDatapoint( "rateFlag", &rateFlag, sizeof(rateFlag) );
        //_cfg.addDatapoint( "tns_lpc_weighting", &tns_lpc_weighting, sizeof(tns_lpc_weighting) );
        //_cfg.addDatapoint( "rc_order_ari", &rc_order_ari[0], sizeof(rc_order_ari) );
        ////_cfg.addDatapoint( "rc_i", &rc_i[0], sizeof(rc_i) );
        ////_cfg.addDatapoint( "spec32", &spec32[0], sizeof(int32_t)*NE );
        //_cfg.addDatapoint( "nbits_residual", &nbits_residual, sizeof(nbits_residual) );
    }
}

