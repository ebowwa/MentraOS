/*
 *  Copyright (c) 2003-2010, Mark Borgerding. All rights reserved.
 *  This file is part of KISS FFT - https://github.com/mborgerding/kissfft
 *
 *  SPDX-License-Identifier: BSD-3-Clause
 *  See COPYING file for more information.
 */

#include "cfft.hh"
#include <assert.h>
#include <stdio.h>
using namespace sneak;
//#define re_mul(re1, re2, im1, im2) re1*re2 - im1*im2
//#define im_mul(re1, im2, im1, re2) re1*im2 + im1*re2
#define re_mul(re1, re2, im1, im2) __vnmls(re1,re2 , im1*im2)
#define im_mul(re1, im2, im1, re2) __vmla(re1,im2 , im1*re2)

static bool _inverse = false;
cfft::cfft( const std::size_t N_,
            const bool inverse , const Lc3Config&cfg)
    : Lc3Base(cfg), N(N_)
    , _twiddles((cpx_t*&)cfg._cfft_tbl)
    //, _inverse(inverse)   
{
    _inverse = inverse;
    // fill twiddle factors
    if (!_twiddles)_twiddles = create_twiddles();
    
    //factorize
    //start factoring out 4's, then 2's, then 3,5,7,9,...
    std::size_t n= N;
    std::size_t p=4;
    std::size_t f = 1;
    int size = 16;
    _stageCount = 0;
    //
    do {
        while (n % p) {
            switch (p) {
                case 4: p = 2; break;
                case 2: p = 3; break;
                default: p += 2; break;
            }
            if (p*p>n)
                p = n;// no more factors
        }
        n /= p;
        _stageParas[_stageCount] = (p) | (n << 8) | (f << 16);
        f *= p;
        _stageCount++;
    }while(n>1);
    //
    _stackCount = 0;
    transform_stack();
}
cfft::~cfft() {
    Free(_twiddles);
}
#if 0
void cfft::transform(const cpx_t * fft_in
    , cpx_t * fft_out
    , const std::size_t stage
    , const std::size_t fstride
    , const std::size_t in_stride
) const
{    
    //const std::size_t p = _stageRadix[stage];
    //const std::size_t m = _stageRemainder[stage];
    int8x4 paras;
    paras.u32 = _stageParas[stage];
    const auto p = paras.u8[0];
    const auto m = paras.u8[1];
    cpx_t * const Fout_beg = fft_out;
    cpx_t * const Fout_end = fft_out + p*m;

    auto skip = fstride * in_stride;
    if (m==1) {//dbgCodecCp();
        do{
            *fft_out = *fft_in;
            fft_in += skip;//fstride * in_stride;
            fft_out++;
        }while(fft_out != Fout_end );
    }else{
        do{
            // recursive call:
            // DFT of size m*p performed by doing
            // p instances of smaller DFTs of size m,
            // each one takes a decimated version of the input
            transform(fft_in, fft_out, stage+1, fstride*p,in_stride);
            fft_in += skip;// fstride* in_stride;
            fft_out += m;
        }while( fft_out != Fout_end );
    }

    fft_out=Fout_beg;
    //dbgCodecCp();
    // recombine the p smaller DFTs
    switch (p) {
        case 2: kf_bfly2(fft_out,fstride,m); break;
        case 3: kf_bfly3(fft_out,fstride,m); break;
        case 4: kf_bfly4(fft_out,fstride,m); break;
        case 5: kf_bfly5(fft_out,fstride,m); break;
        default: kf_bfly_generic(fft_out,fstride,m,p); break;
    }
    //printf("[%p]\n");
    //printf("[%p]%p,%p,%04x,%4x,%04x,%d,%d\n", &fft_in, fft_in-_inbuf, fft_out-_outbuf, stage, fstride, in_stride,m,p);
}  
#endif
void cfft::transform_stack(int fft_in
    , int fft_out
    , int stage    
)
{
    int8x4 paras;
    paras.u32 = _stageParas[stage];
    const auto p = paras.u8[0];
    const auto m = paras.u8[1];
    const auto fstride = paras.u8[2];
    //const auto in_stride = 1;
    if (m == 1) {//dbgCodecCp();

    }
    else {
        auto in = fft_in;
        auto out = fft_out;
        auto end = fft_out + p * m;
        //auto fstr = fstride * p;
        auto skip = fstride;// *in_stride;
        do {
            // recursive call:
            // DFT of size m*p performed by doing
            // p instances of smaller DFTs of size m,
            // each one takes a decimated version of the input
            transform_stack(in, out, stage + 1);
            in += skip;
            out += m;
        } while (out != end);
    }
    //printf("[%p]\n");
    uint32_t para = ((uint32_t)(fft_in)) | ((uint32_t)(fft_out) << 8) | (stage << 16) | (fstride << 24);
    //uint32_t para = ((uint32_t)(fin_beg)) | ((uint32_t)(Fout_beg) << 8) | (fstride<<24) | (m << 4) | (p);
    //printf("[%p,%08x,%d]%4x,%4x,%4x,%4x,%4x\n", &fft_in, para, stage, fft_in, fft_out,  fstride, m,p);
    _stack[_stackCount++] = para;
}

