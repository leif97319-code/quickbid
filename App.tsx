
import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { User, UserRole, RFQ, Bid, RFQStatus } from './types';
import { Icons, COLORS } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// --- 数据模型映射转换 ---
const Map = {
  rfq: {
    toModel: (d: any): RFQ => ({
      id: d.id, title: d.title, description: d.description, deadline: d.deadline,
      status: d.status as RFQStatus, createdAt: d.created_at, creatorId: d.creator_id, items: []
    }),
    toDB: (m: RFQ) => ({
      id: m.id, title: m.title, description: m.description, deadline: m.deadline,
      status: m.status, creator_id: m.creatorId
    })
  },
  bid: {
    toModel: (d: any): Bid => ({
      id: d.id, rfqId: d.rfq_id, vendorId: d.vendor_id, vendorName: d.vendor_name,
      amount: Number(d.amount), currency: 'CNY', deliveryDate: '', notes: '', timestamp: d.timestamp, itemQuotes: []
    }),
    toDB: (m: Bid) => ({
      id: m.id, rfq_id: m.rfqId, vendor_id: m.vendorId, vendor_name: m.vendorName, amount: m.amount
    })
  },
  user: {
    toModel: (d: any): User => ({
      id: d.id, name: d.name, role: d.role as UserRole, company: d.company, password: d.password, createdAt: d.created_at
    }),
    toDB: (m: User) => ({
      id: m.id, name: m.name, role: m.role, company: m.company, password: m.password
    })
  }
};

const getCloudConfig = () => ({
  url: localStorage.getItem('qb_cloud_url') || '',
  key: localStorage.getItem('qb_cloud_key') || ''
});

let supabase: any = null;
const initSupabase = () => {
  const { url, key } = getCloudConfig();
  if (url && key) {
    try { supabase = createClient(url, key); } catch (e) { console.error("Supabase Init Error:", e); }
  }
};
initSupabase();

const DataService = {
  isCloud() { return !!supabase; },
  
  async getRFQs() {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_r') || '[]');
    const { data, error } = await supabase.from('rfqs').select('*').order('created_at', { ascending: false });
    if (error) { console.error("Fetch RFQs Error:", error); return []; }
    return (data || []).map(Map.rfq.toModel);
  },

  async getBids() {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_b') || '[]');
    const { data, error } = await supabase.from('bids').select('*');
    if (error) { console.error("Fetch Bids Error:", error); return []; }
    const mapped = (data || []).map(Map.bid.toModel);
    console.log("Synced Bids from Cloud:", mapped); // 调试日志
    return mapped;
  },

  async getUsers() {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS));
    const { data, error } = await supabase.from('users').select('*');
    if (error) return JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS));
    return (data || []).map(Map.user.toModel);
  },

  async saveRFQ(rfq: RFQ) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_r') || '[]');
      localStorage.setItem('qb_r', JSON.stringify([rfq, ...local]));
      return;
    }
    await supabase.from('rfqs').upsert(Map.rfq.toDB(rfq));
  },

  async saveBid(bid: Bid) {
    console.log("Attempting to save bid:", bid);
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_b') || '[]');
      const idx = local.findIndex((b: any) => b.rfqId === bid.rfqId && b.vendorId === bid.vendorId);
      if(idx >= 0) local[idx] = bid; else local.push(bid);
      localStorage.setItem('qb_b', JSON.stringify(local));
      return;
    }
    const { error } = await supabase.from('bids').upsert(Map.bid.toDB(bid));
    if (error) throw error;
  },

  async saveUser(user: User) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS));
      const idx = local.findIndex((u: any) => u.id === user.id);
      if (idx >= 0) local[idx] = user; else local.push(user);
      localStorage.setItem('qb_u', JSON.stringify(local));
      return;
    }
    await supabase.from('users').upsert(Map.user.toDB(user));
  }
};

