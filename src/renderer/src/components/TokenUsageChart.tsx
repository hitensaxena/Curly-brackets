import { useEffect, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts"

type DayData = { date: string; claude: number; gemini: number }

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function shortDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function TokenUsageChart() {
  const [data, setData] = useState<DayData[]>([])

  useEffect(() => {
    window.api.usage.history(7).then((rows) =>
      setData(rows.map((r) => ({ date: shortDate(r.date), claude: r.claude, gemini: r.gemini })))
    )
  }, [])

  const hasData = data.some((d) => d.claude > 0 || d.gemini > 0)

  return (
    <div>
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Token Usage — Last 7 Days
      </h2>
      <div className="rounded-lg bg-white/3 border border-white/5 p-4">
        {!hasData ? (
          <div className="flex items-center justify-center h-36 text-sm text-slate-500">
            No usage data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data} barGap={2} barCategoryGap="30%">
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmt}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                formatter={(value: number) => fmt(value)}
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  fontSize: 12
                }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Legend
                iconType="square"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }}
              />
              <Bar dataKey="claude" name="Claude" fill="#818cf8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="gemini" name="Gemini" fill="#34d399" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
