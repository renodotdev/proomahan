import type { Cluster, Demo, Unit } from "./demo.ts";

// shortcut: units and fee scopes retain display names in the mockup; production uses cluster foreign keys.
export function withManagedClusters(state: Omit<Demo, "clusters"> & { clusters?: Cluster[] }): Demo {
  if (Array.isArray(state.clusters)) return { ...state, version: 3, clusters: state.clusters };
  const names = [...new Set([...state.units.map(u => u.cluster), ...state.fees.filter(f => f.scope.startsWith("Klaster ")).map(f => f.scope.slice(8))])];
  const initial: Record<string, string> = { Akasia: "AKS", Bougenville: "BGV", Cendana: "CDN" };
  return { ...state, version: 3, clusters: names.map((name, index) => ({ id: `cluster-migrated-${index}`, name, code: initial[name] || `KLS-${index + 1}`, archived: false })) };
}

export function saveCluster(state: Demo, input: Cluster): Demo {
  const cluster = { ...input, name: input.name.trim().replace(/\s+/g, " "), code: input.code.trim().toUpperCase() };
  if (cluster.name.length < 2 || cluster.name.length > 60) throw new Error("Nama klaster harus berisi 2–60 karakter.");
  if (!/^[A-Z0-9][A-Z0-9-]{0,11}$/.test(cluster.code)) throw new Error("Kode klaster harus berisi 1–12 huruf, angka, atau tanda hubung.");
  if (state.clusters.some(c => c.id !== cluster.id && c.code === cluster.code)) throw new Error("Kode klaster sudah digunakan, termasuk oleh klaster yang diarsipkan.");
  if (state.clusters.some(c => c.id !== cluster.id && c.name.toLocaleLowerCase("id-ID") === cluster.name.toLocaleLowerCase("id-ID"))) throw new Error("Nama klaster sudah digunakan, termasuk oleh klaster yang diarsipkan.");
  const previous = state.clusters.find(c => c.id === cluster.id);
  // An edit cannot accidentally restore an archived record; use the explicit restore action.
  const next = { ...cluster, archived: previous?.archived ?? false };
  return { ...state,
    clusters: previous ? state.clusters.map(c => c.id === next.id ? next : c) : [...state.clusters, next],
    units: previous ? state.units.map(u => u.cluster === previous.name ? { ...u, cluster: next.name } : u) : state.units,
    fees: previous ? state.fees.map(f => f.scope === `Klaster ${previous.name}` ? { ...f, scope: `Klaster ${next.name}` } : f) : state.fees,
  };
}

export function setClusterArchived(state: Demo, id: string, archived: boolean): Demo {
  if (!state.clusters.some(c => c.id === id)) throw new Error("Klaster tidak ditemukan.");
  return { ...state, clusters: state.clusters.map(c => c.id === id ? { ...c, archived } : c) };
}

export function addUnit(state: Demo, unit: Unit): Demo {
  if (!state.clusters.some(c => c.name === unit.cluster && !c.archived)) throw new Error("Pilih klaster aktif. Klaster yang diarsipkan tidak menerima unit baru.");
  if (!unit.number.trim() || !unit.owner.trim()) throw new Error("Isi nomor unit dan nama pemilik.");
  if (state.units.some(u => u.id.toUpperCase() === unit.id.toUpperCase())) throw new Error("Nomor unit sudah digunakan.");
  return { ...state, units: [...state.units, unit] };
}

export function validateFeeScope(state: Demo, scope: string, previousScope?: string) {
  if (scope === "Semua unit" || state.units.some(u => u.id === scope)) return;
  const cluster = state.clusters.find(c => scope === `Klaster ${c.name}`);
  if (!cluster || cluster.archived && scope !== previousScope) throw new Error("Pilih klaster aktif untuk cakupan biaya baru.");
}