static inline void kf_bfly2(cfft::cpx_t* Fout, cfft::cpx_t* _twiddles, const size_t fstride, const std::size_t m)
{dbgCodecCp();
    size_t mk = m;
    int ti = 0;
    for (std::size_t k=0; k<m; ++k, ++mk, ti += fstride) {
        //const cpx_t t = Fout[mk] * _twiddles[ti];
        //Fout[mk] = Fout[k] - t;
        //Fout[k] += t;
        const float t_re = re_mul(Fout[mk].re, _twiddles[ti].re, Fout[mk].im, _twiddles[ti].im);
        const float t_im = im_mul(Fout[mk].re, _twiddles[ti].im, Fout[mk].im, _twiddles[ti].re);
        Fout[mk].re = Fout[k].re - t_re;
        Fout[mk].im = Fout[k].im - t_im;
        Fout[k].re += t_re;
        Fout[k].im += t_im;
    }
}

static inline void kf_bfly3(cfft::cpx_t* Fout, cfft::cpx_t* _twiddles, const std::size_t fstride, const std::size_t m)
{dbgCodecCp();
    std::size_t k=m;
    //const std::size_t m2 = 2*m;
    const std::size_t m2 = m << 1; // 2*m
    auto tw1 = &_twiddles[0];
    auto tw2 = &_twiddles[0];
    //cpx_t scratch[5];
    const auto epi3 = _twiddles[fstride*m];
    const auto epi3imag = epi3.im;
    //
    size_t fstride2 = fstride << 1; //fstride*2
    do{
        //auto scratch1 = Fout[m]  * *tw1;
        //auto scratch2 = Fout[m2] * *tw2;
        auto scratch1_re = re_mul(Fout[m].re, tw1->re, Fout[m].im, tw1->im);
        auto scratch1_im = im_mul(Fout[m].re, tw1->im, Fout[m].im, tw1->re);
        auto scratch2_re = re_mul(Fout[m2].re, tw2->re, Fout[m2].im, tw2->im);
        auto scratch2_im = im_mul(Fout[m2].re, tw2->im, Fout[m2].im, tw2->re);

        //auto scratch3 = scratch1 + scratch2;
        auto scratch3_re = scratch1_re + scratch2_re;
        auto scratch3_im = scratch1_im + scratch2_im;
        //auto scratch0 = scratch1 - scratch2;
        auto scratch0_re = scratch1_re - scratch2_re;
        auto scratch0_im = scratch1_im - scratch2_im;
        tw1 += fstride;
        tw2 += fstride2;

        //Fout[m] = Fout[0] - scratch3*scalar_t(0.5f);
        Fout[m].re = Fout[0].re - scratch3_re * 0.5f;
        Fout[m].im = Fout[0].im - scratch3_im * 0.5f;

        //scratch0 *= epi3imag;
        scratch0_re *= epi3imag;
        scratch0_im *= epi3imag;

        //Fout[0] += scratch3;
        Fout[0].re = Fout[0].re + scratch3_re;
        Fout[0].im = Fout[0].im + scratch3_im;

        //Fout[m2] = cpx_t(  Fout[m].real() + scratch0.imag() , Fout[m].imag() - scratch0.real() );
        Fout[m2].re = Fout[m].re + scratch0_im;
        Fout[m2].im = Fout[m].im - scratch0_re;

        //Fout[m] += cpx_t( -scratch0.imag(),scratch0.real() );
        Fout[m].re -= scratch0_im;
        Fout[m].im += scratch0_re;
        ++Fout;
    }while(--k);
}

