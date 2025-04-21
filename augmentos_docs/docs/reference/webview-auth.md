---
sidebar_position: 8
title: Webview Authentication
---

# Webview Authentication

AugmentOS provides a secure and straightforward mechanism for third-party web applications loaded within the AugmentOS manager application's webview to identify the current user. This enables personalized experiences without requiring users to log in separately to your service.

## Overview

When a user opens your web application through the AugmentOS manager app, the system automatically appends a temporary authentication token to your URL. Your application can exchange this token for the user's ID, allowing you to provide a personalized experience.

## How to Include a Webview in Your App

To include a webview in your TPA, you need to specify a webview URL in your app's configuration. This can be done through the AugmentOS Developer Console.

### Setting Up Your Webview URL

1. Log in to the [AugmentOS Developer Console](https://console.augmentos.org/tpas/)
2. Navigate to your TPA's settings
3. Add your `Webview URL`
4. Save your changes

# Implementation Options

You can implement webview authentication in two ways:

1. **Using the AugmentOS SDK** (recommended): Automatic handling with minimal configuration
2. **Manual implementation**: Direct API integration if you're not using the SDK

## Using the AugmentOS SDK

The AugmentOS SDK provides built-in middleware that automatically handles the token exchange process.

### Setup

1. Configure the `TpaServer` with authentication middleware:

```typescript
import { TpaServer, AuthenticatedRequest } from '@augmentos/sdk';

const server = new TpaServer({
  packageName: 'org.example.myapp',
  apiKey: 'your-api-key' // load from .env, never check it into source control
});

// The SDK automatically sets up the authentication middleware
```

2. Access the authenticated user ID in your route handlers:

```typescript
const app = server.getExpressApp();

app.get('/webview', (req: AuthenticatedRequest, res) => {
  const userId = req.authUserId;
  
  if (userId) {
    // User is authenticated, show personalized content
    res.send(`Welcome user ${userId}!`);
  } else {
    // User is not authenticated
    res.send('Please open this page from the AugmentOS app');
  }
});
```

## Manual Implementation

If you're not using the AugmentOS SDK, you can implement the authentication flow manually.

1. The user interacts with the AugmentOS manager app (taps settings, long-presses app in list, etc.)
2. The manager app opens a webview with your URL, appending a temporary token as a query parameter
3. Your web application extracts this token and exchanges it server-side for the user's ID
4. Your application can now provide a personalized experience based on the user's identity

### 1. Extract the Temporary Token

When your page loads, extract the `aos_temp_token` from the URL:

```javascript
// Client-side extraction (for illustration only)
function extractTempToken(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get('aos_temp_token');
  } catch (e) {
    console.error("Error parsing URL for temp token:", e);
    return null;
  }
}

// Note: You should extract this token server-side, not client-side
```

### 2. Exchange the Token (Server-Side)

On your backend, call the `https://prod.augmentos.cloud/api/auth/exchange-user-token` endpoint to exchange the token for a user ID:

Implement the function to exchange the token with the AugmentOS Cloud API:

```javascript
// Node.js example with axios
const axios = require('axios');

async function exchangeTokenForUserId(tempToken) {
  const endpoint = 'https://prod.augmentos.org/api/auth/exchange-user-token';
  
  try {
    const response = await axios.post(
      endpoint,
      { 
        aos_temp_token: tempToken,
        packageName: 'org.example.myapp' // Your registered package name
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`, // Your API key, ideally loaded from .env.  Don't check it into source control.
        },
        timeout: 5000, // 5 second timeout
      }
    );

    if (response.status === 200 && response.data.success && response.data.userId) {
      return response.data.userId;
    } else {
      throw new Error(response.data?.error || `Failed with status ${response.status}`);
    }
  } catch (error) {
    console.error("Token exchange failed:", error);
    throw new Error('Authentication failed');
  }
}

// Express route handler example
app.get('/webview', async (req, res) => {
  try {
    // Extract the temporary token from the query parameters
    const tempToken = req.query.aos_temp_token;
    
    if (!tempToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing authentication token' 
      });
    }
    
    // Exchange the token for a user ID
    const userId = await exchangeTokenForUserId(tempToken);
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication failed. Please try again.' 
      });
    }
    
    // Create a session for the authenticated user
    req.session.userId = userId;
    req.session.isAuthenticated = true;
    
    // Redirect to the main application or render the webview content
    res.redirect('/app/dashboard');
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ 
      success: false, 
      error: 'Authentication failed. Please try again.' 
    });
  }
});
```

# API Reference: Exchange User Token Endpoint

## Endpoint

```
POST https://prod.augmentos.org/api/auth/exchange-user-token
```

## Request Headers

| Header          | Value                           | Description                      |
|-----------------|---------------------------------|----------------------------------|
| Content-Type    | application/json                | JSON request format              |
| Authorization   | Bearer YOUR_API_KEY             | Your TPA's secret API key        |

## Request Body

```json
{
  "aos_temp_token": "the-temporary-token",
  "packageName": "org.example.myapp"
}
```

## Successful Response (200 OK)

```json
{
  "success": true,
  "userId": "user-id-string"
}
```

## Error Responses

| Status Code | Description                                |
|-------------|--------------------------------------------|
| 400         | Missing or invalid token parameter         |
| 401         | Invalid API key or unauthorized            |
| 404         | Token not found                            |
| 410         | Token expired or already used              |
| 500         | Server error during exchange               |

# Security Considerations

- The temporary token has a short lifetime (typically 60 seconds)
- Tokens are single-use and become invalid after exchange
- Always exchange tokens server-side, never client-side
- Securely store your API key and never expose it to clients or source control
- Use HTTPS for all communication with the AugmentOS API

# Next Steps

After authenticating the user, you can:

1. Create or look up the user in your own database
2. Establish a standard web session (e.g., using cookies)
3. Provide personalized content based on the user's identity
4. Link user actions with their AugmentOS identity