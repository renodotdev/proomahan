"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboard } from "@/components/dashboard-shell";
import WorkspaceModal from "@/components/workspace-modal";
import { cacheKeys } from "@/lib/client-cache";
import { publicPageFields, type PublicPageContent } from "@/lib/public-page-content";

type View = "summary" | "rentals" | "bulletin" | "public-page";
const housingLabels = {
  occupied: "Dihuni nonsewa", rented: "Sedang Disewa", available: "Tersedia Disewa", vacant: "Kosong", unknown: "Hunian belum terverifikasi",
};
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dates = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

function usePortal(view: View) {
  const { tenant, userId, api } = useDashboard();
  return { api, url: `/api/neighborhoods/${tenant}/portal?view=${view}`, key: [...cacheKeys.tenant(userId, tenant), view] };
}

export function WorkspaceSummary() {
  const { api, url, key } = usePortal("summary");
  const [period, setPeriod] = useState("");
  const query = useQuery({
    queryKey: [...key, period],
    queryFn: ({ signal }) => api<{
      housing: Partial<Record<keyof typeof housingLabels, number>>; counts: { clusters: number; people: number } | null;
      billing: { issued: string; paid: string; outstanding: string; overdue: number; pending: number } | null; period: string;
    }>(period ? `${url}&period=${period}` : url, { signal }),
  });
  const data = query.data;
  return <section className="panel live-panel portal-stack">
    <h2>Ringkasan Lingkungan</h2>
    {query.isPending && <p role="status">Memuat ringkasan…</p>}
    {query.error && <p className="live-alert" role="alert">{query.error.message} <button className="text-button" onClick={() => query.refetch()}>Coba lagi</button></p>}
    {data && <>
      <dl className="portal-metrics">
        {data.counts && <>
          <div><dt><Link href="/workspace?view=clusters">Klaster aktif</Link></dt><dd>{data.counts.clusters}</dd></div>
          <div><dt><Link href="/workspace?view=people">Warga tercatat</Link></dt><dd>{data.counts.people}</dd></div>
        </>}
        <div><dt>Unit aktif</dt><dd>{Object.values(data.housing).reduce((total, count) => total + count, 0)}</dd></div>
        {(Object.entries(housingLabels) as [keyof typeof housingLabels, string][]).map(([status,label]) => <div key={status}>
          <dt>{status === "rented" || status === "available" || status === "vacant" ? <Link href={`/workspace?view=rentals&status=${status}`}>{label}</Link> : label}</dt>
          <dd>{data.housing[status] ?? 0}</dd>
        </div>)}
      </dl>
      {data.billing && <>
        <div className="live-section-heading"><h3>Tagihan</h3>
          <label className="field"><span>Bulan tagihan</span><input type="month" value={period || data.period}
            onChange={event => setPeriod(event.target.value)} /></label>
        </div>
        <dl className="portal-metrics">
          <div><dt><Link href="/bills">Total terbit</Link></dt><dd>{rupiah.format(BigInt(data.billing.issued))}</dd></div>
          <div><dt>Pembayaran terverifikasi</dt><dd>{rupiah.format(BigInt(data.billing.paid))}</dd></div>
          <div><dt>Sisa tagihan</dt><dd>{rupiah.format(BigInt(data.billing.outstanding))}</dd></div>
          <div><dt>Tagihan lewat jatuh tempo</dt><dd>{data.billing.overdue}</dd></div>
          <div><dt><Link href="/workspace?view=payments">Menunggu verifikasi · semua periode</Link></dt><dd>{data.billing.pending}</dd></div>
        </dl>
      </>}
    </>}
  </section>;
}

