#pragma once

#ifndef SMF

#include <string.h>
#define __file__ strrchr(__FILE__,'/')

#ifndef WIN32
#include "hal_trace.h"
#define print(...) TRACE(1,##__VA_ARGS__)
#else
#include <stdio.h>
#define print(...) printf(##__VA_ARGS__)
#endif
#define dbgTestPL() print("[lc3][test]%s/%d#%s()\n",__file__,__LINE__,__FUNCTION__);
#define dbgTestPDL(x) print("[lc3][test]%s/%d#%s()"#x"=%d\n",__file__,__LINE__,__FUNCTION__,x);
#define dbgTestPSL(x) print("[lc3][test]%s/%d#%s()"#x"=%s\n",__file__,__LINE__,__FUNCTION__,x);
#define dbgTestPPL(x) print("[lc3][test]%s/%d#%s()"#x"=%p\n",__file__,__LINE__,__FUNCTION__,x);
#define dbgTestPXL(s,...) print("[lc3][test]%s/%d#%s()"#s"\n",__file__,__LINE__,__FUNCTION__,##__VA_ARGS__);
#define dbgTestPXL0(s) print("[lc3][test]%s/%d#%s()"#s"\n",__file__,__LINE__,__FUNCTION__);
#define dbgErrPL() print("[lc3][err]%s/%d#%s()\n",__file__,__LINE__,__FUNCTION__);
#define dbgErrPDL(x) print("[lc3][err]%s/%d#%s()"#x"=%d\n",__file__,__LINE__,__FUNCTION__,x);
#define dbgErrPSL(x) print("[lc3][err]%s/%d#%s()"#x"=%s\n",__file__,__LINE__,__FUNCTION__,x);
#define dbgErrPPL(x) print("[lc3][err]%s/%d#%s()"#x"=%p\n",__file__,__LINE__,__FUNCTION__,x);
#define dbgErrPXL(s,...) print("[lc3][err]%s/%d#%s()"#s"\n",__file__,__LINE__,__FUNCTION__,##__VA_ARGS__);
#define returnIfErrC(v,c)if(c){print("[lc3][err]%s/%d#%s()"#c"\n",__file__,__LINE__,__FUNCTION__);return v;}
#define returnIfErrCS(v,c,s,...)if(c){print("[lc3][err]%s/%d#%s()"#c"#"#s"\n",__file__,__LINE__,__FUNCTION__,##__VA_ARGS__);return v;}
#define returnIfErrC0(c)if(c){print("[lc3][err]%s/%d#%s()"#c"\n",__file__,__LINE__,__FUNCTION__);return;}
#define returnIfErrCS0(c,s,...)if(c){print("[lc3][err]%s/%d#%s()"#c"#"#s"\n",__file__,__LINE__,__FUNCTION__,##__VA_ARGS__);return;}
#elif 1
#include "smf_debug.h"
#define print(s,...) dbgTestPXL(s,##__VA_ARGS__)
#else
#define print(...) 
#endif

#define ERROR(v) (LC3_MODUL*1000000+v*10000+__LINE__)

//#undef LC3_ENABLE
//#undef LC3PLUS_ENABLE
//#define LC3_ENABLE
//#define LC3PLUS_ENABLE

