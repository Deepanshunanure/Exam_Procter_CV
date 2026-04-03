# 🚀 Deployment Guide - ProctorAI

Complete deployment guide for production environments, including cloud platforms, containerization, and scaling strategies.

## 📋 Deployment Overview

ProctorAI can be deployed in various configurations:
- **Single Server**: Backend and frontend on one machine
- **Microservices**: Separate backend and frontend deployments
- **Cloud Native**: Containerized deployment with orchestration
- **Hybrid**: On-premises backend with cloud frontend

## 🐳 Docker Deployment

### Backend Dockerfile

```dockerfile
FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgthread-2.0-0 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 proctor && chown -R proctor:proctor /app
USER proctor

# Expose port
EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8765/health || exit 1

# Start application
CMD ["uvicorn", "proctor_detector:app", "--host", "0.0.0.0", "--port", "8765"]
```

### Frontend Dockerfile

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production image
FROM node:18-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8765:8765"
    environment:
      - PYTHONUNBUFFERED=1
      - LOG_LEVEL=INFO
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8765/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8765
    depends_on:
      - backend
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - frontend
      - backend
    restart: unless-stopped

volumes:
  logs:
```

## ☁️ Cloud Platform Deployments

### AWS Deployment

#### Using AWS ECS (Elastic Container Service)

**1. Create ECR Repositories**
```bash
# Create repositories
aws ecr create-repository --repository-name proctor-ai/backend
aws ecr create-repository --repository-name proctor-ai/frontend

# Get login token
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-west-2.amazonaws.com

