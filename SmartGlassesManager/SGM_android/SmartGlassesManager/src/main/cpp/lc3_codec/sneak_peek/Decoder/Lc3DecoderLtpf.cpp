#include "Lc3DecoderLtpf.h"
#include "Lc3DecoderCommon.h"
#include <assert.h>
#include <memory.h>

#define ASSERT_LC3 assert
using namespace sneak::dec;

//#define toQ31(f) (float)((f)*0x7fffffff)
//#define MUL(a, b) (__smmul(a, b)<< 1)
//#define MLA(a, b) __smmla(a, b, sum);
#define toQ31(f) (float)(f)
#define MUL(a, b) (a)* (b)
#define MLA(a, b, sum) ((a)* (b) + (sum))

static inline void move32s(void* dst0, void* src0, int n) {
    memmove(dst0, src0, n * 4);
}
//
Lc3DecoderLtpf::Lc3DecoderLtpf(const Lc3Config& cfg)
    :Lc3Base(cfg)
    ,_cfg(cfg)
    //, _mem_block_num(_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms? 3 : 2)
    , _input((float*&)cfg.Runtime<Lc3DecoderCommon>()._ltpf_input)
    , _temp((float*&)cfg.Runtime<Lc3DecoderCommon>()._ltpf_temp)
{
    if (_cfg.N_ms == Lc3Config::FrameDuration::d10ms) {
        _mem_block_num = 2;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms){
        _mem_block_num = 3;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
        _mem_block_num = 4;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d2p5ms){
        _mem_block_num = 8;
    }
    Init(_cfg.NF, _cfg.Fs);
}
Lc3DecoderLtpf::~Lc3DecoderLtpf() {
    //dbgTestPL();
    Free(_ybuff0);
}
bool Lc3DecoderLtpf::Present()const {
    return _pitch_present;
}
bool Lc3DecoderLtpf::Active()const {
    return _active;
}
bool Lc3DecoderLtpf::Init(int frame_samples, int sample_rate) {
    //dbgTestPL();
    _frame_samples = frame_samples;
    _sample_rate = sample_rate;
    return init();
}
bool Lc3DecoderLtpf::init(){
    //
    N = _frame_samples;    
    _nbits = 0;
    initData();
    //    
    _xtblidx = _ytblidx = 0;
    _xtbl = 0;
    _ytbl = 0;
    _prev_ytbl = 0;
    _prev_xtbl = 0;
    //
    _prev_active = false;
    _prev_pitch_present = false;
    _prev_pitch_index = 0;
    _prev_gain_idx = 0;
    _prev_gain = 0;
    //
    auto buff_size = (N + _xpast + _ypast) * _mem_block_num;
    if (!_input) buff_size += (N + _xpast + _ypast);
    if (!_temp)  buff_size += (N + _xpast + _ypast);
    //
    _ybuff0 = AllocT<float>(buff_size);
    memset(_ybuff0, 0, sizeof(float) * (buff_size));
    auto temp = _ybuff0;
    _ybuff[0] = temp = temp + _xpast;// _runtime->_ltpf_ybuf + _ytbl_len;
    _ybuff[1] = temp = temp + N + _xpast + _ypast;
    if (_mem_block_num == 3){
        _ybuff[2] = temp = temp + N + _xpast + _ypast;
    }else if(_mem_block_num == 4) {
        _ybuff[2] = temp = temp + N + _xpast + _ypast;
        _ybuff[3] = temp = temp + N + _xpast + _ypast;
    }else if (_mem_block_num == 8)
    {
        _ybuff[2] = temp = temp + N + _xpast + _ypast;
        _ybuff[3] = temp = temp + N + _xpast + _ypast;
        _ybuff[4] = temp = temp + N + _xpast + _ypast;
        _ybuff[5] = temp = temp + N + _xpast + _ypast;
        _ybuff[6] = temp = temp + N + _xpast + _ypast;
        _ybuff[7] = temp = temp + N + _xpast + _ypast;
    }
    if (!_input) _input = temp = temp + N + _xpast + _ypast;
    if (!_temp) _temp = temp = temp + N + _xpast + _ypast;
    //
    N = _frame_samples;
    if (_mem_block_num == 3)
    {
        N4 = N / 3;
        N34 = 2 * N / 3;
    }else{
        N4 = N / 4;
        N34 = 3 * N / 4;
    }
    //N = N;
    //
    _invN4 = 1.0f / N4;
    //
    return true;
}

