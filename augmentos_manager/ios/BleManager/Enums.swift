//
//  File.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/3/25.
//

import Foundation



enum CommandResponse: UInt8 {
    case ACK = 0xC9
}

enum Commands: UInt8 {
    case BLE_EXIT_ALL_FUNCTIONS = 0x18
    case BLE_REQ_INIT = 0x4D
    case BLE_REQ_HEARTBEAT = 0x2C
    case BLE_REQ_EVENAI = 0x4E
    case BLE_REQ_TRANSFER_MIC_DATA = 0xF1
    case BLE_REQ_DEVICE_ORDER = 0xF5
    case BLE_REQ_MIC_ON = 0x0E
}

enum DeviceOrders: UInt8 {
    case DISPLAY_READY = 0x00
    case TRIGGER_CHANGE_PAGE = 0x01
    case TRIGGER_FOR_AI = 0x17
    case TRIGGER_FOR_STOP_RECORDING = 0x18
    case G1_IS_READY = 0x09
    case HEAD_UP = 0x1e
    case HEAD_DOWN = 0x1f
    case SILENCED = 0x04
    case ACTIVATED = 0x05
}

enum DisplayStatus: UInt8 {
    case NORMAL_TEXT = 0x30
    case FINAL_TEXT = 0x40
    case MANUAL_PAGE = 0x50
    case ERROR_TEXT = 0x60
    case SIMPLE_TEXT = 0x70
}
