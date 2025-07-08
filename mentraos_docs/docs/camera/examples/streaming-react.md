# React Streaming Example

A complete React component demonstrating both managed and unmanaged RTMP streaming with MentraOS.

## Features

- 🚀 Managed streaming with zero configuration
- 🔧 Unmanaged streaming with full control
- 📊 Real-time stream statistics
- 🔗 Shareable viewer URLs
- ❌ Error handling
- 📹 Stream status monitoring

## Full Component Code

```typescript
import { useMentraOS } from '@mentra/sdk-react';
import { useState, useEffect } from 'react';

export function StreamingDashboard() {
  const { session } = useMentraOS();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamType, setStreamType] = useState<'managed' | 'unmanaged' | null>(null);
  const [viewerUrls, setViewerUrls] = useState<{ hls?: string; webrtc?: string }>({});
  const [streamStats, setStreamStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set up status handlers
    const managedUnsubscribe = session.camera.onManagedStreamStatus((status) => {
      console.log('Managed stream status:', status);
      if (status.status === 'error') {
        setError(status.message || 'Managed stream error');
        setIsStreaming(false);
      }
    });

    const unmanagedUnsubscribe = session.camera.onStreamStatus((status) => {
      console.log('Unmanaged stream status:', status);
      setStreamStats(status.stats || null);
      if (status.status === 'error') {
        setError(status.errorDetails || 'Stream error');
        setIsStreaming(false);
      }
    });

    return () => {
      managedUnsubscribe();
      unmanagedUnsubscribe();
    };
  }, [session]);

  const startManagedStream = async () => {
    try {
      setError(null);
      setIsStreaming(true);
      setStreamType('managed');

      const result = await session.camera.startManagedStream({
        enableWebRTC: true // Low latency option
      });

      setViewerUrls({
        hls: result.hlsUrl,
        webrtc: result.webrtcUrl
      });

      console.log('Managed stream started:', result);
    } catch (err) {
      setError(err.message);
      setIsStreaming(false);
    }
  };

  const startUnmanagedStream = async () => {
    try {
      setError(null);
      setIsStreaming(true);
      setStreamType('unmanaged');

      await session.camera.startStream({
        rtmpUrl: 'rtmp://your-server.com/live/stream-key'
      });

      console.log('Unmanaged stream started');
    } catch (err) {
      setError(err.message);
      setIsStreaming(false);
    }
  };

  const stopStream = async () => {
    try {
      if (streamType === 'managed') {
        await session.camera.stopManagedStream();
      } else {
        await session.camera.stopStream();
      }
      
      setIsStreaming(false);
      setStreamType(null);
      setViewerUrls({});
      setStreamStats(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="streaming-dashboard">
      <h2>RTMP Streaming Control</h2>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {!isStreaming ? (
        <div className="streaming-options">
          <h3>Choose Streaming Type:</h3>
          
          <button 
            onClick={startManagedStream}
            className="managed-stream-btn"
          >
            🚀 Start Managed Stream
            <small>Zero configuration - Recommended</small>
          </button>

          <button 
            onClick={startUnmanagedStream}
            className="unmanaged-stream-btn"
          >
            🔧 Start Unmanaged Stream
            <small>Full control - Requires RTMP server</small>
          </button>
        </div>
      ) : (
        <div className="streaming-active">
          <h3>📹 {streamType === 'managed' ? 'Managed' : 'Unmanaged'} Stream Active</h3>

          {streamType === 'managed' && viewerUrls.hls && (
            <div className="viewer-urls">
              <h4>Share with viewers:</h4>
              <input 
                value={viewerUrls.hls} 
                readOnly 
                onClick={(e) => e.currentTarget.select()}
              />
              {viewerUrls.webrtc && (
                <div>
                  <small>Low latency URL:</small>
                  <input 
                    value={viewerUrls.webrtc} 
                    readOnly 
                    onClick={(e) => e.currentTarget.select()}
                  />
                </div>
              )}
            </div>
          )}

          {streamStats && (
            <div className="stream-stats">
              <h4>Stream Statistics:</h4>
              <ul>
                <li>Bitrate: {(streamStats.bitrate / 1000).toFixed(0)} kbps</li>
                <li>FPS: {streamStats.fps}</li>
                <li>Duration: {streamStats.duration}s</li>
                <li>Dropped: {streamStats.droppedFrames} frames</li>
              </ul>
            </div>
          )}

          <button onClick={stopStream} className="stop-btn">
            ⏹ Stop Streaming
          </button>
        </div>
      )}

      <div className="streaming-info">
        <p>
          <strong>Current Status:</strong> {' '}
          {isStreaming ? '🔴 Streaming' : '⚪ Not Streaming'}
        </p>
        {session.camera.isCurrentlyStreaming() && (
          <p>URL: {session.camera.getCurrentStreamUrl()}</p>
        )}
      </div>
    </div>
  );
}
```

