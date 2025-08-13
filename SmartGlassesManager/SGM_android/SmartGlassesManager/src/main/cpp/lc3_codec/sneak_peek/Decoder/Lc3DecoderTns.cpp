
#include "Lc3DecoderTns.h"
#include "SnsQuantizationTables.hpp"
#include "BandIndexTables.hpp"
#include "MPVQ.hpp"
#include <cmath>
#include <memory.h>

using namespace sneak::dec;
extern const float _rc_sin_tbl[];
extern const int32_t _rc_sin_tbl32[];

Lc3DecoderTns::Lc3DecoderTns(const Lc3Config& cfg)
    :Lc3Base(cfg)

{

}

Lc3DecoderTns::~Lc3DecoderTns() {

}

void Lc3DecoderTns::run(float* spec
    , int16_t rc_order_ari[2]
    , int16_t num_tns_filters
    , uint8_t rc_i[2 * 8]
    , int16_t P_BW
    , int16_t &lastnz
)
{
    dbgCodecCp();
    if (!rc_order_ari[0] & !rc_order_ari[1]) {
        return;
    }
    // 3.4.6 TNS DecoderFrame (d09r02_F2F)
    /*
    for 𝑘 = 0 to 𝑁𝐸 − 1 do {
        𝑋𝑠 ̂(𝑛) = 𝑋𝑓 ̂(𝑛)
    }
    s0 = s1 = s2 = s3 = s4 = s5 = s6 = s7 = 0
    for 𝑓 = 0 to num_tns_filters-1 do {
        if (𝑟𝑐𝑜𝑟𝑑𝑒𝑟 (𝑓) > 0)
        {
            for 𝑛 = start_freq(𝑓) to stop_freq(f) − 1 do {
                t = 𝑋𝑓 ̂ (𝑛) − 𝑟𝑐𝑞 (𝑟𝑐𝑜𝑟𝑑𝑒𝑟 (𝑓) − 1 , 𝑓) ∙ 𝑠𝑟𝑐𝑜𝑟𝑑𝑒𝑟(𝑓)−1
                for 𝑘 = 𝑟𝑐𝑜𝑟𝑑𝑒𝑟 (𝑓) − 2 to 0 do {
                    𝑡 = 𝑡 − 𝑟𝑐𝑞 (𝑘, 𝑓) ∙ 𝑠𝑘
                    𝑠𝑘+1 = 𝑟𝑐𝑞 (𝑘, 𝑓) ∙ 𝑡 + 𝑠𝑘
                }
                𝑋𝑆 ̂(𝑛) = 𝑡
                𝑠0 = 𝑡
            }
        }
    }
    */
    uint16_t start_freq[2] = { 12, 160 };
    uint16_t stop_freq[2];
    if (_cfg.N_ms == Lc3Config::FrameDuration::d10ms)
    {
        if (4 == P_BW) start_freq[1] = 200;
        switch (P_BW)
        {
        case 0:
            stop_freq[0] = 80;
            break;
        case 1:
            stop_freq[0] = 160;
            break;
        case 2:
            stop_freq[0] = 240;
            break;
        case 3:
            stop_freq[0] = 160;
            stop_freq[1] = 320;
            break;
        case 4:
            stop_freq[0] = 200;
            stop_freq[1] = 400;
            break;
        }
    }
    else if(_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms)
    {
        start_freq[0] = 9;
        if (3 == P_BW) start_freq[1] = 120;  // Errata 15098 implemented
        if (4 == P_BW) start_freq[1] = 150;
        switch (P_BW)
        {
        case 0:
            stop_freq[0] = 60;
            break;
        case 1:
            stop_freq[0] = 120;
            break;
        case 2:
            stop_freq[0] = 180;
            break;
        case 3:
            //stop_freq[0] = 119; // this value is specified in Table 3.19 (d09r06_KLG_AY_NH_FhG, 2019-12-20), but gives poor match to 32kHz decoder tests compared to reference decoder
            stop_freq[0] = 120; // this value gives good match to reference decoder and is more consistent to 10ms case
            stop_freq[1] = 240;
            break;
        case 4:
            stop_freq[0] = 150;
            stop_freq[1] = 300;
            break;
        }
    } else if(_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
        start_freq[0] = 6;
        if (3 == P_BW) start_freq[1] = 80;  // Errata 15098 implemented
        if (4 == P_BW) start_freq[1] = 100;
        switch (P_BW)
        {
        case 0:
            stop_freq[0] = 40;
            break;
        case 1:
            stop_freq[0] = 80;
            break;
        case 2:
            stop_freq[0] = 120;
            break;
        case 3:
            //stop_freq[0] = 119; // this value is specified in Table 3.19 (d09r06_KLG_AY_NH_FhG, 2019-12-20), but gives poor match to 32kHz decoder tests compared to reference decoder
            stop_freq[0] = 80; // this value gives good match to reference decoder and is more consistent to 10ms case
            stop_freq[1] = 160;
            break;
        case 4:
            stop_freq[0] = 100;
            stop_freq[1] = 200;
            break;
        }
    }
    else if (_cfg.N_ms == Lc3Config::FrameDuration::d2p5ms) {
        start_freq[0] = 3;
        switch (P_BW)
        {
        case 0:
            stop_freq[0] = 20;
            break;
        case 1:
            stop_freq[0] = 40;
            break;
        case 2:
            stop_freq[0] = 60;
            break;
        case 3:
            stop_freq[0] = 80; // this value gives good match to reference decoder and is more consistent to 10ms case
            break;
        case 4:
            stop_freq[0] = 100;
            break;
        }
    }
    //
    float s[8];
    memset(s, 0, sizeof(s));
    for (uint8_t f = 0; f < num_tns_filters; f++) {
        auto order = rc_order_ari[f];
        if (order) {
            auto f8 = f << 3;
            auto rc_q_i8 = &rc_i[f << 3];
            float rcsintbl[8];
            for (int i = 0; i < 8; i++) {
                rcsintbl[i] = _rc_sin_tbl[rc_q_i8[i]];
            }
            auto idx = order - 1;
            auto fi = rcsintbl[idx];
            //auto fi = sin((i - 8) * PI / 17);
            for (uint16_t n = start_freq[f]; n < stop_freq[f]; n++) {
                //float t = X_hat_f[n] - arithmeticDec.rc_q( arithmeticDec.rc_order_ari[f]-1, f) * s[arithmeticDec.rc_order_ari[f]-1];
                auto t = __vmls(fi, s[idx], spec[n]);
                //auto t = __smmls(fi, s[idx]<<1, spec[n]);
                for (int8_t k = order - 2; k >= 0; k--) {
                    //t = t - arithmeticDec.rc_q( k, f) * s[k];
                    //s[k+1] = arithmeticDec.rc_q( k, f)*t + s[k];
                    auto rc = rcsintbl[k];
                    __vmls_(rc, s[k], t);
                    s[k + 1] = __vmla(rc, t, s[k]);
                    //t = __smmls(rc, s[k] << 1, t);
                    //s[k + 1] = __smmlar(rc, t<<1, s[k]);
                }
                spec[n] = t;
                s[0] = t;
            }
            lastnz = stop_freq[f] > lastnz ? stop_freq[f] : lastnz;
        }
    }
}

