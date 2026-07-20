import { useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { ReportResponse, SocialNetwork } from "../shared/types";

const NETWORK_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X",
  otro: "Otra red",
};

export default function UpcomingSection({ upcoming }: { upcoming: ReportResponse["upcoming"] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? upcoming.items : upcoming.items.slice(0, 8);
  return (
    <section className="upcoming-section">
      <details className="upcoming-disclosure">
        <summary className="upcoming-header">
          <div className="upcoming-header__icon"><CalendarClock size={20} /></div>
          <div><span className="eyebrow">PRÓXIMAMENTE</span><h2>Posts planificados para más adelante</h2><p>No impactan el cumplimiento antes de su fecha programada.</p></div>
          <div className="upcoming-header__count"><strong>{upcoming.plannedContents}</strong><span>planificados · {upcoming.plannedTargets} por red</span></div>
          <ChevronDown className="upcoming-header__chevron" size={18} />
        </summary>
        <div className="upcoming-body">
          {visible.length ? <div className="upcoming-grid">{visible.map((item) => <article className="upcoming-card" key={item.sourceRow}>
            <div className="upcoming-card__top"><time dateTime={item.plannedDate}>{format(parseISO(item.plannedDate), "EEE d MMM", { locale: es })}</time><span>Programada</span></div>
            <h3>{item.title || item.description || "Publicación sin título"}</h3>
            {item.title && item.description && <p>{item.description}</p>}
            <div className="upcoming-targets">{item.targets.map((target) => <span key={`${target.network}-${target.account}`}>{NETWORK_LABELS[target.network]}{item.targets.filter((candidate) => candidate.network === target.network).length > 1 ? ` · ${target.account}` : ""}</span>)}</div>
            {item.hasPublishedLinkHint && <small><Link2 size={12} /> El Sheet ya contiene un enlace publicado</small>}
          </article>)}</div> : <div className="upcoming-empty"><CalendarClock size={24} /><strong>No hay publicaciones futuras cargadas</strong><span>Cuando aparezcan fechas posteriores a hoy en el Sheet, se mostrarán acá.</span></div>}
          {upcoming.items.length > 8 && <button className="upcoming-more" onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{expanded ? "Ver menos" : `Ver los ${upcoming.items.length} posts`}</button>}
        </div>
      </details>
    </section>
  );
}