void Lc3DecoderLtpf::UpdateBitRate(int nbits) {
    if (_nbits == nbits)return;
    _nbits = nbits;
    //if (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms)
    //    nbits = nbits * 10 / 7.5f;
    if (_cfg.N_ms == Lc3Config::FrameDuration::d7p5ms) {
        nbits = nbits * 10 / 7.5f;
    }else if (_cfg.N_ms == Lc3Config::FrameDuration::d5ms){
        nbits = (nbits << 1) - 160;
    }else if(_cfg.N_ms == Lc3Config::FrameDuration::d2p5ms){
        nbits = (nbits << 2) * 0.6f;
    }
        
    auto val = nbits - _cfg.Fs_ind * 80;
    //auto idx = (val - 320 + 80) / 80;
    //auto gain = 0.4f - 0.05f * idx;

    if (val < 320){
        _gain = 0.4f;
        _gain_idx = 0;
    }
    else if (val < 400) {
        _gain = 0.35f;
        _gain_idx = 1;
    }
    else if (val < 480){
        _gain = 0.3f;
        _gain_idx = 2;
    }
    else if (val < 560){
        _gain = 0.25f;
        _gain_idx = 3;
    } 
    else {
        _gain = 0;
        //_gain_idx = 4;  // just a guess so far!
        _gain_idx = 3;  // just a guess so far!
    }
}

float* Lc3DecoderLtpf::Process(bool active, bool pitch, int16_t pitch_index, float* temp) {
    _active = active;
    _pitch_index = pitch_index;
    _pitch_present = pitch;//_active || _pitch_index;
    _ytemp = temp;//_ch->_temp32;
    _zbuff = _ytemp + N4 + N4;
    return process(_input);
}
float* Lc3DecoderLtpf::process(float* data) {
    update();
    return filter(data);
}
void Lc3DecoderLtpf::update() {
    bool bfi = false;
    int fs = _sample_rate;
    auto gain = 0.f;
    int gain_idx = _gain_idx;

    if (!bfi) {
        /* Decode pitch */
        if (_pitch_present) {
            updatePitch();
        }
        else {
            _pitch_int = 0;
            _pitch_fr = 0;
        }

        /* Decode gain */
        if (gain_idx < 0) {
            _active = 0;
        }

        if (_active) {
            gain = _gain;
        }
        else {
            gain = 0;
        }
    }
    else {
        if (gain_idx < 0) {
            if (_prev_active && _prev_gain_idx >= 0) {
                gain_idx = _prev_gain_idx;
            }
        }
        //
        _prev_pitch_present = _pitch_present;
        _prev_active = _active;
        _prev_pitch_index = _pitch_index;
        //
        if (_concealMethod == 2) {
            /* cause the ltpf to "fade_out" and only filter during initial 2.5 ms and then its buffer during 7.5 ms */
            assert(bfi == 1);
            _active = false; 
        }
        //
        _pitch_int = _prev_pitch_int;
        _pitch_fr = _prev_pitch_fr;
        //
        gain = _prev_gain * _damping;
    }
    //update filter table
    if (_active) {
        updateTable(gain);
    }
    else {
        _xtbl = 0;
        _ytbl = 0;
    }

    _prev_gain = gain;
    _prev_gain_idx = gain_idx;

}
void Lc3DecoderLtpf::updatePitch() {
    int fs = _sample_rate;
    int conf_pitmin = 32;
    int conf_pitfr2 = 127;
    int conf_pitfr1 = 157;
    int pitch_index = _pitch_index;
    int pitch_int, pitch_fr;
    if (pitch_index < (conf_pitfr2 - conf_pitmin) << 2) {
        pitch_int = conf_pitmin + (pitch_index >> 2);
        pitch_fr = pitch_index - ((pitch_int - conf_pitmin) << 2);
    }
    else if (pitch_index < ((conf_pitfr2 - conf_pitmin) << 2) + ((conf_pitfr1 - conf_pitfr2) << 1)) {
        pitch_index = pitch_index - ((conf_pitfr2 - conf_pitmin) << 2);
        pitch_int = conf_pitfr2 + (pitch_index >> 1);
        pitch_fr = pitch_index - ((pitch_int - conf_pitfr2) << 1);
        pitch_fr = pitch_fr << 1;
    }
    else {
        pitch_int = pitch_index + (conf_pitfr1 - ((conf_pitfr2 - conf_pitmin) << 2) - ((conf_pitfr1 - conf_pitfr2) << 1));
        pitch_fr = 0;
    }

    int pitch = (pitch_int * 4 + pitch_fr) * ((fs+7999)/8000*8000);
    pitch = (pitch + (12800 >> 1)) / 12800;
    _pitch_int = pitch >> 2;
    _pitch_fr = pitch & 3;
}
void Lc3DecoderLtpf::updateTable(float gain) {
    auto conf_alpha = toQ31(0.85f);
    if (_prev_xtbl && gain == _prev_gain && _gain_idx == _prev_gain_idx) {
        _xtbl = _prev_xtbl;
    }
    else {
        _xtbl = _xtbls[_xtblidx]; _xtblidx = !_xtblidx;
        auto scale = MUL(gain, conf_alpha);
        int idx = _gain_idx;
        const auto* tbl = _xtbl_filter[idx];
        for (int i = 0; i < _xtbl_len_r; i++) {
            _xtbl[i] = MUL(tbl[_xtbl_len_r-1-i], scale);
        }
    }

    if (_prev_ytbl && gain == _prev_gain && _pitch_fr == _prev_pitch_fr) {
        _ytbl = _prev_ytbl;
    }
    else {
        _ytbl = _ytbls[_ytblidx]; _ytblidx = !_ytblidx;
        auto scale = gain;
        const auto* tbl = _ytbl_filter[_pitch_fr];
        for (int i = 0; i < _ytbl_len_r; i++) {
              _ytbl[i] = MUL(tbl[_ytbl_len_r-1-i], scale);
        }
    }
}

