cur_dir := $(dir $(lastword $(MAKEFILE_LIST)))

obj_cpp := $(patsubst $(cur_dir)%,%,$(wildcard $(cur_dir)*.cpp))
obj_c := $(patsubst $(cur_dir)%,%,$(wildcard $(cur_dir)*.c))
obj_s := $(patsubst $(cur_dir)%,%,$(wildcard $(cur_dir)*.s))
obj-y := $(obj_c:.c=.o) $(obj_s:.S=.o) $(obj_cpp:.cpp=.o)

ccflags-y += -O2
ccflags-y += -I$(obj)/../inc
ccflags-y += -I$(obj)/../../../../../speech/src/process/common/inc
 
