#!/usr/bin/env sh
# Rasterises rendered PDFs (tests/pdf-regression/output) via the converter container for review.
# Usage: scripts/inspect-pdfs.sh <container> <dest-dir> [dpi]
set -eu
C="${1:-srp-conv-test}"; DEST="${2:?destination directory}"; DPI="${3:-50}"
docker cp tests/pdf-regression/output/. "$C":/tmp/out
docker exec "$C" sh -c "rm -rf /tmp/png; mkdir -p /tmp/png && cd /tmp/out && for f in *.pdf; do pdftoppm -r $DPI -png \$f /tmp/png/\${f%.pdf}; echo \"\$f \$(pdfinfo \$f | grep Pages)\"; done"
rm -rf "$DEST" && docker cp "$C":/tmp/png "$DEST"
