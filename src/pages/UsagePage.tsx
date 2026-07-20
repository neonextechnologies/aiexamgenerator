import { Activity, DollarSign, Zap, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, PageHeader, StatCard, Badge } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { formatDate, formatRelativeTime } from '../lib/utils';

export default function UsagePage() {
  const logs = demoStore.usageLogs;
  const totalInput = logs.reduce((s, l) => s + l.input_tokens, 0);
  const totalOutput = logs.reduce((s, l) => s + l.output_tokens, 0);
  const totalCost = logs.reduce((s, l) => s + l.estimated_cost_usd, 0);
  const avgLatency = Math.round(logs.reduce((s, l) => s + l.latency_ms, 0) / (logs.length || 1));

  const chartData = logs.map(l => ({ date: formatRelativeTime(l.created_at), cost: l.estimated_cost_usd, tokens: l.input_tokens + l.output_tokens }));

  return (
    <div>
      <PageHeader title="AI Usage" description="ติดตามการใช้งาน AI และค่าใช้จ่าย" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Zap className="w-5 h-5" />} label="Total Requests" value={logs.length} color="primary" />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Total Cost" value={`$${totalCost.toFixed(2)}`} color="success" />
        <StatCard icon={<Activity className="w-5 h-5" />} label="Total Tokens" value={(totalInput + totalOutput).toLocaleString()} sublabel={`In: ${totalInput.toLocaleString()} / Out: ${totalOutput.toLocaleString()}`} color="accent" />
        <StatCard icon={<Clock className="w-5 h-5" />} label="Avg Latency" value={`${avgLatency}ms`} color="warning" />
      </div>
      <Card className="p-5 mb-6"><h3 className="font-semibold mb-4">Usage Over Time</h3><ResponsiveContainer width="100%" height={250}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Card>
      <Card className="p-5">
        <h3 className="font-semibold mb-4">Request Logs</h3>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-neutral-400 border-b border-neutral-100"><th className="py-2 pr-3">Request Type</th><th className="py-2 pr-3">Model</th><th className="py-2 pr-3">Input</th><th className="py-2 pr-3">Output</th><th className="py-2 pr-3">Cost</th><th className="py-2 pr-3">Latency</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Date</th></tr></thead>
          <tbody>{logs.map(l => (<tr key={l.id} className="border-b border-neutral-50"><td className="py-2 pr-3">{l.request_type}</td><td className="py-2 pr-3 font-mono text-xs">{l.model}</td><td className="py-2 pr-3">{l.input_tokens.toLocaleString()}</td><td className="py-2 pr-3">{l.output_tokens.toLocaleString()}</td><td className="py-2 pr-3">${l.estimated_cost_usd.toFixed(2)}</td><td className="py-2 pr-3">{l.latency_ms}ms</td><td className="py-2 pr-3"><Badge variant="success">{l.status}</Badge></td><td className="py-2 pr-3 text-xs text-neutral-400">{formatDate(l.created_at)}</td></tr>))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
