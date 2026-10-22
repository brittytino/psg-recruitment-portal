/** Accessible one-time-code field: one input, numeric keypad, autofill from the e-mail/SMS sheet. */
export function OtpInput({ error }: { error?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="code" className="block text-sm font-semibold">
        6-digit code
      </label>
      <input
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        autoFocus
        aria-invalid={!!error}
        aria-describedby={error ? "code-error" : "code-hint"}
        className="field-input text-center text-2xl font-bold tracking-[0.5em]"
      />
      <p id="code-hint" className="text-xs text-muted">
        Enter the code from the e-mail we just sent. It can be used once.
      </p>
      {error && (
        <p id="code-error" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
