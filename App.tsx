
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { User, UserRole, RFQ, Bid, RFQStatus } from './types';
import { Icons, COLORS } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// --- 数据服务 ---
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

const INITIAL_USERS: User[] = [
  { id: 'admin', name: '系统管理员', role: UserRole.SYS_ADMIN, company: 'QuickBid', password: 'admin', createdAt: new Date().toISOString() },
  { id: 'buyer', name: '王采购', role: UserRole.ADMIN, company: '演示采购中心', password: '123', createdAt: new Date().toISOString() },
  { id: 'vendor1', name: '李供货', role: UserRole.VENDOR, company: '演示供应商', password: '123', createdAt: new Date().toISOString() }
];

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
    if (error) return [];
    return (data || []).map(Map.rfq.toModel);
  },
  async getBids() {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_b') || '[]');
    const { data, error } = await supabase.from('bids').select('*');
    if (error) return [];
    return (data || []).map(Map.bid.toModel);
  },
  async getUsers() {
    const localUsers = JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS));
    if (!supabase) return localUsers;
    const { data, error } = await supabase.from('users').select('*');
    if (error) return localUsers;
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
  async deleteRFQ(id: string) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_r') || '[]');
      localStorage.setItem('qb_r', JSON.stringify(local.filter((r: any) => r.id !== id)));
      const bids = JSON.parse(localStorage.getItem('qb_b') || '[]');
      localStorage.setItem('qb_b', JSON.stringify(bids.filter((b: any) => b.rfqId !== id)));
      return;
    }
    await supabase.from('rfqs').delete().eq('id', id);
    await supabase.from('bids').delete().eq('rfq_id', id);
  },
  async saveBid(bid: Bid) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_b') || '[]');
      const idx = local.findIndex((b: any) => b.rfqId === bid.rfqId && b.vendorId === bid.vendorId);
      if(idx >= 0) local[idx] = bid; else local.push(bid);
      localStorage.setItem('qb_b', JSON.stringify(local));
      return;
    }
    await supabase.from('bids').upsert(Map.bid.toDB(bid));
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
  },
  async deleteUser(id: string) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS));
      localStorage.setItem('qb_u', JSON.stringify(local.filter((u: any) => u.id !== id)));
      return;
    }
    await supabase.from('users').delete().eq('id', id);
  }
};

// --- 组件 ---

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

// 移动端左滑删除卡片
const SwipeableRFQCard: React.FC<{ 
  rfq: RFQ; 
  isBuyer: boolean; 
  onDelete: (id: string) => void;
}> = ({ rfq, isBuyer, onDelete }) => {
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const threshold = 80; // 滑动露出删除按钮的阈值

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isBuyer) return;
    setStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || !isBuyer) return;
    const x = e.touches[0].clientX - startX;
    // 仅允许向左滑动
    if (x < 0) {
      setCurrentX(isOpen ? x - threshold : x);
    }
  };

  const handleTouchEnd = () => {
    if (!isBuyer) return;
    setIsSwiping(false);
    if (currentX < -threshold / 2) {
      setIsOpen(true);
      setCurrentX(-threshold);
    } else {
      setIsOpen(false);
      setCurrentX(0);
    }
  };

  const deleteAction = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(rfq.id);
    setIsOpen(false);
    setCurrentX(0);
  };

  // 桌面端样式：悬浮显示
  // 移动端样式：滑动显示
  return (
    <div className="relative overflow-hidden rounded-[40px] bg-red-500 group">
      {/* 底部删除按钮层 (仅在滑动时可见) */}
      {isBuyer && (
        <div 
          onClick={deleteAction}
          className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center text-white cursor-pointer active:bg-red-700"
        >
          <Icons.Trash />
        </div>
      )}

      {/* 内容层 */}
      <div 
        className="relative bg-white transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${currentX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Link to={`/rfq/${rfq.id}`} className="block p-8 md:p-10 border border-gray-50 shadow-sm hover:shadow-xl transition-all h-full">
          <div className="flex justify-between items-center mb-4">
            <Badge status={rfq.status} />
            <span className="text-[10px] font-black text-gray-300">#{rfq.id.slice(-4)}</span>
          </div>
          <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-1">{rfq.title}</h3>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">截止: {rfq.deadline}</p>
        </Link>

        {/* 桌面端常驻删除按钮 (仅限宽屏且具备权限) */}
        {isBuyer && (
          <button 
            onClick={deleteAction}
            className="hidden md:flex absolute top-4 right-4 p-3 bg-white/80 backdrop-blur text-red-500 rounded-2xl shadow-sm border border-red-50 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
          >
            <Icons.Trash />
          </button>
        )}
      </div>
    </div>
  );
};

