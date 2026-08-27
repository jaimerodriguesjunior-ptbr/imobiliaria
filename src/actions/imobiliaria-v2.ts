"use server";

import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { competenceToDate, parseBrazilianMoney, parseLeaseCsv, parseLeaseTable } from "@/lib/domain";
import * as XLSX from "xlsx";
import { renderReceiptDocument } from "@/lib/receipt-template";
import { createClient } from "@/utils/supabase/server";

type Role = "admin" | "manager" | "employee";
type Context = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string;
  storeId: string;
  role: Role;
};

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function canManage(role: Role) {
  return role === "admin" || role === "manager";
}

async function getContext(): Promise<Context> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await supabase
    .from("imob_memberships")
    .select("tenant_id,store_id,role")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at")
    .order("id")
    .limit(1)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (!membership.data?.store_id) {
    throw new Error("Seu usuário não está vinculado a uma imobiliária e filial ativas.");
  }
  return {
    supabase,
    tenantId: membership.data.tenant_id,
    storeId: membership.data.store_id,
    role: membership.data.role,
  };
}

export async function getDashboardData() {
  const { supabase, tenantId, storeId } = await getContext();
  const [owners, properties, latest] = await Promise.all([
    supabase.from("imob_owners").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("store_id", storeId),
    supabase.from("imob_properties").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("store_id", storeId),
    supabase.from("imob_imports").select("competence,status,created_at").eq("tenant_id", tenantId).eq("store_id", storeId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (owners.error) throw owners.error;
  if (properties.error) throw properties.error;
  if (latest.error) throw latest.error;
  return { ownerCount: owners.count || 0, propertyCount: properties.count || 0, lastImport: latest.data };
}

export async function getCompanySettings() {
  const { supabase, tenantId } = await getContext();
  const result = await supabase.from("imob_company_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

export async function saveCompanySettings(formData: FormData) {
  const { supabase, tenantId, role } = await getContext();
  if (!(["admin", "manager"] as Role[]).includes(role)) {
    return { error: "Somente administradores e gerentes podem alterar a configuração." };
  }
  const fields = ["razao_social", "nome_fantasia", "cnpj", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "cep", "creci", "signatory_name", "signatory_title", "document_label"];
  const payload = Object.fromEntries(fields.map((field) => [field, String(formData.get(field) || "").trim()])) as Record<string, string>;
  const logo = formData.get("logo");
  let oldLogo: string | null = null;

  if (logo instanceof File && logo.size > 0) {
    const types = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);
    const extension = types.get(logo.type);
    if (!extension) return { error: "Envie uma logo em PNG, JPG ou WebP." };
    if (logo.size > 5 * 1024 * 1024) return { error: "A logo deve ter no máximo 5 MB." };
    const current = await supabase.from("imob_company_settings").select("logo_path").eq("tenant_id", tenantId).maybeSingle();
    if (current.error) return { error: current.error.message };
    oldLogo = current.data?.logo_path || null;
    const path = `${tenantId}/logo-${randomUUID()}.${extension}`;
    const upload = await supabase.storage.from("imob-logos").upload(path, logo, { contentType: logo.type });
    if (upload.error) return { error: upload.error.message };
    payload.logo_path = path;
  }

  const saved = await supabase.from("imob_company_settings").upsert({ tenant_id: tenantId, ...payload, updated_at: new Date().toISOString() });
  if (saved.error) return { error: saved.error.message };
  if (oldLogo && payload.logo_path && oldLogo !== payload.logo_path) {
    const removed = await supabase.storage.from("imob-logos").remove([oldLogo]);
    if (removed.error) return { error: `Dados salvos, mas a logo anterior não foi removida: ${removed.error.message}` };
  }
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function getOwners() {
  const { supabase, tenantId, storeId } = await getContext();
  const result = await supabase.from("imob_owners").select("*, imob_properties(id,street,number,complement,active)").eq("tenant_id", tenantId).eq("store_id", storeId).order("name");
  if (result.error) throw result.error;
  return result.data || [];
}

export async function getOwnerProperties(ownerId: string) {
  const { supabase, tenantId, storeId } = await getContext();
  const [owner, properties, renters, monthly] = await Promise.all([
    supabase.from("imob_owners").select("id,name,document").eq("id", ownerId).eq("tenant_id", tenantId).eq("store_id", storeId).single(),
    supabase.from("imob_properties").select("*, imob_leases(id,contract_number,renter_id,active)").eq("owner_id", ownerId).eq("tenant_id", tenantId).eq("store_id", storeId).order("street"),
    supabase.from("imob_renters").select("id,name,document").eq("tenant_id", tenantId).eq("store_id", storeId).order("name"),
    supabase.from("imob_monthly_leases").select("id,property_id,import_id,rent_amount,commission_amount,commission_rate,renter_id,contract_number,status,street,number,complement,created_at").eq("owner_id", ownerId).eq("tenant_id", tenantId).eq("store_id", storeId).order("created_at", { ascending: false }),
  ]);
  if (owner.error) throw owner.error;
  if (properties.error) throw properties.error;
  if (renters.error) throw renters.error;
  if (monthly.error) throw monthly.error;
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of monthly.data || []) if (row.property_id && !latest.has(row.property_id)) latest.set(row.property_id, row);
  return { owner: owner.data, properties: (properties.data || []).map((property) => ({ ...property, monthly: latest.get(property.id) || null })), renters: renters.data || [] };
}

export async function saveOwner(formData: FormData) {
  try {
    const { supabase, tenantId, storeId, role } = await getContext();
    if (!canManage(role)) return { error: "Somente administradores e gerentes podem alterar cadastros." };
    const id = String(formData.get("id") || "");
    const payload = {
      tenant_id: tenantId,
      store_id: storeId,
      name: String(formData.get("name") || "").trim(),
      document: String(formData.get("document") || "").trim() || null,
      email: String(formData.get("email") || "").trim() || null,
      phone: String(formData.get("phone") || "").trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (!payload.name) return { error: "Informe o nome do proprietário." };
    const result = id
      ? await supabase.from("imob_owners").update(payload).eq("id", id).eq("tenant_id", tenantId).eq("store_id", storeId).select("id,document").maybeSingle()
      : await supabase.from("imob_owners").insert(payload).select("id,document").single();
    if (result.error) return { error: result.error.message };
    if (!result.data) return { error: "A alteração não afetou nenhum proprietário desta filial." };
    if (result.data.document !== payload.document) return { error: "O CPF/CNPJ não foi persistido." };
    revalidatePath("/cadastros");
    return { success: true, owner: { id: result.data.id, ...payload } };
  } catch (error) {
    return { error: message(error, "Não foi possível salvar o proprietário.") };
  }
}

export async function savePropertyLease(formData: FormData) {
  try {
    const { supabase, tenantId, storeId, role } = await getContext();
    if (!canManage(role)) return { error: "Somente administradores e gerentes podem alterar cadastros." };
    const ownerId = String(formData.get("owner_id") || "");
    const propertyId = String(formData.get("property_id") || "");
    const monthlyId = String(formData.get("monthly_id") || "");
    const renterId = String(formData.get("renter_id") || "");
    const renterName = String(formData.get("renter_name") || "").trim();
    const renterDocument = String(formData.get("renter_document") || "").trim() || null;
    if (!ownerId || !propertyId) return { error: "Imóvel inválido." };

    let finalRenterId: string | null = renterId || null;
    if (renterName && !renterId) {
      const renter = await supabase.from("imob_renters").upsert({ tenant_id: tenantId, store_id: storeId, name: renterName, document: renterDocument, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,store_id,name" }).select("id").single();
      if (renter.error) return { error: renter.error.message };
      finalRenterId = renter.data.id;
    } else if (renterId) {
      const renter = await supabase.from("imob_renters").update({ name: renterName, document: renterDocument, updated_at: new Date().toISOString() }).eq("id", renterId).eq("tenant_id", tenantId).eq("store_id", storeId).select("id").maybeSingle();
      if (renter.error) return { error: renter.error.message };
      if (!renter.data) return { error: "O inquilino não pertence a esta filial." };
    }

    const propertyPayload = {
      street: String(formData.get("street") || "").trim(),
      number: String(formData.get("number") || "").trim(),
      complement: String(formData.get("complement") || "").trim(),
      city: String(formData.get("city") || "").trim() || null,
      state: String(formData.get("state") || "").trim().toUpperCase() || null,
      updated_at: new Date().toISOString(),
    };
    if (!propertyPayload.street || !propertyPayload.number) return { error: "Informe o endereço do imóvel." };
    const property = await supabase.from("imob_properties").update(propertyPayload).eq("id", propertyId).eq("owner_id", ownerId).eq("tenant_id", tenantId).eq("store_id", storeId).select("id").maybeSingle();
    if (property.error) return { error: property.error.message };
    if (!property.data) return { error: "O imóvel não pertence a esta filial." };

    const leasePayload = { renter_id: finalRenterId, contract_number: String(formData.get("contract_number") || "").trim() || null, updated_at: new Date().toISOString() };
    const currentLease = await supabase.from("imob_leases").select("id").eq("property_id", propertyId).eq("tenant_id", tenantId).eq("store_id", storeId).eq("active", true).maybeSingle();
    if (currentLease.error) return { error: currentLease.error.message };
    const lease = currentLease.data
      ? await supabase.from("imob_leases").update(leasePayload).eq("id", currentLease.data.id).eq("tenant_id", tenantId).eq("store_id", storeId)
      : await supabase.from("imob_leases").insert({ tenant_id: tenantId, store_id: storeId, property_id: propertyId, ...leasePayload });
    if (lease.error) return { error: lease.error.message };

    if (monthlyId) {
      const ready = Boolean(renterName && renterDocument && propertyPayload.city && propertyPayload.state);
      const existingMonthly = await supabase.from("imob_monthly_leases").select("id,selected_for_receipt").eq("id", monthlyId).eq("owner_id", ownerId).eq("tenant_id", tenantId).eq("store_id", storeId).maybeSingle();
      if (existingMonthly.error) return { error: existingMonthly.error.message };
      if (!existingMonthly.data) return { error: "O registro mensal nÃ£o pertence a esta filial." };
      const monthly = await supabase.from("imob_monthly_leases").update({ renter_id: finalRenterId, contract_number: leasePayload.contract_number, street: propertyPayload.street, number: propertyPayload.number, complement: propertyPayload.complement, rent_amount: parseBrazilianMoney(String(formData.get("rent_amount") || "")), commission_amount: parseBrazilianMoney(String(formData.get("commission_amount") || "")), status: ready ? "active" : "pending_data", selected_for_receipt: ready && existingMonthly.data.selected_for_receipt }).eq("id", monthlyId).eq("owner_id", ownerId).eq("tenant_id", tenantId).eq("store_id", storeId).select("id").maybeSingle();
      if (monthly.error) return { error: monthly.error.message };
      if (!monthly.data) return { error: "O registro mensal não pertence a esta filial." };
    }
    revalidatePath(`/cadastros/${ownerId}`);
    revalidatePath("/recibos");
    return { success: true };
  } catch (error) {
    return { error: message(error, "Não foi possível salvar o imóvel.") };
  }
}

export async function saveLeaseDetails(formData: FormData) {
  try {
    const { supabase, tenantId, storeId, role } = await getContext();
    if (!canManage(role)) return { error: "Somente administradores e gerentes podem alterar cadastros." };
    const ownerId = String(formData.get("owner_id") || "");
    const renterId = String(formData.get("renter_id") || "");
    const propertyId = String(formData.get("property_id") || "");
    const importId = String(formData.get("import_id") || "");
    const ownerDocument = String(formData.get("owner_document") || "").trim() || null;
    const renterDocument = String(formData.get("renter_document") || "").trim() || null;
    const city = String(formData.get("city") || "").trim() || null;
    const state = String(formData.get("state") || "").trim().toUpperCase() || null;

    if (ownerId) {
      const result = await supabase.from("imob_owners").update({ document: ownerDocument, updated_at: new Date().toISOString() }).eq("id", ownerId).eq("tenant_id", tenantId).eq("store_id", storeId).select("id").maybeSingle();
      if (result.error) return { error: result.error.message };
      if (!result.data) return { error: "Proprietário não encontrado nesta filial." };
    }
    if (renterId) {
      const result = await supabase.from("imob_renters").update({ document: renterDocument, updated_at: new Date().toISOString() }).eq("id", renterId).eq("tenant_id", tenantId).eq("store_id", storeId).select("id").maybeSingle();
      if (result.error) return { error: result.error.message };
      if (!result.data) return { error: "Inquilino não encontrado nesta filial." };
    }
    if (propertyId) {
      const result = await supabase.from("imob_properties").update({ city, state, updated_at: new Date().toISOString() }).eq("id", propertyId).eq("tenant_id", tenantId).eq("store_id", storeId).select("id").maybeSingle();
      if (result.error) return { error: result.error.message };
      if (!result.data) return { error: "Imóvel não encontrado nesta filial." };
    }
    if (importId && propertyId) {
      const row = await supabase.from("imob_monthly_leases").select("id,selected_for_receipt").eq("import_id", importId).eq("property_id", propertyId).eq("tenant_id", tenantId).eq("store_id", storeId).maybeSingle();
      if (row.error) return { error: row.error.message };
      if (row.data) {
        const ready = Boolean(ownerDocument && renterDocument && city && state);
        const result = await supabase.from("imob_monthly_leases").update({ status: ready ? "active" : "pending_data", selected_for_receipt: ready && row.data.selected_for_receipt }).eq("id", row.data.id).eq("tenant_id", tenantId).eq("store_id", storeId);
        if (result.error) return { error: result.error.message };
      }
      revalidatePath(`/recibos?importId=${importId}`);
    }
    revalidatePath("/cadastros");
    return { success: true };
  } catch (error) {
    return { error: message(error, "Não foi possível salvar os dados da locação.") };
  }
}

export async function processCsvImport(formData: FormData) {
  try {
    const { supabase, role } = await getContext();
    if (!canManage(role)) return { error: "Somente administradores e gerentes podem importar relatórios." };
    const file = formData.get("file");
    const competence = String(formData.get("competence") || "");
    if (!(file instanceof File) || !file.size) return { error: "Selecione um arquivo CSV ou Excel para importar." };
    if (!/^\d{4}-\d{2}$/.test(competence)) return { error: "Informe uma competência válida." };

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = file.name.toLowerCase().split(".").pop();
    let rows;
    if (extension === "xls" || extension === "xlsx") {
      const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
      let parsingError: unknown;
      for (const sheetName of workbook.SheetNames) {
        try {
          const table = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
          rows = parseLeaseTable(table);
          break;
        } catch (error) {
          parsingError = error;
        }
      }
      if (!rows) throw parsingError || new Error("Não localizamos uma aba com o relatório de locações.");
    } else if (extension === "csv") {
      let content: string;
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        content = new TextDecoder("windows-1252").decode(bytes);
      }
      rows = parseLeaseCsv(content);
    } else {
      return { error: "Selecione um arquivo CSV, XLS ou XLSX." };
    }
    if (!rows.length) return { error: "O relatório não possui locações válidas." };

    const result = await supabase.rpc("imob_replace_csv_import", {
      p_competence: competenceToDate(competence),
      p_source_filename: file.name,
      p_source_hash: createHash("sha256").update(bytes).digest("hex"),
      p_rows: rows,
    });
    if (result.error) return { error: result.error.message };
    revalidatePath("/dashboard");
    revalidatePath("/recibos");
    return { success: true, importId: String(result.data) };
  } catch (error) {
    return { error: message(error, "Não foi possível importar o CSV.") };
  }
}

export async function getImportForReview(importId: string) {
  const { supabase, tenantId, storeId } = await getContext();
  const imported = await supabase.from("imob_imports").select("*").eq("id", importId).eq("tenant_id", tenantId).eq("store_id", storeId).single();
  if (imported.error) throw imported.error;
  const rows = await supabase.from("imob_monthly_leases").select("*, imob_owners(name,document), imob_renters(name,document), imob_properties(city,state)").eq("import_id", importId).eq("tenant_id", tenantId).eq("store_id", storeId).order("street");
  if (rows.error) throw rows.error;
  return { imported: imported.data, rows: rows.data || [] };
}

export async function saveReceiptSelection(importId: string, selectedIds: string[]) {
  const { supabase, role } = await getContext();
  if (!canManage(role)) return { error: "Somente administradores e gerentes podem selecionar documentos." };
  const result = await supabase.rpc("imob_set_receipt_selection", { p_import_id: importId, p_selected_ids: selectedIds });
  if (result.error) return { error: result.error.message };
  return { success: true };
}

export async function confirmImportAndGenerate(importId: string) {
  const { supabase, tenantId, storeId, role } = await getContext();
  if (!canManage(role)) return { error: "Somente administradores e gerentes podem gerar documentos." };
  const [imported, company, rows] = await Promise.all([
    supabase.from("imob_imports").select("*").eq("id", importId).eq("tenant_id", tenantId).eq("store_id", storeId).single(),
    supabase.from("imob_company_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("imob_monthly_leases").select("*, imob_owners(name,document), imob_renters(name,document), imob_properties(city,state)").eq("import_id", importId).eq("tenant_id", tenantId).eq("store_id", storeId).eq("selected_for_receipt", true),
  ]);
  if (imported.error) return { error: imported.error.message };
  if (company.error) return { error: company.error.message };
  if (rows.error) return { error: rows.error.message };
  if (!company.data) return { error: "Preencha a configuração da imobiliária antes de gerar os documentos." };

  const selected = (rows.data || []).filter((row) => ["active", "changed"].includes(row.status));
  if (!selected.length) return { error: "Nenhum imóvel válido foi selecionado." };
  const receipts = selected.map((row) => {
    const owner = String(row.imob_owners?.name || "proprietario").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const street = String(row.street).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    return {
      monthly_lease_id: row.id,
      filename: `${owner}-${street}-${String(row.id).slice(0, 8)}.doc`,
      document_html: renderReceiptDocument({
        competence: String(imported.data.competence).slice(0, 7),
        company: company.data,
        owner: row.imob_owners || {},
        renter: row.imob_renters,
        lease: { ...row, city: row.imob_properties?.city, state: row.imob_properties?.state },
      }),
    };
  });
  const saved = await supabase.rpc("imob_save_receipts", { p_import_id: importId, p_receipts: receipts });
  if (saved.error) return { error: saved.error.message };
  revalidatePath(`/recibos?importId=${importId}`);
  revalidatePath("/recibos");
  return { success: true, count: Number(saved.data || 0) };
}

export async function confirmImportAndGenerateSafe(importId: string) {
  const { supabase, tenantId, storeId } = await getContext();
  const rows = await supabase.from("imob_monthly_leases").select("status").eq("import_id", importId).eq("tenant_id", tenantId).eq("store_id", storeId).eq("selected_for_receipt", true);
  if (rows.error) return { error: rows.error.message };
  if (!rows.data?.length) return { error: "Nenhum imóvel foi selecionado para gerar recibo." };
  const pending = rows.data.filter((row) => row.status === "pending_data");
  if (pending.length) return { error: `${pending.length} imóvel(is) selecionado(s) ainda possui(em) dados pendentes. Corrija CPF/CNPJ e município antes de gerar.` };
  return confirmImportAndGenerate(importId);
}

export async function reopenImport(importId: string) {
  const { supabase, tenantId, storeId, role } = await getContext();
  if (!canManage(role)) return { error: "Somente administradores e gerentes podem reabrir importaÃ§Ãµes." };
  const imported = await supabase.from("imob_imports").select("competence").eq("id", importId).eq("tenant_id", tenantId).eq("store_id", storeId).maybeSingle();
  if (imported.error) return { error: imported.error.message };
  if (!imported.data) return { error: "ImportaÃ§Ã£o nÃ£o encontrada nesta filial." };
  const conflict = await supabase.from("imob_imports").select("id").eq("tenant_id", tenantId).eq("store_id", storeId).eq("competence", imported.data.competence).in("status", ["review", "confirmed"]).neq("id", importId).limit(1).maybeSingle();
  if (conflict.error) return { error: conflict.error.message };
  if (conflict.data) return { error: "JÃ¡ existe uma importaÃ§Ã£o ativa para esta competÃªncia. Abra-a para corrigir os dados." };
  const result = await supabase.from("imob_imports").update({ status: "review", confirmed_at: null }).eq("id", importId).eq("tenant_id", tenantId).eq("store_id", storeId).select("id").maybeSingle();
  if (result.error) return { error: result.error.message };
  if (!result.data) return { error: "Importação não encontrada nesta filial." };
  revalidatePath(`/recibos?importId=${importId}`);
  return { success: true };
}

export async function getReceipts(importId: string) {
  const { supabase, tenantId, storeId } = await getContext();
  const result = await supabase.from("imob_receipts").select("id,filename,generated_at,imob_monthly_leases!inner(import_id,imob_owners(name),street,number)").eq("tenant_id", tenantId).eq("store_id", storeId).eq("imob_monthly_leases.import_id", importId).order("generated_at");
  if (result.error) throw result.error;
  return result.data || [];
}

export async function getImports() {
  const { supabase, tenantId, storeId } = await getContext();
  const importsResult = await supabase.from("imob_imports").select("id,competence,status,source_filename,created_at,confirmed_at,imob_monthly_leases(id,status,selected_for_receipt)").eq("tenant_id", tenantId).eq("store_id", storeId).order("competence", { ascending: false }).order("created_at", { ascending: false });
  if (importsResult.error) throw importsResult.error;
  const receiptsResult = await supabase.from("imob_receipts").select("id,monthly_lease_id").eq("tenant_id", tenantId).eq("store_id", storeId);
  if (receiptsResult.error) throw receiptsResult.error;
  const imports = importsResult.data || [];
  const importByLease = new Map<string, string>();
  const receiptsByImport = new Map<string, { id: string }[]>();
  for (const imported of imports) for (const lease of imported.imob_monthly_leases || []) importByLease.set(lease.id, imported.id);
  for (const receipt of receiptsResult.data || []) {
    const importId = importByLease.get(receipt.monthly_lease_id);
    if (importId) receiptsByImport.set(importId, [...(receiptsByImport.get(importId) || []), { id: receipt.id }]);
  }
  return imports.map((imported) => ({ ...imported, imob_receipts: receiptsByImport.get(imported.id) || [] }));
}
