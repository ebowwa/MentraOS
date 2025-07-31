
#  @Author       : XK
#  @Date         : 2025-07-02 16:53:17
#  @LastEditTime : 2025-07-02 16:53:57
#  @FilePath     : CMakeLists.txt
#  @Description  : 
#  Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved. 




target_include_directories(app PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include/.)
target_sources(app PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src/xyzn_fuel_gauge.c)

