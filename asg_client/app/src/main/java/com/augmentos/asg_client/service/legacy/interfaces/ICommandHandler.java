package com.augmentos.asg_client.service.legacy.interfaces;

import org.json.JSONObject;

/**
 * Interface for command handlers.
 * Follows Single Responsibility Principle by handling only specific command types.
 */
public interface ICommandHandler {
    
    /**
     * Get the command type this handler can process
     * @return Command type string
     */
    String getCommandType();
    
    /**
     * Process the command
     * @param data Command data
     * @return true if processed successfully, false otherwise
     */
    boolean handleCommand(JSONObject data);
    
    /**
     * Check if this handler can process the given command
     * @param commandType Command type to check
     * @return true if can handle, false otherwise
     */
    default boolean canHandle(String commandType) {
        return getCommandType().equals(commandType);
    }
} 