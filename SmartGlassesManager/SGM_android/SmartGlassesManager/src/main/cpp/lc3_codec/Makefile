obj-y := lc3_api.o
obj-y += lc3_api_enc.o
obj-y += lc3_api_dec.o

LC3_ENABLE ?= 1
LC3PLUS_ENABLE ?= 0

subdir-ccflags-y += -I$(obj)/inc 
subdir-ccflags-y += -Wno-multichar 
subdir-ccflags-y += -Wno-sign-compare
subdir-ccflags-y += -Wno-unused-variable
subdir-ccflags-y += -Wno-unused-but-set-variable
subdir-ccflags-y += -Wno-float-conversion


ifeq ($(LC3_ENABLE),1)
obj-y += sneak_peek/
ccflags-y += -DLC3_ENABLE=1
endif

ifeq ($(LC3PLUS_ENABLE),1)
#obj-y += lc3plus/
obj-y += fixed_point/
#obj-y += fpxx/
#obj-y += k73/
ccflags-y += -DLC3PLUS_ENABLE=1
endif


ifdef SMF
#subdir-ccflags-y += -DSMF=1
endif

#sneak_peek	:text=0x09b80,data=0x0b814
#lc3plus	:text=0x1d0c8,data=0x13268
#fixed_point:text=0x1e0a0,data=0x0f804
