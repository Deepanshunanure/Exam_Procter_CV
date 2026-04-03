# 🔌 API Documentation - ProctorAI

Complete API reference for the ProctorAI exam monitoring system.

## 📋 Overview

The ProctorAI API provides RESTful endpoints and WebSocket connections for real-time exam monitoring. All endpoints return JSON responses and use standard HTTP status codes.

**Base URL**: `http://localhost:8765`  
**WebSocket URL**: `ws://localhost:8765`

## 🔐 Authentication

Currently, the API uses session-based authentication with unique session IDs. Future versions will include API key authentication and OAuth2 support.

## 📊 Response Format

All API responses follow this standard format:

```json
{
  "status": "success|error",
  "data": {},
  "message": "Optional message",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## 🛠️ REST API Endpoints

### Health Check

Check the system health and availability.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "1.0.0",
  "components": {
    "camera": "available",
    "models": "loaded",
    "websocket": "ready"
  }
}
```

**Status Codes**:
- `200`: System healthy
- `503`: System unavailable

---

### Start Session

Create a new exam monitoring session.

**Endpoint**: `POST /session/start`

**Request Body**:
```json
{
  "exam_id": "string (optional)",
  "student_id": "string (optional)",
  "duration_minutes": 120,
  "settings": {
    "ear_threshold": 0.22,
    "mar_threshold": 0.6,
    "yaw_threshold": 30,
    "pitch_threshold": 20,
    "roll_threshold": 30
  }
}
```

**Response**:
```json
{
  "session_id": "uuid-string",
  "started_at": "2024-01-01T12:00:00Z",
  "websocket_url": "ws://localhost:8765/ws/uuid-string",
  "settings": {
    "ear_threshold": 0.22,
    "mar_threshold": 0.6,
    "yaw_threshold": 30,
    "pitch_threshold": 20,
    "roll_threshold": 30
  }
}
```

**Status Codes**:
- `201`: Session created successfully
- `400`: Invalid request parameters
- `500`: Internal server error

---

### End Session

Terminate an active exam session.

**Endpoint**: `POST /session/{session_id}/end`

**Path Parameters**:
- `session_id`: UUID of the session to end

**Response**:
```json
{
  "session_id": "uuid-string",
  "ended_at": "2024-01-01T14:00:00Z",
  "duration_seconds": 7200,
  "total_violations": 15,
  "risk_score": 45,
  "report_url": "/session/uuid-string/report"
}
```

**Status Codes**:
- `200`: Session ended successfully
- `404`: Session not found
- `409`: Session already ended

---

### Get Violations

Retrieve all violations for a specific session.

**Endpoint**: `GET /session/{session_id}/violations`

**Path Parameters**:
- `session_id`: UUID of the session

**Query Parameters**:
- `severity`: Filter by severity (`critical`, `high`, `medium`, `low`)
- `type`: Filter by violation type
- `limit`: Maximum number of violations to return (default: 100)
- `offset`: Number of violations to skip (default: 0)

**Response**:
```json
{
  "session_id": "uuid-string",
  "total_violations": 15,
  "violations": [
    {
      "id": "violation-uuid",
      "timestamp": "2024-01-01T12:05:30Z",
      "type": "looking_away",
      "severity": "medium",
      "message": "Head turned away from screen for 3.2 seconds",
      "confidence": 0.95,
      "frame_data": {
        "yaw": -35.2,
        "pitch": 10.1,
        "roll": 2.3
      }
    }
  ]
}
```

**Status Codes**:
- `200`: Violations retrieved successfully
- `404`: Session not found

---

### Get Session Report

Generate a comprehensive session report.

**Endpoint**: `GET /session/{session_id}/report`

**Path Parameters**:
- `session_id`: UUID of the session

**Response**:
```json
{
  "session_id": "uuid-string",
  "started_at": "2024-01-01T12:00:00Z",
  "ended_at": "2024-01-01T14:00:00Z",
  "duration_seconds": 7200,
  "total_frames": 72000,
  "risk_score": 45,
  "violations": [
    {
      "id": "violation-uuid",
      "timestamp": "2024-01-01T12:05:30Z",
      "type": "looking_away",
      "severity": "medium",
      "message": "Head turned away from screen for 3.2 seconds",
      "confidence": 0.95
    }
  ],
  "violation_summary": {
    "critical": 2,
    "high": 5,
    "medium": 6,
    "low": 2
  },
  "statistics": {
    "avg_attention_score": 0.85,
    "total_looking_away_time": 45.2,
    "total_speaking_time": 12.1,
    "face_detection_rate": 0.98
  }
}
```

