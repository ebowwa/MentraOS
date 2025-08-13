#pragma once

#include <cstdint>
#include "DctIV.hpp"

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{ namespace dec
{

class MdctDec :public Lc3Base
{
public:
    MdctDec(const Lc3Config& cfg);
    ~MdctDec();
public:
    void run(const float* const input,float* output,float* temp, int lastnz);
public:
    float _gain;
private:
    DctIV _dct4;
    float* _mem_ola;
    const float* _win;
};

}}


