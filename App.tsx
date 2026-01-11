
import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { User, UserRole, RFQ, Bid, RFQStatus } from './types';
import { Icons, COLORS } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// --- 云端配置持久化 ---
const getCloudConfig = () => ({
  url: localStorage.getItem('qb_cloud_url') || '',
  key: localStorage.getItem('qb_cloud_key') || ''
});

// --- 数据服务抽象层 ---
let supabase: any = null;
const initSupabase = () => {
  const { url, key } = getCloudConfig();
  if (url && key) {
    try {
      supabase = createClient(url, key);
    } catch (e) {
      console.error("Supabase 初始化失败:", e);
    }
  }
};
initSupabase();

const DataService = {
  isCloud() { return !!supabase; },
  
  async getRFQs() {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_r') || '[]');
    try {
      const { data, error } = await supabase.from('rfqs').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error("获取 RFQ 失败:", e);
      return [];
    }
  },

  async getBids(rfqId?: string) {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_b') || '[]');
    try {
      let query = supabase.from('bids').select('*');
      if (rfqId) query = query.eq('rfq_id', rfqId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error("获取报价失败:", e);
      return [];
    }
  },

  async saveRFQ(rfq: RFQ) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_r') || '[]');
      localStorage.setItem('qb_r', JSON.stringify([rfq, ...local]));
      return;
    }
    await supabase.from('rfqs').upsert({
      id: rfq.id, title: rfq.title, description: rfq.description, 
      deadline: rfq.deadline, status: rfq.status, creator_id: rfq.creatorId
    });
  },

  async saveBid(bid: Bid) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_b') || '[]');
      localStorage.setItem('qb_b', JSON.stringify([bid, ...local]));
      return;
    }
    await supabase.from('bids').upsert({
      id: bid.id, rfq_id: bid.rfqId, vendor_id: bid.vendorId, 
      vendor_name: bid.vendorName, amount: bid.amount
    });
  }
};

// --- 通用 UI 组件 ---
const Badge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    [RFQStatus.OPEN]: 'bg-green-100 text-green-800',
    [RFQStatus.CLOSED]: 'bg-gray-100 text-gray-800',
    [RFQStatus.AWARDED]: 'bg-blue-100 text-blue-800',
    [UserRole.SYS_ADMIN]: 'bg-purple-100 text-purple-800',
    [UserRole.ADMIN]: 'bg-indigo-100 text-indigo-800',
    [UserRole.VENDOR]: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
};

