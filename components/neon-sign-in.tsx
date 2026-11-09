"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";


export default function NeonSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/login/phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: data.get("phone"), password: data.get("password") }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Tidak dapat masuk. Silakan coba lagi."); return; }
      window.location.assign("/workspace");
    } catch { setError("Tidak dapat menghubungi layanan masuk. Silakan coba lagi."); }
    finally { setPending(false); }
  }
  return <main className="neon-workspace"><Link href="/" className="text-button">← Kembali ke pratinjau</Link><section className="panel neon-auth-card"><span className="eyebrow">PROOMAHAN</span><h1>Masuk ke Proomahan</h1><p>Masuk dengan nomor telepon dan kata sandi yang diberikan administrator.</p><form onSubmit={submit}><label>Nomor telepon<input name="phone" type="tel" inputMode="tel" autoComplete="username" placeholder="081234567890" required maxLength={25} /></label><label>Kata sandi<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p role="alert" className="neon-error">{error}</p>}<button className="button primary" disabled={pending}>{pending ? "Memproses…" : "Masuk"}</button></form><p className="muted">Belum punya akun atau lupa kata sandi? Hubungi administrator lingkungan.</p></section></main>;
}
