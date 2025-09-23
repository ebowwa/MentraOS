# Xiaomi AI Glasses Reverse Engineering Notes

## Summary
Successfully reverse engineered the WiFi hotspot creation process for Xiaomi AI Glasses through logcat analysis of the `com.xiaomi.superhexa` Android app.

## Key Findings

### WiFi Credentials Discovered
- **SSID**: `Xiaomi AI Glasses 54F7`
- **Password**: `8Nhien3qim3X`
- **Gateway**: `192.168.43.1`
- **API Base**: `http://192.168.43.1:8080/v1/`

### Device Information
- **MAC Address**: `04:34:C3:4E:54:F7`
- **Device Model**: Xiaomi AI Glasses
- **Package Name**: `com.xiaomi.superhexa`
- **Device ID (internal)**: `969111288`

### API Endpoints Discovered
- `/v1/filelists` - Lists available files on glasses
- `/v1/files/thumbnail/[filename]` - Gets thumbnails  
- `/v1/filelists/[filename]` - Downloads files
- `/v1/files/?id=[id]` (DELETE) - Removes files after download

## BLE Protocol Analysis

### Protocol Structure
Based on logcat analysis, the protocol uses this format:
```
Header: A5A5 (start marker)
Type: 03 (data packet)
Sequence: Variable sequence number
Size: Data length in little-endian
Data: Payload
CRC: Checksum
```

### Critical Communication Sequence

#### 1. Photo Sync Trigger (Type 101 Message)
```
Device-Sync: MiWearDeviceContactEngineImpl callTimeoutWithData did=969111288,type=101,needResponse=true
TaskQueueV2: -------------> SEND: DATA base: 51, nextseq: 52, size: 8, seq: 51, frx: 0
```

#### 2. Glasses Response (67-byte WiFi Configuration)
```
TaskQueueV2: -------------> RECEIVE: DATA: seq-> 93, size:67, frx:0
SppChannel: onDataReceive: A5A503634300ABBD
```

#### 3. WiFi AP Creation Log Entry
```
O95FileSpace: wiFi AP:gateway: "192.168.43.1"
password: "8Nhien3qim3X"  
ssid: "Xiaomi AI Glasses 54F7"
```

## Key Log Timestamps
- **22:33:42** - Successful hotspot creation cycle
- **22:36:09** - Another successful cycle  
- **22:36:28.110** - WiFi credentials logged

## Communication Flow
1. Phone sends BLE command (type 101) to glasses requesting photo sync
2. Glasses create WiFi hotspot with SSID "Xiaomi AI Glasses 54F7"
3. Glasses send 67-byte response containing WiFi credentials via BLE
4. Phone receives credentials and connects to hotspot
5. HTTP API becomes accessible at `192.168.43.1:8080`

## Password Analysis
- **Password is DYNAMIC and changes each session**
- Examples observed:
  - Session 1: `8Nhien3qim3X`
  - Session 2: `Unx4DR3nKvXp`
- SSID remains consistent: `Xiaomi AI Glasses 54F7`
- Must capture password from logcat in real-time

## Methods to Trigger Hotspot

### Method 1: WiFi Auto-Connect Prevention (Recommended)
1. Trigger photo sync in Xiaomi app
2. When WiFi notification appears, **don't connect** on phone
3. Connect from PC using discovered credentials
4. Access API directly

### Method 2: BLE Command Replication (Complex)
- Requires reverse engineering the complete pairing/authentication process
- Complex due to custom protocol and device association requirements
- Phone is already paired, making it easier to work from there

### Method 3: Phone-Based Automation (Suggested)
Since the phone is already paired and authenticated:
- Use Android automation (Tasker, shell scripts, etc.)
- Trigger photo sync programmatically  
- Prevent auto-WiFi connection
- Leave hotspot open for PC access

## Technical Details

### BLE Protocol Patterns
```
Start: A5A5
Type: 03 (DATA)
Seq: Incrementing sequence number
Size: Little-endian data length
Data: Command payload
CRC: Error checking
```

