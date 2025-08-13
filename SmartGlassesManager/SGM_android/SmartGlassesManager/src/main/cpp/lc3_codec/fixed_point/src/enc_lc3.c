
#include "functions.h"


static void processReorderBitstream(uint8_t *bytes, int16_t n_pccw, int16_t n_pc, int16_t b_left, int8_t *scratchBuffer)
{
    int16_t        block_bytes;
    uint8_t *      bytes_tmp;

    bytes_tmp = (uint8_t *)scratchBuffer; /* Size = LC3_MAX_BYTES */

    if (n_pccw == 0)
    {
        return;
    }

    assert(b_left >= 0);

    /* set block size in bits and full bytes */
    block_bytes = shr_sat(add(n_pc, 1), 1);

    /* rearrange bitstream */
    memmove(&bytes_tmp[0], &bytes[b_left], block_bytes * sizeof(uint8_t));
    memmove(&bytes_tmp[block_bytes], &bytes[0], b_left * sizeof(uint8_t));
    memmove(&bytes[0], &bytes_tmp[0], add(block_bytes, b_left) * sizeof(uint8_t));

}


static void Enc_LC3_Channel(LC3_Enc *encoder, int32_t channel, int32_t bits_per_sample, int32_t *s_in, uint8_t *bytes,
                            int8_t *scratchBuffer, int32_t bfi_ext)
{
    int16_t d_fx_exp;
    int16_t gain_e, gain, quantizedGain, quantizedGainMin;
    int16_t ener_fx_exp;
    int16_t pitch, normcorr;
    int16_t ltpf_bits;
    int16_t tns_numfilters;
    int16_t lsbMode, lastnz, BW_cutoff_idx;
    int16_t gainChange, fac_ns_idx;
    int16_t nBits, numResBits;
    int16_t bp_side, mask_side;
    int16_t s_12k8_len;
    int16_t b_left;
        
    int32_t *  L_scf_idx;
    int32_t *  d_fx, *ener_fx;
    int16_t *  s_12k8, *int_scf_fx_exp, *q_d_fx16, *int_scf_fx, tns_order[TNS_NUMFILTERS_MAX], *indexes;
    int16_t *  scf, *scf_q;
    int16_t *  codingdata, *s_in_scaled;
    int8_t *   resBits;
    int8_t *   currentScratch;
    int16_t    ltpf_idx[3];
    EncSetup *h_EncSetup;
    
    h_EncSetup = encoder->channel_setup[channel];

    //TRACE("Encoder");

    /* BUFFER INITIALISATION. Some buffers may overlap since they are not used in the whole encoding process */
    d_fx      = (int32_t *)scratchBuffer; /* Size = 4 * MAX_LEN bytes */
    L_scf_idx = (int32_t *)(((uint8_t *)d_fx) + sizeof(*d_fx) * max(80, encoder->frame_length)); /* Size = 4 * SCF_MAX_PARAM -> aligned to 32 bytes */
    indexes  = (int16_t *)(((uint8_t *)L_scf_idx) +
                           sizeof(*L_scf_idx) * SCF_MAX_PARAM); /* Size = 2 * TNS_NUMFILTERS_MAX * MAXLAG = 32 bytes */
    q_d_fx16 = (int16_t *)(((uint8_t *)indexes) + sizeof(*indexes) * (TNS_NUMFILTERS_MAX * MAXLAG)); /* Size = 2 * MAX_LEN bytes */
    codingdata =
        (int16_t *)(((uint8_t *)q_d_fx16) + sizeof(*q_d_fx16) * max(80, encoder->frame_length)); /* Size = 3 * MAX_LEN bytes */
    resBits = ((int8_t *)codingdata) + sizeof(*codingdata) * (3 * max(80, encoder->frame_length) / 2); /* Size = MAX_LEN bytes */
    currentScratch =
        ((int8_t *)resBits) + sizeof(*resBits) * max(80, encoder->frame_length); /* Size = 4 * MAX_LEN */
    s_in_scaled = q_d_fx16;                                        /* Size = 2 * MAX_LEN bytes */
    s_12k8      = (int16_t *)(((uint8_t *)s_in_scaled) +
        sizeof(*s_in_scaled) *
            max(80, encoder->frame_length)); /* Size = 2 * (LEN_12K8 + 1) = 258 bytes -> aligned to 288 bytes */
    ener_fx    = (int32_t *)q_d_fx16;         /* Size = 4 * MAX_BANDS_NUMBER = 256 bytes */
    scf_q      = (int16_t *)(((uint8_t *)ener_fx) + sizeof(*ener_fx) * MAX_BANDS_NUMBER); /* Size = 2 * M */
    scf        = (int16_t *)(((uint8_t *)scf_q) + sizeof(*scf_q) * M);                    /* Size = 2 * M */
    int_scf_fx = (int16_t *)(((uint8_t *)scf) + sizeof(*scf) * M); /* Size = 2 * MAX_BANDS_NUMBER = 128 bytes */
    int_scf_fx_exp =
        (int16_t *)(((uint8_t *)int_scf_fx) + sizeof(*int_scf_fx) * MAX_BANDS_NUMBER); /* Size = 2 * MAX_BANDS_NUMBER = 128 bytes */

    /* Scale 16/24/32-bit input data */
    //TRACE("Scale_signal24");
    lc3_pre_encoding_process(s_in, s_in_scaled, encoder, h_EncSetup, bits_per_sample, scratchBuffer); 

    //TRACE("Mdct");
    /* currentScratch Size = 4 * MAX_LEN */
    processMdct(s_in_scaled, h_EncSetup->x_exp, encoder->frame_length, encoder->W_fx, encoder->W_size,
                   h_EncSetup->stEnc_mdct_mem, encoder->stEnc_mdct_mem_len, d_fx, &d_fx_exp, currentScratch);
    
    

    /* begin s_12k8 */
    //TRACE("Resamp12k8");
    /* currentScratch Size = 2.25 * MAX_LEN bytes */
    process_resamp12k8(s_in_scaled, encoder->frame_length, h_EncSetup->r12k8_mem_in, encoder->r12k8_mem_in_len,
                          h_EncSetup->r12k8_mem_50, h_EncSetup->r12k8_mem_out, encoder->r12k8_mem_out_len, s_12k8,
                          &s_12k8_len, encoder->fs_idx, encoder->frame_dms, currentScratch);
    

    //TRACE("Olpa");
    /* currentScratch Size = 392 bytes */
    process_olpa(&h_EncSetup->olpa_mem_s6k4_exp, h_EncSetup->olpa_mem_s12k8, h_EncSetup->olpa_mem_s6k4, &pitch,
                    s_12k8, s_12k8_len, &normcorr, &h_EncSetup->olpa_mem_pitch, h_EncSetup->resamp_exp, currentScratch);
    

    //TRACE("LtpfEnc");
    /* currentScratch Size = 512 bytes */
    process_ltpf_coder(&ltpf_bits, pitch, h_EncSetup->ltpf_enable, &h_EncSetup->ltpf_mem_in_exp,
                          h_EncSetup->ltpf_mem_in, encoder->ltpf_mem_in_len, ltpf_idx, s_12k8, s_12k8_len,
                          &h_EncSetup->ltpf_mem_normcorr, &h_EncSetup->ltpf_mem_mem_normcorr, normcorr,
                          &h_EncSetup->ltpf_mem_ltpf_on, &h_EncSetup->ltpf_mem_pitch, h_EncSetup->resamp_exp,
                          encoder->frame_dms, currentScratch);
    

    /* end s_12k8 */
    //TRACE("AttackDetector");
    /* currentScratch Size = ??? bytes */
    attack_detector(encoder, h_EncSetup, s_in_scaled, sub(h_EncSetup->x_exp, 15), currentScratch);
    
    /* begin ener_fx */
    //TRACE("PerBandEnergy");
    /* currentScratch Size = 160 bytes */
    processPerBandEnergy(ener_fx, &ener_fx_exp, d_fx, d_fx_exp, encoder->bands_offset, encoder->fs_idx,
                            encoder->bands_number, 0, encoder->frame_dms, currentScratch);
    

    //TRACE("BW Cutoff-Detection");
    if (encoder->fs_idx > 0)
    {
        processDetectCutoffWarped(&BW_cutoff_idx, ener_fx, ener_fx_exp, encoder->fs_idx, encoder->frame_dms);
    }
    else
    {
        BW_cutoff_idx = 0; 
    }
    

    //TRACE("SnsCompScf");
    /* currentScratch Size = 512 bytes */
    processSnsComputeScf(ener_fx, ener_fx_exp, encoder->fs_idx, encoder->bands_number, scf,
                            h_EncSetup->attdec_detected, currentScratch);
    

    //TRACE("SnsQuantScfEnc");
    /* currentScratch Size = 500 bytes */
    processSnsQuantizeScfEncoder(scf, L_scf_idx, scf_q, currentScratch);
    

    //TRACE("SnsInterpScfEnc");
    /* currentScratch Size = 128 bytes */
    processSnsInterpolateScf(scf_q, int_scf_fx, int_scf_fx_exp, 1, encoder->bands_number, currentScratch);
    

    //TRACE("Mdct shaping_enc");
    processMdctShaping(d_fx, int_scf_fx, int_scf_fx_exp, encoder->bands_offset, encoder->bands_number);
    
    /* end int_scf_fx_exp */
    //TRACE("BandwidthControl_enc");
    if (encoder->bandwidth) {
        process_cutoff_bandwidth(d_fx, encoder->yLen, encoder->bw_ctrl_cutoff_bin);
        BW_cutoff_idx = min(BW_cutoff_idx, encoder->bw_index);
    }
        
    //TRACE("Tns_enc");
    /* currentScratch Size = 2 * MAX_LEN + 220 */
    processTnsCoder(&(h_EncSetup->tns_bits), indexes, d_fx, BW_cutoff_idx, tns_order, &tns_numfilters,
                       h_EncSetup->enable_lpc_weighting, encoder->nSubdivisions, encoder->frame_dms,
                       encoder->frame_length, currentScratch);
    

    //TRACE("Est. Global Gain");
    /* currentScratch Size = 4 * MAX_LEN bytes */
    h_EncSetup->targetBitsQuant = sub(h_EncSetup->targetBitsInit, add(h_EncSetup->tns_bits, ltpf_bits));
    processEstimateGlobalGain(d_fx, d_fx_exp, encoder->yLen, h_EncSetup->targetBitsQuant, &gain, &gain_e,
                                 &quantizedGain, &quantizedGainMin, h_EncSetup->quantizedGainOff,
                                 &h_EncSetup->targetBitsOff, &h_EncSetup->mem_targetBits, h_EncSetup->mem_specBits,
                                 currentScratch);
    
    /* begin q_d_fx16 */

    //TRACE("Quant. 1");
    processQuantizeSpec(d_fx, d_fx_exp, gain, gain_e, q_d_fx16, encoder->yLen, h_EncSetup->targetBitsQuant,
                           h_EncSetup->targetBitsAri, &h_EncSetup->mem_specBits, &nBits, encoder->fs_idx, &lastnz,
                           codingdata, &lsbMode, -1);
    

    //TRACE("Adj. Global Gain");
    processAdjustGlobalGain(&quantizedGain, quantizedGainMin, h_EncSetup->quantizedGainOff, &gain, &gain_e,
                               h_EncSetup->targetBitsQuant, h_EncSetup->mem_specBits, &gainChange, encoder->fs_idx);
    

    //TRACE("Quant. 2");
    if (sub(gainChange, 1) == 0)
    {
        processQuantizeSpec(d_fx, d_fx_exp, gain, gain_e, q_d_fx16, encoder->yLen, h_EncSetup->targetBitsQuant,
                               h_EncSetup->targetBitsAri, NULL, &nBits, encoder->fs_idx, &lastnz, codingdata, &lsbMode,
                               0);
    }
    

    //TRACE("Res. Cod.");
    if (lsbMode == 0)
    {
        processResidualCoding(d_fx_exp, d_fx, q_d_fx16, gain, gain_e, encoder->yLen, h_EncSetup->targetBitsQuant,
                                 nBits, resBits, &numResBits);
    }
    else
    {
        numResBits = 0; 
    }
    

    //TRACE("Noise fac");
    /* currentScratch Size = 2 * MAX_LEN bytes */
#ifdef NONBE_LOW_BR_NF_TUNING
    processNoiseFactor(&fac_ns_idx, d_fx_exp, d_fx, q_d_fx16, gain, gain_e, BW_cutoff_idx, encoder->frame_dms,
                          h_EncSetup->targetBytes, currentScratch);
#else
    processNoiseFactor(&fac_ns_idx, d_fx_exp, d_fx, q_d_fx16, gain, gain_e, BW_cutoff_idx, encoder->frame_dms,
                          currentScratch);
#endif
    

    //TRACE("Entropy cod");
    processEncoderEntropy(bytes, &bp_side, &mask_side, h_EncSetup->targetBitsAri, h_EncSetup->targetBytes,
                          encoder->yLen, encoder->BW_cutoff_bits, tns_numfilters, lsbMode, lastnz,
                          tns_order, fac_ns_idx, quantizedGain, BW_cutoff_idx, ltpf_idx, L_scf_idx, bfi_ext,
                          encoder->fs_idx);
    

    //TRACE("Ari cod");
    ArithmeticEncoder(bytes, bp_side, mask_side, h_EncSetup->targetBitsAri, q_d_fx16, tns_order, tns_numfilters,
                         indexes, lastnz, codingdata, resBits, numResBits, lsbMode, h_EncSetup->enable_lpc_weighting,
                         currentScratch);
    

    //TRACE("Reorder Bitstream Enc");
    
    if (encoder->combined_channel_coding == 0 && h_EncSetup->n_pc > 0)
    {
        //TRACE("Reorder Ari dec");
        ArithmeticDecoder(bytes, &bp_side, &mask_side, h_EncSetup->total_bits, encoder->yLen, encoder->fs_idx,
                             h_EncSetup->enable_lpc_weighting, tns_numfilters, lsbMode, lastnz, &gain, tns_order,
                             fac_ns_idx, quantizedGain, encoder->frame_dms,
                             h_EncSetup->n_pc, 0, shr_pos(h_EncSetup->total_bits,3), 1, &gain, &b_left,
                             &gain, codingdata, &gain, (int16_t*)resBits, indexes, &gain, currentScratch);
         /* Ari dec */
        processReorderBitstream(bytes, h_EncSetup->n_pccw, h_EncSetup->n_pc, b_left, currentScratch);
    }
    

    /* end q_d_fx16 */
}

