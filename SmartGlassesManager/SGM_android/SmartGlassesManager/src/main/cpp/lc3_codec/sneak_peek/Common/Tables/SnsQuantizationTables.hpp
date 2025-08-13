/*
 * SnsQuantizationTables.hpp
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

#ifndef SNS_QUANTIZATION_TABLES_H_
#define SNS_QUANTIZATION_TABLES_H_
#include <stdint.h>
// LC3 Specification d09r01.pdf
// Section 5.7.3 SNS Quantization

// LC3 Specification d09r04_*implementorComments*
// Section 3.7.4 SNS Quantization

// extern float LFCB[32][8];
// extern float HFCB[32][8];
extern const float sns_vq_reg_adj_gains[2];
extern const float sns_vq_reg_lf_adj_gains[4];
extern const float sns_vq_near_adj_gains[4];
extern const float sns_vq_far_adj_gains[8];
extern const int sns_gainMSBbits[4];
extern const int sns_gainLSBbits[4];
extern const unsigned int MPVQ_offsets[16][1+10];
// extern float D[16][16];
//
extern const uint32_t LFCB16[32][8];
extern const uint32_t HFCB16[32][8];
extern const uint16_t LFCB12[32][8];
extern const uint16_t HFCB12[32][8];
//extern const uint16_t LFCB8[32][8];
//extern const uint16_t HFCB8[32][8];
extern const int16_t sns_vq_reg_adj_gains_12[2];
extern const int16_t sns_vq_reg_lf_adj_gains_12[4];
extern const int16_t sns_vq_near_adj_gains_12[4];
extern const int16_t sns_vq_far_adj_gains_12[8];
extern const uint16_t D16[16][16];
extern const uint16_t D16_[16][16];

extern const float _exp2x1024[1025];
extern const float _log2x1024[1025];

#endif // SNS_QUANTIZATION_TABLES_H_
