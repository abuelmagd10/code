#!/usr/bin/env bash
set -euo pipefail

OLLAMA_MODEL="${OLLAMA_MODEL:-llama3}"

echo "[1/6] Installing base packages..."
apt-get update
apt-get install -y curl ca-certificates nginx ufw

echo "[2/6] Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

echo "[3/6] Enabling Ollama service..."
systemctl enable ollama
systemctl restart ollama

echo "[4/6] Pulling model: ${OLLAMA_MODEL}"
ollama pull "${OLLAMA_MODEL}"

echo "[5/6] Verifying local Ollama API..."
curl --fail http://127.0.0.1:11434/api/tags >/tmp/ollama-tags.json
cat /tmp/ollama-tags.json

echo "[6/6] Installation complete."
echo "Next steps:"
echo "- Copy ops/ollama/nginx-ollama.conf into /etc/nginx/sites-available/"
echo "- Replace ai.example.com and CHANGE_ME_WITH_LONG_RANDOM_TOKEN"
echo "- Reload nginx"
echo "- Set Vercel env vars for AI_PROVIDER and OLLAMA_BASE_URL"
