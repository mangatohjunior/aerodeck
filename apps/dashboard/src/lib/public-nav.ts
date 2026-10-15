/** Register and Login must send legal copy to this route. */
export const POLICY_HREF = "/policy" as const;

export const PUBLIC_NAV = [
  { href: "/about", label: "About" },
  { href: POLICY_HREF, label: "Policy" },
] as const;

export const PUBLIC_AUTH_NAV = [
  { href: "/register", label: "Register" },
  { href: "/login", label: "Login" },
] as const;
