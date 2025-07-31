/*** 
 * @Author       : XK
 * @Date         : 2025-06-23 10:11:36
 * @LastEditTime : 2025-06-23 10:11:40
 * @FilePath     : xyzn_crc.h
 * @Description  : 
 * @
 * @Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved. 
 */

 #ifndef __XYZN_CRC_H__
 #define __XYZN_CRC_H__



uint16_t xyzn_crc16_ccitt(uint8_t *ucbuf, uint16_t iLen);

uint8_t zyzn_crc8(const uint8_t *data, uint16_t len);
#endif // __XYZN_CRC_H__

