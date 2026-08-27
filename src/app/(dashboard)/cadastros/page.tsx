import { getOwners } from "@/actions/imobiliaria-v2";
import { OwnerManager } from "./OwnerForm";
export default async function OwnersPage() { const owners = await getOwners(); return <><header className="top"><div><h1>Clientes / proprietários</h1><p>Proprietários da imobiliária e seus imóveis vinculados.</p></div></header><OwnerManager initialOwners={owners as any[]}/></>; }
