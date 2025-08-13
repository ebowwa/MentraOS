/*
 * DatapointsDummy.cpp
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

#include "Lc3Pool.hpp"
#include "smf_debug.h"

using namespace sneak;

Lc3Pool::Lc3Pool(void*buff,int size){
	_buff = (char*)buff;
	_buffSize = size;
	_buffUsed = 0;
}
Lc3Pool::~Lc3Pool(){
	//dbgChnPDL(f,_buffUsed);
}
void* Lc3Pool::Alloc(int size) const {
	auto off = _buffUsed;
	if(off+size > _buffSize){
		//dbgErrPXL("%d+%d>%d", _buffUsed,size, _buffSize);	
		return 0;
	}
	_buffUsed += size; //dbgTestPXL("%d,%d",size,_buffUsed);
	return _buff+off;
}
void Lc3Pool::Free(void*& ptr) const {

}
//void Lc3Pool::addDatapoint(const char* label, const void* pData, uint16_t sizeInBytes)const {
//
//}
//void Lc3Pool::log(const char* label, const void* pData, uint16_t sizeInBytes)const {
//	//dbgTestPXL(label);
//}
int Lc3Pool::print(int ch, const char* str, ...)const {
	return 0;
}
int Lc3Pool::GetMemUsed()const {
	return _buffUsed;
}
int Lc3Pool::GetMemUsedMax() const {
	return _buffUsed;
}