static inline void kf_bfly4(cfft::cpx_t* const Fout, cfft::cpx_t* _twiddles, const std::size_t fstride, const std::size_t m)
{dbgCodecCp();

    size_t m2 = m << 1; //m*2
    size_t m3 = m2 + m;// m * 3;
    size_t kf = 0;
    for (std::size_t k=0;k<m;++k) {
        size_t kfstride = kf; kf += fstride;//k * fstride;
        size_t kfstride2 = kfstride;
        //auto scratch0 = Fout[k + m] * _twiddles[kfstride];
        //kfstride += kfstride2;
        //auto scratch1 = Fout[k + m2] * _twiddles[kfstride];
        //kfstride += kfstride2;
        //auto scratch2 = Fout[k + m3] * _twiddles[kfstride];
        //auto scratch5 = Fout[k] - scratch1;
        auto scratch0_re = re_mul(Fout[k+m].re, _twiddles[kfstride].re, Fout[k+m].im, _twiddles[kfstride].im);
        auto scratch0_im = im_mul(Fout[k+m].re, _twiddles[kfstride].im, Fout[k+m].im, _twiddles[kfstride].re);
        kfstride += kfstride2;
        auto scratch1_re = re_mul(Fout[k+m2].re, _twiddles[kfstride].re, Fout[k+m2].im, _twiddles[kfstride].im);
        auto scratch1_im = im_mul(Fout[k+m2].re, _twiddles[kfstride].im, Fout[k+m2].im, _twiddles[kfstride].re);
        kfstride += kfstride2;
        auto scratch2_re = re_mul(Fout[k+m3].re, _twiddles[kfstride].re, Fout[k+m3].im, _twiddles[kfstride].im);
        auto scratch2_im = im_mul(Fout[k+m3].re, _twiddles[kfstride].im, Fout[k+m3].im, _twiddles[kfstride].re);
        auto scratch5_re = Fout[k].re - scratch1_re;
        auto scratch5_im = Fout[k].im - scratch1_im;

        //Fout[k] += scratch1;
        Fout[k].re += scratch1_re;
        Fout[k].im += scratch1_im;
        //auto scratch3 = scratch0 + scratch2;
        //auto scratch4 = scratch0 - scratch2;
        auto scratch3_re = scratch0_re + scratch2_re;
        auto scratch3_im = scratch0_im + scratch2_im;
        auto scratch4_re = scratch0_re - scratch2_re;
        auto scratch4_im = scratch0_im - scratch2_im;

        //scratch4 = _inverse? cpx_t(-scratch4.imag(), scratch4.real()): cpx_t(scratch4.imag(), -scratch4.real());
        auto tmp = scratch4_re;
        scratch4_re = _inverse ? -scratch4_im : scratch4_im;
        scratch4_im = _inverse ? tmp : -tmp;

        //Fout[k + m2]  = Fout[k] - scratch3;
        //Fout[k]      += scratch3;
        //Fout[k + m]   = scratch5 + scratch4;
        //Fout[k + m3]  = scratch5 - scratch4;
        Fout[k + m2].re = Fout[k].re - scratch3_re;
        Fout[k + m2].im = Fout[k].im - scratch3_im;
        Fout[k].re     += scratch3_re;
        Fout[k].im     += scratch3_im;
        Fout[k + m].re  = scratch5_re + scratch4_re;
        Fout[k + m].im  = scratch5_im + scratch4_im;
        Fout[k + m3].re = scratch5_re - scratch4_re;
        Fout[k + m3].im = scratch5_im - scratch4_im;
    }
}