const Badge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    [RFQStatus.OPEN]: 'bg-green-100 text-green-800',
    [RFQStatus.CLOSED]: 'bg-gray-100 text-gray-800',
    [RFQStatus.AWARDED]: 'bg-blue-100 text-blue-800',
    [UserRole.SYS_ADMIN]: 'bg-purple-100 text-purple-800',
    [UserRole.ADMIN]: 'bg-indigo-100 text-indigo-800',
    [UserRole.VENDOR]: 'bg-emerald-100 text-emerald-800',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${styles[status] || 'bg-gray-100 text-gray-800'}`}>{status}</span>;
};

const UsersList: React.FC<{ users: User[] }> = ({ users }) => (
  <div className="space-y-6">
    <h2 className="text-3xl font-black text-gray-900 tracking-tight">用户管理</h2>
    <div className="bg-white rounded-[40px] shadow-sm border border-gray-50 overflow-hidden">
      <table className="w-full text-left">
        <thead><tr className="bg-gray-50/50">
          <th className="p-6 text-[10px] font-black uppercase text-gray-400">ID</th>
          <th className="p-6 text-[10px] font-black uppercase text-gray-400">名称/公司</th>
          <th className="p-6 text-[10px] font-black uppercase text-gray-400">身份</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-50">
          {users.map(u => (
            <tr key={u.id}>
              <td className="p-6 font-black text-indigo-600">{u.id}</td>
              <td className="p-6 font-bold text-gray-900">{u.name}<br/><span className="text-[10px] text-gray-400 uppercase">{u.company}</span></td>
              <td className="p-6"><Badge status={u.role} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const RFQDetail: React.FC<{ rfq: RFQ, bids: Bid[], user: User, onAddBid: (bid: Bid) => void }> = ({ rfq, bids, user, onAddBid }) => {
  const [amount, setAmount] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const rfqBids = useMemo(() => bids.filter(b => b.rfqId === rfq.id), [bids, rfq.id]);
  
  const visibleBids = useMemo(() => {
    if (user.role === UserRole.ADMIN || user.role === UserRole.SYS_ADMIN) return rfqBids;
    return rfqBids.filter(b => b.vendorId === user.id);
  }, [rfqBids, user]);

  const myBid = rfqBids.find(b => b.vendorId === user.id);

  const submitBid = async () => {
    const val = parseFloat(amount);
    if(isNaN(val) || val <= 0) return alert('请输入有效价格');
    setIsSyncing(true);
    try {
      const bid: Bid = {
        id: myBid?.id || 'B-'+Date.now(), rfqId: rfq.id, vendorId: user.id, vendorName: user.company || user.name,
        amount: val, currency: 'CNY', deliveryDate: '', notes: '', timestamp: new Date().toISOString(), itemQuotes: []
      };
      await DataService.saveBid(bid);
      onAddBid(bid);
      alert('报价已成功上传云端');
      setAmount('');
    } catch (e) {
      console.error(e);
      alert('同步失败，请检查网络和云端权限');
    } finally { setIsSyncing(false); }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
        <Badge status={rfq.status} />
        <h2 className="text-3xl font-black mt-2 mb-4 text-gray-900">{rfq.title}</h2>
        <p className="text-gray-500 text-sm">{rfq.description}</p>
      </div>
      <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
        <div className="flex justify-between items-center mb-10">
          <h3 className="font-black text-xl text-gray-800">{user.role === UserRole.VENDOR ? '我的出价' : '实时竞价看板'}</h3>
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-2xl">
             <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
             <span className="text-[10px] font-black text-green-600 uppercase">云端实时连接中</span>
          </div>
        </div>
        {visibleBids.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <BarChart data={[...visibleBids].sort((a,b)=>a.amount - b.amount)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="vendorName" fontSize={10} fontWeight="bold" />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#F9FAFB'}} contentStyle={{borderRadius: '24px', border: 'none', fontWeight: 'bold'}} />
                <Bar dataKey="amount" fill="#4F46E5" radius={[12, 12, 0, 0]} barSize={50}>
                  {visibleBids.map((entry, index) => <Cell key={index} fill={entry.vendorId === user.id ? '#F59E0B' : '#4F46E5'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="text-center py-16 text-gray-300 font-bold italic">等待供应商报价数据...</div>}
      </div>
      {user.role === UserRole.VENDOR && (
        <div className="bg-white p-8 rounded-[40px] shadow-2xl border border-gray-100 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-gray-400">¥</span>
            <input type="number" placeholder="输入您的含税总价" className="w-full pl-10 pr-5 py-5 bg-gray-50 rounded-2xl font-black text-lg outline-none focus:ring-2 focus:ring-indigo-500" value={amount} onChange={e=>setAmount(e.target.value)} />
          </div>
          <button onClick={submitBid} disabled={isSyncing} className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50">
            {isSyncing ? '正在同步...' : (myBid ? '更新报价' : '确认提交')}
          </button>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('qb_curr_u');
    return saved ? JSON.parse(saved) : null;
  });
  const [showCloudSet, setShowCloudSet] = useState(false);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) localStorage.setItem('qb_curr_u', JSON.stringify(user));
    else localStorage.removeItem('qb_curr_u');
  }, [user]);

  const loadAll = async () => {
    console.log("Syncing with cloud...");
    setLoading(true);
    try {
      const [r, b, u] = await Promise.all([DataService.getRFQs(), DataService.getBids(), DataService.getUsers()]);
      setRfqs(r); setBids(b); setUsers(u);
    } catch (e) {
      console.error("Sync Failed:", e);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    loadAll();
    if (supabase) {
      // 监听所有表的任何变动，一旦变动立即触发全量更新
      const sub = supabase.channel('realtime-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rfqs' }, loadAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bids' }, loadAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, loadAll)
        .subscribe((status: string) => {
          console.log("Realtime Subscription Status:", status);
        });
      return () => { supabase.removeChannel(sub); };
    }
  }, []);

  if (!user) return <AuthPage onAuth={setUser} />;

  const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SYS_ADMIN;

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {showCloudSet && <CloudSettings onClose={() => setShowCloudSet(false)} />}
        <nav className="h-20 bg-white/70 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-100 px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 font-black text-2xl text-indigo-600">
            <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-100"><Icons.Shield /></div>
            <span className="hidden sm:inline tracking-tighter">QuickBid</span>
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={loadAll} className={`p-3 rounded-2xl text-gray-400 hover:bg-gray-100 transition-all ${loading ? 'animate-spin text-indigo-600' : ''}`} title="手动同步">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            {isAdmin && <Link to="/users" className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:text-indigo-600 hover:bg-white transition-all shadow-sm"><Icons.User /></Link>}
            <button onClick={() => setShowCloudSet(true)} className={`p-3 rounded-2xl transition-all ${DataService.isCloud() ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600 animate-pulse'}`}><Icons.Settings /></button>
            <div className="h-8 w-[1px] bg-gray-100 mx-2"></div>
            <button onClick={() => { if(confirm('退出登录？')) setUser(null); }} className="text-[10px] font-black text-red-500 uppercase bg-red-50 px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all">退出</button>
          </div>
        </nav>

        <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
          <Routes>
            <Route path="/" element={
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">项目中心</h2>
                    <p className="text-gray-400 text-xs mt-1 font-bold">
                      {DataService.isCloud() ? '🌐 实时互联：所有用户可见' : '🔕 本地隔离：仅自己可见'}
                    </p>
                  </div>
                  {isAdmin && (
                    <button onClick={async () => {
                      const title = window.prompt('询价项目名称:');
                      if(!title) return;
                      const r: RFQ = { id: 'R-'+Date.now(), title, description: '请输入询价的具体需求...', deadline: '2025-12-31', status: RFQStatus.OPEN, createdAt: new Date().toISOString(), creatorId: user.id, items: [] };
                      await DataService.saveRFQ(r);
                      setRfqs(p => [r, ...p]);
                    }} className="bg-indigo-600 text-white p-5 rounded-[28px] shadow-2xl shadow-indigo-200 hover:scale-110 active:scale-95 transition-all"><Icons.Plus /></button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {rfqs.map(r => (
                    <Link key={r.id} to={`/rfq/${r.id}`} className="group bg-white p-10 rounded-[48px] border border-gray-50 shadow-sm hover:shadow-2xl hover:border-indigo-100 transition-all">
                      <Badge status={r.status} />
                      <h3 className="text-2xl font-black text-gray-800 mt-4 mb-2 group-hover:text-indigo-600 transition-colors">{r.title}</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">截止日期: {r.deadline}</p>
                    </Link>
                  ))}
                  {rfqs.length === 0 && (
                    <div className="col-span-full py-24 text-center border-2 border-dashed border-gray-100 rounded-[48px]">
                       <p className="text-gray-300 font-bold italic">暂无询价项目</p>
                    </div>
                  )}
                </div>
              </div>
            } />
            <Route path="/users" element={isAdmin ? <UsersList users={users} /> : <Navigate to="/" />} />
            <Route path="/rfq/:id" element={<RFQDetailWrapper rfqs={rfqs} bids={bids} user={user} setBids={setBids} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

const RFQDetailWrapper = ({ rfqs, bids, user, setBids }: any) => {
  const { id } = useParams();
  const rfq = rfqs.find((r:any) => r.id === id);
  if (!rfq) return <div className="text-center py-40 text-gray-300 font-black italic animate-pulse">正在同步云端项目数据...</div>;
  return <RFQDetail rfq={rfq} bids={bids} user={user} onAddBid={b => setBids((p:any) => {
    const idx = p.findIndex((x:any)=>x.rfqId===b.rfqId && x.vendorId===b.vendorId);
    if(idx>=0){ const n = [...p]; n[idx]=b; return n; }
    return [b, ...p];
  })} />;
};

const CloudSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [cfg, setCfg] = useState(getCloudConfig());
  const save = () => {
    localStorage.setItem('qb_cloud_url', cfg.url.trim());
    localStorage.setItem('qb_cloud_key', cfg.key.trim());
    window.location.reload();
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl animate-in zoom-in-95 duration-300">
        <h3 className="text-xl font-black mb-2">连接到云端数据库</h3>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">填入凭证以启用全员同步竞价</p>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-gray-400 mb-1 block">SUPABASE URL</label>
            <input type="text" placeholder="https://..." className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-indigo-500 outline-none" value={cfg.url} onChange={e=>setCfg({...cfg, url: e.target.value})} />
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-400 mb-1 block">ANON KEY</label>
            <input type="password" placeholder="eyJ..." className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-indigo-500 outline-none" value={cfg.key} onChange={e=>setCfg({...cfg, key: e.target.value})} />
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="flex-1 p-4 bg-gray-100 rounded-2xl font-black text-xs uppercase hover:bg-gray-200 transition-colors">取消</button>
            <button onClick={save} className="flex-1 p-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">保存并重启</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AuthPage: React.FC<{ onAuth: (user: User) => void }> = ({ onAuth }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ id: '', password: '', name: '', company: '', role: UserRole.VENDOR });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const all = await DataService.getUsers();
      if (isLogin) {
        const u = all.find((x:any) => x.id === formData.id && x.password === formData.password);
        if (u) onAuth(u); else alert('账号或密码不匹配');
      } else {
        if (!formData.id || !formData.password || !formData.name) return alert('请填全注册信息');
        if (all.find((x:any) => x.id === formData.id)) return alert('该 ID 已被注册');
        const newUser = { ...formData, createdAt: new Date().toISOString() };
        await DataService.saveUser(newUser);
        onAuth(newUser);
      }
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[60px] p-12 shadow-2xl animate-in zoom-in-95 duration-500">
        <div className="text-center mb-10">
           <div className="inline-block p-5 bg-indigo-600 text-white rounded-[24px] mb-4 shadow-2xl shadow-indigo-100"><Icons.Shield /></div>
           <h1 className="text-3xl font-black text-gray-900 tracking-tighter">QuickBid</h1>
           <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">云端协同竞价平台</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="账号 ID" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={formData.id} onChange={e=>setFormData({...formData, id: e.target.value})} />
          {!isLogin && (
            <>
              <input type="text" placeholder="真实姓名 / 公司名" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
              <select className="w-full p-5 bg-gray-50 rounded-3xl font-black text-indigo-600 outline-none" value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value as UserRole})}>
                <option value={UserRole.VENDOR}>乙方 (供应商)</option>
                <option value={UserRole.ADMIN}>甲方 (采购员)</option>
              </select>
            </>
          )}
          <input type="password" placeholder="访问密码" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} />
          <button disabled={isSubmitting} className="w-full bg-indigo-600 text-white py-6 rounded-[32px] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all mt-4 disabled:opacity-50">
            {isSubmitting ? '同步中...' : (isLogin ? '立即登录' : '立即注册并登录')}
          </button>
        </form>
        <button onClick={()=>setIsLogin(!isLogin)} className="w-full mt-10 text-indigo-600 text-[10px] font-black uppercase tracking-widest text-center hover:underline transition-all">
          {isLogin ? '没有账号？点此注册' : '已有账号？点此登录'}
        </button>
      </div>
    </div>
  );
};

const INITIAL_USERS: User[] = [
  { id: 'admin', name: '系统管理员', role: UserRole.SYS_ADMIN, company: 'QuickBid', password: 'admin', createdAt: new Date().toISOString() },
  { id: 'buyer', name: '王采购', role: UserRole.ADMIN, company: '演示采购中心', password: '123', createdAt: new Date().toISOString() },
  { id: 'vendor1', name: '李供货', role: UserRole.VENDOR, company: '演示供应商', password: '123', createdAt: new Date().toISOString() }
];

export default App;
