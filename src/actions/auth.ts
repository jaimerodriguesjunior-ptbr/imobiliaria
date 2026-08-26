"use server";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
export async function login(_: unknown, formData: FormData) { const supabase = await createClient(); const { error } = await supabase.auth.signInWithPassword({ email: String(formData.get("email") || ""), password: String(formData.get("password") || "") }); if (error) return { error: "E-mail ou senha inválidos." }; redirect("/dashboard"); }
export async function logout() { const supabase = await createClient(); await supabase.auth.signOut(); redirect("/login"); }
