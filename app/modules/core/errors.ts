/** Domain errors carry a safe, user-facing message and an HTTP status. Internal details are never exposed. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    // Shaped like React Router's data(): a DomainError thrown from a loader renders the error page
    // with its real status (404, 403, 409 …) and safe message, instead of a logged 500.
    Object.defineProperties(this, {
      type: { value: "DataWithResponseInit", enumerable: false },
      data: { value: message, enumerable: false },
      init: { value: { status }, enumerable: false },
    });
  }
}

export class NotFoundError extends DomainError {
  constructor(what = "Resource") {
    super(`${what} not found`, 404, "NOT_FOUND");
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403, "FORBIDDEN");
  }
}

export class UnauthenticatedError extends DomainError {
  constructor() {
    super("Please sign in to continue", 401, "UNAUTHENTICATED");
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "VALIDATION", details);
  }
}

export class RateLimitedError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many attempts. Please wait and try again.", 429, "RATE_LIMITED");
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
