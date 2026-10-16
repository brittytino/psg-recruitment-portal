# PDF generation failures

HR sees failures on the dashboard (“PDF processing failures”, filter PDF status = failed) and on the application page with the error text.

| Error                                                      | Cause                                        | Action                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `… flagged by the malware scanner …`                       | ClamAV found a signature                     | Return the application for clarification asking for a clean copy; never download the file                 |
| `awaiting malware scan` / `Malware scan failed` (retrying) | clamd down or updating                       | `docker compose logs clamav`; job retries automatically; after recovery use “Regenerate PDF”              |
| `Converter unreachable` / `busy`                           | converter container down/overloaded          | `docker compose ps converter`, restart it; retries are automatic                                          |
| `DOCX to PDF conversion failed`                            | LibreOffice error on this document           | Save the DOCX via `scripts/render-samples.ts`-style reproduction with the revision answers; file a defect |
| `could not be read as application/pdf`                     | Damaged attachment that passed upload checks | Request a new copy from the candidate                                                                     |
| `does not match its registered checksum`                   | Template file changed on disk                | Restore the template from Git; templates are immutable — add a new version instead                        |
| `Merged PDF has N pages; expected M`                       | Merge defect                                 | Regenerate; if repeatable, file a defect with the application id                                          |

Inspect jobs: `docker compose logs worker | grep -i "job failed"`. Regeneration creates a new version; earlier versions remain downloadable.
