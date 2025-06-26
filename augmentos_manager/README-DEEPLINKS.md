# Deep Link System Documentation

## Overview

The MentraOS app now includes a comprehensive deep linking system that allows external applications, web browsers, and other apps to navigate directly to specific screens within the app.

## Architecture

The deep linking system consists of several components:

- **DeepLinkHandler**: Core service that manages URL parsing and routing
- **DeeplinkContext**: React context that integrates with the app's navigation system
- **deepLinkRoutes**: Configuration file that defines all supported routes
- **DeepLinkUtils**: Utility functions for generating and working with deep links

## Supported URL Schemes

### App Scheme
- `com.mentra://` - Custom URL scheme for direct app navigation

### Universal Links
- `https://apps.mentra.glass/` - Universal links that work in browsers and can open the app

## Supported Routes

### Navigation Routes
- `com.mentra://home` - Navigate to home screen
- `com.mentra://glasses` - Navigate to glasses management screen
- `com.mentra://store` - Navigate to app store
- `com.mentra://settings` - Navigate to settings

### Settings Routes
- `com.mentra://settings/profile` - User profile settings
- `com.mentra://settings/privacy` - Privacy settings
- `com.mentra://settings/developer` - Developer settings
- `com.mentra://settings/theme` - Theme settings
- `com.mentra://settings/change-password` - Change password
- `com.mentra://settings/data-export` - Data export settings

### Pairing Routes
- `com.mentra://pairing` - Start pairing process
- `com.mentra://pairing/guide` - Pairing guide
- `com.mentra://pairing/bluetooth` - Bluetooth pairing
- `com.mentra://pairing/wifi-setup` - WiFi setup

### App Routes
- `com.mentra://app/{packageName}` - Open specific app
- `https://apps.mentra.glass/apps/{packageName}` - Universal link to app

### Search Routes
- `com.mentra://search?q={query}` - Search with query

### Mirror Routes
- `com.mentra://mirror/gallery` - Mirror gallery
- `com.mentra://mirror/video/{videoId}` - Specific video

## Usage Examples

### From React Native Code

```typescript
import { useDeeplink } from '@/contexts/DeeplinkContext'
import { DeepLinks, navigateToDeepLink } from '@/utils/DeepLinkUtils'

// Using the context
const { handleDeepLink } = useDeeplink()
handleDeepLink('com.mentra://settings/profile')

// Using utility functions
navigateToDeepLink(DeepLinks.settings('profile'))

// Generate a deep link
const settingsLink = DeepLinks.settings('theme')
console.log(settingsLink) // com.mentra://settings/theme
```

### From External Applications

```javascript
// iOS - Swift
UIApplication.shared.open(URL(string: "com.mentra://glasses")!)

// Android - Java
Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("com.mentra://glasses"));
startActivity(intent);

// Web - JavaScript
window.location.href = "com.mentra://store";
// or
window.open("https://apps.mentra.glass/apps/com.example.myapp");
```

### From Command Line (Testing)

```bash
# iOS Simulator
xcrun simctl openurl booted "com.mentra://settings/profile"

# Android
adb shell am start -W -a android.intent.action.VIEW -d "com.mentra://glasses" com.mentra.mentra
```

## Configuration

### Adding New Routes

To add a new deep link route, edit `src/utils/deepLinkRoutes.ts`:

```typescript
export const deepLinkRoutes: DeepLinkRoute[] = [
  // ... existing routes
  {
    pattern: '/my-new-route/:id',
    handler: (params) => {
      const { id } = params
      router.push(`/my-screen?id=${id}`)
    },
    requiresAuth: true // Optional: require authentication
  }
]
```

### Route Patterns

Routes support parameters using the `:paramName` syntax:

- `/user/:id` - Matches `/user/123`, extracts `id: "123"`
- `/app/:packageName/settings` - Matches `/app/com.example.app/settings`
- `/search` - Simple route without parameters

### Authentication

Routes can require authentication by setting `requiresAuth: true`. If a user accesses a protected route while not authenticated:

1. The URL is stored for later
2. User is redirected to login
3. After successful login, the original URL is processed

## Security Considerations

- All deep links are validated before processing
- Authentication is checked for protected routes
- Parameters are properly URL-decoded to prevent injection attacks
- Fallback handlers prevent app crashes from malformed URLs

## Testing

### Unit Tests

```bash
# Run tests
pnpm test -- DeepLink

# Test specific route
pnpm test -- -t "deep link navigation"
```

### Manual Testing

1. **iOS**: Use Simulator menu `Device > Trigger URL`
2. **Android**: Use ADB commands shown above
3. **Web**: Create test HTML pages with deep links

### Test URLs

```
com.mentra://home
com.mentra://settings/profile
com.mentra://pairing/bluetooth
com.mentra://app/com.example.testapp
com.mentra://search?q=test%20query
https://apps.mentra.glass/apps/com.example.app
```

## Troubleshooting

### Common Issues

1. **Route not found**: Check that the route pattern matches exactly
2. **Authentication required**: Ensure user is logged in for protected routes
3. **App not opening**: Verify URL scheme configuration in `app.json`

### Debug Logging

Enable debug logging to see deep link processing:

```typescript
// In DeepLinkHandler.ts, uncomment console.log statements
console.log('Deep link received:', url)
console.log('Matched route:', matchedRoute)
```

### Verification

Check that your app is properly configured:

1. **iOS**: Verify `associatedDomains` in `app.json`
2. **Android**: Verify `intentFilters` in `app.json`
3. **Test**: Use the test URLs above

## Implementation Details

### URL Parsing

The system uses the Web URL API for consistent URL parsing:

```typescript
const parsedUrl = new URL(url)
const pathname = parsedUrl.pathname
const searchParams = parsedUrl.searchParams
```

### Parameter Extraction

Parameters are extracted from both the URL path and query string:

```typescript
// Path parameters: /user/:id
const pathParams = extractPathParams(pathname, pattern)

// Query parameters: ?name=value
const queryParams = Object.fromEntries(searchParams.entries())

// Combined parameters object
const allParams = { ...pathParams, ...queryParams }
```

### Error Handling

The system includes comprehensive error handling:

- Invalid URLs are caught and handled gracefully
- Unknown routes trigger the fallback handler
- Authentication failures redirect to login
- Malformed parameters are sanitized

This deep linking system provides a robust foundation for app navigation and external integration while maintaining security and user experience standards.