
#include "functions.h"


static int32_t Dec_LC3_Channel(LC3_Dec *decoder, int32_t channel, int32_t bits_per_sample, uint8_t *bs_in, void *s_out, int16_t bfi,
                           int8_t *scratchBuffer)
{
    int16_t scale;
    int16_t fill_bits;
    int16_t nf_seed, gg_idx, fac_ns_idx, q_fx_exp = 0;
    int16_t bp_side, mask_side;
    int16_t tns_numfilters, lsbMode, lastnz, BW_cutoff_idx, BW_cutoff_idx_nf;
    int16_t zero_frame;
#ifdef ENABLE_RFRAME
    int16_t rframe = 0;
#endif
    int16_t ltpf_idx[3] = {0};
    int16_t spec_inv_idx = 0;

    /* Buffers */
    int16_t *  int_scf_fx_exp;
    int16_t tns_order[TNS_NUMFILTERS_MAX] = {0};
    int16_t *  resBitBuf;
    int16_t *  sqQdec, *int_scf_fx, *x_fx, *indexes, *scf_q;
    int32_t *  L_scf_idx;
    int32_t *  q_d_fx;
    int8_t *   currentScratch;
    DecSetup *h_DecSetup = decoder->channel_setup[channel];

#ifdef DISABLE_PLC
    UNUSED(decoder->plcMeth);
#endif
    /* BUFFER INITIALISATION. Some buffers may overlap since they are not used in the whole decoding process */
    q_d_fx = (int32_t *)scratchBuffer; /* Size = 4 * MAX_LEN bytes */
    resBitBuf = (int16_t *)(((uint8_t *)q_d_fx) + sizeof(*q_d_fx) * decoder->frame_length); /* Size = 2 * NPRM_RESQ = 2 * MAX_LEN bytes */
    indexes = (int16_t *)(((uint8_t *)resBitBuf) + sizeof(*resBitBuf) * decoder->frame_length); /* Size = 2 * TNS_NUMFILTERS_MAX * MAXLAG = 32 bytes */
    L_scf_idx = (int32_t *)(((uint8_t *)indexes) + sizeof(*indexes) * TNS_NUMFILTERS_MAX *MAXLAG); /* Size = 4 * SCF_MAX_PARAM = 28 bytes -> aligned to 32 bytes */
    sqQdec = (int16_t *)(((uint8_t *)L_scf_idx) + sizeof(*L_scf_idx) * (SCF_MAX_PARAM));   /* Size = 2 * MAX_LEN bytes */
    scf_q = (int16_t *)(((uint8_t *)sqQdec) + sizeof(*sqQdec) * (decoder->frame_length)); /* Size = 2 * M = 32 bytes */
    int_scf_fx_exp = (int16_t *)(((uint8_t *)scf_q) + sizeof(*scf_q) * M); /* Size = 2 * MAX_BANDS_NUMBER = 128 bytes */
    int_scf_fx = (int16_t *)(((uint8_t *)int_scf_fx_exp) + sizeof(*int_scf_fx_exp) * MAX_BANDS_NUMBER); /* Size = 2 * MAX_BANDS_NUMBER = 128 bytes */
    currentScratch = (int8_t *)int_scf_fx + sizeof(*int_scf_fx) * MAX_BANDS_NUMBER; /* Size = 4 * MAX_LEN */
    x_fx = (int16_t *)(((uint8_t *)q_d_fx) + sizeof(*q_d_fx) * decoder->frame_length); /* Size = 2 * (MAX_LEN + MDCT_MEM_LEN_MAX) = 2
                                                                        * MAX_LEN + 1.25 * MAX_LEN = 3.25 * MAX_LEN */

#ifdef DISABLE_PLC
    memset(q_d_fx, 0, decoder->frame_length * sizeof(*q_d_fx));
#endif

#ifdef ENABLE_RFRAME
    if (bfi == 3)
    {
        bfi = 2;
        rframe = 1;
    }
#endif
    if (bfi != 1)
    {
        DecoderSideInformation(bs_in, &bp_side, &mask_side, h_DecSetup->total_bits, decoder->yLen,
                                 decoder->fs_idx, decoder->BW_cutoff_bits, &tns_numfilters, &lsbMode, &lastnz, &bfi,
                                 tns_order, &fac_ns_idx, &gg_idx, &BW_cutoff_idx, ltpf_idx, L_scf_idx,
                                 decoder->frame_dms);
        BW_cutoff_idx_nf = BW_cutoff_idx;
    }

    //TRACE("Ari dec");
    if (bfi != 1)
    {
        ArithmeticDecoder(bs_in, &bp_side, &mask_side, h_DecSetup->total_bits, decoder->yLen, decoder->fs_idx,
                             h_DecSetup->enable_lpc_weighting, tns_numfilters, lsbMode, lastnz, &bfi, tns_order,
                             fac_ns_idx, gg_idx, decoder->frame_dms,
                             decoder->n_pc, decoder->be_bp_left, decoder->be_bp_right, 0, &spec_inv_idx, &scale,
                             &fill_bits, sqQdec, &nf_seed, resBitBuf, indexes, &zero_frame, currentScratch);

#ifdef ENABLE_RFRAME
        if ((rframe == 1) && (zero_frame == 0))
        {
            bfi = 2;
            spec_inv_idx = max(lastnz, BW_cutoff_bin_all[BW_cutoff_idx]);
        }
#endif

        if (bfi == 0)
            ArithmeticDecoderScaling(sqQdec, decoder->yLen, q_d_fx, &q_fx_exp);
    }
     /* Ari dec */
#ifdef BE_MOVED_STAB_FAC
    //TRACE("SnsQuantScfDec");
    if (bfi != 1)
        /* currentScratch Size = 96 bytes */
        processSnsQuantizeScfDecoder(L_scf_idx, scf_q, currentScratch);
    
    //TRACE("PLC::ComputeStabFac");
    if (h_DecSetup->plcAd)
        processPLCcomputeStabFac_main(scf_q, h_DecSetup->plcAd->old_scf_q, h_DecSetup->plcAd->old_old_scf_q,
                                      bfi, h_DecSetup->prev_bfi, h_DecSetup->prev_prev_bfi, &h_DecSetup->plcAd->stab_fac);
    
#endif

    //TRACE("Partial Concealment");
    if (bfi != 1)
    {
        scale = 32767;
        if (h_DecSetup->plcAd)
            scale = h_DecSetup->plcAd->stab_fac;

        processPCmain(rframe, &bfi, h_DecSetup->prev_bfi, decoder->yLen, decoder->frame_dms,
                         h_DecSetup->q_old_res_fx, &h_DecSetup->q_old_res_fx_exp, sqQdec,
                         h_DecSetup->q_old_d_fx, spec_inv_idx, ltpf_idx[0], scale, q_d_fx, &q_fx_exp,
                         gg_idx, h_DecSetup->quantizedGainOff, &h_DecSetup->prev_gg, &h_DecSetup->prev_gg_e,
                         &BW_cutoff_idx_nf, &h_DecSetup->prev_BW_cutoff_idx_nf, fac_ns_idx, &h_DecSetup->prev_fac_ns_fx,
                         &h_DecSetup->pc_nbLostFramesInRow);
    }

    if (bfi != 1)
    {
        //TRACE("Residual dec");
        processResidualDecoding(q_d_fx, q_fx_exp, decoder->yLen, resBitBuf, fill_bits);
        
        //TRACE("Noisefill");
        /* currentScratch Size = 2 * MAX_LEN bytes */
        if (zero_frame == 0)
            processNoiseFilling(q_d_fx, nf_seed, q_fx_exp, fac_ns_idx, BW_cutoff_idx_nf, decoder->frame_dms,
                                   h_DecSetup->prev_fac_ns_fx, spec_inv_idx, currentScratch);        

        //TRACE("applyGlobalGain");
        processApplyGlobalGain(q_d_fx, &q_fx_exp, decoder->yLen, gg_idx, h_DecSetup->quantizedGainOff);
        
        //TRACE("Tns_dec");
        /* currentScratch Size = 48 bytes */
        processTnsDecoder(indexes, q_d_fx, decoder->yLen, tns_order, &q_fx_exp, BW_cutoff_idx, decoder->frame_dms,
                             currentScratch);
        
#ifndef BE_MOVED_STAB_FAC
        //TRACE("SnsQuantScfDec");
        /* currentScratch Size = 96 bytes */
        processSnsQuantizeScfDecoder(L_scf_idx, scf_q, currentScratch);
        
#endif

        //TRACE("SnsInterpScfDec");
        /* currentScratch Size = 128 bytes */
        processSnsInterpolateScf(scf_q, int_scf_fx, int_scf_fx_exp, 0, decoder->bands_number, currentScratch);
        

        //TRACE("Mdct shaping_dec");
        processScfScaling(int_scf_fx_exp, decoder->bands_number, &q_fx_exp);
        processMdctShaping(q_d_fx, int_scf_fx, int_scf_fx_exp, decoder->bands_offset, decoder->bands_number);
        
        /* end int_scf_fx */
    }
    //TRACE("PLC::Main");
    /* currentScratch Size = 2 * MAX_LGW + 8 * MAX_LPROT + 12 * MAX_L_FRAME */
    processPLCmain(decoder->plcMeth, &h_DecSetup->concealMethod, &h_DecSetup->nbLostFramesInRow, bfi,
                      h_DecSetup->prev_bfi, decoder->frame_length, decoder->la_zeroes, decoder->W_fx, x_fx,
                      h_DecSetup->stDec_ola_mem_fx, &h_DecSetup->stDec_ola_mem_fx_exp, h_DecSetup->q_old_d_fx,
                      &h_DecSetup->q_old_fx_exp, q_d_fx, &q_fx_exp, decoder->yLen, decoder->fs_idx,
                      decoder->bands_offset, &h_DecSetup->plc_damping, h_DecSetup->ltpf_mem_pitch_int,
                      h_DecSetup->ltpf_mem_pitch_fr, &h_DecSetup->ns_cum_alpha, &h_DecSetup->ns_seed, h_DecSetup->plcAd,
                      decoder->frame_dms, currentScratch);
    
#ifdef NONBE_PLC4_ADAP_DAMP
    //TRACE("PLC/PC::DampingScrambling");
    if (h_DecSetup->plcAd)
        processPLCDampingScrambling_main(bfi, h_DecSetup->concealMethod, h_DecSetup->nbLostFramesInRow,
                                            h_DecSetup->pc_nbLostFramesInRow, &h_DecSetup->ns_seed, &h_DecSetup->pc_seed,
                                            h_DecSetup->ltpf_mem_pitch_int, ltpf_idx[0], q_d_fx, &q_fx_exp, h_DecSetup->q_old_d_fx,
                                            &h_DecSetup->q_old_fx_exp, decoder->yLen, h_DecSetup->plcAd->stab_fac, decoder->frame_dms,
                                            &h_DecSetup->plcAd->cum_fading_slow, &h_DecSetup->plcAd->cum_fading_fast,
                                            &h_DecSetup->plc_damping, spec_inv_idx);
    
#endif
    //TRACE("Imdct");
    /* currentScratch Size = 4 * MAX_LEN */
    ProcessingIMDCT(q_d_fx, &q_fx_exp, decoder->W_fx, h_DecSetup->stDec_ola_mem_fx, &h_DecSetup->stDec_ola_mem_fx_exp,
                    x_fx, decoder->W_size, decoder->frame_length, decoder->stDec_ola_mem_fx_len, decoder->frame_dms,
                    h_DecSetup->concealMethod, bfi, h_DecSetup->prev_bfi, h_DecSetup->nbLostFramesInRow,
                    h_DecSetup->plcAd,
                    currentScratch);
    
    //TRACE("PLC::Update");
    processPLCupdate(h_DecSetup->plcAd, x_fx, q_fx_exp, h_DecSetup->concealMethod, decoder->frame_length,
                        decoder->fs_idx, &h_DecSetup->nbLostFramesInRow, &h_DecSetup->prev_prev_bfi, &h_DecSetup->prev_bfi,
                        bfi, scf_q, h_DecSetup->stDec_ola_mem_fx, h_DecSetup->stDec_ola_mem_fx_exp, &h_DecSetup->ns_cum_alpha);
    

#ifdef LTPF_DISABLE_FILTERING   
    ltpf_idx[0] = 0;
    ltpf_idx[1] = 0;
    ltpf_idx[2] = 0;
    h_DecSetup->ltpf_mem_active=0;
#endif
    //TRACE("LtpfDec");
    /* currentScratch Size = 0.5 * MAX_LEN + 20 bytes */
    processLtpfDecoder(&q_fx_exp, decoder->frame_length, decoder->ltpf_mem_x_len, decoder->fs_idx,
                            decoder->ltpf_mem_y_len, &h_DecSetup->ltpf_mem_e, x_fx, h_DecSetup->ltpf_mem_x, x_fx,
                            h_DecSetup->ltpf_mem_y, ltpf_idx[0], ltpf_idx[1], ltpf_idx[2],
                            &h_DecSetup->ltpf_mem_pitch_int, &h_DecSetup->ltpf_mem_pitch_fr, &h_DecSetup->ltpf_mem_gain,
                            &h_DecSetup->ltpf_mem_active, h_DecSetup->ltpf_scale_fac_idx, bfi,
                            h_DecSetup->concealMethod,
                            h_DecSetup->plc_damping, &h_DecSetup->ltpf_mem_scale_fac_idx, currentScratch);
    
    //TRACE("Output scaling");
    processOutputScaling(x_fx, s_out, bits_per_sample, q_fx_exp, decoder->frame_length); 
     /* Output scaling */
     /* Decoder */

    return bfi;
}

