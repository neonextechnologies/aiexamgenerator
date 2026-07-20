import { TrendingUp, CheckCircle2, XCircle, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card, PageHeader, StatCard } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_TYPE_LABELS, QUESTION_STATUS_LABELS } from '../types';

const COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ReportsPage() {
  const questions = demoStore.questions;
  const usageLogs = demoStore.usageLogs;

  const bloomData = Object.entries(BLOOM_LABELS).map(([k, v]) => ({ name: v, count: questions.filter(q => q.intended_bloom_level === k).length }));
  const diffData = Object.entries(DIFFICULTY_LABELS).map(([k, v]) => ({ name: v, count: questions.filter(q => q.intended_difficulty === k).length }));
  const statusData = Object.entries(QUESTION_STATUS_LABELS).map(([k, v]) => ({ name: v, value: questions.filter(q => q.status === k).length })).filter(d => d.value > 0);
  const typeData = Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => ({ name: v, count: questions.filter(q => q.question_type === k).length })).filter(d => d.count > 0);

  const approved = questions.filter(q => q.status === 'approved' || q.status === 'published').length;
  const rejected = questions.filter(q => q.status === 'rejected').length;
  const approvalRate = questions.length > 0 ? Math.round((approved / questions.length) * 100) : 0;
  const rejectionRate = questions.length > 0 ? Math.round((rejected / questions.length) * 100) : 0;
  const avgQuality = questions.filter(q => q.quality_score).reduce((s, q) => s + (q.quality_score || 0), 0) / (questions.filter(q => q.quality_score).length || 1);
  const totalCost = usageLogs.reduce((s, u) => s + u.estimated_cost_usd, 0);

  return (
    <div>
      <PageHeader title="รายงาน" description="วิเคราะห์คุณภาพข้อสอบและการใช้งาน AI" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Approval Rate" value={`${approvalRate}%`} color="success" />
        <StatCard icon={<XCircle className="w-5 h-5" />} label="Rejection Rate" value={`${rejectionRate}%`} color="error" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Avg Quality Score" value={avgQuality.toFixed(0)} color="primary" />
        <StatCard icon={<Activity className="w-5 h-5" />} label="Total AI Cost" value={`$${totalCost.toFixed(2)}`} color="accent" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5"><h3 className="font-semibold mb-4">Bloom Distribution</h3><ResponsiveContainer width="100%" height={250}><BarChart data={bloomData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Card>
        <Card className="p-5"><h3 className="font-semibold mb-4">Difficulty Distribution</h3><ResponsiveContainer width="100%" height={250}><BarChart data={diffData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Card>
        <Card className="p-5"><h3 className="font-semibold mb-4">Question Status</h3><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>{statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart></ResponsiveContainer></Card>
        <Card className="p-5"><h3 className="font-semibold mb-4">Question Type Distribution</h3><ResponsiveContainer width="100%" height={250}><BarChart data={typeData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tick={{ fontSize: 12 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} /><Tooltip /><Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></Card>
      </div>
    </div>
  );
}
