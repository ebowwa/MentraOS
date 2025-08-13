
#include "defines.h"
#include "functions.h"


int16_t
plc_phEcuSetF0Hz(/*  output Q7  bin frequency [0.. 255.xxxx]  "1 sign, 8 bits mantissa, 7 binomial"  [0-255.9999]  */
                    int16_t fs_idx, int16_t old_pitch_int, int16_t old_pitch_fr)
{
    int16_t pitch_lagQ2, result, expo;
    int32_t L_result, L_tmp;

    //TRACE("PhECU::plc_phEcuSetF0Hz");

    result = 0; 
    if (old_pitch_int != 0)
    {
        pitch_lagQ2 = old_pitch_fr + shl(old_pitch_int, 2); /* lag at the current fs_idx , max lag_value is is 228(+.75)*48/12.8 = 858 in Q0 */

        L_result = plc_phEcu_ratio(L_deposit_h(num_FsByResQ0[fs_idx]), L_deposit_h(pitch_lagQ2), &expo);
        L_tmp = L_shl_sat(L_result, (11 - expo)); /* move to Q7, in high word to allow round*/
        result = round_fx(L_tmp);
    }    

    return result; /*Q7*/
}


