import { Server as HTTPServer } from 'http';

interface SystemStats {
  activeSessions: number;
  totalSessions: number;
  activeTpas: number;
  totalTpas: number;
}

interface DebugSessionInfo {
  sessionId: string;
  userId: string;
  startTime: string;
  disconnectedAt: string | null;
  activeAppSessions: string[];
  installedApps: Array<{ packageName: string; name: string }>;
  loadingApps: Set<string>;
  OSSettings: { brightness: number; volume: number };
  isTranscribing: boolean;
  transcript: {
    segments: Array<{
      resultId: string;
      text: string;
      timestamp: Date;
      isFinal: boolean;
    }>;
    languageSegments: Record<string, Array<{
      resultId: string;
      text: string;
      timestamp: Date;
      isFinal: boolean;
    }>>;
  };
  subscriptionManager: {
    subscriptions: Record<string, string[]>;
  };
  displayManager: {
    activeDisplay: {
      displayRequest: {
        packageName: string;
        layout: {
          layoutType: string;
          text?: string;
          title?: string;
        };
        timestamp: Date;
      };
      startedAt: Date;
    } | null;
    displayHistory: Array<{
      displayRequest: {
        packageName: string;
        layout: {
          layoutType: string;
          text?: string;
          title?: string;
        };
        timestamp: Date;
      };
      startedAt: Date;
    }>;
  };
  dashboardManager: {
    dashboardMode: string;
    alwaysOnEnabled: boolean;
    contentQueue: string[];
  };
  appConnections: Record<string, { readyState: number }>;
  lastAudioTimestamp: number;
  transcriptionStreams: Record<string, { status: string; language: string }>;
  audioBuffer: {
    chunks: any[];
    lastProcessedSequence: number;
    processingInProgress: boolean;
  };
  lc3Service: {
    initialized: boolean;
    status: string;
  } | null;
  recentEvents: Array<{
    time: string;
    description: string;
  }>;
}

type DebuggerEvent = 
  | { type: 'SESSION_UPDATE'; sessionId: string; data: Partial<DebugSessionInfo> }
  | { type: 'SESSION_DISCONNECTED'; sessionId: string; timestamp: string }
  | { type: 'SESSION_CONNECTED'; sessionId: string; timestamp: string }
  | { type: 'TPA_STATE_CHANGE'; sessionId: string; tpaId: string; state: any }
  | { type: 'DISPLAY_UPDATE'; sessionId: string; display: any }
  | { type: 'TRANSCRIPTION_UPDATE'; sessionId: string; transcript: any }
  | { type: 'SYSTEM_STATS_UPDATE'; stats: SystemStats };

export class DebugService {
  private clients = new Set<{ send: (data: string) => void }>();
  private sessions: Map<string, DebugSessionInfo> = new Map();

  constructor(private server: HTTPServer) {
    this.setupRoutes();
  }

