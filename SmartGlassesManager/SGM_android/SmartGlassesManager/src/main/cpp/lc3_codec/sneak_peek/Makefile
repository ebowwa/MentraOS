cur_dir := $(dir $(lastword $(MAKEFILE_LIST)))
obj_cpp := $(patsubst $(cur_dir)%,%,$(wildcard $(cur_dir)*.cpp))
obj_c := $(patsubst $(cur_dir)%,%,$(wildcard $(cur_dir)*.c))
obj-y := $(obj_c:.c=.o) $(obj_s:.S=.o) $(obj_cpp:.cpp=.o)

lc3_com-y += Common/
lc3_enc-y += Encoder/
lc3_dec-y += Decoder/
lc3_com-y += api_process/

obj-y += lc3_com.o 
obj-y += lc3_enc.o 
obj-y += lc3_dec.o 
obj-y += Common/Tables/non_overlay/

subdir-ccflags-y += \
	-I$(obj)/Common \
	-I$(obj)/Common/Tables \
	-I$(obj)/Api \
	-I$(obj)/api_process \
	-I$(obj)/Encoder \
	-I$(obj)/Decoder \
	-I$(obj)/../../../smf/plugin/lc3 \

subdir-ccflags-y += -Wno-double-promotion 
subdir-ccflags-y += -Wno-unused-variable 
subdir-ccflags-y += -Wno-float-conversion 
subdir-ccflags-y += -Wno-sign-compare 
subdir-ccflags-y += -Wno-narrowing 

