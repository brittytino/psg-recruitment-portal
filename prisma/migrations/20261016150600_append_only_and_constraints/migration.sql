-- Append-only enforcement and integrity constraints that Prisma cannot express.
-- These apply to every database role, including the application role.

CREATE OR REPLACE FUNCTION srp_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only (% not permitted)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

-- Submitted revisions are immutable snapshots.
CREATE TRIGGER application_revisions_append_only
  BEFORE UPDATE OR DELETE ON application_revisions
  FOR EACH ROW EXECUTE FUNCTION srp_forbid_mutation();

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION srp_forbid_mutation();

CREATE TRIGGER application_status_history_append_only
  BEFORE UPDATE OR DELETE ON application_status_history
  FOR EACH ROW EXECUTE FUNCTION srp_forbid_mutation();

-- Reviews are records of a decision; corrections are new reviews.
CREATE TRIGGER reviews_append_only
  BEFORE UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION srp_forbid_mutation();

-- Normalised extracts of a revision are as immutable as the revision itself.
CREATE TRIGGER qualifications_append_only
  BEFORE UPDATE OR DELETE ON qualifications
  FOR EACH ROW EXECUTE FUNCTION srp_forbid_mutation();
CREATE TRIGGER employment_records_append_only
  BEFORE UPDATE OR DELETE ON employment_records
  FOR EACH ROW EXECUTE FUNCTION srp_forbid_mutation();

-- Uploaded documents are only ever soft-removed; their stored bytes are never re-pointed.
CREATE OR REPLACE FUNCTION srp_application_documents_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'application_documents rows cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."storageKey" <> OLD."storageKey" OR NEW."sha256" <> OLD."sha256" OR NEW."sizeBytes" <> OLD."sizeBytes"
     OR NEW."applicationId" <> OLD."applicationId" THEN
    RAISE EXCEPTION 'application_documents content is immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER application_documents_guard
  BEFORE UPDATE OR DELETE ON application_documents
  FOR EACH ROW EXECUTE FUNCTION srp_application_documents_guard();

-- A generated artefact that reached READY is write-once; regeneration creates a new version row.
CREATE OR REPLACE FUNCTION srp_generated_documents_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'generated_documents rows cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status = 'READY' THEN
    RAISE EXCEPTION 'generated document % is READY and immutable', OLD.id USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generated_documents_guard
  BEFORE UPDATE OR DELETE ON generated_documents
  FOR EACH ROW EXECUTE FUNCTION srp_generated_documents_guard();

-- Integrity constraints.
ALTER TABLE recruitment_cycles ADD CONSTRAINT recruitment_cycles_dates_chk CHECK ("closesAt" > "opensAt");
ALTER TABLE vacancies ADD CONSTRAINT vacancies_dates_chk CHECK ("closesAt" > "opensAt");
ALTER TABLE vacancies ADD CONSTRAINT vacancies_posts_chk CHECK ("numberOfPosts" IS NULL OR "numberOfPosts" > 0);
ALTER TABLE applications ADD CONSTRAINT applications_draft_version_chk CHECK ("draftVersion" >= 0);
ALTER TABLE applications ADD CONSTRAINT applications_submitted_chk CHECK (
  status = 'DRAFT' OR status = 'WITHDRAWN' OR ("referenceNo" IS NOT NULL AND "submittedAt" IS NOT NULL AND "currentRevisionId" IS NOT NULL)
);
ALTER TABLE application_documents ADD CONSTRAINT application_documents_size_chk CHECK ("sizeBytes" > 0);
ALTER TABLE reviews ADD CONSTRAINT reviews_score_chk CHECK (score IS NULL OR (score BETWEEN 0 AND 100));
ALTER TABLE users ADD CONSTRAINT users_email_lower_chk CHECK (email = lower(email));
