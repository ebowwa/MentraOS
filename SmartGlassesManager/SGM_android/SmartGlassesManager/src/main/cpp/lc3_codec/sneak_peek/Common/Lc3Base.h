#pragma once
#include <complex>
#include "Lc3Config.hpp"
#include "smf_arm_dsp.h"
#if 0//def SMF
#include "SmfStatistics.h"
#else
#define dbgCodecCp()
#endif
#define PI 3.14159265358979323846f
namespace sneak {
	class Lc3Base{
	protected:
		//static float cos(float v);
		//static float sin(float v);
		//static float exp(float v);
		//static float exp2(float v);
		//static std::complex<float> exp(std::complex<float> v);
		//static float log2(float v);
		//static float log10(float v);
		//static float sqrt(float v);			
		//static float pow(float base,float exp);
		//static float max(float v0,float v1);
		//static float min(float v0,float v1);

		//static float fabs(float v);
		//static float floor(float v);
		//static float ceil(float v);
		//static float asin(float v);
		//static float acos(float v);
	public:
		Lc3Base(const Lc3Config&cfg):_cfg(cfg){}
	public:
		const Lc3Config& _cfg;
	public:///Alloc
		template<class T>inline
		T* AllocT(unsigned num = 1) {
			return (T*)_cfg.Alloc(num*sizeof(T));
		}
		template<class T>inline
		void Free(T*& ptr) {
			_cfg.Free((void*&)ptr);
		}
	};	
}