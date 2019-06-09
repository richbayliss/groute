#!/usr/bin/env sh

set -e

# generate a host key for the SSH service...
if [ ! -f /app/keys/host.key ]; then
    ssh-keygen -f /app/keys/host.key -N '' -t rsa
fi

node /app/dist/app.js