  private serializeSession(session: DebugSessionInfo): any {
    // Create a safe copy of the session data
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      startTime: session.startTime,
      disconnectedAt: session.disconnectedAt,
      activeAppSessions: Array.isArray(session.activeAppSessions) ? session.activeAppSessions : [],
      installedApps: Array.isArray(session.installedApps) ? session.installedApps : [],
      loadingApps: Array.from(session.loadingApps || []),
      OSSettings: session.OSSettings || { brightness: 50, volume: 50 },
      isTranscribing: Boolean(session.isTranscribing),
      transcript: {
        segments: Array.isArray(session.transcript?.segments) ? session.transcript.segments : [],
        languageSegments: session.transcript?.languageSegments || {}
      },
      subscriptionManager: {
        subscriptions: session.subscriptionManager?.subscriptions ? 
          Object.fromEntries(
            Object.entries(session.subscriptionManager.subscriptions)
              .map(([key, value]) => [key, Array.isArray(value) ? value : []])
          ) : {}
      },
      displayManager: {
        activeDisplay: session.displayManager?.activeDisplay ? {
          displayRequest: {
            packageName: session.displayManager.activeDisplay.displayRequest.packageName,
            layout: {
              layoutType: session.displayManager.activeDisplay.displayRequest.layout.layoutType,
              text: session.displayManager.activeDisplay.displayRequest.layout.text,
              title: session.displayManager.activeDisplay.displayRequest.layout.title
            },
            timestamp: session.displayManager.activeDisplay.displayRequest.timestamp
          },
          startedAt: session.displayManager.activeDisplay.startedAt
        } : null,
        displayHistory: Array.isArray(session.displayManager?.displayHistory) ? 
          session.displayManager.displayHistory.map(item => ({
            displayRequest: {
              packageName: item.displayRequest.packageName,
              layout: {
                layoutType: item.displayRequest.layout.layoutType,
                text: item.displayRequest.layout.text,
                title: item.displayRequest.layout.title
              },
              timestamp: item.displayRequest.timestamp
            },
            startedAt: item.startedAt
          })) : []
      },
      dashboardManager: {
        dashboardMode: session.dashboardManager?.dashboardMode || 'inactive',
        alwaysOnEnabled: Boolean(session.dashboardManager?.alwaysOnEnabled),
        contentQueue: Array.isArray(session.dashboardManager?.contentQueue) ? 
          session.dashboardManager.contentQueue : []
      },
      appConnections: session.appConnections ? 
        Object.fromEntries(
          Object.entries(session.appConnections)
            .map(([key, value]) => [key, { readyState: value?.readyState || 0 }])
        ) : {},
      lastAudioTimestamp: session.lastAudioTimestamp || 0,
      transcriptionStreams: session.transcriptionStreams || {},
      audioBuffer: {
        chunks: [], // Don't send actual chunks
        lastProcessedSequence: session.audioBuffer?.lastProcessedSequence || 0,
        processingInProgress: Boolean(session.audioBuffer?.processingInProgress)
      },
      lc3Service: session.lc3Service ? {
        initialized: Boolean(session.lc3Service.initialized),
        status: session.lc3Service.status || 'unknown'
      } : null,
      recentEvents: Array.isArray(session.recentEvents) ? session.recentEvents : []
    };
  }

  private setupRoutes() {
    // Add middleware to handle SSE requests
    this.server.on('request', async (req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      
      // REST API endpoint for initial session data
      if (url.pathname === '/api/debug/sessions' && req.method === 'GET') {
        const stats = this.calculateSystemStats();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          sessions: Array.from(this.sessions.values()).map(session => this.serializeSession(session)),
          stats
        }));
        return;
      }

      // SSE endpoint for real-time updates
      if (url.pathname === '/api/debug/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        });

        // Send initial connection message
        res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
        
        // Send initial state
        const stats = this.calculateSystemStats();
        res.write(`event: sessions\ndata: ${JSON.stringify({ 
          sessions: Array.from(this.sessions.values()).map(session => this.serializeSession(session)), 
          stats 
        })}\n\n`);
        
        // Add client
        const client = {
          send: (data: string) => res.write(data)
        };
        this.clients.add(client);

        // Keep connection alive with heartbeats
        const heartbeat = setInterval(() => {
          res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
        }, 30000);

        // Clean up on close
        req.on('close', () => {
          clearInterval(heartbeat);
          this.clients.delete(client);
        });

        return;
      }
    });
  }

  private calculateSystemStats(): SystemStats {
    const activeSessions = Array.from(this.sessions.values()).filter(s => !s.disconnectedAt).length;
    const totalSessions = this.sessions.size;
    
    let activeTpas = 0;
    let totalTpas = 0;
    
    this.sessions.forEach(session => {
      totalTpas += (session.installedApps?.length || 0);
      activeTpas += (session.activeAppSessions?.length || 0);
    });
    
    return {
      activeSessions,
      totalSessions,
      activeTpas,
      totalTpas
    };
  }

  // Broadcast events to all connected clients
  private broadcastEvent(event: DebuggerEvent) {
    const message = `event: ${event.type.toLowerCase()}\ndata: ${JSON.stringify(event)}\n\n`;
    this.clients.forEach(client => {
      client.send(message);
    });
  }

  // Public methods for updating session state
  public updateSession(sessionId: string, data: Partial<DebugSessionInfo>) {
    const session = this.sessions.get(sessionId);
    if (session) {
      const updatedSession = { ...session, ...data };
      this.sessions.set(sessionId, updatedSession);
      this.broadcastEvent({
        type: 'SESSION_UPDATE',
        sessionId,
        data: this.serializeSession(updatedSession)
      });
    }
  }

  public sessionConnected(sessionId: string, session: DebugSessionInfo) {
    this.sessions.set(sessionId, session);
    this.broadcastEvent({
      type: 'SESSION_CONNECTED',
      sessionId,
      timestamp: new Date().toISOString()
    });
  }

  public sessionDisconnected(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, { ...session, disconnectedAt: new Date().toISOString() });
      this.broadcastEvent({
        type: 'SESSION_DISCONNECTED',
        sessionId,
        timestamp: new Date().toISOString()
      });
    }
  }

  public updateTPAState(sessionId: string, tpaId: string, state: any) {
    this.broadcastEvent({
      type: 'TPA_STATE_CHANGE',
      sessionId,
      tpaId,
      state
    });
  }

  public updateDisplay(sessionId: string, display: any) {
    this.broadcastEvent({
      type: 'DISPLAY_UPDATE',
      sessionId,
      display
    });
  }

  public updateTranscription(sessionId: string, transcript: any) {
    this.broadcastEvent({
      type: 'TRANSCRIPTION_UPDATE',
      sessionId,
      transcript
    });
  }

  public updateSystemStats() {
    this.broadcastEvent({
      type: 'SYSTEM_STATS_UPDATE',
      stats: this.calculateSystemStats()
    });
  }
} 