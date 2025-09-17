/**
 * @file mentraos_audio_system.h
 * @brief MentraOS Audio System Header
 * 
 * Public API for the MentraOS audio system implementation.
 */

#ifndef MENTRAOS_AUDIO_SYSTEM_H
#define MENTRAOS_AUDIO_SYSTEM_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize the MentraOS audio system
 * 
 * This function initializes the I2S audio output subsystem and prepares
 * the audio pipeline for operation.
 * 
 * @return 0 on success, negative error code on failure
 */
int mentraos_audio_system_init(void);

/**
 * @brief Start the MentraOS audio system
 * 
 * This function starts the audio generation thread and begins I2S
 * audio output transmission.
 * 
 * @return 0 on success, negative error code on failure
 */
int mentraos_audio_system_start(void);

/**
 * @brief Stop the MentraOS audio system
 * 
 * This function stops the audio generation and I2S transmission.
 * 
 * @return 0 on success, negative error code on failure
 */
int mentraos_audio_system_stop(void);

/**
 * @brief Set the sine wave frequency for audio output
 * 
 * @param frequency Frequency in Hz (must be > 0 and < sample_rate/2)
 */
void mentraos_audio_system_set_frequency(float frequency);

/**
 * @brief Print audio system statistics and status
 */
void mentraos_audio_system_print_stats(void);

#ifdef __cplusplus
}
#endif

#endif /* MENTRAOS_AUDIO_SYSTEM_H */
