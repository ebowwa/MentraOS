#pragma once
#include <cstdint>
#include "Lc3Base.h"
#include "cfft.hh"
namespace sneak{
    class DctIV :public Lc3Base
    {
    public:
        typedef cfft::cpx_t cpx_t;
    public:
        DctIV(uint16_t N_, const Lc3Config& );
        ~DctIV();
    public:
        void run(const float* const input,float*output,float*temp,int lastnz);
    public:
        const float _gain;
    private:
        const uint16_t N;
        cfft _fft;        
    private:
        //cpx_t* _twiddle_buff = 0;
        cpx_t*& _twiddle;
    private:
        cpx_t* create_twiddle0();
        // cpx_t* create_twiddle();
    };
}