// --- 详情页面 ---
const RFQDetail: React.FC<{ rfq: RFQ, bids: Bid[], user: User, onAddBid: (bid: Bid) => void }> = ({ rfq, bids, user, onAddBid }) => {
  const [amount, setAmount] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const rfqBids = useMemo(() => bids.filter(b => b.rfqId === rfq.id), [bids, rfq.id]);
  const lowestBid = useMemo(() => {
    if (rfqBids.length === 0) return null;
    return rfqBids.reduce((min, b) => b.amount < min.amount ? b : min, rfqBids[0]);
  }, [rfqBids]);
  const myBid = rfqBids.find(b => b.vendorId === user.id);
  const isBuyer = user.role === UserRole.ADMIN || user.role === UserRole.SYS_ADMIN;

  const submitBid = async () => {
    const val = parseFloat(amount);
    if(isNaN(val) || val <= 0) return alert('请输入有效报价');
    setIsSyncing(true);
    try {
      const bid: Bid = {
        id: myBid?.id || 'B-'+Date.now(), rfqId: rfq.id, vendorId: user.id, vendorName: user.company || user.name,
        amount: val, currency: 'CNY', deliveryDate: '', notes: '', timestamp: new Date().toISOString(), itemQuotes: []
      };
      await DataService.saveBid(bid);
      onAddBid(bid);
      setAmount('');
      alert('已提交');
    } finally { setIsSyncing(false); }
  };

  return (
    <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-white p-8 md:p-10 rounded-[40px] shadow-sm border border-gray-50">
        <Badge status={rfq.status} />
        <h2 className="text-2xl md:text-3xl font-black mt-4 mb-4 text-gray-900 leading-tight">{rfq.title}</h2>
        <p className="text-gray-500 text-sm leading-relaxed">{rfq.description || '暂无详细描述'}</p>
        <div className="mt-8 pt-8 border-t border-gray-50 flex gap-8">
          <div><p className="text-[10px] font-black text-gray-400 uppercase">截止日期</p><p className="font-bold text-gray-700">{rfq.deadline}</p></div>
          <div><p className="text-[10px] font-black text-gray-400 uppercase">收到报价</p><p className="font-bold text-gray-700">{rfqBids.length} 份</p></div>
        </div>
      </div>

      {isBuyer ? (
        <div className="bg-white p-8 md:p-10 rounded-[40px] shadow-sm border border-gray-50">
          <h3 className="font-black text-xl text-gray-800 mb-8">竞价实时看板</h3>
          {rfqBids.length > 0 ? (
            <div className="space-y-8">
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart data={[...rfqBids].sort((a,b)=>a.amount-b.amount)}>
                    <XAxis dataKey="vendorName" fontSize={10} fontWeight="bold" />
                    <YAxis fontSize={10} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: '#F9FAFB'}} contentStyle={{borderRadius: '20px', border:'none', boxShadow:'0 10px 30px rgba(0,0,0,0.05)'}} />
                    <Bar dataKey="amount" fill="#4F46E5" radius={[10, 10, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-50 rounded-3xl overflow-hidden p-2">
                 <table className="w-full text-left text-sm">
                   <thead><tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest"><th className="p-4">供应商</th><th className="p-4">报价金额</th></tr></thead>
                   <tbody className="divide-y divide-gray-100">
                     {rfqBids.sort((a,b)=>a.amount-b.amount).map(b=>(
                       <tr key={b.id} className="hover:bg-white transition-colors"><td className="p-4 font-bold">{b.vendorName}</td><td className="p-4 font-black text-indigo-600">¥ {b.amount.toLocaleString()}</td></tr>
                     ))}
                   </tbody>
                 </table>
              </div>
            </div>
          ) : <div className="text-center py-20 text-gray-300 font-black italic">等待供应商报价数据...</div>}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-indigo-600 p-8 rounded-[40px] text-white shadow-xl">
              <p className="text-[10px] font-black uppercase opacity-60 mb-2">当前市场最低价</p>
              <div className="flex items-baseline gap-2"><span className="text-sm font-black">¥</span><h3 className="text-4xl font-black">{lowestBid ? lowestBid.amount.toLocaleString() : '---'}</h3></div>
            </div>
            <div className={`p-8 rounded-[40px] shadow-xl border-2 ${myBid ? (lowestBid && myBid.amount === lowestBid.amount ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-amber-200') : 'bg-white border-gray-100'}`}>
               <p className="text-[10px] font-black uppercase text-gray-400 mb-2">我的出价状态</p>
               {myBid ? (
                 <>
                   <div className="flex items-baseline gap-2 text-gray-900"><span className="text-sm font-black">¥</span><h3 className="text-4xl font-black">{myBid.amount.toLocaleString()}</h3></div>
                   <div className="mt-4">{lowestBid && myBid.amount === lowestBid.amount ? <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full uppercase">当前最低</span> : <span className="text-[10px] font-black text-amber-600 bg-amber-100 px-3 py-1 rounded-full uppercase">需优化报价</span>}</div>
                 </>
               ) : <p className="text-gray-300 italic font-black">未参与</p>}
            </div>
          </div>
          {rfq.status === RFQStatus.OPEN && (
            <div className="bg-white p-8 rounded-[40px] shadow-2xl border border-gray-100 flex flex-col md:flex-row gap-4 sticky bottom-8">
               <input type="number" placeholder="输入含税总报价" className="flex-1 p-5 bg-gray-50 rounded-2xl font-black text-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={amount} onChange={e=>setAmount(e.target.value)} />
               <button onClick={submitBid} disabled={isSyncing} className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black hover:bg-indigo-700 active:scale-95 transition-all">提交我的报价</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- 主页面 ---
const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('qb_curr_u');
    return saved ? JSON.parse(saved) : null;
  });
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) localStorage.setItem('qb_curr_u', JSON.stringify(user));
    else localStorage.removeItem('qb_curr_u');
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const [r, b, u] = await Promise.all([DataService.getRFQs(), DataService.getBids(), DataService.getUsers()]);
    setRfqs(r); setBids(b); setUsers(u);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    if (supabase) {
      const sub = supabase.channel('realtime').on('postgres_changes', { event: '*', schema: 'public' }, loadData).subscribe();
      return () => { supabase.removeChannel(sub); };
    }
  }, []);

  if (!user) return <AuthPage onAuth={setUser} />;

  const isBuyer = user.role === UserRole.ADMIN || user.role === UserRole.SYS_ADMIN;

  const handleDeleteRFQ = async (id: string) => {
    if (!confirm('确定删除该询价单及其所有关联报价？')) return;
    await DataService.deleteRFQ(id);
    await loadData();
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-indigo-100 overflow-x-hidden">
        <nav className="h-20 bg-white/80 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-100 px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 font-black text-2xl text-indigo-600">
            <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-100"><Icons.Shield /></div>
            <span className="hidden sm:inline">QuickBid</span>
          </Link>
          <div className="flex items-center gap-4">
             {user.role === UserRole.SYS_ADMIN && <Link to="/users" className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:text-indigo-600 transition-all"><Icons.User /></Link>}
             <button onClick={() => {if(confirm('登出账户？')) setUser(null)}} className="text-[10px] font-black text-red-500 uppercase bg-red-50 px-4 py-2 rounded-xl">登出</button>
          </div>
        </nav>

        <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full">
          <Routes>
            <Route path="/" element={
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">询价大厅</h2>
                    <p className="text-gray-400 text-[10px] font-black uppercase mt-1">
                      {isBuyer ? '管理我的项目' : '参与市场竞价'}
                    </p>
                  </div>
                  {isBuyer && (
                    <button onClick={async () => {
                      const title = prompt('项目名称:');
                      if(!title) return;
                      const r: RFQ = { id: 'R-'+Date.now(), title, description: '描述...', deadline: new Date(Date.now() + 7*24*3600*1000).toISOString().split('T')[0], status: RFQStatus.OPEN, createdAt: new Date().toISOString(), creatorId: user.id, items: [] };
                      await DataService.saveRFQ(r);
                      loadData();
                    }} className="bg-indigo-600 text-white p-5 rounded-[24px] shadow-2xl hover:scale-110 active:scale-95 transition-all"><Icons.Plus /></button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {rfqs.map(r => (
                    <SwipeableRFQCard 
                      key={r.id} 
                      rfq={r} 
                      isBuyer={isBuyer} 
                      onDelete={handleDeleteRFQ} 
                    />
                  ))}
                  {rfqs.length === 0 && <div className="col-span-full py-24 text-center text-gray-300 font-black italic border-2 border-dashed border-gray-100 rounded-[40px]">暂无公开询价项目</div>}
                </div>
                {/* 移动端提示 */}
                {isBuyer && (
                  <p className="text-center text-[10px] font-black text-gray-300 uppercase md:hidden">提示：向左滑动项目卡片可快速删除</p>
                )}
              </div>
            } />
            <Route path="/rfq/:id" element={<RFQDetailWrapper rfqs={rfqs} bids={bids} user={user} setBids={setBids} />} />
            <Route path="/users" element={user.role === UserRole.SYS_ADMIN ? <UsersManagement users={users} onUpdate={loadData} /> : <Navigate to="/" />} />
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
  if (!rfq) return <div className="py-40 text-center animate-pulse text-gray-300 font-black">正在加载项目...</div>;
  return <RFQDetail rfq={rfq} bids={bids} user={user} onAddBid={b => setBids((p:any) => {
    const idx = p.findIndex((x:any)=>x.rfqId===b.rfqId && x.vendorId===b.vendorId);
    if(idx>=0){ const n = [...p]; n[idx]=b; return n; }
    return [b, ...p];
  })} />;
};

const UsersManagement = ({ users, onUpdate }: { users: User[], onUpdate: () => void }) => {
  const handleReset = async (u: User) => {
    const p = prompt('新密码:', '123456');
    if(!p) return;
    await DataService.saveUser({...u, password: p});
    onUpdate();
  };
  return (
    <div className="bg-white rounded-[40px] shadow-sm border border-gray-50 overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase"><tr><th className="p-6">账号</th><th className="p-6">角色</th><th className="p-6 text-right">操作</th></tr></thead>
        <tbody className="divide-y divide-gray-50">
          {users.map(u=>(
            <tr key={u.id}><td className="p-6 font-black text-indigo-600">{u.id}</td><td className="p-6"><Badge status={u.role}/></td><td className="p-6 text-right"><button onClick={()=>handleReset(u)} className="p-2 hover:bg-indigo-50 rounded-xl text-indigo-600 transition-all"><Icons.Settings/></button></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AuthPage: React.FC<{ onAuth: (user: User) => void }> = ({ onAuth }) => {
  const [formData, setFormData] = useState({ id: '', password: '' });
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const all = await DataService.getUsers();
    const u = all.find((x:any) => x.id.toLowerCase() === formData.id.toLowerCase() && x.password === formData.password);
    if(u) onAuth(u); else alert('凭据错误');
  };
  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-6">
       <div className="bg-white w-full max-w-sm rounded-[60px] p-12 shadow-2xl animate-in zoom-in-95 duration-500">
         <div className="text-center mb-10"><div className="inline-block p-4 bg-indigo-600 text-white rounded-2xl mb-4"><Icons.Shield/></div><h1 className="text-3xl font-black text-gray-900">QuickBid</h1><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">企业竞标管理系统</p></div>
         <form onSubmit={handleLogin} className="space-y-4">
           <input type="text" placeholder="账户 ID" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold outline-none" value={formData.id} onChange={e=>setFormData({...formData, id: e.target.value})} />
           <input type="password" placeholder="密码" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold outline-none" value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} />
           <button className="w-full bg-indigo-600 text-white py-6 rounded-[32px] font-black shadow-xl mt-4 active:scale-95 transition-all">安全登录</button>
         </form>
         <p className="mt-8 text-center text-[10px] font-black text-gray-300 uppercase leading-relaxed">采购方账号: buyer (123)<br/>供应商账号: vendor1 (123)</p>
       </div>
    </div>
  );
};

export default App;