**Status Codes**:
- `200`: Report generated successfully
- `404`: Session not found
- `409`: Session still active

## 🔌 WebSocket API

### Connection

Connect to the WebSocket endpoint for real-time monitoring.

**URL**: `ws://localhost:8765/ws/{session_id}`

**Connection Headers**:
```
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Version: 13
```

### Message Types

#### 1. Frame Data (Client → Server)

Send video frame data for analysis.

```json
{
  "type": "frame",
  "timestamp": "2024-01-01T12:00:00Z",
  "frame_data": "base64-encoded-image-data",
  "frame_number": 1234
}
```

#### 2. Violation Event (Server → Client)

Receive real-time violation notifications.

```json
{
  "type": "violation",
  "violation": {
    "id": "violation-uuid",
    "timestamp": "2024-01-01T12:05:30Z",
    "type": "looking_away",
    "severity": "medium",
    "message": "Head turned away from screen for 3.2 seconds",
    "confidence": 0.95
  }
}
```

#### 3. Frame Analysis (Server → Client)

Receive processed frame with annotations and metrics.

```json
{
  "type": "frame_analysis",
  "timestamp": "2024-01-01T12:00:00Z",
  "frame_number": 1234,
  "annotated_frame": "base64-encoded-annotated-image",
  "metrics": {
    "ear": 0.28,
    "mar": 0.15,
    "yaw": -5.2,
    "pitch": 2.1,
    "roll": 0.8,
    "face_detected": true,
    "objects_detected": ["person"],
    "person_count": 1
  },
  "alerts": [
    {
      "type": "attention",
      "severity": "low",
      "message": "Slight head movement detected"
    }
  ]
}
```

#### 4. Session Status (Server → Client)

Receive session status updates.

```json
{
  "type": "session_status",
  "status": "active|paused|ended",
  "timestamp": "2024-01-01T12:00:00Z",
  "duration_seconds": 3600,
  "total_violations": 8
}
```

#### 5. Error Message (Server → Client)

Receive error notifications.

```json
{
  "type": "error",
  "error": {
    "code": "PROCESSING_ERROR",
    "message": "Failed to process frame",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### Connection Management

#### Connection Events

```javascript
// Connection opened
ws.onopen = function(event) {
  console.log('WebSocket connected');
};

// Message received
ws.onmessage = function(event) {
  const data = JSON.parse(event.data);
  handleMessage(data);
};

// Connection closed
ws.onclose = function(event) {
  console.log('WebSocket disconnected:', event.code, event.reason);
};

