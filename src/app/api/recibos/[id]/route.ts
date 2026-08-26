import { createClient } from "@/utils/supabase/server";
import JSZip from "jszip";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Não autenticado", { status: 401 });
  const { data: membership } = await supabase.from("imob_memberships").select("organization_id").eq("user_id", user.id).eq("active", true).limit(1).maybeSingle();
  const organizationId = membership?.organization_id || "";
  if (new URL(request.url).searchParams.get("zip") === "1") {
    const { data: receipts, error } = await supabase.from("imob_receipts").select("filename, document_html, imob_monthly_leases!inner(import_id)").eq("organization_id", organizationId).eq("imob_monthly_leases.import_id", id).order("filename");
    if (error) return new NextResponse(error.message, { status: 500 });
    if (!receipts?.length) return new NextResponse("Nenhum recibo encontrado", { status: 404 });
    const zip = new JSZip();
    for (const receipt of receipts) zip.file(receipt.filename, receipt.document_html);
    const content = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new NextResponse(content as unknown as BodyInit, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="recibos-${id}.zip"` } });
  }
  const { data: receipt } = await supabase.from("imob_receipts").select("filename, document_html").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!receipt) return new NextResponse("Documento não encontrado", { status: 404 });
  return new NextResponse(receipt.document_html, { headers: { "Content-Type": "application/msword; charset=utf-8", "Content-Disposition": `attachment; filename="${encodeURIComponent(receipt.filename)}"` } });
}
