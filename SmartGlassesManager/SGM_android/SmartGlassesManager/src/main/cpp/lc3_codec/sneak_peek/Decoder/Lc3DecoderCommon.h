#pragma once

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak {namespace dec{
	typedef struct Lc3DecoderCommon {
		//void* _spec_temp = 0;//N*(ch+1),spec[ch]+temp

		//void* _mdct_win = 0;//N*2
		//void* _dctIV_twiddle = 0;
		//void* _cfft_twiddles = 0;
		//void* _cfft_stack = 0;
		//void* _cfft_stageParas = 0;

		void* _ltpf_input = 0;
		void* _ltpf_temp = 0;
	}Lc3DecoderCommon;

}}