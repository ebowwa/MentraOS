# Use MediaMTX with FFmpeg included
FROM bluenviron/mediamtx:latest-ffmpeg

# Install curl for API calls
RUN apk add --no-cache curl bash

# Copy our configuration
COPY mediamtx.yml /mediamtx.yml

# Expose RTMP and API ports
EXPOSE 1935 9997

# Health check using MediaMTX API
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s \
  CMD curl -f http://localhost:9997/v3/config/get || exit 1

# MediaMTX will use our config file by default