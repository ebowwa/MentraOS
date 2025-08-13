/*
 *  Copyright (c) 2003-2010, Mark Borgerding. All rights reserved.
 *  This file is part of KISS FFT - https://github.com/mborgerding/kissfft
 *
 *  SPDX-License-Identifier: BSD-3-Clause
 *  See COPYING file for more information.
 */

#pragma once
#include "Lc3Base.h"

namespace sneak {
class cfft : public Lc3Base
{
public:
    typedef float scalar_t;
    typedef struct {
        float re;
        float im;
    }cpx_t;
    //
    cfft(const std::size_t N
        , const bool inverse
        , const Lc3Config& 
    );
    ~cfft();
    /// Calculates the complex Discrete Fourier Transform.
    ///
    /// The size of the passed arrays must be passed in the constructor.
    /// The sum of the squares of the absolute values in the @c dst
    /// array will be @c N times the sum of the squares of the absolute
    /// values in the @c src array, where @c N is the size of the array.
    /// In other words, the l_2 norm of the resulting array will be
    /// @c sqrt(N) times as big as the l_2 norm of the input array.
    /// This is also the case when the inverse flag is set in the
    /// constructor. Hence when applying the same transform twice, but with
    /// the inverse flag changed the second time, then the result will
    /// be equal to the original input times @c N.
    #if 0
    void transform(const cpx_t* fft_in
        , cpx_t* fft_out
        , const std::size_t stage = 0
        , const std::size_t fstride = 1
        , const std::size_t in_stride = 1
    ) const;
    #endif
    void transform_stack(int fft_in=0
        , int fft_out=0
        , int stage = 0
    ) ;
    void transform(const cpx_t* fft_in, cpx_t* fft_out);
    //private://for static inline
    //void kf_bfly2(cpx_t* Fout, const size_t fstride, const std::size_t m) const;
    //void kf_bfly3(cpx_t* Fout, const std::size_t fstride, const std::size_t m) const;
    //void kf_bfly4(cpx_t* const Fout, const std::size_t fstride, const std::size_t m) const;
    //void kf_bfly5(cpx_t* const Fout, const std::size_t fstride, const std::size_t m) const;

    /* perform the butterfly for one stage of a mixed radix FFT */
    //void kf_bfly_generic(cpx_t* const Fout, const size_t fstride, const std::size_t m, const std::size_t p) const;
private:
    const std::size_t N;
    //bool _inverse;

    cpx_t*& _twiddles;
    uint32_t _stageParas[16];
    uint32_t _stageCount;

    uint32_t _stack[128];
    int _stackCount;
protected:
    cpx_t* create_twiddles();
};    
}