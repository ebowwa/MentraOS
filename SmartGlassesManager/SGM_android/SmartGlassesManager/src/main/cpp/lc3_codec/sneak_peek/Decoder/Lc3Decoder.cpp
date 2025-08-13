/*
 * Lc3Decoder.cpp
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

#include "Lc3Decoder.hpp"
#include "DecoderFrame.hpp"
#include "lc3_process.h"
#include "lc3_debug.h"
#include <cstring>

using namespace sneak;
using namespace sneak::dec;

bool Lc3Decoder::Initialize(const Lc3Config& cfg, uint8_t bits_depth, uint8_t bits_align, uint16_t byte_count_max_dec_)
{
    if (bits_align == 0)bits_align = bits_depth;
    _cfg = &cfg;    
    _bits_depth = bits_depth;
    _bits_align = bits_align;
    byte_count_max_dec = (byte_count_max_dec_ < 400) ? byte_count_max_dec_ : 400 ;
    memset(decoderList, 0, sizeof(decoderList));
    // proceed only with valid configuration
    if ( cfg.isValid() ){        
        for (uint8_t channelNr = 0; channelNr < cfg.Nc; channelNr++){
            auto buff = cfg.Alloc((sizeof(DecoderFrame) + 15) >> 3 << 3);
            if (!buff) {
                Uninitialize();
                return false;
            }
            auto dec = new(buff) DecoderFrame(cfg);
            decoderList[channelNr] = dec;
            dec->registerDatapoints();
        }       
    }
    return true;
}
void Lc3Decoder::Uninitialize() {
    for(auto& dec: decoderList){
        if (dec){
            dec->~DecoderFrame();
            _cfg->Free((void*&)dec);
            //delete enc;
            //enc = 0;
        }
    }
}
Lc3Decoder::~Lc3Decoder()
{
    if (_cfg) {
        for (uint8_t channelNr = 0; channelNr < _cfg->Nc; channelNr++)
        {
            auto decoderTop = decoderList[channelNr];
            if (nullptr != decoderTop)
            {
                delete decoderTop;
            }
        }
        if (_outbuff) {
            _cfg->Free(_outbuff);
        }
    }
}
#if 0
uint8_t Lc3Decoder::run(const uint8_t *bytes, uint16_t byte_count, uint8_t BFI,
        int16_t* x_out, uint16_t x_out_size, uint8_t& BEC_detect, uint8_t channelNr)
{
    dbgCodecCp();
    if (!_cfg || !_cfg->isValid())
    {
        return INVALID_CONFIGURATION;
    }
    if ( (byte_count < 20) || (byte_count > byte_count_max_dec) )
    {
        return INVALID_BYTE_COUNT;
    }
    if ( _cfg->NF != x_out_size )
    {
        return INVALID_X_OUT_SIZE;
    }
    if ( _bits_depth != 16 )
    {
        return INVALID_BITS_PER_AUDIO_SAMPLE;
    }
    if (nullptr==decoderList[channelNr])
    {
        return DECODER_ALLOCATION_ERROR;
    }

    decoderList[channelNr]->run(
            bytes, byte_count,
            BFI,
            _bits_depth, 0,
            x_out,
            BEC_detect);
    return ERROR_FREE;
}
#endif
uint8_t Lc3Decoder::run(const uint8_t *bytes, uint16_t byte_count, uint8_t BFI,
    void *x_out, uint16_t x_out_size, uint8_t &BEC_detect, uint8_t channelNr)
{
    dbgCodecCp();
    if (!_cfg || !_cfg->isValid()){
        return INVALID_CONFIGURATION;
    }
    if (!BFI) {
        if (!bytes) {
            return INVALID_BYTE_COUNT;
        }
        if ((byte_count < 20) || (byte_count > byte_count_max_dec)) {
            return INVALID_BYTE_COUNT;
        }
    }
    if (_cfg->NF != x_out_size){
        return INVALID_X_OUT_SIZE;
    }
    if (!_bits_align) {
        _bits_align = _bits_depth;
    }
    if (_bits_depth != 16 && _bits_depth != 24 && _bits_depth != 32){
        return INVALID_BITS_PER_AUDIO_SAMPLE;
    }
    if (_bits_align != 16 && _bits_align != 24 && _bits_align != 32 && _bits_align !=0){
        return INVALID_BITS_PER_AUDIO_SAMPLE;
    }
    if (nullptr == decoderList[channelNr]){
        return DECODER_ALLOCATION_ERROR;
    }

    decoderList[channelNr]->run(
        bytes, byte_count,
        BFI,
        _bits_depth, _bits_align
        , x_out,
        BEC_detect);
    return ERROR_FREE;
}
#if 0
uint8_t Lc3Decoder::run(const uint8_t *bytes, uint16_t byte_count, uint8_t BFI,
        int32_t* x_out, uint16_t x_out_size, uint8_t& BEC_detect, uint8_t channelNr)
{
    dbgCodecCp();
    if (!_cfg || !_cfg->isValid())
    {
        return INVALID_CONFIGURATION;
    }
    if ( (byte_count < 20) || (byte_count > byte_count_max_dec) )
    {
        return INVALID_BYTE_COUNT;
    }
    if ( _cfg->NF != x_out_size )
    {
        return INVALID_X_OUT_SIZE;
    }
    if ( ( _bits_depth != 16 ) && ( _bits_depth != 24 ) && ( _bits_depth != 32 ) )
    {
        return INVALID_BITS_PER_AUDIO_SAMPLE;
    }
    if (nullptr==decoderList[channelNr])
    {
        return DECODER_ALLOCATION_ERROR;
    }

    decoderList[channelNr]->run(
            bytes, byte_count,
            BFI,
            _bits_depth, x_out,
            BEC_detect);
    return ERROR_FREE;
}
#endif
#if 0
uint8_t Lc3Decoder::run(const uint8_t* bytes, const uint16_t* byte_count_per_channel, const uint8_t* BFI_per_channel,
        int16_t* x_out, uint32_t x_out_size, uint8_t* BEC_detect_per_channel)
{
    if (!_cfg || !_cfg->isValid())
    {
        return INVALID_CONFIGURATION;
    }
    if ( _cfg->NF * _cfg->Nc != x_out_size )
    {
        return INVALID_X_OUT_SIZE;
    }

    uint8_t returnCode = ERROR_FREE;
    uint32_t byteOffset = 0;
    for (uint8_t channelNr=0; channelNr < _cfg->Nc; channelNr++)
    {
        // Note: bitwise or of the single channel return code will not allow uniquely to decode
        //       the given error. The idea is to catch any error. This decision makes the API
        //       more simple. However, when the precise error code is needed, the single channel call
        //       has to be made separately.
        returnCode |= run(&bytes[byteOffset], byte_count_per_channel[channelNr], BFI_per_channel[channelNr],
                          &x_out[channelNr*_cfg->NF], _cfg->NF, BEC_detect_per_channel[channelNr], channelNr);
        byteOffset += byte_count_per_channel[channelNr];
    }
    return returnCode;
}
#endif
#if 0
uint8_t Lc3Decoder::run(const uint8_t* bytes, const uint16_t* byte_count_per_channel, const uint8_t* BFI_per_channel,
        int32_t* x_out, uint32_t x_out_size, uint8_t* BEC_detect_per_channel)
{
    if (!_cfg || !_cfg->isValid())
    {
        return INVALID_CONFIGURATION;
    }
    if ( _cfg->NF * _cfg->Nc != x_out_size )
    {
        return INVALID_X_OUT_SIZE;
    }

    uint8_t returnCode = ERROR_FREE;
    uint32_t byteOffset = 0;
    for (uint8_t channelNr=0; channelNr < _cfg->Nc; channelNr++)
    {
        // Note: bitwise or of the single channel return code will not allow uniquely to decode
        //       the given error. The idea is to catch any error. This decision makes the API
        //       more simple. However, when the precise error code is needed, the single channel call
        //       has to be made separately.
        returnCode |= run(&bytes[byteOffset], byte_count_per_channel[channelNr], BFI_per_channel[channelNr],
                          &x_out[channelNr*_cfg->NF], _cfg->NF, BEC_detect_per_channel[channelNr], channelNr);
        byteOffset += byte_count_per_channel[channelNr];
    }
    return returnCode;
}
#endif
#if 0
uint8_t Lc3Decoder::run(const uint8_t* bytes, uint16_t nbytes, uint8_t BFIs, int16_t** x_out, uint8_t& BECs_detect)
{
    if (!_cfg || !_cfg->isValid())
    {
        return INVALID_CONFIGURATION;
    }
    /*if (_cfg->NF * _cfg->Nc != x_out_size)
    {
        return INVALID_X_OUT_SIZE;
    }*/
    auto byte_count_per_channel = nbytes / _cfg->Nc;

    uint8_t returnCode = ERROR_FREE;
    BECs_detect = 0;
    for (uint8_t channelNr = 0; channelNr < _cfg->Nc; channelNr++) {
        auto BFI = BFIs & 1; BFIs >>= 1;
        uint8_t BEC = 0;
        returnCode |= run(bytes, byte_count_per_channel, BFI,
            x_out[channelNr], _cfg->NF, BEC, channelNr);
        bytes += byte_count_per_channel;
        BECs_detect = (BECs_detect << 1) | BEC;
    }
    return returnCode;
}
#endif
uint8_t Lc3Decoder::run(const uint8_t *bytes, uint16_t nbytes, uint8_t BFIs, void **x_out, uint8_t &BECs_detect)
{    
    if (!_cfg || !_cfg->isValid()){
        return INVALID_CONFIGURATION;
    }
    _cfg->SetInterlace(false);
    //auto byte_count_per_channel = nbytes / _cfg->Nc;
    int byte_count_per_channel[2] = {0};
    if (nbytes % _cfg->Nc) {
        byte_count_per_channel[0] = nbytes / _cfg->Nc + 1;
        byte_count_per_channel[1] = nbytes / _cfg->Nc;
    }
    else {
        byte_count_per_channel[0] = nbytes / _cfg->Nc;
        byte_count_per_channel[1] = nbytes / _cfg->Nc;
    }

    uint8_t returnCode = ERROR_FREE;
    BECs_detect = 0;
    for (uint8_t ch = 0; ch < _cfg->Nc; ch++) {
        auto BFI = BFIs & 1; BFIs >>= 1;
        uint8_t BEC = 0;
        returnCode |= run(bytes, byte_count_per_channel[ch], BFI,
            x_out[ch], _cfg->NF, BEC, ch);
        bytes += byte_count_per_channel[ch];
        BECs_detect = (BECs_detect << 1) | BEC;
    }
    return returnCode;
}