## Usage

Import and use the component in your React app:

```tsx
import { StreamingDashboard } from './StreamingDashboard';

function App() {
  return (
    <div>
      <h1>My MentraOS App</h1>
      <StreamingDashboard />
    </div>
  );
}
```

## Styling

Add these styles to make the dashboard look great:

```css
.streaming-dashboard {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.error-message {
  background: #fee;
  border: 1px solid #fcc;
  color: #c00;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.streaming-options button {
  display: block;
  width: 100%;
  padding: 15px;
  margin: 10px 0;
  border: 2px solid #ddd;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.streaming-options button:hover {
  border-color: #007bff;
  background: #f0f8ff;
}

.streaming-options button small {
  display: block;
  color: #666;
  font-size: 12px;
  margin-top: 5px;
}

.viewer-urls input {
  width: 100%;
  padding: 10px;
  margin: 5px 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
  cursor: pointer;
}

.stream-stats {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 4px;
  margin: 20px 0;
}

.stream-stats ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.stream-stats li {
  padding: 5px 0;
  border-bottom: 1px solid #e0e0e0;
}

.stop-btn {
  background: #dc3545;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  margin-top: 20px;
}

.stop-btn:hover {
  background: #c82333;
}

.streaming-info {
  margin-top: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 4px;
}
```

## Key Features Explained

### State Management
- `isStreaming` - Tracks if any stream is active
- `streamType` - Identifies which type of stream is running
- `viewerUrls` - Stores URLs for managed streams
- `streamStats` - Real-time statistics for unmanaged streams
- `error` - Displays any errors to the user

### Status Monitoring
The component sets up listeners for both managed and unmanaged stream status updates:
- Managed streams provide URLs and status updates
- Unmanaged streams provide detailed statistics including dropped frames

### Error Handling
- Try-catch blocks on all async operations
- User-friendly error messages
- Automatic cleanup on errors

### URL Sharing
For managed streams, URLs are displayed in selectable input fields that users can click to copy.

## Customization

### Adding Stream Settings
You can extend the component to allow users to configure stream settings:

```typescript
const [streamSettings, setStreamSettings] = useState({
  rtmpUrl: '',
  enableWebRTC: true
});

// Add input fields for user configuration
```

### Adding Stream Recording
```typescript
const [isRecording, setIsRecording] = useState(false);

const toggleRecording = async () => {
  if (isStreaming && streamType === 'managed') {
    // Implement recording toggle
  }
};
```

### Adding Quality Presets
When quality parameters are implemented, you can add presets:

```typescript
const qualityPresets = {
  low: { bitrate: 1000000 },
  medium: { bitrate: 2000000 },
  high: { bitrate: 4000000 }
};
```

## See Also

- [RTMP Streaming Guide](../rtmp-streaming.md) - Complete streaming documentation
- [Camera API Reference](../../reference/camera.md) - Full API documentation
- [Basic Examples](./streaming-basic.md) - Non-React examples