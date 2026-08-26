import { getCompanySettings } from "@/actions/imobiliaria";
import { SettingsForm } from "./SettingsForm";
export default async function SettingsPage() { return <><header className="top"><div><h1>Configurações</h1><p>Cadastre os dados da imobiliária usados no documento mensal.</p></div></header><SettingsForm initial={await getCompanySettings()}/></>; }