float* Lc3DecoderLtpf::filter(float* x) {
    _ybuff[_mem_block_num] = _temp;
    //_ybuff[0] is unused in prev 3/4;
    //_ytemp = _ybuff[0];//_ch->_temp32;
    //_zbuff = _ytemp + N4 + N4;
    /* First quarter of the current frame: cross-fading */
    if (!_prev_active && !_active) {
        filter00(x);
    }
    else {
        _xbuff = x - _xtbl_len;
        move32s(_xbuff, _xold, _xtbl_len);
        //
        if (_prev_active && !_active ) {
            filter10();
        }
        else if (!_prev_active && _active) {
            filter01();
        }
        else if (_prev_pitch_int == _pitch_int && _prev_pitch_fr == _pitch_fr) {
            filter11x();
        }
        else {
            filter11();
        }

        /* Second quarter of the current frame */
        if (!_active) {
            filterN43x();
        }
        else {
            filterN43();
        }
    }
    //output
    auto y = _ybuff[_mem_block_num];
    //save xold
    move32s(_xold, &x[N - _xtbl_len], _xtbl_len);

    //save status
    _prev_pitch_int = _pitch_int;
    _prev_pitch_fr = _pitch_fr;
    _prev_pitch_present = _pitch_present;
    _prev_active = _active;
    _prev_pitch_index = _pitch_index;
    _prev_ytbl = _ytbl;
    _prev_xtbl = _xtbl;
    //
    //switch yold
    _temp = _ybuff[0];
    _ybuff[0] = _ybuff[1];
    _ybuff[1] = _ybuff[2];
    if (_mem_block_num == 3) {
        _ybuff[2] = _ybuff[3];
    }else if(_mem_block_num == 4){
        _ybuff[2] = _ybuff[3];
        _ybuff[3] = _ybuff[4];
    }else if (_mem_block_num == 8){
        _ybuff[2] = _ybuff[3];
        _ybuff[3] = _ybuff[4];
        _ybuff[4] = _ybuff[5];
        _ybuff[5] = _ybuff[6];
        _ybuff[6] = _ybuff[7];
        _ybuff[7] = _ybuff[8];
    }
    return y;
}
static inline float iirFilterN(float* ptr, float* tbl, int size) {
    auto sum = 0.f;
    for (int i = 0; i < size; i++) {
        sum += MUL(tbl[i], ptr[i]);
        //sum = __smmla(tbl[i], ptr[i], sum);
    }
    //return sum << 1;
	return sum;
}
void Lc3DecoderLtpf::filter00(float* x) {
    //move32s(_ybuff[2], x, N);
    assert(x == _input);
    //SwitchInputBuff();
    auto tmp = _input;
    _input = _ybuff[_mem_block_num];
    _ybuff[_mem_block_num] = tmp;
    //_ybuff[2] = SwitchUsedBuff(x, _ybuff[2]);
}
void Lc3DecoderLtpf::filter01() {
    filter01(_xbuff);
}
void Lc3DecoderLtpf::filter01(float* xbuf) {
    int xlen = _xtbl_len + 1;
    int ylen = _ytbl_len * 2;
    //auto xbuf = ibuf0;
    int ii = 0;
    int len = 0;
    auto ybuf = generateYbuff(_pitch_int, N4, ii, len);
    auto ibuf = xbuf + _xtbl_len;
    auto obuf = _ybuff[_mem_block_num];
    int n = 0;
    if (N4 + _ytbl_len_r > len) {
        len = N4 < len ? N4 - ylen : len - ylen;
        for (; n < len; n++) {
            auto sum1 = iirFilterN(xbuf + n, _xtbl, xlen);
            auto sum2 = iirFilterN(ybuf + n, _ytbl, ylen);
            //auto sum = (sum1 - sum2) * (N4 - n) + (N4 - 1);
            //sum = MUL(sum, _invN4);
            auto sum = (sum1 - sum2) * n * _invN4;
            obuf[n] = ibuf[n] - sum;
        }
        auto tmp_prev = _ybuff[ii + 1];
        auto tmp_last = _ybuff[ii] + N;
        for (int i = 0; i < _xpast; i++) {
            tmp_last[i] = tmp_prev[i];
        }
        len += ylen;
        for (; n < len; n++) {
            auto sum1 = iirFilterN(xbuf + n, _xtbl, xlen);
            auto sum2 = iirFilterN(ybuf + n, _ytbl, ylen);
            //auto sum = (sum1 - sum2) * (N4 - n) + (N4 - 1);
            //sum = MUL(sum, _invN4);
            auto sum = (sum1 - sum2) * n * _invN4;
            obuf[n] = ibuf[n] - sum;
        }
        tmp_prev = _ybuff[ii + 1] - _xpast;
        tmp_last = _ybuff[ii] + N - _xpast;
        for (int i = 0; i < _xpast; i++) {
            tmp_prev[i] = tmp_last[i];
        }
        ybuf = _ybuff[ii + 1] - n;
    }
    for (; n < N4; n++) {
        auto sum1 = iirFilterN(xbuf + n, _xtbl, xlen);
        auto sum2 = iirFilterN(ybuf + n, _ytbl, ylen); 
        //auto sum = (sum1 - sum2) * n + (N4 - 1);
        //sum = MUL(sum, _invN4);
        auto sum = (sum1 - sum2) * n * _invN4;
        obuf[n] = ibuf[n] - sum;
    }
}
void Lc3DecoderLtpf::filter10() {
    filter10(_ybuff[_mem_block_num]);
}
void Lc3DecoderLtpf::filter10(float* obuf) {
    int xlen = _xtbl_len + 1;
    int ylen = _ytbl_len_r;
    auto xbuf = _xbuff;
    //auto ybuf = generateYbuff(_prev_pitch_int, N4);
    int len = 0;
    int ii = 0;
    auto ybuf = generateYbuff(_prev_pitch_int, N4, ii, len);
    auto ibuf = xbuf + _xtbl_len;
    //auto obuf = _ybuff[2];
    int n = 0;
    if (N4 + ylen > len) {
        len = N4 < len ? N4 - ylen : len - ylen;
        for (; n < len; n++) {
            auto sum1 = iirFilterN(xbuf + n, _prev_xtbl, xlen);
            auto sum2 = iirFilterN(ybuf + n, _prev_ytbl, ylen);
            //auto sum = (sum1 - sum2) * (N4 - n) + (N4 - 1);
            //sum = MUL(sum, _invN4);
            auto sum = (sum1 - sum2) * (N4 - n);
            sum = MUL(sum, _invN4);
            obuf[n] = ibuf[n] - sum;
        }
        auto tmp_prev = _ybuff[ii + 1];
        auto tmp_last = _ybuff[ii] + N;
        for (int i = 0; i < _xpast; i++) {
            tmp_last[i] = tmp_prev[i];
        }
        len += ylen;
        for (; n < len; n++) {
            auto sum1 = iirFilterN(xbuf + n, _prev_xtbl, xlen);
            auto sum2 = iirFilterN(ybuf + n, _prev_ytbl, ylen);
            //auto sum = (sum1 - sum2) * (N4 - n) + (N4 - 1);
            //sum = MUL(sum, _invN4);
            auto sum = (sum1 - sum2) * (N4 - n);
            sum = MUL(sum, _invN4);
            obuf[n] = ibuf[n] - sum;
        }
        tmp_prev = _ybuff[ii + 1] - _xpast;
        tmp_last = _ybuff[ii] + N - _xpast;
        for (int i = 0; i < _xpast; i++) {
            tmp_prev[i] = tmp_last[i];
        }
        ybuf = _ybuff[ii + 1] - n;
    }
    for (; n < N4; n++) {
        auto sum1 = iirFilterN(xbuf + n, _prev_xtbl, xlen);
        auto sum2 = iirFilterN(ybuf + n, _prev_ytbl, ylen);
        //auto sum = (sum1 - sum2) * (N4 - n) + (N4 - 1);
        //sum = MUL(sum, _invN4);
        auto sum = (sum1 - sum2) * (N4 - n);
        sum = MUL(sum, _invN4);
        obuf[n] = ibuf[n] - sum;
    }
}
void Lc3DecoderLtpf::filter11() {    
    //cpoy xpast to zbuff
    move32s(_zbuff - _xtbl_len, _ybuff[_mem_block_num - 1] + N - _xtbl_len, _xtbl_len);
    //output zbuff
    filter10(_zbuff);
    //input zbuff
    filter01(_zbuff - _xtbl_len);
}
void Lc3DecoderLtpf::filter11x() {
    int xlen = _xtbl_len + 1;
    int ylen = _ytbl_len * 2;
    auto xbuf = _xbuff;
    int ii = 0;
    int len = 0;
    auto ybuf = generateYbuff(_pitch_int, N4, ii , len);
    auto ibuf = xbuf + _xtbl_len;
    auto obuf = _ybuff[_mem_block_num];
    int n = 0;
    if (N4 + ylen > len) {
        len = N4 < len ? N4 - ylen : len - ylen;
        for (; n < len; n++) {
            auto sum1 = iirFilterN(xbuf + n, _xtbl, xlen);
            auto sum2 = iirFilterN(ybuf + n, _ytbl, ylen);
            obuf[n] = ibuf[n] - (sum1 - sum2);
        }
        auto tmp_prev = _ybuff[ii + 1];
        auto tmp_last = _ybuff[ii] + N;
        for (int i = 0; i < _xpast; i++) {
            tmp_last[i] = tmp_prev[i];
        }
        len += ylen;
        for (; n < len; n++) {
            auto sum1 = iirFilterN(xbuf + n, _xtbl, xlen);
            auto sum2 = iirFilterN(ybuf + n, _ytbl, ylen);
            obuf[n] = ibuf[n] - (sum1 - sum2);
        }
        tmp_prev = _ybuff[ii + 1] - _xpast;
        tmp_last = _ybuff[ii] + N + _xpast;
        for (int i = 0; i < _xpast; i++) {
            tmp_prev[i] = tmp_last[i];
        }
        ybuf = _ybuff[ii + 1] - n;
    }
    for (; n < N4; n++) {       
        auto sum1 = iirFilterN(xbuf + n, _xtbl, xlen);
        auto sum2 = iirFilterN(ybuf + n, _ytbl, ylen);
        obuf[n] = ibuf[n] - (sum1 - sum2);
    }
}
void Lc3DecoderLtpf::filterN43() {
    int xlen = _xtbl_len + 1;
    int ylen = _ytbl_len * 2;
    auto xbuf = _xbuff + N4;
    int ii = 0;
    int len = 0;
    auto ybuf = generateYbuff(_pitch_int - N4, N34, ii, len);
    auto ibuf = xbuf + _xtbl_len;
    auto obuf = _ybuff[_mem_block_num] + N4;
    //int n = 0;
    //if (_pitch_int < N4)
    //    n = 0;
    //if (_pitch_int <= N34) {
    //    for (n = 0; n < _pitch_int - _ytbl_len; n++) {
    //        auto sum1 = iirFilterN(xbuf + n, _xtbl, xlen);
    //        auto sum2 = iirFilterN(ybuf + n, _ytbl, ylen);
    //        obuf[n] = ibuf[n] - (sum1 - sum2);
    //    }
    //    ybuf = obuf - ylen - n;
    //}
    int n = 0;
    if (N34 + _ytbl_len_r > len) {
        len = N34 < len ? N34 - ylen : len - ylen;
        for (; n < len; n++) {
            auto sum1 = iirFilterN(xbuf + n, _xtbl, xlen);
            auto sum2 = iirFilterN(ybuf + n, _ytbl, ylen);
            obuf[n] = ibuf[n] - (sum1 - sum2);
        }
        auto tmp_prev = _ybuff[ii + 1];
        auto tmp_last = _ybuff[ii] + N;
        for (int i = 0; i < _xpast; i++) {
            tmp_last[i] = tmp_prev[i];
        }
        len += ylen;
        for (; n < len; n++) {
            auto sum1 = iirFilterN(xbuf + n, _xtbl, xlen);
            auto sum2 = iirFilterN(ybuf + n, _ytbl, ylen);
            obuf[n] = ibuf[n] - (sum1 - sum2);
        }
        tmp_prev = _ybuff[ii + 1] - _xpast;
        tmp_last = _ybuff[ii] + N - _xpast;
        for (int i = 0; i < _xpast; i++) {
            tmp_prev[i] = tmp_last[i];
        }
        ybuf = _ybuff[ii + 1] - n;
    }
    for (; n < N34; n++) {
        auto sum1 = iirFilterN(xbuf + n, _xtbl, xlen);
        auto sum2 = iirFilterN(ybuf + n, _ytbl, ylen);
        obuf[n] = ibuf[n] - (sum1 - sum2);
    }
}
void Lc3DecoderLtpf::filterN43x() {
    move32s(_ybuff[_mem_block_num] + N4, &_xbuff[_xtbl_len + N4], N34);
}