static inline void kf_bfly5(cfft::cpx_t* const Fout, cfft::cpx_t* _twiddles, const std::size_t fstride, const std::size_t m)
{dbgCodecCp();

    std::size_t fstridem = fstride*m;
    const auto ya = _twiddles[fstridem];
    const auto yb = _twiddles[fstridem << 1];// fstridem*2

    auto Fout0 = Fout;
    auto Fout1 = Fout0+m;
    auto Fout2 = Fout1+m;
    auto Fout3 = Fout2+m;
    auto Fout4 = Fout3+m;

    size_t uf = 0;
    for ( std::size_t u=0; u<m; ++u ) {
        size_t ufstride = uf; uf += fstride;//u * fstride;
        size_t ufstride0 = ufstride;
        //auto scratch0 = *Fout0;
        //scratch1] = *Fout1 * _twiddles[  u*fstride];
        //scratch2] = *Fout2 * _twiddles[2*u*fstride];
        //scratch3] = *Fout3 * _twiddles[3*u*fstride];
        //scratch4] = *Fout4 * _twiddles[4*u*fstride];
        //auto scratch1 = *Fout1 * _twiddles[ufstride];
        //ufstride += ufstride0;
        //auto scratch2 = *Fout2 * _twiddles[ufstride];
        //ufstride += ufstride0;
        //auto scratch3 = *Fout3 * _twiddles[ufstride];
        //ufstride += ufstride0;
        //auto scratch4 = *Fout4 * _twiddles[ufstride];
        auto scratch0_re = Fout0->re;
        auto scratch0_im = Fout0->im;
        auto scratch1_re = re_mul(Fout1->re, _twiddles[ufstride].re, Fout1->im, _twiddles[ufstride].im);
        auto scratch1_im = im_mul(Fout1->re, _twiddles[ufstride].im, Fout1->im, _twiddles[ufstride].re);
        ufstride += ufstride0;
        auto scratch2_re = re_mul(Fout2->re, _twiddles[ufstride].re, Fout2->im, _twiddles[ufstride].im);
        auto scratch2_im = im_mul(Fout2->re, _twiddles[ufstride].im, Fout2->im, _twiddles[ufstride].re);
        ufstride += ufstride0;
        auto scratch3_re = re_mul(Fout3->re, _twiddles[ufstride].re, Fout3->im, _twiddles[ufstride].im);
        auto scratch3_im = im_mul(Fout3->re, _twiddles[ufstride].im, Fout3->im, _twiddles[ufstride].re);
        ufstride += ufstride0;
        auto scratch4_re = re_mul(Fout4->re, _twiddles[ufstride].re, Fout4->im, _twiddles[ufstride].im);
        auto scratch4_im = im_mul(Fout4->re, _twiddles[ufstride].im, Fout4->im, _twiddles[ufstride].re);

        //auto scratch7 = scratch1 + scratch4;
        //auto scratch10= scratch1 - scratch4;
        //auto scratch8 = scratch2 + scratch3;
        //auto scratch9 = scratch2 - scratch3;
        auto scratch7_re  = scratch1_re + scratch4_re;
        auto scratch7_im  = scratch1_im + scratch4_im;
        auto scratch10_re = scratch1_re - scratch4_re;
        auto scratch10_im = scratch1_im - scratch4_im;
        auto scratch8_re = scratch2_re + scratch3_re;
        auto scratch8_im = scratch2_im + scratch3_im;
        auto scratch9_re = scratch2_re - scratch3_re;
        auto scratch9_im = scratch2_im - scratch3_im;

        //*Fout0 += scratch7;
        //*Fout0 += scratch8;
        Fout0->re += scratch7_re + scratch8_re;
        Fout0->im += scratch7_im + scratch8_im;

        //cpx_t scratch5{
        //    //scratch0.real() + scratch7.real()*ya.real() + scratch8.real()*yb.real(),
        //    __vmla(scratch7_re , ya.re, __vmla(scratch8_re , yb.re, scratch0_re)),
        //    //scratch0.imag() + scratch7.imag()*ya.real() + scratch8.imag()*yb.real()
        //    __vmla(scratch7_im , ya.re , __vmla(scratch8_im , yb.re, scratch0_im))
        //};

        //cpx_t scratch6{
        //    //scratch10.imag()*ya.imag() + scratch9.imag()*yb.imag(),
        //    __vmla(scratch10_im , ya.im , scratch9_im * yb.im),
        //    //-scratch10.real()*ya.imag() - scratch9.real()*yb.imag()
        //    __vnmla(scratch10_re , ya.im , scratch9_re * yb.im)
        //};

        auto scratch5_re = __vmla(scratch7_re, ya.re, __vmla(scratch8_re, yb.re, scratch0_re));
        auto scratch5_im = __vmla(scratch7_im, ya.re, __vmla(scratch8_im, yb.re, scratch0_im));
        auto scratch6_re = __vmla(scratch10_im, ya.im, scratch9_im * yb.im);
        auto scratch6_im = __vnmla(scratch10_re, ya.im, scratch9_re * yb.im);
        //*Fout1 = scratch5 - scratch6;
        //*Fout4 = scratch5 + scratch6;
        Fout1->re = scratch5_re - scratch6_re;
        Fout1->im = scratch5_im - scratch6_im;
        Fout4->re = scratch5_re + scratch6_re;
        Fout4->im = scratch5_im + scratch6_im;

        //cpx_t scratch11{
        //    //scratch0.real() + scratch7.real() * yb.real() + scratch8.real() * ya.real(),
        //    __vmla(scratch7.real() , yb.real() , __vmla(scratch8.real() , ya.real(), scratch0.real())),
        //    //scratch0.imag() + scratch7.imag() * yb.real() + scratch8.imag() * ya.real()
        //    __vmla(scratch7.imag() , yb.real() , __vmla(scratch8.imag() , ya.real() , scratch0.imag()))
        //};

        //cpx_t scratch12{
        //    //-scratch10.imag()*yb.imag() + scratch9.imag()*ya.imag(),
        //    __vmls(scratch10.imag(), yb.imag() , scratch9.imag()*ya.imag()),
        //    //scratch10.real()*yb.imag() - scratch9.real()*ya.imag()
        //    __vnmls(scratch10.real(),yb.imag() , scratch9.real()*ya.imag())
        //    };
        auto scratch11_re = __vmla(scratch7_re, yb.re, __vmla(scratch8_re, ya.re, scratch0_re));
        auto scratch11_im = __vmla(scratch7_im, yb.re, __vmla(scratch8_im, ya.re, scratch0_im));
        auto scratch12_re = __vmls(scratch10_im, yb.im, scratch9_im*ya.im);
        auto scratch12_im = __vnmls(scratch10_re, yb.im, scratch9_re*ya.im);

        //*Fout2 = scratch11 + scratch12;
        //*Fout3 = scratch11 - scratch12;
        Fout2->re = scratch11_re + scratch12_re;
        Fout2->im = scratch11_im + scratch12_im;
        Fout3->re = scratch11_re - scratch12_re;
        Fout3->im = scratch11_im - scratch12_im;

        ++Fout0;
        ++Fout1;
        ++Fout2;
        ++Fout3;
        ++Fout4;
    }
}

