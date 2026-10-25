import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Clock3,
  Cloud,
  Download,
  ExternalLink,
  Leaf,
  Menu,
  RefreshCw,
  ShieldCheck,
  Wind,
} from "lucide-react";

const ForecastChart = lazy(() => import("./ForecastChart"));

const API_BASE = import.meta.env.VITE_API_URL ?? "";

type Metrics = {
  matched_hours: number;
  mae_mw: number | null;
  bias_mw: number | null;
  mape_percent?: number | null;
  forecast_coverage_percent: number;
  mean_forecast_mw: number | null;
  mean_actual_mw: number | null;
};
type DayPoint = {
  start_time: string;
  actual_mw: number | null;
  forecast_mw: number | null;
  error_mw: number | null;
};
type DailyPoint = {
  date: string;
  mae_mw: number | null;
  bias_mw: number | null;
  matched_hours: number;
  mean_forecast_mw: number | null;
  mean_actual_mw: number | null;
};
type DayData = {
  date: string;
  decision_cutoff_utc: string;
  series: DayPoint[];
  metrics: Metrics;
};
type MonthData = {
  month: string;
  decision_hour_utc: number;
  decision_rule: string;
  daily: DailyPoint[];
  metrics: Metrics;
};

const number = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(value);
const hourLabel = (time: string) => new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const niceDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function App() {
  const [selectedDay, setSelectedDay] = useState("2026-01-15");
  const [decisionHour, setDecisionHour] = useState(12);
  const [month, setMonth] = useState<MonthData | null>(null);
  const [day, setDay] = useState<DayData | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [loadingDay, setLoadingDay] = useState(true);
  const [error, setError] = useState("");

  async function loadMonth() {
    setLoadingMonth(true);
    setError("");
    try {
      const value = await fetchJson<MonthData>(`/api/analytics?month=2026-01&decision_hour=${decisionHour}`);
      setMonth(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Elexon data.");
    } finally {
      setLoadingMonth(false);
    }
  }

  async function loadDay() {
    setLoadingDay(true);
    try {
      const value = await fetchJson<DayData>(`/api/day?date=${selectedDay}&decision_hour=${decisionHour}`);
      setDay(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Elexon data.");
    } finally {
      setLoadingDay(false);
    }
  }

  useEffect(() => { void loadMonth(); }, [decisionHour]);
  useEffect(() => { void loadDay(); }, [selectedDay, decisionHour]);

  const daily = month?.daily ?? [];
  const activeDay = day?.metrics;
  const chartData = useMemo(
    () =>
      (day?.series ?? []).map((point) => ({
        ...point,
        time: hourLabel(point.start_time),
      })),
    [day],
  );
  const maxDailyMae = Math.max(1, ...daily.map((point) => point.mae_mw ?? 0));
  const bias = month?.metrics.bias_mw ?? null;

  function exportCsv() {
    if (!day) return;
    const csv = [
      "start_time_utc,forecast_mw,actual_mw,error_mw",
      ...day.series.map((row) =>
        [row.start_time, row.forecast_mw ?? "", row.actual_mw ?? "", row.error_mw ?? ""].join(","),
      ),
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `windview-${selectedDay}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="WindView home">
          <span className="brand-mark"><Wind size={21} strokeWidth={2.3} /></span>
          <span>windview<span className="brand-dot">.</span></span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-icon">N</span>
          <span className="workspace-text"><b>Northstar Energy</b><small>Trading desk</small></span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <a className="nav-item active" href="#overview"><BarChart3 size={17} /> Overview</a>
          <a className="nav-item" href="#daily"><CalendarDays size={17} /> Daily forecast</a>
          <a className="nav-item" href="#accuracy"><Activity size={17} /> Accuracy analysis</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="data-status"><span className="status-dot" style={month ? undefined : { background: "#bb7565", boxShadow: "0 0 0 3px #f8ece8" }} /> {month ? "Elexon data connected" : loadingMonth ? "Connecting to Elexon" : "Elexon data unavailable"}</div>
          <div className="nav-label">RESOURCES</div>
          <a className="nav-item" href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream" target="_blank" rel="noreferrer">
            <CircleHelp size={17} /> Data methodology <ExternalLink size={13} className="external-icon" />
          </a>
          <div className="profile">
            <div className="avatar">JD</div>
            <div className="profile-text"><b>Jane Davies</b><small>Market analyst</small></div>
            <Menu size={17} />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Portfolio <span>/</span> <b>Wind intelligence</b></div>
          <div className="top-actions">
            <div className="period-pill"><span className="status-dot" /> Historical pilot · January 2026</div>
            <button className="icon-button" aria-label="Refresh data" onClick={() => { void loadMonth(); void loadDay(); }}><RefreshCw size={16} /></button>
            <button className="avatar top-avatar" aria-label="User profile">JD</button>
          </div>
        </header>

        <section className="page-heading" id="overview">
          <div>
            <div className="eyebrow"><Leaf size={14} /> RENEWABLE INTELLIGENCE</div>
            <h1>Wind, in focus.</h1>
            <p>Make your day-ahead decisions with a clearer view of the wind ahead.</p>
          </div>
          <div className="decision-control">
            <label htmlFor="decision-hour"><Clock3 size={15} /> Decision cutoff</label>
            <select id="decision-hour" value={decisionHour} onChange={(event) => setDecisionHour(Number(event.target.value))}>
              {[9, 10, 11, 12, 13, 14, 15, 16].map((hour) => (
                <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00 UTC · day before</option>
              ))}
            </select>
          </div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <Cloud size={18} /><div><b>Live data unavailable</b><span>{error} No sample values are being shown.</span></div>
            <button onClick={() => { void loadMonth(); void loadDay(); }}>Retry</button>
          </div>
        )}

        <section className="metric-grid" aria-label="January forecast metrics">
          <MetricCard label="Mean forecast wind" value={number(month?.metrics.mean_forecast_mw)} unit="MW" icon={<Wind size={17} />} foot="Day-ahead forecast · national" loading={loadingMonth} tint="green" />
          <MetricCard label="Mean actual wind" value={number(month?.metrics.mean_actual_mw)} unit="MW" icon={<Activity size={17} />} foot="Elexon FUELHH · national" loading={loadingMonth} tint="blue" />
          <MetricCard label="Mean absolute error" value={number(month?.metrics.mae_mw)} unit="MW" icon={<BarChart3 size={17} />} foot="Across matched hourly periods" loading={loadingMonth} tint="orange" />
          <MetricCard
            label="Forecast bias"
            value={number(bias)}
            unit="MW"
            icon={bias != null && bias < 0 ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />}
            foot={bias == null ? "Positive = forecast above actual" : bias > 0 ? "Forecast tends to overestimate" : "Forecast tends to underestimate"}
            loading={loadingMonth}
            tint="violet"
          />
        </section>

        <section className="dashboard-grid">
          <article className="card chart-card" id="daily">
            <div className="card-heading">
              <div><div className="section-kicker">INTRADAY PROFILE</div><h2>Forecast vs. actual</h2><p>{niceDate(selectedDay)} <span className="subtle-dot">·</span> National wind generation</p></div>
              <div className="chart-actions">
                <label className="date-picker"><CalendarDays size={15} /><input aria-label="Select delivery date in January 2026" type="date" min="2026-01-01" max="2026-01-31" value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} /></label>
                <button className="export-button" onClick={exportCsv} disabled={!day}><Download size={15} /> Export</button>
              </div>
            </div>
            <div className="chart-legend">
              <span><i className="legend-dot forecast-dot" /> Day-ahead forecast</span>
              <span><i className="legend-dot actual-dot" /> Actual generation</span>
              <span className="cutoff-note"><span className="cutoff-line" /> Forecasts published by {String(decisionHour).padStart(2, "0")}:00 UTC</span>
            </div>
            <div className="chart-wrap">
              {loadingDay ? <div className="chart-loading"><span className="spinner" /> Loading Elexon time series…</div> :
                chartData.length ? <Suspense fallback={<div className="chart-loading"><span className="spinner" /> Loading chart…</div>}><ForecastChart data={chartData} /></Suspense> : <div className="chart-loading">No matching observations for this date.</div>}
            </div>
            <div className="chart-foot"><ShieldCheck size={15} /><span>Forecast vintage is frozen at the selected day-ahead cutoff. Actuals are shown for verification only.</span></div>
          </article>

          <article className="card daily-card">
            <div className="card-heading compact"><div><div className="section-kicker">JANUARY 2026</div><h2>Accuracy by day</h2><p>Mean absolute error · MW</p></div><span className="tiny-badge">31 days</span></div>
            <div className="daily-list" id="accuracy">
              {loadingMonth ? <div className="list-loading"><span className="spinner" /> Loading daily analysis…</div> :
                daily.map((item) => (
                  <button key={item.date} className={`daily-row ${item.date === selectedDay ? "selected" : ""}`} onClick={() => setSelectedDay(item.date)} aria-label={`${niceDate(item.date)} MAE ${number(item.mae_mw)} megawatts`}>
                    <span className="day-num">{Number(item.date.slice(-2))}</span>
                    <span className="bar-track"><i style={{ width: `${Math.max(2, ((item.mae_mw ?? 0) / maxDailyMae) * 100)}%` }} /></span>
                    <span className="daily-value">{number(item.mae_mw)}</span>
                  </button>
                ))}
            </div>
            <div className="daily-card-foot"><span>LOWER IS BETTER</span><span>MAE · MW</span></div>
          </article>
        </section>

        <section className="lower-grid">
          <article className="card selected-card">
            <div className="card-heading compact"><div><div className="section-kicker">SELECTED DELIVERY DAY</div><h2>{niceDate(selectedDay)}</h2></div><span className="tiny-badge date-badge"><CalendarDays size={13} /> {selectedDay}</span></div>
            <div className="selected-stats">
              <div><span>Forecast MAE</span><b>{loadingDay ? "…" : number(activeDay?.mae_mw)} <small>MW</small></b></div>
              <div><span>Matched periods</span><b>{loadingDay ? "…" : `${activeDay?.matched_hours ?? 0}`} <small>/ 24 h</small></b></div>
              <div><span>Coverage</span><b>{loadingDay ? "…" : `${number(activeDay?.forecast_coverage_percent, 1)}`}<small>%</small></b></div>
            </div>
            <div className="cutoff-strip"><Clock3 size={14} /><span>Forecast cutoff</span><b>{day?.decision_cutoff_utc ? new Date(day.decision_cutoff_utc).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC" : `${selectedDay} · ${String(decisionHour).padStart(2, "0")}:00 UTC`}</b></div>
          </article>
          <article className="insight-card">
            <div className="insight-icon"><Activity size={18} /></div>
            <div><div className="section-kicker">DECISION CONTEXT</div><h2>Forecast uncertainty, made visible.</h2><p>{activeDay?.mae_mw != null ? `On this day, the selected forecast vintage missed actual wind generation by ${number(activeDay.mae_mw)} MW on average across ${activeDay.matched_hours} matched hours.` : "Select a day to inspect its verified forecast performance. A higher forecast than actual may mean more balancing generation is needed."}</p></div>
            <span className="insight-watermark"><Wind size={82} /></span>
          </article>
        </section>

        <footer className="page-footer"><span>WindView <span className="subtle-dot">·</span> Decision support pilot</span><span>Source: Elexon BMRS <span className="subtle-dot">·</span> All times UTC <span className="subtle-dot">·</span> Historical data</span></footer>
      </main>
    </div>
  );
}

function MetricCard({ label, value, unit, icon, foot, loading, tint }: {
  label: string; value: string; unit: string; icon: React.ReactNode; foot: string; loading: boolean; tint: string;
}) {
  return (
    <article className="card metric-card">
      <div className="metric-top"><span>{label}</span><i className={`metric-icon ${tint}`}>{icon}</i></div>
      <div className="metric-value">{loading ? <span className="skeleton" /> : value}<small>{loading ? "" : unit}</small></div>
      <div className="metric-foot">{foot}</div>
    </article>
  );
}

export default App;
