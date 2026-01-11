
import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { User, UserRole, RFQ, Bid, RFQStatus } from './types';
import { Icons, COLORS } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// --- 云端配置状态管理 ---
const getCloudConfig = () => ({
  url: localStorage.getItem('qb_cloud_url') || '',
  key: localStorage.getItem('qb_cloud_key') || ''
});

// --- 数据服务抽象层 ---
let supabase: any = null;
const initSupabase = () => {
  const { url, key } = getCloudConfig();
  if (url && key) supabase = createClient(url, key);
};
initSupabase();

const DataService = {
  isCloud() { return !!supabase; },
  
  async getRFQs() {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_r') || '[]');
    const { data } = await supabase.from('rfqs').select('*').order('created_at', { ascending: false });
    return data || [];
  },

  async getBids(rfqId?: string) {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_b') || '[]');
    let query = supabase.from('bids').select('*');
    if (rfqId) query = query.eq('rfq_id', rfqId);
    const { data } = await query;
    return data || [];
  },

  async saveRFQ(rfq: RFQ) {
    if (!supabase) return;
    await supabase.from('rfqs').upsert({
      id: rfq.id, title: rfq.title, description: rfq.description, 
      deadline: rfq.deadline, status: rfq.status, creator_id: rfq.creatorId
    });
  },

  async saveBid(bid: Bid) {
    if (!supabase) return;
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
    localStorage.setItem('qb_cloud_url', cfg.url);
    localStorage.setItem('qb_cloud_key', cfg.key);
    window.location.reload();
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl animate-in zoom-in-95 duration-300">
        <h3 className="text-xl font-black mb-2 flex items-center gap-2"><Icons.Shield /> 云端联网设置</h3>
        <p className="text-xs text-gray-400 mb-6 font-bold uppercase tracking-widest">连接 Supabase 开启全员协作</p>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Supabase Project URL</label>
            <input type="text" className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold" value={cfg.url} onChange={e=>setCfg({...cfg, url: e.target.value})} />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Anon Public Key</label>
            <input type="password" className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold" value={cfg.key} onChange={e=>setCfg({...cfg, key: e.target.value})} />
          </div>
          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="flex-1 p-4 rounded-2xl font-black text-xs uppercase bg-gray-100">取消</button>
            <button onClick={save} className="flex-1 p-4 rounded-2xl font-black text-xs uppercase bg-indigo-600 text-white shadow-lg">保存并连接</button>
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
  
  // 核心逻辑：乙方只能看自己的，甲方看所有的
  const visibleBids = useMemo(() => {
    if (user.role === UserRole.ADMIN || user.role === UserRole.SYS_ADMIN) return rfqBids;
    return rfqBids.filter(b => b.vendorId === user.id);
  }, [rfqBids, user]);

  const myBid = rfqBids.find(b => b.vendorId === user.id);

  const submitBid = async () => {
    if(!amount) return;
    setIsSyncing(true);
    const newBid: Bid = {
      id: myBid?.id || 'BID-'+Date.now(), rfqId: rfq.id, vendorId: user.id, vendorName: user.company || user.name,
      amount: parseFloat(amount), currency: 'CNY', deliveryDate: '', notes: '', timestamp: new Date().toISOString(), itemQuotes: []
    };
    await DataService.saveBid(newBid);
    onAddBid(newBid);
    setIsSyncing(false);
    alert('报价已实时同步至云端！');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
        <Badge status={rfq.status} />
        <h2 className="text-3xl font-black mt-2 mb-4">{rfq.title}</h2>
        <p className="text-gray-500 text-sm">{rfq.description}</p>
      </div>

      <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
        <div className="flex justify-between items-center mb-10">
          <h3 className="font-black text-xl">
            {user.role === UserRole.VENDOR ? '我的出价状态' : '竞价对比看板'}
          </h3>
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-2xl">
             <span className="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
             <span className="text-[10px] font-black text-green-600 uppercase">云端同步中</span>
          </div>
        </div>

        {visibleBids.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <BarChart data={visibleBids.sort((a,b)=>a.amount - b.amount)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="vendorName" fontSize={10} fontWeight="bold" />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#F9FAFB'}} contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.05)'}} />
                <Bar dataKey="amount" fill="#4F46E5" radius={[12, 12, 0, 0]} barSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-300 italic font-bold">暂无报价数据</div>
        )}
      </div>

      {user.role === UserRole.VENDOR && (
        <div className="bg-white p-8 rounded-[40px] shadow-2xl border border-gray-100 flex gap-4">
          <input type="number" placeholder="输入您的报价" className="flex-1 p-5 bg-gray-50 rounded-2xl font-black text-lg outline-none" value={amount} onChange={e=>setAmount(e.target.value)} />
          <button onClick={submitBid} disabled={isSyncing} className="bg-indigo-600 text-white px-10 rounded-2xl font-black shadow-xl shadow-indigo-100">
            {isSyncing ? '同步中...' : '提交云端报价'}
          </button>
        </div>
      )}
    </div>
  );
};

// --- 主应用逻辑 ---
const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [showCloudSet, setShowCloudSet] = useState(false);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [users, setUsers] = useState<User[]>(() => JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS)));

  // 初始加载及实时监听
  useEffect(() => {
    const load = async () => {
      setRfqs(await DataService.getRFQs());
      setBids(await DataService.getBids());
    };
    load();

    if (supabase) {
      const channel = supabase.channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rfqs' }, load)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bids' }, load)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, []);

  if (!user) return <AuthPage users={users} onAuth={setUser} onRegister={u => setUsers(p => [...p, u])} />;

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {showCloudSet && <CloudSettings onClose={() => setShowCloudSet(false)} />}
        
        <nav className="h-20 bg-white/70 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-100 px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 font-black text-2xl text-indigo-600 tracking-tighter">
            <div className="bg-indigo-600 text-white p-2 rounded-xl"><Icons.Shield /></div>
            <span>QuickBid</span>
          </Link>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowCloudSet(true)} className={`p-3 rounded-2xl transition-all ${DataService.isCloud() ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
              <Icons.Settings />
            </button>
            <button onClick={() => setUser(null)} className="text-[10px] font-black text-red-400 uppercase tracking-widest bg-red-50 px-4 py-2 rounded-xl">Exit</button>
          </div>
        </nav>

        <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
          <Routes>
            <Route path="/" element={
              <div className="space-y-10">
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">项目工作台</h2>
                    <p className="text-gray-400 text-sm mt-1">{DataService.isCloud() ? '云端协作模式' : '本地存储模式'}</p>
                  </div>
                  {user.role === UserRole.ADMIN && (
                    <button onClick={async () => {
                      const newR: RFQ = { id: 'RFQ-'+Date.now(), title: '新询价项目', description: '请输入项目需求...', deadline: '2025-12-31', status: RFQStatus.OPEN, createdAt: new Date().toISOString(), creatorId: user.id, items: [] };
                      await DataService.saveRFQ(newR);
                      setRfqs(p => [newR, ...p]);
                    }} className="bg-indigo-600 text-white p-5 rounded-[28px] shadow-2xl shadow-indigo-200">
                      <Icons.Plus />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {rfqs.map(r => (
                    <Link key={r.id} to={`/rfq/${r.id}`} className="bg-white p-10 rounded-[48px] border border-gray-50 shadow-sm hover:shadow-2xl transition-all">
                      <Badge status={r.status} />
                      <h3 className="text-2xl font-black text-gray-800 mt-4 mb-2">{r.title}</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">截止: {r.deadline}</p>
                    </Link>
                  ))}
                </div>
              </div>
            } />
            <Route path="/rfq/:id" element={<RFQDetailWrapper rfqs={rfqs} bids={bids} user={user} setBids={setBids} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

const RFQDetailWrapper = ({ rfqs, bids, user, setBids }: any) => {
  const { id } = useParams();
  const rfq = rfqs.find((r:any) => r.id === id);
  if (!rfq) return <div className="text-center py-40 font-black text-gray-300 italic">正在从云端加载数据...</div>;
  return <RFQDetail rfq={rfq} bids={bids} user={user} onAddBid={b => setBids((p:any) => {
    const idx = p.findIndex((x:any)=>x.rfqId===b.rfqId && x.vendorId===b.vendorId);
    if(idx>=0){ const n = [...p]; n[idx]=b; return n; }
    return [b, ...p];
  })} />;
};

const AuthPage: React.FC<{ users: User[], onAuth: (user: User) => void, onRegister: (user: User) => void }> = ({ users, onAuth, onRegister }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ id: '', password: '', name: '', company: '', role: UserRole.VENDOR });
  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[60px] p-12 shadow-2xl">
        <div className="text-center mb-10">
          <div className="inline-block p-5 bg-indigo-600 text-white rounded-[24px] mb-4 shadow-2xl shadow-indigo-100"><Icons.Shield /></div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter">QuickBid</h1>
          <p className="text-gray-400 text-[10px] font-black uppercase mt-2">Professional RFQ OS</p>
        </div>
        <form onSubmit={e => {
          e.preventDefault();
          const found = users.find(u => u.id === formData.id && u.password === formData.password);
          if (isLogin) {
            if (found) onAuth(found); else alert('账号或密码错误');
          } else {
            const newUser = { ...formData, createdAt: new Date().toISOString() };
            onRegister(newUser); onAuth(newUser);
          }
        }} className="space-y-4">
          <input type="text" placeholder="ID" className="w-full p-5 bg-gray-50 rounded-3xl font-bold outline-none" value={formData.id} onChange={e=>setFormData({...formData, id: e.target.value})} />
          {!isLogin && (
            <select className="w-full p-5 bg-gray-50 rounded-3xl font-black text-indigo-600" value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value as UserRole})}>
              <option value={UserRole.VENDOR}>乙方 (供应商)</option>
              <option value={UserRole.ADMIN}>甲方 (采购方)</option>
            </select>
          )}
          <input type="password" placeholder="密码" className="w-full p-5 bg-gray-50 rounded-3xl font-bold outline-none" value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} />
          <button className="w-full bg-indigo-600 text-white py-6 rounded-[32px] font-black shadow-xl mt-4">
            {isLogin ? '进入系统' : '注册并登录'}
          </button>
        </form>
        <button onClick={()=>setIsLogin(!isLogin)} className="w-full mt-10 text-indigo-600 text-[10px] font-black uppercase text-center">{isLogin ? '没有账号？创建' : '已有账号？登录'}</button>
      </div>
    </div>
  );
};

const INITIAL_USERS: User[] = [
  { id: 'admin', name: '管理员', role: UserRole.SYS_ADMIN, company: 'QuickBid', password: 'admin', createdAt: new Date().toISOString() },
  { id: 'buyer', name: '采购经理', role: UserRole.ADMIN, company: '演示公司', password: '123', createdAt: new Date().toISOString() },
  { id: 'vendor', name: '供应经理', role: UserRole.VENDOR, company: '演示厂商', password: '123', createdAt: new Date().toISOString() }
];

export default App;
