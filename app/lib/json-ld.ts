/** JSON for an inline <script type="application/ld+json">: "<" is escaped so text can never close the tag. */
export const jsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
