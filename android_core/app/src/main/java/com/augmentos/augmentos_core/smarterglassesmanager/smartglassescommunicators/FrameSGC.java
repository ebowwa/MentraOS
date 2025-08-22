package com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import androidx.preference.PreferenceManager;

import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchDiscoverEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchStopEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;

import org.greenrobot.eventbus.EventBus;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.HashSet;
import java.util.Set;
import java.util.Queue;
import java.util.LinkedList;

/**
 * Smart Glasses Communicator for Brilliant Labs Frame glasses
 * Uses BLE to communicate with Frame via Lua commands
 */
public class FrameSGC extends SmartGlassesCommunicator {
  private static final String TAG = "WearableAi_FrameSGC";
  
  // Frame BLE Service and Characteristic UUIDs
  private static final UUID FRAME_SERVICE_UUID = UUID.fromString("7A230001-5475-A6A4-654C-8431F6AD49C4");
  private static final UUID FRAME_TX_CHAR_UUID = UUID.fromString("7A230002-5475-A6A4-654C-8431F6AD49C4"); // Phone → Frame
  private static final UUID FRAME_RX_CHAR_UUID = UUID.fromString("7A230003-5475-A6A4-654C-8431F6AD49C4"); // Frame → Phone
  private static final UUID CLIENT_CHARACTERISTIC_CONFIG_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
  
  // Preferences
  private static final String PREFS_NAME = "FramePrefs";
  private static final String PREF_LAST_DEVICE_NAME = "LastFrameDeviceName";
  
  // Connection state
  private Context context;
  private SmartGlassesDevice smartGlassesDevice;
  private BluetoothAdapter bluetoothAdapter;
  private BluetoothLeScanner bluetoothScanner;
  private BluetoothGatt bluetoothGatt;
  private BluetoothDevice connectedDevice;
  private BluetoothGattCharacteristic txCharacteristic;
  private BluetoothGattCharacteristic rxCharacteristic;
  private Handler handler = new Handler(Looper.getMainLooper());
  private boolean isScanning = false;
  private boolean isConnecting = false;
  private boolean isKilled = false;
  private String savedFrameDeviceName = null;
  private Set<String> discoveredDeviceAddresses = new HashSet<>();
  
  // Command queue system
  private final Queue<String> commandQueue = new LinkedList<>();
  private boolean isProcessingQueue = false;
  private static final int COMMAND_DELAY_MS = 100; // Increased delay between commands
  private static final int MAX_QUEUE_SIZE = 3; // Drop old commands if queue gets too long
  
  // Reconnection parameters
  private static final int MAX_RECONNECT_ATTEMPTS = 5;
  private static final int BASE_RECONNECT_DELAY_MS = 2000;
  private int reconnectAttempts = 0;
  
  public FrameSGC(Context context, SmartGlassesDevice smartGlassesDevice) {
    super();
    this.context = context;
    this.smartGlassesDevice = smartGlassesDevice;
    
    // Initialize Bluetooth
    BluetoothManager bluetoothManager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
    if (bluetoothManager != null) {
      bluetoothAdapter = bluetoothManager.getAdapter();
      if (bluetoothAdapter != null) {
        bluetoothScanner = bluetoothAdapter.getBluetoothLeScanner();
      }
    }
    
    Log.d(TAG, "FrameSGC initialized");
  }
  
  @Override
  public void findCompatibleDeviceNames() {
    Log.d(TAG, "Starting scan for Frame devices");
    
    if (bluetoothScanner == null) {
      Log.e(TAG, "Bluetooth scanner not available");
      return;
    }
    
    if (isScanning) {
      Log.d(TAG, "Already scanning");
      return;
    }
    
    isScanning = true;
    
    // Clear previously discovered devices for a fresh scan
    discoveredDeviceAddresses.clear();
    
    // Create scan filter for Frame service UUID
    List<ScanFilter> filters = new ArrayList<>();
    ScanFilter filter = new ScanFilter.Builder()
        .setServiceUuid(new ParcelUuid(FRAME_SERVICE_UUID))
        .build();
    filters.add(filter);
    
    // Scan settings
    ScanSettings settings = new ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
        .build();
    
    // Start scan
    bluetoothScanner.startScan(filters, settings, scanCallback);
    
    // Stop scan after 10 seconds
    handler.postDelayed(() -> {
      if (isScanning) {
        stopScanning();
        if (smartGlassesDevice != null) {
          EventBus.getDefault().post(new GlassesBluetoothSearchStopEvent(smartGlassesDevice.deviceModelName));
        }
      }
    }, 10000);
  }
  
