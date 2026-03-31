# CASMARA Agent Instructions

## Deployment Rule

Every completed code change must be deployed to Netlify production before the task is considered done.

Required sequence for code changes:

1. Run verification:
   - `npm run check`
   - `npm run build`
2. Deploy to production:
   - `npx netlify deploy --prod --dir=dist`
3. Report back with:
   - Production URL
   - Unique deploy URL
   - Deploy log URL

## Project Notes

- Netlify site: `casmara-charo`
- Production URL: `https://casmara-charo.netlify.app`
- Keep map-related fixes production-safe; do not leave work only verified locally.
