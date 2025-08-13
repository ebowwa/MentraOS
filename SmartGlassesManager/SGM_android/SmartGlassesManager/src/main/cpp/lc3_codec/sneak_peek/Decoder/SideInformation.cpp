/*
 * SideInformation.cpp
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

#include "SideInformation.hpp"
#include "BitReader.hpp"

#include <cmath>

using namespace sneak::dec;

static const uint8_t  nbits_bw_table[5] = {0, 1, 2, 2, 3}; // see 3.4.2.4 Bandwidth interpretation (d09r02_F2F)

SideInformation::SideInformation(const Lc3Config&cfg)
    :Lc3Base(cfg),
    NF(cfg.NF),
    NE(cfg.NE),
    fs_ind(cfg.Fs_ind),
    nbits_bw(nbits_bw_table[fs_ind]),
    submodeMSB(0),
    submodeLSB(0)
{
}

SideInformation::~SideInformation()
{
}

void SideInformation::dec_split_st2VQ_CW(
    uint32_t cwRx, uint32_t szA, uint32_t szB,
    uint8_t& BEC_detect, int16_t& submodeLSB,
    int32_t& idxA, int32_t& idxBorGainLSB )
{
    if( cwRx >= szB * szA)
    {
        idxA = 0;
        idxBorGainLSB = 0;
        submodeLSB = 0;
        BEC_detect = 1;
        return;
    }
    idxBorGainLSB = cwRx / szA;
    idxA = cwRx - idxBorGainLSB*szA;
    submodeLSB = 0;
    idxBorGainLSB = idxBorGainLSB - 2 ;
    if( idxBorGainLSB < 0 )
    {
        submodeLSB = 1;
    }

    idxBorGainLSB = idxBorGainLSB + (submodeLSB<<1);
    //BEC_detect = 0; // changed in comparision to specification -> variable is handles as reference to overall BEC_detect
}



void SideInformation::run(
            Lc3BitsReader& bs,
            int16_t& P_BW,
            int16_t& lastnz,
            uint8_t& lsbMode,
            int16_t& gg_ind,
            int16_t& num_tns_filters,
            int16_t* rc_order,
            uint8_t& pitch_present,
            int16_t& pitch_index,
            int16_t& ltpf_active,
            int16_t& F_NF,
            int16_t& ind_LF,
            int16_t& ind_HF,
            int16_t& Gind,
            int16_t& LS_indA,
            int16_t& LS_indB,
            int32_t& idxA,
            int16_t& idxB,

            uint8_t& BEC_detect
        )
{
    dbgCodecCp();
    // 5.4.2.3 Side information
    /* Bandwidth */
    if (nbits_bw > 0)
    {
        //P_BW = read_uint(bytes, &bp_side, &mask_side, nbits_bw);
        P_BW = read_uint(bs, nbits_bw);
        if (fs_ind < P_BW)
        {
            BEC_detect = 1;
            return;
        }
    }
    else
    {
        P_BW = 0;
    }
    /* Last non-zero tuple */
    //nbits_lastnz = ceil(log2(NE/2));
    nbits_lastnz = 32 - __clz(NE >> 1);
    int16_t tmp_lastnz = read_uint(bs, nbits_lastnz);
    lastnz = (tmp_lastnz + 1) << 1;
    if (lastnz > NE)
    {
        /* consider this as bit error (BEC) */
        BEC_detect = 1;
        lastnz = NE;
        return;
    }
    /* LSB mode bit */
    //lsbMode = read_bit(bytes, &bp_side, &mask_side);
    lsbMode = read_bit(bs);
    /* Global Gain */
    //gg_ind = read_uint(bytes, &bp_side, &mask_side, 8);
    gg_ind = read_uint(bs, 8);
    /* TNS activation flag */
    auto frame_dms = (int)_cfg.N_ms;
    if (P_BW >= 3 && frame_dms >= 50)
    {
        num_tns_filters = 2;
    }
    else
    {
        num_tns_filters = 1;
    }
    rc_order[0] = 0; // not specified, but on the safe side
    rc_order[1] = 0; // not specified, but on the safe side
    for (uint8_t f = 0; f < num_tns_filters; f++)
    {
        //rc_order[f] = read_bit(bytes, &bp_side, &mask_side);
        rc_order[f] = read_bit(bs);        
    }
    /* Pitch present flag */
    //pitch_present = read_bit(bytes, &bp_side, &mask_side);
    pitch_present = read_bit(bs);

    /* SNS-VQ integer bits */
    /* Read 5+5 bits of SNQ VQ decoding stage 1 according to Section 5.4.7.2.1 (d09r01) */
    /* Read 5+5 bits of SNQ VQ decoding stage 1 according to Section 3.4.7.2.1 (d09r02)(d09r02_F2F) */
    //ind_LF = read_uint(bytes, &bp_side, &mask_side, 5); /* stage1 LF */
    ind_LF = read_uint(bs, 5); /* stage1 LF */
    //ind_HF = read_uint(bytes, &bp_side, &mask_side, 5); /* stage1 HF */
    ind_HF = read_uint(bs, 5); /* stage1 HF */
    
    /* Read 28 bits of SNS VQ decoding stage 2 according to section 5.4.7.2.2 (d09r01) */
    // 3.4.7.2.2 Stage 2 SNS VQ decoding   (d09r02_F2F)
    //submodeMSB = read_bit(bytes, &bp_side, &mask_side);
    submodeMSB = read_bit(bs);

    if( submodeMSB == 0 )
    {
        //Gind = read_uint(bytes, &bp_side, &mask_side, 1);
        Gind = read_bit(bs);
    } else {
        //Gind = read_uint(bytes, &bp_side, &mask_side, 2);
        Gind = read_uint(bs, 2);
    }
    //LS_indA = read_bit(bytes, &bp_side, &mask_side); /* LS_indA 1 bit */
    LS_indA = read_bit(bs); /* LS_indA 1 bit */

    if( submodeMSB == 0 )
    {
        /* ‘regular’/’regular_lf’ demultiplexing, establish if shape_j is 0 or 1 */
        //uint32_t tmp = read_uint(bytes, &bp_side, &mask_side, 13) ;
        //tmp |= (read_uint(bytes, &bp_side, &mask_side, 12)<<13) ;
		//uint32_t tmp = read_uint(bs, 13) ;
        //tmp |= (read_uint(bs, 12)<<13) ;
        uint32_t tmp = read_uint(bs, 25);		
        int32_t idxBorGainLSB;
        //[ BEC_detect, submodeLSB, idxA, idxBorGainLSB ] = dec_split_st2VQ_CW(tmp, 4780008U>>1, 14 );
        dec_split_st2VQ_CW(tmp, 4780008U>>1, 14, BEC_detect, submodeLSB, idxA, idxBorGainLSB );
        if (BEC_detect)
        {
            // early exit to avoid unpredictable side-effects
            return;
        }
        if( submodeLSB != 0 )
        {
            Gind = (Gind<<1) + idxBorGainLSB; /* for regular_lf */
            // just set some defined values (although nothing is specified for this case)
            idxB = 0;
            LS_indB = 0;
        } else {
            idxB = idxBorGainLSB>>1; /* for regular */
            LS_indB = idxBorGainLSB&0x1;
        }
    }
    else
    {
        // Attention: the given reference intermediate results do not cover
        // this case -> tested with conformance tests only! (successful operation observed already)
        /* outlier_* demultiplexing, establish if shape_j is 2 or 3 */
        //int32_t tmp = read_uint(bytes, &bp_side, &mask_side, 12);        
        //tmp |= static_cast<int32_t>( read_uint(bytes, &bp_side, &mask_side, 12)<<12 );
		//int32_t tmp = read_uint(bs, 12);        
        //tmp |= static_cast<int32_t>( read_uint(bs, 12)<<12 );
        int32_t tmp = read_uint(bs, 24);
        idxA = tmp;
        //idxB = -1; // removed in pseudo-code of d09r02_F2F
        submodeLSB = 0;
        // this intialization does not seem to be correct here
        // (just from code reading; context of pseudo-code in specification is not clear)
        //BEC_detect = 0;
        if ( tmp >= static_cast<int32_t>((30316544U>>1) + 1549824U) )
        {
            BEC_detect = 1;
            return;
        }
        else
        {
            tmp -= static_cast<int32_t>(30316544U>>1);
            if( tmp >= 0 )
            {
                submodeLSB = 1;
                Gind = (Gind<<1) + (tmp&0x1);
                idxA = tmp>>1;
            }
        }
    }

    /* LTPF data */
    if (pitch_present != 0)
    {
        //ltpf_active = read_uint(bytes, &bp_side, &mask_side, 1);
        ltpf_active = read_bit(bs);
        //pitch_index = read_uint(bytes, &bp_side, &mask_side, 9);
        pitch_index = read_uint(bs, 9);
    }
    else {
        pitch_index = 0;
        ltpf_active = 0;
    }

    /* Noise Level */
    //F_NF = read_uint(bytes, &bp_side, &mask_side, 3);
    F_NF = read_uint(bs, 3);

}


void SideInformation::registerDatapoints()
{

    {
        //_cfg.addDatapoint( "nbits_lastnz", &nbits_lastnz, sizeof(nbits_lastnz) );
        //_cfg.addDatapoint( "submodeMSB", &submodeMSB, sizeof(submodeMSB) );
    }
}