# Build and push images
docker build -t proctor-ai/backend ./backend
docker tag proctor-ai/backend:latest <account-id>.dkr.ecr.us-west-2.amazonaws.com/proctor-ai/backend:latest
docker push <account-id>.dkr.ecr.us-west-2.amazonaws.com/proctor-ai/backend:latest
```

**2. ECS Task Definition**
```json
{
  "family": "proctor-ai",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "<account-id>.dkr.ecr.us-west-2.amazonaws.com/proctor-ai/backend:latest",
      "portMappings": [
        {
          "containerPort": 8765,
          "protocol": "tcp"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/proctor-ai",
          "awslogs-region": "us-west-2",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8765/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

**3. Application Load Balancer**
```yaml
# ALB configuration
Resources:
  LoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: proctor-ai-alb
      Scheme: internet-facing
      Type: application
      Subnets:
        - !Ref PublicSubnet1
        - !Ref PublicSubnet2
      SecurityGroups:
        - !Ref ALBSecurityGroup

  TargetGroup:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      Name: proctor-ai-targets
      Port: 8765
      Protocol: HTTP
      VpcId: !Ref VPC
      TargetType: ip
      HealthCheckPath: /health
      HealthCheckProtocol: HTTP
```

#### Using AWS Lambda (Serverless)

**Backend Lambda Function**
```python
import json
import base64
from mangum import Mangum
from proctor_detector import app

# Lambda handler
handler = Mangum(app, lifespan="off")

def lambda_handler(event, context):
    # Handle WebSocket connections differently
    if event.get('requestContext', {}).get('routeKey'):
        return handle_websocket(event, context)
    
    return handler(event, context)

def handle_websocket(event, context):
    # WebSocket handling logic
    route_key = event['requestContext']['routeKey']
    connection_id = event['requestContext']['connectionId']
    
    if route_key == '$connect':
        return {'statusCode': 200}
    elif route_key == '$disconnect':
        return {'statusCode': 200}
    elif route_key == 'frame':
        # Process frame data
        return process_frame(event['body'], connection_id)
    
    return {'statusCode': 400}
```

### Google Cloud Platform (GCP)

#### Using Cloud Run

**1. Build and Deploy**
```bash
# Build with Cloud Build
gcloud builds submit --tag gcr.io/PROJECT_ID/proctor-ai-backend ./backend
gcloud builds submit --tag gcr.io/PROJECT_ID/proctor-ai-frontend ./frontend

# Deploy to Cloud Run
gcloud run deploy proctor-ai-backend \
  --image gcr.io/PROJECT_ID/proctor-ai-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --port 8765

gcloud run deploy proctor-ai-frontend \
  --image gcr.io/PROJECT_ID/proctor-ai-frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_API_URL=https://proctor-ai-backend-xxx.run.app
```

**2. Cloud Run Service Configuration**
```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: proctor-ai-backend
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"
        run.googleapis.com/memory: "2Gi"
    spec:
      containerConcurrency: 80
      containers:
      - image: gcr.io/PROJECT_ID/proctor-ai-backend
        ports:
        - containerPort: 8765
        resources:
          limits:
            cpu: "2"
            memory: "2Gi"
        env:
        - name: LOG_LEVEL
          value: "INFO"
```

### Microsoft Azure

#### Using Azure Container Instances

```bash
# Create resource group
az group create --name proctor-ai-rg --location eastus

# Create container instances
az container create \
  --resource-group proctor-ai-rg \
  --name proctor-ai-backend \
  --image your-registry.azurecr.io/proctor-ai/backend:latest \
  --cpu 2 \
  --memory 4 \
  --ports 8765 \
  --dns-name-label proctor-ai-backend \
  --environment-variables LOG_LEVEL=INFO

az container create \
  --resource-group proctor-ai-rg \
  --name proctor-ai-frontend \
  --image your-registry.azurecr.io/proctor-ai/frontend:latest \
  --cpu 1 \
  --memory 2 \
  --ports 3000 \
  --dns-name-label proctor-ai-frontend \
  --environment-variables NEXT_PUBLIC_API_URL=http://proctor-ai-backend.eastus.azurecontainer.io:8765
```

## ⚙️ Kubernetes Deployment

### Namespace and ConfigMap

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: proctor-ai
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: proctor-ai-config
  namespace: proctor-ai
data:
  LOG_LEVEL: "INFO"
  EAR_THRESHOLD: "0.22"
  MAR_THRESHOLD: "0.6"
  YAW_THRESHOLD: "30"
  PITCH_THRESHOLD: "20"
  ROLL_THRESHOLD: "30"
```

### Backend Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: proctor-ai-backend
  namespace: proctor-ai
spec:
  replicas: 3
  selector:
    matchLabels:
      app: proctor-ai-backend
  template:
    metadata:
      labels:
        app: proctor-ai-backend
    spec:
      containers:
      - name: backend
        image: proctor-ai/backend:latest
        ports:
        - containerPort: 8765
        envFrom:
        - configMapRef:
            name: proctor-ai-config
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1"
        livenessProbe:
          httpGet:
            path: /health
            port: 8765
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8765
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: proctor-ai-backend-service
  namespace: proctor-ai
spec:
  selector:
    app: proctor-ai-backend
  ports:
  - protocol: TCP
    port: 8765
    targetPort: 8765
  type: ClusterIP
```

### Frontend Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: proctor-ai-frontend
  namespace: proctor-ai
spec:
  replicas: 2
  selector:
    matchLabels:
      app: proctor-ai-frontend
  template:
    metadata:
      labels:
        app: proctor-ai-frontend
    spec:
      containers:
      - name: frontend
        image: proctor-ai/frontend:latest
        ports:
        - containerPort: 3000
        env:
        - name: NEXT_PUBLIC_API_URL
          value: "http://proctor-ai-backend-service:8765"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: proctor-ai-frontend-service
  namespace: proctor-ai
spec:
  selector:
    app: proctor-ai-frontend
  ports:
  - protocol: TCP
    port: 3000
    targetPort: 3000
  type: ClusterIP
```

### Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: proctor-ai-ingress
  namespace: proctor-ai
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/websocket-services: "proctor-ai-backend-service"
spec:
  tls:
  - hosts:
    - proctor-ai.yourdomain.com
    secretName: proctor-ai-tls
  rules:
  - host: proctor-ai.yourdomain.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: proctor-ai-backend-service
            port:
              number: 8765
      - path: /ws
        pathType: Prefix
        backend:
          service:
            name: proctor-ai-backend-service
            port:
              number: 8765
      - path: /
        pathType: Prefix
        backend:
          service:
            name: proctor-ai-frontend-service
            port:
              number: 3000
```

## 🔧 Production Configuration

### Environment Variables

**Backend (.env)**
```bash
# Server Configuration
HOST=0.0.0.0
PORT=8765
LOG_LEVEL=INFO
WORKERS=4

# Detection Thresholds
EAR_THRESHOLD=0.22
MAR_THRESHOLD=0.6
YAW_THRESHOLD=30
PITCH_THRESHOLD=20
ROLL_THRESHOLD=30

# Security
CORS_ORIGINS=https://yourdomain.com
API_KEY_REQUIRED=true
SESSION_TIMEOUT=7200

# Database (if using)
DATABASE_URL=postgresql://user:pass@localhost/proctor_ai
REDIS_URL=redis://localhost:6379

# Monitoring
SENTRY_DSN=https://your-sentry-dsn
PROMETHEUS_ENABLED=true
```

**Frontend (.env.production)**
```bash
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
NEXT_PUBLIC_SENTRY_DSN=https://your-frontend-sentry-dsn
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id
```

### Nginx Configuration

```nginx
upstream backend {
    server backend:8765;
}

upstream frontend {
    server frontend:3000;
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://backend/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://backend/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

## 📊 Monitoring and Logging

### Prometheus Metrics

```python
# Add to backend
from prometheus_client import Counter, Histogram, Gauge, generate_latest

# Metrics
session_counter = Counter('proctor_sessions_total', 'Total sessions started')
violation_counter = Counter('proctor_violations_total', 'Total violations detected', ['type', 'severity'])
frame_processing_time = Histogram('proctor_frame_processing_seconds', 'Frame processing time')
active_sessions = Gauge('proctor_active_sessions', 'Currently active sessions')

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type="text/plain")
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "ProctorAI Monitoring",
    "panels": [
      {
        "title": "Active Sessions",
        "type": "stat",
        "targets": [
          {
            "expr": "proctor_active_sessions"
          }
        ]
      },
      {
        "title": "Violations by Type",
        "type": "piechart",
        "targets": [
          {
            "expr": "sum by (type) (rate(proctor_violations_total[5m]))"
          }
        ]
      },
      {
        "title": "Frame Processing Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, proctor_frame_processing_seconds_bucket)"
          }
        ]
      }
    ]
  }
}
```

### Centralized Logging

**Fluentd Configuration**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/*proctor-ai*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      format json
    </source>
    
    <match kubernetes.**>
      @type elasticsearch
      host elasticsearch.logging.svc.cluster.local
      port 9200
      index_name proctor-ai
    </match>
```

