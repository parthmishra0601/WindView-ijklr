import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const formatValue = (value) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value);

function ComparisonTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#e5ebe7] bg-white px-3 py-2.5 text-[10px] text-[#627169] shadow-lg">
      <b className="mb-1.5 block text-[#34453b]">{label} UTC</b>
      <div className="flex items-center gap-1.5 py-0.5"><i className="inline-block w-4 border-t-2 border-dashed border-[#89938f]" /> Forecast <strong className="ml-auto pl-3 text-[#35473c]">{point.forecast_mw == null ? "—" : `${formatValue(point.forecast_mw)} MW`}</strong></div>
      <div className="flex items-center gap-1.5 py-0.5"><i className="inline-block w-4 border-t-2 border-solid border-[#35443d]" /> Actual <strong className="ml-auto pl-3 text-[#35473c]">{point.actual_mw == null ? "—" : `${formatValue(point.actual_mw)} MW`}</strong></div>
      <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-[#edf1ee] pt-2"><span>Difference</span><strong className="text-[#35473c]">{point.error_mw == null ? "—" : `${point.error_mw > 0 ? "+" : ""}${formatValue(point.error_mw)} MW`}</strong></div>
    </div>
  );
}

export default function ForecastChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#edf0ee" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: "#89938f", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval={2}
        />
        <YAxis
          tick={{ fill: "#89938f", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={57}
          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<ComparisonTooltip />} />
        <Line
          dataKey="forecast_mw"
          name="Forecast"
          type="monotone"
          stroke="#89938f"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 3, fill: "#89938f", stroke: "#fff", strokeWidth: 1.5 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="actual_mw"
          name="Actual"
          type="monotone"
          stroke="#35443d"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: "#35443d", stroke: "#fff", strokeWidth: 1.5 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
