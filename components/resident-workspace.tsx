"use client";

import { useQuery } from "@tanstack/react-query";
import CommunityHelp from "@/components/community-help";
import { useDashboard } from "@/components/dashboard-shell";
import { cacheKeys } from "@/lib/client-cache";
import type { ResidentWorkspaceData } from "@/lib/neon/resident-workspace";

export default function ResidentWorkspace({ showProfile }: { showProfile: boolean }) {
  const { userId, tenant, api } = useDashboard();
  const query = useQuery({
    queryKey: cacheKeys.resident(userId, tenant),
    queryFn: ({ signal }) => api<ResidentWorkspaceData>(`/api/neighborhoods/${tenant}/resident`, { signal }),
  });
  const title = showProfile ? "Profil saya" : "Hunian saya";

  return <section className="panel live-panel resident-workspace" aria-labelledby="resident-heading">
    <h2 id="resident-heading">{title}</h2>
    {query.isError ? <div className="live-alert">
      <p role="alert">{query.error.message}</p>
      <button type="button" className="button secondary" onClick={() => query.refetch()}>Coba lagi</button>
    </div> : !query.data ? <p role="status">Memuat data Anda…</p> :
      <ResidentDetails data={query.data} showProfile={showProfile} />}
  </section>;
}

function ResidentDetails({ data: { profile, units, contact }, showProfile }: {
  data: ResidentWorkspaceData;
  showProfile: boolean;
}) {
  if (!profile) return <>
    <p>Data warga Anda belum tersedia.</p>
    <CommunityHelp title="Hubungi pengurus" contact={contact}>Minta pengurus memeriksa data warga yang terhubung ke akun Anda.</CommunityHelp>
  </>;

  if (showProfile) return <>
    <dl className="resident-workspace-fields">
      <div><dt>Nama lengkap</dt><dd>{profile.name}</dd></div>
      <div><dt>Nomor telepon</dt><dd>{profile.phone}</dd></div>
      <div><dt>Email</dt><dd>{profile.email || "Belum diisi"}</dd></div>
    </dl>
    <CommunityHelp title="Ajukan koreksi" contact={contact}>Beri tahu pengurus data profil yang perlu diperbarui.</CommunityHelp>
  </>;

  if (!units.length) return <>
    <h3>Unit Anda belum ditautkan</h3>
    <p>Minta pengurus menautkan unit hunian ke akun Anda.</p>
    <CommunityHelp title="Hubungi pengurus" contact={contact}>Jika belum tahu nomor unit, sebutkan klaster dan alamat hunian Anda.</CommunityHelp>
  </>;

  return <ul className="resident-workspace-units">
    {units.map(unit => <li key={unit.id}>
      <h3>Unit {unit.number}</h3>
      <dl className="resident-workspace-fields">
        <div><dt>Klaster</dt><dd>{unit.cluster}</dd></div>
        {unit.address && <div><dt>Alamat</dt><dd>{unit.address}</dd></div>}
      </dl>
    </li>)}
  </ul>;
}