int32_t Enc_LC3(LC3_Enc *encoder, void **input, int32_t bits_per_sample, uint8_t *output, void *scratch, int16_t bfi_ext)
{
    int32_t ch = 0, output_size = 0;
    int32_t input_size = 0;
    int32_t totalBytes = (int32_t)encoder->bitrate * encoder->frame_length / (8 * encoder->fs_in);
    int32_t output_size2;

    uint8_t *lc3buf = output;

    for (ch = 0; ch < encoder->channels; ch++)
    {
        Enc_LC3_Channel(encoder, ch, bits_per_sample, input[ch], lc3buf, scratch, bfi_ext);
        if (encoder->epmode && encoder->combined_channel_coding == 0)
        {
            output_size2 = totalBytes / encoder->channels + (ch < (totalBytes % encoder->channels));
            //TRACE("fec_enc");

            fec_encoder(encoder->epmode, encoder->epmr, lc3buf, encoder->channel_setup[ch]->targetBytes, output_size2,
                        encoder->channel_setup[ch]->n_pccw, scratch);

            

            lc3buf += output_size2;
            output_size += output_size2;
        }
        else
        {
            lc3buf += encoder->channel_setup[ch]->targetBytes;
            output_size += encoder->channel_setup[ch]->targetBytes;
        }
    }

    if (encoder->epmode > 0 && encoder->combined_channel_coding)
    {
        input_size  = output_size;
        output_size = (int32_t)encoder->bitrate * encoder->frame_length / (8 * encoder->fs_in);
        //TRACE("fec_enc");

        fec_encoder(encoder->epmode, encoder->epmr, output, input_size, output_size, encoder->channel_setup[0]->n_pccw,
                    scratch);

        
    }

    return output_size;
}

