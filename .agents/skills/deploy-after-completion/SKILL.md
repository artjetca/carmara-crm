---
name: deploy-after-completion
description: Use when finishing any code change in the CASMARA repo and preparing the final response, to ensure the latest build is verified and deployed to Netlify production.
---

# Deploy After Completion

## Overview

CASMARA changes are not complete until they are live on Netlify production. Local verification alone is insufficient.

## When to Use

- After any code change in this repository
- Before sending the final completion message
- When a feature, bugfix, or UI adjustment is ready

## Required Steps

1. Run:
   - `npm run check`
   - `npm run build`
2. Deploy:
   - `npx netlify deploy --prod --dir=dist`
3. Return:
   - Production URL
   - Unique deploy URL
   - Deploy logs URL

## Project Target

- Site name: `casmara-charo`
- Production URL: `https://casmara-charo.netlify.app`

## Common Mistakes

- Do not stop after local tests
- Do not report success without the deploy URL
- Do not use preview deploys when the task is expected to be complete
