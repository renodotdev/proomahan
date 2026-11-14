import Link from "next/link";
import { ArrowRight, House, MapPin, ShieldCheck, Trees, Leaf, UsersRound, FileText } from "lucide-react";

function Logo({ small = false }: { small?: boolean }) { return <span className={`logo ${small ? "small" : ""}`}><span className="logo-icon"><House size={22} strokeWidth={2.2} /><span /></span>{!small && <span>proomahan<span className="logo-dot">.</span></span>}</span>; }

function Landscape({ type = "garden", hero = false }: { type?: string; hero?: boolean }) { return <div className={`landscape ${type} ${hero ? "hero-landscape" : ""}`} aria-hidden="true"><div className="sun" /><div className="landscape-cloud cloud-one" /><div className="landscape-cloud cloud-two" /><div className="landscape-hill hill-one" /><div className="landscape-hill hill-two" /><div className="park-path" /><div className="illustrated-house house-one"><div className="roof" /><div className="house-wall"><i /><i /><b /></div></div><div className="illustrated-house house-two"><div className="roof" /><div className="house-wall"><i /><i /><b /></div></div><div className="park-tree tree-one"><Trees /></div><div className="park-tree tree-two"><Trees /></div><div className="park-tree tree-three"><Trees /></div><div className="landscape-tag"><Leaf size={13} />D&apos;Park City</div></div>; }

export default function PublicLanding({ signedIn }: { signedIn: boolean }) {
  const portalHref = signedIn ? "/workspace" : "/sign-in";
  return <div className="public-page">
    <header className="public-header">
      <Link href="/" aria-label="Halaman utama Proomahan"><Logo /></Link>
      <nav aria-label="Navigasi publik"><a href="#tentang">Lingkungan kita</a><a href="#layanan">Layanan warga</a></nav>
      <Link href={portalHref} className="button primary">{signedIn ? "Dashboard" : "Masuk"} <ArrowRight size={16} /></Link>
    </header>
    <main id="main-content">
      <section className="public-hero" id="tentang">
        <div className="public-hero-copy">
          <span className="location-pill"><MapPin size={14} />D&apos;PARK CITY</span>
          <h1>Rumah yang nyaman.<br />Lingkungan yang<br /><em>kita rawat bersama.</em></h1>
          <p>Satu ruang untuk data warga, informasi hunian, dan dokumen pribadi. Lebih dekat dengan lingkungan, lebih mudah dengan Proomahan.</p>
          <div><Link href={portalHref} className="button primary">{signedIn ? "Buka dashboard" : "Masuk ke portal warga"} <ArrowRight size={17} /></Link></div>
          <span className="hero-trust"><ShieldCheck size={17} />Akses warga dikelola langsung oleh pengurus lingkungan.</span>
        </div>
        <div className="public-hero-art"><Landscape hero /><div className="floating-neighborhood"><span className="neighborhood-icon"><Trees size={24} /></span><div><strong>D&apos;Park City</strong><span>Tempat pulang. Ruang bertumbuh.</span></div></div></div>
      </section>
      <section className="public-benefits" id="layanan" aria-label="Layanan warga">
        <div><UsersRound size={24} /><span><strong>Data warga tertata</strong><p>Informasi warga dikelola oleh pengurus lingkungan.</p></span></div>
        <div><House size={24} /><span><strong>Informasi hunian terhubung</strong><p>Lihat unit hunian yang terhubung dengan akun Anda.</p></span></div>
        <div><FileText size={24} /><span><strong>Dokumen pribadi tersimpan</strong><p>Akses dokumen melalui ruang pribadi akun Anda.</p></span></div>
      </section>
      <section className="public-cta"><Trees size={38} /><h2>{signedIn ? "Selamat datang kembali di D’Park City" : "Sudah menjadi warga D’Park City?"}</h2><p>{signedIn ? "Buka dashboard untuk mengakses data dan layanan warga." : "Masuk dengan akun yang diberikan pengurus untuk mengakses layanan warga."}</p><Link href={portalHref} className="button primary">{signedIn ? "Buka dashboard" : "Buka portal warga"} <ArrowRight size={16} /></Link></section>
    </main>
    <footer className="public-footer"><Logo /><span>D&apos;Park City · Proomahan</span></footer>
  </div>;
}
