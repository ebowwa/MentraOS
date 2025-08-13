#include <cstdint>

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak{ namespace dec{

    class Lc3DecoderTns :public Lc3Base
    {
    public:
        Lc3DecoderTns(const Lc3Config& cfg);

        ~Lc3DecoderTns();
    public:
        void run(float* spec
            ,int16_t rc_order_ari[2]
            ,int16_t num_tns_filters
            ,uint8_t rc_i[2 * 8]
            ,int16_t P_BW
            ,int16_t &lastnz
        );
    protected:
        //const Lc3Config& _cfg;
    };
}}