/* perform the butterfly for one stage of a mixed radix FFT */
static inline void kf_bfly_generic(
    cfft::cpx_t* const Fout,
    cfft::cpx_t* _twiddles,
    const size_t fstride,
    const std::size_t m,
    const std::size_t p
    )
{
    assert(0);
#if 0
    dbgCodecCp();
    auto twiddles = &_twiddles[0];

    if(p > _scratchbuf.size()) _scratchbuf.resize(p);

    for ( std::size_t u=0; u<m; ++u ) {
        std::size_t k = u;
        for ( std::size_t q1=0 ; q1<p ; ++q1 ) {
            _scratchbuf[q1] = Fout[ k  ];
            k += m;
        }

        k=u;
        for ( std::size_t q1=0 ; q1<p ; ++q1 ) {
            std::size_t twidx=0;
            auto sum = _scratchbuf[0];
            int fs = fstride * k;
            for ( std::size_t q=1;q<p;++q ) {
                //twidx += fstride * k;
                twidx += fs;
                if (twidx>=N)
                    twidx-=N;
                //Fout[ k ] += _scratchbuf[q] * twiddles[twidx];
                //cpx_t::mla(_scratchbuf[q], twiddles[twidx], sum);
                auto a = _scratchbuf[q];
                auto b = twiddles[twidx];
                auto v0 = __vmla(a.re, b.re, sum.re);
                sum.re = __vmls(a.im, b.im, v0);
                auto v1 = __vmla(a.re, b.im, sum.im);
                sum.im = __vmla(a.im, b.re, v1);
            }
            Fout[k] = sum;
            k += m;
        }
    }
#endif
}
void cfft::transform(const cpx_t* inbuf, cpx_t* outbuf) {dbgCodecCp();
    for (int i = 0; i < _stackCount; i++) {
        int8x4 paras;
        paras.u32 = _stack[i];
        const auto fft_in = inbuf + paras.u8[0];
        const auto fft_out = outbuf + paras.u8[1];
        const auto stage = paras.u8[2];
        //const auto in_stride = 1;
        //
        paras.u32 = _stageParas[stage];
        const auto p = paras.u8[0];
        const auto m = paras.u8[1];
        const auto fstride = paras.u8[2];
        //
        if (m == 1) {//dbgCodecCp();
            auto in = fft_in;
            auto out = fft_out;
            auto end = fft_out + p * m;
            auto skip = fstride;// *in_stride;
            do {
                *out = *in;
                in += skip;
                out++;
            } while (out != end);
        }
        //dbgCodecCp();
        // recombine the p smaller DFTs
        switch (p) {
        case 2: kf_bfly2(fft_out, _twiddles, fstride, m); break;
        case 3: kf_bfly3(fft_out, _twiddles, fstride, m); break;
        case 4: kf_bfly4(fft_out, _twiddles, fstride, m); break;
        case 5: kf_bfly5(fft_out, _twiddles, fstride, m); break;
        default: kf_bfly_generic(fft_out, _twiddles, fstride, m, p); break;
        }
    }
}

