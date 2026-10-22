/** Роли и права (RBAC). Пользователь может иметь несколько ролей. Права — строки "ресурс:действие". */
export type Role =
  | "guest" | "buyer" | "seller" | "org_owner" | "org_staff" | "carrier" | "vet" | "slaughter_service"
  | "moderator" | "arbiter" | "finance" | "admin";

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  guest: ["listing:read", "price_index:read"],
  buyer: ["listing:read", "price_index:read", "favorite:*", "saved_search:*", "chat:*", "offer:create", "deal:buyer", "wanted:*", "report:create", "review:create"],
  seller: ["listing:read", "listing:create", "listing:own", "chat:*", "offer:respond", "deal:seller", "herd:*", "promo:buy", "review:reply"],
  org_owner: ["org:*", "listing:org", "deal:org", "finance:org"],
  org_staff: ["listing:org", "chat:*"],
  carrier: ["transport:bid", "transport:own", "chat:*"],
  vet: ["vet:requests", "vet:report", "document:verify"],
  slaughter_service: ["slaughter:requests", "chat:*"],
  moderator: ["dashboard:read", "moderation:*", "listing:read_any", "user:read", "document:verify", "report:resolve", "quarantine:read"],
  arbiter: ["dashboard:read", "dispute:*", "deal:read_any", "chat:read_any"],
  finance: ["dashboard:read", "finance:*", "payout:*", "deal:read_any", "refund:*"],
  admin: ["*"],
};

export function hasPermission(roles: Role[], perm: string): boolean {
  const [res, act] = perm.split(":");
  for (const r of roles) {
    for (const p of ROLE_PERMISSIONS[r] ?? []) {
      if (p === "*") return true;
      if (p === perm) return true;
      const [pr, pa] = p.split(":");
      if (pr === res && pa === "*") return true;
      if (pr === res && pa === act) return true;
    }
  }
  return false;
}

export const STAFF_ROLES: Role[] = ["moderator", "arbiter", "finance", "admin"];
export function isStaff(roles: Role[]) { return roles.some((r) => STAFF_ROLES.includes(r)); }