uint8_t Lc3Decoder::run_interlaced(const uint8_t *bytes, uint16_t nbytes, uint8_t BFIs, void *x_out, uint8_t &BECs_detect)
{
    if (!_cfg || !_cfg->isValid()) {
        return INVALID_CONFIGURATION;
    }
    _cfg->SetInterlace(true);
    //auto byte_count_per_channel = nbytes / _cfg->Nc;
    int byte_count_per_channel[2] = {0};
    if (nbytes % _cfg->Nc) {
        byte_count_per_channel[0] = nbytes / _cfg->Nc + 1;
        byte_count_per_channel[1] = nbytes / _cfg->Nc;
    }else{
        byte_count_per_channel[0] = nbytes / _cfg->Nc;
        byte_count_per_channel[1] = nbytes / _cfg->Nc;
    }
    auto align = _bits_align;
    if (!align)align = _bits_depth;
    align = (align + 7) >> 3;
    uint8_t returnCode = ERROR_FREE;
    BECs_detect = 0;
    uint8_t* output = (uint8_t *) x_out;
    for (uint8_t ch = 0; ch < _cfg->Nc; ch++) {
        auto BFI = BFIs & 1; BFIs >>= 1;
        uint8_t BEC = 0;
        returnCode |= run(bytes, byte_count_per_channel[ch], BFI,
            output, _cfg->NF, BEC, ch);
        bytes += byte_count_per_channel[ch];
        output += align;
        BECs_detect = (BECs_detect << 1) | BEC;       
    }
    return returnCode;
}

