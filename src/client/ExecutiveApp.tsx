import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  Unlink,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ManualReviewValue, ReportRecord, ReportResponse } from "../shared/types";
import { fetchJson } from "./api";
import { summarizePlannedContent } from "./contentSummary";
import { buildDailyTimeline } from "./dailyTimeline";
import DayComparisonDrawer from "./DayComparisonDrawer";
import UpcomingSection from "./UpcomingSection";

const CHART_COLORS = { planned: "#52627d", realizedPlanned: "#0f9d8a", realizedUnplanned: "#d28a2e" };

type KpiDetail = "actual" | "planned" | "published" | "unpublished" | "unplanned";

const NETWORK_LABELS: Record<ReportRecord["network"], string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X / Twitter",
  otro: "Otra red",
};

const MATCH_LABELS: Record<ReportRecord["matchType"], string> = {
  exacta: "Copy exacto",
  por_url: "Por enlace",
  por_titulo: "Por título",
  aproximada: "Copy similar",
  dudosa: "Revisión manual",
  sin_coincidencia: "Sin coincidencia",
  no_aplica: "No aplica",
};

function recordLabel(record: ReportRecord, source: "planned" | "actual") {
  const description = source === "planned" ? record.plannedDescription : record.actualDescription;
  return record.title.trim() || description.trim() || "Sin descripción";
}

