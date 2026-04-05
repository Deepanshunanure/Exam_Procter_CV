# 🚀 Deployment Guide - ProctorAI

This guide will help you deploy the ProctorAI system with the backend on Render and frontend on Vercel.

## 📋 Prerequisites

- GitHub account
- Render account (free tier available)
- Vercel account (free tier available)
- Your code pushed to a GitHub repository

## 🔧 Backend Deployment on Render

### Step 1: Prepare Your Repository

1. **Push your code to GitHub** (if not already done):
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```

### Step 2: Deploy on Render

1. **Go to [Render Dashboard](https://dashboard.render.com/)**

2. **Click "New +" → "Web Service"**

3. **Connect your GitHub repository**
   - Select your ProctorAI repository
   - Click "Connect"

4. **Configure the service:**
   - **Name**: `proctor-ai-backend`
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python proctor_detector.py --server`

5. **Environment Variables** (click "Advanced"):
   - `PYTHON_VERSION`: `3.9.18`
   - `PORT`: `8765` (Render will override this automatically)

6. **Click "Create Web Service"**

7. **Wait for deployment** (5-10 minutes)
   - Monitor the build logs
   - Once deployed, you'll get a URL like: `https://proctor-ai-backend-xxxx.onrender.com`

### Step 3: Test Backend Deployment

```bash
# Test the health endpoint (replace with your Render URL)
curl https://your-backend-app.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "mediapipe": true,
  "yolo": true,
  "active_sessions": 0
}
```

## 🌐 Frontend Deployment on Vercel

### Step 1: Install Vercel CLI (Optional)

```bash
npm i -g vercel
```

### Step 2: Deploy via Vercel Dashboard

1. **Go to [Vercel Dashboard](https://vercel.com/dashboard)**

2. **Click "New Project"**

3. **Import your GitHub repository**
   - Select your ProctorAI repository
   - Click "Import"

4. **Configure the project:**
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)
   - **Install Command**: `npm install` (auto-detected)

5. **Environment Variables:**
   - **Key**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://your-backend-app.onrender.com` (your Render backend URL)

6. **Click "Deploy"**

7. **Wait for deployment** (2-3 minutes)
   - You'll get a URL like: `https://your-app.vercel.app`

### Step 3: Alternative - Deploy via CLI

```bash
# Navigate to frontend directory
cd frontend

# Deploy to Vercel
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? (select your account)
# - Link to existing project? N
# - Project name: proctor-ai-frontend
# - Directory: ./
# - Override settings? N

# Set environment variable
vercel env add NEXT_PUBLIC_API_URL
# Enter your Render backend URL when prompted

# Redeploy with environment variables
vercel --prod
```

## 🔧 Configuration Updates

### Backend CORS Configuration

The backend needs to allow requests from your Vercel domain. Update the CORS settings in `backend/proctor_detector.py`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Local development
        "https://your-app.vercel.app",  # Your Vercel domain
        "https://*.vercel.app",  # All Vercel preview deployments
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

### Frontend Environment Variables

Create a `.env.local` file in the frontend directory for local development:

```bash
# Frontend/.env.local
NEXT_PUBLIC_API_URL=https://your-backend-app.onrender.com
```

## 🔍 Troubleshooting

### Common Backend Issues

**1. Build Fails on Render**
- Check the build logs in Render dashboard
- Ensure all dependencies are in `requirements.txt`
- Verify Python version compatibility

**2. Service Won't Start**
- Check if the start command is correct: `python proctor_detector.py --server`
- Verify the PORT environment variable is being used
- Check for any import errors in the logs

**3. Camera/MediaPipe Issues**
- Render's free tier has limited resources
- Consider upgrading to a paid plan for better performance
- Monitor memory usage in Render dashboard

### Common Frontend Issues

**1. API Connection Fails**
- Verify the `NEXT_PUBLIC_API_URL` environment variable
- Check CORS settings on the backend
- Ensure the backend is running and accessible

**2. Build Fails on Vercel**
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify TypeScript compilation

**3. Environment Variables Not Working**
- Environment variables must start with `NEXT_PUBLIC_` for client-side access
- Redeploy after adding environment variables
- Check the Vercel project settings

## 📊 Monitoring & Maintenance

### Backend Monitoring (Render)
- Monitor service health at `/health` endpoint
- Check logs in Render dashboard
- Set up uptime monitoring (UptimeRobot, etc.)

### Frontend Monitoring (Vercel)
- Use Vercel Analytics (built-in)
- Monitor Core Web Vitals
- Check function logs for API calls

### Performance Optimization

**Backend (Render)**
- Use Render's paid plans for better performance
- Optimize model loading and inference
- Implement caching for static resources

**Frontend (Vercel)**
- Enable Vercel's Edge Functions if needed
- Optimize images and assets
- Use Vercel's built-in CDN

## 🔐 Security Considerations

### HTTPS Configuration
- Both Render and Vercel provide HTTPS by default
- Update all API calls to use HTTPS URLs
- Ensure WebSocket connections use WSS protocol

### Environment Variables
- Never commit `.env` files to version control
- Use different API keys for production vs development
- Regularly rotate sensitive credentials

### CORS Security
- Restrict CORS origins to your specific domains
- Don't use wildcard (*) origins in production
- Regularly review and update allowed origins

## 🎯 Production Checklist

### Before Going Live
- [ ] Backend deployed and health check passes
- [ ] Frontend deployed and connects to backend
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] HTTPS working on both services
- [ ] WebSocket connections working
- [ ] Camera access working in production
- [ ] Error handling and logging configured
- [ ] Performance testing completed

### Post-Deployment
- [ ] Set up monitoring and alerts
- [ ] Configure backup strategies
- [ ] Document deployment process
- [ ] Set up CI/CD pipelines (optional)
- [ ] Plan for scaling and updates

## 📞 Support

If you encounter issues during deployment:

1. **Check service logs** in Render/Vercel dashboards
2. **Verify environment variables** are set correctly
3. **Test API endpoints** individually
4. **Check CORS configuration** if frontend can't connect
5. **Monitor resource usage** on both platforms

---

<div align="center">
  <strong>🎉 Congratulations! Your ProctorAI system is now deployed and ready for production use!</strong>
</div>

## 📝 Quick Reference

### Important URLs
- **Render Backend**: `https://your-backend-app.onrender.com`
- **Vercel Frontend**: `https://your-app.vercel.app`
- **Health Check**: `https://your-backend-app.onrender.com/health`

### Key Commands
```bash
# Test backend health
curl https://your-backend-app.onrender.com/health

# Deploy frontend updates
cd frontend && vercel --prod

# View backend logs
# (Use Render dashboard)

# View frontend logs
vercel logs your-app.vercel.app
```