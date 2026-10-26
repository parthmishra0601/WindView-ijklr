import { lazy, Suspense, useEffect, useMemo, useState } from "react";

const ForecastChart = lazy(() => import("./ForecastChart"));

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function pageFromHash() {
  const route = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  if (route === "daily") return "daily";
  if (route === "accuracy") return "accuracy";
  return "overview";
}

const number = (value, digits = 0) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(value);
const hourLabel = (time) => new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const niceDate = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${response.status})`);
  }
  return response.json();
}

function App() {
  const [activePage, setActivePage] = useState(pageFromHash);
  const [selectedDay, setSelectedDay] = useState("2026-01-01");
  const [decisionHour, setDecisionHour] = useState(12);
  const [month, setMonth] = useState(null);
  const [day, setDay] = useState(null);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [loadingDay, setLoadingDay] = useState(true);
  const [error, setError] = useState("");

  async function loadMonth() {
    setLoadingMonth(true);
    setError("");
    try {
      const value = await fetchJson(`/api/analytics?month=2026-01&decision_hour=${decisionHour}`);
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
      const value = await fetchJson(`/api/day?date=${selectedDay}&decision_hour=${decisionHour}`);
      setDay(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Elexon data.");
    } finally {
      setLoadingDay(false);
    }
  }

  useEffect(() => { void loadMonth(); }, [decisionHour]);
  useEffect(() => { void loadDay(); }, [selectedDay, decisionHour]);
  useEffect(() => {
    const updatePage = () => setActivePage(pageFromHash());
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activePage]);

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
  const pageHeading = {
    overview: {
      title: "Wind, in focus.",
      description: "Make your day-ahead decisions with a clearer view of the wind ahead.",
    },
    daily: {
      title: "Daily forecast",
      description: "Inspect a delivery day's forecast vintage alongside verified generation.",
    },
    accuracy: {
      title: "Forecast accuracy",
      description: "Compare day-ahead forecast errors across January 2026.",
    },
  }[activePage];
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
    <div className="min-h-screen bg-[#f5f6f5] text-[#303a35]">
      <aside className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 border-b border-[#e8ebe9] bg-white px-4 py-3 sm:px-6 md:fixed md:inset-y-0 md:left-0 md:z-10 md:flex md:w-60 md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0 md:px-4 md:py-6">
        <a className="font-display text-[22px] font-extrabold tracking-[-1.3px] text-[#303a35] no-underline" href="#" aria-label="WindView home">
          windview<span className="text-[#7f8984]">.</span>
        </a>
        <div className="justify-self-end rounded-lg border border-[#e8ebe9] px-3 py-2 text-right text-xs sm:text-left md:mt-9 md:w-full md:text-left">
          <b className="block font-semibold">National wind</b>
          <small className="text-[11px] text-[#89938d]">United Kingdom</small>
        </div>
        <div className="col-span-2 mt-2 hidden px-3 text-[9px] font-bold tracking-[1.1px] text-[#9aa39f] md:mb-2 md:block">WORKSPACE</div>
        <nav className="col-span-2 flex gap-1 overflow-x-auto md:flex-col">
          {[
            ["overview", "Overview"],
            ["daily", "Daily forecast"],
            ["accuracy", "Accuracy analysis"],
          ].map(([page, label]) => (
            <a
              key={page}
              className={`shrink-0 rounded-md px-3 py-2.5 text-xs font-medium no-underline transition-colors ${
                activePage === page
                  ? "bg-[#eef0ee] font-semibold text-[#35413b]"
                  : "text-[#697770] hover:bg-[#f5f6f5]"
              }`}
              href={`#/${page}`}
              aria-current={activePage === page ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="col-span-2 hidden md:mt-auto md:block">
          <div className="flex items-center gap-2 px-3 py-3 text-[10px] text-[#65716a]">
            <span className={`h-2 w-2 rounded-full ${month ? "bg-[#7c8981]" : loadingMonth ? "animate-pulse bg-[#a4ada7]" : "bg-[#a28d83]"}`} />
            {month ? "Elexon data connected" : loadingMonth ? "Connecting to Elexon" : "Elexon data unavailable"}
          </div>
          <div className="mb-2 mt-3 px-3 text-[9px] font-bold tracking-[1.1px] text-[#9aa39f]">RESOURCES</div>
          <a
            className="block rounded-md px-3 py-2.5 text-xs font-medium text-[#697770] no-underline hover:bg-[#f5f6f5]"
            href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream"
            target="_blank"
            rel="noreferrer"
          >
            Data methodology
          </a>
        </div>
      </aside>

      <main className="mx-auto max-w-[1650px] px-4 pb-6 sm:px-6 md:ml-60 md:px-7 lg:px-10">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[#e8ebe9] py-3">
          <div className="text-[11px] text-[#89948f]">
            Portfolio <span className="px-2 text-[#c4ccc7]">/</span>
            <b className="font-semibold text-[#4a5b52]">
              {activePage === "accuracy" ? "Accuracy analysis" : activePage === "daily" ? "Daily forecast" : "Wind intelligence"}
            </b>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-[#e5eae6] bg-white px-2.5 py-2 text-[10px] text-[#5e6963] sm:px-3">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7c8981]" />
              Historical pilot · January 2026
            </div>
            <button className="h-8 rounded-md border border-[#e6ebe7] bg-white px-3 text-[10px] text-[#64736a] hover:border-[#cfd5d1]" onClick={() => { void loadMonth(); void loadDay(); }}>
              Refresh
            </button>
          </div>
        </header>

        <section className="flex flex-col items-start justify-between gap-5 py-6 sm:py-8 lg:flex-row lg:items-end">
          <div>
            <div className="text-[9px] font-bold tracking-[1.05px] text-[#7f8984]">RENEWABLE INTELLIGENCE</div>
            <h1 className="mb-1 mt-2 font-display text-[26px] font-bold tracking-[-1.1px] text-[#303a35] sm:text-[29px]">{pageHeading.title}</h1>
            <p className="m-0 text-xs text-[#83908a]">{pageHeading.description}</p>
          </div>
          <div className="grid w-full gap-1.5 lg:w-auto">
            <label className="text-[10px] text-[#87948d]" htmlFor="decision-hour">Decision cutoff</label>
            <select className="w-full rounded-md border border-[#e3e9e5] bg-white px-3 py-2.5 text-[11px] text-[#4e6055] outline-none focus:border-[#aab4ae] lg:min-w-56" id="decision-hour" value={decisionHour} onChange={(event) => setDecisionHour(Number(event.target.value))}>
              {[9, 10, 11, 12, 13, 14, 15, 16].map((hour) => (
                <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00 UTC · day before</option>
              ))}
            </select>
          </div>
        </section>

        {error && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-[#e8e3e0] bg-[#f8f6f5] p-3 text-[#705d55]" role="alert">
            <div className="grid flex-1 gap-1"><b className="text-[11px]">Live data unavailable</b><span className="text-[10px] text-[#81726b]">{error} No sample values are being shown.</span></div>
            <button className="border-0 bg-transparent text-[11px] font-semibold text-[#705d55]" onClick={() => { void loadMonth(); void loadDay(); }}>Retry</button>
          </div>
        )}

        {activePage !== "daily" && (
          <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3.5" aria-label="January forecast metrics">
            <MetricCard label="Mean forecast wind" value={number(month?.metrics.mean_forecast_mw)} unit="MW" foot="Day-ahead forecast · national" loading={loadingMonth} />
            <MetricCard label="Mean actual wind" value={number(month?.metrics.mean_actual_mw)} unit="MW" foot="Elexon FUELHH · national" loading={loadingMonth} />
            <MetricCard label="Mean absolute error" value={number(month?.metrics.mae_mw)} unit="MW" foot="Across matched hourly periods" loading={loadingMonth} />
            <MetricCard
              label="Forecast bias"
              value={number(bias)}
              unit="MW"
              foot={bias == null ? "Positive = forecast above actual" : bias > 0 ? "Forecast tends to overestimate" : "Forecast tends to underestimate"}
              loading={loadingMonth}
            />
          </section>
        )}

        {activePage !== "accuracy" && (
          <section className={`mt-3.5 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(260px,0.72fr)] ${activePage === "daily" ? "xl:grid-cols-1" : ""}`}>
            <article className="min-w-0 rounded-xl border border-[#e8ebe9] bg-white p-3.5 shadow-sm sm:p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <div className="text-[8px] font-bold tracking-[1.05px] text-[#7f8984]">HOURLY GENERATION PROFILE</div>
                  <h2 className="mb-1 mt-1.5 font-display text-[15px] font-bold tracking-tight text-[#2b3b32]">Forecast vs actual</h2>
                  <p className="m-0 text-[10px] text-[#909a95]">{niceDate(selectedDay)} <span className="px-1 text-[#c1cbc5]">·</span> National wind generation</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="rounded-md border border-[#e7ece8] bg-white px-2 py-1.5 text-[10px] text-[#74817a]">
                    <span className="sr-only">Delivery date</span>
                    <input className="w-[112px] border-0 bg-transparent text-[10px] text-[#5a6a60] outline-none" aria-label="Select delivery date in January 2026" type="date" min="2026-01-01" max="2026-01-31" value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} />
                  </label>
                  <button className="h-8 rounded-md border border-[#e7ece8] bg-white px-2.5 text-[10px] text-[#74817a] hover:bg-[#f8f9f8] disabled:cursor-default disabled:opacity-45" onClick={exportCsv} disabled={!day}>Export CSV</button>
                </div>
              </div>
              <div className="flex h-11 flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-[#77837d]">
                <span className="flex items-center gap-1.5"><i className="inline-block w-[18px] border-t-2 border-dashed border-[#89938f]" />Forecast</span>
                <span className="flex items-center gap-1.5"><i className="inline-block w-[18px] border-t-2 border-solid border-[#35443d]" />Actual</span>
                <span className="ml-auto hidden text-[9px] text-[#9ba49f] sm:inline">Forecast vintage by {String(decisionHour).padStart(2, "0")}:00 UTC</span>
              </div>
              <div className="h-[220px] min-w-0 sm:h-[250px]">
                {loadingDay ? <LoadingState>Loading Elexon time series…</LoadingState> :
                  chartData.length ? <Suspense fallback={<LoadingState>Loading chart…</LoadingState>}><ForecastChart data={chartData} /></Suspense> : <LoadingState>No matching observations for this date.</LoadingState>}
              </div>
              <div className="flex min-h-10 items-center border-t border-[#f0f2f0] pt-2 text-[9px] text-[#929c96]">
                Forecast vintage is frozen at the selected day-ahead cutoff. Actuals are shown for verification only.
              </div>
            </article>

            {activePage === "overview" && (
              <article className="flex min-h-[340px] min-w-0 flex-col rounded-xl border border-[#e8ebe9] bg-white p-4 shadow-sm sm:min-h-[398px]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[8px] font-bold tracking-[1.05px] text-[#7f8984]">JANUARY 2026</div>
                    <h2 className="mb-1 mt-1.5 font-display text-[15px] font-bold text-[#2b3b32]">Accuracy by day</h2>
                    <p className="m-0 text-[10px] text-[#909a95]">Mean absolute error · MW</p>
                  </div>
                  <span className="rounded bg-[#f0f2f0] px-2 py-1 text-[9px] text-[#65716a]">31 days</span>
                </div>
                <div className="mt-3 max-h-[276px] flex-1 space-y-0.5 overflow-y-auto pr-1">
                  {loadingMonth ? <LoadingState>Loading daily analysis…</LoadingState> :
                    daily.map((item) => (
                      <button key={item.date} className={`grid h-6 w-full grid-cols-[20px_1fr_38px] items-center gap-2 rounded px-1 text-left hover:bg-[#f0f2f0] ${item.date === selectedDay ? "bg-[#f0f2f0]" : "bg-transparent"}`} onClick={() => { setSelectedDay(item.date); window.location.hash = "#/daily"; }} aria-label={`${niceDate(item.date)} MAE ${number(item.mae_mw)} megawatts`}>
                        <span className="text-[9px] text-[#8c9891]">{Number(item.date.slice(-2))}</span>
                        <span className="h-[5px] overflow-hidden rounded-full bg-[#f1f3f1]"><i className="block h-full rounded-full bg-[#9da8a1]" style={{ width: `${Math.max(2, ((item.mae_mw ?? 0) / maxDailyMae) * 100)}%` }} /></span>
                        <span className="text-right text-[9px] tabular-nums text-[#64746b]">{number(item.mae_mw)}</span>
                      </button>
                    ))}
                </div>
                <div className="mt-2 flex justify-between border-t border-[#eff2f0] pt-2.5 text-[8px] tracking-wide text-[#a1aaa5]"><span>LOWER IS BETTER</span><span>MAE · MW</span></div>
              </article>
            )}
          </section>
        )}

        {activePage === "accuracy" && (
          <section className="mt-3.5 rounded-xl border border-[#e8ebe9] bg-white p-3.5 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-[8px] font-bold tracking-[1.05px] text-[#7f8984]">DELIVERY-DAY BREAKDOWN</div><h2 className="mb-1 mt-1.5 font-display text-[15px] font-bold text-[#2b3b32]">Daily forecast errors</h2><p className="m-0 text-[10px] text-[#909a95]">Each row uses the selected day-ahead forecast cutoff.</p></div>
              <span className="shrink-0 rounded bg-[#f0f2f0] px-2 py-1 text-[9px] text-[#65716a]">31 days</span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-left text-[11px]">
                <thead className="bg-[#f7f8f7] text-[9px] font-semibold text-[#7d8982]"><tr><th className="rounded-l-md px-3 py-2.5">Delivery date</th><th className="px-3 py-2.5">MAE <small>MW</small></th><th className="px-3 py-2.5">Bias <small>MW</small></th><th className="px-3 py-2.5">Matched hours</th><th className="rounded-r-md px-3 py-2.5">Daily error</th></tr></thead>
                <tbody>
                  {loadingMonth
                    ? <tr><td colSpan={5} className="h-24 text-center text-[#91a098]"><LoadingState>Loading daily analysis…</LoadingState></td></tr>
                    : daily.map((item) => (
                      <tr key={item.date} className="cursor-pointer border-b border-[#f0f2f0] text-[#58685e] hover:bg-[#f7f8f7] focus-within:outline-2 focus-within:outline-[#89938d]" onClick={() => { setSelectedDay(item.date); window.location.hash = "#/daily"; }} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") { setSelectedDay(item.date); window.location.hash = "#/daily"; } }}>
                        <td className="px-3 py-2.5 font-medium text-[#405148]">{niceDate(item.date)}</td><td className="px-3 py-2.5">{number(item.mae_mw, 1)}</td><td className="px-3 py-2.5">{number(item.bias_mw, 1)}</td><td className="px-3 py-2.5">{item.matched_hours} / 24</td>
                        <td className="px-3 py-2.5"><span className="block h-1.5 w-full max-w-[150px] overflow-hidden rounded-full bg-[#eff3f0]"><i className="block h-full rounded-full bg-[#9da8a1]" style={{ width: `${Math.max(2, ((item.mae_mw ?? 0) / maxDailyMae) * 100)}%` }} /></span></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 border-t border-[#f0f2f0] pt-3 text-[9px] text-[#929c96]">Positive bias means forecast generation was above actual generation. Select a row to inspect that delivery day.</div>
          </section>
        )}

        {activePage !== "accuracy" && (
          <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <article className="min-w-0 rounded-xl border border-[#e8ebe9] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div><div className="text-[8px] font-bold tracking-[1.05px] text-[#7f8984]">SELECTED DELIVERY DAY</div><h2 className="mb-0 mt-1.5 font-display text-[15px] font-bold text-[#2b3b32]">{niceDate(selectedDay)}</h2></div>
                <span className="shrink-0 rounded bg-[#f0f2f0] px-2 py-1 text-[9px] text-[#65716a]">{selectedDay}</span>
              </div>
              <div className="grid grid-cols-3 py-4">
                <div className="grid gap-1 border-r border-[#edf0ee] pr-2"><span className="text-[9px] text-[#89958e]">Forecast MAE</span><b className="font-display text-base text-[#33443a]">{loadingDay ? "…" : number(activeDay?.mae_mw)} <small className="font-sans text-[9px] font-normal text-[#89958e]">MW</small></b></div>
                <div className="grid gap-1 border-r border-[#edf0ee] px-2"><span className="text-[9px] text-[#89958e]">Matched periods</span><b className="font-display text-base text-[#33443a]">{loadingDay ? "…" : `${activeDay?.matched_hours ?? 0}`} <small className="font-sans text-[9px] font-normal text-[#89958e]">/ 24 h</small></b></div>
                <div className="grid gap-1 pl-2"><span className="text-[9px] text-[#89958e]">Coverage</span><b className="font-display text-base text-[#33443a]">{loadingDay ? "…" : number(activeDay?.forecast_coverage_percent, 1)}<small className="font-sans text-[9px] font-normal text-[#89958e]">%</small></b></div>
              </div>
              <div className="flex min-h-8 flex-wrap items-center gap-x-2 border-t border-[#eff2f0] pt-2 text-[9px] text-[#929c96]"><span>Forecast cutoff</span><b className="ml-auto text-right font-medium text-[#68786e]">{day?.decision_cutoff_utc ? new Date(day.decision_cutoff_utc).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC" : `${selectedDay} · ${String(decisionHour).padStart(2, "0")}:00 UTC`}</b></div>
            </article>
            <article className="min-w-0 rounded-xl border border-[#e7eae8] bg-[#f1f3f1] p-4 sm:p-5">
              <div className="text-[8px] font-bold tracking-[1.05px] text-[#7f8984]">HOW TO READ THIS</div>
              <h2 className="mb-1 mt-1.5 font-display text-[13px] font-bold text-[#2b3b32]">Forecast performance</h2>
              <p className="m-0 max-w-prose text-[10px] leading-relaxed text-[#718178]">{activeDay?.mae_mw != null
                ? `The forecast differed from actual generation by ${number(activeDay.mae_mw)} MW on average across ${activeDay.matched_hours} matched hours. Bias of ${number(activeDay.bias_mw, 1)} MW indicates whether it tended to over- or under-forecast.`
                : "Once data is available, this summary explains the forecast error and bias for the selected delivery day."}</p>
            </article>
          </section>
        )}

        <footer className="flex flex-col gap-1.5 pt-5 text-[9px] text-[#a0aaa4] sm:flex-row sm:justify-between">
          <span>WindView <span className="px-1 text-[#c1cbc5]">·</span> Decision support pilot</span>
          <span>Source: Elexon BMRS <span className="px-1 text-[#c1cbc5]">·</span> All times UTC <span className="px-1 text-[#c1cbc5]">·</span> Historical data</span>
        </footer>
      </main>
    </div>
  );
}

function MetricCard({ label, value, unit, foot, loading }) {
  return (
    <article className="min-w-0 rounded-xl border border-[#e8ebe9] bg-white p-3.5 shadow-sm sm:min-h-[115px] sm:p-4">
      <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-[#77847d]"><span>{label}</span><span className="h-[3px] w-6 shrink-0 rounded bg-[#89938d]" /></div>
      <div className="my-2 font-display text-xl font-bold tracking-tight text-[#293a30] sm:text-[23px]">
        {loading ? <span className="inline-block h-5 w-16 animate-pulse rounded bg-[#ecefed]" /> : value}
        <small className="ml-1.5 font-sans text-[10px] font-medium tracking-normal text-[#84918b]">{loading ? "" : unit}</small>
      </div>
      <div className="text-[9px] text-[#9aa39f]">{foot}</div>
    </article>
  );
}

function LoadingState({ children }) {
  return (
    <div className="flex h-full min-h-20 items-center justify-center gap-2 text-center text-[11px] text-[#91a098]">
      <span className="h-3.5 w-3.5 shrink-0 animate-[windview-spin_.7s_linear_infinite] rounded-full border-2 border-[#e2e6e3] border-t-[#78847d]" />
      {children}
    </div>
  );
}

export default App;
