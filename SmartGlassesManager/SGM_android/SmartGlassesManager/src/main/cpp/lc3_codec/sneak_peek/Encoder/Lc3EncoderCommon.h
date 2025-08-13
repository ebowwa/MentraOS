#pragma once

#include "Lc3Config.hpp"
#include "Lc3Base.h"

namespace sneak {namespace enc{
	typedef struct Lc3EncoderCommon {
		//void* _spec16 = 0;//16NF
		void* _input32 = 0;//32NF
		void* _spec32 = 0;//32NF
		//void* _temp32 = 0;//32NF

		//void* _mdct_win = 0;//N*2
		//void* _dctIV_twiddle = 0;
		//void* _cfft_twiddles = 0;
		//void* _cfft_stack = 0;
		//void* _cfft_stageParas = 0;

		//void* _ltpf_input = 0;
		//void* _ltpf_temp = 0;
	}Lc3EncoderCommon;

}}