
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
    return (data || []).map(Map.rfq.toModel);
  },
  async getBids() {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_b') || '[]');
    const { data, error } = await supabase.from('bids').select('*');
    return (data || []).map(Map.bid.toModel);
  },
  async getUsers() {
    const localUsers = JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS));
    if (!supabase) return localUsers;
    const { data, error } = await supabase.from('users').select('*');
    if (error) return localUsers;
    const cloudUsers = (data || []).map(Map.user.toModel);
    // 合并初始账号确保永远能登录
    const combined = [...cloudUsers];
    INITIAL_USERS.forEach(u => {
      if (!combined.find(c => c.id === u.id)) combined.push(u);
    });
    return combined;
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
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${styles[status] || 'bg-gray-100 text-gray-800'}`}>{status}</span>;
};

// 交互式卡片：手机端左滑删除
const SwipeableRFQCard: React.FC<{ 
  rfq: RFQ; 
  isBuyer: boolean; 
  onDelete: (id: string) => void;
}> = ({ rfq, isBuyer, onDelete }) => {
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const threshold = 90;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isBuyer) return;
    setStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || !isBuyer) return;
    const diff = e.touches[0].clientX - startX;
    // 限制向左滑动的范围
    if (diff < 0) {
      const offset = isOpen ? diff - threshold : diff;
      setCurrentX(Math.max(offset, -threshold - 20));
    } else if (isOpen) {
      setCurrentX(Math.min(diff - threshold, 0));
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

  return (
    <div className="relative overflow-hidden rounded-[40px] bg-red-600 group">
      {/* 底部删除按钮层 */}
      {isBuyer && (
        <button 
          onClick={deleteAction}
          className="absolute right-0 top-0 bottom-0 w-[90px] flex flex-col items-center justify-center text-white font-black text-[10px] uppercase gap-1 active:bg-red-800 transition-colors"
        >
          <Icons.Trash />
          <span>删除</span>
        </button>
      )}

      {/* 内容主体层 */}
      <div 
        className="relative bg-white transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${currentX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Link to={`/rfq/${rfq.id}`} className="block p-8 md:p-10 border border-gray-50 shadow-sm hover:shadow-xl transition-all h-full">
          <div className="flex justify-between items-center mb-4">
            <Badge status={rfq.status} />
            <span className="text-[10px] font-black text-gray-300">ID: {rfq.id.slice(-4)}</span>
          </div>
          <h3 className="text-xl md:text-2xl font-black text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-1">{rfq.title}</h3>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">截止日期: {rfq.deadline}</p>
        </Link>

        {/* 桌面端常驻删除 (Hover可见) */}
        {isBuyer && (
          <button 
            onClick={deleteAction}
            className="hidden md:flex absolute top-6 right-6 p-4 bg-red-50 text-red-600 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:text-white shadow-xl shadow-red-100"
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
    if(isNaN(val) || val <= 0) return alert('请输入有效的报价金额');
    setIsSyncing(true);
    try {
      const bid: Bid = {
        id: myBid?.id || 'B-'+Date.now(), rfqId: rfq.id, vendorId: user.id, vendorName: user.company || user.name,
        amount: val, currency: 'CNY', deliveryDate: '', notes: '', timestamp: new Date().toISOString(), itemQuotes: []
      };
      await DataService.saveBid(bid);
      onAddBid(bid);
      setAmount('');
      alert('报价成功！');
    } finally { setIsSyncing(false); }
  };

  return (
    <div className="space-y-6 pb-32 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
        <Badge status={rfq.status} />
        <h2 className="text-3xl font-black mt-6 mb-4 text-gray-900">{rfq.title}</h2>
        <p className="text-gray-500 text-sm leading-relaxed max-w-2xl">{rfq.description || '暂无详细描述'}</p>
        <div className="mt-10 pt-10 border-t border-gray-50 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div><p className="text-[10px] font-black text-gray-400 uppercase mb-1">截止日期</p><p className="font-bold text-gray-700">{rfq.deadline}</p></div>
          <div><p className="text-[10px] font-black text-gray-400 uppercase mb-1">收到报价</p><p className="font-bold text-gray-700">{rfqBids.length} 份</p></div>
        </div>
      </div>

      {isBuyer ? (
        <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
          <div className="flex justify-between items-center mb-10">
            <h3 className="font-black text-xl text-gray-900">实时竞价分析看板</h3>
            <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full uppercase">甲方专享视图</span>
          </div>
          {rfqBids.length > 0 ? (
            <div className="space-y-12">
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <BarChart data={[...rfqBids].sort((a,b)=>a.amount-b.amount)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="vendorName" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} dy={10} />
                    <YAxis fontSize={10} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: '#F9FAFB'}} contentStyle={{borderRadius: '24px', border:'none', boxShadow:'0 15px 40px rgba(0,0,0,0.08)'}} />
                    <Bar dataKey="amount" fill="#4F46E5" radius={[12, 12, 0, 0]} barSize={40}>
                      {rfqBids.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.amount === lowestBid?.amount ? '#10B981' : '#4F46E5'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-50 rounded-[32px] overflow-hidden">
                 <table className="w-full text-left text-sm">
                   <thead className="bg-gray-100/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                     <tr><th className="p-6">供应商</th><th className="p-6">报价金额 (CNY)</th><th className="p-6">报价时间</th></tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100">
                     {rfqBids.sort((a,b)=>a.amount-b.amount).map(b=>(
                       <tr key={b.id} className="hover:bg-white transition-colors">
                         <td className="p-6 font-bold text-gray-800">{b.vendorName}</td>
                         <td className="p-6 font-black text-indigo-600">¥ {b.amount.toLocaleString()}</td>
                         <td className="p-6 text-gray-400 text-xs">{new Date(b.timestamp).toLocaleString()}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
              </div>
            </div>
          ) : <div className="text-center py-24 text-gray-300 font-black italic">等待供应商进入市场报价</div>}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-indigo-600 p-10 rounded-[48px] text-white shadow-2xl shadow-indigo-200">
              <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-3">市场最优出价</p>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-black opacity-80">¥</span>
                <h3 className="text-5xl font-black">{lowestBid ? lowestBid.amount.toLocaleString() : '---'}</h3>
              </div>
              <p className="mt-6 text-[10px] font-bold opacity-70">提示：您仅能看到最低价数值，无法获知竞争对手身份。</p>
            </div>
            <div className={`p-10 rounded-[48px] border-2 shadow-sm transition-all ${myBid ? (lowestBid && myBid.amount === lowestBid.amount ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-amber-200') : 'bg-white border-gray-100'}`}>
               <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">我的当前出价</p>
               {myBid ? (
                 <>
                   <div className="flex items-baseline gap-2 text-gray-900"><span className="text-sm font-black text-gray-400">¥</span><h3 className="text-5xl font-black">{myBid.amount.toLocaleString()}</h3></div>
                   <div className="mt-6 flex items-center gap-2">
                     {lowestBid && myBid.amount === lowestBid.amount ? (
                       <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-4 py-1.5 rounded-full uppercase">领先中</span>
                     ) : (
                       <span className="text-[10px] font-black text-amber-600 bg-amber-100 px-4 py-1.5 rounded-full uppercase">需进一步优化</span>
                     )}
                   </div>
                 </>
               ) : <p className="py-8 text-gray-300 italic font-black text-xl">尚未参与竞价</p>}
            </div>
          </div>
          {rfq.status === RFQStatus.OPEN && (
            <div className="bg-white p-8 md:p-10 rounded-[40px] shadow-2xl border border-gray-100 flex flex-col md:flex-row gap-4 sticky bottom-8 z-10">
               <div className="flex-1 relative">
                 <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-gray-400">¥</span>
                 <input 
                    type="number" 
                    placeholder="请输入含税总报价金额" 
                    className="w-full pl-12 pr-6 py-6 bg-gray-50 rounded-[28px] font-black text-xl focus:ring-4 focus:ring-indigo-100 outline-none transition-all" 
                    value={amount} 
                    onChange={e=>setAmount(e.target.value)} 
                  />
               </div>
               <button 
                 onClick={submitBid} 
                 disabled={isSyncing} 
                 className="bg-indigo-600 text-white px-12 py-6 rounded-[28px] font-black shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
               >
                 {myBid ? '更新报价' : '确认参与竞价'}
               </button>
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
  const [showCloudSet, setShowCloudSet] = useState(false);

  useEffect(() => {
    if (user) localStorage.setItem('qb_curr_u', JSON.stringify(user));
    else localStorage.removeItem('qb_curr_u');
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, b, u] = await Promise.all([DataService.getRFQs(), DataService.getBids(), DataService.getUsers()]);
      setRfqs(r); setBids(b); setUsers(u);
    } finally { setLoading(false); }
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
    if (!confirm('确定彻底删除该询价单及其所有历史报价？此操作无法撤销。')) return;
    await DataService.deleteRFQ(id);
    await loadData();
    alert('已成功删除');
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-indigo-100 overflow-x-hidden">
        {showCloudSet && <CloudSettings onClose={() => setShowCloudSet(false)} />}
        <nav className="h-20 bg-white/80 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-100 px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 font-black text-2xl text-indigo-600">
            <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-100"><Icons.Shield /></div>
            <span className="hidden sm:inline tracking-tighter">QuickBid</span>
          </Link>
          <div className="flex items-center gap-2">
             <button onClick={loadData} className={`p-3 rounded-2xl text-gray-400 hover:text-indigo-600 transition-all ${loading ? 'animate-spin text-indigo-500' : ''}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
             {user.role === UserRole.SYS_ADMIN && <Link to="/users" className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:text-indigo-600 transition-all shadow-sm"><Icons.User /></Link>}
             <button onClick={() => setShowCloudSet(true)} className={`p-3 rounded-2xl transition-all ${DataService.isCloud() ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600 animate-pulse'}`}><Icons.Settings /></button>
             <div className="h-8 w-[1px] bg-gray-100 mx-2"></div>
             <button onClick={() => {if(confirm('确认退出系统？')) setUser(null)}} className="text-[10px] font-black text-red-500 uppercase bg-red-50 px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all">登出</button>
          </div>
        </nav>

        <main className="flex-1 p-6 md:p-12 max-w-6xl mx-auto w-full">
          <Routes>
            <Route path="/" element={
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-4xl font-black text-gray-900 tracking-tight">询价大厅</h2>
                    <p className="text-gray-400 text-[10px] font-black uppercase mt-2 tracking-[0.2em]">
                      {isBuyer ? '管理所有采购项目' : '参与最新的竞标机会'}
                    </p>
                  </div>
                  {isBuyer && (
                    <button onClick={async () => {
                      const title = prompt('请输入询价项目标题:');
                      if(!title) return;
                      const r: RFQ = { id: 'R-'+Date.now(), title, description: '需求详见项目详情描述...', deadline: new Date(Date.now() + 7*24*3600*1000).toISOString().split('T')[0], status: RFQStatus.OPEN, createdAt: new Date().toISOString(), creatorId: user.id, items: [] };
                      await DataService.saveRFQ(r);
                      loadData();
                    }} className="bg-indigo-600 text-white p-6 rounded-[32px] shadow-2xl shadow-indigo-100 hover:scale-110 active:scale-95 transition-all"><Icons.Plus /></button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {rfqs.map(r => (
                    <SwipeableRFQCard 
                      key={r.id} 
                      rfq={r} 
                      isBuyer={isBuyer} 
                      onDelete={handleDeleteRFQ} 
                    />
                  ))}
                  {rfqs.length === 0 && <div className="col-span-full py-32 text-center text-gray-300 font-black italic border-2 border-dashed border-gray-100 rounded-[60px]">暂无公开的采购项目</div>}
                </div>
                {isBuyer && rfqs.length > 0 && (
                  <p className="text-center text-[10px] font-black text-gray-300 uppercase tracking-widest md:hidden">提示：左滑项目卡片快速删除</p>
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

// --- 管理与配置组件 ---

const CloudSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [cfg, setCfg] = useState(getCloudConfig());
  const save = () => {
    localStorage.setItem('qb_cloud_url', cfg.url.trim());
    localStorage.setItem('qb_cloud_key', cfg.key.trim());
    window.location.reload();
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-[48px] p-12 shadow-2xl animate-in zoom-in-95 duration-300">
        <h3 className="text-2xl font-black mb-2 text-gray-900">云同步配置</h3>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-10">接入 Supabase 实现跨端实时同步</p>
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-[10px] font-black text-gray-400 px-1 uppercase">Project URL</p>
            <input type="text" className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500" value={cfg.url} onChange={e=>setCfg({...cfg, url: e.target.value})} />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-black text-gray-400 px-1 uppercase">Anon/Public Key</p>
            <input type="password"  className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500" value={cfg.key} onChange={e=>setCfg({...cfg, key: e.target.value})} />
          </div>
          <div className="flex gap-4 pt-4">
            <button onClick={onClose} className="flex-1 p-5 bg-gray-100 rounded-[24px] font-black text-xs uppercase hover:bg-gray-200">取消</button>
            <button onClick={save} className="flex-1 p-5 bg-indigo-600 text-white rounded-[24px] font-black text-xs uppercase shadow-xl shadow-indigo-100 hover:bg-indigo-700">保存并刷新</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const UsersManagement = ({ users, onUpdate }: { users: User[], onUpdate: () => void }) => {
  const handleReset = async (u: User) => {
    const p = prompt(`为 [${u.id}] 设置新密码:`, '123456');
    if(!p) return;
    await DataService.saveUser({...u, password: p});
    alert('密码已重置');
    onUpdate();
  };

  const handleDelete = async (id: string) => {
    if(id === 'admin') return alert('内置管理员账号受保护，无法删除');
    if(!confirm(`确定要注销并删除账号 [${id}] 吗？`)) return;
    await DataService.deleteUser(id);
    onUpdate();
    alert('账号已注销');
  };

  const handleAdd = async () => {
    const id = prompt('输入账号 ID:');
    if(!id) return;
    const name = prompt('输入显示名称:');
    if(!name) return;
    const role = confirm('是否设为甲方 (采购方)？点击确定设为甲方，点击取消设为乙方。') ? UserRole.ADMIN : UserRole.VENDOR;
    await DataService.saveUser({ id, name, role, company: name, password: '123', createdAt: new Date().toISOString() });
    onUpdate();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-gray-900 tracking-tight">系统账户管理</h2>
        <button onClick={handleAdd} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase shadow-lg hover:scale-105 transition-all">新增账户</button>
      </div>
      <div className="bg-white rounded-[40px] shadow-sm border border-gray-50 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase">
            <tr><th className="p-6">账户 ID</th><th className="p-6">显示名称</th><th className="p-6">角色权限</th><th className="p-6 text-right">管理操作</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u=>(
              <tr key={u.id} className="hover:bg-gray-50/30 transition-colors">
                <td className="p-6 font-black text-indigo-600">{u.id}</td>
                <td className="p-6 font-bold">{u.name}</td>
                <td className="p-6"><Badge status={u.role}/></td>
                <td className="p-6 text-right space-x-2">
                  <button onClick={()=>handleReset(u)} className="p-3 hover:bg-indigo-50 rounded-2xl text-indigo-600 transition-all" title="重置密码"><Icons.Settings/></button>
                  {u.id !== 'admin' && (
                    <button onClick={()=>handleDelete(u.id)} className="p-3 hover:bg-red-50 rounded-2xl text-red-500 transition-all" title="删除账号"><Icons.Trash/></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RFQDetailWrapper = ({ rfqs, bids, user, setBids }: any) => {
  const { id } = useParams();
  const rfq = rfqs.find((r:any) => r.id === id);
  if (!rfq) return <div className="py-48 text-center animate-pulse text-gray-300 font-black italic">正在调取项目档案...</div>;
  return <RFQDetail rfq={rfq} bids={bids} user={user} onAddBid={b => setBids((p:any) => {
    const idx = p.findIndex((x:any)=>x.rfqId===b.rfqId && x.vendorId===b.vendorId);
    if(idx>=0){ const n = [...p]; n[idx]=b; return n; }
    return [b, ...p];
  })} />;
};

const AuthPage: React.FC<{ onAuth: (user: User) => void }> = ({ onAuth }) => {
  const [formData, setFormData] = useState({ id: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const all = await DataService.getUsers();
      const u = all.find((x:any) => x.id.toLowerCase() === formData.id.toLowerCase() && x.password === formData.password);
      if(u) onAuth(u); else alert('凭证验证失败，请核对后重试');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-6">
       <div className="bg-white w-full max-w-sm rounded-[64px] p-12 shadow-2xl animate-in zoom-in-95 duration-500">
         <div className="text-center mb-12">
            <div className="inline-block p-5 bg-indigo-600 text-white rounded-[28px] mb-6 shadow-2xl shadow-indigo-100"><Icons.Shield/></div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">QuickBid</h1>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-3">极简竞价管理系统</p>
         </div>
         <form onSubmit={handleLogin} className="space-y-5">
           <input type="text" placeholder="账户 ID" required className="w-full p-6 bg-gray-50 rounded-[28px] font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition-all" value={formData.id} onChange={e=>setFormData({...formData, id: e.target.value})} />
           <input type="password" placeholder="访问密码" required className="w-full p-6 bg-gray-50 rounded-[28px] font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition-all" value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} />
           <button disabled={loading} className="w-full bg-indigo-600 text-white py-6 rounded-[32px] font-black shadow-2xl shadow-indigo-100 mt-6 active:scale-95 hover:bg-indigo-700 transition-all disabled:opacity-50">
             {loading ? '正在验证...' : '安全登录'}
           </button>
         </form>
         <div className="mt-12 text-center text-[10px] font-black text-gray-300 uppercase leading-relaxed space-y-1">
            <p>甲方账号: buyer (123)</p>
            <p>乙方账号: vendor1 (123)</p>
            <p className="text-indigo-300">管理员: admin (admin)</p>
         </div>
       </div>
    </div>
  );
};

export default App;
