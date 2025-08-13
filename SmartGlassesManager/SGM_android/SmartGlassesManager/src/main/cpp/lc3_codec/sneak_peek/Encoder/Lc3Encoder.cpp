/*
 * Lc3Encoder.cpp
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

#include "Lc3Encoder.hpp"
#include "EncoderFrame.hpp"
#include "lc3_debug.h"
#include "hal_trace.h"
#include <cstring>

using namespace sneak::enc;
using namespace sneak;


bool Lc3Encoder::Initialize(const Lc3Config& cfg, uint8_t bits_width, uint8_t bits_align)
{
    if (!bits_align)bits_align = bits_width;
    _cfg = &cfg;
	//TRACE(1,"Initialize:_cfg=0x%x",(uint32_t)_cfg);
    _bits_width = bits_width;
    _bits_align = bits_align;
    if (!bits_align)_bits_align = _bits_width;
    // proceed only with valid configuration
    memset(encoderList, 0, sizeof(encoderList));
    if ( cfg.isValid() && (16==_bits_width || _bits_width == 24 || _bits_width == 32) ) {
        for (uint8_t channelNr = 0; channelNr < cfg.Nc; channelNr++)  {
            auto buff = cfg.Alloc((sizeof(EncoderFrame) + 15) >> 3 << 3);
            if (!buff) {
                Uninitialize();
                return false;
            }
            auto enc = new(buff) EncoderFrame(cfg);
            encoderList[channelNr] = enc;
            enc->registerDatapoints();            
        }        
    }
    else {
        return false;
    }
    return true;
}
void Lc3Encoder::Uninitialize() {
	 TRACE(1,"Lc3Encoder::Uninitialize");
     for(auto& enc: encoderList){
        if (enc) {
            enc->~EncoderFrame();
            _cfg->Free((void*&)enc);
            //delete enc;
            //enc = 0;
        }
    }
}
Lc3Encoder::~Lc3Encoder()
{
    Uninitialize();
}

uint8_t Lc3Encoder::run(const float* x_s, uint16_t byte_count, void* bytes, uint8_t channelNr)
{dbgCodecCp();
    if (!_cfg || !_cfg->isValid())
    {
        return INVALID_CONFIGURATION;
    }
    if ( (byte_count < 20) || (byte_count>400) )
    {
        return INVALID_BYTE_COUNT;
    }
    if ( _bits_width != 16 && _bits_width != 24 && _bits_width != 32)
    {
        return INVALID_BITS_PER_AUDIO_SAMPLE;
    }
    if (nullptr==encoderList[channelNr])
    {
        return ENCODER_ALLOCATION_ERROR;
    }

    encoderList[channelNr]->run(x_s, (uint8_t*)bytes, byte_count);
    return ERROR_FREE;
}
#if 0
uint8_t Lc3Encoder::run(const int16_t* x_s, const uint16_t* byte_count_per_channel, uint8_t* bytes)
{
    if (!_cfg || !_cfg->isValid())
    {
        return INVALID_CONFIGURATION;
    }

    uint8_t returnCode = ERROR_FREE;
    uint32_t byteOffset = 0;
    for (uint8_t channelNr=0; channelNr < _cfg->Nc; channelNr++)
    {
        // Note: bitwise or of the single channel return code will not allow uniquely to decode
        //       the given error. The idea is to catch any error. This decision makes the API
        //       more simple. However, when the precise error code is needed, the single channel call
        //       has to be made separately.
        returnCode |= run(&x_s[channelNr*_cfg->NF], byte_count_per_channel[channelNr], &bytes[byteOffset], channelNr);
        byteOffset += byte_count_per_channel[channelNr];
    }
    return returnCode;
}
#endif
void Lc3Encoder::SetBitRate(int bitrate) {
    //_bytePerChannel[] = _cfg->getByteCountFromBitrate(bitrate/_cfg->Nc);
    if (bitrate % _cfg->Nc) {
        _bytePerChannel[0] = _cfg->getByteCountFromBitrate(bitrate / _cfg->Nc) + 1;
        _bytePerChannel[1] = _cfg->getByteCountFromBitrate(bitrate / _cfg->Nc);
    }else{
        _bytePerChannel[0] = _bytePerChannel[1] = _cfg->getByteCountFromBitrate(bitrate / _cfg->Nc);
    }
}
void Lc3Encoder::SetBytesPerChannel(int nbytes) {
    //_bytePerChannel = nbytes;
    if (nbytes % _cfg->Nc) {
        _bytePerChannel[0] = nbytes / _cfg->Nc + 1;
        _bytePerChannel[1] = nbytes / _cfg->Nc;
    }else{
        _bytePerChannel[0] = _bytePerChannel[1] = nbytes / _cfg->Nc;
    }
}
int Lc3Encoder::GetBytesPerChannel()const {
    return _bytePerChannel[1]; 
}
uint32_t Lc3Encoder::GetCfg()const {
    return (uint32_t)_cfg; 
}

uint8_t Lc3Encoder::run(const void **pcms, void *vlc, int vlcSize) {
    if (!_cfg || !_cfg->isValid()){
        return INVALID_CONFIGURATION;
    }
    //
    //int size_per_channels = vlcSize / _cfg->Nc;
    //if (!size_per_channels)
    //    size_per_channels = _bytePerChannel;
    //if (!size_per_channels) {
    //    return INVALID_BYTE_COUNT;
    //}
    //_bytePerChannel = size_per_channels;
    int size_per_channels[2] = { 0 };
    if (vlcSize % _cfg->Nc) {
        size_per_channels[0] = vlcSize / _cfg->Nc + 1;
        size_per_channels[1] = vlcSize / _cfg->Nc;
    }else{
        size_per_channels[0] = vlcSize / _cfg->Nc;
        size_per_channels[1] = vlcSize / _cfg->Nc;
    }
    if (!size_per_channels[0] || !size_per_channels[1]) {
        size_per_channels[0] = _bytePerChannel[0];
        size_per_channels[1] = _bytePerChannel[1];
    }

    if (!size_per_channels[0] || !size_per_channels[1]) {
        return INVALID_BYTE_COUNT;
    }

    _bytePerChannel[0] = size_per_channels[0];
    _bytePerChannel[1] = size_per_channels[1];

    //
    uint8_t returnCode = ERROR_FREE;
    uint32_t byteOffset = 0;
    auto bytes = (uint8_t*)vlc;
    for (uint8_t channelNr = 0; channelNr < _cfg->Nc; channelNr++) {
        // Note: bitwise or of the single channel return code will not allow uniquely to decode
        //       the given error. The idea is to catch any error. This decision makes the API
        //       more simple. However, when the precise error code is needed, the single channel call
        //       has to be made separately.
        //dbgTestDump(x_s[channelNr], 16);
        float* input = encoderList[channelNr]->getInputBuff();
        const void* xs = pcms[channelNr];
        switch (_bits_width)
        {
            case 16:
            default:
            {
                int16_t* xs16 = (int16_t*)xs;
                for (int i = 0; i < _cfg->NF; i++) {
                    input[i] = xs16[i];
                }
            }
            break;
            case 24:
                if((_bits_align == 24) || (_bits_align == 0)){
                    uint8_t *xs8 = (uint8_t *)xs;
                    for (int i = 0; i < _cfg->NF; i++) {
                        int32_t tmp = (xs8[0] << 8) | (xs8[1] << 16) | (xs8[2] << 24);
                        input[i] = (float)tmp * (1.f / 65536.f);
                        xs8 += 3;
                    }
                    //for (int i = 0; i < _cfg->NF; i++){
                    //    uint32_t tmp = (xs8[0]<<8) | (xs8[1]<<16) | (xs8[2]<<24);
                    //    input[i] = ((float)*(int32_t*)&tmp) * (1.f / 65536.f);
                    //    xs8 += 3;
                    //}
                }
                else if (_bits_align == 32) {
                    int32_t* xs32 = (int32_t*)xs;
                    for (int i = 0; i < _cfg->NF; i++) {
                        int32_t tmp = xs32[i] << 8;
                        input[i] = (float)tmp * (1.f / 65536.f);
                    }
                    //uint32_t* xs32 = (uint32_t*)xs;
                    //for (int i = 0; i < _cfg->NF; i++){
                    //    uint32_t tmp = xs32[i]<<8;
                    //    input[i] = ((float)*(int32_t*)&tmp) * (1.f / 65536.f);                    
                    //}
                    //int32_t* xs32 = (int32_t*)xs;
                    //for (int i = 0; i < _cfg->NF; i++){               
                    //    input[i] = xs32[i] * (1.f / 256.f);                       
                    //}
                }
            break;
            case 32:
            {
                int32_t * xs32 = (int32_t *)xs;
                for (int i = 0; i < _cfg->NF; i++){
                    input[i] = xs32[i] * (1.f / 65536.f);
                }
            }
            break;
        }
        returnCode |= run(input, size_per_channels[channelNr], &bytes[byteOffset], channelNr);
        byteOffset += size_per_channels[channelNr];
    }
    return returnCode;
}
#if 0
uint8_t Lc3Encoder::interlace(void* input_samples, void* output_bytes) {
    auto samples = _cfg->Sample;
    auto sample_width = (_bits_width + 7) >> 3;
    if (!_inbuff) {
        _inbuff = _cfg->Alloc(samples * sample_width);
    }
    void *inbuff[4];
    inbuff[0] = _inbuff;
    switch (_bits_width)
    {
        case 16:
        {
            int16_t *in = (int16_t *)input_samples;
            int16_t *out = (int16_t *)_inbuff;
            auto channel_len = _cfg->Nc * samples;
            for (int i = 0; i < samples; i++) {
                for (int c = 0; c < channel_len; c += samples) {
                    out[c + i] = *in++;
                }
            }
            inbuff[1] = out + samples;
        }
            break;
        case 24:
        {
            int8_t* in = (int8_t*)input_samples;
            int8_t* out = (int8_t*)_inbuff;
            auto size = samples * 3;
            auto channel_len = _cfg->Nc * size;
            for (int i = 0; i < size; i += 3) {
                for (int c = 0; c < channel_len; c += size) {
                    out[c + i] = *in++;
                    out[c + i + 1] = *in++;
                    out[c + i + 2] = *in++;
                }
            }
            inbuff[1] = out + size;
        }
            break;
        case 32:
        {
            int32_t* in = (int32_t*)input_samples;
            int32_t* out = (int32_t*)_inbuff;
            auto channel_len = _cfg->Nc * samples;
            for (int i = 0; i < samples; i++) {
                for (int c = 0; c < channel_len; c += samples) {
                    out[c + i] = *in++;
                }
            }
            inbuff[1] = out + samples;
        }
            break;
      default:
            break;
    }
    auto rst = run((const void **)inbuff, (uint8_t *)output_bytes);
    return rst;
}
#endif
uint8_t Lc3Encoder::run_interlaced(const void* pcm, void* output_bytes, int vlcSize) {
    if (!_cfg || !_cfg->isValid()) {
		TRACE(1,"error status=0x%x",_cfg->getErrorStatus());
        return INVALID_CONFIGURATION;
    }
    //
    //int size_per_channels = vlcSize? (vlcSize / _cfg->Nc): _bytePerChannel;
    //if (!size_per_channels) {
    //    return INVALID_BYTE_COUNT;
    //}
    //_bytePerChannel = size_per_channels;
    // 
    int size_per_channels[2] = {0};
    if (vlcSize % _cfg->Nc) {
        size_per_channels[0] = vlcSize / _cfg->Nc + 1;
        size_per_channels[1] = vlcSize / _cfg->Nc;
    }else{
        size_per_channels[0] = vlcSize / _cfg->Nc;
        size_per_channels[1] = vlcSize / _cfg->Nc;
    }
    if (!size_per_channels[0] || !size_per_channels[1]) {
        size_per_channels[0] = _bytePerChannel[0];
        size_per_channels[1] = _bytePerChannel[1];
    }

    if (!size_per_channels[0] || !size_per_channels[1]) {
        return INVALID_BYTE_COUNT;
    }

    _bytePerChannel[0] = size_per_channels[0];
    _bytePerChannel[1] = size_per_channels[1];
    //
    auto samples = _cfg->NF;
    auto chs = _cfg->Nc;
    uint32_t byteOffset = 0;
    auto outs = (uint8_t*)output_bytes;
    auto xs = pcm;
    auto align = _bits_align;
    if (!align) align = _bits_width;
    for (int ch = 0; ch < chs; ch++) {
        auto tbuff = encoderList[ch]->getInputBuff();
        switch (_bits_width){
        case 16:
        default:
        {
            int16_t* xs16 = (int16_t*)xs + ch;
            int skip = chs;
            for (int i = 0; i < _cfg->NF; i++) {
                tbuff[i] = *xs16;
                xs16 += skip;
            }
        }
        break;
        case 24:
            if ((_bits_align == 24) || (_bits_align == 0)) {
                uint8_t* xs8 = (uint8_t*)xs + ch * 3;
                int skip = chs * 3;
                for (int i = 0; i < _cfg->NF; i++) {
                    int32_t tmp = (xs8[0]) | (xs8[1] << 8) | (xs8[2] << 16);
                    tmp = tmp << 8;
                    tbuff[i] = (float)tmp * (1.f / 65536.f);
                    xs8 += skip;
                }
                //for (int i = 0; i < _cfg->NF; i++) {
                //    uint32_t tmp = (xs8[0] << 8) | (xs8[1] << 16) | (xs8[2] << 24);
                //    tbuff[i] = ((float)*(int32_t*)&tmp) * (1.f / 65536.f);
                //    xs8 += skip;
                //}
            }
            else if (_bits_align == 32) {
                uint32_t* xs32 = (uint32_t*)xs + ch;
                int skip = chs;
                for (int i = 0; i < _cfg->NF; i++) {
                    int32_t tmp = *xs32;// &0x00ffffff;
                    tmp = tmp << 8;
                    tbuff[i] = ((float)tmp) * (1.f / 65536.f);
                    xs32 += skip;
                }
                //for (int i = 0; i < _cfg->NF; i++) {
                //    uint32_t tmp = *xs32 << 8;
                //    tbuff[i] = ((float)*(int32_t*)&tmp) * (1.f / 65536.f);
                //    xs32 += skip;
                //}
                //int32_t* xs32 = (int32_t*)xs + ch;
                //int skip = chs;
                //for (int i = 0; i < _cfg->NF; i++) {
                //    tbuff[i] = *xs32 * (1.f / 256.f);
                //    xs32 += skip;
                //}
            }
            break;
        case 32:
        {
            int32_t* xs32 = (int32_t*)xs;
            int skip = chs;
            for (int i = 0; i < _cfg->NF; i++) {
                tbuff[i] = *xs32 * (1.f / 65536.f);
                xs32 += skip;
            }
        }
        break;
        }
        auto rst = run(tbuff, size_per_channels[ch], &outs[byteOffset], ch);
        if (rst)return rst;
        byteOffset += size_per_channels[ch];
    }
    return ERROR_FREE;
}
#if 0
uint8_t Lc3Encoder::run(const int16_t** x_s, uint8_t* bytes) {
    if (!_cfg || !_cfg->isValid() || !_bytePerChannel)
    {
        return INVALID_CONFIGURATION;
    }

    uint8_t returnCode = ERROR_FREE;
    uint32_t byteOffset = 0;
    for (uint8_t channelNr = 0; channelNr < _cfg->Nc; channelNr++){
        // Note: bitwise or of the single channel return code will not allow uniquely to decode
        //       the given error. The idea is to catch any error. This decision makes the API
        //       more simple. However, when the precise error code is needed, the single channel call
        //       has to be made separately.
        returnCode |= run(x_s[channelNr], _bytePerChannel, &bytes[byteOffset], channelNr);
        byteOffset += _bytePerChannel;
    }
    return returnCode;
}

uint8_t Lc3Encoder::run(const void **x_s, uint8_t *bytes) {
    if (!_cfg || !_cfg->isValid() || !_bytePerChannel)
    {
        return INVALID_CONFIGURATION;
    }

    uint8_t returnCode = ERROR_FREE;
    uint32_t byteOffset = 0;
    for (uint8_t channelNr = 0; channelNr < _cfg->Nc; channelNr++) {
        // Note: bitwise or of the single channel return code will not allow uniquely to decode
        //       the given error. The idea is to catch any error. This decision makes the API
        //       more simple. However, when the precise error code is needed, the single channel call
        //       has to be made separately.
        uint16_t *input_xs = (uint16_t *)_input[channelNr];
        uint8_t *x_s_24 = (uint8_t *)x_s[channelNr];
        for (int i = 0; i < _cfg->Sample; i++)
        {
            uint16_t tmp = 0;
            x_s_24++;
            tmp |= *x_s_24++;
            tmp |= (*x_s_24++ << 8);
            input_xs[i] = tmp;
        }
        returnCode |= run(_input[channelNr], _bytePerChannel, &bytes[byteOffset], channelNr);
        byteOffset += _bytePerChannel;
    }
    return returnCode;
}

uint8_t Lc3Encoder::run(const int32_t** x_s, uint8_t* bytes) {
    if (!_cfg || !_cfg->isValid() || !_bytePerChannel)
    {
        return INVALID_CONFIGURATION;
    }

    uint8_t returnCode = ERROR_FREE;
    uint32_t byteOffset = 0;
    for (uint8_t channelNr = 0; channelNr < _cfg->Nc; channelNr++) {
        // Note: bitwise or of the single channel return code will not allow uniquely to decode
        //       the given error. The idea is to catch any error. This decision makes the API
        //       more simple. However, when the precise error code is needed, the single channel call
        //       has to be made separately.
        for (int i = 0; i < _cfg->Sample; i++)
        {
            _input[channelNr][i] = x_s[channelNr][i] >> 16;
        }
        returnCode |= run(_input[channelNr], _bytePerChannel, &bytes[byteOffset], channelNr);
        byteOffset += _bytePerChannel;
    }
    return returnCode;
}
#endif
