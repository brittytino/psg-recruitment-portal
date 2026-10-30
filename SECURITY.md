# Security policy

This system handles personal data of job applicants and runs in production.

## Reporting a vulnerability

Please report security problems **privately** — not in a public issue or pull request:

- use GitHub's **Security → Report a vulnerability** (private advisory) on this repository, or
- contact the maintainer through their GitHub profile ([@brittytino](https://github.com/brittytino)).

Include what you found, how to reproduce it, and the impact. Please do not access, change or download
other people's data while testing, and give us reasonable time to fix the problem before disclosing it.

## Scope

In scope: this repository's code and its default configuration. Out of scope: denial-of-service,
social engineering, and findings that require access to the server itself.

## How secrets are handled

- No secrets or real e-mail addresses are committed. Production values are generated on the server
  (`.env`) or kept in `secrets/override.env`; both are git-ignored.
- Sign-in is by one-time e-mailed codes; no passwords are stored for staff.
- Uploaded files are checked by content, virus-scanned and stored privately; downloads are authorised
  on every request.
