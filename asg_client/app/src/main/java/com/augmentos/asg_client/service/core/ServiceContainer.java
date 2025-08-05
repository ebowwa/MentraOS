package com.augmentos.asg_client.service.core;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.io.file.core.FileManagerFactory;
import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.communication.interfaces.IResponseBuilder;
import com.augmentos.asg_client.service.communication.managers.CommunicationManager;
import com.augmentos.asg_client.service.communication.managers.ResponseBuilder;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.service.media.interfaces.IStreamingManager;
import com.augmentos.asg_client.service.media.managers.StreamingManager;
import com.augmentos.asg_client.service.system.interfaces.IConfigurationManager;
import com.augmentos.asg_client.service.system.interfaces.IServiceLifecycle;
import com.augmentos.asg_client.service.system.interfaces.IStateManager;
import com.augmentos.asg_client.service.system.managers.AsgNotificationManager;
import com.augmentos.asg_client.service.system.managers.ConfigurationManager;
import com.augmentos.asg_client.service.system.managers.ServiceLifecycleManager;
import com.augmentos.asg_client.service.system.managers.StateManager;


/**
 * Dependency injection container for service components.
 * Follows Dependency Inversion Principle by managing dependencies through interfaces.
 */
public class ServiceContainer {

    private final Context context;
    private final AsgClientServiceManager serviceManager;
    private final CommandProcessor commandProcessor;
    private final IResponseBuilder responseBuilder;
    private final AsgNotificationManager notificationManager;

    // Interface implementations
    private final IServiceLifecycle lifecycleManager;
    private final ICommunicationManager communicationManager;
    private final IConfigurationManager configurationManager;
    private final IStateManager stateManager;
    private final IStreamingManager streamingManager;

    private final FileManager fileManager;

    public ServiceContainer(Context context, AsgClientService service) {
        this.context = context;

        // Initialize interface implementations first
        this.communicationManager = new CommunicationManager(null); // Will be updated after serviceManager creation

        // Initialize core components with service reference
        this.serviceManager = new AsgClientServiceManager(context, service, communicationManager);
        this.notificationManager = new AsgNotificationManager(context);

        // Update communication manager with service manager reference
        ((CommunicationManager) this.communicationManager).setServiceManager(serviceManager);
        this.configurationManager = new ConfigurationManager(context);
        this.stateManager = new StateManager(serviceManager);
        this.streamingManager = new StreamingManager(context, serviceManager);
        this.fileManager = FileManagerFactory.getInstance();


        // Initialize CommandProcessor with interface-based managers
        this.responseBuilder = new ResponseBuilder();
        this.commandProcessor = new CommandProcessor(context,
                communicationManager,
                stateManager,
                streamingManager,
                responseBuilder,
                configurationManager,
                serviceManager,
                fileManager);

        // Initialize lifecycle manager with all components
        this.lifecycleManager = new ServiceLifecycleManager(context, serviceManager, commandProcessor, notificationManager);
    }

    /**
     * Get service lifecycle manager
     */
    public IServiceLifecycle getLifecycleManager() {
        return lifecycleManager;
    }

    /**
     * Get communication manager
     */
    public ICommunicationManager getCommunicationManager() {
        return communicationManager;
    }

    /**
     * Get configuration manager
     */
    public IConfigurationManager getConfigurationManager() {
        return configurationManager;
    }

    public IResponseBuilder getResponseBuilder() {
        return responseBuilder;
    }

    /**
     * Get state manager
     */
    public IStateManager getStateManager() {
        return stateManager;
    }

    /**
     * Get streaming manager
     */
    public IStreamingManager getStreamingManager() {
        return streamingManager;
    }

    /**
     * Get service manager
     */
    public AsgClientServiceManager getServiceManager() {
        return serviceManager;
    }

    /**
     * Get command processor
     */
    public CommandProcessor getCommandProcessor() {
        return commandProcessor;
    }

    /**
     * Get notification manager
     */
    public AsgNotificationManager getNotificationManager() {
        return notificationManager;
    }

    /**
     * Initialize all components
     */
    public void initialize() {
        Log.d("ServiceContainer", "Initializing service container");

        // Initialize lifecycle manager first
        lifecycleManager.initialize();

        Log.d("ServiceContainer", "Service container initialized successfully");
    }

    /**
     * Clean up all components
     */
    public void cleanup() {
        Log.d("ServiceContainer", "Cleaning up service container");

        // Clean up lifecycle manager
        lifecycleManager.cleanup();

        Log.d("ServiceContainer", "Service container cleanup completed");
    }
} 