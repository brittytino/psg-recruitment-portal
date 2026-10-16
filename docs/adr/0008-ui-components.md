# ADR 0008 — Accessible components on native elements

Status: Accepted

Instead of shadcn/ui (Radix dependencies), a small set of components (fields, error summary, alerts, badges, native `<dialog>` confirmations, tables) is built with Tailwind 4 on semantic HTML. Native dialogs give focus trapping/Escape/inert background without JavaScript libraries. The CSP forbids inline styles in production, so all styling is class-based.
