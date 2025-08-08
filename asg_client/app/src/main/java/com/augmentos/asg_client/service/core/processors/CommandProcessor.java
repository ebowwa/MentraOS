package com.augmentos.asg_client.service.core.processors;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.service.core.handlers.K900CommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.service.core.handlers.OtaCommandHandler;
import com.augmentos.asg_client.service.core.handlers.SettingsCommandHandler;
import com.augmentos.asg_client.service.core.handlers.VersionCommandHandler;
import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.system.interfaces.IStateManager;
import com.augmentos.asg_client.service.media.interfaces.IMediaManager;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.communication.interfaces.IResponseBuilder;
import com.augmentos.asg_client.service.system.interfaces.IConfigurationManager;
import com.augmentos.asg_client.service.core.handlers.PhotoCommandHandler;
import com.augmentos.asg_client.service.core.handlers.VideoCommandHandler;
import com.augmentos.asg_client.service.core.handlers.PhoneReadyCommandHandler;
import com.augmentos.asg_client.service.core.handlers.AuthTokenCommandHandler;
import com.augmentos.asg_client.service.core.handlers.PingCommandHandler;
import com.augmentos.asg_client.service.core.handlers.RtmpCommandHandler;
import com.augmentos.asg_client.service.core.handlers.WifiCommandHandler;
import com.augmentos.asg_client.service.core.handlers.BatteryCommandHandler;

import org.json.JSONObject;


/**
 * CommandProcessor - Orchestrates command processing following SOLID principles.
 * <p>
 * Single Responsibility: Coordinates command routing and delegation
 * Open/Closed: Extensible through handler registration and protocol parsers
 * Liskov Substitution: Uses interface-based handlers and parsers
 * Interface Segregation: Focused interfaces for each concern
 * Dependency Inversion: Depends on abstractions, not concretions
 */
public class CommandProcessor {
    private static final String TAG = "CommandProcessor";

    // Core dependencies (Dependency Inversion Principle)
    private final Context context;
    private final ICommunicationManager communicationManager;
    private final IStateManager stateManager;
    private final IMediaManager streamingManager;
    private final IResponseBuilder responseBuilder;
    private final IConfigurationManager configurationManager;
    private final AsgClientServiceManager serviceManager;
    private final FileManager fileManager;

    // Command processing components
    private final CommandHandlerRegistry commandHandlerRegistry;
    private final CommandParser commandParser;
    private final CommandProtocolDetector protocolDetector;
    private final K900CommandHandler k900CommandHandler;
    private final ResponseSender responseSender;

    public CommandProcessor(Context context, ICommunicationManager communicationManager, IStateManager stateManager, IMediaManager streamingManager, IResponseBuilder responseBuilder, IConfigurationManager configurationManager, AsgClientServiceManager serviceManager, FileManager fileManager) {
        Log.d(TAG, "🔧 Initializing CommandProcessor with dependencies");
        this.context = context;
        this.communicationManager = communicationManager;
        this.stateManager = stateManager;
        this.streamingManager = streamingManager;
        this.responseBuilder = responseBuilder;
        this.configurationManager = configurationManager;
        this.serviceManager = serviceManager;
        this.fileManager = fileManager;

        // Initialize components (Single Responsibility Principle)
        Log.d(TAG, "📦 Creating command processing components");
        this.commandHandlerRegistry = new CommandHandlerRegistry();
        this.commandParser = new CommandParser();
        this.protocolDetector = new CommandProtocolDetector();
        this.k900CommandHandler = new K900CommandHandler(serviceManager, stateManager, communicationManager);
        this.responseSender = new ResponseSender(serviceManager);

        // Register command handlers
        initializeCommandHandlers();
        Log.i(TAG, "✅ CommandProcessor initialization completed successfully");
    }

    /**
     * Main entry point for processing commands from byte data.
     * Follows Single Responsibility Principle by delegating to specialized components.
     */
    public void processCommand(byte[] data) {
        Log.d(TAG, "🚀 processCommand() called with data length: " + (data != null ? data.length : "null"));

        if (data == null || data.length == 0) {
            Log.w(TAG, "⚠️ Received null or empty data - skipping processing");
            return;
        }

        try {
            Log.d(TAG, "📝 Parsing JSON from byte data");
            // Parse JSON from byte data
            JSONObject jsonObject = commandParser.parseToJson(data);
            if (jsonObject == null) {
                Log.w(TAG, "❌ Failed to parse JSON from byte data");
                return;
            }

            Log.d(TAG, "📋 Successfully parsed JSON: " + jsonObject.toString());
            // Process the parsed JSON command
            processJsonCommand(jsonObject);
        } catch (Exception e) {
            Log.e(TAG, "💥 Error processing command from byte data", e);
        }

        Log.d(TAG, "🏁 processCommand() completed");
    }

