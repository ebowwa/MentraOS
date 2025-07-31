#
# @Author       : XK
# @Date         : 2025-05-08 17:54:10
# @LastEditTime : 2025-05-08 17:59:53
# @FilePath     : CMakeLists.txt
# @Description  : 
# 
# Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved. 




target_include_directories(app PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include/.)
target_sources(app PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src/bal_os.c)