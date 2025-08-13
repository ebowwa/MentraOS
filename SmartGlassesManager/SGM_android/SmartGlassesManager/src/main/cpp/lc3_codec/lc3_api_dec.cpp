#include "lc3_process.h"
#include "lc3_debug.h"

#define LC3_MODUL 91

extern int lc3_api_init_start(LC3_Info* info);
extern int lc3_api_init_end(LC3_Info* info);
//
static int32_t lc3_api_init_decoder(LC3_Dec_Info* info);
EXTERNC int32_t lc3_api_decoder_init(LC3_Dec_Info* info){
	returnIfErrC(ERROR(0), !info);
	info->is_encode = false;
	//
	int err = lc3_api_init_start(info);
	returnIfErrCS(err,err,"%d ",err);
	//
	err = lc3_api_init_decoder(info);
	returnIfErrCS(err, err, "%d ", err);
	//
	err = lc3_api_init_end(info);
	returnIfErrCS(err, err, "%d ", err);
	returnIfErrC(ERROR(0), !info->cb_decode);
	returnIfErrC(ERROR(0), !info->cb_decode_interlaced);
    return 0;
}
//
EXTERNC int32_t lc3_api_decoder_init_plus(LC3_Dec_Info* info);
EXTERNC int32_t lc3_api_decoder_init_sneak(LC3_Dec_Info* info);
static int32_t lc3_api_init_decoder(LC3_Dec_Info* info) {
	if (!info->is_lc3plus) {
#ifdef LC3_ENABLE
		return lc3_api_decoder_init_sneak(info);
#endif
	}
	else {
#ifdef LC3PLUS_ENABLE
		return lc3_api_decoder_init_plus(info);
#endif
	}
	return ERROR(0);
}
