// ProLyt's own domain, set once in NEXT_PUBLIC_ROOT_DOMAIN (e.g. prolyt.app).
// Everything that shows or checks the domain reads it from here.
export const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "prolyt.app").toLowerCase();
export const programAddress = (slug: string) => `${slug}.${ROOT_DOMAIN}`;