// --- 云端设置面板 ---
const CloudSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [cfg, setCfg] = useState(getCloudConfig());
  const save = () => {
    if (cfg.url && !cfg.url.startsWith('http')) {
      alert('请输入有效的 Supabase URL');
      return;
    }
    localStorage.setItem('qb_cloud_url', cfg.url);
    localStorage.setItem('qb_cloud_key', cfg.key);
    // 强制刷新以应用新配置，由于现在有 session 持久化，不会再跳回登录页
    window.location.reload();
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl animate-in zoom-in-95 duration-300">
        <h3 className="text-xl font-black mb-2 flex items-center gap-2 text-gray-900"><Icons.Shield /> 云端联网设置</h3>
        <p className="text-xs text-gray-400 mb-6 font-bold uppercase tracking-widest">填入 Supabase 凭证开启全员实时竞价</p>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Supabase Project URL</label>
            <input type="text" placeholder="https://xyz.supabase.co" className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={cfg.url} onChange={e=>setCfg({...cfg, url: e.target.value})} />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Anon Public Key</label>
            <input type="password" placeholder="eyJhbG..." className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={cfg.key} onChange={e=>setCfg({...cfg, key: e.target.value})} />
          </div>
          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="flex-1 p-4 rounded-2xl font-black text-xs uppercase bg-gray-100 hover:bg-gray-200 transition-colors">取消</button>
            <button onClick={save} className="flex-1 p-4 rounded-2xl font-black text-xs uppercase bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-colors">保存配置并连接</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- 询价详情：联网版 ---
const RFQDetail: React.FC<{ rfq: RFQ, bids: Bid[], user: User, onAddBid: (bid: Bid) => void }> = ({ rfq, bids, user, onAddBid }) => {
  const [amount, setAmount] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const rfqBids = bids.filter(b => b.rfqId === rfq.id);
  
  // 信息隔离逻辑：乙方只能看自己的，甲方看所有的
  const visibleBids = useMemo(() => {
    if (user.role === UserRole.ADMIN || user.role === UserRole.SYS_ADMIN) return rfqBids;
    return rfqBids.filter(b => b.vendorId === user.id);
  }, [rfqBids, user]);

  const myBid = rfqBids.find(b => b.vendorId === user.id);

  const submitBid = async () => {
    const val = parseFloat(amount);
    if(isNaN(val) || val <= 0) return alert('请输入有效的报价金额');
    setIsSyncing(true);
    try {
      const newBid: Bid = {
        id: myBid?.id || 'BID-'+Date.now(), rfqId: rfq.id, vendorId: user.id, vendorName: user.company || user.name,
        amount: val, currency: 'CNY', deliveryDate: '', notes: '', timestamp: new Date().toISOString(), itemQuotes: []
      };
      await DataService.saveBid(newBid);
      onAddBid(newBid);
      alert('报价已实时同步至云端！');
    } catch (e) {
      alert('同步失败，请检查网络或云端配置');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
        <Badge status={rfq.status} />
        <h2 className="text-3xl font-black mt-2 mb-4 text-gray-900">{rfq.title}</h2>
        <p className="text-gray-500 text-sm leading-relaxed">{rfq.description}</p>
      </div>

      <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
        <div className="flex justify-between items-center mb-10">
          <h3 className="font-black text-xl text-gray-800">
            {user.role === UserRole.VENDOR ? '我的出价状态' : '竞价看板 (所有供应商)'}
          </h3>
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-2xl">
             <span className="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
             <span className="text-[10px] font-black text-green-600 uppercase">云端实时模式</span>
          </div>
        </div>

        {visibleBids.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <BarChart data={visibleBids.sort((a,b)=>a.amount - b.amount)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="vendorName" fontSize={10} fontWeight="bold" stroke="#94a3b8" />
                <YAxis fontSize={10} axisLine={false} tickLine={false} stroke="#94a3b8" />
                <Tooltip 
                  cursor={{fill: '#F9FAFB'}} 
                  contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.05)', fontWeight: 'bold'}} 
                />
                <Bar dataKey="amount" fill="#4F46E5" radius={[12, 12, 0, 0]} barSize={50}>
                  {visibleBids.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.vendorId === user.id ? '#F59E0B' : '#4F46E5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-300 italic font-bold">等待报价数据上传...</div>
        )}
      </div>

      {user.role === UserRole.VENDOR && (
        <div className="bg-white p-8 rounded-[40px] shadow-2xl border border-gray-100 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
             <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-gray-400">¥</span>
             <input type="number" placeholder="输入含税总价" className="w-full pl-10 pr-5 py-5 bg-gray-50 rounded-2xl font-black text-lg outline-none focus:ring-2 focus:ring-indigo-500" value={amount} onChange={e=>setAmount(e.target.value)} />
          </div>
          <button onClick={submitBid} disabled={isSyncing} className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50">
            {isSyncing ? '同步中...' : (myBid ? '更新云端报价' : '提交云端报价')}
          </button>
        </div>
      )}
    </div>
  );
};

// --- 主应用逻辑 ---
const App: React.FC = () => {
  // 核心：从 localStorage 初始化用户，解决刷新页面回登录页的问题
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('qb_curr_u');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [showCloudSet, setShowCloudSet] = useState(false);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [users, setUsers] = useState<User[]>(() => JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS)));

  // 当 user 改变时持久化到 localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('qb_curr_u', JSON.stringify(user));
    } else {
      localStorage.removeItem('qb_curr_u');
    }
  }, [user]);

  // 当 users 列表改变时持久化
  useEffect(() => {
    localStorage.setItem('qb_u', JSON.stringify(users));
  }, [users]);

  // 数据加载与实时订阅
  useEffect(() => {
    const load = async () => {
      setRfqs(await DataService.getRFQs());
      setBids(await DataService.getBids());
    };
    load();

    if (supabase) {
      const channel = supabase.channel('realtime-quotes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rfqs' }, load)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bids' }, load)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, []);

  const handleLogout = () => {
    if(window.confirm('确定退出当前账号？')) setUser(null);
  };

  if (!user) return <AuthPage users={users} onAuth={setUser} onRegister={u => setUsers(p => [...p, u])} />;

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {showCloudSet && <CloudSettings onClose={() => setShowCloudSet(false)} />}
        
        <nav className="h-20 bg-white/70 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-100 px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 font-black text-2xl text-indigo-600 tracking-tighter">
            <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-100"><Icons.Shield /></div>
            <span>QuickBid</span>
          </Link>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowCloudSet(true)} 
              className={`p-3 rounded-2xl transition-all ${DataService.isCloud() ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600 animate-pulse'}`}
              title={DataService.isCloud() ? '云端已连接' : '点击配置云端'}
            >
              <Icons.Settings />
            </button>
            <div className="flex flex-col items-end mr-2">
               <span className="text-[10px] font-black text-gray-900 leading-none">{user.name}</span>
               <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">{user.company || '个人'}</span>
            </div>
            <button onClick={handleLogout} className="text-[10px] font-black text-red-400 uppercase tracking-widest bg-red-50 px-4 py-2 rounded-xl hover:bg-red-100 transition-colors">退出</button>
          </div>
        </nav>

        <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
          <Routes>
            <Route path="/" element={
              <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">项目列表</h2>
                    <p className="text-gray-400 text-sm mt-1">
                      {DataService.isCloud() ? '✅ 云端协作模式：数据全员同步' : '⚠️ 本地模式：数据仅存储在本机'}
                    </p>
                  </div>
                  {user.role === UserRole.ADMIN && (
                    <button onClick={async () => {
                      const title = window.prompt('请输入询价项目名称:');
                      if(!title) return;
                      const newR: RFQ = { id: 'RFQ-'+Date.now(), title, description: '请输入详细需求说明...', deadline: '2025-12-31', status: RFQStatus.OPEN, createdAt: new Date().toISOString(), creatorId: user.id, items: [] };
                      await DataService.saveRFQ(newR);
                      setRfqs(p => [newR, ...p]);
                    }} className="bg-indigo-600 text-white p-5 rounded-[28px] shadow-2xl shadow-indigo-200 hover:scale-110 active:scale-95 transition-all">
                      <Icons.Plus />
                    </button>
                  )}
                </div>

                {rfqs.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {rfqs.map(r => (
                      <Link key={r.id} to={`/rfq/${r.id}`} className="group bg-white p-10 rounded-[48px] border border-gray-50 shadow-sm hover:shadow-2xl transition-all relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-10 transition-opacity"><Icons.Layout /></div>
                        <Badge status={r.status} />
                        <h3 className="text-2xl font-black text-gray-800 mt-4 mb-2 group-hover:text-indigo-600 transition-colors">{r.title}</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">截止日期: {r.deadline}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white py-20 rounded-[48px] border-2 border-dashed border-gray-100 text-center">
                     <p className="text-gray-300 font-bold italic">暂无询价项目，请点击右下角按钮创建</p>
                  </div>
                )}
              </div>
            } />
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
  if (!rfq) return <div className="text-center py-40 font-black text-gray-300 animate-pulse italic">正在从云端加载项目数据...</div>;
  return <RFQDetail rfq={rfq} bids={bids} user={user} onAddBid={b => setBids((p:any) => {
    const idx = p.findIndex((x:any)=>x.rfqId===b.rfqId && x.vendorId===b.vendorId);
    if(idx>=0){ const n = [...p]; n[idx]=b; return n; }
    return [b, ...p];
  })} />;
};

const AuthPage: React.FC<{ users: User[], onAuth: (user: User) => void, onRegister: (user: User) => void }> = ({ users, onAuth, onRegister }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ id: '', password: '', name: '', company: '', role: UserRole.VENDOR });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      const found = users.find(u => u.id === formData.id && u.password === formData.password);
      if (found) onAuth(found); else alert('账号或密码错误');
    } else {
      if (!formData.id || !formData.password || !formData.name) return alert('请填写完整信息');
      if (users.find(u => u.id === formData.id)) return alert('ID 已存在');
      const newUser = { ...formData, createdAt: new Date().toISOString() };
      onRegister(newUser);
      onAuth(newUser);
    }
  };

  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[60px] p-12 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center mb-10">
          <div className="inline-block p-5 bg-indigo-600 text-white rounded-[24px] mb-4 shadow-2xl shadow-indigo-200"><Icons.Shield /></div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter">QuickBid</h1>
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Professional RFQ System</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="账号 ID" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold border-none outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={formData.id} onChange={e=>setFormData({...formData, id: e.target.value})} />
          {!isLogin && (
            <>
              <input type="text" placeholder="真实姓名 / 公司名" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold border-none outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
              <select className="w-full p-5 bg-gray-50 rounded-3xl font-black text-indigo-600 outline-none" value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value as UserRole})}>
                <option value={UserRole.VENDOR}>我是乙方 (供应商)</option>
                <option value={UserRole.ADMIN}>我是甲方 (采购方)</option>
              </select>
            </>
          )}
          <input type="password" placeholder="访问密码" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold border-none outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} />
          <button className="w-full bg-indigo-600 text-white py-6 rounded-[32px] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all mt-4">
            {isLogin ? '立即进入' : '创建账号并进入'}
          </button>
        </form>
        <button onClick={()=>setIsLogin(!isLogin)} className="w-full mt-10 text-indigo-600 text-[10px] font-black uppercase tracking-widest text-center hover:underline">
          {isLogin ? '还没有账号？点此创建' : '已有账号？点此登录'}
        </button>
      </div>
    </div>
  );
};

const INITIAL_USERS: User[] = [
  { id: 'admin', name: '系统管理员', role: UserRole.SYS_ADMIN, company: 'QuickBid', password: 'admin', createdAt: new Date().toISOString() },
  { id: 'buyer', name: '王采购', role: UserRole.ADMIN, company: '演示采购中心', password: '123', createdAt: new Date().toISOString() },
  { id: 'vendor1', name: '李供货', role: UserRole.VENDOR, company: '优质办公设备公司', password: '123', createdAt: new Date().toISOString() }
];

export default App;