// Connection error
ws.onerror = function(error) {
  console.error('WebSocket error:', error);
};
```

#### Heartbeat/Ping

The server sends periodic ping messages to maintain connection:

```json
{
  "type": "ping",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

Client should respond with pong:

```json
{
  "type": "pong",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## 📊 Data Models

### Session Object

```typescript
interface Session {
  session_id: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  total_frames: number;
  risk_score?: number;
  settings: SessionSettings;
}
```

### Violation Object

```typescript
interface Violation {
  id: string;
  timestamp: string;
  type: ViolationType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  confidence: number;
  frame_data?: FrameMetrics;
}
```

### Frame Metrics

```typescript
interface FrameMetrics {
  ear: number;           // Eye Aspect Ratio
  mar: number;           // Mouth Aspect Ratio
  yaw: number;           // Head rotation (degrees)
  pitch: number;         // Head tilt (degrees)
  roll: number;          // Head roll (degrees)
  face_detected: boolean;
  objects_detected: string[];
  person_count: number;
}
```

### Violation Types

```typescript
type ViolationType = 
  | 'looking_away'
  | 'eyes_closed'
  | 'speaking'
  | 'multiple_people'
  | 'unauthorized_object'
  | 'face_not_visible'
  | 'excessive_movement';
```

## 🚨 Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `SESSION_NOT_FOUND` | Session ID not found | 404 |
| `SESSION_ALREADY_ENDED` | Session has already ended | 409 |
| `INVALID_FRAME_DATA` | Invalid or corrupted frame data | 400 |
| `PROCESSING_ERROR` | Error during frame processing | 500 |
| `WEBSOCKET_ERROR` | WebSocket connection error | 500 |
| `CAMERA_ERROR` | Camera access or processing error | 500 |
| `MODEL_ERROR` | ML model loading or inference error | 500 |

## 📝 Usage Examples

### JavaScript/TypeScript Client

```typescript
class ProctoringClient {
  private ws: WebSocket;
  private sessionId: string;

  async startSession(): Promise<string> {
    const response = await fetch('/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duration_minutes: 120,
        settings: {
          ear_threshold: 0.22,
          mar_threshold: 0.6
        }
      })
    });
    
    const data = await response.json();
    this.sessionId = data.session_id;
    
    // Connect WebSocket
    this.ws = new WebSocket(`ws://localhost:8765/ws/${this.sessionId}`);
    this.setupWebSocket();
    
    return this.sessionId;
  }

  private setupWebSocket() {
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'violation':
          this.handleViolation(data.violation);
          break;
        case 'frame_analysis':
          this.handleFrameAnalysis(data);
          break;
        case 'error':
          this.handleError(data.error);
          break;
      }
    };
  }

  sendFrame(videoElement: HTMLVideoElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.drawImage(videoElement, 0, 0);
    
    const frameData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    this.ws.send(JSON.stringify({
      type: 'frame',
      timestamp: new Date().toISOString(),
      frame_data: frameData,
      frame_number: Date.now()
    }));
  }

  async endSession(): Promise<SessionReport> {
    const response = await fetch(`/session/${this.sessionId}/end`, {
      method: 'POST'
    });
    
    this.ws.close();
    return response.json();
  }
}
```

### Python Client

```python
import asyncio
import websockets
import json
import base64
import cv2

class ProctoringClient:
    def __init__(self, base_url="http://localhost:8765"):
        self.base_url = base_url
        self.session_id = None
        self.ws = None

    async def start_session(self, settings=None):
        import aiohttp
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/session/start",
                json={"settings": settings or {}}
            ) as response:
                data = await response.json()
                self.session_id = data["session_id"]
                
        # Connect WebSocket
        ws_url = f"ws://localhost:8765/ws/{self.session_id}"
        self.ws = await websockets.connect(ws_url)
        
        return self.session_id

    async def send_frame(self, frame):
        # Encode frame as base64
        _, buffer = cv2.imencode('.jpg', frame)
        frame_data = base64.b64encode(buffer).decode('utf-8')
        
        message = {
            "type": "frame",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "frame_data": frame_data,
            "frame_number": int(time.time() * 1000)
        }
        
        await self.ws.send(json.dumps(message))

    async def listen_for_violations(self):
        async for message in self.ws:
            data = json.loads(message)
            
            if data["type"] == "violation":
                print(f"Violation detected: {data['violation']}")
            elif data["type"] == "frame_analysis":
                print(f"Frame analysis: {data['metrics']}")

    async def end_session(self):
        import aiohttp
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/session/{self.session_id}/end"
            ) as response:
                report = await response.json()
                
        await self.ws.close()
        return report
```

## 🔄 Rate Limits

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| `/health` | 60 requests | 1 minute |
| `/session/start` | 10 requests | 1 minute |
| `/session/*/end` | 30 requests | 1 minute |
| `/session/*/violations` | 100 requests | 1 minute |
| `/session/*/report` | 30 requests | 1 minute |
| WebSocket frames | 30 fps | Continuous |

## 📚 SDKs and Libraries

### Official SDKs
- **JavaScript/TypeScript**: `@proctorai/client`
- **Python**: `proctorai-python`
- **Java**: `proctorai-java` (coming soon)
- **C#**: `ProctoAI.NET` (coming soon)

### Community Libraries
- **React Hook**: `use-proctor-ai`
- **Vue.js Plugin**: `vue-proctor-ai`
- **Angular Service**: `ng-proctor-ai`

---

<div align="center">
  <strong>Complete API reference for seamless integration</strong>
</div>