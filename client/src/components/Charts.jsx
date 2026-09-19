import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CATEGORY_COLORS, PRIORITY_STYLES, titleCase } from '../utils/format.js';

const PRIORITY_COLORS = { URGENT: '#e11d48', HIGH: '#f59e0b', MEDIUM: '#0ea5e9', LOW: '#94a3b8' };

export const CategoryPie = ({ data = {} }) => {
  const chartData = Object.entries(data)
    .filter(([, count]) => count > 0)
    .map(([name, value]) => ({ name, value }));

  if (!chartData.length) return <p className="py-10 text-center text-sm text-slate-500">No categorized email yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#64748b'} />
          ))}
        </Pie>
        <Tooltip formatter={(value, name) => [`${value} emails`, titleCase(name)]} />
        <Legend formatter={(value) => titleCase(value)} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
};

export const PriorityBars = ({ data = {} }) => {
  const chartData = Object.entries(data).map(([name, value]) => ({ name, value }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="name" tickFormatter={titleCase} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value, name) => [`${value} emails`, titleCase(name)]} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || '#94a3b8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export const VolumeArea = ({ data = [] }) => {
  const chartData = data.map((point) => ({
    date: new Date(point.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    count: point.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="volume" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3465f6" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#3465f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value) => [`${value} emails`, 'Received']} />
        <Area type="monotone" dataKey="count" stroke="#3465f6" strokeWidth={2} fill="url(#volume)" />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export const TopSenders = ({ data = [] }) => {
  if (!data.length) return <p className="py-6 text-center text-sm text-slate-500">No senders in this window.</p>;
  const max = Math.max(...data.map((d) => d.count));
  return (
    <ul className="space-y-2.5">
      {data.map((sender) => (
        <li key={sender.sender}>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="truncate">{sender.sender}</span>
            <span className="font-semibold">{sender.count}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(sender.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

export const PriorityLegend = () => (
  <div className="flex flex-wrap gap-2">
    {Object.entries(PRIORITY_COLORS).map(([name, color]) => (
      <span key={name} className="flex items-center gap-1 text-xs text-slate-600">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {PRIORITY_STYLES[name].label}
      </span>
    ))}
  </div>
);

export default { CategoryPie, PriorityBars, VolumeArea, TopSenders, PriorityLegend };
