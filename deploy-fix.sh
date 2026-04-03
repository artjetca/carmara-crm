#!/bin/bash
# ================================================================
# CASMARA CRM – Deploy Fix: Jobs de captación sin importar
# ================================================================
# Ejecuta este script desde la carpeta del proyecto:
#   chmod +x deploy-fix.sh && ./deploy-fix.sh
# ================================================================

set -e
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  CASMARA CRM — Deploy Fix Auto Captación               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Remove stale git lock if present
if [ -f .git/index.lock ]; then
  echo "⚠️  Removing stale git lock..."
  rm -f .git/index.lock && echo "  ✓ Lock removed" || echo "  ✗ Could not remove lock – close Windsurf and retry"
fi

echo "📂 Staging fixed files..."
git add \
  netlify/functions/prospect-scrape.js \
  netlify/functions/prospects.js \
  src/lib/supabase.ts \
  src/components/prospects/ProspectScrapeJobsModal.tsx \
  src/components/prospects/ProspectAutoCaptureModal.tsx \
  src/pages/ProspectMapPage.tsx \
  src/services/ \
  supabase/migrations/ \
  2>&1

echo ""
echo "📋 Files staged:"
git status --short

echo ""
echo "💬 Committing..."
git commit -m "fix: Jobs de captación completando sin importar prospectos

ROOT CAUSE: El filtro 'rating < 4.2' en prospect-scrape.js descartaba
silenciosamente TODOS los resultados de Google Places cuando los
negocios no tenían puntuación o ésta era inferior a 4.2. Esto hacía
que los jobs terminasen con 0 captados/importados aunque Google
devolviera resultados.

CAMBIOS:
- prospect-scrape.js: eliminado filtro rating < 4.2 (causa raíz)
- prospect-scrape.js: añadido address_components a Places Details API
- prospect-scrape.js: logging paso a paso [1/8]...[8/8]
- prospect-scrape.js: nuevos estados completed_empty / partial / failed
- prospect-scrape.js: constraint DB actualizado para nuevos estados
- supabase.ts: tipo ScrapeJob.status actualizado
- ProspectScrapeJobsModal.tsx: UI muestra Sin resultados / Parcial
- ProspectMapPage.tsx: mensaje post-captura más informativo

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>" 2>&1

echo ""
echo "🚀 Pushing to GitHub (triggers Netlify deploy)..."
git push origin main 2>&1

echo ""
echo "✅ ¡Listo! Deploy iniciado en Netlify."
echo "   Espera 2-3 minutos y recarga casmara-charo.netlify.app"
echo ""
echo "Para verificar el fix:"
echo "  1. Ir a Prospectos → Auto captar"
echo "  2. Seleccionar Cádiz o Huelva + keyword (ej: 'estetica')"
echo "  3. Iniciar captación"
echo "  4. Jobs modal debe mostrar Captados > 0 e Importados > 0"
echo "  5. Lista y mapa deben actualizarse automáticamente"
echo ""
