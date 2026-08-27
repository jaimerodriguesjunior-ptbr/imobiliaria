import { Sidebar } from "@/components/Sidebar";
import { getCompanySettings } from "@/actions/imobiliaria-v2";
import { getCompanyLogoPublicUrl } from "@/lib/company-logo";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) { const settings = await getCompanySettings(); return <div className="shell"><Sidebar logoUrl={getCompanyLogoPublicUrl(settings?.logo_path)}/><main className="content">{children}</main></div>; }
