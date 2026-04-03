# 🛠️ Setup Guide - ProctorAI

This guide provides detailed setup instructions for the ProctorAI exam monitoring system.

## 📋 System Requirements

### Hardware Requirements
- **CPU**: Multi-core processor (Intel i5/AMD Ryzen 5 or better)
- **RAM**: Minimum 8GB, recommended 16GB
- **Storage**: 2GB free space
- **Camera**: HD webcam (720p minimum, 1080p recommended)
- **Network**: Stable internet connection for real-time processing

### Software Requirements
- **Operating System**: Windows 10+, macOS 10.15+, or Linux Ubuntu 18.04+
- **Python**: Version 3.8 or higher
- **Node.js**: Version 18.0 or higher
- **Browser**: Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+

## 🐍 Backend Setup (Python/FastAPI)

### Step 1: Environment Setup

**Option A: Using Virtual Environment (Recommended)**
```bash
# Create virtual environment
python -m venv proctor-env

# Activate virtual environment
# On Windows:
proctor-env\Scripts\activate
# On macOS/Linux:
source proctor-env/bin/activate
```

**Option B: Using Conda**
```bash
# Create conda environment
conda create -n proctor-ai python=3.9
conda activate proctor-ai
```

### Step 2: Install Dependencies

```bash
# Navigate to backend directory
cd backend

# Install core dependencies
pip install fastapi==0.104.1
pip install uvicorn[standard]==0.24.0
pip install opencv-python==4.8.1.78
pip install mediapipe==0.10.7
pip install ultralytics==8.0.196
pip install numpy==1.24.3
pip install websockets==12.0
pip install python-multipart==0.0.6
```

**Alternative: Install from requirements file**
```bash
# Create requirements.txt with the above versions
pip install -r requirements.txt
```

### Step 3: Download Model Weights

The YOLOv8 model weights should be automatically downloaded on first run. If not:

```bash
# Download YOLOv8 nano model
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

### Step 4: Test Backend

```bash
# Start the backend server
python proctor_detector.py

# Test health endpoint
curl http://localhost:8765/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "1.0.0"
}
```

## 🌐 Frontend Setup (Next.js/React)

### Step 1: Node.js Installation

**Using Node Version Manager (Recommended)**
```bash
# Install nvm (macOS/Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install and use Node.js 18
nvm install 18
nvm use 18
```

**Direct Installation**
- Download from [nodejs.org](https://nodejs.org/)
- Choose LTS version (18.x or higher)

### Step 2: Install Dependencies

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Alternative: Use yarn
yarn install
```

### Step 3: Environment Configuration

Create `.env.local` file in the frontend directory:
```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8765

# Optional: Analytics
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=your_analytics_id
```

### Step 4: Development Server

```bash
# Start development server
npm run dev

# Alternative commands
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## 🔧 Configuration Options

### Backend Configuration

Edit `proctor_detector.py` to customize detection parameters:

```python
# Detection thresholds
EAR_THRESHOLD = 0.22        # Eye aspect ratio (lower = more sensitive)
MAR_THRESHOLD = 0.6         # Mouth aspect ratio (higher = less sensitive)
YAW_THRESHOLD = 30          # Head rotation left/right (degrees)
PITCH_THRESHOLD = 20        # Head tilt up/down (degrees)
ROLL_THRESHOLD = 30         # Head roll (degrees)

# Timing thresholds
EYES_CLOSED_TIME = 2.0      # Seconds before flagging closed eyes
LOOKING_AWAY_TIME = 3.0     # Seconds before flagging looking away
SPEAKING_TIME = 1.5         # Seconds before flagging speaking

# Server configuration
HOST = "0.0.0.0"           # Server host
PORT = 8765                # Server port
```

### Frontend Configuration

Modify `frontend/lib/proctor-client.ts` for client settings:

```typescript
// WebSocket configuration
const WS_RECONNECT_DELAY = 3000;    // Reconnection delay (ms)
const FRAME_RATE = 10;              // Frames per second to send
const MAX_RECONNECT_ATTEMPTS = 5;   // Max reconnection attempts

// API endpoints
const API_ENDPOINTS = {
  health: '/health',
  start: '/session/start',
  end: '/session/{id}/end',
  report: '/session/{id}/report'
};
```

## 🚀 Production Deployment

### Backend Deployment

**Using Docker (Recommended)**
```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8765

CMD ["uvicorn", "proctor_detector:app", "--host", "0.0.0.0", "--port", "8765"]
```

**Using systemd (Linux)**
```ini
[Unit]
Description=ProctorAI Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/backend
ExecStart=/path/to/venv/bin/uvicorn proctor_detector:app --host 0.0.0.0 --port 8765
Restart=always

[Install]
WantedBy=multi-user.target
```

### Frontend Deployment

**Using Vercel (Recommended)**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

**Using Docker**
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

## 🔍 Troubleshooting

### Common Backend Issues

**1. Camera Access Denied**
```bash
# Linux: Add user to video group
sudo usermod -a -G video $USER

# Restart session after adding to group
```

**2. OpenCV Installation Issues**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install python3-opencv

# macOS with Homebrew
brew install opencv

# Windows: Use pre-compiled wheels
pip install opencv-python-headless
```

**3. MediaPipe Installation Issues**
```bash
# For Apple Silicon Macs
pip install mediapipe-silicon

# For older systems
pip install mediapipe==0.8.11
```

### Common Frontend Issues

**1. Node.js Version Conflicts**
```bash
# Check Node version
node --version

# Use specific version
nvm use 18.17.0
```

**2. Package Installation Errors**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**3. Build Errors**
```bash
# Check TypeScript errors
npm run type-check

# Fix ESLint issues
npm run lint --fix
```

### Performance Optimization

**Backend Optimization**
```python
# Reduce frame processing rate
FRAME_SKIP = 2  # Process every 2nd frame

# Optimize OpenCV
cv2.setUseOptimized(True)
cv2.setNumThreads(4)

# Use smaller model for faster inference
model = YOLO('yolov8s.pt')  # Instead of yolov8n.pt
```

**Frontend Optimization**
```typescript
// Reduce WebSocket frame rate
const FRAME_RATE = 5;  // Lower frame rate

// Enable image optimization
const nextConfig = {
  images: {
    unoptimized: false,  // Enable optimization
  },
};
```

## 📊 Monitoring & Logging

### Backend Logging
```python
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('proctor.log'),
        logging.StreamHandler()
    ]
)
```

### Frontend Analytics
```typescript
// Add to _app.tsx
import { Analytics } from '@vercel/analytics/react';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
```

## 🔐 Security Considerations

### HTTPS Setup
```bash
# Generate self-signed certificate for development
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Run with HTTPS
uvicorn proctor_detector:app --host 0.0.0.0 --port 8765 --ssl-keyfile key.pem --ssl-certfile cert.pem
```

### CORS Configuration
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],  # Restrict origins
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

## 📞 Getting Help

If you encounter issues during setup:

1. **Check the logs** for error messages
2. **Verify system requirements** are met
3. **Test each component** individually
4. **Check firewall settings** for port access
5. **Review browser console** for frontend errors

For additional support:
- 📖 **Documentation**: Check the main README.md
- 🐛 **Issues**: Report bugs on GitHub
- 💬 **Discussions**: Join community discussions
- 📧 **Contact**: Reach out to maintainers

---

<div align="center">
  <strong>Setup complete! Ready to start proctoring exams securely.</strong>
</div>