  private final ScanCallback scanCallback = new ScanCallback() {
    @Override
    public void onScanResult(int callbackType, ScanResult result) {
      BluetoothDevice device = result.getDevice();
      String deviceName = device.getName();
      String deviceAddress = device.getAddress();
      
      if (deviceName != null && (deviceName.contains("Frame") || deviceName.contains("frame"))) {
        // Check if we've already discovered this device
        if (!discoveredDeviceAddresses.contains(deviceAddress)) {
          discoveredDeviceAddresses.add(deviceAddress);
          
          Log.d(TAG, "Found Frame device: " + deviceName + " (" + deviceAddress + ")");
          
          // Post discovery event with model name and actual device name
          EventBus.getDefault().post(new GlassesBluetoothSearchDiscoverEvent(
              smartGlassesDevice.deviceModelName,
              deviceName
          ));
          
          // Save device name for later connection
          savedFrameDeviceName = deviceName;
        }
      }
    }
    
    @Override
    public void onScanFailed(int errorCode) {
      Log.e(TAG, "Scan failed with error: " + errorCode);
      isScanning = false;
    }
  };
  
  private void stopScanning() {
    if (bluetoothScanner != null && isScanning) {
      bluetoothScanner.stopScan(scanCallback);
      isScanning = false;
      Log.d(TAG, "Stopped scanning");
    }
  }
  
  @Override
  public void connectToSmartGlasses() {
    Log.d(TAG, "Connecting to Frame glasses");
    
    // Stop scanning if we're still scanning
    if (isScanning) {
      stopScanning();
    }
    
    if (isConnecting) {
      Log.d(TAG, "Already connecting");
      return;
    }
    
    // Load saved device name from preferences
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    String savedDeviceName = prefs.getString(PREF_LAST_DEVICE_NAME, null);
    
    // Use savedFrameDeviceName from scanning if available, otherwise use saved preference
    String targetDeviceName = savedFrameDeviceName != null ? savedFrameDeviceName : savedDeviceName;
    
    if (targetDeviceName == null) {
      Log.e(TAG, "No Frame device name available, starting scan");
      // Start scanning to find a Frame device
      findCompatibleDeviceNames();
      return;
    }
    
    // Find the device by scanning for it
    Log.d(TAG, "Looking for Frame device with name: " + targetDeviceName);
    connectionEvent(SmartGlassesConnectionState.CONNECTING);
    isConnecting = true;
    
    // Start a targeted scan for the specific device name
    startTargetedScan(targetDeviceName);
  }
  
  private void startTargetedScan(String targetDeviceName) {
    if (bluetoothScanner == null) {
      Log.e(TAG, "Bluetooth scanner not available");
      connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
      isConnecting = false;
      return;
    }
    
    // Scan settings for targeted search
    ScanSettings settings = new ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
        .build();
    
    // Create a specific scan callback for connection
    ScanCallback connectionScanCallback = new ScanCallback() {
      private boolean foundDevice = false;
      
      @Override
      public void onScanResult(int callbackType, ScanResult result) {
        // Prevent multiple connection attempts
        if (foundDevice) {
          return;
        }
        
        BluetoothDevice device = result.getDevice();
        String deviceName = device.getName();
        
        if (deviceName != null && deviceName.equals(targetDeviceName)) {
          foundDevice = true;
          Log.d(TAG, "Found target Frame device: " + deviceName);
          
          // Stop scanning immediately
          bluetoothScanner.stopScan(this);
          
          // Save device for connection
          connectedDevice = device;
          
          // Close any existing GATT connection
          if (bluetoothGatt != null) {
            bluetoothGatt.close();
            bluetoothGatt = null;
          }
          
          // Connect to GATT server
          bluetoothGatt = connectedDevice.connectGatt(context, false, gattCallback);
        }
      }
      
      @Override
      public void onScanFailed(int errorCode) {
        Log.e(TAG, "Connection scan failed with error: " + errorCode);
        isConnecting = false;
        connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
      }
    };
    
    // Start scan with Frame service filter
    List<ScanFilter> filters = new ArrayList<>();
    ScanFilter filter = new ScanFilter.Builder()
        .setServiceUuid(new ParcelUuid(FRAME_SERVICE_UUID))
        .build();
    filters.add(filter);
    
    bluetoothScanner.startScan(filters, settings, connectionScanCallback);
    
    // Timeout after 10 seconds
    handler.postDelayed(() -> {
      bluetoothScanner.stopScan(connectionScanCallback);
      if (connectedDevice == null) {
        Log.e(TAG, "Failed to find Frame device: " + targetDeviceName);
        isConnecting = false;
        connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
      }
    }, 10000);
  }
  
