#include "Lc3Encoder.hpp"
#include "Lc3Pool.hpp"
#include "lc3_process.h"
#include "lc3_debug.h"
#include "lc3_api_com.h"
#include "app_trace_rx.h"

#include <string.h>
using namespace sneak;
#define LC3_MODUL 12
//
static int32_t lc3_api_encoder_uninit(LC3_Enc_Info* info);
static int32_t lc3_api_enc(LC3_Enc_Info* encoder, void* scratch, void** input_samples, void* output_bytes, int32_t num_bytes);
static int32_t lc3_api_enc_interlaced(LC3_Enc_Info* encoder, void* scratch, void* input_samples, void* output_bytes, int32_t num_bytes);
//

EXTERNC int32_t lc3_api_encoder_init_sneak(LC3_Enc_Info* info){
	dbgTestPXL("lc3 sneak start");
	returnIfErrC(ERROR(0), !info);
	//
	if (info->frame_dms != 100 && info->frame_dms != 75 && info->frame_dms != 50 && info->frame_dms != 25) {
		dbgTestPXL("[lc3][enc][err]%s#unsupportde frame duration:%d(0.1ms)\n", __func__, info->frame_dms);
		return ERROR(0);
	}
	returnIfErrC(ERROR(0), !info->frame_size && !info->bitrate);
	//
	auto encode_size = info->channels == 1 ? LC3_ENC_MAX_SIZE_MONO : LC3_ENC_MAX_SIZE_STEREO;
	auto encode = info->cb_alloc(info->pool, encode_size);
	returnIfErrC(ERROR(0), !encode);
	info->instance = encode;
	info->instance_size = encode_size;
	info->scratch_size = 0;
	info->scratch = 0;
	//
	char* buff = (char*)info->instance;
	int encSize = (sizeof(Lc3Encoder)+16)>>3<<3;
	int cfgSize = (sizeof(Lc3Pool)+16)>>3<<3;
	int size = info->instance_size - encSize - cfgSize;
	auto lc3 = new(buff) Lc3Encoder();
	buff+=encSize;
	auto cfg = new(buff) Lc3Pool(buff+cfgSize, size);
	//
	auto frameDura = (Lc3Config::FrameDuration)(info->frame_dms);
	cfg->Inititalize((uint32_t)info->sample_rate, frameDura, (uint8_t)info->channels);
	lc3->Initialize(*cfg, info->bitwidth, info->bitalign);
	//
	if (!info->frame_size) {
		info->frame_size = cfg->getByteCountFromBitrate(info->bitrate);
	}	
	lc3->SetBytesPerChannel(info->frame_size / info->channels);
	//	
	info->frame_samples = cfg->NF;
	info->instance = lc3;	
	//
	dbgTestPXL("[dyname]%d+%d+%d=%d/%d\n"
		, encSize, cfgSize, cfg->GetMemUsed()
		, encSize + cfgSize + cfg->GetMemUsed()
		, info->instance_size
	);
	dbgTestPDL(info->frame_size);
	dbgTestPDL(info->bitrate);
	//
	info->cb_uninit = &lc3_api_encoder_uninit;
	info->cb_encode = &lc3_api_enc;
	info->cb_encode_interlaced = &lc3_api_enc_interlaced;

	return 0;
}

static int32_t lc3_api_encoder_uninit(LC3_Enc_Info* info) {
	returnIfErrC(ERROR(0), !info);
	if (info->cb_free) {
		if (info->instance) {
			info->cb_free(info->pool, info->instance);
			info->instance = 0;
		}
		if (info->scratch) {
			info->cb_free(info->pool, info->scratch);
			info->scratch = 0;
		}
	}
	return 0;
}

static int32_t lc3_api_enc(LC3_Enc_Info* info, void *scratch, void **input_samples, void *output_bytes, int32_t output_size)
{
	returnIfErrC(ERROR(0), !info);
	returnIfErrC(ERROR(0), info->is_interlaced);
	auto lc3 = (Lc3Encoder *)info->instance;
	auto cfg = lc3->_cfg;
	auto err = lc3->run((const void **)input_samples, (uint8_t *)output_bytes, output_size);
	switch (err) {
	case Lc3Encoder::ERROR_FREE:// = 0x00;
		break;
	case Lc3Encoder::INVALID_CONFIGURATION:// = 0x01;
	case Lc3Encoder::INVALID_BYTE_COUNT:// = 0x02;
	case Lc3Encoder::INVALID_BITS_PER_AUDIO_SAMPLE:// = 0x03;
	case Lc3Encoder::ENCODER_ALLOCATION_ERROR:// = 0x04;
		break;
	}
	returnIfErrCS(ERROR(err),err,"%d",err);
	return 0;
}

static int32_t lc3_api_enc_interlaced(LC3_Enc_Info*info, void *scratch, void *input_samples, void *output_bytes, int32_t output_size)
{
	returnIfErrC(ERROR(0), !info);
	returnIfErrC(ERROR(0), !info->is_interlaced);
	auto lc3 = (Lc3Encoder *)info->instance;
	auto cfg = lc3->_cfg;
	auto err = lc3->run_interlaced((void *)input_samples, (void *)output_bytes, output_size);
	switch (err) {
	case Lc3Encoder::ERROR_FREE:// = 0x00;
		break;
	case Lc3Encoder::INVALID_CONFIGURATION:// = 0x01;
	case Lc3Encoder::INVALID_BYTE_COUNT:// = 0x02;
	case Lc3Encoder::INVALID_BITS_PER_AUDIO_SAMPLE:// = 0x03;
	case Lc3Encoder::ENCODER_ALLOCATION_ERROR:// = 0x04;
		break;
	}
	returnIfErrCS(ERROR(err), err, "%d,status=0x%x", err,cfg->getErrorStatus());
	return 0;
}