export function RentalWorkspace({ initialStatus }: { initialStatus: string }) {
  const { api, url, key } = usePortal("rentals");
  const [status, setStatus] = useState(initialStatus);
  const [cluster, setCluster] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...key, status, cluster, page],
    queryFn: ({ signal }) => api<{
      rows: { id: string; number: string; cluster: string; status: keyof typeof housingLabels }[];
      next: boolean; clusters: string[];
    }>(`${url}&${new URLSearchParams({ status, cluster, page: String(page) })}`, { signal }),
    placeholderData: previous => previous,
  });
  return <section className="panel live-panel portal-stack">
    <h2>Unit Sewa dan Kosong</h2>
    <div className="workspace-form-columns">
      <label className="field"><span>Status unit</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="">Semua status</option><option value="rented">Sedang Disewa</option>
        <option value="available">Tersedia Disewa</option><option value="vacant">Kosong</option>
      </select></label>
      <label className="field"><span>Klaster</span><select value={cluster} onChange={event => { setCluster(event.target.value); setPage(1); }}>
        <option value="">Semua klaster</option>{query.data?.clusters.map(name => <option value={name} key={name}>{name}</option>)}
      </select></label>
    </div>
    {query.isFetching && <p role="status">Memuat unit…</p>}
    {query.error && <p className="live-alert" role="alert">{query.error.message}</p>}
    {query.data?.rows.length === 0 && <p>Tidak ada unit untuk filter ini.</p>}
    {!!query.data?.rows.length && <ul className="workspace-bill-grid" aria-busy={query.isFetching}>{query.data.rows.map(unit => <li className="workspace-bill-card" key={unit.id}>
      <h3>{unit.number}</h3><p>{unit.cluster}</p><span className="live-status">{housingLabels[unit.status]}</span>
    </li>)}</ul>}
    <PortalPagination page={page} setPage={setPage} next={!!query.data?.next && !query.isPlaceholderData} />
  </section>;
}

type Announcement = { id: string; title: string; body: string; status: "draft" | "published" | "archived"; published_at: string | null; updated_at: string };
const postStatuses = { draft: "Draf", published: "Terbit", archived: "Diarsipkan" };

export function BulletinWorkspace() {
  const { api, url, key } = usePortal("bulletin");
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Announcement | "new">();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: [...key, page],
    queryFn: ({ signal }) => api<{ posts: Announcement[]; next: boolean; canPublish: boolean }>(`${url}&page=${page}`, { signal }),
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError(""); setBusy(true);
    try {
      await api(url, { method: "POST", body: JSON.stringify({
        ...Object.fromEntries(new FormData(event.currentTarget)),
        ...(editing !== "new" ? { id: editing.id, version: editing.updated_at } : {}),
      }) });
      if (editing === "new") setPage(1);
      setEditing(undefined);
      setNotice("Pengumuman disimpan.");
      await client.invalidateQueries({ queryKey: key });
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="panel live-panel portal-stack">
    <div className="live-section-heading"><h2>Papan Pengumuman</h2>
      {query.data?.canPublish && <button className="button primary" onClick={() => { setError(""); setEditing("new"); }}>Tulis pengumuman</button>}
    </div>
    {query.isPending && <p role="status">Memuat pengumuman…</p>}
    {query.error && <p className="live-alert" role="alert">{query.error.message}</p>}
    {notice && <p className="info-note" role="status">{notice}</p>}
    {query.data?.posts.length === 0 && <p>Belum ada pengumuman.</p>}
    {query.data?.posts.map(post => <article key={post.id} className="workspace-bill-card">
      <div className="live-section-heading"><h3>{post.title}</h3>
        {query.data.canPublish && <button className="button secondary compact" onClick={() => { setError(""); setEditing(post); }}>Ubah</button>}
      </div>
      <p className="portal-plain-text">{post.body}</p>
      <small>{query.data.canPublish && postStatuses[post.status]}{post.published_at && `${query.data.canPublish ? " · " : ""}${dates.format(new Date(post.published_at))}`}</small>
    </article>)}
    <PortalPagination page={page} setPage={setPage} next={!!query.data?.next} />
    {editing && <WorkspaceModal title={editing === "new" ? "Tulis pengumuman" : "Ubah pengumuman"} close={() => setEditing(undefined)} busy={busy}>
      <form onSubmit={submit}>
        <div className="form-body live-form">
          <label className="field"><span>Judul</span><input name="title" required maxLength={140} defaultValue={editing === "new" ? "" : editing.title} /></label>
          <label className="field"><span>Isi pengumuman</span><textarea name="body" required maxLength={3000} rows={6} defaultValue={editing === "new" ? "" : editing.body} /></label>
          <label className="field"><span>Status</span><select name="status" defaultValue={editing === "new" ? "draft" : editing.status}>
            <option value="draft">Simpan draf</option><option value="published">Terbitkan untuk warga</option>
            {editing !== "new" && <option value="archived">Arsipkan</option>}
          </select></label>
          {error && <p className="live-alert" role="alert">{error}</p>}
        </div>
        <div className="form-footer"><button className="button primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button></div>
      </form>
    </WorkspaceModal>}
  </section>;
}

function PortalPagination({ page, setPage, next }: { page: number; setPage: (page: number) => void; next: boolean }) {
  if (page === 1 && !next) return null;
  return <div className="portal-actions">
    <button className="button secondary compact" disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelumnya</button>
    <button className="button secondary compact" disabled={!next} onClick={() => setPage(page + 1)}>Berikutnya</button>
  </div>;
}

export function PublicPageWorkspace() {
  const { api, url, key } = usePortal("public-page");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api<{ draft: PublicPageContent; published_at: string | null; updated_at: string | null }>(url, { signal }),
  });
  return <section className="panel live-panel portal-stack">
    <h2>Pengaturan Halaman Publik</h2>
    {query.isPending && <p role="status">Memuat pengaturan…</p>}
    {query.error && <p className="live-alert" role="alert">{query.error.message}</p>}
    {query.data && <PublicPageForm key={query.data.updated_at ?? "new"} draft={query.data.draft}
      published={query.data.published_at} save={async (action, content) => {
        await api(url, { method: "POST", body: JSON.stringify({ ...content, action, version: query.data.updated_at }) });
        await client.invalidateQueries({ queryKey: key });
      }} />}
  </section>;
}

