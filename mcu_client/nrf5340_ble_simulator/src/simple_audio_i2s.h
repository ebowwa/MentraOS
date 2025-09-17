/*
 * Simple I2S Audio Header
 */

#ifndef SIMPLE_AUDIO_I2S_H
#define SIMPLE_AUDIO_I2S_H

#include <stdint.h>

int simple_audio_i2s_init(void);
int simple_audio_i2s_start(void);
int simple_audio_i2s_stop(void);
void simple_audio_i2s_process(void);

#endif // SIMPLE_AUDIO_I2S_H