/* num_bytes = 0 -> bad frame */
LC3_Error Dec_LC3(LC3_Dec *decoder, uint8_t *input, int32_t num_bytes, void **output, int32_t bits_per_sample, void *scratch, int32_t bfi_ext)
{
    int32_t       ch = 0, bfi = bfi_ext;
    LC3_Error err = LC3_OK;
    int32_t       fec_num_bytes;
    int32_t       lc3_num_bytes;
    int32_t       lc3_channel_num_bytes;
    int32_t       channel_bfi, out_bfi;
    int16_t    channel_epmr;

    if (bfi == 0)
        bfi = !num_bytes;

    if (decoder->ep_enabled)
    {
        decoder->combined_channel_coding = decoder->channels > 1 && num_bytes <= 160;

        if (decoder->combined_channel_coding)
        {
            fec_num_bytes = num_bytes;
            decoder->error_report =fec_decoder(input, fec_num_bytes, &lc3_num_bytes, &decoder->epmr, decoder->combined_channel_coding,
                            &decoder->n_pccw, &bfi, &decoder->be_bp_left, &decoder->be_bp_right, &decoder->n_pc, &decoder->m_fec, scratch);

            for (ch = 0; ch < decoder->channels; ch++)
            {
                lc3_channel_num_bytes = lc3_num_bytes / decoder->channels + (ch < (lc3_num_bytes % decoder->channels));
                if (bfi != 1 && lc3_channel_num_bytes != decoder->channel_setup[ch]->last_size)
                {
                    err = update_dec_bitrate(decoder, ch, lc3_channel_num_bytes);
                    if (err)
                        return err;
                    decoder->channel_setup[ch]->last_size = lc3_channel_num_bytes;
                }

                bfi = Dec_LC3_Channel(decoder, ch, bits_per_sample, input, output[ch], bfi, scratch);
                input += decoder->channel_setup[ch]->targetBytes;
            }
        }
        else
        {
            decoder->epmr = 12;
            out_bfi      = 0;
            for (ch = 0; ch < decoder->channels; ch++)
            {
                fec_num_bytes = num_bytes / decoder->channels + (ch < (num_bytes % decoder->channels));
                channel_bfi = bfi;
                decoder->error_report = fec_decoder(input, fec_num_bytes, &lc3_num_bytes, &channel_epmr,
                                                    decoder->combined_channel_coding, &decoder->n_pccw, &channel_bfi,
                                                    &decoder->be_bp_left, &decoder->be_bp_right, &decoder->n_pc, &decoder->m_fec, scratch);
                decoder->epmr = MIN(decoder->epmr, channel_epmr);


#ifdef ENABLE_PADDING
                if (channel_bfi != 1)
                {
                    int16_t padding_len, np_zero;

                    if (paddingDecoder(input, shl(lc3_num_bytes, 3), decoder->yLen, decoder->BW_cutoff_bits, 
						           decoder->ep_enabled, &padding_len, &np_zero))
                        channel_bfi = 1;

                    input = input + np_zero;
                    decoder->n_pc = max(decoder->n_pc - (2 * np_zero), 0);

                    if (channel_bfi == 2)
                    {
                        if (decoder->be_bp_right < (8*np_zero))
                        {
                            channel_bfi = 0;
                            decoder->be_bp_left = -1;
                            decoder->be_bp_right = -1;
                        }
                        else
                        {
                            decoder->be_bp_right = decoder->be_bp_right - (8 * np_zero);
                            decoder->be_bp_left  = max(decoder->be_bp_left - (8 * np_zero), 0);
                        }
                    }
                    lc3_num_bytes = lc3_num_bytes - padding_len;
                }
#endif
                if (channel_bfi != 1 && lc3_num_bytes != decoder->channel_setup[ch]->last_size)
                {
                    err = update_dec_bitrate(decoder, ch, lc3_num_bytes);
                    if (err)
                        return err;

                    decoder->channel_setup[ch]->last_size = lc3_num_bytes;
                }
                channel_bfi = Dec_LC3_Channel(decoder, ch, bits_per_sample, input, output[ch], channel_bfi, scratch);
                out_bfi |= channel_bfi;
                input += fec_num_bytes;
            }
            bfi = out_bfi & 1;
        }
    }
    else
    {
        for (ch = 0; ch < decoder->channels; ch++)
        {
            lc3_num_bytes = num_bytes / decoder->channels + (ch < (num_bytes % decoder->channels));
#ifdef ENABLE_PADDING
            if (bfi != 1)
            {
                int16_t padding_len, np_zero;
                if (paddingDecoder(input, shl(lc3_num_bytes, 3), decoder->yLen, decoder->BW_cutoff_bits, 
					             decoder->ep_enabled, &padding_len, &np_zero))
                    bfi = 1;

                lc3_num_bytes = lc3_num_bytes - padding_len;
                if (lc3_num_bytes < 20 || lc3_num_bytes > LC3_MAX_BYTES)
                    bfi = 1;    /* mark frame as broken if frame sizeif below the minimum of 20 bytes */
            }
#endif             
            if (bfi != 1 && lc3_num_bytes != decoder->channel_setup[ch]->last_size)
            {
                err = update_dec_bitrate(decoder, ch, lc3_num_bytes);
                if (err)
                    return err;
                decoder->channel_setup[ch]->last_size = lc3_num_bytes;
            }

            bfi = Dec_LC3_Channel(decoder, ch, bits_per_sample, input, output[ch], bfi, scratch);
            input += decoder->channel_setup[ch]->targetBytes;
        }
    }
    return bfi == 1 ? LC3_DECODE_ERROR : LC3_OK;
}
