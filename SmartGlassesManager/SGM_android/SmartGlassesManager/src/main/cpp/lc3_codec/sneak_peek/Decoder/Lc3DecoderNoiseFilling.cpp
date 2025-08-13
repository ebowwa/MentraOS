#include "Lc3DecoderNoiseFilling.h"
#include <cmath>
#include <cstring>

using namespace sneak::dec;

Lc3DecoderNoiseFilling::Lc3DecoderNoiseFilling(const Lc3Config& cfg)
    :Lc3Base(cfg)

{

}

Lc3DecoderNoiseFilling::~Lc3DecoderNoiseFilling() {

}

void Lc3DecoderNoiseFilling::run(int32_t* spec
    , int32_t* tmp
    , int16_t F_NF
    , int16_t P_BW
    , int16_t nf_seed
    , bool zeroFrame
    , int16_t &lastnz
){
    dbgCodecCp();
    //3.4.4 Noise filling (d09r02_F2F)
    // including extensions according to:
    // section 3.4.4. Noise filling (d09r04)
    //Noise filling is performed only when zeroFrame is 0.
    if (zeroFrame)return;
    
    //bandwidth(𝑃𝑏𝑤)
    //       NB   WB  SSWB   SWB   FB
    //𝑏𝑤_𝑠𝑡𝑜𝑝 80  160  240    320  400
    uint16_t bw_stop_table[5] = { 80,  160,  240,    320,  400 };
    uint16_t bw_stop = bw_stop_table[P_BW];
    memcpy(tmp, spec, _cfg.NE * sizeof(float));
    if (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms)
    {
        //bw_stop *= 3;
        //bw_stop /= 4;
        bw_stop += bw_stop << 1;
        bw_stop >>= 2;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
        bw_stop >>= 1;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d2p5ms){
        bw_stop >>= 2;
    }

    //uint16_t NFstart = (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 24 : 18;
    //uint16_t NFwidth = (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) ? 3 : 2;
    uint16_t NFstart, NFwidth;
    if (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) {
        NFstart = 24;
        NFwidth = 3;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms){
        NFstart = 18;
        NFwidth = 2;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
        NFstart = 12;
        NFwidth = 1;
    }else{
        NFstart = 6;
        NFwidth = 1;
    }

    /*
    𝐿𝑁𝐹 ̂ = (8-𝐹𝑁𝐹)/16;
    for k=0..bw_stop-1
        if 𝐼𝑁𝐹(k)==1
            nf_seed = (13849+nf_seed*31821) & 0xFFFF;
        if nf_seed<0x8000
            𝑋𝑞 ̂(𝑘) = 𝐿𝑁𝐹 ̂ ;
        else
            𝑋𝑞 ̂(𝑘) = −𝐿𝑁𝐹 ̂ ;
    */
#if 1
    uint16_t nf_state = nf_seed;
    //float L_NF_hat = (8-F_NF) / 16.0f;
    int16_t L_NF_hat = (8 - F_NF);// / 16.0f;
    auto last_noise = 0;
    int m = NFstart - NFwidth;
    int cnt = 0;
    auto NFwidth2 = NFwidth << 1;
    for (; m < bw_stop; m++) {
        if (spec[m]) {
            cnt = 0;
        }
        else if (++cnt > NFwidth2) {
            int k = m - NFwidth;
            nf_state = (13849 + nf_state * 31821) & 0xFFFF;
            if (nf_state < 0x8000)
            {
                //X_hat_q_nf[k] = L_NF_hat;   //先浮点再整形
                spec[k] = L_NF_hat;   //先浮点再整形
            }
            else
            {
                //X_hat_q_nf[k] = -L_NF_hat;
                spec[k] = -L_NF_hat;
            }
            last_noise = k;
        }
    }
    for (; m < bw_stop+ NFwidth; m++) {
        //int k = m - NFwidth;
        if (++cnt > NFwidth2) {
            int k = m - NFwidth;
            nf_state = (13849 + nf_state * 31821) & 0xFFFF;
            if (nf_state < 0x8000)
            {
                //X_hat_q_nf[k] = L_NF_hat;   //先浮点再整形
                spec[k] = L_NF_hat;   //先浮点再整形
            }
            else
            {
                //X_hat_q_nf[k] = -L_NF_hat;
                spec[k] = -L_NF_hat;
            }
            last_noise = k;
        }
    }
    lastnz = last_noise + 1 > lastnz ? last_noise + 1 : lastnz;
#else
    uint16_t nf_state = nf_seed;
    //float L_NF_hat = (8-F_NF) / 16.0f;
    int16_t L_NF_hat = (8 - F_NF);// / 16.0f;
    auto last_noise = 0;
    for (uint16_t k = 0; k < bw_stop; k++)
    {
        /*
        The indices for the relevant spectral coefficients are given by:
        𝐼𝑁𝐹 (𝑘) = {
            1 if 24 ≤ 𝑘 < 𝑏𝑤_𝑠𝑡𝑜𝑝 𝑎𝑛𝑑 𝑋𝑞 ̂(𝑖) == 0 𝑓𝑜𝑟 𝑎𝑙𝑙 𝑖 = 𝑘 − 3. . min(𝑏𝑤𝑠𝑡𝑜𝑝 − 1, 𝑘 + 3)
            0 otherwise
        # (109)
        where 𝑏𝑤_𝑠𝑡𝑜𝑝 depends on the bandwidth information (see Section 3.4.2.4) as defined in Table 3.17.
        */
        bool I_NF_k = false;
        if ((NFstart <= k) && (k < bw_stop))
        {
            uint16_t limit = ((bw_stop - 1) < (k + NFwidth)) ? (bw_stop - 1) : (k + NFwidth);
            I_NF_k = true;
            for (uint16_t i = k - NFwidth; i <= limit; i++)
            {
                //if (0 != residualSpectrum.X_hat_q_residual[i])
                if (tmp[i])
                {
                    I_NF_k = false;
                    break;
                }
            }
        }

        if (I_NF_k)
        {
            nf_state = (13849 + nf_state * 31821) & 0xFFFF;
            if (nf_state < 0x8000)
            {
                //X_hat_q_nf[k] = L_NF_hat;   //先浮点再整形
                spec[k] = L_NF_hat;   //先浮点再整形
            }
            else
            {
                //X_hat_q_nf[k] = -L_NF_hat;
                spec[k] = -L_NF_hat;
            }
            last_noise = k;
        }
    }
    lastnz = last_noise + 1 > lastnz ? last_noise + 1 : lastnz;
#endif
}
