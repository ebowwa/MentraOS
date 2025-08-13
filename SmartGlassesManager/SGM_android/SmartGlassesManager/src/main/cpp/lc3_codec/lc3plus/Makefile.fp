cur_dir := $(dir $(lastword $(MAKEFILE_LIST)))

obj_cpp := $(patsubst $(cur_dir)%,%,$(wildcard $(cur_dir)*.cpp))
obj_c := $(patsubst $(cur_dir)%,%,$(wildcard $(cur_dir)*.c))

obj-y += $(obj_c:.c=.o) $(obj_s:.S=.o) $(obj_cpp:.cpp=.o)

ccflags-y += -I$(obj)/../inc
ccflags-y += -Wno-unknown-pragmas


#ccflags-y += --c99
#ccflags-y += -mcpu=Cortex-M4
#ccflags-y += -march=armv7-m  
ccflags-y += -mthumb
#ccflags-y += -Otime -O3 
#ccflags-y += --min_array_alignment=8 
ccflags-y += -DUSE_CDK_WRAPPER 
#ccflags-y += --diag_suppress=4007
#ccflags-y += -I/home/amm-archiv/soft/cdk-compilers/ARM/RVCT/4.1/RVCT/Data/4.1/713/include/unix  # ToDo: probably to be removed or adjusted
#ldflags-y += = --cpu=$(CPU) --info sizes,totals --remove --inline

ccflags-y += -DinvSqrtTab=lc3plus_invSqrtTab
ccflags-y += -Dexp2_tab_long=lc3plus_exp2_tab_long
ccflags-y += -Dexp2w_tab_long=lc3plus_exp2w_tab_long
ccflags-y += -Dexp2x_tab_long=lc3plus_exp2x_tab_long
ccflags-y += -Dac_tns_order_bits=lc3plus_ac_tns_order_bits
ccflags-y += -Dsns_gainLSBbits=lc3plus_sns_gainLSBbits
ccflags-y += -Dac_tns_order_freq=lc3plus_ac_tns_order_freq
ccflags-y += -Dsns_vq_far_adj_gains=lc3plus_sns_vq_far_adj_gains
ccflags-y += -Dsns_vq_reg_lf_adj_gains=lc3plus_sns_vq_reg_lf_adj_gains
ccflags-y += -Dac_tns_coef_bits=lc3plus_ac_tns_coef_bits
ccflags-y += -Dac_tns_coef_cumfreq=lc3plus_ac_tns_coef_cumfreq
ccflags-y += -Dsns_vq_reg_adj_gains=lc3plus_sns_vq_reg_adj_gains
ccflags-y += -Dac_tns_coef_freq=lc3plus_ac_tns_coef_freq
ccflags-y += -Dsns_gainMSBbits=lc3plus_sns_gainMSBbits
ccflags-y += -Dac_tns_order_cumfreq=lc3plus_ac_tns_order_cumfreq
ccflags-y += -Dsns_vq_near_adj_gains=lc3plus_sns_vq_near_adj_gains