cfft::cpx_t* cfft::create_twiddles() {
    auto twiddles = AllocT<cpx_t>(N);
    if (!twiddles)return 0;
    //const scalar_t phinc =  (_inverse?2:-2)* std::acos( (scalar_t) -1)  / N;
    const scalar_t phinc = (_inverse ? 2 : -2) * PI / N;
    for (std::size_t i = 0; i < N; ++i) {
        //_twiddles[i] = exp(cpx_t(0, i*phinc));
        auto tmp = exp(std::complex<float>(0, i * phinc));
        twiddles[i].re = tmp.real();
        twiddles[i].im = tmp.imag();
        //printf("{%ff,%ff},", tmp.real(), tmp.imag());
        //if ((i & 3) == 3)printf("\n");
    }
    return twiddles;
}
#if 0
cfft::cpx_t* cfft::create_twiddles() {
    static const cpx_t _twiddles_240[]{
        {1.000000f,0.000000f},{0.999657f,-0.026177f},{0.998630f,-0.052336f},{0.996917f,-0.078459f},
        {0.994522f,-0.104528f},{0.991445f,-0.130526f},{0.987688f,-0.156434f},{0.983255f,-0.182236f},
        {0.978148f,-0.207912f},{0.972370f,-0.233445f},{0.965926f,-0.258819f},{0.958820f,-0.284015f},
        {0.951057f,-0.309017f},{0.942641f,-0.333807f},{0.933580f,-0.358368f},{0.923880f,-0.382683f},
        {0.913545f,-0.406737f},{0.902585f,-0.430511f},{0.891007f,-0.453991f},{0.878817f,-0.477159f},
        {0.866025f,-0.500000f},{0.852640f,-0.522499f},{0.838671f,-0.544639f},{0.824126f,-0.566406f},
        {0.809017f,-0.587785f},{0.793353f,-0.608761f},{0.777146f,-0.629320f},{0.760406f,-0.649448f},
        {0.743145f,-0.669131f},{0.725374f,-0.688355f},{0.707107f,-0.707107f},
    };
    const cpx_t* twiddles_tbl = 0;
    switch (N) {
    case 240:twiddles_tbl = _twiddles_240; break;
    default:return 0;
    }
    auto twiddles = AllocT<cpx_t>(N);
    if (!twiddles)return 0;
    auto N41 = N >> 2;
    auto N42 = N41 << 1;
    auto N43 = N41 + N42;
    for (auto i = 0; i < N / 8 + 1; i++) {
        auto item = twiddles_tbl[i];
        twiddles[i] = item;
        twiddles[N41 - i].re = -item.im;
        twiddles[N41 - i].im = -item.re;
        //
        twiddles[N41 + i].re = item.im;
        twiddles[N41 + i].im = -item.re;
        twiddles[N42 - i].re = -item.re;
        twiddles[N42 - i].im = item.im;
        //
        twiddles[N42 + i].re = -item.re;
        twiddles[N42 + i].im = -item.im;
        twiddles[N43 - i].re = item.im;
        twiddles[N43 - i].im = item.re;
        //
        twiddles[N43 + i].re = -item.im;
        twiddles[N43 + i].im = item.re;
        twiddles[N - i].re = item.re;
        twiddles[N - i].im = -item.im;
    }
    //
    //for (auto i = 0; i < N; i++) {
    //    if (std::abs(twiddles[i].re - _twiddles[i].re) > 0.000001f
    //        || std::abs(twiddles[i].im - _twiddles[i].im) > 0.000001f) {
    //        printf("%d:(%f,%f)!=(%f,%f)\n", i, twiddles[i].re, twiddles[i].im, _twiddles[i].re, _twiddles[i].im);
    //    }
    //}
    return twiddles;
}
#endif