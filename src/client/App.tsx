import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FileWarning,
  FilterX,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { ComplianceStatus, MatchType, ReportMetrics, ReportRecord, ReportResponse } from "../shared/types";
import { fetchJson } from "./api";
import { summarizePlannedContent } from "./contentSummary";
import { buildDailyTimeline } from "./dailyTimeline";
import UpcomingSection from "./UpcomingSection";

const COLORS = {
  navy: "#101b36",
  blue: "#2563eb",
  blueLight: "#93b4f6",
  gold: "#c99018",
  orange: "#dd6b35",
  pink: "#cc4770",
  olive: "#0f9d8a",
  review: "#a36b18",
  gray: "#7c879a",
  planned: "#52627d",
  realized: "#0f9d8a",
  pale: "#e8edf6",
};

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  segun_plan: "Según lo planificado",
  anticipada: "Anticipada",
  demorada: "Demorada",
  modificada: "Con modificaciones",
  no_publicada: "No publicada",
  no_planificada: "No planificada",
  coincidencia_dudosa: "Coincidencia dudosa",
  datos_incompletos: "Sin evidencia",
};

const MATCH_LABELS: Record<MatchType, string> = {
  exacta: "Exacta",
  por_url: "Por enlace",
  por_titulo: "Por título",
  aproximada: "Aproximada",
  dudosa: "Dudosa",
  sin_coincidencia: "Sin coincidencia",
  no_aplica: "No aplica",
};

const NETWORK_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X",
  otro: "Otra",
};

