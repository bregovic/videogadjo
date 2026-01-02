# VideoStitch - Railway Dockerfile with FFmpeg
FROM node:20-slim

# Install FFmpeg and dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Create directories for temporary files
RUN mkdir -p /tmp/uploads /tmp/proxies /tmp/exports

# Expose port
EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3333/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