    /**
     * Process JSON command by delegating to appropriate handlers.
     * Follows Open/Closed Principle by using registry pattern.
     */
    private void processJsonCommand(JSONObject json) {
        Log.d(TAG, "🔄 processJsonCommand() started");

        try {
            // Extract command data
            Log.d(TAG, "🔍 Extracting command data from JSON");
            CommandData commandData = extractCommandData(json);
            if (commandData == null) {
                Log.w(TAG, "⚠️ No command data extracted - processing complete");
                return;
            }

            Log.d(TAG, "📊 Command data extracted - Type: " + commandData.type() + ", MessageID: " + commandData.messageId() + ", Data: " + commandData.data());

            // Send acknowledgment if required
            sendAcknowledgment(commandData);

            // Route to appropriate handler
            routeCommand(commandData);
        } catch (Exception e) {
            Log.e(TAG, "💥 Error processing JSON command", e);
        }

        Log.d(TAG, "🏁 processJsonCommand() completed");
    }

    /**
     * Extract and validate command data from JSON using improved protocol detector.
     */
    private CommandData extractCommandData(JSONObject json) {
        Log.d(TAG, "🔍 extractCommandData() started");

        try {
            // Use protocol detector to identify and extract command data
            Log.d(TAG, "🔬 Detecting protocol type");
            CommandProtocolDetector.ProtocolDetectionResult result = protocolDetector.detectProtocol(json);

            Log.d(TAG, "📊 Protocol detection result - Type: " + result.protocolType().getDisplayName() + ", Valid: " + result.isValid());

            if (!result.isValid()) {
                Log.w(TAG, "❌ Invalid protocol detected: " + result.protocolType().getDisplayName());
                return null;
            }

            switch (result.protocolType()) {
                case K900_PROTOCOL:
                    Log.i(TAG, "🎯 Processing K900 protocol command");
                    // Handle K900 format using dedicated handler
                    k900CommandHandler.processK900Command(json);
                    Log.d(TAG, "✅ K900 command processed successfully");
                    return null; // K900 commands are handled directly

                case JSON_COMMAND:
                    Log.i(TAG, "📋 Processing standard JSON command");
                    // Standard JSON command processing
                    CommandData commandData = new CommandData(result.commandType(), result.extractedData(), result.messageId());
                    Log.d(TAG, "✅ Command data created successfully: " + commandData.type());
                    return commandData;

                case UNKNOWN:
                default:
                    Log.w(TAG, "❓ Unknown protocol type: " + result.protocolType().getDisplayName());
                    return null;
            }
        } catch (Exception e) {
            Log.e(TAG, "💥 Error extracting command data", e);
            return null;
        }
    }

    /**
     * Send acknowledgment for commands with message IDs.
     */
    private void sendAcknowledgment(CommandData commandData) {
        Log.d(TAG, "📤 sendAcknowledgment() called");

        if (commandData != null && commandData.messageId() != -1) {
            Log.d(TAG, "📨 Sending ACK for message ID: " + commandData.messageId());
            communicationManager.sendAckResponse(commandData.messageId());
            Log.d(TAG, "✅ ACK sent successfully for message ID: " + commandData.messageId());
        } else {
            Log.d(TAG, "⏭️ Skipping ACK - no message ID or null command data");
        }
    }

    /**
     * Route command to appropriate handler using registry pattern.
     * Follows Open/Closed Principle - new handlers can be added without modifying this method.
     */
    private void routeCommand(CommandData commandData) {
        Log.d(TAG, "🛣️ routeCommand() started");

        if (commandData == null) {
            Log.d(TAG, "⏭️ Skipping routing - null command data (likely K900 command)");
            return; // K900 commands are handled separately in extractCommandData
        }

        String type = commandData.type();
        Log.i(TAG, "🎯 Routing command type: " + type);

        // Try modern command handler first
        Log.d(TAG, "🔍 Looking up handler for command type: " + type);
        ICommandHandler handler = commandHandlerRegistry.getHandlerByCommandType(type);
        if (handler != null) {
            Log.d(TAG, "✅ Found modern handler: " + handler.getClass().getSimpleName());
            boolean success = handler.handleCommand(type, commandData.data());
            if (success) {
                Log.i(TAG, "✅ Command handled successfully by modern handler: " + type);
            } else {
                Log.w(TAG, "⚠️ Modern handler failed to process command: " + type);
            }
            return;
        }

        // Fall back to legacy processor
        String error = "❌ No handler found for command" + type + ", Implement the handler, or register command type for specific handler";
        Log.e(TAG, error);
        throw new IllegalStateException(error);

    }