### Example Successful Packets
- **Send**: Type 101, 8 bytes, seq 51
- **Receive**: 67 bytes, seq 93, contains WiFi config
- **CRC Examples**: ABBD, 466E, EFF5

### Device Communication
- Uses both Classic Bluetooth and BLE (`DUAL` mode)
- Custom protocol over BLE for control commands
- SPP (Serial Port Profile) for data transfer
- Complex authentication/pairing process

## Recommendations

### Immediate Approach
1. **Use the phone-based method** since it's already paired
2. Create Android automation to:
   - Trigger photo sync in Xiaomi app
   - Disable auto-WiFi connection temporarily
   - Allow manual PC connection to hotspot

### Alternative Approach  
1. **Network forgetting**: Remove saved WiFi network
2. **Manual trigger**: Use app to start photo sync
3. **Ignore notification**: Don't connect on phone
4. **PC connection**: Connect directly with known credentials

### For Full BLE Reverse Engineering
- Would need to capture complete pairing process
- Analyze authentication handshake
- Reverse engineer custom protocol commands
- Significantly more complex than phone-based approach

## Security Notes
- WiFi password is **DYNAMIC** and changes each session
- Password appears to be randomly generated each time
- API accessible without additional authentication once connected
- Standard WPA2-PSK security on hotspot

## Auto-Connection Issue Resolution

### Problem
Phone automatically connects to "Xiaomi AI Glasses 54F7" instead of showing network suggestion prompt, preventing manual PC connection.

### Root Cause
The network is created as an **ephemeral** network with changing network IDs (60, 61, 63, 65, 66, 67). Android caches these ephemeral networks and auto-connects without user prompts.

### Simple Solution
**Method 1: Airplane Mode Technique (Most Reliable)**
1. Trigger photo sync in Xiaomi app
2. When you see the WiFi credentials in logcat, **immediately enable airplane mode**
3. This disconnects the phone before it can auto-connect
4. Connect to the hotspot from PC using captured credentials
5. Turn off airplane mode after PC is connected

**Method 2: Quick WiFi Toggle (Alternative)**
1. Run the password capture script: `./xiaomi_glasses_wifi_capture.sh`
2. Trigger photo sync in Xiaomi app  
3. When credentials appear, **quickly turn off WiFi** on phone
4. Connect to hotspot from PC before turning WiFi back on

**Method 3: App Background Restriction**
1. Go to App Settings → Xiaomi app → Battery → Background App Refresh
2. Turn OFF "Background App Refresh" temporarily
3. This may prevent automatic network connection behavior

### Alternative Solutions (Not Recommended)
- ~~Clear Xiaomi app data~~ - Too disruptive, requires full app setup again
- ~~Restart WiFi~~ - Doesn't clear ephemeral network cache  
- ~~Remove network manually~~ - ADB lacks permissions for network management

## Real-Time Password Capture Script

A script has been created to automatically capture WiFi credentials from logcat: `xiaomi_glasses_wifi_capture.sh`

### Usage
```bash
./xiaomi_glasses_wifi_capture.sh
```

### How it Works
1. Monitors logcat for O95FileSpace messages
2. Detects WiFi credential lines containing "wiFi AP"
3. Extracts SSID, password, and gateway information
4. Saves credentials to `/tmp/xiaomi_wifi_credentials.txt`
5. Provides ready-to-use connection commands

### Workflow
1. Run the script in terminal
2. Trigger photo sync in Xiaomi app
3. When WiFi notification appears, **ignore it** on phone
4. Script will capture and display the dynamic password
5. Connect to hotspot from PC using captured credentials

## File Examples Downloaded
During successful session, app downloaded:
- `VID_20250702222615.mp4` (2.2s video)
- `IMG_20250702222606.jpeg` (4032x3024 image)
- `IMG_20250702222603.jpeg` (4032x3024 image)

All files were processed and enhanced by the app's AI pipeline before storage.