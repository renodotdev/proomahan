"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ROLE_LABELS, TENANT_ID, activeRoles, appointRole, assignmentStatus, revokeRole, type RoleAssignment, type StaffRole } from "@/lib/access";
import { uid, type Demo } from "@/lib/demo";

export const DEMO_ACCESS_TIME = "2026-11-07T12:00";
export const jakartaTime = (local: string) => `${local}:00+07:00`;
const localTime = (timestamp: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(timestamp));
const inputTime = (timestamp: string) => new Date(Date.parse(timestamp) + 7 * 3600000).toISOString().slice(0, 16);

export function AccessPreview({ data, userId, time, change }: { data: Demo; userId: string; time: string; change: (userId: string, time: string) => void }) {
  const roles = activeRoles(data, userId, TENANT_ID, jakartaTime(time));
  return <section className="access-preview" aria-label="Simulasi akses pengurus">
    <div><strong>Simulasi akses pengurus</strong><small>Kontrol pratinjau · bukan autentikasi</small></div>
    <label>Akun contoh<select value={userId} onChange={e => change(e.target.value, time)}>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}{!a.active ? " (nonaktif)" : ""}</option>)}</select></label>
    <label>Waktu pemeriksaan (WIB)<input type="datetime-local" value={time} onChange={e => { if (e.target.value && Number.isFinite(Date.parse(jakartaTime(e.target.value)))) change(userId, e.target.value); }} /></label>
    <span className="access-summary">{roles.length ? roles.map(r => ROLE_LABELS[r]).join(" · ") : "Tidak ada akses pengurus aktif"}</span>
  </section>;
}

