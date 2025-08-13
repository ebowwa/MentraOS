#include "DctIV.hpp"
#include <cmath>
#include "Lc3Base.h"
#include "cfft.hh"

using namespace sneak;

 //#define re_mul(re1, re2, im1, im2) re1*re2 - im1*im2
 //#define im_mul(re1, im2, im1, re2) re1*im2 + im1*re2
#define re_mul(re1, re2, im1, im2) __vnmls(re1,re2 , im1*im2)
#define im_mul(re1, im2, im1, re2) __vmla(re1,im2 , im1*re2)

#define re_mul_01(re1, re2, im1, im2) -im1*im2
#define re_mul_10(re1, re2, im1, im2) re1*re2
#define im_mul_01(re1, im2, im1, re2) im1*re2
#define im_mul_10(re1, im2, im1, re2) re1*im2
#define re_mul_00(re1, im2, im1, re2) 0
#define im_mul_00(re1, im2, im1, re2) 0
#define re_mul_11(re1, re2, im1, im2) __vnmls(re1,re2 , im1*im2)
#define im_mul_11(re1, im2, im1, re2) __vmla(re1,im2 , im1*re2)


DctIV::DctIV(uint16_t NF_, const Lc3Config& cfg) :Lc3Base(cfg)
    , _gain(2.f)
    , N(NF_ / 2)
    , _fft(N,false,cfg) 
    , _twiddle((cpx_t*&)cfg._dctIV_tbl)
{
    //_twiddle = create_twiddle0();
    if(!_twiddle)
        _twiddle = create_twiddle0();
}

DctIV::~DctIV(){
    //Free(_twiddle_buff);
    Free(_twiddle);
}

