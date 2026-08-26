export const COMPANY_LOGOS_BUCKET = "imob-logos";

export function getCompanyLogoPublicUrl(logoPath?: string | null) {
  const normalizedPath = String(logoPath || "").trim().replace(/^\/+/, "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");

  if (!normalizedPath || !supabaseUrl) return null;

  return `${supabaseUrl}/storage/v1/object/public/${COMPANY_LOGOS_BUCKET}/${normalizedPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
