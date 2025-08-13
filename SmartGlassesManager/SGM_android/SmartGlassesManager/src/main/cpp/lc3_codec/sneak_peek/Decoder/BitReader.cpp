/*
 * BitReader.cpp
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

#include "BitReader.hpp"
#include "smf_arm_dsp.h"

namespace sneak{ namespace dec
{
#if 0
static uint8_t read_bit(const uint8_t bytes[], uint16_t* bp, uint8_t* mask)
{
    uint8_t bit;
    if (bytes[*bp] & *mask)
    {
        bit = 1;
    }
    else
    {
        bit = 0;
    }
    if (*mask == 0x80)
    {
        *mask = 1;
        *bp -= 1;
    }
    else
    {
        *mask <<= 1;
    }
    return bit;
}

static uint16_t read_uint(const uint8_t bytes[], uint16_t* bp, uint8_t* mask, uint8_t numbits)
{
    uint16_t value = read_bit(bytes, bp, mask);
    for (uint8_t i = 1; i < numbits; i++)
    {
        uint16_t bit = read_bit(bytes, bp, mask);
        value += bit << i;
    }
    return value;
}
#endif
void read_bits_init(Lc3BitsReader&bs, uint8_t* bytes, int nbytes) {
    bs.bytes0 = (uint8_t*)&bytes[0];
    bs.bytes = (uint8_t*)&bytes[nbytes - 1];
    bs.cache = 0;
    bs.bits = 0;    
    //aligned read
    unsigned addr = (unsigned)bs.bytes;
    auto a = (uint32_t*)(addr & ~3);
    auto b = (addr & 3)+1;
    bs.bits = (b * 8);
    auto cache = __rev32(*a);
    bs.cache = cache >> (32 - b * 8);
    bs.bytes -= b;
}
uint8_t read_bit(Lc3BitsReader& bs) {//dbgCodecCp();
#if 1
    if (!bs.bits) {
        bs.cache = __rev32(*(uint32_t*)&bs.bytes[-3]); //((uint32_t)bs.bytes[0]) | ((uint32_t)bs.bytes[-1] << 8) | ((uint32_t)bs.bytes[-2] << 16) | ((uint32_t)bs.bytes[-3] << 24);
        bs.bits = 32;
        bs.bytes -= 4;
    }
    uint8_t val = bs.cache & 1;
    bs.cache >>= 1;
    bs.bits--;
    
#else
    auto va10 = read_bit(bs.bytes0, &bs.bp, &bs.mask);
    if (val != va10)
        int a = 10;
    val= va10;
#endif
    return val;
}
uint32_t read_uint(Lc3BitsReader& bs, int bits) {//dbgCodecCp();
#if 1
    uint32_t val = bs.cache;
    if (bs.bits < bits) {
        auto cache = __rev32(*(uint32_t*)&bs.bytes[-3]); //((uint32_t)bs.bytes[0]) | ((uint32_t)bs.bytes[-1] << 8) | ((uint32_t)bs.bytes[-2] << 16) | ((uint32_t)bs.bytes[-3] << 24);
        bs.bytes -= 4;
        val |= cache << bs.bits;
        val &= ((1u << bits) - 1);
        bs.cache = cache >> (bits- bs.bits);
        bs.bits += 32 - bits;
    }
    else {
        val &= ((1u << bits) - 1);
        bs.cache >>= bits;
        bs.bits -= bits;
    }
#else
    auto va10 = read_uint(bs.bytes0, &bs.bp, &bs.mask, bits);
    if (val != va10)
        int a = 10;
    val= va10;
#endif
    return val;
}
void read_bit_sync(Lc3BitsReader& bs, uint8_t& mask, uint16_t& bp) {
    bp = bs.bytes - bs.bytes0;
    auto bits = (bs.bits+7) >> 3;
    bp += bits;
    mask = 1u << (8-(bs.bits & 0x7));
    if (!mask)mask = 1;
#if 0
    if (bp != bs.bp)
        int a = 23;
    if (mask != bs.mask)
        int a = 23;
#endif
}

}}