import { z } from 'zod'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  AreaChart, Area,
  XAxis, YAxis, Tooltip, Legend
} from 'recharts'
import { ChartSchema } from '../schemas'

type Props = z.infer<typeof ChartSchema>

const FALLBACK_COLORS = ['#818cf8', '#34d399', '#fb923c', '#f472b6', '#60a5fa', '#facc15', '#a78bfa']

export function GenUIChart({ title, variant, data, xKey, series }: Props) {
  if (data.length === 0) {
    return <div className="text-xs text-slate-500 italic my-2">Chart has no data</div>
  }

  // Infer xKey if absent: first string column
  const sampleKeys = Object.keys(data[0])
  const inferredX = xKey ?? sampleKeys.find((k) => typeof data[0][k] === 'string') ?? sampleKeys[0]
  const inferredSeries = series ?? sampleKeys
    .filter((k) => k !== inferredX && typeof data[0][k] === 'number')
    .map((k, i) => ({ key: k, label: k, color: FALLBACK_COLORS[i % FALLBACK_COLORS.length] }))

  return (
    <div className="my-2 rounded-md border border-white/10 bg-white/3 p-3">
      {title && <p className="text-[11px] font-medium text-slate-300 mb-2">{title}</p>}
      <ResponsiveContainer width="100%" height={220}>
        {variant === 'bar' ? (
          <BarChart data={data}>
            <XAxis dataKey={inferredX} stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {inferredSeries.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
            ))}
          </BarChart>
        ) : variant === 'line' ? (
          <LineChart data={data}>
            <XAxis dataKey={inferredX} stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {inferredSeries.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        ) : variant === 'area' ? (
          <AreaChart data={data}>
            <XAxis dataKey={inferredX} stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {inferredSeries.map((s, i) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} fill={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} fillOpacity={0.3} />
            ))}
          </AreaChart>
        ) : (
          <PieChart>
            <Tooltip contentStyle={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }} />
            <Pie
              data={data}
              dataKey={inferredSeries[0]?.key ?? sampleKeys.find((k) => typeof data[0][k] === 'number') ?? sampleKeys[0]}
              nameKey={inferredX}
              outerRadius={80}
              label={{ fontSize: 10, fill: '#cbd5e1' }}
            >
              {data.map((_, i) => <Cell key={i} fill={FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />)}
            </Pie>
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