  private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
    @Override
    public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        Log.d(TAG, "BLE connected to Frame - negotiating MTU");
        isConnecting = false;
        reconnectAttempts = 0;
        
        // Save device name
        String deviceName = gatt.getDevice().getName();
        if (deviceName != null) {
          SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
          prefs.edit().putString(PREF_LAST_DEVICE_NAME, deviceName).apply();
          savedFrameDeviceName = deviceName;
          Log.d(TAG, "Saved Frame device name: " + deviceName);
        }
        
        // Request larger MTU for better Lua command support (Frame docs mention 251 max)
        boolean mtuRequested = gatt.requestMtu(251);
        Log.d(TAG, "MTU negotiation requested: " + mtuRequested);
        
        // If MTU request fails, continue with service discovery
        if (!mtuRequested) {
          Log.w(TAG, "MTU request failed, continuing with default MTU");
          handler.postDelayed(() -> {
            if (bluetoothGatt != null) {
              Log.d(TAG, "Starting service discovery (no MTU negotiation)");
              bluetoothGatt.discoverServices();
            }
          }, 600);
        }
        
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        Log.d(TAG, "Disconnected from Frame");
        isConnecting = false;
        connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
        
        // Clean up
        txCharacteristic = null;
        rxCharacteristic = null;
        
