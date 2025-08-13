/*
 * MPVQ.cpp
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

#include "MPVQ.hpp"
#include <cstdbool>

#include "SnsQuantizationTables.hpp"

namespace sneak{ namespace dec
{

static inline void mind2vec_tab ( short dim_in, /* i: dimension */
                short k_max_local, /* i: nb unit pulses */
                bool isneg, /* i: leading sign */
                unsigned int ind, /* i: MPVQ-index */
                short *vec_out /* o: pulse train */               
                )
{
    for (uint8_t i = 0; i < dim_in; i++) {
        vec_out[i] = 0;
    }
    /* init */
    const unsigned int* h_row_ptr = &(MPVQ_offsets[(dim_in-1)][0]);
    short k_acc = k_max_local;
    /* loop over positions */
    for (uint8_t pos = 0; pos < dim_in; pos++){
        if (!ind){
            vec_out[pos] = isneg ? -k_max_local : k_max_local;
            break;
        }    
        //
        k_acc = k_max_local;;
        unsigned int UL_tmp_offset = h_row_ptr[k_acc];
        bool wrap_flag = (ind < UL_tmp_offset ) ;
        unsigned int UL_diff=0;
        if (!wrap_flag){
            // Note: due to android build using a integer-overflow sanitizer, we have to avoid
            //       computing the following difference when ind < UL_tmp_offset
            UL_diff = ind - UL_tmp_offset;
        }
        while (wrap_flag){
            k_acc--;
            wrap_flag = (ind < h_row_ptr[k_acc]);
            if (!wrap_flag){
                // Note: due to android build using a integer-overflow sanitizer, we have to avoid
                //       computing the following difference when ind < UL_tmp_offset
                UL_diff = ind - h_row_ptr[k_acc];
            }
        }
        ind = UL_diff;
        short k_delta = k_max_local - k_acc;
        //        
        if (k_delta != 0){
            //mind2vec_one(k_delta, *leading_sign, vec_out);
            vec_out[pos] = isneg ? -k_delta : k_delta;
            isneg = ind & 1;            
            ind >>= 1;
            k_max_local -= k_delta;
        }
        //
        h_row_ptr -= 11; /* reduce dimension in MPVQ_offsets table */
    }
}

void MPVQdeenum(uint8_t dim_in, /* i : dimension of vec_out */
    uint8_t k_val_in, /* i : number of unit pulses */
    int16_t LS_ind, /* i : leading sign index */
    int32_t MPVQ_ind, /* i : MPVQ shape index */
    int16_t* vec_out /* o : PVQ integer pulse train */
)
{
    bool isneg = LS_ind != 0;
    mind2vec_tab(dim_in,
        k_val_in,
        isneg,
        MPVQ_ind,
        vec_out
    );
}

}}//namespace 
