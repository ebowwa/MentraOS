cur_dir := $(dir $(lastword $(MAKEFILE_LIST)))

obj_cpp := $(patsubst $(cur_dir)%,%,$(wildcard $(cur_dir)*.cpp))
obj_c := $(patsubst $(cur_dir)%,%,$(wildcard $(cur_dir)*.c))

lc3plus += $(obj_c:.c=.o) $(obj_s:.S=.o) $(obj_cpp:.cpp=.o)
lc3plus += src/

#lc3plus_com-y = $(lc3plus)
#obj-y = lc3plus_com.o
obj-y = $(lc3plus)

#lc3_com-y = $(lc3plus)
#obj-y = lc3_com.o

ccflags-y += -I$(obj)/inc
