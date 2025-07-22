# Glasses Tracking Implementation

## Overview

This document describes the implementation of glasses model tracking within the MentraOS Cloud backend. The system tracks which glasses models users have connected and stores this information both in MongoDB and as PostHog person properties for analytics.

## Architecture

### Components Modified

1. **PostHog Service** (`posthog.service.ts`)
   - Added `setPersonProperties` method for tracking user properties
   - Enhanced with person property management capabilities

2. **User Model** (`user.model.ts`)
   - Added `glassesModels` array field to store connected glasses models
   - Added `addGlassesModel()` and `getGlassesModels()` methods
   - Includes validation to prevent duplicate models

3. **WebSocket Glasses Service** (`websocket-glasses.service.ts`)
   - Enhanced `handleGlassesConnectionState()` to track glasses models
   - Automatically detects and stores new glasses models
   - Updates PostHog person properties on connection/disconnection

## Data Flow

```
Glasses Connection Event → WebSocket Handler → User Model Update → PostHog Person Properties
```

### Example Message Structure

```typescript
{
  "type": "glasses_connection_state",
  "modelName": "Even Realities G1",
  "status": "CONNECTED",
  "timestamp": 1751761195000
}
```

## Implementation Details

### PostHog Service Enhancement

```typescript
// New method added to PosthogService
async function setPersonProperties(
  userId: string,
  properties: EventProperties = {}
): Promise<void> {
  if (!posthog) return;
  try {
    posthog.identify({
      distinctId: userId,
      properties: {
        $set: properties
      }
    });
  } catch (err) {
    logger.error('PostHog person properties error:', err);
  }
}
```

### User Model Schema Addition

```typescript
// Added to UserSchema
glassesModels: {
  type: [String],
  default: [],
  validate: {
    validator: function(models: string[]) {
      return new Set(models).size === models.length;
    },
    message: 'Glasses models must be unique'
  }
},

// New methods
addGlassesModel(modelName: string): Promise<void>;
getGlassesModels(): string[];
```

### Connection State Handler Enhancement

The `handleGlassesConnectionState` method now:

1. **Extracts Model Information**: Gets `modelName` and connection status from the message
2. **Tracks New Models**: Adds new glasses models to the user's history
3. **Updates PostHog Properties**: Sets person properties for analytics
4. **Tracks First-Time Connections**: Special event for new glasses model usage
5. **Handles Disconnections**: Updates connection status in PostHog

## PostHog Person Properties

The following person properties are automatically set for each user:

| Property | Type | Description |
|----------|------|-------------|
| `current_glasses_model` | String | Currently connected glasses model |
| `glasses_models_used` | Array | List of all glasses models user has connected |
| `glasses_models_count` | Number | Total number of different glasses models used |
| `glasses_last_connected` | String | ISO timestamp of last connection |
| `glasses_current_connected` | Boolean | Whether glasses are currently connected |

## PostHog Events

### Enhanced Events

1. **`glasses_connection_state`** (Enhanced)
   - Now includes `modelName` and `isConnected` properties
   - Provides richer context for connection analytics

2. **`glasses_model_first_connect`** (New)
   - Triggered when user connects a new glasses model for the first time
   - Includes `totalModelsUsed` for user segmentation

### Event Properties

```typescript
// glasses_connection_state event properties
{
  sessionId: string,
  eventType: string,
  timestamp: string,
  connectionState: GlassesConnectionState,
  modelName: string,
  isConnected: boolean
}

// glasses_model_first_connect event properties
{
  sessionId: string,
  modelName: string,
  totalModelsUsed: number,
  timestamp: string
}
```

## Error Handling

- **Database Errors**: Logged but don't prevent connection handling
- **PostHog Errors**: Logged but don't affect user experience
- **Invalid Model Names**: Sanitized using `MongoSanitizer`
- **Duplicate Models**: Prevented by schema validation and method logic

## Usage Examples

### Analytics Queries

```sql
-- Users with multiple glasses models
SELECT user_id, glasses_models_count 
FROM person_properties 
WHERE glasses_models_count > 1;

-- Most popular glasses models
SELECT 
  glasses_models_used,
  COUNT(*) as user_count
FROM person_properties 
GROUP BY glasses_models_used;
```

### Developer Usage

```typescript
// Get user's glasses models
const user = await User.findByEmail('user@example.com');
const glassesModels = user.getGlassesModels();
console.log('User has used:', glassesModels);

// Add new glasses model
await user.addGlassesModel('TCL RayNeo X2');
```

## Benefits

1. **User Segmentation**: Understand which users have multiple glasses
2. **Product Analytics**: Track glasses model adoption and usage patterns
3. **Personalization**: Customize experiences based on glasses capabilities
4. **Support**: Better troubleshooting with device history
5. **Business Intelligence**: Inform partnerships and development priorities

## Future Enhancements

1. **Glasses Capabilities Tracking**: Store hardware features (camera, WiFi, etc.)
2. **Usage Duration**: Track how long users use different glasses models
3. **Switching Patterns**: Analyze when and why users switch between glasses
4. **Preference Learning**: Adapt settings based on glasses model preferences
5. **Recommendation System**: Suggest glasses models based on usage patterns

## Testing

### Manual Testing

1. Connect different glasses models to the same user account
2. Verify `glassesModels` array is populated in MongoDB
3. Check PostHog person properties are updated correctly
4. Confirm events are tracked with proper model information

### Automated Testing

```typescript
// Test user model methods
describe('User Glasses Tracking', () => {
  it('should add new glasses model', async () => {
    const user = await User.findOrCreateUser('test@example.com');
    await user.addGlassesModel('Even Realities G1');
    expect(user.getGlassesModels()).toContain('Even Realities G1');
  });
  
  it('should prevent duplicate models', async () => {
    const user = await User.findOrCreateUser('test@example.com');
    await user.addGlassesModel('Even Realities G1');
    await user.addGlassesModel('Even Realities G1');
    expect(user.getGlassesModels().length).toBe(1);
  });
});
```

## Deployment Notes

- **Schema Migration**: No migration needed, field is optional with default empty array
- **Backwards Compatibility**: Existing users will have empty `glassesModels` array initially
- **Performance**: Minimal impact, only adds database write on new model connections
- **PostHog Quota**: Person properties don't count against event limits

## Troubleshooting

### Common Issues

1. **Models Not Tracking**: Check if `modelName` is present in connection messages
2. **Duplicate Models**: Verify schema validation is working properly
3. **PostHog Properties Missing**: Ensure PostHog service is properly initialized
4. **Database Errors**: Check MongoDB connection and schema validation

### Debug Logging

The implementation includes comprehensive logging:

```typescript
userSession.logger.info({ service: SERVICE_NAME, message }, 
  `handleGlassesConnectionState for user ${userSession.userId}`);
userSession.logger.error(error, 'Error tracking glasses model:');
```

## Security Considerations

- **Input Sanitization**: Model names are sanitized using `MongoSanitizer`
- **Privacy**: Only model names are stored, no personal device information
- **Access Control**: Glasses models are tied to user accounts and not shared
- **Data Retention**: Follows standard user data retention policies