    /**
     * Initialize command handlers following Open/Closed Principle.
     * New handlers can be added here without modifying existing code.
     */
    private void initializeCommandHandlers() {
        Log.d(TAG, "🔧 initializeCommandHandlers() started");

        try {
            Log.d(TAG, "📝 Registering command handlers...");

            commandHandlerRegistry.registerHandler(new PhoneReadyCommandHandler(communicationManager, stateManager, responseBuilder));
            Log.d(TAG, "✅ Registered PhoneReadyCommandHandler");

            commandHandlerRegistry.registerHandler(new AuthTokenCommandHandler(communicationManager, configurationManager));
            Log.d(TAG, "✅ Registered AuthTokenCommandHandler");

            commandHandlerRegistry.registerHandler(new PhotoCommandHandler(context, serviceManager, fileManager));
            Log.d(TAG, "✅ Registered PhotoCommandHandler");

            commandHandlerRegistry.registerHandler(new VideoCommandHandler(context, serviceManager, streamingManager, fileManager));
            Log.d(TAG, "✅ Registered VideoCommandHandler");

            commandHandlerRegistry.registerHandler(new PingCommandHandler(communicationManager, responseBuilder));
            Log.d(TAG, "✅ Registered PingCommandHandler");

            commandHandlerRegistry.registerHandler(new RtmpCommandHandler(context, stateManager, streamingManager));
            Log.d(TAG, "✅ Registered RtmpCommandHandler");

            commandHandlerRegistry.registerHandler(new WifiCommandHandler(serviceManager, communicationManager, stateManager));
            Log.d(TAG, "✅ Registered WifiCommandHandler");

            commandHandlerRegistry.registerHandler(new BatteryCommandHandler(stateManager));
            Log.d(TAG, "✅ Registered BatteryCommandHandler");

            commandHandlerRegistry.registerHandler(new VersionCommandHandler(context, serviceManager));
            Log.d(TAG, "✅ Registered VersionCommandHandler");

            commandHandlerRegistry.registerHandler(new SettingsCommandHandler(serviceManager, communicationManager, responseBuilder));
            Log.d(TAG, "✅ Registered SettingsCommandHandler");

            commandHandlerRegistry.registerHandler(new OtaCommandHandler());
            Log.d(TAG, "✅ Registered OtaCommandHandler");

            Log.i(TAG, "✅ Successfully registered " + commandHandlerRegistry.getHandlerCount() + " command handlers");

        } catch (Exception e) {
            Log.e(TAG, "💥 Error during command handler initialization", e);
        }
    }


    // ========================================
    // Public API Methods (Interface Segregation)
    // ========================================

    /**
     * Send download progress notification.
     */
    public void sendDownloadProgressOverBle(String status, int progress, long bytesDownloaded, long totalBytes, String errorMessage, long timestamp) {
        Log.d(TAG, "📤 sendDownloadProgressOverBle() called - Status: " + status + ", Progress: " + progress + "%, Downloaded: " + bytesDownloaded + "/" + totalBytes + " bytes");

        try {
            responseSender.sendDownloadProgress(status, progress, bytesDownloaded, totalBytes, errorMessage, timestamp);
            Log.d(TAG, "✅ Download progress sent successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error sending download progress", e);
        }
    }

    /**
     * Send installation progress notification.
     */
    public void sendInstallationProgressOverBle(String status, String apkPath, String errorMessage, long timestamp) {
        Log.d(TAG, "📤 sendInstallationProgressOverBle() called - Status: " + status + ", APK Path: " + apkPath + ", Error: " + errorMessage);

        try {
            responseSender.sendInstallationProgress(status, apkPath, errorMessage, timestamp);
            Log.d(TAG, "✅ Installation progress sent successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error sending installation progress", e);
        }
    }

    /**
     * Send report swipe status.
     */
    public void sendReportSwipe(boolean report) {
        Log.d(TAG, "📤 sendReportSwipe() called - Report: " + report);

        try {
            responseSender.sendReportSwipe(report);
            Log.d(TAG, "✅ Report swipe status sent successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error sending report swipe status", e);
        }
    }

} 