        // Try to reconnect if not killed
        if (!isKilled && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          int delay = BASE_RECONNECT_DELAY_MS * reconnectAttempts;
          Log.d(TAG, "Attempting reconnect in " + delay + "ms (attempt " + reconnectAttempts + ")");
          handler.postDelayed(() -> connectToSmartGlasses(), delay);
        }
      }
    }
    
    @Override
    public void onServicesDiscovered(BluetoothGatt gatt, int status) {
      if (status == BluetoothGatt.GATT_SUCCESS) {
        Log.d(TAG, "Services discovered");
        
        // Get Frame service
        BluetoothGattService frameService = gatt.getService(FRAME_SERVICE_UUID);
        if (frameService != null) {
          // Get characteristics
          txCharacteristic = frameService.getCharacteristic(FRAME_TX_CHAR_UUID);
          rxCharacteristic = frameService.getCharacteristic(FRAME_RX_CHAR_UUID);
          
          if (txCharacteristic != null && rxCharacteristic != null) {
            Log.d(TAG, "Found Frame characteristics");
            
            // Enable notifications on RX characteristic
            boolean notificationSet = gatt.setCharacteristicNotification(rxCharacteristic, true);
            Log.d(TAG, "Notification enabled: " + notificationSet);
            
            BluetoothGattDescriptor descriptor = rxCharacteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID);
            if (descriptor != null) {
              descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
              boolean descriptorWritten = gatt.writeDescriptor(descriptor);
              Log.d(TAG, "Descriptor write initiated: " + descriptorWritten);
              // Wait for onDescriptorWrite callback before declaring connection successful
            } else {
              Log.w(TAG, "Notification descriptor not found, continuing anyway");
              // Connection successful even without notifications
              connectionEvent(SmartGlassesConnectionState.CONNECTED);
              // Initialize Frame display
              handler.postDelayed(() -> initializeFrame(), 1000);
            }
          } else {
            Log.e(TAG, "Frame characteristics not found");
            connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
          }
        } else {
          Log.e(TAG, "Frame service not found");
          connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
        }
      }
    }
    
    @Override
    public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
      if (status == BluetoothGatt.GATT_SUCCESS) {
        Log.d(TAG, "MTU changed successfully to: " + mtu + " bytes");
      } else {
        Log.w(TAG, "MTU change failed, status: " + status + ", using default MTU");
      }
      
      // Continue with service discovery after MTU negotiation (success or failure)
      handler.postDelayed(() -> {
        if (bluetoothGatt != null) {
          Log.d(TAG, "Starting service discovery after MTU negotiation");
          bluetoothGatt.discoverServices();
        }
      }, 100);
    }
    
    @Override
    public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
      if (status == BluetoothGatt.GATT_SUCCESS) {
        Log.d(TAG, "Descriptor written successfully");
        if (descriptor.getUuid().equals(CLIENT_CHARACTERISTIC_CONFIG_UUID)) {
          // Now we're fully connected and ready
          connectionEvent(SmartGlassesConnectionState.CONNECTED);
          // Initialize Frame display
          handler.postDelayed(() -> initializeFrame(), 1000);
        }
      } else {
        Log.e(TAG, "Failed to write descriptor, status: " + status);
        // Still try to connect even if notifications fail
        connectionEvent(SmartGlassesConnectionState.CONNECTED);
        handler.postDelayed(() -> initializeFrame(), 1000);
      }
    }
    
    @Override
    public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
      if (characteristic.getUuid().equals(FRAME_RX_CHAR_UUID)) {
        byte[] data = characteristic.getValue();
        if (data != null) {
          String response = new String(data, StandardCharsets.UTF_8);
          Log.d(TAG, "Received from Frame: " + response);
          // Handle Frame responses here
        }
      }
    }
    
    @Override
    public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
      if (status == BluetoothGatt.GATT_SUCCESS) {
        Log.d(TAG, "Successfully wrote to Frame");
      } else {
        Log.e(TAG, "Failed to write to Frame, status: " + status);
      }
      
      // Mark processing complete and schedule next command
      isProcessingQueue = false;
      handler.postDelayed(() -> processQueue(), COMMAND_DELAY_MS);
    }
  };
  
  private void initializeFrame() {
    Log.d(TAG, "Initializing Frame display");
    
    // First send break signal to stop any running main.lua (like Noa app)
    // This should change Frame from "Tap me in" to "Frame is Paired" 
    sendBreakSignal();
    
    // Wait a moment for break signal to take effect, then send welcome message
    handler.postDelayed(() -> {
      queueCommand("frame.display.text('MentraOS Connected!\\nReady for apps...', 1, 1, {spacing=2});frame.display.show();print(nil)");
    }, 500);
  }
  
  private void queueCommand(String command) {
    if (command == null || command.isEmpty()) {
      return;
    }
    
    synchronized (commandQueue) {
      // If queue is getting too long, drop old commands to keep display responsive
      while (commandQueue.size() >= MAX_QUEUE_SIZE) {
        String dropped = commandQueue.poll();
        Log.d(TAG, "Dropped old command to prevent backlog: " + dropped);
      }
      
      commandQueue.offer(command);
      Log.d(TAG, "Queued command: " + command + " (queue size: " + commandQueue.size() + ")");
    }
    
    // Start processing queue if not already processing
    processQueue();
  }
  
  private void processQueue() {
    if (isProcessingQueue) {
      return; // Already processing
    }
    
    synchronized (commandQueue) {
      if (commandQueue.isEmpty()) {
        isProcessingQueue = false;
        return;
      }
      
      String command = commandQueue.poll();
      if (command != null) {
        isProcessingQueue = true;
        sendLuaCommandDirect(command);
      }
    }
  }
  
  private void sendLuaCommandDirect(String command) {
    if (txCharacteristic == null || bluetoothGatt == null) {
      Log.e(TAG, "Cannot send command, not connected");
      isProcessingQueue = false;
      synchronized (commandQueue) {
        commandQueue.clear(); // Clear queue if disconnected
      }
      return;
    }
    
    // Don't add print(nil) if it's already there
    // This allows us to send complete command chains
    if (!command.contains("print(")) {
      // For standalone commands, add print(nil) to get a response
      if (!command.contains(";")) {
        command = command.trim() + ";print(nil)";
      }
    }
    
    // Ensure command ends with newline for Frame to process it
    if (!command.endsWith("\n")) {
      command = command + "\n";
    }
    
    Log.d(TAG, "Sending Lua command: " + command.trim());
    byte[] data = command.getBytes(StandardCharsets.UTF_8);
    
    // Handle MTU limitations - Frame typically supports 251 byte MTU
    if (data.length > 247) { // Leave room for BLE overhead
      Log.w(TAG, "Command too long, truncating");
      byte[] truncated = new byte[247];
      System.arraycopy(data, 0, truncated, 0, 247);
      data = truncated;
    }
    
    txCharacteristic.setValue(data);
    boolean success = bluetoothGatt.writeCharacteristic(txCharacteristic);
    if (!success) {
      Log.e(TAG, "Failed to write characteristic - will retry");
      // Re-queue the command for retry
      synchronized (commandQueue) {
        ((LinkedList<String>)commandQueue).addFirst(command.trim());
      }
      isProcessingQueue = false;
      // Retry after a delay
      handler.postDelayed(this::processQueue, COMMAND_DELAY_MS * 2);
    }
  }
  
  /**
   * Send break signal (0x03) to stop any running main.lua script
   * This should change Frame from "Tap me in" to "Frame is Paired"
   */
  private void sendBreakSignal() {
    Log.d(TAG, "Sending break signal to stop running script");
    byte[] breakSignal = new byte[]{0x03};
    sendRawData(breakSignal);
  }
  
  /**
   * Send reset signal (0x04) to clear variables and restart main.lua
   */
  private void sendResetSignal() {
    Log.d(TAG, "Sending reset signal");
    byte[] resetSignal = new byte[]{0x04};
    sendRawData(resetSignal);
  }
  
  private void sendRawData(byte[] data) {
    if (txCharacteristic == null || bluetoothGatt == null) {
      Log.e(TAG, "Cannot send raw data, not connected");
      return;
    }
    
    Log.d(TAG, "Sending raw data: " + java.util.Arrays.toString(data));
    txCharacteristic.setValue(data);
    boolean success = bluetoothGatt.writeCharacteristic(txCharacteristic);
    if (!success) {
      Log.e(TAG, "Failed to write raw data");
    }
  }
  
  @Override
  public void blankScreen() {
    // Frame doesn't have clear() - draw empty text to "clear" and show it
    queueCommand("frame.display.text(' ', 1, 1);frame.display.show();print(nil)");
  }
  
  @Override
  public void displayTextWall(String text) {
    if (text == null) {
      text = "";
    }
    
    // Escape special characters for Lua string (and remove newlines)
    String escapedText = escapeForLua(text);
    
    // Break text into lines 
    String[] words = escapedText.split(" ");
    
    int maxLineLength = 30; // Short enough to avoid MTU issues
    int lineHeight = 55;    // Good spacing
    int startY = 20;        // Starting Y position
    int maxLines = 3;       // Limit to 3 lines for reliability
    
    StringBuilder currentLine = new StringBuilder();
    List<String> lines = new ArrayList<>();
    
    // Build lines
    for (String word : words) {
      if (lines.size() >= maxLines) break;
      
      // Check if adding this word would exceed line length
      if (currentLine.length() + word.length() + 1 > maxLineLength) {
        if (currentLine.length() > 0) {
          lines.add(currentLine.toString().trim());
          currentLine = new StringBuilder();
        }
      }
      
      if (currentLine.length() > 0) {
        currentLine.append(" ");
      }
      currentLine.append(word);
    }
    
    // Add final line if there's content
    if (currentLine.length() > 0 && lines.size() < maxLines) {
      lines.add(currentLine.toString().trim());
    }
    
    // Build a single batched command for all lines
    StringBuilder batchCommand = new StringBuilder();
    for (int i = 0; i < lines.size(); i++) {
      int yPos = startY + (i * lineHeight);
      batchCommand.append(String.format("frame.display.text('%s', 10, %d);", 
          lines.get(i), yPos));
    }
    batchCommand.append("frame.display.show();print(nil)");
    
    // Send as single command if it fits, otherwise send separately
    if (batchCommand.length() < 240) {
      queueCommand(batchCommand.toString());
    } else {
      // Send each line separately if batched is too long
      for (int i = 0; i < lines.size(); i++) {
        int yPos = startY + (i * lineHeight);
        String lineCommand = String.format("frame.display.text('%s', 10, %d);print(nil)", 
            lines.get(i), yPos);
        queueCommand(lineCommand);
      }
      queueCommand("frame.display.show();print(nil)");
    }
  }
  
  @Override
  public void displayDoubleTextWall(String textTop, String textBottom) {
    if (textTop == null) textTop = "";
    if (textBottom == null) textBottom = "";
    
    String escapedTop = escapeForLua(textTop);
    String escapedBottom = escapeForLua(textBottom);
    
    // Send as combined command chain
    String command = String.format("frame.display.text('%s', 50, 150);frame.display.text('%s', 50, 250);frame.display.show();print(nil)", 
        escapedTop, escapedBottom);
    queueCommand(command);
  }
  
  @Override
  public void displayTextLine(String text) {
    if (text == null) text = "";
    
    String escapedText = escapeForLua(text);
    String command = String.format("frame.display.text('%s', 50, 200);frame.display.show();print(nil)", escapedText);
    queueCommand(command);
  }
  
  @Override
  public void displayReferenceCardSimple(String title, String body) {
    if (title == null) title = "";
    if (body == null) body = "";
    
    String escapedTitle = escapeForLua(title);
    String escapedBody = escapeForLua(body);
    
    // Send as combined command chain
    String command = String.format("frame.display.text('%s', 50, 100);frame.display.text('%s', 50, 180);frame.display.show();print(nil)",
        escapedTitle, escapedBody);
    queueCommand(command);
  }
  
  @Override
  public void displayBulletList(String title, String[] bullets) {
    if (title == null) title = "";
    if (bullets == null) bullets = new String[0];
    
    // Build combined command
    StringBuilder cmd = new StringBuilder();
    cmd.append(String.format("frame.display.text('%s', 50, 50);", escapeForLua(title)));
    
    // Add bullets
    int yPos = 100;
    for (String bullet : bullets) {
      if (bullet != null) {
        cmd.append(String.format("frame.display.text('• %s', 60, %d);", escapeForLua(bullet), yPos));
        yPos += 40;
        if (yPos > 350) break; // Don't go off screen
      }
    }
    
    // Show everything
    cmd.append("frame.display.show();print(nil)");
    queueCommand(cmd.toString());
  }
  
  @Override
  public void displayRowsCard(String[] rowStrings) {
    if (rowStrings == null) rowStrings = new String[0];
    
    StringBuilder cmd = new StringBuilder();
    int yPos = 50;
    for (String row : rowStrings) {
      if (row != null) {
        cmd.append(String.format("frame.display.text('%s', 50, %d);", escapeForLua(row), yPos));
        yPos += 50;
        if (yPos > 350) break; // Don't go off screen
      }
    }
    
    // Show all rows
    cmd.append("frame.display.show();print(nil)");
    queueCommand(cmd.toString());
  }
  
  @Override
  public void displayPromptView(String title, String[] options) {
    if (title == null) title = "";
    if (options == null) options = new String[0];
    
    StringBuilder cmd = new StringBuilder();
    cmd.append(String.format("frame.display.text('%s', 50, 50);", escapeForLua(title)));
    
    // Add options
    int yPos = 120;
    for (int i = 0; i < options.length && i < 5; i++) { // Limit to 5 options
      if (options[i] != null) {
        cmd.append(String.format("frame.display.text('%d. %s', 60, %d);", i + 1, escapeForLua(options[i]), yPos));
        yPos += 40;
      }
    }
    
    // Show prompt
    cmd.append("frame.display.show();print(nil)");
    queueCommand(cmd.toString());
  }
  
  @Override
  public void displayBitmap(Bitmap bmp) {
    // Stub for v1 - will implement in v2
    Log.d(TAG, "Bitmap display not implemented in v1");
    displayTextWall("Image display coming in v2");
  }
  
  @Override
  public void displayReferenceCardImage(String title, String body, String imgUrl) {
    // For v1, just display text without image
    displayReferenceCardSimple(title, body);
  }
  
  @Override
  public void displayCustomContent(String json) {
    // For v1, just display the JSON as text
    displayTextWall("Custom: " + json);
  }
  
  @Override
  public void showHomeScreen() {
    // Legacy naming - this actually just clears the display
    blankScreen();
  }
  
  @Override
  public void showNaturalLanguageCommandScreen(String prompt, String naturalLanguageArgs) {
    String escapedPrompt = escapeForLua(prompt);
    String escapedArgs = escapeForLua(naturalLanguageArgs);
    
    String command = String.format("frame.display.text('%s', 50, 100);frame.display.text('%s', 50, 200);frame.display.show();print(nil)",
        escapedPrompt, escapedArgs);
    queueCommand(command);
  }
  
  @Override
  public void updateNaturalLanguageCommandScreen(String naturalLanguageArgs) {
    String escapedArgs = escapeForLua(naturalLanguageArgs);
    String command = String.format("frame.display.text('%s', 50, 200);frame.display.show();print(nil)", escapedArgs);
    queueCommand(command);
  }
  
  @Override
  public void startScrollingTextViewMode(String title) {
    super.startScrollingTextViewMode(title);
    String escapedTitle = escapeForLua(title);
    String command = String.format("frame.display.text('%s', 50, 50);frame.display.show();print(nil)", escapedTitle);
    queueCommand(command);
  }
  
  @Override
  public void scrollingTextViewIntermediateText(String text) {
    // For scrolling text, we'll just update the display
    displayTextWall(text);
  }
  
  @Override
  public void scrollingTextViewFinalText(String text) {
    displayTextWall(text);
  }
  
  @Override
  public void stopScrollingTextViewMode() {
    // Nothing special needed
  }
  
  @Override
  public void setFontSize(SmartGlassesFontSize fontSize) {
    // Frame uses Lua to set font size, we'll handle this in individual display methods
    Log.d(TAG, "Font size setting noted: " + fontSize);
  }
  
  @Override
  protected void setFontSizes() {
    // Frame font sizes (these are arbitrary for now, can be tuned)
    LARGE_FONT = 32;
    MEDIUM_FONT = 20;
    SMALL_FONT = 14;
  }
  
  @Override
  public void destroy() {
    Log.d(TAG, "Destroying FrameSGC");
    isKilled = true;
    
    // Clear command queue
    synchronized (commandQueue) {
      commandQueue.clear();
    }
    isProcessingQueue = false;
    
    stopScanning();
    
    if (bluetoothGatt != null) {
      // Disconnect first if connected
      bluetoothGatt.disconnect();
      // Give it a moment to disconnect cleanly
      try {
        Thread.sleep(100);
      } catch (InterruptedException e) {
        // Ignore
      }
      bluetoothGatt.close();
      bluetoothGatt = null;
    }
    
    txCharacteristic = null;
    rxCharacteristic = null;
    connectedDevice = null;
    savedFrameDeviceName = null;
    
    handler.removeCallbacksAndMessages(null);
  }
  
  /**
   * Escape special characters for Lua strings
   */
  private String escapeForLua(String text) {
    if (text == null) return "";
    
    // For Frame display, remove newlines entirely since they cause syntax errors
    // Frame doesn't support multi-line text display anyway
    return text
        .replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\"", "\\\"")
        .replace("\n", " ")  // Replace newlines with spaces
        .replace("\r", " ")  // Replace carriage returns with spaces
        .replace("\t", " ");  // Replace tabs with spaces
  }
}