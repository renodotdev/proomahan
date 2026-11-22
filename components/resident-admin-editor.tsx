"use client";
import { useState, type FormEvent } from "react";
import { CalendarDays, Check, CircleHelp, ReceiptText, RefreshCw, ShieldCheck, ShieldMinus, UsersRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirmation } from "@/components/action-confirmation";
import { useDashboard } from "@/components/dashboard-shell";
import WorkspaceModal from "@/components/workspace-modal";
import { cacheKeys } from "@/lib/client-cache";
import { residentAdminCapabilities } from "@/lib/neon/resident-admin";

type Role = keyof typeof residentAdminCapabilities;
const capabilityIcons = { neighborhood_admin: UsersRound, billing_admin: ReceiptText };
const termDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
type Assignment = { id: string; role: Role; scheduled: boolean; start_date: string; end_date: string };

export default function ResidentAdminEditor({ personId, name, close }: { personId: string; name: string; close: () => void }) {
  const { api, userId, tenant } = useDashboard();
  const queryClient = useQueryClient();
  const confirm = useConfirmation();
  const [revoking, setRevoking] = useState<Assignment>();
  const [notice, setNotice] = useState("");
  const url = `/api/neighborhoods/${tenant}/people/${personId}/roles`;
  const queryKey = [...cacheKeys.tenant(userId, tenant), "resident-roles", personId];
  const query = useQuery({
    queryKey, staleTime: 0,
    queryFn: ({ signal }) => api<{ assignments: Assignment[]; canChange: boolean }>(url, { signal }),
  });
  const mutation = useMutation({
    mutationFn: (body: object) => api(url, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey }); },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const title = revoking ? "Cabut penugasan" : "Tetapkan administrator";
    const role = revoking?.role ?? (data.role as Role);
    const capability = residentAdminCapabilities[role];
    const description = revoking ? `Cabut akses “${capability}” dari ${name}.` :
      `${name} akan mendapat akses “${capability}” hingga awal ${termDate.format(new Date(String(data.endDate)))}.`;
    if (!await confirm({ title: `${title}?`, description, confirmLabel: title })) return;
    setNotice("");
    try {
      await mutation.mutateAsync({ ...data, action: revoking ? "revoke" : "assign", assignmentId: revoking?.id });
      setNotice(revoking ? "Penugasan dicabut." : "Penugasan disimpan.");
      setRevoking(undefined);
      form.reset();
    } catch { /* The mutation error is displayed below the form. */ }
  }

  const assignments = query.isSuccess ? query.data.assignments : [];
  const canChange = query.data?.canChange === true;
  const available = (Object.keys(residentAdminCapabilities) as Role[]).filter(role => !assignments.some(term => term.role === role));
  return <WorkspaceModal title={`Hak administrator · ${name}`} icon={ShieldCheck} busy={mutation.isPending} close={close}>
    <div className="form-body live-form workspace-guided-form">
      {query.isPending && <p role="status">Memuat penugasan…</p>}
      {query.error && <p className="live-alert" role="alert">{query.error.message} <button className="text-button" onClick={() => query.refetch()}><RefreshCw size={15} aria-hidden="true" />Coba lagi</button></p>}
      {query.isSuccess && !canChange && <p className="live-alert" role="alert">Perubahan hak administrator memerlukan pembaruan basis data.</p>}
      {query.isSuccess && !assignments.length && <p>Belum ada penugasan aktif atau terjadwal.</p>}
      {assignments.map(term => {
        const Icon = capabilityIcons[term.role];
        const label = residentAdminCapabilities[term.role];
        return <div key={term.id} className="workspace-role-card">
          <div><strong className="workspace-icon-label"><Icon size={18} aria-hidden="true" />{label}</strong>
            <p className="workspace-icon-label"><CalendarDays size={15} aria-hidden="true" />{term.scheduled ? "Terjadwal · " : ""}{termDate.format(new Date(term.start_date))} hingga awal {termDate.format(new Date(term.end_date))}</p>
          </div>
          <button className="button secondary compact live-danger-outline" aria-label={`Cabut akses ${label}`} disabled={mutation.isPending || !canChange} onClick={() => { mutation.reset(); setRevoking(term); }}><ShieldMinus size={16} aria-hidden="true" />Cabut</button>
        </div>;
      })}
      {notice && <p className="workspace-help" role="status"><Check size={18} aria-hidden="true" />{notice}</p>}
    </div>
    {canChange && (revoking || available.length > 0) && <form key={revoking?.id || "assign"} onSubmit={submit}>
      <div className="form-body live-form workspace-guided-form">
        {revoking ? <p className="workspace-help"><ShieldMinus size={18} aria-hidden="true" /><span>Cabut akses <strong>{residentAdminCapabilities[revoking.role]}</strong>.</span></p> : <>
          <p className="workspace-help"><CircleHelp size={18} aria-hidden="true" /><span>Tambahkan satu kemampuan per penugasan. Warga dapat memiliki kedua kemampuan.</span></p>
          <label className="field"><span>Kemampuan</span><select name="role" required>{available.map(role => <option key={role} value={role}>{residentAdminCapabilities[role]}</option>)}</select></label>
          <label className="field"><span>Tanggal akhir jabatan</span><input type="date" name="endDate" required /><small>Akses dimulai sekarang dan berakhir pukul 00.00 waktu lingkungan pada tanggal ini.</small></label>
        </>}
        <label className="field"><span>Alasan</span><textarea name="reason" required maxLength={500} /></label>
        {mutation.error && <p className="live-alert" role="alert">{mutation.error.message}</p>}
      </div>
      <div className="form-footer">
        {revoking && <button type="button" className="button secondary" disabled={mutation.isPending} onClick={() => { mutation.reset(); setRevoking(undefined); }}>Batal</button>}
        <button className={`button primary${revoking ? " live-danger" : ""}`} disabled={mutation.isPending}>{revoking ? <ShieldMinus size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{mutation.isPending ? "Menyimpan…" : revoking ? "Cabut akses" : "Tetapkan"}</button>
      </div>
    </form>}
  </WorkspaceModal>;
}