## 🔒 Security Hardening

### SSL/TLS Configuration

```bash
# Generate SSL certificate with Let's Encrypt
certbot certonly --webroot -w /var/www/html -d yourdomain.com

# Auto-renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet" | crontab -
```

### Security Headers

```nginx
# Add security headers
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';";
```

### Network Security

```yaml
# Kubernetes Network Policy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: proctor-ai-network-policy
  namespace: proctor-ai
spec:
  podSelector:
    matchLabels:
      app: proctor-ai-backend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: proctor-ai-frontend
    ports:
    - protocol: TCP
      port: 8765
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 443
    - protocol: TCP
      port: 80
```

## 📈 Scaling Strategies

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: proctor-ai-backend-hpa
  namespace: proctor-ai
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: proctor-ai-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Load Testing

```bash
# Install k6
curl https://github.com/grafana/k6/releases/download/v0.45.0/k6-v0.45.0-linux-amd64.tar.gz -L | tar xvz --strip-components 1

# Load test script
cat > load-test.js << 'EOF'
import ws from 'k6/ws';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 },
  ],
};

export default function () {
  const url = 'ws://yourdomain.com/ws/test-session';
  const response = ws.connect(url, function (socket) {
    socket.on('open', function open() {
      console.log('connected');
      socket.send(JSON.stringify({
        type: 'frame',
        frame_data: 'base64-encoded-test-frame'
      }));
    });

    socket.on('message', function (message) {
      console.log('Message received: ', message);
    });

    socket.on('close', function close() {
      console.log('disconnected');
    });
  });

  check(response, { 'status is 101': (r) => r && r.status === 101 });
}
EOF

# Run load test
k6 run load-test.js
```

## 🔄 CI/CD Pipeline

### GitHub Actions

```yaml
name: Deploy ProctorAI

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.9'
    
    - name: Install dependencies
      run: |
        cd backend
        pip install -r requirements.txt
        pip install pytest
    
    - name: Run tests
      run: |
        cd backend
        pytest tests/
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install frontend dependencies
      run: |
        cd frontend
        npm ci
    
    - name: Run frontend tests
      run: |
        cd frontend
        npm test
    
    - name: Build frontend
      run: |
        cd frontend
        npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-west-2
    
    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v1
    
    - name: Build and push backend image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        ECR_REPOSITORY: proctor-ai/backend
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG ./backend
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
    
    - name: Build and push frontend image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        ECR_REPOSITORY: proctor-ai/frontend
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG ./frontend
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
    
    - name: Deploy to ECS
      run: |
        aws ecs update-service --cluster proctor-ai --service proctor-ai-backend --force-new-deployment
        aws ecs update-service --cluster proctor-ai --service proctor-ai-frontend --force-new-deployment
```

## 🚨 Disaster Recovery

### Backup Strategy

```bash
#!/bin/bash
# backup.sh

# Backup configuration
BACKUP_DIR="/backups/proctor-ai"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR/$DATE

# Backup database (if using)
pg_dump proctor_ai > $BACKUP_DIR/$DATE/database.sql

# Backup configuration files
cp -r /app/config $BACKUP_DIR/$DATE/

# Backup logs
cp -r /app/logs $BACKUP_DIR/$DATE/

# Compress backup
tar -czf $BACKUP_DIR/proctor-ai-backup-$DATE.tar.gz $BACKUP_DIR/$DATE

# Upload to S3
aws s3 cp $BACKUP_DIR/proctor-ai-backup-$DATE.tar.gz s3://proctor-ai-backups/

# Cleanup old backups (keep last 30 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

### Recovery Procedures

```bash
#!/bin/bash
# restore.sh

BACKUP_FILE=$1
RESTORE_DIR="/tmp/restore"

# Extract backup
mkdir -p $RESTORE_DIR
tar -xzf $BACKUP_FILE -C $RESTORE_DIR

# Restore database
psql proctor_ai < $RESTORE_DIR/database.sql

# Restore configuration
cp -r $RESTORE_DIR/config/* /app/config/

# Restart services
kubectl rollout restart deployment/proctor-ai-backend -n proctor-ai
kubectl rollout restart deployment/proctor-ai-frontend -n proctor-ai
```

---

<div align="center">
  <strong>Production-ready deployment for enterprise-scale exam monitoring</strong>
</div>