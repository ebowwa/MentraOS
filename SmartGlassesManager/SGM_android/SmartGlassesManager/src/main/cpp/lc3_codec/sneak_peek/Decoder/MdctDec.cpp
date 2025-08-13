#include "MdctDec.hpp"
#include "MdctWindows.hpp"
#include <cmath>
using namespace sneak::dec;

MdctDec::MdctDec(const Lc3Config& cfg) :Lc3Base(cfg)
    ,_dct4(_cfg.NF,_cfg)
    ,_mem_ola(nullptr)
    ,_win(cfg._mdct_win)
{
    _mem_ola = AllocT<float>((_cfg.NF - _cfg.Z));
    for (uint16_t n=0; n<(_cfg.NF - _cfg.Z); n++) {
        _mem_ola[n] = 0;
    }
    //
    /*if (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) {
        const float* win10ms[]{w_N80,w_N160,w_N240,w_N320,0,w_N480 };
        _win = win10ms[_cfg.Fs_ind];
    }
    else if (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) {
        const float* win7p5ms[]{w_N60_7p5ms,w_N120_7p5ms,w_N180_7p5ms,w_N240_7p5ms,0,w_N360_7p5ms };
        _win = win7p5ms[_cfg.Fs_ind];
    }
    else {
        //assert(0);
    }*/
    //_win = lc3MdctWinGet(_cfg.Fs_ind, (int)_cfg.N_ms);
    _gain = 1.f;
    //
    //auto gain = 1.f / sqrt(2.0f * _cfg.NF);
    //gain *= _dct4._gain;
    //_gain = gain;
    //int wn = _cfg.NF * 2;// -_cfg.Z;
    //auto wNx = AllocT<float>(wn);
    //for (int n = 0; n < wn; n++) {
    //    wNx[n] = _win[_cfg.NF * 2 - 1 - n];// *gain;
    //}
    //_win = wNx;
}

MdctDec::~MdctDec(){
    Free(_mem_ola);
    //Free(_win);
}

void MdctDec::run(const float* const input, float* output, float* temp, int lastnz){dbgCodecCp();
    _dct4.run(input,temp,output,lastnz);
    //
    uint16_t lc3Config_NF = _cfg.NF; 
    uint16_t lc3Config_NF2 = _cfg.NF << 1; 
    uint16_t lc3Config_NF_2 = _cfg.NF >> 1;  
    uint16_t lc3Config_NF_2_1 = lc3Config_NF_2 - 1;  
    uint16_t lc3Config_NF_23 = lc3Config_NF + lc3Config_NF_2; 
    uint16_t lc3Config_Z = _cfg.Z;  
    //
    auto out1 = temp;
    auto out2 = temp + lc3Config_NF_2;
    auto win = &_win[lc3Config_NF2-1];
    auto mdct = &output[-lc3Config_Z];
    auto ola = &_mem_ola[-lc3Config_Z];
    for (int n = lc3Config_Z; n < lc3Config_NF_2; n++) {
        auto vn = out2[n];
        //mdct[n] = vn * win[n] + ola[n];
        mdct[n] = __vmla(vn, win[-n] , ola[n]);
    }
    //
    mdct += lc3Config_NF_2;
    win -= lc3Config_NF_2;
    ola += lc3Config_NF_2;
    for (int n = 0; n < lc3Config_NF_2; n++) {
        auto vn = out2[lc3Config_NF_2_1 - n];
        //mdct[n] = -vn * win[n] + ola[n];
        mdct[n] = __vmls(vn, win[-n] , ola[n]);
    }
    //
    mdct += lc3Config_NF_2;
    win -= lc3Config_NF_2;    
    for (int n = 0; n < lc3Config_Z; n++) {
        auto vn = out1[lc3Config_NF_2_1 - n];
        //mdct[n] = -vn * win[n];
        mdct[n] = __vnmul(vn , win[-n]);
    }
    ola = &_mem_ola[-lc3Config_Z];
    for (int n = lc3Config_Z; n < lc3Config_NF_2; n++) {
        auto vn = out1[lc3Config_NF_2_1 - n];
        //mdct[n] = -vn * win[n];
        //ola[n] = -vn * win[n];
        ola[n] = __vnmul(vn, win[-n]);
    }
    //
    //mdct += lc3Config_NF_2;
    ola += lc3Config_NF_2;
    win -= lc3Config_NF_2;
    for (int n = 0; n < lc3Config_NF_2; n++) {
        auto vn = out1[n];
        //mdct[n] = -vn * win[n];
        //ola[n] = -vn * win[n];
        ola[n] = __vnmul(vn, win[-n]);
    }
}


