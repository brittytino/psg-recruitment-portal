# ADR 0002 — Populate the official DOCX in place (no templating library)

Status: Accepted

**Context.** The official forms have no placeholders; fields are labels followed by colons, tab stops, blank table cells, block-letter boxes and blank lines. docxtemplater would require editing the templates to add tags, i.e. creating new documents.
**Decision.** A small OOXML populator (JSZip + @xmldom/xmldom) locates labels, tables and rows by their original text and inserts runs/cells, cloning existing rows for overflow. The original files stay byte-identical (checksums registered in `form_templates`). LibreOffice headless in a separate container converts to PDF; pdf-lib merges.
**Consequences.** Full fidelity to the source and complete traceability (every field must be bound — enforced by tests). Template changes require a new template version and binding code.
