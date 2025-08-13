#include "lc3_process.h"
#include "lc3_debug.h"

#define LC3_MODUL 90

int lc3_api_init_start(LC3_Info* info) {
	returnIfErrC(ERROR(0),!info->sample_rate);
	returnIfErrC(ERROR(0),!info->channels);
	returnIfErrC(ERROR(0),!info->bitwidth);
	returnIfErrC(ERROR(0),!info->cb_alloc);
	//
	if (!info->bitalign)
		info->bitalign = info->bitwidth;
	returnIfErrCS(ERROR(0), info->bitalign< info->bitwidth,"%d<%d", info->bitalign , info->bitwidth);
	//
	bool check = info->frame_dms == 100
		|| info->frame_dms == 75
		|| info->frame_dms == 50
		|| info->frame_dms == 25
		;
	dbgTestPDL(info->frame_dms);
	returnIfErrCS(ERROR(0), !check,"info->frame_dms=%d", info->frame_dms);
#ifdef LC3PLUS_ENABLE
	dbgTestPXL("lc3plus enable");
	info->is_lc3plus = info->frame_dms != 75;
#endif
#ifdef LC3_ENABLE
	dbgTestPXL("lc3 enable");
#ifndef AOB_LOW_LATENCY_MODE
	info->is_lc3plus = info->frame_dms < 75;
#endif
#endif
#ifndef LC3PLUS_ENABLE
	returnIfErrC(ERROR(0), info->is_lc3plus);
#endif
#ifndef LC3_ENABLE
	returnIfErrC(ERROR(0), !info->is_lc3plus);
#endif
	//
	if (info->frame_size) {
		info->bitrate = info->frame_size * 80000 / info->frame_dms;
		if (info->sample_rate == 44100)
			info->bitrate = info->bitrate * 44100 / 48000;
	}
	else if(info->bitrate) {
		info->frame_size = info->bitrate * info->frame_dms / 80000;
		if (info->sample_rate == 44100)
			info->frame_size = info->frame_size * 48000 / 44100;
	}
	//
	if (info->cb_overlay) {
		info->cb_overlay(info);
	}
	//
	dbgTestPDL(info->sample_rate);
	dbgTestPDL(info->channels);
	dbgTestPDL(info->frame_size);
	dbgTestPDL(info->bitwidth);
	dbgTestPDL(info->bitalign);
	dbgTestPDL(info->bitrate);
	dbgTestPDL(info->bandwidth);
	dbgTestPDL(info->plcMeth);
	dbgTestPDL(info->epmode);
	dbgTestPDL(info->epmr);
	dbgTestPDL(info->is_lc3plus);
	return 0;
}

int lc3_api_init_end(LC3_Info* info) {
	returnIfErrC(ERROR(0), !info->cb_uninit);

	dbgTestPPL(info->instance);
	dbgTestPDL(info->instance_size);
	dbgTestPPL(info->scratch);
	dbgTestPDL(info->scratch_size);

	dbgTestPDL(info->frame_samples);
	dbgTestPDL(info->frame_size);

	return 0;
}
