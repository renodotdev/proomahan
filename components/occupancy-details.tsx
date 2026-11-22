"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, House, RefreshCw, UsersRound } from "lucide-react";
import { useDashboard } from "@/components/dashboard-shell";
import WorkspaceModal from "@/components/workspace-modal";
import { cacheKeys } from "@/lib/client-cache";

const types = { owner_occupied: "Dihuni pemilik", rented: "Disewa", caretaker: "Penjaga rumah", other: "Lainnya" };
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" });

type Stay = {
  id: string;
  full_name: string;
  occupancy_type: keyof typeof types;
  starts_on: string;
  ends_on: string | null;
  status: "current" | "past" | "scheduled";
};

export default function OccupancyDetails({ unitId, label, close }: { unitId: string; label: string; close: () => void }) {
  const { tenant, userId, api } = useDashboard();
  const query = useQuery({
    queryKey: [...cacheKeys.records(userId, tenant, "units"), "occupancy", unitId],
    queryFn: ({ signal }) => api<{ occupants: Stay[] }>(`/api/neighborhoods/${tenant}/units/${unitId}/occupancy`, { signal }),
    staleTime: 0,
  });
  const occupants = query.data?.occupants ?? [];
  const current = occupants.filter(stay => stay.status === "current");
  const timeline = occupants.filter(stay => stay.status !== "current");
  return <WorkspaceModal title={`Detail hunian · ${label}`} icon={House} close={close}>
    <div className="form-body live-form workspace-guided-form">
      {query.isPending && <p role="status">Memuat riwayat hunian…</p>}
      {query.isError && <p role="alert" className="live-alert">{query.error.message}
        <button type="button" className="text-button" onClick={() => query.refetch()}><RefreshCw size={16} aria-hidden="true" />Coba lagi</button>
      </p>}
      {query.isSuccess && <>
        <StayGroup title="Penghuni saat ini" icon={UsersRound} stays={current} empty="Tidak ada penghuni aktif." />
        <StayGroup title="Riwayat dan jadwal" icon={CalendarClock} stays={timeline} empty="Belum ada riwayat atau jadwal yang dapat ditampilkan." />
      </>}
    </div>
    <div className="form-footer"><button type="button" className="button secondary" onClick={close}>Tutup detail</button></div>
  </WorkspaceModal>;
}

function StayGroup({ title, icon: Icon, stays, empty }: { title: string; icon: typeof House; stays: Stay[]; empty: string }) {
  return <section className="workspace-form-section">
    <h3 className="workspace-icon-label"><Icon size={18} aria-hidden="true" />{title}</h3>
    {stays.length ? <ul className="occupancy-list">{stays.map(stay => <li key={stay.id}>
      <strong>{stay.full_name}</strong>
      <p>{types[stay.occupancy_type]} · {date.format(new Date(stay.starts_on))}
        {stay.ends_on ? ` hingga ${date.format(new Date(stay.ends_on))}` : ""}
      </p>
      {stay.status === "scheduled" && <span className="live-status">Masuk terjadwal</span>}
      {stay.status === "current" && stay.ends_on && <span className="live-status">Keluar terjadwal</span>}
      {stay.status === "past" && <span className="live-status archived">Selesai</span>}
    </li>)}</ul> : <p>{empty}</p>}
  </section>;
}
