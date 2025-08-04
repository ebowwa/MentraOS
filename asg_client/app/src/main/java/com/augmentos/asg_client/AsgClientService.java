package com.augmentos.asg_client;

import com.augmentos.asg_client.service.AsgClientServiceClean;

/**
 * Compatibility wrapper for AsgClientServiceClean
 * 
 * This maintains backward compatibility while using the refactored service.
 * All functionality is inherited from AsgClientServiceClean, ensuring that
 * existing code continues to work without modification.
 * 
 * Migration Strategy:
 * 1. This wrapper maintains the same package and class name
 * 2. All existing references continue to work
 * 3. Gradually update components to use AsgClientServiceClean directly
 * 4. Remove this wrapper once all references are updated
 * 
 * @deprecated Use AsgClientServiceClean directly for new code
 */
@Deprecated
public class AsgClientService extends AsgClientServiceClean {
    
    /**
     * Default constructor - delegates to parent
     */
    public AsgClientService() {
        super();
    }
    
    // All functionality is inherited from AsgClientServiceClean
    // This maintains the same public API for existing references
    
    // Note: If any methods need different behavior in the future,
    // they can be overridden here while maintaining compatibility
} 