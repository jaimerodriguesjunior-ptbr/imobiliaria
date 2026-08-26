import { getCompanySettings } from "@/actions/imobiliaria";
import { getCompanyLogoPublicUrl } from "@/lib/company-logo";
import { SettingsForm } from "./SettingsForm";
export default async function SettingsPage() { const settings = await getCompanySettings(); return <><header className="top"><div><h1>Configurações</h1><p>Cadastre os dados da imobiliária usados no documento mensal.</p></div></header><SettingsForm initial={settings} logoUrl={getCompanyLogoPublicUrl(settings?.logo_path) || "/equipe-imobiliaria.png"}/></>; }
