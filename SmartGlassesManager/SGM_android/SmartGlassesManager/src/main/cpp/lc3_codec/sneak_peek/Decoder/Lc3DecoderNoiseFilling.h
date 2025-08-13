#include <cstdint>

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{ namespace dec {

    class Lc3DecoderNoiseFilling :public Lc3Base
    {
    public:
        Lc3DecoderNoiseFilling(const Lc3Config& cfg);

        ~Lc3DecoderNoiseFilling();
    public:
        void run(int32_t* spec
            , int32_t* tmp
            , int16_t F_NF  
            , int16_t P_BW
            , int16_t nf_seed            
            , bool zeroFrame
            , int16_t &lastnz
        );
    protected:
        //const Lc3Config& _cfg;
    };
}}