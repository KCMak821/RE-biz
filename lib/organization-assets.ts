type AssetOwner = { hasLogo: boolean; hasSealImage: boolean; id: string; sealUpdatedAt?: string };

/**
 * Both images come from authenticated API routes. The organization id (and the
 * seal's timestamp) are appended so a browser never reuses an earlier failed or
 * replaced response.
 */
export function organizationLogoUrl(organization: AssetOwner) {
  return organization.hasLogo ? `/api/organization/logo?v=${encodeURIComponent(organization.id)}` : undefined;
}

export function organizationSealUrl(organization: AssetOwner) {
  return organization.hasSealImage
    ? `/api/organization/seal?v=${encodeURIComponent(organization.sealUpdatedAt ?? organization.id)}`
    : undefined;
}
