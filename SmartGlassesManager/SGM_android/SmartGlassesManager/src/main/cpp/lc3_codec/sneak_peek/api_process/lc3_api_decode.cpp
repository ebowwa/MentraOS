#include "Lc3Decoder.hpp"
#include "Lc3Pool.hpp"
#include "lc3_process.h"
#include "lc3_debug.h"
#include "lc3_api_com.h"
#include "string.h"

using namespace sneak;
#define LC3_MODUL 11

static int32_t lc3_api_decoder_uninit(LC3_Dec_Info* info);
static int32_t lc3_api_dec(LC3_Dec_Info* info, void* scratch, void* input_bytes, int32_t num_bytes, void** output_samples, int32_t bfi_ext);
static int32_t lc3_api_dec_interlaced(LC3_Dec_Info* info, void* scratch, void* input_bytes, int32_t num_bytes, void* output_samples, int32_t bfi_ext);

EXTERNC int32_t lc3_api_decoder_init_sneak(LC3_Dec_Info* info){
	dbgTestPXL("sneak start");
	returnIfErrC(ERROR(0), !info);
	//
	if (info->frame_dms != 100 && info->frame_dms != 75 && info->frame_dms != 50 && info->frame_dms != 25) {
		dbgErrPXL("unsupportde frame duration:%d(0.1ms)",info->frame_dms);
		return ERROR(0);
	}

	auto decode_size = info->channels == 1 ? LC3_DEC_MAX_SIZE_MONO : LC3_DEC_MAX_SIZE_STEREO;
	auto decode = info->cb_alloc(info->pool, decode_size);
	returnIfErrC(false, !decode);
	//
	info->instance = decode;
	info->instance_size = decode_size;
	info->scratch = 0;
	info->scratch_size = 0;
	//
	char* buff = (char*)info->instance;
	int decSize = ((sizeof(Lc3Decoder)+16)>>3<<3);
	int cfgSize = (sizeof(Lc3Pool)+16)>>3<<3;
	int size = info->instance_size - decSize - cfgSize;
	auto lc3 = new((void*)buff) Lc3Decoder();
	buff+=decSize;
	auto cfg = new((void*)buff) Lc3Pool(buff+cfgSize, size);

	auto frameDura = Lc3Config::FrameDuration::d10ms;
	//if (info->frame_dms == 75) {
	//	frameDura = Lc3Config::FrameDuration::d7p5ms;		
	//}
	switch (info->frame_dms)
	{
		case 75:
			frameDura = Lc3Config::FrameDuration::d7p5ms;
			break;
		case 50:
			frameDura = Lc3Config::FrameDuration::d5ms;
			break;
		case 25:
			frameDura = Lc3Config::FrameDuration::d2p5ms;
			break;
		default:
			break;
	}

	cfg->Inititalize((uint32_t)info->sample_rate, frameDura, (uint8_t)info->channels,info->is_interlaced);
	lc3->Initialize(*cfg, info->bitwidth, info->bitalign);

	info->frame_samples = cfg->NF;
	info->instance = lc3;
	//
	dbgTestPXL("[dyname]%d+%d+%d=%d/%d\n"
		, decSize, cfgSize, cfg->GetMemUsed()
		, decSize + cfgSize + cfg->GetMemUsed()
		, info->instance_size
	);
	//
	info->cb_decode = &lc3_api_dec;
	info->cb_decode_interlaced = &lc3_api_dec_interlaced;
	info->cb_uninit =&lc3_api_decoder_uninit;
	//
	dbgTestPXL("sneak end");
	return 0;
}

static int32_t lc3_api_decoder_uninit(LC3_Dec_Info* info) {
	dbgTestPXL("sneak");
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
	return LC3_API_OK;
}

static int32_t lc3_api_dec(LC3_Dec_Info* info, void* scratch, void* input_bytes, int32_t num_bytes, void** output_samples, int32_t bfi_ext)
{
	returnIfErrC(ERROR(0), !info);
	returnIfErrC(ERROR(0), info->is_interlaced);
	auto lc3 = (Lc3Decoder*)info->instance;
	auto cfg = lc3->_cfg;
	uint8_t BFIs = bfi_ext ? 0xff : 0;
	uint8_t BECs = 0;
	auto err = lc3->run((const uint8_t*)input_bytes, num_bytes, BFIs, output_samples, BECs);
	returnIfErrCS(ERROR(err), err, "%d", err);
	return 0;
}

static int32_t lc3_api_dec_interlaced(LC3_Dec_Info* info, void *scratch, void *input_bytes, int32_t num_bytes, void *output_samples, int32_t bfi_ext)
{
	returnIfErrC(ERROR(0), !info);
	returnIfErrC(ERROR(0), !info->is_interlaced);
	auto lc3 = (Lc3Decoder *)info->instance;
	auto cfg = lc3->_cfg;
	uint8_t BFIs = bfi_ext ? 0xff : 0;
	uint8_t BECs = 0;
	auto err = lc3->run_interlaced((const uint8_t *)input_bytes, num_bytes, BFIs, output_samples, BECs);
	returnIfErrCS(ERROR(err), err, "%d", err);
	return 0;
}






