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
import com.augmentos.asg_client.service.media.interfaces.IStreamingManager;
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
    private final IStreamingManager streamingManager;
    private final IResponseBuilder responseBuilder;
    private final IConfigurationManager configurationManager;
    private final AsgClientServiceManager serviceManager;
    private final FileManager fileManager;

    // Command processing components
    private final CommandHandlerRegistry commandHandlerRegistry;
    private final CommandParser commandParser;
    private final CommandProtocolDetector protocolDetector;
    private final LegacyCommandProcessor legacyProcessor;
    private final K900CommandHandler k900CommandHandler;
    private final ResponseSender responseSender;

    public CommandProcessor(Context context,
                            ICommunicationManager communicationManager,
                            IStateManager stateManager,
                            IStreamingManager streamingManager,
                            IResponseBuilder responseBuilder,
                            IConfigurationManager configurationManager,
                            AsgClientServiceManager serviceManager,
                            FileManager fileManager) {
        this.context = context;
        this.communicationManager = communicationManager;
        this.stateManager = stateManager;
        this.streamingManager = streamingManager;
        this.responseBuilder = responseBuilder;
        this.configurationManager = configurationManager;
        this.serviceManager = serviceManager;
        this.fileManager = fileManager;

        // Initialize components (Single Responsibility Principle)
        this.commandHandlerRegistry = new CommandHandlerRegistry();
        this.commandParser = new CommandParser();
        this.protocolDetector = new CommandProtocolDetector();
        this.legacyProcessor = new LegacyCommandProcessor(serviceManager, streamingManager);
        this.k900CommandHandler = new K900CommandHandler(serviceManager, stateManager, communicationManager);
        this.responseSender = new ResponseSender(serviceManager);

        // Register command handlers
        initializeCommandHandlers();
    }

    /**
     * Main entry point for processing commands from byte data.
     * Follows Single Responsibility Principle by delegating to specialized components.
     */
    public void processCommand(byte[] data) {
        if (data == null || data.length == 0) {
            Log.w(TAG, "Received null or empty data");
            return;
        }

        try {
            // Parse JSON from byte data
            JSONObject jsonObject = commandParser.parseToJson(data);
            if (jsonObject == null) {
                Log.w(TAG, "Failed to parse JSON from byte data");
                return;
            }

            // Process the parsed JSON command
            processJsonCommand(jsonObject);
        } catch (Exception e) {
            Log.e(TAG, "Error processing command from byte data", e);
        }
    }

    /**
     * Process JSON command by delegating to appropriate handlers.
     * Follows Open/Closed Principle by using registry pattern.
     */
    private void processJsonCommand(JSONObject json) {
        try {
            // Extract command data
            CommandData commandData = extractCommandData(json);
            if (commandData == null) {
                return;
            }

            // Send acknowledgment if required
            sendAcknowledgment(commandData);

            // Route to appropriate handler
            routeCommand(commandData);
        } catch (Exception e) {
            Log.e(TAG, "Error processing JSON command", e);
        }
    }

    /**
     * Extract and validate command data from JSON using improved protocol detector.
     */
    private CommandData extractCommandData(JSONObject json) {
        try {
            // Use protocol detector to identify and extract command data
            CommandProtocolDetector.ProtocolDetectionResult result = protocolDetector.detectProtocol(json);
            
            if (!result.isValid()) {
                Log.w(TAG, "Invalid protocol detected: " + result.protocolType().getDisplayName());
                return null;
            }
            
            switch (result.protocolType()) {
                case K900_PROTOCOL:
                    // Handle K900 format using dedicated handler
                    k900CommandHandler.processK900Command(json);
                    return null; // K900 commands are handled directly
                    
                case JSON_COMMAND:
                    // Standard JSON command processing
                    return new CommandData(
                        result.commandType(),
                        result.extractedData(),
                        result.messageId()
                    );
                    
                case UNKNOWN:
                default:
                    Log.w(TAG, "Unknown protocol type: " + result.protocolType().getDisplayName());
                    return null;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error extracting command data", e);
            return null;
        }
    }

    /**
     * Send acknowledgment for commands with message IDs.
     */
    private void sendAcknowledgment(CommandData commandData) {
        if (commandData != null && commandData.messageId() != -1) {
            communicationManager.sendAckResponse(commandData.messageId());
            Log.d(TAG, "📤 Sent ACK for message ID: " + commandData.messageId());
        }
    }

    /**
     * Route command to appropriate handler using registry pattern.
     * Follows Open/Closed Principle - new handlers can be added without modifying this method.
     */
    private void routeCommand(CommandData commandData) {
        if (commandData == null) {
            return; // K900 commands are handled separately in extractCommandData
        }
        
        String type = commandData.type();
        Log.d(TAG, "Processing command type: " + type);

        // Try modern command handler first
        ICommandHandler handler = commandHandlerRegistry.getHandler(type);
        if (handler != null) {
            boolean success = handler.handleCommand(commandData.data());
            if (!success) {
                Log.w(TAG, "Handler failed to process command: " + type);
            }
            return;
        }

        // Fall back to legacy processor
        legacyProcessor.handleLegacyCommand(type, commandData.data());
    }

    /**
     * Initialize command handlers following Open/Closed Principle.
     * New handlers can be added here without modifying existing code.
     */
    private void initializeCommandHandlers() {
        commandHandlerRegistry.registerHandler(new PhoneReadyCommandHandler(communicationManager, stateManager, responseBuilder));
        commandHandlerRegistry.registerHandler(new AuthTokenCommandHandler(communicationManager, configurationManager));
        commandHandlerRegistry.registerHandler(new PhotoCommandHandler(context, serviceManager, fileManager));
        commandHandlerRegistry.registerHandler(new VideoCommandHandler(context, serviceManager, streamingManager, fileManager));
        commandHandlerRegistry.registerHandler(new PingCommandHandler(communicationManager, responseBuilder));
        commandHandlerRegistry.registerHandler(new RtmpCommandHandler(context, stateManager, streamingManager));
        commandHandlerRegistry.registerHandler(new WifiCommandHandler(serviceManager, communicationManager, stateManager));
        commandHandlerRegistry.registerHandler(new BatteryCommandHandler(stateManager));
        commandHandlerRegistry.registerHandler(new VersionCommandHandler(context, serviceManager));
        commandHandlerRegistry.registerHandler(new SettingsCommandHandler(serviceManager, communicationManager, responseBuilder));
        commandHandlerRegistry.registerHandler(new OtaCommandHandler());

        Log.d(TAG, "✅ Registered " + commandHandlerRegistry.getHandlerCount() + " command handlers");
    }



    // ========================================
    // Public API Methods (Interface Segregation)
    // ========================================

    /**
     * Send download progress notification.
     */
    public void sendDownloadProgressOverBle(String status, int progress, long bytesDownloaded, long totalBytes, String errorMessage, long timestamp) {
        responseSender.sendDownloadProgress(status, progress, bytesDownloaded, totalBytes, errorMessage, timestamp);
    }

    /**
     * Send installation progress notification.
     */
    public void sendInstallationProgressOverBle(String status, String apkPath, String errorMessage, long timestamp) {
        responseSender.sendInstallationProgress(status, apkPath, errorMessage, timestamp);
    }

    /**
     * Send report swipe status.
     */
    public void sendReportSwipe(boolean report) {
        responseSender.sendReportSwipe(report);
    }

} 