
#include "functions.h"


void attack_detector(LC3_Enc *enc, EncSetup *setup, int16_t *input, int16_t input_scaling, void *scratch)
{
    int32_t    i, position;
    int32_t tmp, *block_energy;
    int16_t h16, l16, new_scaling, rescale, input_delta_scaling;
    int16_t scales[3], *input_16k;

    block_energy = (int32_t *)scratch;              // 4 * 4
    input_16k    = (int16_t *)(((uint8_t *)block_energy) + 4 * 4 + 4); // indexing from -2 to 159 (filter delay)

    if (setup->attack_handling)
    {
        /* input scaling */
        scales[0] = add(getScaleFactor16(input, enc->frame_length), input_scaling);
        scales[1] = add(getScaleFactor16_0(setup->attdec_filter_mem, 2), setup->attdec_scaling);
        scales[2] =
            shr(add(add(getScaleFactor32_0(&setup->attdec_acc_energy, 1), shl(setup->attdec_scaling, 1)), 1), 1);
        new_scaling = min(scales[0], min(scales[1], scales[2]));

        new_scaling = sub(new_scaling, 2); /* add overhead for resampler*/

        /* memory re-scaling */
        rescale = sub(new_scaling, setup->attdec_scaling);

        if (rescale)
        {
            setup->attdec_filter_mem[0] = shl(setup->attdec_filter_mem[0], rescale);        
            setup->attdec_filter_mem[1] = shl(setup->attdec_filter_mem[1], rescale);        
            setup->attdec_acc_energy    = L_shl(setup->attdec_acc_energy, shl(rescale, 1)); 
        }
        setup->attdec_scaling = new_scaling; 

        // resampling to 16 kHz
        switch (enc->frame_length)
        {
        case 320:
            input_delta_scaling = sub(1, sub(new_scaling, input_scaling));
            for(i = 0; i < 160; i++)
            {
                input_16k[i] = add(shr(input[2 * i + 0], input_delta_scaling),
                                   shr(input[2 * i + 1], input_delta_scaling)); 
            }
            break;
        case 480:
            input_delta_scaling = sub(2, sub(new_scaling, input_scaling));
            for(i = 0; i < 160; i++)
            {
                input_16k[i] = add(shr(input[3 * i + 0], input_delta_scaling),
                                   add(shr(input[3 * i + 1], input_delta_scaling),
                                       shr(input[3 * i + 2], input_delta_scaling))); 
            }
            break;
        default: ASSERT_LC3(0); break;
        }

        // high pass filtering
        input_16k[-2]               = setup->attdec_filter_mem[0]; 
        input_16k[-1]               = setup->attdec_filter_mem[1]; 
        setup->attdec_filter_mem[0] = input_16k[158];              
        setup->attdec_filter_mem[1] = input_16k[159];              

        for(i = 159; i >= 0; i--)
        {
            tmp = L_mult(input_16k[i], 12288);
            tmp = L_msu(tmp, input_16k[i - 1], 16384);
            tmp = L_mac(tmp, input_16k[i - 2], 4096);

            input_16k[i] = extract_h(tmp); 
        }

        // energy calculation
        memset(block_energy, 0, 4 * sizeof(int32_t));

        for(i = 0; i < 40; i++)
        {
            block_energy[0] = L_mac(block_energy[0], input_16k[i + 0], input_16k[i + 0]);     
            block_energy[1] = L_mac(block_energy[1], input_16k[i + 40], input_16k[i + 40]);   
            block_energy[2] = L_mac(block_energy[2], input_16k[i + 80], input_16k[i + 80]);   
            block_energy[3] = L_mac(block_energy[3], input_16k[i + 120], input_16k[i + 120]); 
        }

        // attack detection
        setup->attdec_detected = setup->attdec_position >= 2;
                
        position = -1; 

        for(i = 0; i < 4; i++)
        {
            /* block_energy[i] / 8.5 */
            l16 = extract_l(L_shr(block_energy[i], 1)); // block_energy[i] approx. h * 2^16 + l * 2.
            l16 = s_and(l16, 0x7fff);
            h16 = extract_h(block_energy[i]);
            tmp = L_shr(L_mult0(l16, 30840), 15);
            tmp = L_shr(L_mac0_1(tmp, h16, 30840), 2);

            if (tmp > setup->attdec_acc_energy)
            {
                position               = i; 
                setup->attdec_detected = 1; 
            }
            setup->attdec_acc_energy = max(L_shr(setup->attdec_acc_energy, 2), block_energy[i]); 
        }
        setup->attdec_position = position; 
    }

}