void DctIV::run(const float* const in, float* out, float* temp, int lastnz0) {dbgCodecCp();
    auto lastnz = lastnz0 >> 1;
    uint16_t N_2 = N >> 1; 
    uint16_t N2_1 = (N << 1) - 1; 
    cpx_t* fftin = (cpx_t*)out;
    cpx_t* fftout = (cpx_t*)temp;
    auto twiddle = _twiddle;
    if (!lastnz || lastnz == N) {
        for (uint16_t n = 0; n < N; n++) {
            int n2 = n << 1; //2*n
            //fftin[n] = twiddle[n] * cpx_t(in[n2], in[N2_1 - n2]);
            fftin[n].re = re_mul(twiddle[n].re, in[n2], twiddle[n].im, in[N2_1 - n2]);
            fftin[n].im = im_mul(twiddle[n].re, in[N2_1 - n2], twiddle[n].im, in[n2]);
        }
    }
    else {
        if (lastnz > (N >> 1)) {
            int nn = N - lastnz;
            int n = 0;
            for (; n < nn; n++) {
                int n2 = n << 1; //2*n
                //fftin[n] = twiddle[n] * cpx_t(in[n2], in[N2_1 - n2]);
                //fftin[n].re = re_mul_10(twiddle[n].re, in[n2], twiddle[n].im, 0);
                //fftin[n].im = im_mul_01(twiddle[n].re, 0, twiddle[n].im, in[n2]);
                fftin[n].re = re_mul_10(twiddle[n].re, in[n2], twiddle[n].im, in[N2_1 - n2]);
                fftin[n].im = im_mul_01(twiddle[n].re, in[N2_1 - n2], twiddle[n].im, in[n2]);
            }
            nn = lastnz;
            for (; n < nn; n++) {
                int n2 = n << 1; //2*n
                //fftin[n] = twiddle[n] * cpx_t(in[n2], in[N2_1 - n2]);
                //fftin[n].re = re_mul(twiddle[n].re, in[n2], twiddle[n].im, in[N2_1 - n2]);
                //fftin[n].im = im_mul(twiddle[n].re, in[N2_1 - n2], twiddle[n].im, in[n2]);
                fftin[n].re = re_mul_11(twiddle[n].re, in[n2], twiddle[n].im, in[N2_1 - n2]);
                fftin[n].im = im_mul_11(twiddle[n].re, in[N2_1 - n2], twiddle[n].im, in[n2]);
            }
            nn = N;
            for (; n < nn; n++) {
                int n2 = n << 1; //2*n
                //fftin[n] = twiddle[n] * cpx_t(in[n2], in[N2_1 - n2]);
                //fftin[n].re = re_mul_01(twiddle[n].re, 0, twiddle[n].im, in[N2_1 - n2]);
                //fftin[n].im = im_mul_10(twiddle[n].re, in[N2_1 - n2], twiddle[n].im, 0);
                fftin[n].re = re_mul_01(twiddle[n].re, in[n2], twiddle[n].im, in[N2_1 - n2]);
                fftin[n].im = im_mul_10(twiddle[n].re, in[N2_1 - n2], twiddle[n].im, in[n2]);
            }
        }
        else {
            int nn = lastnz;
            int n = 0;
            for (; n < nn; n++) {
                int n2 = n << 1; //2*n
                //fftin[n] = twiddle[n] * cpx_t(in[n2], in[N2_1 - n2]);
                //fftin[n].re = re_mul_10(twiddle[n].re, in[n2], twiddle[n].im, 0);
                //fftin[n].im = im_mul_01(twiddle[n].re, 0, twiddle[n].im, in[n2]);
                fftin[n].re = re_mul_10(twiddle[n].re, in[n2], twiddle[n].im, in[N2_1 - n2]);
                fftin[n].im = im_mul_01(twiddle[n].re, in[N2_1 - n2], twiddle[n].im, in[n2]);
            }
            nn = N - lastnz;
            for (; n < nn; n++) {
                int n2 = n << 1; //2*n
                //fftin[n] = twiddle[n] * cpx_t(in[n2], in[N2_1 - n2]);
                //fftin[n].re = 0;// re_mul(twiddle[n].re, 0, twiddle[n].im, 0);
                //fftin[n].im = 0;// im_mul(twiddle[n].re, 0, twiddle[n].im, 0);
                fftin[n].re = re_mul_00(twiddle[n].re, in[n2], twiddle[n].im, in[N2_1 - n2]);
                fftin[n].im = im_mul_00(twiddle[n].re, in[N2_1 - n2], twiddle[n].im, in[n2]);
            }
            nn = N;
            for (; n < nn; n++) {
                int n2 = n << 1; //2*n
                //fftin[n] = twiddle[n] * cpx_t(in[n2], in[N2_1 - n2]);
                //fftin[n].re = re_mul_01(twiddle[n].re, 0, twiddle[n].im, in[N2_1 - n2]);
                //fftin[n].im = im_mul_10(twiddle[n].re, in[N2_1 - n2], twiddle[n].im, 0);
                fftin[n].re = re_mul_01(twiddle[n].re, in[n2], twiddle[n].im, in[N2_1 - n2]);
                fftin[n].im = im_mul_10(twiddle[n].re, in[N2_1 - n2], twiddle[n].im, in[n2]);
            }
        }
    }
    //
    //transform(_inbuf, _outbuf);
    _fft.transform(fftin, fftout);
    //
    for (uint16_t n = 0; n < N; n++) {
        //cpx_t complexOut = twiddle[n] * _outbuf[n];
        auto complexOut_re = re_mul(twiddle[n].re, fftout[n].re, twiddle[n].im, fftout[n].im);
        auto complexOut_im = im_mul(twiddle[n].re, fftout[n].im, twiddle[n].im, fftout[n].re);
        int n2 = n << 1; //2*n
        out[n2] = complexOut_re;
        out[N2_1 - n2] = -complexOut_im;
        //out[NF-n2-1] = __vnmul(complexOut.imag(), 2.f);
    }
}


DctIV::cpx_t* DctIV::create_twiddle0() {
    auto twiddle = AllocT<cpx_t>(N);
    if (!twiddle)return 0;
    //_twiddle_buff = twiddle;
    float PI_8n_1 = -PI / (N * (8 * 2));
    float PIx8 = PI * 8.0f / (N * (8 * 2));
    for (uint16_t n = 0; n < N; n++) {
        //_twiddle[n] = cpx_t(cos(PI_8n_1), sin(PI_8n_1));
        twiddle[n].re = cos(PI_8n_1);
        twiddle[n].im = sin(PI_8n_1);
        PI_8n_1 -= PIx8;

        //printf("{%ff,%ff},", twiddle[n].re, twiddle[n].im);
        //if ((n & 3) == 3)printf("\n");
    }
    return twiddle;
}

