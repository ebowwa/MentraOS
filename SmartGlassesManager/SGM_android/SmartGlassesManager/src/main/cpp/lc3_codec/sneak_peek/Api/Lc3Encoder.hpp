/*
 * Lc3Encoder.hpp
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

#ifndef API_LC3ENCODER_HPP_
#define API_LC3ENCODER_HPP_

#include <cstdint>
#include "Lc3Config.hpp"

/*
 * Forward declaration of the "internal" class EncoderTop, so
 * that the private vector of single channel encoders can be declared in Lc3Encoder.
 */
namespace sneak {
    //class DatapointContainer;
    namespace enc {
        class EncoderFrame;
    }
/*
 * The LC3 encoder interface is specified in
 * LC3 specification Sections 2.2 "Encoder interfaces" (dr09r07).
 *
 * Lc3Encoder is designed such that all specified features are provided
 * with the (current) exception of not providing other input bit depth
 * than 16 bit/sample. At the time of writing, the main purpose of the
 * implementation was to handle 16bit audio data provided within android
 * smartphones. Providing the specified 24bit and 32 bit audio data input,
 * would make the API more complex. However, the main argument to not support
 * these sample rates right now, is that internal operations and memory
 * consumption would have to be increased measurable otherwise.
 *
 * Instantiating Lc3Encoder implies providing a Lc3Config instance. A copy of
 * this instance is available as public const member so that all essential session
 * parameters can be obtained throughout the lifetime of the Lc3Encoder instance.
 *
 * There is no possibility of changing Lc3Config within Lc3Encoder. When session
 * parameters have to be changed, the calling application has to create a new
 * instance of Lc3Encoder.
 *
 * Lc3 supports operation with variable encoded bitrate. It is possible to change
 * the bitrate from frame to frame, where for preciseness the parameter is not
 * given as bit rate directly but in terms of the byte_count per frame. This
 * parameter has to be in the range of 20 to 400
 * (see LC3 specification Section 3.2.5 "Bit budget and bitrate")
 *
 */
class Lc3Encoder
{
public:
    /*
     * General constructor of Lc3Encoder.
     *
     * Parameters:
     *  cfg : instance of Lc3Config. See documentation of Lc3Config for more details.
     *               Note: providing an invalid instance of Lc3Config will result
     *                     in skipping any processing later.
     *               The provided instance of Lc3Config will be copied to the
     *               public field "_cfg" (see below).
     *
     *  bits_per_audio_sample_enc_ : The bits per audio sample for the input PCM signal.
     *                               See LC3 specification Section 2.2 "Encoder interfaces"
     *                               and Section 3.2.3 "Bits per sample" for the general LC3
     *                               requirement to support 16, 24 and 32 bit.
     *                                 Note: This parameter may differ from the decoder output PCM
     *                               setting "bits_per_audio_sample_dec".
     *
     *                                However, the current implementation allows 16 bit only
     *                               and will return an error INVALID_BITS_PER_AUDIO_SAMPLE
     *                               for run() when configured with any other value.
     *                               (see reasoning for this constraint in the general class
     *                                descripton above)
     *
     * datapoints : pointer to an instance of a class allowing to collect internal data.
     *              Note: this feature is used and prepared for testing of the codec
     *                    implementation only. See general "Readme.txt"
     */
    //Lc3Encoder(const Lc3Config& cfg, uint8_t bits_per_audio_sample_enc_ = 16);
    bool Initialize(const Lc3Config& cfg, uint8_t sample_bits_width = 16, uint8_t sample_bits_align = 0);
    void Uninitialize();
    // no default constructor supported
    //Lc3Encoder() = delete;

    // Destructor
    ~Lc3Encoder();

    /*
     * Configuration provided during instantiation accessible as public const fields.
     * Note: Lc3Config provides a getter to check whether the configuration is valid.
     */
    const Lc3Config*  _cfg = 0;
    uint8_t _bits_width = 0;
    uint8_t _bits_align = 0;