extern const float _rc_sin_tbl[]{
    -0.995734f,//0
    -0.961826f,//1
    -0.895163f,//2
    -0.798017f,//3
    -0.673696f,//4
    -0.526432f,//5
    -0.361242f,//6
    -0.183749f,//7
    0.000000f,//8
    0.183749f,//9
    0.361242f,//10
    0.526432f,//11
    0.673696f,//12
    0.798017f,//13
    0.895163f,//14
    0.961826f,//15
    0.995734f,//16
    0.995734f,//17
    0.961826f,//18
    0.895163f,//19
    0.798017f,//20
    0.673696f,//21
    0.526432f,//22
    0.361242f,//23
    0.183750f,//24
    0.000000f,//25
    -0.183749f,//26
    -0.361241f,//27
    -0.526432f,//28
    -0.673696f,//29
    -0.798017f,//30
    -0.895163f,//31
    -0.961826f,//32
    -0.995734f,//33
};
#if 0
extern const int32_t _rc_sin_tbl32[]{
    0x808bc880,//0
    0x84e2e580,//1
    0x8d6b4a00,//2
    0x99da9280,//3
    0xa9c45780,//4
    0xbc9ddf00,//5
    0xd1c2d580,//6
    0xe87ae580,//7
    0x00000000,//8
    0x17851a80,//9
    0x2e3d2a80,//10
    0x43622100,//11
    0x563ba880,//12
    0x66256d80,//13
    0x7294b600,//14
    0x7b1d1a80,//15
    0x7f743780,//16
    0x7f743800,//17
    0x7b1d1a80,//18
    0x7294b600,//19
    0x66256d80,//20
    0x563ba900,//21
    0x43622100,//22
    0x2e3d2bc0,//23
    0x17851cc0,//24
    0x00000144,//25
    0xe87ae7a0,//26
    0xd1c2d6c0,//27
    0xbc9de100,//28
    0xa9c45880,//29
    0x99da9300,//30
    0x8d6b4a00,//31
    0x84e2e580,//32
    0x808bc880,//33
};
#endif