function shortDescription(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}…` : normalized;
}

function formatMetric(value: number) {
  return value.toLocaleString("es-AR");
}

type ExecutiveEngagementRow = ReportResponse["analytics"]["engagementByNetwork"][number] | ReportResponse["analytics"]["engagementByTheme"][number];

type ExecutiveEngagementTotals = ReportResponse["analytics"]["totals"] & { posts: number };
type ExecutiveMetricKey = keyof ExecutiveEngagementTotals;

const EXECUTIVE_METRIC_KEYS: ExecutiveMetricKey[] = ["posts", "reach", "engagement", "likes", "comments", "shares"];

function ExecutiveEngagementTable({ rows, dimension, totals }: { rows: ExecutiveEngagementRow[]; dimension: "network" | "theme"; totals: ExecutiveEngagementTotals }) {
  const maxima = EXECUTIVE_METRIC_KEYS.reduce<Record<ExecutiveMetricKey, number>>((result, metric) => {
    result[metric] = Math.max(0, ...rows.map((row) => row[metric]));
    return result;
  }, { posts: 0, reach: 0, engagement: 0, likes: 0, comments: 0, shares: 0 });
  const metric = (row: ExecutiveEngagementRow, key: ExecutiveMetricKey, emphasis = false) => (
    <span className={maxima[key] > 0 && row[key] === maxima[key] ? "exec-table-max" : undefined}>
      {emphasis ? <strong className="exec-engagement-value">{formatMetric(row[key])}</strong> : formatMetric(row[key])}
    </span>
  );

  return <div className="exec-performance-table-wrap">
    {!!rows.length && <div className="exec-performance-legend"><i />Mayor valor de cada columna</div>}
    <div className="exec-performance-table-scroll">
    <table className="exec-performance-table">
      <thead><tr><th>{dimension === "network" ? "Red social" : "Temática"}</th><th>Posts</th><th>Alcance</th><th>Engagement</th><th>Likes</th><th>Comentarios</th><th>Compartidos</th><th>Top post</th></tr></thead>
      <tbody>{rows.map((row) => {
        const key = dimension === "network" && "network" in row ? row.network : "theme" in row ? row.theme : "";
        const label = dimension === "network" && "network" in row ? NETWORK_LABELS[row.network] : "theme" in row ? row.theme : "Sin temática";
        return <tr key={key}>
          <td>{dimension === "network" && "network" in row ? <span className={`exec-network-label exec-network-label--${row.network}`}>{label}</span> : <strong className="exec-theme-label">{label}</strong>}</td>
          <td>{metric(row, "posts")}</td>
          <td>{metric(row, "reach")}</td>
          <td>{metric(row, "engagement", true)}</td>
          <td>{metric(row, "likes")}</td>
          <td>{metric(row, "comments")}</td>
          <td>{metric(row, "shares")}</td>
          <td>{row.topPost ? <div className="exec-top-post"><span>{shortDescription(row.topPost.description || "Publicación sin descripción")}</span><small>{row.topPost.profile} · {formatMetric(row.topPost.engagement)} engagement</small>{row.topPost.url && <a href={row.topPost.url} target="_blank" rel="noreferrer" aria-label={`Abrir top post de ${label}`}><ExternalLink size={12} /></a>}</div> : "—"}</td>
        </tr>;
      })}</tbody>
      {!!rows.length && <tfoot><tr><td>Total</td><td>{formatMetric(totals.posts)}</td><td>{formatMetric(totals.reach)}</td><td><strong>{formatMetric(totals.engagement)}</strong></td><td>{formatMetric(totals.likes)}</td><td>{formatMetric(totals.comments)}</td><td>{formatMetric(totals.shares)}</td><td>Todas las publicaciones oficiales</td></tr></tfoot>}
    </table>
    </div>
    {!rows.length && <div className="exec-performance-empty">No hay datos de engagement para esta semana.</div>}
  </div>;
}

function plannedGroupKey(record: ReportRecord) {
  return record.plannedSourceRow !== null
    ? `row-${record.plannedSourceRow}`
    : `${record.plannedDate ?? ""}|${record.title}|${record.plannedDescription}`;
}

function DetailModal({
  type,
  rows,
  plannedCandidates,
  weekLabel,
  isAllPeriod,
  onManualAssign,
  onClose,
}: {
  type: KpiDetail;
  rows: ReportRecord[];
  plannedCandidates: ReportRecord[];
  weekLabel: string;
  isAllPeriod: boolean;
  onManualAssign: (planned: ReportRecord, actual: ReportRecord) => Promise<void>;
  onClose: () => void;
}) {
  const [assignmentActual, setAssignmentActual] = useState<ReportRecord | null>(null);
  const [assignmentPlanId, setAssignmentPlanId] = useState("");
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const [unplannedNetwork, setUnplannedNetwork] = useState<ReportRecord["network"] | "all">("all");
  const title = type === "actual"
    ? "Total publicados"
    : type === "planned"
    ? "Posts planificados"
    : type === "published"
      ? "Publicados del plan"
      : type === "unpublished"
        ? "Sin publicar del plan"
        : "Publicados fuera del plan";
  const description = type === "actual"
    ? "Todos los posts oficiales publicados en el período, estén o no contemplados en el plan. Las historias están excluidas."
    : type === "planned"
    ? "Una fila por cada destino previsto de red y cuenta."
    : type === "published"
      ? "Destinos planificados que tienen una publicación real asociada."
      : type === "unpublished"
        ? "Destinos planificados para los que no se encontró una publicación real asociada."
        : "Posts oficiales que sí fueron publicados, pero no coinciden con ninguna planificación del período seleccionado.";
  const publishedGroups = useMemo(() => {
    const groups = new Map<string, ReportRecord[]>();
    rows.forEach((record) => {
      const key = plannedGroupKey(record);
      const group = groups.get(key) ?? [];
      group.push(record);
      groups.set(key, group);
    });
    return Array.from(groups.values());
  }, [rows]);
  const unplannedNetworks = useMemo(() => Array.from(new Set(rows.map((record) => record.network)))
    .sort((left, right) => NETWORK_LABELS[left].localeCompare(NETWORK_LABELS[right], "es")), [rows]);
  const filteredUnplannedRows = useMemo(() => rows.filter((record) => unplannedNetwork === "all" || record.network === unplannedNetwork), [rows, unplannedNetwork]);
  const assignmentCandidates = useMemo(() => {
    const query = assignmentQuery.toLocaleLowerCase("es").trim();
    return plannedCandidates
      .filter((record) => !query || [record.title, record.plannedDescription, record.account, record.campaign, NETWORK_LABELS[record.network]].join(" ").toLocaleLowerCase("es").includes(query))
      .sort((left, right) => Number(right.network === assignmentActual?.network) - Number(left.network === assignmentActual?.network)
        || (left.plannedDate ?? "").localeCompare(right.plannedDate ?? "")
        || left.title.localeCompare(right.title, "es")
        || left.account.localeCompare(right.account, "es"));
  }, [assignmentActual, assignmentQuery, plannedCandidates]);
  const selectedAssignmentPlan = plannedCandidates.find((record) => record.plannedId === assignmentPlanId) ?? null;
  const openAssignment = (record: ReportRecord) => {
    setAssignmentActual(record);
    setAssignmentPlanId("");
    setAssignmentQuery("");
    setAssignmentError("");
    setAssignmentNotice("");
  };
  const confirmAssignment = async () => {
    if (!assignmentActual || !selectedAssignmentPlan) return;
    setAssignmentSaving(true);
    setAssignmentError("");
    try {
      await onManualAssign(selectedAssignmentPlan, assignmentActual);
      setAssignmentNotice(`Asociación guardada: ${recordLabel(selectedAssignmentPlan, "planned")}.`);
      setAssignmentActual(null);
      setAssignmentPlanId("");
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "No se pudo guardar la asociación.");
    } finally {
      setAssignmentSaving(false);
    }
  };

  return <div className="exec-kpi-modal-backdrop" onMouseDown={onClose}>
    <section className="exec-kpi-modal" role="dialog" aria-modal="true" aria-labelledby="exec-kpi-modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="exec-kpi-modal__header">
        <div>
          <span className="eyebrow">{isAllPeriod ? "PERÍODO" : "SEMANA"} {weekLabel.toUpperCase()}</span>
          <h2 id="exec-kpi-modal-title">{title} <b>{type === "unplanned" ? filteredUnplannedRows.length : rows.length}</b></h2>
          <p>{description}</p>
        </div>
        <button type="button" className="exec-kpi-modal__close" onClick={onClose} aria-label="Cerrar detalle"><X size={18} /></button>
      </header>

      <div className="exec-kpi-modal__body">
        {rows.length === 0 ? <div className="exec-kpi-modal__empty">No hay publicaciones en este estado para el período seleccionado.</div> : type === "actual" ? (
          <div className="exec-unplanned-list exec-actual-list">
            {rows.map((record) => <article key={record.actualId ?? record.id}>
              <div className="exec-unplanned-list__meta">
                <time>{record.actualDate ? format(parseISO(record.actualDate), "dd/MM/yyyy") : "Sin fecha"}</time>
                <span className={`exec-network-tag exec-network-tag--${record.network}`}>{NETWORK_LABELS[record.network]}</span>
                <strong>{record.account || "Sin cuenta"}</strong>
              </div>
              <div className="exec-unplanned-list__copy">
                <span>PUBLICACIÓN REAL</span>
                <strong>{shortDescription(record.actualDescription || record.title || "Sin descripción")}</strong>
                {record.mediaType && <small>{record.mediaType}</small>}
              </div>
              <div className="exec-unplanned-list__action">
                <span className={record.plannedId ? "is-in-plan" : "is-outside-plan"}>{record.plannedId ? "Publicado del plan" : "Fuera del plan"}</span>
                {record.postUrl && <a href={record.postUrl} target="_blank" rel="noreferrer">Abrir post <ExternalLink size={12} /></a>}
              </div>
            </article>)}
          </div>
        ) : type === "published" ? (
          <div className="exec-published-groups">
            {publishedGroups.map((group) => {
              const planned = group[0];
              return <section className="exec-published-group" key={plannedGroupKey(planned)}>
                <header className="exec-published-group__header">
                  <div>
                    <span>POST PLANEADO</span>
                    <strong>{recordLabel(planned, "planned")}</strong>
                    {planned.plannedDescription && planned.plannedDescription.trim() !== planned.title.trim() && <small>{shortDescription(planned.plannedDescription)}</small>}
                  </div>
                  <div className="exec-published-group__summary">
                    <time>{planned.plannedDate ? format(parseISO(planned.plannedDate), "dd/MM/yyyy") : "Sin fecha"}</time>
                    <b>{group.length} {group.length === 1 ? "destino publicado" : "destinos publicados"}</b>
                  </div>
                </header>
                <div className="exec-published-list">
                  {group.map((record) => <article key={record.id}>
                    <div className="exec-published-list__meta">
                      <time>{record.actualDate ? format(parseISO(record.actualDate), "dd/MM/yyyy") : "Sin fecha"}</time>
                      <span className={`exec-network-tag exec-network-tag--${record.network}`}>{NETWORK_LABELS[record.network]}</span>
                      <strong>{record.account || "Sin cuenta"}</strong>
                    </div>
                    <div className="exec-published-list__copy">
                      <span>PUBLICADO</span>
                      <strong>{shortDescription(record.actualDescription || record.title || "Sin descripción")}</strong>
                    </div>
                    <div className="exec-published-list__result">
                      <span>{MATCH_LABELS[record.matchType]}</span>
                      {record.postUrl && <a href={record.postUrl} target="_blank" rel="noreferrer">Abrir post <ExternalLink size={12} /></a>}
                    </div>
                  </article>)}
                </div>
              </section>;
            })}
          </div>
        ) : type === "unplanned" ? (
          <div className="exec-unplanned-list">
            {assignmentNotice && <div className="exec-assignment-notice"><Check size={14} />{assignmentNotice}</div>}
            <div className="exec-unplanned-filters" aria-label="Filtros de publicaciones fuera del plan">
              <label><span>Red social</span><div><select value={unplannedNetwork} onChange={(event) => setUnplannedNetwork(event.target.value as ReportRecord["network"] | "all")}><option value="all">Todas las redes</option>{unplannedNetworks.map((network) => <option value={network} key={network}>{NETWORK_LABELS[network]}</option>)}</select><ChevronDown size={14} /></div></label>
              <small>Mostrando {filteredUnplannedRows.length} de {rows.length}</small>
            </div>
            {filteredUnplannedRows.length ? filteredUnplannedRows.map((record) => <article key={record.actualId ?? record.id}>
              <div className="exec-unplanned-list__meta">
                <time>{record.actualDate ? format(parseISO(record.actualDate), "dd/MM/yyyy") : "Sin fecha"}</time>
                <span className={`exec-network-tag exec-network-tag--${record.network}`}>{NETWORK_LABELS[record.network]}</span>
                <strong>{record.account || "Sin cuenta"}</strong>
              </div>
              <div className="exec-unplanned-list__copy">
                <span>PUBLICACIÓN REAL</span>
                <strong>{shortDescription(record.actualDescription || record.title || "Sin descripción")}</strong>
                {record.mediaType && <small>{record.mediaType}</small>}
              </div>
              <div className="exec-unplanned-list__action">
                <span>Fuera del plan</span>
                {record.postUrl && <a href={record.postUrl} target="_blank" rel="noreferrer">Abrir post <ExternalLink size={12} /></a>}
                <button type="button" onClick={() => openAssignment(record)}>Asignar al plan</button>
              </div>
            </article>) : <div className="exec-unplanned-filter-empty">No hay publicaciones que coincidan con estos filtros.</div>}
          </div>
        ) : (
          <div className="exec-kpi-table-wrap">
            <table className={`exec-kpi-table ${type === "unpublished" ? "exec-kpi-table--unpublished" : ""}`}>
              <colgroup><col className="exec-kpi-col--date" /><col className="exec-kpi-col--post" /><col className="exec-kpi-col--destination" /><col className="exec-kpi-col--theme" /><col className="exec-kpi-col--status" /></colgroup>
              <thead><tr><th>Fecha</th><th>Post planeado</th><th>Destino</th><th>Temática</th><th>Estado</th></tr></thead>
              <tbody>{rows.map((record, index) => <tr className={`${index === 0 || plannedGroupKey(rows[index - 1]) !== plannedGroupKey(record) ? "is-group-start" : ""} ${type === "planned" ? record.actualId ? "is-published" : "is-unpublished" : "is-unpublished"}`} key={record.id}>
                <td className="exec-kpi-date"><time>{record.plannedDate ? format(parseISO(record.plannedDate), "dd/MM/yyyy") : "Sin fecha"}</time></td>
                <td className="exec-kpi-post"><strong>{recordLabel(record, "planned")}</strong>{record.plannedDescription && record.plannedDescription.trim() !== record.title.trim() && <small>{shortDescription(record.plannedDescription)}</small>}</td>
                <td><div className="exec-kpi-destination"><span className={`exec-network-tag exec-network-tag--${record.network}`}>{NETWORK_LABELS[record.network]}</span><strong>{record.account || "Sin cuenta"}</strong></div></td>
                <td className="exec-kpi-theme">{record.campaign || "Sin temática"}</td>
                <td>{record.actualId ? <span className="exec-published-tag">Publicado</span> : <span className="exec-unpublished-tag">Sin publicar</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      {assignmentActual && <div className="exec-assignment-overlay">
        <section className="exec-assignment-panel" aria-label="Asignar publicación al plan">
          <header>
            <div><span className="eyebrow">ASOCIACIÓN MANUAL</span><h3>Asignar publicación al plan</h3><p>Elegí un destino pendiente y confirmá la relación.</p></div>
            <button type="button" onClick={() => setAssignmentActual(null)} aria-label="Cancelar asignación"><X size={17} /></button>
          </header>
          <div className="exec-assignment-panel__body">
            <div className="exec-assignment-actual">
              <span>PUBLICADO REALMENTE</span>
              <div><strong>{NETWORK_LABELS[assignmentActual.network]} · {assignmentActual.account || "Sin cuenta"}</strong><time>{assignmentActual.actualDate ? format(parseISO(assignmentActual.actualDate), "dd/MM/yyyy") : "Sin fecha"}</time></div>
              <p>{assignmentActual.actualDescription || "Sin descripción publicada"}</p>
              {assignmentActual.postUrl && <a href={assignmentActual.postUrl} target="_blank" rel="noreferrer">Abrir post <ExternalLink size={12} /></a>}
            </div>

            <label className="exec-assignment-search"><Search size={15} /><input value={assignmentQuery} onChange={(event) => setAssignmentQuery(event.target.value)} placeholder="Buscar por título, copy, red o cuenta…" /></label>
            <div className="exec-assignment-candidates" aria-label="Posts planificados pendientes">
              {assignmentCandidates.length ? assignmentCandidates.map((record) => <button type="button" className={assignmentPlanId === record.plannedId ? "is-selected" : ""} onClick={() => setAssignmentPlanId(record.plannedId ?? "")} key={record.id}>
                <span className={`exec-network-tag exec-network-tag--${record.network}`}>{NETWORK_LABELS[record.network]}</span>
                <span><strong>{recordLabel(record, "planned")}</strong><small>{record.plannedDate ? format(parseISO(record.plannedDate), "dd/MM/yyyy") : "Sin fecha"} · {record.account || "Sin cuenta"}</small><p>{shortDescription(record.plannedDescription)}</p></span>
                <i>{assignmentPlanId === record.plannedId && <Check size={14} />}</i>
              </button>) : <p className="exec-assignment-empty">No hay pendientes que coincidan con la búsqueda.</p>}
            </div>

            {selectedAssignmentPlan && <div className="exec-assignment-compare">
              <div><span>PLANEADO</span><strong>{recordLabel(selectedAssignmentPlan, "planned")}</strong><p>{selectedAssignmentPlan.plannedDescription || "Sin copy planificado"}</p></div>
              <div><span>PUBLICADO</span><strong>{NETWORK_LABELS[assignmentActual.network]} · {assignmentActual.account}</strong><p>{assignmentActual.actualDescription || "Sin descripción publicada"}</p></div>
            </div>}
            {assignmentError && <div className="exec-assignment-error"><AlertTriangle size={14} />{assignmentError}</div>}
          </div>
          <footer><button type="button" className="button button--ghost" onClick={() => setAssignmentActual(null)} disabled={assignmentSaving}>Cancelar</button><button type="button" className="button button--primary" onClick={() => void confirmAssignment()} disabled={!selectedAssignmentPlan || assignmentSaving}>{assignmentSaving ? <><LoaderCircle size={14} className="spin" />Guardando…</> : <><Check size={14} />Confirmar asociación</>}</button></footer>
        </section>
      </div>}
    </section>
  </div>;
}

function DailyComparisonTooltip({ active, label, payload }: { active?: boolean; label?: string; payload?: Array<{ payload?: { planned: number; realized: number; realizedPlanned: number; realizedUnplanned: number } }> }) {
  const point = payload?.[0]?.payload;
  if (!active || !label || !point) return null;
  const difference = point.realized - point.planned;
  return <div className="exec-chart-tooltip">
    <strong>{format(parseISO(label), "EEEE d 'de' MMMM", { locale: es })}</strong>
    <span><i className="is-planned" />Programados <b>{point.planned}</b></span>
    <span><i className="is-realized-planned" />Realizados del plan <b>{point.realizedPlanned}</b></span>
    <span><i className="is-realized-unplanned" />Fuera del plan <b>{point.realizedUnplanned}</b></span>
    <span className="is-total">Total realizados <b>{point.realized}</b></span>
    <small>{difference === 0 ? "Misma cantidad" : difference > 0 ? `${difference} realizados más que programados` : `${Math.abs(difference)} realizados menos que programados`}</small>
    <em>Hacé clic para comparar los posts</em>
  </div>;
}

export default function ExecutiveApp() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [activeKpi, setActiveKpi] = useState<KpiDetail | null>(null);

  const loadReport = async (week?: string, force = false) => {
    if (force || report) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (week) params.set("week", week);
      if (force) params.set("refresh", "true");
      const body = await fetchJson<ReportResponse>(`/api/report${params.size ? `?${params}` : ""}`);
      setReport(body);
      setActiveKpi(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la semana");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void loadReport(); }, []);

  const decideReview = async (_record: ReportRecord, actualId: string, decision: ManualReviewValue) => {
    if (!_record.plannedId) throw new Error("La publicación planeada no tiene identificador.");
    const body = await fetchJson<ReportResponse>("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannedId: _record.plannedId, actualId, decision, week: report?.window.isAll ? "all" : report?.window.to }),
    });
    setReport(body);
  };

  const summary = useMemo(() => summarizePlannedContent(report?.records ?? []), [report]);
  const unpublishedTargets = summary.plannedTargets - summary.matchedTargets;
  const timeline = useMemo(() => report ? buildDailyTimeline(report.records, report.window.from, report.window.to) : [], [report]);
  const plannedRows = useMemo(() => (report?.records ?? [])
    .filter((record) => Boolean(record.plannedId))
    .sort((a, b) => {
      const dateComparison = (a.plannedDate ?? "").localeCompare(b.plannedDate ?? "");
      if (dateComparison !== 0) return dateComparison;
      const rowComparison = (a.plannedSourceRow ?? Number.MAX_SAFE_INTEGER) - (b.plannedSourceRow ?? Number.MAX_SAFE_INTEGER);
      if (rowComparison !== 0) return rowComparison;
      const titleComparison = a.title.localeCompare(b.title, "es");
      if (titleComparison !== 0) return titleComparison;
      return `${a.network}|${a.account}`.localeCompare(`${b.network}|${b.account}`, "es");
    }), [report]);
  const publishedRows = useMemo(() => plannedRows.filter((record) => Boolean(record.actualId)), [plannedRows]);
  const unpublishedRows = useMemo(() => plannedRows.filter((record) => !record.actualId), [plannedRows]);
  const unplannedRows = useMemo(() => (report?.records ?? [])
    .filter((record) => !record.plannedId && Boolean(record.actualId) && record.status === "no_planificada" && !record.deleted)
    .sort((a, b) => `${a.actualDate ?? ""}|${a.network}|${a.account}|${a.actualDescription}`.localeCompare(`${b.actualDate ?? ""}|${b.network}|${b.account}|${b.actualDescription}`, "es")), [report]);
  const actualRows = useMemo(() => {
    const records = new Map<string, ReportRecord>();
    for (const record of report?.records ?? []) {
      if (!record.actualId) continue;
      const current = records.get(record.actualId);
      if (!current || (!current.plannedId && record.plannedId)) records.set(record.actualId, record);
    }
    return [...records.values()].sort((a, b) => `${a.actualDate ?? ""}|${a.network}|${a.account}|${a.actualDescription}`.localeCompare(`${b.actualDate ?? ""}|${b.network}|${b.account}|${b.actualDescription}`, "es"));
  }, [report]);
  const realizedFromPlan = Math.max(0, (report?.metrics.actual ?? 0) - (report?.metrics.unplanned ?? 0));

  useEffect(() => {
    if (!activeKpi) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setActiveKpi(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeKpi]);

  if (loading) return <main className="state-screen"><div className="loader-orbit"><LoaderCircle size={28} /></div><h1>Preparando la vista ejecutiva</h1><p>Estamos revisando qué publicaciones planeadas se realizaron.</p></main>;
  if (!report) return <main className="state-screen"><AlertTriangle size={36} /><h1>No se pudo cargar el informe</h1><p>{error}</p><button className="button button--primary" onClick={() => void loadReport()}>Reintentar</button></main>;

  return (
    <div className="exec-shell">
      <header className="exec-topbar">
        <a className="brand" href="/"><span className="brand__mark"><Sparkles size={18} /></span><div><strong>Ejecución de publicaciones</strong><span>Vista ejecutiva</span></div></a>
        <nav className="exec-nav" aria-label="Vistas del informe"><a className="exec-nav__active" href="/">Ejecutiva</a><a href="/analitico">Analítica</a></nav>
        <button className="button button--ghost" onClick={() => void loadReport(report.window.isAll ? "all" : report.window.to, true)} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""} /><span>Actualizar</span></button>
      </header>

      <main className="exec-main">
        <section className="exec-heading">
          <div><span className="exec-official-heading">{report.window.isAll ? "RESUMEN ACUMULADO" : "RESUMEN SEMANAL"} · CUENTAS <strong>OFICIALES</strong></span><h1>Plan vs. Publicado</h1><p>Una lectura simple de los posts planeados y su ejecución en cada red.</p></div>
          <label className="exec-week"><span>Semana</span><div><CalendarDays size={18} /><select value={report.window.isAll ? "all" : report.window.to} onChange={(event) => void loadReport(event.target.value)} disabled={refreshing}><option value="all">TODAS LAS SEMANAS</option>{report.availableWeeks.map((week) => <option value={week.value} key={week.value}>Semana del {week.label}{week.isCurrent ? " · En curso" : ""}</option>)}</select><ChevronDown size={16} /></div>{report.window.isAll ? <small>Todos los datos disponibles · {report.window.label}</small> : report.window.isCurrent && <small>Datos al {format(parseISO(report.window.dataThrough), "d MMM", { locale: es })} · lo futuro no penaliza</small>}</label>
        </section>

        {error && <div className="exec-alert"><AlertTriangle size={17} /><span>{error}</span></div>}

        <section className="exec-numbered-section exec-numbered-section--primary" aria-labelledby="exec-section-01">
          <header className="exec-numbered-section__header"><span>01</span><div><span className="eyebrow">{report.window.isAll ? "CUMPLIMIENTO ACUMULADO" : "CUMPLIMIENTO SEMANAL"}</span><h2 id="exec-section-01">Planificación y ejecución</h2><p>Qué se planificó, qué se publicó y qué quedó fuera del plan.</p></div></header>

          <section className="exec-summary" aria-label="Resumen de cumplimiento">
          <div className="exec-summary__kpi exec-summary__actual"><button type="button" className="exec-kpi-trigger" onClick={() => setActiveKpi("actual")} aria-haspopup="dialog"><span>Total publicados</span><strong>{report.metrics.actual}</strong><small>Todos los posts oficiales, dentro o fuera del plan</small><em>Ver detalle</em></button></div>
          <div className="exec-summary__kpi"><button type="button" className="exec-kpi-trigger" onClick={() => setActiveKpi("planned")} aria-haspopup="dialog"><span>Posts planificados</span><strong>{summary.plannedTargets}</strong><small>Destinos previstos por red y cuenta</small><em>Ver detalle</em></button></div>
          <div className="exec-summary__kpi exec-summary__done"><button type="button" className="exec-kpi-trigger" onClick={() => setActiveKpi("published")} aria-haspopup="dialog"><span>Publicados del plan</span><strong>{summary.matchedTargets}</strong><small>Destinos con una publicación asociada</small><em>Ver detalle</em></button></div>
          <div className="exec-summary__kpi exec-summary__missing"><button type="button" className="exec-kpi-trigger" onClick={() => setActiveKpi("unpublished")} aria-haspopup="dialog"><span>Sin publicar del plan</span><strong>{unpublishedTargets}</strong><small>Destinos sin una publicación asociada</small><em>Ver detalle</em></button></div>
          </section>

          <button type="button" className="exec-unplanned-access" onClick={() => setActiveKpi("unplanned")} aria-haspopup="dialog">
            <span className="exec-unplanned-access__icon"><Unlink size={17} /></span>
            <span className="exec-unplanned-access__copy"><strong>Publicados fuera del plan</strong><small>Posts reales de la semana que no coinciden con ninguna planificación.</small></span>
            <b>{unplannedRows.length}</b>
            <ChevronRight size={17} />
          </button>

          <section className="exec-chart-card">
            <header><div><span className="eyebrow">COMPARATIVA DIARIA</span><h2>Posts programados frente a realizados</h2><p>La barra de realizados separa lo publicado del plan y lo publicado fuera del plan. {report.window.isAll ? `Datos disponibles del ${report.window.label}.` : report.window.isCurrent ? `Datos hasta el ${format(parseISO(report.window.dataThrough), "d 'de' MMMM", { locale: es })}.` : "Semana completa."} Hacé clic en un día para ver el detalle.</p></div><div className="exec-chart-totals"><span><i className="is-planned" />Programados <strong>{summary.plannedTargets}</strong></span><span><i className="is-realized-planned" />Del plan <strong>{realizedFromPlan}</strong></span><span><i className="is-realized-unplanned" />Fuera del plan <strong>{report.metrics.unplanned}</strong></span></div></header>
            <div className="exec-chart-body">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={timeline} barCategoryGap="30%" barGap={5} margin={{ top: 25, right: 8, bottom: 0, left: -18 }} onClick={(state) => { const day = (state as { activeLabel?: string } | null)?.activeLabel; if (day) setSelectedDay(day); }}>
                <CartesianGrid stroke="#e9edf3" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="key" tickFormatter={(_value, index) => timeline[index]?.label ?? ""} tickLine={false} axisLine={{ stroke: "#cbd3df" }} tick={{ fill: "#526078", fontSize: 11, fontWeight: 650 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#7a8598", fontSize: 10 }} />
                <Tooltip cursor={{ fill: "#f4f7fb" }} content={<DailyComparisonTooltip />} />
                <Bar isAnimationActive={false} name="Programados" dataKey="planned" fill={CHART_COLORS.planned} radius={[6, 6, 0, 0]} maxBarSize={32}>
                  <LabelList dataKey="planned" position="top" fill="#44526a" fontSize={10} fontWeight={750} formatter={(value) => Number(value) ? value : ""} />
                </Bar>
                <Bar isAnimationActive={false} name="Realizados del plan" dataKey="realizedPlanned" stackId="realized" fill={CHART_COLORS.realizedPlanned} maxBarSize={32} />
                <Bar isAnimationActive={false} name="Fuera del plan" dataKey="realizedUnplanned" stackId="realized" fill={CHART_COLORS.realizedUnplanned} radius={[6, 6, 0, 0]} maxBarSize={32}>
                  <LabelList dataKey="realized" position="top" fill="#6d551e" fontSize={10} fontWeight={750} formatter={(value) => Number(value) ? value : ""} />
                </Bar>
              </BarChart></ResponsiveContainer>
            </div>
          </section>
        </section>

        <section className="exec-numbered-section" aria-labelledby="exec-section-02">
          <header className="exec-numbered-section__header"><span>02</span><div><span className="eyebrow">IMPACTO POR CANAL</span><h2 id="exec-section-02">Engagement por red social</h2><p>Rendimiento de todas las publicaciones oficiales realizadas durante el período seleccionado.</p></div></header>
          <ExecutiveEngagementTable rows={report.analytics.engagementByNetwork} dimension="network" totals={{ posts: report.metrics.actual, ...report.analytics.totals }} />
        </section>

        <section className="exec-numbered-section" aria-labelledby="exec-section-03">
          <header className="exec-numbered-section__header"><span>03</span><div><span className="eyebrow">IMPACTO POR CONTENIDO</span><h2 id="exec-section-03">Engagement por temática</h2><p>Temáticas publicadas ordenadas por engagement total y su post con mayor impacto.</p></div></header>
          <ExecutiveEngagementTable rows={report.analytics.engagementByTheme} dimension="theme" totals={{ posts: report.metrics.actual, ...report.analytics.totals }} />
        </section>

        <section className="exec-numbered-section exec-numbered-section--impact" aria-labelledby="exec-section-04">
          <header className="exec-numbered-section__header"><span>04</span><div><span className="eyebrow">{report.window.isAll ? "CIERRE ACUMULADO" : "CIERRE SEMANAL"}</span><h2 id="exec-section-04">Resumen de impacto</h2><p>Indicadores acumulados de todas las publicaciones oficiales realizadas en el período seleccionado.</p></div></header>
          <section className="insight-strip exec-impact-strip" aria-label={report.window.isAll ? "Impacto acumulado en cuentas oficiales" : "Impacto de la semana en cuentas oficiales"}>
            <div className="insight-strip__intro"><span className="eyebrow">INSIGHTS · CUENTAS OFICIALES</span><strong>{report.window.isAll ? "Impacto acumulado" : "Impacto de la semana"}</strong><small>Alcance = suma de impresiones; engagement = métrica registrada por publicación.</small></div>
            <div><span>Alcance</span><strong>{formatMetric(report.analytics.totals.reach)}</strong></div>
            <div><span>Engagement</span><strong>{formatMetric(report.analytics.totals.engagement)}</strong></div>
            <div><span>Likes</span><strong>{formatMetric(report.analytics.totals.likes)}</strong></div>
            <div><span>Comentarios</span><strong>{formatMetric(report.analytics.totals.comments)}</strong></div>
            <div><span>Compartidos</span><strong>{formatMetric(report.analytics.totals.shares)}</strong></div>
          </section>
        </section>

        <UpcomingSection upcoming={report.upcoming} />
      </main>
      {selectedDay && <DayComparisonDrawer day={selectedDay} records={report.records} onReviewDecision={decideReview} onClose={() => setSelectedDay(null)} />}
      {activeKpi && <DetailModal
        type={activeKpi}
        rows={activeKpi === "actual" ? actualRows : activeKpi === "planned" ? plannedRows : activeKpi === "published" ? publishedRows : activeKpi === "unpublished" ? unpublishedRows : unplannedRows}
        plannedCandidates={unpublishedRows}
        weekLabel={report.window.label}
        isAllPeriod={report.window.isAll}
        onManualAssign={async (planned, actual) => {
          if (!actual.actualId) throw new Error("La publicación real no tiene identificador.");
          await decideReview(planned, actual.actualId, "approved");
        }}
        onClose={() => setActiveKpi(null)}
      />}
    </div>
  );
}