    // encoding errors (see return values of "run" methods)
    static const uint8_t ERROR_FREE            = 0x00;
    static const uint8_t INVALID_CONFIGURATION = 0x01;
    static const uint8_t INVALID_BYTE_COUNT    = 0x02;
    static const uint8_t INVALID_BITS_PER_AUDIO_SAMPLE = 0x03;
    static const uint8_t ENCODER_ALLOCATION_ERROR      = 0x04;


    /*
     * Encoding of one input frame for one channel.
     *
     * Note that this method can be used for multi-channel configurations as well,
     * particularly when the provided multi-channel "run" (see below) is not providing
     * the kind of byte stream concatenation desired by a specific application.
     *
     * Parameters:
     *  x          : pointer to input signal array with 16bit/sample.
     *               The length of the signal to be provided depends on the given
     *               session configuration and can be obtained via
     *               _cfg.NF
     *
     *  byte_count : determines the compression strength (-> bitrate) to be used
     *               for this specific frame. Supported values are 20 bytes to 400 bytes,
     *               where values well below 40 bytes typically give rather poor audio quality.
     *                 Note: in case of having an application targeting a given bitrate, the
     *                       helper method "_cfg.getByteCountFromBitrate(.)" can be used
     *                       to compute the proper setting for this byte_count parameter.
     *
     *  bytes      : pointer to byte array (memory) provided by the application, where the
     *               encoded byte stream will be placed. The size of this memory is given by
     *               the byte_count parameter.
     *
     *  channelNr  : index of channel to be processed (default=0), where channelNr < _cfg.Nc
     *
     * Return value: error code as listed above.
     */
    uint8_t run(const float* pcm, uint16_t byte_count, void* bytes, uint8_t channelNr=0);

    /*
     * Encoding of one multi-channel frame.
     *
     * Note that this call always processes all channels configured in the given session.
     *
     * Parameters:
     *  x          : pointer to input signal array with 16bit/sample.
     *               The length of the signal to be provided depends on the given
     *               session configuration and can be obtained via
     *               _cfg.NF * _cfg.Nc
     *
     *  byte_count_per_channel : determines the compression strength (-> bitrate) to be used
     *                           for each channel individually of this specific frame.
     *                           Thus, byte_count_per_channel is an array of byte_count values
     *                           with length lc3Conig.Nc
     *                              Supported values per channel are 20 bytes to 400 bytes.
     *                              See also the documentation for the single channel "run" above.
     *
     *  bytes      : pointer to byte array (memory) provided by the application, where the
     *               encoded byte stream will be placed. The size of this memory is given by
     *               the byte_count_per_channel parameter, specifically by the sum of all
     *               channel-wise byte_count values
     *               (byte_count_per_channel[0] + ... + byte_count_per_channel[_cfg.Nc])
     *                This implies that the encoded bytes from the individual channels are
     *               concatenated directly (without any stuffing bytes or meta information).
     *
     * Return value: error code as listed above.
     */
    //uint8_t run(const int16_t* x, const uint16_t* byte_count_per_channel, uint8_t* bytes);

    void SetBitRate(int bitrate);
    void SetFrameSize(int nbyte);
    void SetBytesPerChannel(int nbytes);
    int GetBytesPerChannel()const;
	uint32_t GetCfg() const;
    //uint8_t run(const int16_t** x, uint8_t* bytes);
    uint8_t run(const void **pcms, void *vlc, int vlcSize);
    //uint8_t run(const int32_t** x_s, uint8_t* bytes);
    //uint8_t interlace(const void *x_s, void *output_bytes);
    uint8_t run_interlaced(const void *pcm, void *vlc, int vlcSize);
private:
    enc::EncoderFrame* encoderList[4];
    int _bytePerChannel[4] = { 0 };
};
}
#endif /* API_LC3ENCODER_HPP_ */