float* Lc3DecoderLtpf::generateYbuff(int p, int s, int &ii, int &len) {
    //s += _ytbl_len << 1;
    int idx = p + _ytbl_len;
    //if (_mem_block_num == 2)
    //{
    //    idx = N + N - idx;
    //    while (idx < 0) {
    //        idx += N + N;
    //    }
    //}else{
    //    idx = N + N + N - idx;
    //    while (idx < 0) {
    //        idx += N + N + N;
    //    }
    //}
    switch (_mem_block_num)
    {
        case 2:
        {
            idx = N + N - idx;
            if (idx < 0) {
                idx += N + N;
            }
            break;
        }
        case 3: 
        {
            idx = N + N + N - idx;
            if (idx < 0) {
                idx += N + N + N;
            }
            break;
        }
        case 4:
        {
            idx = (N << 2) - idx;
            if (idx < 0) {
                idx += N << 2;
            }
            break;
        }
        case 8:
        {
            idx = (N << 3) - idx;
            if (idx < 0) {
                idx += N << 3;
            }
            break;
        }
        default:
            break;
    }
    while (idx > N) {
        ii++;
        idx -= N;
    }
    //copy data
    len = N - idx;
    //auto dst = _ytemp;
    //if (s <= len) {
        //move32s(dst, &_ybuff[ii][idx], s);
        //dst = &_ybuff[ii][idx];
    //}
    //else {
    //    move32s(dst, &_ybuff[ii][idx], len);
    //    move32s(dst + len, &_ybuff[ii + 1][0], s - len);
    //}
    return &_ybuff[ii][idx];
}
