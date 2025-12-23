#!/bin/bash
# Force Vercel redeploy script

echo "🚀 إجبار إعادة النشر على Vercel..."

# Update timestamp to trigger new deployment
echo "FORCE_DEPLOY=true" > .vercel-force-deploy
echo "TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .vercel-force-deploy
echo "COMMIT=7cf98b14d5b47d44d75aa6194a823d582139bb97" >> .vercel-force-deploy

# Commit and push
git add .vercel-force-deploy
git commit -m "trigger: force Vercel redeploy $(date)"
git push origin main

echo "✅ تم رفع التغييرات - Vercel سيعيد النشر تلقائياً"
echo "🔗 تحقق من: https://vercel.com/dashboard"