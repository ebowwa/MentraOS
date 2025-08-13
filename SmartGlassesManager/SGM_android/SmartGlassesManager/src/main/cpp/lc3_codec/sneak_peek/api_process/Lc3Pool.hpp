/*
 * Datapoints.hpp
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

#ifndef __LC3_POOL_HPP_
#define __LC3_POOL_HPP_

#include <cstdint>
#include "Lc3Config.hpp"

namespace sneak {
    class Lc3Pool :public Lc3Config {
    public:
        Lc3Pool(void* buff,int size);
        virtual ~Lc3Pool();
    public:
        virtual void* Alloc(int size) const override;
        virtual void Free(void*& ptr) const override;
    public:
        //virtual void addDatapoint(const char* label, const void* pData, uint16_t sizeInBytes) const override;
        //virtual void log(const char* label, const void* pData, uint16_t sizeInBytes) const override;
        virtual int print(int ch, const char* str, ...)const override;
    protected:
        char*_buff;
		int _buffSize;
		mutable int _buffUsed;
        mutable int _buffUsedMax;
    public:
        virtual int GetMemUsed() const override;
        virtual int GetMemUsedMax() const override;
    };
}
#endif // __LC3_POOL_HPP_
