/*
 * @Author       : Cole
 * @Date         : 2025-08-05 18:00:04
 * @LastEditTime : 2025-08-18 09:41:37
 * @FilePath     : bspal_audio_i2s.c
 * @Description  :
 *
 *  Copyright (c) MentraOS Contributors 2025
 *  SPDX-License-Identifier: Apache-2.0
 */

#include "bspal_audio_i2s.h"

#include <nrfx_clock.h>
#include <nrfx_i2s.h>
#include <zephyr/device.h>
#include <zephyr/drivers/pinctrl.h>
#include <zephyr/kernel.h>

#include "BspLog/bsp_log.h"

#define I2S_NL DT_NODELABEL(i2s0)

#define TAG "BSPAL_I2S"
enum audio_i2s_state
{
    AUDIO_I2S_STATE_UNINIT,
    AUDIO_I2S_STATE_IDLE,
    AUDIO_I2S_STATE_STARTED,
};

static enum audio_i2s_state state = AUDIO_I2S_STATE_UNINIT;

PINCTRL_DT_DEFINE(I2S_NL);  // I2S0 pins

static nrfx_i2s_t i2s_inst = {
    .p_reg = NRF_I2S0,
    .drv_inst_idx = 0,
};
static uint32_t i2s_rx_req_buffer[2][PDM_PCM_REQ_BUFFER_SIZE];
static uint32_t i2s_tx_req_buffer[2][PDM_PCM_REQ_BUFFER_SIZE];

static nrfx_i2s_config_t cfg = {
    /* Pins are configured by pinctrl. */
    .skip_gpio_cfg = true,
    .skip_psel_cfg = true,
    .irq_priority = DT_IRQ(I2S_NL, priority),
    .mode = NRF_I2S_MODE_MASTER,
    .format = NRF_I2S_FORMAT_I2S,
    .alignment = NRF_I2S_ALIGN_LEFT,
    .sample_width = NRF_I2S_SWIDTH_16BIT,
    .channels = NRF_I2S_CHANNELS_STEREO,
    .enable_bypass = false,

    .clksrc    = NRF_I2S_CLKSRC_ACLK,    // Use audio clock
    .mck_setup = NRF_I2S_MCK_32MDIV8,    // For ACLK = ACLK/8 = 12.288M/8 = 1.536 MHz
    .ratio     = NRF_I2S_RATIO_96X,      // LRCK = 1.536M / 96 = 16 kHz precisely aligned
};

nrfx_i2s_buffers_t const i2s_req_buffer[2] = {
    {
        .p_rx_buffer = i2s_rx_req_buffer[0],
        .p_tx_buffer = i2s_tx_req_buffer[0],
        .buffer_size = PDM_PCM_REQ_BUFFER_SIZE,
    },

    {
        .p_rx_buffer = i2s_rx_req_buffer[1],
        .p_tx_buffer = i2s_tx_req_buffer[1],
        .buffer_size = PDM_PCM_REQ_BUFFER_SIZE,
    },
};

static uint32_t *volatile mp_block_to_fill = NULL;

static void i2s_buffer_req_evt_handle(nrfx_i2s_buffers_t const *p_released, uint32_t status)
{
    uint32_t err_code;
    if (!(status & NRFX_I2S_STATUS_NEXT_BUFFERS_NEEDED))  // If no next buffers 
    {
        BSP_LOGE(TAG, "i2s_buffer_req_evt_handle: No next buffers needed, status = %lu", status);
        return;
    }
    // p_released->p_rx_buffer is the completed buffer, can be released or used to fill next frame
    if (p_released->p_rx_buffer == NULL)
    {
        err_code = nrfx_i2s_next_buffers_set(&i2s_inst, &i2s_req_buffer[1]);
        mp_block_to_fill = i2s_tx_req_buffer[1];
    }
    else
    {
        err_code = nrfx_i2s_next_buffers_set(&i2s_inst, p_released);
        mp_block_to_fill = (uint32_t *)p_released->p_tx_buffer;
    }
}

void audio_i2s_start(void)
{
    __ASSERT_NO_MSG(state == AUDIO_I2S_STATE_IDLE);
    nrfx_err_t ret;
    /* Buffer size in 32-bit words */
    ret = nrfx_i2s_start(&i2s_inst, &i2s_req_buffer[0], 0);
    __ASSERT_NO_MSG(ret == NRFX_SUCCESS);

    state = AUDIO_I2S_STATE_STARTED;
}

void audio_i2s_stop(void)
{
    __ASSERT_NO_MSG(state == AUDIO_I2S_STATE_STARTED);

    nrfx_i2s_stop(&i2s_inst);

    state = AUDIO_I2S_STATE_IDLE;
}

// Custom I2S IRQ handler
static void i2s_irq_handler(const void *arg)
{
    nrfx_i2s_irq_handler();
}

void audio_i2s_init(void)
{
    __ASSERT_NO_MSG(state == AUDIO_I2S_STATE_UNINIT);

    nrfx_err_t ret;

    nrfx_clock_hfclkaudio_config_set(HFCLKAUDIO_12_288_MHZ);

    NRF_CLOCK->TASKS_HFCLKAUDIOSTART = 1;

    /* Wait for ACLK to start */
    while (NRF_CLOCK->EVENTS_HFCLKAUDIOSTARTED == 0)
    {
        k_sleep(K_MSEC(1));
    }

    ret = pinctrl_apply_state(PINCTRL_DT_DEV_CONFIG_GET(I2S_NL), PINCTRL_STATE_DEFAULT);
    __ASSERT_NO_MSG(ret == 0);

    IRQ_CONNECT(DT_IRQN(I2S_NL), DT_IRQ(I2S_NL, priority), i2s_irq_handler, NULL, 0);
    irq_enable(DT_IRQN(I2S_NL));

    ret = nrfx_i2s_init(&i2s_inst, &cfg, i2s_buffer_req_evt_handle);
    __ASSERT_NO_MSG(ret == NRFX_SUCCESS);

    state = AUDIO_I2S_STATE_IDLE;
    BSP_LOGI(TAG, "Audio I2S initialized OK!!!");
}

void i2s_pcm_player(void *i2c_pcm_data, int16_t i2c_pcm_size, uint8_t i2s_pcm_ch)
{
    // Simple test tone player - fill both channels with same data
    int16_t *pcm_data = (int16_t *)i2c_pcm_data;
    
    if (mp_block_to_fill == NULL) {
        return; // No buffer ready
    }

    for (uint16_t i = 0; i < i2c_pcm_size; i++)
    {
        uint32_t *p_word = &mp_block_to_fill[i];
        ((uint16_t *)p_word)[0] = (uint16_t)pcm_data[i]; // Left channel
        ((uint16_t *)p_word)[1] = (uint16_t)pcm_data[i]; // Right channel
    }
}
