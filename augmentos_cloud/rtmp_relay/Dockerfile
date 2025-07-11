# Use MediaMTX with FFmpeg included
FROM bluenviron/mediamtx:latest-ffmpeg

# Install wget and nginx for HLS serving
RUN apk add --no-cache wget nginx

# Copy our configuration and scripts
COPY mediamtx.yml /mediamtx.yml
COPY stream-manager.sh /stream-manager.sh
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY start.sh /start.sh

# Make scripts executable
RUN chmod +x /stream-manager.sh /start.sh

# Create HLS directory
RUN mkdir -p /hls

# Expose RTMP, HLS/DASH, and API ports
EXPOSE 1935 8888 9997

# Health check using MediaMTX API
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s \
  CMD wget -q -O /dev/null http://localhost:9997/v3/config/get || exit 1

# Use our startup script to run both nginx and MediaMTX
ENTRYPOINT ["/start.sh"]