export function RoleManagement({ data, save, actorId, at, notify }: { data: Demo; save: (data: Demo) => void; actorId: string; at: string; notify: (message: string) => void }) {
  const [editing, setEditing] = useState<{ kind: "appoint" | "renew" | "revoke"; assignment?: RoleAssignment } | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (editing) dialog.current?.showModal(); }, [editing]);
  const close = () => { dialog.current?.close(); setEditing(null); setError(""); };
  const open = (value: NonNullable<typeof editing>) => { setError(""); setEditing(value); };
  const permitted = activeRoles(data, actorId, TENANT_ID, at).includes("super_admin");
  if (!permitted) return <section className="panel access-empty"><h2>Akses terbatas</h2><p>Hanya Super Administrator yang dapat mengelola penetapan peran.</p></section>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const fields = new FormData(event.currentTarget);
    try {
      const prior = editing?.assignment;
      const reason = String(fields.get("reason") || "").trim();
      const next = editing?.kind === "revoke" && prior ? revokeRole(data, prior.id, actorId, at, reason) : appointRole(data, {
        id: uid(), userId: prior?.userId || String(fields.get("userId")), tenantId: TENANT_ID,
        role: prior?.role || String(fields.get("role")) as StaffRole,
        startsAt: jakartaTime(String(fields.get("start"))), endsAt: jakartaTime(String(fields.get("end"))),
        revokedAt: null, assignedBy: actorId, reason, ...(prior ? { renewsId: prior.id } : {}),
      }, actorId, at);
      save(next); close(); notify("Penetapan peran contoh tersimpan. Hak warga tetap terpisah dari masa jabatan.");
    } catch (error) { setError(error instanceof Error ? error.message : "Periksa data penetapan."); }
  };
  const assignment = editing?.assignment;
  return <>
    <div className="page-heading"><div><h1>Peran dan masa jabatan</h1><p>Penetapan pengurus hasil pemilihan, perpanjangan, dan riwayat pencabutan.</p></div><button className="button primary" onClick={() => open({ kind: "appoint" })}>Tetapkan pengurus</button></div>
    <div className="info-note">Peran warga tetap berlaku setelah masa jabatan pengurus berakhir, selama akun dan hubungan hunian masih aktif. Super Administrator tidak memiliki tanggal kedaluwarsa.</div>
    <section className="panel role-panel"><div className="panel-heading"><div><h2>Penetapan akses</h2><p>D&apos;Park City · akhir masa jabatan bersifat eksklusif · seluruh waktu WIB</p></div></div><div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel penetapan akses, geser untuk melihat semua kolom"><table><thead><tr><th>Pengguna dan peran</th><th>Masa jabatan</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>{data.assignments.filter(a => a.tenantId === TENANT_ID || a.role === "super_admin" && a.tenantId === null).map(a => {
      const account = data.accounts.find(u => u.id === a.userId);
      const status = assignmentStatus(a, at);
      return <tr key={a.id}><td><strong>{account?.name || a.userId}</strong><small className="role-line">{ROLE_LABELS[a.role]} · {a.role === "super_admin" ? "Platform" : "D'Park City"}</small><small className="role-line">{a.reason}</small></td><td>{localTime(a.startsAt)}<small className="role-line">{a.endsAt ? `hingga ${localTime(a.endsAt)}` : "Tanpa kedaluwarsa"}</small></td><td><span className={`badge ${status === "Aktif" && account?.active ? "green" : status === "Terjadwal" ? "amber" : "gray"}`}>{!account?.active ? "Akun nonaktif" : status}</span></td><td><div className="row-actions">{a.role !== "super_admin" && !a.revokedAt && <button className="table-action" onClick={() => open({ kind: "renew", assignment: a })}>Perpanjang</button>}{["Aktif", "Terjadwal"].includes(status) && <button className="text-button red-text" onClick={() => open({ kind: "revoke", assignment: a })}>Cabut akses</button>}</div></td></tr>;
    })}</tbody></table></div></section>
    <section className="panel role-panel"><div className="panel-heading"><div><h2>Riwayat penetapan</h2><p>Contoh jejak tindakan · catatan sebelumnya tetap dipertahankan</p></div></div>{data.roleEvents.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel riwayat penetapan, geser untuk melihat semua kolom"><table><thead><tr><th>Waktu</th><th>Tindakan</th><th>Pengurus</th><th>Oleh / alasan</th></tr></thead><tbody>{[...data.roleEvents].reverse().map(event => { const a = data.assignments.find(a => a.id === event.assignmentId); return <tr key={event.id}><td>{localTime(event.at)}</td><td>{{ appointed: "Ditetapkan", renewed: "Diperpanjang", revoked: "Dicabut" }[event.action]}</td><td>{data.accounts.find(u => u.id === a?.userId)?.name}<small className="role-line">{a && ROLE_LABELS[a.role]}</small></td><td>{data.accounts.find(u => u.id === event.actorId)?.name}<small className="role-line">{event.reason}</small></td></tr>; })}</tbody></table></div> : <div className="access-empty">Belum ada tindakan baru. Penetapan awal adalah data contoh.</div>}</section>
    {editing && <dialog ref={dialog} className="modal" aria-labelledby="role-modal-title" onCancel={close}><div className="modal-heading"><div><h2 id="role-modal-title">{editing.kind === "revoke" ? "Cabut akses pengurus" : editing.kind === "renew" ? "Perpanjang masa jabatan" : "Tetapkan pengurus"}</h2><p>{assignment ? `${data.accounts.find(a => a.id === assignment.userId)?.name} · ${ROLE_LABELS[assignment.role]}` : "Pilih warga dan peran hasil pemilihan."}</p></div><button className="icon-button" aria-label="Tutup dialog" onClick={close}>×</button></div><form onSubmit={submit}><div className="modal-body">
      {editing.kind === "revoke" ? <div className="info-note">Akses pengurus akan dicabut pada waktu simulasi. Hanya penetapan ini yang dicabut; peran lain dan periode terjadwal tetap terpisah. Akun warga tidak dinonaktifkan. Super Administrator aktif terakhir tidak dapat dicabut.</div> : <><div className="form-grid">{!assignment && <><label className="field"><span>Warga</span><select name="userId" required>{data.accounts.filter(a => a.active && a.resident).map(a => <option key={a.id} value={a.id}>{a.name} · {a.unit}</option>)}</select></label><label className="field"><span>Peran pengurus</span><select name="role">{Object.entries(ROLE_LABELS).filter(([role]) => role !== "super_admin").map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label></>}
      <label className="field"><span>Mulai (WIB)</span><input type="datetime-local" name="start" defaultValue={assignment?.endsAt && Date.parse(assignment.endsAt) > Date.parse(at) ? inputTime(assignment.endsAt) : inputTime(at)} required /></label><label className="field"><span>Berakhir (WIB, eksklusif)</span><input type="datetime-local" name="end" required /></label></div><p className="muted">Beberapa peran dapat dimiliki sekaligus. Perpanjangan membuat periode baru, tanpa mengubah riwayat periode sebelumnya.</p></>}
      <label className="field"><span>Alasan / referensi keputusan</span><textarea name="reason" required rows={3} placeholder="Contoh: hasil pemilihan pengurus periode 2027" /></label>{error && <div className="form-error" role="alert">{error}</div>}
      </div><div className="form-footer"><button type="button" className="button secondary" onClick={close}>Batal</button><button type="submit" className={`button primary ${editing.kind === "revoke" ? "danger" : ""}`}>{editing.kind === "revoke" ? "Cabut akses" : "Simpan penetapan"}</button></div></form></dialog>}
  </>;
}
