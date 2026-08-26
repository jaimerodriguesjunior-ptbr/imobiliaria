import { getOwnerProperties } from "@/actions/imobiliaria";
import { PropertyManager } from "./PropertyManager";
export default async function OwnerPropertiesPage({ params }: { params: Promise<{ ownerId: string }> }) { const { ownerId } = await params; const data = await getOwnerProperties(ownerId); return <><header className="top"><div><h1>Imóveis de {data.owner.name}</h1><p>Altere endereço, locatário, aluguel e comissão.</p></div></header><PropertyManager owner={data.owner} properties={data.properties} renters={data.renters}/></>; }
