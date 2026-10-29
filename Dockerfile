# syntax=docker/dockerfile:1
FROM ubuntu:24.04

LABEL customer="rogue" \
      app="dcss-coop" \
      description="Dungeon Crawl Stone Soup (DCSS) Co-op WebTiles Server"

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# Install DCSS WebTiles build and runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    advancecomp \
    bison \
    build-essential \
    ca-certificates \
    flex \
    git \
    liblua5.4-dev \
    libncursesw5-dev \
    libpng-dev \
    libsdl2-dev \
    libsdl2-image-dev \
    libsqlite3-dev \
    pkg-config \
    pngcrush \
    python3 \
    python3-pip \
    python3-tornado \
    python3-venv \
    python3-yaml \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/dcss

# Copy repository source
COPY . /opt/dcss

WORKDIR /opt/dcss/crawl-ref/source

# Ensure build version string exists even when built outside a full git clone (e.g., Cloud Build tarball)
RUN if [ ! -d /opt/dcss/.git ] && [ ! -f util/release_ver ]; then \
        echo "0.32-coop" > util/release_ver; \
    fi \
    && make -j"$(nproc)" WEBTILES=y

# Create WebTiles runtime directories and log files, and bind 0.0.0.0 in --live-debug mode
RUN mkdir -p rcs saves webserver/run \
    && touch saves/logfile saves/milestones \
    && sed -i 's/"127\.0\.0\.1"/"0.0.0.0"/g' webserver/server.py

EXPOSE 8080

CMD ["sh", "-c", "python3 webserver/server.py --live-debug -p ${PORT:-8080}"]
