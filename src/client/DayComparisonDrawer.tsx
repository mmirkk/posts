import { useState } from "react";
import { Check, ChevronDown, Eye, ExternalLink, ImageOff, Images, Link2, Minus, Play, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { ManualReviewValue, ReportRecord, SocialNetwork } from "../shared/types";
import { groupPlannedContent, type PlannedContent } from "./contentSummary";
import { recordsForDay } from "./dailyTimeline";
import { getTargetPresentation, type TargetVisualState } from "./targetPresentation";
import { isVideoAsset, recordPublishedFormat } from "./postMedia";

const NETWORK_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", twitter: "X", otro: "Otra red",
};
function compactText(value: string) {
  return value || "Sin copy planificado";
}

function PublishedPreview({ record }: { record: ReportRecord }) {
  const [failed, setFailed] = useState(false);
  const previewUrl = record.mediaUrls?.[0] ?? "";
  const format = recordPublishedFormat(record);
  const videoAsset = isVideoAsset(previewUrl);
  return <div className="day-media-wrap">
    <div className={`day-media-preview ${!previewUrl || failed ? "day-media-preview--empty" : ""}`} aria-label={previewUrl && !failed ? `Vista previa: ${format.label}` : "Sin vista previa disponible"}>
      {previewUrl && !failed
        ? videoAsset
          ? <video src={previewUrl} muted playsInline preload="metadata" onError={() => setFailed(true)} />
          : <img src={previewUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
        : <ImageOff size={20} />}
      {previewUrl && !failed && (format.tone === "video" || format.tone === "reel" || format.tone === "short") && <span className="day-media-preview__play"><Play size={12} fill="currentColor" /></span>}
      {record.mediaUrls?.length > 1 && <span className="day-media-preview__count"><Images size={10} /> {record.mediaUrls.length}</span>}
    </div>
  </div>;
}

function TargetIcon({ state }: { state: TargetVisualState }) {
  if (state === "done") return <Check size={13} />;
  if (state === "review") return <Eye size={13} />;
  if (state === "no-evidence") return <Minus size={13} />;
  return <X size={13} />;
}

function PlannedContentRow({
  content,
  focusRecordId,
  onReviewDecision,
  reviewingId,
}: {
  content: PlannedContent;
  focusRecordId?: string | null;
  onReviewDecision?: (record: ReportRecord, actualId: string, decision: ManualReviewValue) => void;
  reviewingId: string | null;
}) {
  const evidenceTargets = content.targets
    .filter((target) => target.actualId || (target.status === "coincidencia_dudosa" && target.actualDescription))
    .sort((left, right) => Number(right.status === "coincidencia_dudosa") - Number(left.status === "coincidencia_dudosa"));
  const hasReview = content.targets.some((target) => target.status === "coincidencia_dudosa");
  const isFocused = Boolean(focusRecordId && content.targets.some((target) => target.id === focusRecordId));
  const duplicateNetworks = new Set(content.targets
    .filter((target, index, targets) => targets.some((other, otherIndex) => otherIndex !== index && other.network === target.network))
    .map((target) => target.network));
  const outcome = content.matched === content.targets.length
    ? "Publicada en todas las redes previstas"
    : content.matched
      ? `${content.matched} de ${content.targets.length} redes/cuentas publicadas`
      : "Sin publicación asociada";

  return <article className={`day-plan-row ${content.matched ? "day-plan-row--matched" : "day-plan-row--missing"}`}>
    <div className="day-plan-row__heading">
      <div><strong>{content.title || "Contenido planificado"}</strong><span>{content.campaign}</span></div>
      <span className={`day-outcome ${content.matched ? "day-outcome--done" : "day-outcome--missing"}`}>{outcome}</span>
    </div>

    <div className="day-targets" aria-label="Resultado por red y cuenta">
      {content.targets.map((target) => {
        const presentation = getTargetPresentation(target);
        const resultLabel = presentation.label;
        return <div className={`day-target day-target--${presentation.state}`} key={target.id}>
          <TargetIcon state={presentation.state} />
          <span>{NETWORK_LABELS[target.network]}{duplicateNetworks.has(target.network) ? ` · ${target.account}` : ""}</span>
          <small>{resultLabel}</small>
          {target.postUrl && <a href={target.postUrl} target="_blank" rel="noreferrer" aria-label="Abrir publicación"><ExternalLink size={12} /></a>}
        </div>;
      })}
    </div>

    <details className={`day-copy-details ${isFocused ? "day-copy-details--focused" : ""}`} open={isFocused || undefined}>
      <summary><span>Comparar textos</span><ChevronDown size={15} /></summary>
      <div className="day-copy-grid">
        <div><span>PLANEADO</span><strong>{content.title || "Publicación planeada"}</strong><p>{compactText(content.description)}</p></div>
        <div className={evidenceTargets.length ? "has-match" : "no-match"}>
          <span>{hasReview ? "CANDIDATO PARA REVISAR" : "PUBLICADO"}</span>
          {evidenceTargets.length
            ? evidenceTargets.map((target) => <div className="day-published-copy" key={target.actualId ?? target.id}>
              <strong>{NETWORK_LABELS[target.network]} · {target.account}{target.status === "coincidencia_dudosa" && target.similarity !== null ? ` · ${Math.round(target.similarity * 100)}% similar` : ""}</strong>
              <p>{compactText(target.actualDescription)}</p>
              {target.postUrl && <a href={target.postUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir post</a>}
              {target.status === "coincidencia_dudosa" && target.alternativeCandidates[0] && onReviewDecision && <div className="review-decision-actions">
                <button className="review-decision review-decision--approve" onClick={() => onReviewDecision(target, target.alternativeCandidates[0].actualId, "approved")} disabled={reviewingId === target.id}><Check size={14} /> Sí, es este post</button>
                <button className="review-decision review-decision--reject" onClick={() => onReviewDecision(target, target.alternativeCandidates[0].actualId, "rejected")} disabled={reviewingId === target.id}><X size={14} /> No corresponde</button>
              </div>}
            </div>)
            : <p>No se encontró una publicación asociada.</p>}
        </div>
      </div>
    </details>
  </article>;
}

export default function DayComparisonDrawer({
  day,
  records,
  onClose,
  focusRecordId,
  onReviewDecision,
}: {
  day: string;
  records: ReportRecord[];
  onClose: () => void;
  focusRecordId?: string | null;
  onReviewDecision?: (record: ReportRecord, actualId: string, decision: ManualReviewValue) => Promise<void>;
}) {
  const detail = recordsForDay(records, day);
  const sortedActual = [...detail.actual].sort((left, right) => Number(Boolean(right.plannedId)) - Number(Boolean(left.plannedId))
    || left.network.localeCompare(right.network)
    || left.account.localeCompare(right.account, "es"));
  const plannedContents = groupPlannedContent(detail.planned).sort((left, right) => {
    const leftFocused = left.targets.some((target) => target.id === focusRecordId);
    const rightFocused = right.targets.some((target) => target.id === focusRecordId);
    return Number(rightFocused) - Number(leftFocused);
  });
  const matchedTargets = detail.planned.filter((record) => record.actualId).length;
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const decide = async (record: ReportRecord, actualId: string, decision: ManualReviewValue) => {
    if (!onReviewDecision) return;
    setReviewingId(record.id);
    setDecisionError("");
    try {
      await onReviewDecision(record, actualId, decision);
      setDecisionNotice(decision === "approved" ? "Coincidencia confirmada." : "Candidato descartado.");
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "No se pudo guardar la revisión.");
    } finally {
      setReviewingId(null);
    }
  };
  return <div className="drawer-backdrop" onMouseDown={onClose} role="presentation">
    <aside className="drawer day-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Comparativa diaria">
      <header className="drawer__header"><div><span className="eyebrow">COMPARATIVA DEL DÍA</span><h2>{format(parseISO(day), "EEEE d 'de' MMMM", { locale: es })}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></header>
      <div className="drawer__content">
        <div className="day-summary"><div><span>Planeados</span><strong>{plannedContents.length}</strong></div><div><span>Posts reales</span><strong>{detail.actual.length}</strong></div><div><span>Posts planeados por red</span><strong>{detail.planned.length}</strong><small>{matchedTargets} asociados</small></div></div>
        {decisionNotice && <div className="review-notice review-notice--ok"><Check size={14} />{decisionNotice}</div>}
        {decisionError && <div className="review-notice review-notice--error"><X size={14} />{decisionError}</div>}
        <section className="day-section"><div className="day-section__title"><h3>¿Qué se hizo de lo planificado?</h3><span>{plannedContents.length} planeados · {detail.planned.length} posts por red/cuenta</span></div>{plannedContents.length ? <div className="day-plan-list">{plannedContents.map((content) => <PlannedContentRow content={content} focusRecordId={focusRecordId} onReviewDecision={onReviewDecision ? decide : undefined} reviewingId={reviewingId} key={content.key} />)}</div> : <p className="day-empty">No había publicaciones planeadas para este día.</p>}</section>
        <details className="day-actual-details">
          <summary><span>Ver los {detail.actual.length} posts oficiales realizados ese día</span><ChevronDown size={16} /></summary>
          {sortedActual.length ? <div className="day-actual-list">{sortedActual.map((record) => {
            const format = recordPublishedFormat(record);
            const associated = Boolean(record.plannedId);
            return <article className={associated ? "day-actual-card--associated" : "day-actual-card--unplanned"} key={record.actualId}>
              <PublishedPreview record={record} />
              <div className="day-actual-meta"><strong>{NETWORK_LABELS[record.network]} · {record.account}</strong><span className={`day-actual-status day-actual-status--${associated ? "associated" : "unplanned"}`}>{associated ? "Asociado al plan" : "No planificado"}</span><small className={`post-format post-format--${format.tone}`}>{format.label}</small></div>
              <p>{compactText(record.actualDescription)}</p>
              {record.postUrl && <a href={record.postUrl} target="_blank" rel="noreferrer"><Link2 size={13} /> Abrir publicación</a>}
            </article>;
          })}</div> : <p className="day-empty">No hay posts oficiales registrados para este día.</p>}
        </details>
      </div>
    </aside>
  </div>;
}
