/**
 * Which position changes a HOD may recommend (shared by server and UI). Pending college
 * confirmation: by default a HOD may only recommend a lower cadre than the one applied for.
 * Admin (or HR, if allowed in Settings) must approve before the change takes effect, and the
 * candidate's submitted application is never modified.
 */
export type PositionName = "ASSISTANT_PROFESSOR" | "ASSOCIATE_PROFESSOR" | "PROFESSOR";

export const ALLOWED_POSITION_CHANGES: Record<PositionName, readonly PositionName[]> = {
  PROFESSOR: ["ASSOCIATE_PROFESSOR", "ASSISTANT_PROFESSOR"],
  ASSOCIATE_PROFESSOR: ["ASSISTANT_PROFESSOR"],
  ASSISTANT_PROFESSOR: [],
};

export function allowedChanges(from: string | null | undefined): readonly PositionName[] {
  return from && from in ALLOWED_POSITION_CHANGES ? ALLOWED_POSITION_CHANGES[from as PositionName] : [];
}

export function isAllowedChange(from: string, to: string): boolean {
  return allowedChanges(from).includes(to as PositionName);
}