#if 0
DctIV::cpx_t* DctIV::create_twiddle() {
    static const cpx_t _twiddle_240[] = {
        {1.000000f,-0.000818f},{0.999973f,-0.007363f},{0.999903f,-0.013908f},{0.999791f,-0.020452f},
        {0.999636f,-0.026995f},{0.999438f,-0.033537f},{0.999197f,-0.040077f},{0.998913f,-0.046616f},
        {0.998586f,-0.053153f},{0.998217f,-0.059687f},{0.997805f,-0.066219f},{0.997350f,-0.072749f},
        {0.996853f,-0.079275f},{0.996313f,-0.085797f},{0.995730f,-0.092316f},{0.995104f,-0.098831f},
        {0.994436f,-0.105342f},{0.993725f,-0.111848f},{0.992972f,-0.118350f},{0.992176f,-0.124846f},
        {0.991338f,-0.131337f},{0.990457f,-0.137823f},{0.989534f,-0.144302f},{0.988568f,-0.150776f},
        {0.987560f,-0.157242f},{0.986510f,-0.163703f},{0.985417f,-0.170156f},{0.984282f,-0.176602f},
        {0.983105f,-0.183040f},{0.981886f,-0.189470f},{0.980625f,-0.195893f},{0.979322f,-0.202307f},
        {0.977977f,-0.208712f},{0.976590f,-0.215108f},{0.975161f,-0.221495f},{0.973691f,-0.227873f},
        {0.972179f,-0.234241f},{0.970625f,-0.240598f},{0.969029f,-0.246946f},{0.967392f,-0.253283f},
        {0.965714f,-0.259609f},{0.963994f,-0.265924f},{0.962233f,-0.272228f},{0.960431f,-0.278520f},
        {0.958587f,-0.284799f},{0.956703f,-0.291067f},{0.954777f,-0.297323f},{0.952811f,-0.303565f},
        {0.950803f,-0.309795f},{0.948756f,-0.316011f},{0.946667f,-0.322214f},{0.944538f,-0.328403f},
        {0.942368f,-0.334578f},{0.940158f,-0.340738f},{0.937908f,-0.346884f},{0.935618f,-0.353015f},
        {0.933287f,-0.359131f},{0.930917f,-0.365232f},{0.928506f,-0.371317f},{0.926056f,-0.377386f},
        {0.923566f,-0.383439f},{0.921037f,-0.389475f},{0.918468f,-0.395495f},{0.915860f,-0.401498f},
        {0.913213f,-0.407484f},{0.910526f,-0.413452f},{0.907800f,-0.419402f},{0.905036f,-0.425335f},
        {0.902233f,-0.431249f},{0.899391f,-0.437145f},{0.896511f,-0.443022f},{0.893592f,-0.448880f},
        {0.890635f,-0.454719f},{0.887640f,-0.460538f},{0.884607f,-0.466338f},{0.881536f,-0.472118f},
        {0.878427f,-0.477877f},{0.875280f,-0.483616f},{0.872096f,-0.489335f},{0.868875f,-0.495032f},
        {0.865616f,-0.500708f},{0.862321f,-0.506363f},{0.858988f,-0.511996f},{0.855619f,-0.517607f},
        {0.852213f,-0.523196f},{0.848770f,-0.528762f},{0.845291f,-0.534306f},{0.841776f,-0.539827f},
        {0.838225f,-0.545325f},{0.834638f,-0.550799f},{0.831015f,-0.556250f},{0.827356f,-0.561677f},
        {0.823663f,-0.567080f},{0.819933f,-0.572459f},{0.816169f,-0.577813f},{0.812370f,-0.583143f},
        {0.808536f,-0.588447f},{0.804667f,-0.593726f},{0.800764f,-0.598980f},{0.796827f,-0.604208f},
        {0.792855f,-0.609410f},{0.788849f,-0.614587f},{0.784810f,-0.619736f},{0.780737f,-0.624860f},
        {0.776631f,-0.629956f},{0.772491f,-0.635026f},{0.768318f,-0.640068f},{0.764113f,-0.645083f},
        {0.759874f,-0.650070f},{0.755603f,-0.655030f},{0.751300f,-0.659961f},{0.746964f,-0.664864f},
        {0.742597f,-0.669739f},{0.738198f,-0.674585f},{0.733767f,-0.679402f},{0.729304f,-0.684189f},
        {0.724811f,-0.688948f},{0.720286f,-0.693677f},{0.715730f,-0.698377f},{0.711144f,-0.703046f},
        {0.706528f,-0.707685f},{0.701881f,-0.712294f},{0.697204f,-0.716873f},{0.692497f,-0.721421f},
        {0.687760f,-0.725938f},{0.682994f,-0.730424f},{0.678199f,-0.734878f},{0.673375f,-0.739301f},
        {0.668522f,-0.743693f},{0.663640f,-0.748052f},{0.658730f,-0.752379f},{0.653791f,-0.756675f},
        {0.648825f,-0.760938f},{0.643831f,-0.765168f},{0.638809f,-0.769365f},{0.633760f,-0.773530f},
        {0.628684f,-0.777661f},{0.623580f,-0.781759f},{0.618450f,-0.785824f},{0.613294f,-0.789855f},
        {0.608111f,-0.793852f},{0.602903f,-0.797815f},{0.597668f,-0.801744f},{0.592408f,-0.805638f},
        {0.587122f,-0.809498f},{0.581812f,-0.813324f},{0.576476f,-0.817114f},{0.571116f,-0.820870f},
        {0.565731f,-0.824590f},{0.560322f,-0.828275f},{0.554889f,-0.831925f},{0.549432f,-0.835538f},
        {0.543952f,-0.839117f},{0.538448f,-0.842659f},{0.532921f,-0.846165f},{0.527372f,-0.849635f},
        {0.521800f,-0.853068f},{0.516205f,-0.856465f},{0.510589f,-0.859825f},{0.504950f,-0.863148f},
        {0.499290f,-0.866435f},{0.493609f,-0.869684f},{0.487906f,-0.872896f},{0.482183f,-0.876070f},
        {0.476439f,-0.879208f},{0.470674f,-0.882307f},{0.464890f,-0.885369f},{0.459085f,-0.888392f},
        {0.453261f,-0.891378f},{0.447417f,-0.894325f},{0.441554f,-0.897235f},{0.435672f,-0.900105f},
        {0.429772f,-0.902937f},{0.423853f,-0.905731f},{0.417916f,-0.908486f},{0.411961f,-0.911201f},
        {0.405989f,-0.913878f},{0.399999f,-0.916516f},{0.393992f,-0.919114f},{0.387968f,-0.921673f},
        {0.381927f,-0.924192f},{0.375870f,-0.926672f},{0.369797f,-0.929112f},{0.363708f,-0.931513f},
        {0.357604f,-0.933873f},{0.351484f,-0.936194f},{0.345349f,-0.938474f},{0.339200f,-0.940714f},
        {0.333036f,-0.942914f},{0.326857f,-0.945074f},{0.320665f,-0.947193f},{0.314459f,-0.949271f},
        {0.308239f,-0.951309f},{0.302006f,-0.953306f},{0.295760f,-0.955262f},{0.289502f,-0.957177f},
        {0.283231f,-0.959052f},{0.276948f,-0.960885f},{0.270653f,-0.962677f},{0.264347f,-0.964428f},
        {0.258029f,-0.966137f},{0.251700f,-0.967805f},{0.245361f,-0.969432f},{0.239011f,-0.971017f},
        {0.232650f,-0.972560f},{0.226280f,-0.974062f},{0.219900f,-0.975522f},{0.213511f,-0.976941f},
        {0.207112f,-0.978317f},{0.200705f,-0.979652f},{0.194289f,-0.980944f},{0.187864f,-0.982195f},
        {0.181432f,-0.983404f},{0.174992f,-0.984570f},{0.168544f,-0.985694f},{0.162089f,-0.986776f},
        {0.155627f,-0.987816f},{0.149159f,-0.988813f},{0.142684f,-0.989768f},{0.136203f,-0.990681f},
        {0.129716f,-0.991551f},{0.123224f,-0.992379f},{0.116726f,-0.993164f},{0.110224f,-0.993907f},
        {0.103716f,-0.994607f},{0.097204f,-0.995264f},{0.090688f,-0.995879f},{0.084168f,-0.996452f},
        {0.077645f,-0.996981f},{0.071118f,-0.997468f},{0.064588f,-0.997912f},{0.058056f,-0.998313f},
        {0.051521f,-0.998672f},{0.044983f,-0.998988f},{0.038444f,-0.999261f},{0.031903f,-0.999491f},
        {0.025361f,-0.999678f},{0.018818f,-0.999823f},{0.012273f,-0.999925f},{0.005729f,-0.999984f},
    };
    _twiddle_buff = 0;
    const cpx_t* twiddle = 0;
    switch (N) {
    case 240: twiddle = _twiddle_240; break;
    default: twiddle = create_twiddle0();
    }
    return (cpx_t*)twiddle;
}
#endif