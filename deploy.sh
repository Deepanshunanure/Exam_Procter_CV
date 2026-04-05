#!/bin/bash

# ProctorAI Deployment Helper Script

echo "🚀 ProctorAI Deployment Helper"
echo "================================"

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "❌ Git repository not found. Please initialize git first:"
    echo "   git init"
    echo "   git add ."
    echo "   git commit -m 'Initial commit'"
    echo "   git remote add origin <your-github-repo-url>"
    echo "   git push -u origin main"
    exit 1
fi

# Check if changes are committed
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  You have uncommitted changes. Please commit them first:"
    echo "   git add ."
    echo "   git commit -m 'Prepare for deployment'"
    echo "   git push origin main"
    exit 1
fi

echo "✅ Git repository is ready"

# Backend deployment instructions
echo ""
echo "📦 BACKEND DEPLOYMENT (Render)"
echo "==============================="
echo "1. Go to https://dashboard.render.com/"
echo "2. Click 'New +' → 'Web Service'"
echo "3. Connect your GitHub repository"
echo "4. Configure:"
echo "   - Name: proctor-ai-backend"
echo "   - Root Directory: backend"
echo "   - Build Command: pip install -r requirements.txt"
echo "   - Start Command: python proctor_detector.py --server"
echo "   - Environment Variables:"
echo "     * PYTHON_VERSION: 3.9.18"
echo "     * ALLOWED_ORIGINS: https://your-app.vercel.app"
echo ""

# Frontend deployment instructions
echo "🌐 FRONTEND DEPLOYMENT (Vercel)"
echo "==============================="
echo "1. Go to https://vercel.com/dashboard"
echo "2. Click 'New Project'"
echo "3. Import your GitHub repository"
echo "4. Configure:"
echo "   - Root Directory: frontend"
echo "   - Environment Variables:"
echo "     * NEXT_PUBLIC_API_URL: https://your-backend-app.onrender.com"
echo ""

echo "📋 DEPLOYMENT CHECKLIST"
echo "======================="
echo "□ Backend deployed on Render"
echo "□ Frontend deployed on Vercel"
echo "□ Environment variables configured"
echo "□ CORS origins updated"
echo "□ Health check passes"
echo "□ Frontend connects to backend"
echo ""

echo "🔗 USEFUL LINKS"
echo "==============="
echo "• Render Dashboard: https://dashboard.render.com/"
echo "• Vercel Dashboard: https://vercel.com/dashboard"
echo "• Deployment Guide: ./DEPLOYMENT_GUIDE.md"
echo ""

echo "✨ Happy deploying!"