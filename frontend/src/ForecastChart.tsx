import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  time: string;
  actual_mw: number | null;
  forecast_mw: number | null;
};

function formatValue(value: number) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <b>{label} UTC</b>
      {payload.map((entry) => (
        <div key={entry.name}>
          <i style={{ background: entry.color }} />
          {entry.name}
          <strong>{formatValue(entry.value)} MW</strong>
        </div>
      ))}
    </div>
  );
}

export default function ForecastChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 15, right: 10, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#edf1ef" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: "#89938f", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval={3}
        />
        <YAxis
          tick={{ fill: "#89938f", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={57}
          tickFormatter={(value: number) => `${(value / 1000).toFixed(0)}k`}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="forecast_mw"
          name="Forecast"
          stroke="#4b8d6c"
          strokeWidth={2.5}
          dot={false}
          connectNulls={false}
          activeDot={{ r: 4, fill: "#4b8d6c", stroke: "#fff", strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="actual_mw"
          name="Actual"
          stroke="#e7a65c"
          strokeWidth={2.5}
          dot={false}
          connectNulls={false}
          activeDot={{ r: 4, fill: "#e7a65c", stroke: "#fff", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