function PublicPageForm({ draft, published, save }: {
  draft: PublicPageContent; published: string | null; save: (action: "draft" | "publish", content: PublicPageContent) => Promise<void>;
}) {
  const [content, setContent] = useState(draft);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value === "publish" ? "publish" : "draft";
    setError(""); setBusy(true);
    try { await save(action, Object.fromEntries(publicPageFields.map(field => [field.key,content[field.key] ?? ""]))); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <p>{published ? `Terakhir diterbitkan ${dates.format(new Date(published))}.` : "Halaman publik menggunakan konten bawaan."}</p>
    <form className="portal-stack" onSubmit={submit}>
      {publicPageFields.map(field => <label key={field.key} className="field"><span>{field.label}</span>
        <textarea rows={field.key === "headline" ? 2 : 3} maxLength={field.max} value={content[field.key] ?? ""}
          onChange={event => setContent({ ...content, [field.key]: event.target.value })} />
      </label>)}
      {error && <p role="alert" className="live-alert">{error}</p>}
      <div className="portal-actions">
        <button type="button" className="button secondary" onClick={() => setPreview(true)}>Pratinjau</button>
        <button className="button secondary" value="draft" disabled={busy}>Simpan draf</button>
        <button className="button primary" value="publish" disabled={busy}>Terbitkan</button>
      </div>
    </form>
    {preview && <WorkspaceModal title="Pratinjau konten publik" close={() => setPreview(false)}>
      <div className="form-body portal-stack">
        <h3>{content.headline || "Rumah yang nyaman. Lingkungan yang kita rawat bersama."}</h3>
        <p>{content.intro || "Satu ruang untuk data warga, informasi hunian, dan dokumen pribadi. Lebih dekat dengan lingkungan, lebih mudah dengan Proomahan."}</p>
        {content.community && <p className="portal-plain-text">{content.community}</p>}
        {content.contact && <p className="portal-plain-text">{content.contact}</p>}
      </div>
    </WorkspaceModal>}
  </>;
}
