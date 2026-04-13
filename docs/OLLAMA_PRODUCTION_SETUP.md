# Ollama Production Setup For ERP Copilot

This runbook prepares a dedicated production AI server for the ERP Copilot.

## Goal

Run Ollama on a dedicated Ubuntu server and connect the ERP application to it through a secured endpoint.

## Current Active Production Endpoint

As of April 12, 2026, the active ERP Copilot Ollama endpoint is:

- Endpoint: `https://193.123.83.173.sslip.io`
- Auth header: `X-ERP-AI-Key`
- Model: `llama3`
- Public raw Ollama port `11434`: closed from the public internet
- Public access path: `HTTPS -> Nginx -> local Ollama`

The deployed OCI server currently runs:

- Oracle Linux 9.7
- Shape `VM.Standard.E3.Flex`
- `4 OCPU / 24 GB RAM`
- Let's Encrypt TLS with automatic renewal enabled

## Recommended Server

- Ubuntu 22.04 LTS or newer
- 8+ CPU cores
- 16 GB RAM minimum
- SSD storage with enough room for models
- Optional GPU for better latency

## Architecture

1. Ollama runs on the AI server.
2. Nginx terminates inbound traffic and proxies only approved requests to Ollama.
3. The ERP app calls the secured Ollama endpoint through environment variables.
4. If Ollama is unavailable, the ERP falls back automatically to the internal read-only guide response.

## Files Added In This Repo

- `ops/ollama/install-production-ubuntu.sh`
- `ops/ollama/nginx-ollama.conf`
- `app/api/ai/provider-status/route.ts`

## 1. Install Ollama On Ubuntu

From the AI server:

```bash
cd /opt
git clone <your-repo-url> erb-vitaslims
cd erb-vitaslims
chmod +x ops/ollama/install-production-ubuntu.sh
sudo ./ops/ollama/install-production-ubuntu.sh
```

This script:

- installs required packages
- installs Ollama
- enables and restarts the `ollama` service
- pulls the configured model
- verifies the local Ollama API

## 2. Verify Ollama Locally On The Server

Run this on the AI server itself:

```bash
curl http://127.0.0.1:11434/api/tags
```

Expected result:

- HTTP 200
- visible list of installed models

## 3. Secure Ollama Behind Nginx

Recommended approach:

- do not expose raw Ollama directly to the public internet
- use a DNS name such as `ai.example.com`
- protect requests with an internal header token

Copy the Nginx config:

```bash
sudo cp ops/ollama/nginx-ollama.conf /etc/nginx/sites-available/erp-ollama.conf
sudo ln -sf /etc/nginx/sites-available/erp-ollama.conf /etc/nginx/sites-enabled/erp-ollama.conf
sudo nginx -t
sudo systemctl reload nginx
```

Before reload, replace these placeholders inside the file:

- `ai.example.com`
- `CHANGE_ME_WITH_LONG_RANDOM_TOKEN`

If you prefer IP access for first-stage testing, restrict source IPs at the firewall or cloud security group level.

## 4. Firewall And Network

Recommended:

- allow `22` from admin IPs
- allow `80/443` as required for Nginx
- keep `11434` private to localhost when using Nginx

Example with UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 5. Vercel Environment Variables

Set these in Vercel Production:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=https://193.123.83.173.sslip.io
OLLAMA_MODEL=llama3
OLLAMA_API_KEY=<store the real header token in Vercel secrets>
OLLAMA_AUTH_HEADER=X-ERP-AI-Key
AI_PROVIDER_TIMEOUT_MS=120000
OLLAMA_KEEP_ALIVE=30m
OLLAMA_MAX_TOKENS=220
OLLAMA_CONTEXT_TOKENS=4096
```

If you intentionally expose Ollama only through an internal IP and firewall restrictions, `OLLAMA_BASE_URL` can point to the internal address instead.

## 6. Verify From ERP

After deploy, test the provider status route as an admin user:

```text
GET /api/ai/provider-status
```

Expected:

- `provider = ollama`
- `healthy = true`
- `details.modelPresent = true`

Then test the ERP Copilot from any guided page.

## 7. Monitoring

Server-side monitoring:

```bash
systemctl status ollama
journalctl -u ollama -f
systemctl status nginx
journalctl -u nginx -f
```

Application-side monitoring:

- `ai_tool_audit` logs model calls and fallback reasons
- `/api/ai/provider-status` gives admin-only provider health visibility
- fallback activates automatically if Ollama fails or times out

## 8. Fallback Behavior

If Ollama stops or becomes unreachable:

- ERP Copilot returns to the internal read-only fallback
- the reason is surfaced as `fallbackReason`
- the event is still auditable through `ai_tool_audit`

## 9. Current Limitation

This repository is now production-ready for Ollama integration, but the actual Ubuntu server installation and network/security steps require direct server access.
