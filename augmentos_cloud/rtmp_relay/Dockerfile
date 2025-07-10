# Use MediaMTX with FFmpeg included
FROM bluenviron/mediamtx:latest-ffmpeg

# Install wget for the simple forwarder
RUN apk add --no-cache wget

# Copy our configuration and scripts
COPY mediamtx.yml /mediamtx.yml
COPY simple-forward.sh /simple-forward.sh

# Make script executable
RUN chmod +x /simple-forward.sh

# Expose RTMP and API ports
EXPOSE 1935 9997

# Health check using MediaMTX API
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s \
  CMD wget -q -O /dev/null http://localhost:9997/v3/config/get || exit 1

# Use MediaMTX default entrypoint
ENTRYPOINT ["/mediamtx"]