const formatDate = (date: string | null) => date ? format(parseISO(date), "dd MMM yy", { locale: es }) : "—";
const formatPct = (value: number) => `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
const formatNumber = (value: number) => value.toLocaleString("es-AR");
const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const pct = (part: number, total: number) => total ? round(part / total * 100) : 0;

function calculateMetrics(records: ReportRecord[]): ReportMetrics {
  const planned = records.filter((record) => record.plannedId);
  const matched = planned.filter((record) => record.actualId);
  const actualIds = new Set(records.flatMap((record) => record.actualId ? [record.actualId] : record.alternativeCandidates.map((candidate) => candidate.actualId)));
  const exact = planned.filter((record) => record.matchType === "exacta").length;
  const byUrl = planned.filter((record) => record.matchType === "por_url").length;
  const byTitle = planned.filter((record) => record.matchType === "por_titulo").length;
  const approximate = planned.filter((record) => record.matchType === "aproximada").length;
  const modified = planned.filter((record) => record.status === "modificada").length;
  const diffs = matched.map((record) => record.dayDifference).filter((value): value is number => value !== null);
  return {
    planned: planned.length,
    actual: actualIds.size,
    matched: matched.length,
    exact,
    byUrl,
    byTitle,
    approximate,
    onTime: matched.filter((record) => record.temporalStatus === "en_fecha").length,
    withinTolerance: matched.filter((record) => record.temporalStatus === "dentro_tolerancia").length,
    early: matched.filter((record) => record.temporalStatus === "anticipada").length,
    delayed: matched.filter((record) => record.temporalStatus === "demorada").length,
    notPublished: planned.filter((record) => ["no_publicada", "datos_incompletos"].includes(record.status)).length,
    unplanned: records.filter((record) => record.status === "no_planificada").length,
    doubtful: planned.filter((record) => record.status === "coincidencia_dudosa").length,
    incomplete: planned.filter((record) => record.status === "datos_incompletos").length,
    modified,
    compliancePct: pct(matched.length, planned.length),
    exactCompliancePct: pct(exact, planned.length),
    exactOnTimePct: pct(planned.filter((record) => record.matchType === "exacta" && record.temporalStatus === "en_fecha").length, planned.length),
    modifiedPct: pct(modified, planned.length),
    averageDayDeviation: diffs.length ? round(diffs.reduce((sum, value) => sum + Math.abs(value), 0) / diffs.length, 2) : null,
  };
}

type Filters = {
  from: string;
  to: string;
  network: string;
  account: string;
  campaign: string;
  status: string;
  matchType: string;
  minSimilarity: number;
};

const emptyFilters: Filters = { from: "", to: "", network: "", account: "", campaign: "", status: "", matchType: "", minSimilarity: 0 };

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv(records: ReportRecord[]) {
  const header = ["Fecha planificada", "Fecha real", "Diferencia días", "Descripción planificada", "Descripción publicada", "Normalizada plan", "Normalizada real", "Coincidencia", "Similitud", "Estado", "Red", "Cuenta", "Campaña", "URL", "Observaciones", "Revisión manual"];
  const rows = records.map((record) => [record.plannedDate, record.actualDate, record.dayDifference, record.plannedDescription, record.actualDescription, record.plannedNormalized, record.actualNormalized, MATCH_LABELS[record.matchType], record.similarity === null ? "" : round(record.similarity * 100, 2), STATUS_LABELS[record.status], NETWORK_LABELS[record.network], record.account, record.campaign, record.postUrl, record.observations.join(" | "), record.manualReview ? "Sí" : "No"]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cumplimiento-publicaciones-${format(new Date(), "yyyy-MM-dd")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  return <span className={`status status--${status}`}><span className="status__dot" />{STATUS_LABELS[status]}</span>;
}

function KpiCard({ label, value, note, tone = "blue", icon }: { label: string; value: string | number; note: string; tone?: string; icon: React.ReactNode }) {
  return (
    <article className={`kpi kpi--${tone}`}>
      <div className="kpi__top"><span className="kpi__label">{label}</span><span className="kpi__icon">{icon}</span></div>
      <strong>{value}</strong>
      <span className="kpi__note">{note}</span>
    </article>
  );
}

function ChartCard({ title, subtitle, className = "", children }: { title: string; subtitle: string; className?: string; children: React.ReactNode }) {
  return <article className={`chart-card ${className}`}><header><h3>{title}</h3><p>{subtitle}</p></header><div className="chart-card__body">{children}</div></article>;
}

function EmptyChart() {
  return <div className="empty-chart"><SlidersHorizontal size={22} /><span>No hay datos para estos filtros.</span></div>;
}

function DetailDrawer({ record, onClose }: { record: ReportRecord; onClose: () => void }) {
  return (
    <div className="drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Detalle de publicación">
        <header className="drawer__header">
          <div><span className="eyebrow">TRAZABILIDAD DEL REGISTRO</span><h2>{record.title || "Detalle de publicación"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className="drawer__content">
          <div className="drawer__status"><StatusBadge status={record.status} />{record.manualReview && <span className="review-chip"><Eye size={14} /> Revisión manual</span>}</div>
      <dl className="trace-grid">
            <div><dt>Fecha planificada</dt><dd>{formatDate(record.plannedDate)}</dd></div>
            <div><dt>Fecha real</dt><dd>{formatDate(record.actualDate)}</dd></div>
            <div><dt>Diferencia</dt><dd>{record.dayDifference === null ? "—" : `${record.dayDifference > 0 ? "+" : ""}${record.dayDifference} días`}</dd></div>
            <div><dt>Similitud</dt><dd>{record.similarity === null ? "—" : formatPct(record.similarity * 100)}</dd></div>
            <div><dt>Red</dt><dd>{NETWORK_LABELS[record.network]}</dd></div>
            <div><dt>Cuenta</dt><dd>{record.account || "—"}</dd></div>
            <div className="trace-grid__wide"><dt>Campaña / temática</dt><dd>{record.campaign}</dd></div>
            {record.actualId && <><div><dt>Alcance</dt><dd>{formatNumber(record.reach)}</dd></div><div><dt>Engagement</dt><dd>{formatNumber(record.engagement)}</dd></div><div><dt>Interacciones</dt><dd>{formatNumber(record.likes)} likes · {formatNumber(record.comments)} comentarios · {formatNumber(record.shares)} compartidos</dd></div></>}
          </dl>
          <section className="copy-compare">
            <div><span>PLANIFICADO</span><p>{record.plannedDescription || "Sin descripción"}</p><small>{record.plannedNormalized || "Sin texto normalizado"}</small></div>
            <div><span>PUBLICADO</span><p>{record.actualDescription || "Sin publicación asociada"}</p><small>{record.actualNormalized || "Sin texto normalizado"}</small></div>
          </section>
          {record.differences && <section className="drawer-section"><h3>Diferencias detectadas</h3><ul>{record.differences.summary.map((item) => <li key={item}>{item}</li>)}</ul></section>}
          {record.alternativeCandidates.length > 0 && <section className="drawer-section"><h3>Candidatos para revisión</h3><div className="candidate-list">{record.alternativeCandidates.map((candidate) => <div key={candidate.actualId}><strong>{formatPct(candidate.similarity * 100)}</strong><span>{formatDate(candidate.date)} · {NETWORK_LABELS[candidate.network]}</span><p>{candidate.description}</p></div>)}</div></section>}
          <section className="drawer-section"><h3>Observaciones</h3><ul>{record.observations.map((observation) => <li key={observation}>{observation}</li>)}</ul></section>
          {record.postUrl && <a className="post-link" href={record.postUrl} target="_blank" rel="noreferrer"><Link2 size={16} /> Abrir publicación real <ExternalLink size={14} /></a>}
          <div className="source-note"><span>IDs de origen</span><code>{record.plannedId ?? "sin-plan"} · {record.actualId ?? "sin-asignar"}</code></div>
        </div>
      </aside>
    </div>
  );
}

function App() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: keyof ReportRecord; direction: "asc" | "desc" }>({ key: "plannedDate", direction: "desc" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReportRecord | null>(null);
  const [engagementNetwork, setEngagementNetwork] = useState("");
  const pageSize = 12;

  const loadReport = async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const body = await fetchJson<ReportResponse>(`/api/report${force ? "?refresh=true" : ""}`);
      setReport(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el informe");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void loadReport(); }, []);

  const options = useMemo(() => {
    const records = report?.records ?? [];
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    return {
      networks: unique(records.map((record) => record.network)),
      accounts: unique(records.map((record) => record.account)),
      campaigns: unique(records.map((record) => record.campaign)),
    };
  }, [report]);

  const filtered = useMemo(() => (report?.records ?? []).filter((record) => {
    const date = record.plannedDate ?? record.actualDate ?? "";
    if (filters.from && date < filters.from) return false;
    if (filters.to && date > filters.to) return false;
    if (filters.network && record.network !== filters.network) return false;
    if (filters.account && record.account !== filters.account) return false;
    if (filters.campaign && record.campaign !== filters.campaign) return false;
    if (filters.status && record.status !== filters.status) return false;
    if (filters.matchType && record.matchType !== filters.matchType) return false;
    if (filters.minSimilarity > 0 && (record.similarity === null || record.similarity * 100 < filters.minSimilarity)) return false;
    return true;
  }), [report, filters]);

  const metrics = useMemo(() => calculateMetrics(filtered), [filtered]);
  const contentSummary = useMemo(() => summarizePlannedContent(report?.records ?? []), [report]);
  const exactOnTimeCount = filtered.filter((record) => record.plannedId && record.matchType === "exacta" && record.temporalStatus === "en_fecha").length;
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key === "minSimilarity" ? Number(value) > 0 : Boolean(value)).length;

  const timeline = useMemo(() => report ? buildDailyTimeline(filtered, report.window.from, report.window.to) : [], [filtered, report]);

  const complianceData = [
    { name: "Cumplidas", value: metrics.matched, color: COLORS.blue },
    { name: "No publicadas", value: metrics.notPublished, color: COLORS.pink },
    { name: "Dudosas", value: metrics.doubtful, color: COLORS.review },
  ].filter((item) => item.value > 0);
  const timingData = [
    { name: "En fecha", value: metrics.onTime, color: COLORS.blue },
    { name: "Tolerancia", value: metrics.withinTolerance, color: COLORS.blueLight },
    { name: "Anticipadas", value: metrics.early, color: COLORS.gold },
    { name: "Demoradas", value: metrics.delayed, color: COLORS.orange },
  ];
  const matchData = [
    { name: "Exactas", value: metrics.exact, color: COLORS.blue },
    { name: "Por enlace", value: metrics.byUrl, color: COLORS.olive },
    { name: "Por título", value: metrics.byTitle, color: COLORS.blueLight },
    { name: "Aproximadas", value: metrics.approximate, color: COLORS.orange },
    { name: "Dudosas", value: metrics.doubtful, color: COLORS.review },
  ].filter((item) => item.value > 0);

  const postsByNetwork = report?.analytics.postsByNetwork ?? [];
  const reportThemes = report?.analytics.themes ?? [];
  const engagementMetrics = report?.analytics.engagementByThemeNetwork ?? [];
  const networkData = useMemo(() => postsByNetwork
    .filter((row) => !filters.network || row.network === filters.network)
    .map((row) => ({ network: NETWORK_LABELS[row.network], planificadas: row.planned, realizadas: row.posted, asociadas: row.matched }))
    .sort((a, b) => b.planificadas + b.realizadas - (a.planificadas + a.realizadas)), [postsByNetwork, filters.network]);

  const themeData = useMemo(() => reportThemes.slice(0, 9), [reportThemes]);
  const engagementRows = useMemo(() => engagementMetrics
    .filter((row) => !engagementNetwork || row.network === engagementNetwork)
    .map((row) => ({ ...row, chartLabel: engagementNetwork ? row.theme : `${row.theme} · ${NETWORK_LABELS[row.network]}` }))
    .slice(0, 10), [engagementMetrics, engagementNetwork]);

  const tableRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    const rows = filtered.filter((record) => !term || [record.title, record.plannedDescription, record.actualDescription, record.account, record.campaign, record.postUrl].some((value) => value.toLocaleLowerCase("es").includes(term)));
    return [...rows].sort((left, right) => {
      const a = left[sort.key] ?? "";
      const b = right[sort.key] ?? "";
      const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es");
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [filtered, search, sort]);
  const pages = Math.max(1, Math.ceil(tableRows.length / pageSize));
  const visibleRows = tableRows.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [filters, search]);

  const changeSort = (key: keyof ReportRecord) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));

  if (loading) return <main className="state-screen"><div className="loader-orbit"><LoaderCircle size={28} /></div><h1>Preparando el informe</h1><p>Estamos cruzando la planificación con las publicaciones reales.</p></main>;
  if (error || !report) return <main className="state-screen"><AlertTriangle size={36} /><h1>No se pudo cargar el informe</h1><p>{error}</p><button className="button button--primary" onClick={() => void loadReport()}>Reintentar</button></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="analytics-view-link" href="/analitico">Vista analítica</a>
        <div className="brand"><span className="brand__mark"><Sparkles size={18} /></span><div><strong>Ejecución de publicaciones</strong><span>Cuentas oficiales · corte semanal</span></div></div>
        <div className="topbar__meta"><span>Actualizado {format(new Date(report.generatedAt), "dd MMM · HH:mm", { locale: es })}</span><button className="button button--ghost" onClick={() => void loadReport(true)} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""} /> Actualizar</button></div>
      </header>

      <main>
        <section className="hero">
          <div><span className="eyebrow">INFORME SEMANAL · PRESENTACIÓN LOS MARTES</span><h1>Plan vs. publicado</h1><p>{report.window.isCurrent ? "Semana en curso" : "Semana analizada"}: <strong>{report.window.label}</strong>{report.window.isCurrent ? ` · datos al ${format(parseISO(report.window.dataThrough), "d MMM", { locale: es })}` : " · cierre del domingo a las 23:59"}.</p><span className="week-rule"><CalendarDays size={14} /> {report.window.rule}</span></div>
          <div className="hero__score"><span>COBERTURA DE DESTINOS</span><strong>{formatPct(metrics.compliancePct)}</strong><small>{metrics.matched} de {metrics.planned} destinos por red y cuenta</small></div>
        </section>

        <section className="filter-panel">
          <div className="filter-panel__title"><div><SlidersHorizontal size={17} /><strong>Filtros</strong>{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</div>{activeFilterCount > 0 && <button onClick={() => setFilters(emptyFilters)}><FilterX size={15} /> Limpiar</button>}</div>
          <div className="filters-grid">
            <label><span>Desde</span><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
            <label><span>Hasta</span><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
            <label><span>Red social</span><div className="select-wrap"><select value={filters.network} onChange={(event) => setFilters({ ...filters, network: event.target.value })}><option value="">Todas</option>{options.networks.map((network) => <option value={network} key={network}>{NETWORK_LABELS[network]}</option>)}</select><ChevronDown size={14} /></div></label>
            <label><span>Cuenta / perfil</span><div className="select-wrap"><select value={filters.account} onChange={(event) => setFilters({ ...filters, account: event.target.value })}><option value="">Todas</option>{options.accounts.map((account) => <option value={account} key={account}>{account}</option>)}</select><ChevronDown size={14} /></div></label>
            <label><span>Campaña / temática</span><div className="select-wrap"><select value={filters.campaign} onChange={(event) => setFilters({ ...filters, campaign: event.target.value })}><option value="">Todas</option>{options.campaigns.map((campaign) => <option value={campaign} key={campaign}>{campaign}</option>)}</select><ChevronDown size={14} /></div></label>
            <label><span>Estado</span><div className="select-wrap"><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><ChevronDown size={14} /></div></label>
            <label><span>Coincidencia</span><div className="select-wrap"><select value={filters.matchType} onChange={(event) => setFilters({ ...filters, matchType: event.target.value })}><option value="">Todas</option>{Object.entries(MATCH_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><ChevronDown size={14} /></div></label>
            <label className="range-filter"><span>Similitud mínima <b>{filters.minSimilarity}%</b></span><input type="range" min="0" max="100" step="5" value={filters.minSimilarity} onChange={(event) => setFilters({ ...filters, minSimilarity: Number(event.target.value) })} /></label>
          </div>
        </section>

        <section className="grain-bridge" aria-label="Reconciliación entre vista ejecutiva y analítica">
          <div><span>LECTURA EJECUTIVA · POR CONTENIDO</span><strong>{contentSummary.plannedContents} planificados</strong><small>{contentSummary.publishedContents} publicados · {contentSummary.unpublishedContents} no publicados</small></div>
          <div className="grain-bridge__arrow">→</div>
          <div><span>LECTURA ANALÍTICA · POR RED Y CUENTA</span><strong>{contentSummary.plannedTargets} destinos</strong><small>{contentSummary.matchedTargets} asociados · {contentSummary.plannedTargets - contentSummary.matchedTargets} sin asociación automática</small></div>
          <div className="grain-bridge__actual"><span>UNIVERSO REAL OFICIAL</span><strong>{report.metrics.actual} posts</strong><small>{report.metrics.unplanned} no estaban planificados</small></div>
        </section>

        <section className="kpi-grid">
          <KpiCard label="Destinos planificados" value={metrics.planned} note={`${contentSummary.plannedContents} planeados del Sheet`} icon={<CalendarDays size={19} />} />
          <KpiCard label="Posts oficiales reales" value={metrics.actual} note={`${metrics.matched} asociados a la planificación`} tone="navy" icon={<Check size={19} />} />
          <KpiCard label="Coincidencia exacta" value={formatPct(metrics.exactCompliancePct)} note={`${metrics.exact} descripciones exactas`} tone="blue" icon={<Check size={19} />} />
          <KpiCard label="Exactas en fecha" value={formatPct(metrics.exactOnTimePct)} note={`${exactOnTimeCount} publicadas el día previsto`} tone="olive" icon={<Clock3 size={19} />} />
          <KpiCard label="Con modificaciones" value={metrics.modified} note={`${formatPct(metrics.modifiedPct)} de la planificación`} tone="orange" icon={<Sparkles size={19} />} />
          <KpiCard label="No publicadas" value={metrics.notPublished} note={`${metrics.incomplete} con datos incompletos`} tone="pink" icon={<FileWarning size={19} />} />
          <KpiCard label="No planificadas" value={metrics.unplanned} note="Sin asociación automática" tone="gold" icon={<ArrowUpRight size={19} />} />
          <KpiCard label="Revisión manual" value={metrics.doubtful} note={`Desvío medio ${metrics.averageDayDeviation ?? "—"} días`} tone="gray" icon={<Eye size={19} />} />
        </section>

        <section className="insight-strip">
          <div className="insight-strip__intro"><span className="eyebrow">INSIGHTS · CUENTAS OFICIALES</span><strong>Impacto de la semana</strong><small>Alcance = suma de impresiones; engagement = métrica registrada por publicación.</small></div>
          <div><span>Alcance</span><strong>{formatNumber(report.analytics.totals.reach)}</strong></div>
          <div><span>Engagement</span><strong>{formatNumber(report.analytics.totals.engagement)}</strong></div>
          <div><span>Likes</span><strong>{formatNumber(report.analytics.totals.likes)}</strong></div>
          <div><span>Comentarios</span><strong>{formatNumber(report.analytics.totals.comments)}</strong></div>
          <div><span>Compartidos</span><strong>{formatNumber(report.analytics.totals.shares)}</strong></div>
        </section>

        <section className="charts-grid">
          <ChartCard title="Planificadas frente a realizadas" subtitle="Cantidad diaria dentro de la semana cerrada" className="chart-card--wide">
            {timeline.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={timeline} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}><CartesianGrid stroke="#e7ebf2" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#ccd4e0" }} tick={{ fill: "#667188", fontSize: 11 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#7a8598", fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: 10, borderColor: "#dce2ec" }} /><Legend iconType="circle" iconSize={8} /><Bar isAnimationActive={false} name="Programados" dataKey="planned" fill={COLORS.planned} stroke="#344158" strokeWidth={1} radius={[5, 5, 0, 0]} /><Bar isAnimationActive={false} name="Realizados" dataKey="realized" fill={COLORS.realized} stroke="#087565" strokeWidth={1} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart />}
          </ChartCard>
          <ChartCard title="Estado de cumplimiento" subtitle="Distribución sobre publicaciones planificadas">
            {complianceData.length ? <div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={complianceData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={86} paddingAngle={3} stroke="none">{complianceData.map((item) => <Cell fill={item.color} key={item.name} />)}</Pie><Tooltip /><Legend iconType="circle" iconSize={8} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{formatPct(metrics.compliancePct)}</strong><span>cumplido</span></div></div> : <EmptyChart />}
          </ChartCard>
          <ChartCard title="Momento de publicación" subtitle="En fecha, dentro de tolerancia, anticipadas y demoradas">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={timingData} margin={{ top: 12, right: 8, bottom: 4, left: -20 }}><CartesianGrid stroke="#e8edf5" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#6f7a90" }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6f7a90" }} /><Tooltip cursor={{ fill: "#f4f6fa" }} /><Bar isAnimationActive={false} dataKey="value" name="Publicaciones" radius={[6, 6, 0, 0]}>{timingData.map((item) => <Cell fill={item.color} key={item.name} />)}</Bar></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Tipo de coincidencia" subtitle="Exactas, aproximadas y casos dudosos">
            {matchData.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={matchData} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none">{matchData.map((item) => <Cell fill={item.color} key={item.name} />)}</Pie><Tooltip /><Legend iconType="circle" iconSize={8} verticalAlign="bottom" /></PieChart></ResponsiveContainer> : <EmptyChart />}
          </ChartCard>
          <ChartCard title="Posts programados frente a realizados" subtitle="Cantidad total por red en cuentas oficiales">
            {networkData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={networkData} layout="vertical" margin={{ top: 8, right: 10, bottom: 0, left: 14 }}><CartesianGrid stroke="#e7ebf2" horizontal={false} /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6f7a90" }} /><YAxis dataKey="network" type="category" width={68} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#4c5870" }} /><Tooltip /><Legend iconType="circle" iconSize={8} /><Bar isAnimationActive={false} name="Programados" dataKey="planificadas" fill={COLORS.planned} stroke="#344158" strokeWidth={1} radius={[0, 5, 5, 0]} /><Bar isAnimationActive={false} name="Realizados" dataKey="realizadas" fill={COLORS.realized} stroke="#087565" strokeWidth={1} radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart />}
          </ChartCard>
          <ChartCard title="Temáticas programadas frente a posteadas" subtitle="Cantidad de posts por temática declarada" className="chart-card--wide">
            {themeData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={themeData} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 42 }}><CartesianGrid stroke="#e7ebf2" horizontal={false} /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#6f7a90" }} /><YAxis dataKey="theme" type="category" width={125} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#4c5870" }} /><Tooltip /><Legend iconType="circle" iconSize={8} /><Bar isAnimationActive={false} name="Programadas" dataKey="planned" fill={COLORS.planned} stroke="#344158" strokeWidth={1} radius={[0, 5, 5, 0]} /><Bar isAnimationActive={false} name="Posteadas" dataKey="posted" fill={COLORS.realized} stroke="#087565" strokeWidth={1} radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart />}
          </ChartCard>
        </section>

        {!report.quality.sheetHasThemeColumn && <section className="theme-warning"><AlertTriangle size={18} /><div><strong>La planificación actual no tiene una columna Temática.</strong><span>La comparación ya está preparada, pero las programadas aparecen como “Sin temática planificada”. Para una lectura real por temática, agregá una columna Temática, Tema o Campaña en el Sheet.</span></div></section>}

        <section className="engagement-section">
          <header className="engagement-section__header"><div><span className="eyebrow">TOP ENGAGEMENT POR TEMÁTICA</span><h2>Impacto por red social</h2><p>Alcance e interacciones de posts realizados exclusivamente en cuentas oficiales.</p></div><label><span>Red social</span><div className="select-wrap"><select value={engagementNetwork} onChange={(event) => setEngagementNetwork(event.target.value)}><option value="">Todas</option>{report.analytics.postsByNetwork.map((row) => <option value={row.network} key={row.network}>{NETWORK_LABELS[row.network]}</option>)}</select><ChevronDown size={14} /></div></label></header>
          <div className="engagement-layout">
            <ChartCard title="Engagement por temática" subtitle={engagementNetwork ? `Ranking en ${NETWORK_LABELS[engagementNetwork]}` : "Ranking combinado; seleccioná una red para comparar impacto"}>
              {engagementRows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={engagementRows.slice(0, 7)} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 44 }}><CartesianGrid stroke="#e8edf5" horizontal={false} /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#6f7a90" }} /><YAxis dataKey="chartLabel" type="category" width={135} tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: "#4c5870" }} /><Tooltip formatter={(value) => [formatNumber(Number(value)), "Engagement"]} /><Bar isAnimationActive={false} dataKey="engagement" fill={COLORS.blue} radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart />}
            </ChartCard>
            <article className="engagement-table-card"><div className="engagement-table-wrap"><table><thead><tr><th>Temática</th><th>Red</th><th>Posts</th><th>Alcance</th><th>Engagement</th><th>Likes</th><th>Comentarios</th><th>Compartidos</th><th>Top post</th></tr></thead><tbody>{engagementRows.map((row) => <tr key={`${row.network}-${row.theme}`}><td><strong>{row.theme}</strong></td><td><span className="network-pill">{NETWORK_LABELS[row.network]}</span></td><td>{formatNumber(row.posts)}</td><td>{formatNumber(row.reach)}</td><td><strong>{formatNumber(row.engagement)}</strong></td><td>{formatNumber(row.likes)}</td><td>{formatNumber(row.comments)}</td><td>{formatNumber(row.shares)}</td><td>{row.topPost?.url ? <a href={row.topPost.url} target="_blank" rel="noreferrer" title={row.topPost.description || "Abrir top post"}><ExternalLink size={15} /> {formatNumber(row.topPost.engagement)}</a> : "—"}</td></tr>)}</tbody></table></div></article>
          </div>
        </section>

        <UpcomingSection upcoming={report.upcoming} />

        <section className="detail-card">
          <header className="detail-card__header"><div><span className="eyebrow">DETALLE OPERATIVO</span><h2>Publicaciones analizadas</h2><p>{tableRows.length.toLocaleString("es-AR")} registros según los filtros activos</p></div><div className="detail-actions"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar descripción, cuenta o campaña" />{search && <button onClick={() => setSearch("")} aria-label="Borrar búsqueda"><X size={14} /></button>}</label><button className="button button--secondary" onClick={() => exportCsv(tableRows)}><Download size={16} /> Exportar CSV</button></div></header>
          <div className="table-scroll"><table><thead><tr><th><button onClick={() => changeSort("plannedDate")}>Fecha plan. <ChevronsUpDown size={13} /></button></th><th><button onClick={() => changeSort("actualDate")}>Fecha real <ChevronsUpDown size={13} /></button></th><th>Días</th><th className="description-column">Publicación</th><th><button onClick={() => changeSort("matchType")}>Coincidencia <ChevronsUpDown size={13} /></button></th><th>Similitud</th><th><button onClick={() => changeSort("status")}>Estado <ChevronsUpDown size={13} /></button></th><th>Red / cuenta</th><th /></tr></thead><tbody>{visibleRows.map((record) => <tr key={record.id} onClick={() => setSelected(record)}><td>{formatDate(record.plannedDate)}</td><td>{formatDate(record.actualDate)}</td><td><span className={`day-diff ${record.dayDifference === null ? "" : record.dayDifference > 0 ? "day-diff--late" : record.dayDifference < 0 ? "day-diff--early" : "day-diff--ok"}`}>{record.dayDifference === null ? "—" : record.dayDifference === 0 ? <Check size={14} /> : <>{record.dayDifference > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(record.dayDifference)}</>}</span></td><td className="description-column"><strong>{record.title || (record.plannedDescription ? "Publicación planificada" : "Publicación real")}</strong><span>{record.plannedDescription || record.actualDescription || "Sin descripción"}</span></td><td><span className={`match-tag match-tag--${record.matchType}`}>{MATCH_LABELS[record.matchType]}</span></td><td>{record.similarity === null ? "—" : <div className="similarity"><span><i style={{ width: `${record.similarity * 100}%` }} /></span><b>{round(record.similarity * 100)}%</b></div>}</td><td><StatusBadge status={record.status} /></td><td><strong className="network-name">{NETWORK_LABELS[record.network]}</strong><span className="account-name">{record.account || "—"}</span></td><td><button className="row-action" aria-label="Ver detalle"><ChevronRight size={17} /></button></td></tr>)}</tbody></table>{visibleRows.length === 0 && <div className="empty-table"><Search size={24} /><strong>Sin resultados</strong><span>Probá ajustando los filtros o la búsqueda.</span></div>}</div>
          <footer className="pagination"><span>Mostrando {tableRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, tableRows.length)} de {tableRows.length}</span><div><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button><span>Página {page} de {pages}</span><button disabled={page === pages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div></footer>
        </section>

        <section className="method-note"><div className="method-note__icon"><AlertTriangle size={19} /></div><div><strong>Alcance y calidad de los datos</strong><p>{report.quality.officialRule} La granularidad se expande por red para resolver publicaciones multicanal sin reutilizar un mismo post real.</p><div className="quality-chips"><span>{report.window.label}</span><span>{report.quality.plannedRows} filas planificadas</span><span>{report.quality.plannedExpanded} objetivos por red</span><span>{report.quality.officialProfileIds} perfiles oficiales configurados</span><span>{report.quality.plannedEmptyDescriptions} copies vacíos</span><span>{report.quality.plannedDuplicateKeys} duplicados potenciales</span><span>{report.quality.actualEmptyDescriptions} posts reales sin mensaje</span></div><div className="official-profile-list"><b>Cuentas incluidas:</b>{report.quality.officialProfiles.map((profile) => <span key={profile.profileId}>{profile.profile} · {profile.networks.map((network) => NETWORK_LABELS[network]).join(", ")} <code>#{profile.profileId}</code></span>)}</div></div></section>
      </main>
      <footer className="app-footer"><span>Fuentes: Google Sheet · {report.quality.tableName}</span><span>Umbral aproximado {formatPct(report.config.approximateThreshold * 100)} · Dudoso desde {formatPct(report.config.doubtfulThreshold * 100)} · Tolerancia {report.config.toleranceDays} días</span></footer>
      {selected && <DetailDrawer record={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

export default App;
