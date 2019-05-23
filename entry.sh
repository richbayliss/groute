#!/usr/bin/env sh

set -e

# generate a host key for the SSH service...
if [ ! -f /app/host.key ]; then
    ssh-keygen -f /app/host.key -N '' -t rsa
fi

node /app/dist/app.js
