#!/usr/bin/env bash
cd "$(dirname "$0")"
[ -d node_modules ] || { echo "Menginstal dependensi, mohon tunggu..."; npm install; }
(sleep 2; (xdg-open http://localhost:3000 || open http://localhost:3000) >/dev/null 2>&1) &
node --disable-warning=ExperimentalWarning server.js
