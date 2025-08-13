#pragma once
#include "Lc3Base.h"
#include "Lc3Config.hpp"

namespace sneak{ namespace dec{
    class Lc3DecoderLtpf :  public Lc3Base
    {
    public:
        Lc3DecoderLtpf(const Lc3Config& cfg);
        ~Lc3DecoderLtpf();
    //protected:
        //friend class Lc3DecoderChannel;
    protected:
        const Lc3Config& _cfg;
    private:
        bool init();
        void initData();
    public:
        bool Init(int frame_samples, int sample_rate);
        float* Process(bool active, bool pitch, int16_t pitch_index, float* temp);
        void UpdateBitRate(int totalBits);
    public:
        bool Present()const;
        bool Active()const;
    protected:
        float* process(float*);
        float* filter(float* x);
        void filter00(float* x);
        void filter01();
        void filter01(float* ibuf);
        void filter10();
        void filter10(float* obuf);
        void filter11();
        void filter11x();
        void filterN43();
        void filterN43x();
        void update();
        void updateTable(float gain);
        void updatePitch();
        float* generateYbuff(int p, int s, int &ii, int &len);
    protected:
        int _nbits;
        uint16_t _idx;
        int16_t N;
        int16_t _mem_block_num;
        int16_t N4;
        int16_t N34;
        float _invN4;
        //table
        const float* _ytbl_filter[4];
        const float* _xtbl_filter[4];
        int16_t _ytbl_len;
        int16_t _xtbl_len;
        int16_t _ytbl_len_r;        
        int16_t _xtbl_len_r;
        float _xtbls[2][12];
        float _ytbls[2][12];
        int8_t _xtblidx;
        int8_t _ytblidx;
        float* _ytbl;
        float* _xtbl;
        float* _prev_ytbl;
        float* _prev_xtbl;
        int16_t _xpast;
        int16_t _ypast;
    protected://read from sideinfo;
        bool _pitch_present;
        bool _prev_pitch_present;
        bool _active;  
        bool _prev_active;
        int16_t _pitch_index;//9bit
        int16_t _prev_pitch_index; 
    protected://update by bitrate        
        int8_t _gain_idx;
        int8_t _prev_gain_idx;
        float _gain;
        float _prev_gain;
    protected:        
        float* _xbuff;
        float* _zbuff;
        float* _ytemp;  
        float* _ybuff0;
        float* _ybuff[9];
        float _xold[12];        
    protected://pitch        
        int16_t _pitch_int;
        int16_t _pitch_fr;            
        int16_t _prev_pitch_int;
        int16_t _prev_pitch_fr;        
    protected://other
        int16_t _concealMethod = 0;
        float _damping = 1;        
    protected:
        int _frame_samples = 0;      
        int _sample_rate = 0;
        //
        float*& _input;
        float*& _temp;
    public:
        float* GetBuffInput()const { return _input; }
    };

}}
