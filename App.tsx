
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { User, UserRole, RFQ, Bid, RFQStatus, RFQItem, ItemQuote } from './types';
import { Icons, COLORS } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// --- 数据同步服务层 ---
const Map = {
  rfq: {
    toModel: (d: any): RFQ => ({
      id: d.id, title: d.title, description: d.description || '', deadline: d.deadline,
      status: d.status as RFQStatus, createdAt: d.created_at, creatorId: d.creator_id, 
      items: d.items || []
    }),
    toDB: (m: RFQ) => ({
      id: m.id, title: m.title, description: m.description, deadline: m.deadline,
      status: m.status, creator_id: m.creatorId, items: m.items
    })
  },
  bid: {
    toModel: (d: any): Bid => ({
      id: d.id, rfqId: d.rfq_id, vendorId: d.vendor_id, vendorName: d.vendor_name,
      amount: Number(d.amount), currency: 'CNY', deliveryDate: '', notes: '', 
      timestamp: d.timestamp, itemQuotes: d.item_quotes || []
    }),
    toDB: (m: Bid) => ({
      id: m.id, rfq_id: m.rfqId, vendor_id: m.vendorId, vendor_name: m.vendorName, 
      amount: m.amount, item_quotes: m.itemQuotes
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
    const { data } = await supabase.from('rfqs').select('*').order('created_at', { ascending: false });
    return (data || []).map(Map.rfq.toModel);
  },
  async getBids() {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_b') || '[]');
    const { data } = await supabase.from('bids').select('*');
    return (data || []).map(Map.bid.toModel);
  },
  async getUsers() {
    const localUsers = JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS));
    if (!supabase) return localUsers;
    const { data } = await supabase.from('users').select('*');
    const cloudUsers = (data || []).map(Map.user.toModel);
    const combined = [...cloudUsers];
    INITIAL_USERS.forEach(u => { if (!combined.find(c => c.id === u.id)) combined.push(u); });
    return combined;
  },
  async saveRFQ(rfq: RFQ) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_r') || '[]');
      const idx = local.findIndex((r: any) => r.id === rfq.id);
      if (idx >= 0) local[idx] = rfq; else local.unshift(rfq);
      localStorage.setItem('qb_r', JSON.stringify(local));
      return;
    }
    await supabase.from('rfqs').upsert(Map.rfq.toDB(rfq));
  },
  async deleteRFQ(id: string) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_r') || '[]');
      localStorage.setItem('qb_r', JSON.stringify(local.filter((r: any) => r.id !== id)));
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

const SwipeableRFQCard: React.FC<{ rfq: RFQ; user: User; onDelete: (id: string) => void; }> = ({ rfq, user, onDelete }) => {
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const threshold = 90;
  
  const canDelete = user.role === UserRole.SYS_ADMIN || user.role === UserRole.ADMIN;

  const handleTouchStart = (e: React.TouchEvent) => { if (!canDelete) return; setStartX(e.touches[0].clientX); setIsSwiping(true); };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || !canDelete) return;
    const diff = e.touches[0].clientX - startX;
    if (diff < 0) { const offset = isOpen ? diff - threshold : diff; setCurrentX(Math.max(offset, -threshold - 20)); }
    else if (isOpen) { setCurrentX(Math.min(diff - threshold, 0)); }
  };
  const handleTouchEnd = () => {
    if (!canDelete) return; setIsSwiping(false);
    if (currentX < -threshold / 2) { setIsOpen(true); setCurrentX(-threshold); } else { setIsOpen(false); setCurrentX(0); }
  };

  return (
    <div className="relative overflow-hidden rounded-[40px] bg-red-600 group">
      {canDelete && (
        <button onClick={(e)=>{e.preventDefault(); onDelete(rfq.id)}} className="absolute right-0 top-0 bottom-0 w-[90px] flex flex-col items-center justify-center text-white font-black text-[10px] uppercase gap-1 active:bg-red-800 transition-all">
          <Icons.Trash /><span>删除</span>
        </button>
      )}
      <div className="relative bg-white transition-transform duration-300 ease-out" style={{ transform: `translateX(${currentX}px)` }} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <Link to={`/rfq/${rfq.id}`} className="block p-8 md:p-10 border border-gray-50 shadow-sm hover:shadow-xl transition-all h-full">
          <div className="flex justify-between items-center mb-4">
            <Badge status={rfq.status} />
            <span className="text-[10px] font-black text-gray-300">ID: {rfq.id.slice(-4)}</span>
          </div>
          <h3 className="text-xl md:text-2xl font-black text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-1">{rfq.title}</h3>
          <div className="flex flex-wrap gap-4 mt-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">截止: {rfq.deadline}</p>
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{rfq.items?.length || 0} 个明细项</p>
          </div>
        </Link>
        {canDelete && (
           <button onClick={(e)=>{e.preventDefault(); onDelete(rfq.id)}} className="hidden md:flex absolute top-6 right-6 p-4 bg-red-50 text-red-600 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:text-white shadow-xl shadow-red-100">
             <Icons.Trash />
           </button>
        )}
      </div>
    </div>
  );
};

// --- 云设置 Modal ---
const CloudSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [cfg, setCfg] = useState(getCloudConfig());
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-[48px] p-12 shadow-2xl">
        <h3 className="text-2xl font-black mb-10 text-gray-900">云同步配置</h3>
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-[10px] font-black text-gray-400 px-1 uppercase">Project URL</p>
            <input type="text" className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none" value={cfg.url} onChange={e=>setCfg({...cfg, url: e.target.value})} />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-black text-gray-400 px-1 uppercase">Anon Key</p>
            <input type="password"  className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none" value={cfg.key} onChange={e=>setCfg({...cfg, key: e.target.value})} />
          </div>
          <div className="flex gap-4 pt-4">
            <button onClick={onClose} className="flex-1 p-5 bg-gray-100 rounded-[24px] font-black text-xs uppercase">取消</button>
            <button onClick={()=>{localStorage.setItem('qb_cloud_url', cfg.url); localStorage.setItem('qb_cloud_key', cfg.key); window.location.reload();}} className="flex-1 p-5 bg-indigo-600 text-white rounded-[24px] font-black text-xs uppercase shadow-xl">确认同步</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- 创建询价单 Modal (布局优化，确保单位不遮挡) ---
const CreateRFQModal: React.FC<{ onSave: (rfq: RFQ) => void, onClose: () => void, userId: string }> = ({ onSave, onClose, userId }) => {
  const [form, setForm] = useState({ title: '', description: '', deadline: new Date(Date.now() + 7*24*3600*1000).toISOString().split('T')[0] });
  const [items, setItems] = useState<RFQItem[]>([{ id: 'I-1', name: '', quantity: 1, unit: '个' }]);

  const addItem = () => setItems([...items, { id: 'I-' + Date.now(), name: '', quantity: 1, unit: '个' }]);
  const updateItem = (id: string, field: keyof RFQItem, val: any) => setItems(items.map(i => i.id === id ? { ...i, [field]: val } : i));

  const handlePublish = () => {
    if(!form.title) return alert('请填写项目标题');
    if(items.some(i => !i.name)) return alert('请填写所有物品品名');
    onSave({
      ...form, items, status: RFQStatus.OPEN, createdAt: new Date().toISOString(), creatorId: userId, id: 'R-'+Date.now()
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[48px] p-8 md:p-12 shadow-2xl my-8">
        <h3 className="text-2xl font-black mb-8 text-indigo-600">发布新询价项目</h3>
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase">1. 基本信息</label>
            <input type="text" className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none" value={form.title} onChange={e=>setForm({...form, title: e.target.value})} placeholder="项目标题 (如：2024春季办公用品采购)" />
            <textarea className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none h-24 mt-2" value={form.description} onChange={e=>setForm({...form, description: e.target.value})} placeholder="详细说明要求、交货地点等..." />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase">2. 截止日期</label>
            <input type="date" className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none" value={form.deadline} onChange={e=>setForm({...form, deadline: e.target.value})} />
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center"><label className="text-[10px] font-black text-gray-400 uppercase">3. 物品明细清单</label><button onClick={addItem} className="text-indigo-600 font-black text-xs hover:underline">+ 增加一行</button></div>
            <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
              {items.map((item, idx) => (
                <div key={item.id} className="bg-gray-50 p-5 rounded-[24px] space-y-3 border border-gray-100">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-indigo-400">明细 {idx+1}</span>
                    {items.length > 1 && <button onClick={()=>setItems(items.filter(i=>i.id!==item.id))} className="text-red-400"><Icons.Trash /></button>}
                  </div>
                  <input type="text" placeholder="品名/规格型号" className="w-full bg-white p-4 rounded-xl text-sm font-bold outline-none shadow-sm" value={item.name} onChange={e=>updateItem(item.id, 'name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300">数量</span>
                       <input type="number" className="w-full pl-12 pr-4 py-3 bg-white rounded-xl text-sm font-bold outline-none shadow-sm" value={item.quantity} onChange={e=>updateItem(item.id, 'quantity', Number(e.target.value))} />
                    </div>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300">单位</span>
                       <input type="text" className="w-full pl-12 pr-4 py-3 bg-white rounded-xl text-sm font-bold outline-none shadow-sm" value={item.unit} onChange={e=>updateItem(item.id, 'unit', e.target.value)} placeholder="个/套/吨" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-4 pt-4"><button onClick={onClose} className="flex-1 p-5 bg-gray-100 rounded-[24px] font-black text-xs uppercase">取消</button><button onClick={handlePublish} className="flex-1 p-5 bg-indigo-600 text-white rounded-[24px] font-black text-xs uppercase shadow-2xl">立即发布项目</button></div>
        </div>
      </div>
    </div>
  );
};

// --- RFQ 详情及报价页面 ---
const RFQDetail: React.FC<{ rfq: RFQ, bids: Bid[], user: User, onAddBid: (bid: Bid) => void }> = ({ rfq, bids, user, onAddBid }) => {
  const [itemQuotes, setItemQuotes] = useState<ItemQuote[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showShareMask, setShowShareMask] = useState(false);

  const rfqBids = useMemo(() => bids.filter(b => b.rfqId === rfq.id), [bids, rfq.id]);
  const myBid = rfqBids.find(b => b.vendorId === user.id);
  const isBuyer = user.role !== UserRole.VENDOR;

  useEffect(() => {
    if (!isBuyer && rfq.items && !hasInitialized) {
      const initial = rfq.items.map(item => {
        const existing = myBid?.itemQuotes?.find(iq => iq.itemId === item.id);
        return { itemId: item.id, unitPrice: existing?.unitPrice || 0 };
      });
      setItemQuotes(initial);
      setHasInitialized(true);
    }
  }, [rfq.items, myBid, isBuyer, hasInitialized]);

  const totalAmount = useMemo(() => itemQuotes.reduce((sum, q) => {
    const item = rfq.items.find(i => i.id === q.itemId);
    return sum + (q.unitPrice * (item?.quantity || 0));
  }, 0), [itemQuotes, rfq.items]);

  const handleShare = () => {
    const text = `【询价邀请】${rfq.title}\n截止日期：${rfq.deadline}\n详情请点击：${window.location.href}`;
    navigator.clipboard.writeText(text).then(() => { setShowShareMask(true); });
  };

  const submitBid = async () => {
    if(itemQuotes.some(iq => iq.unitPrice <= 0)) return alert('请填写所有明细项的报价单价');
    setIsSyncing(true);
    try {
      const bid: Bid = {
        id: myBid?.id || 'B-'+Date.now(), rfqId: rfq.id, vendorId: user.id, vendorName: user.company || user.name,
        amount: totalAmount, currency: 'CNY', deliveryDate: '', notes: '', timestamp: new Date().toISOString(), itemQuotes
      };
      await DataService.saveBid(bid);
      onAddBid(bid);
      alert('报价单已安全提交并同步');
    } finally { setIsSyncing(false); }
  };

  return (
    <div className="space-y-6 pb-32 animate-in fade-in duration-500">
      {showShareMask && (
        <div className="wechat-mask" onClick={() => setShowShareMask(false)}>
          <div className="flex flex-col items-end gap-4"><div className="text-4xl animate-bounce">☝️</div><p className="text-xl font-bold">链接已复制！<br/>点击右上角转发供应商</p><button className="mt-4 px-8 py-3 bg-white text-indigo-600 rounded-full font-black uppercase shadow-xl">知道了</button></div>
        </div>
      )}

      <div className="bg-white p-8 md:p-12 rounded-[48px] shadow-sm border border-gray-50">
        <div className="flex justify-between items-start">
           <Badge status={rfq.status} />
           {isBuyer && <button onClick={handleShare} className="flex items-center gap-2 px-6 py-2 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase hover:bg-indigo-600 hover:text-white transition-all"><Icons.Share />微信转发</button>}
        </div>
        <h2 className="text-3xl font-black mt-8 mb-4">{rfq.title}</h2>
        <div className="bg-gray-50 p-6 rounded-[24px] text-gray-500 text-sm leading-relaxed mb-10 whitespace-pre-wrap">{rfq.description || '无具体说明描述'}</div>
        
        <label className="text-[10px] font-black text-gray-400 uppercase block mb-4">采购清单预览</label>
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[400px]">
            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
              <tr><th className="p-4">品名/规格</th><th className="p-4">需求数量</th><th className="p-4">单位</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rfq.items?.map(item => (<tr key={item.id} className="text-gray-700"><td className="p-4 font-bold">{item.name}</td><td className="p-4 font-black">{item.quantity}</td><td className="p-4">{item.unit}</td></tr>))}
            </tbody>
          </table>
        </div>
      </div>

      {!isBuyer ? (
        <div className="bg-white p-8 md:p-10 rounded-[48px] shadow-2xl border-2 border-indigo-600">
          <div className="flex items-center gap-4 mb-10">
            <div className="bg-indigo-600 text-white p-4 rounded-[20px]"><Icons.Layout /></div>
            <h3 className="text-2xl font-black text-gray-900">供应商报价工作台</h3>
          </div>
          <div className="space-y-6 mb-12">
            {rfq.items?.map(item => {
              const quote = itemQuotes.find(iq => iq.itemId === item.id);
              return (
                <div key={item.id} className="flex flex-col md:flex-row md:items-center gap-6 bg-gray-50 p-6 rounded-[32px] hover:border-indigo-400 border-2 border-transparent transition-all">
                  <div className="flex-1">
                    <p className="font-black text-gray-800 text-lg">{item.name}</p>
                    <div className="flex gap-4 mt-1"><span className="text-[10px] font-bold text-gray-400 uppercase">数量: {item.quantity}</span><span className="text-[10px] font-bold text-indigo-400 uppercase">单位: {item.unit}</span></div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">单价 ¥</span>
                      <input type="number" className="pl-14 pr-4 py-4 bg-white rounded-2xl font-black text-indigo-600 w-40 outline-none shadow-sm focus:ring-2 ring-indigo-500" value={quote?.unitPrice || ''} onChange={e=>setItemQuotes(itemQuotes.map(iq => iq.itemId === item.id ? { ...iq, unitPrice: Number(e.target.value) } : iq))} placeholder="0.00" />
                    </div>
                    <div className="w-28 text-right"><p className="text-[10px] font-black text-gray-400 uppercase mb-1">小计金额</p><p className="font-black text-indigo-600 text-xl">¥ {((quote?.unitPrice || 0) * item.quantity).toLocaleString()}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between p-10 bg-indigo-600 text-white rounded-[40px] gap-8 shadow-2xl">
            <div><p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">含税总计报价金额 (CNY)</p><p className="text-5xl font-black">¥ {totalAmount.toLocaleString()}</p></div>
            <button onClick={submitBid} disabled={isSyncing} className="w-full md:w-auto bg-white text-indigo-600 px-16 py-6 rounded-[28px] font-black uppercase text-sm shadow-xl hover:scale-105 active:scale-95 transition-all">提交投标</button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
           <h3 className="font-black text-2xl mb-12 text-gray-900">甲方竞价监控分析</h3>
           {rfqBids.length > 0 ? (
             <div className="space-y-12">
               <div className="h-72 w-full"><ResponsiveContainer><BarChart data={[...rfqBids].sort((a,b)=>a.amount-b.amount)}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" /><XAxis dataKey="vendorName" fontSize={10} fontWeight="bold" /><YAxis fontSize={10}/><Tooltip cursor={{fill: '#F9FAFB'}} contentStyle={{borderRadius:'32px', border:'none', boxShadow:'0 10px 30px rgba(0,0,0,0.05)'}}/><Bar dataKey="amount" fill="#4F46E5" radius={[12, 12, 0, 0]} barSize={40}/></BarChart></ResponsiveContainer></div>
               <div className="bg-gray-50 rounded-[40px] overflow-hidden"><table className="w-full text-left text-sm min-w-[500px]"><thead className="bg-gray-100 text-[10px] font-black text-gray-400 uppercase"><tr><th className="p-8">供应商名称</th><th className="p-8">总报价</th><th className="p-8 text-right">投递时间</th></tr></thead><tbody className="divide-y divide-gray-100">{rfqBids.sort((a,b)=>a.amount-b.amount).map(b=>(<tr key={b.id} className="hover:bg-white transition-colors"><td className="p-8 font-bold">{b.vendorName}</td><td className="p-8 font-black text-indigo-600 text-lg">¥ {b.amount.toLocaleString()}</td><td className="p-8 text-right text-gray-400 text-xs">{new Date(b.timestamp).toLocaleString()}</td></tr>))}</tbody></table></div>
             </div>
           ) : <div className="py-32 text-center text-gray-300 font-black italic border-2 border-dashed border-gray-100 rounded-[60px]">暂无供应商报价数据同步</div>}
        </div>
      )}
    </div>
  );
};

// --- 主页面框架 ---
const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => { const saved = localStorage.getItem('qb_curr_u'); return saved ? JSON.parse(saved) : null; });
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCloudSet, setShowCloudSet] = useState(false);

  useEffect(() => { if (user) localStorage.setItem('qb_curr_u', JSON.stringify(user)); else localStorage.removeItem('qb_curr_u'); }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, b, u] = await Promise.all([DataService.getRFQs(), DataService.getBids(), DataService.getUsers()]);
      setRfqs(r); setBids(b); setUsers(u);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); if (supabase) { const sub = supabase.channel('realtime').on('postgres_changes', { event: '*', schema: 'public' }, loadData).subscribe(); return () => { supabase.removeChannel(sub); }; } }, []);

  if (!user) return <AuthPage onAuth={setUser} />;

  const isBuyer = user.role !== UserRole.VENDOR;
  const isSysAdmin = user.role === UserRole.SYS_ADMIN;

  const handleSaveRFQ = async (r: RFQ) => {
    // 乐观更新：立即将新项目插入列表顶部
    setRfqs(prev => [r, ...prev]);
    setShowCreateModal(false);
    try {
      await DataService.saveRFQ(r);
      await loadData(); // 再通过远程同步获取最终确认
    } catch(e) { 
      alert('发布失败，请检查网络'); 
      loadData(); // 出错则回滚
    }
  };

  const handleDeleteRFQ = async (id: string) => {
    if(!confirm('确定彻底注销此询价单？')) return;
    setRfqs(prev => prev.filter(x => x.id !== id));
    await DataService.deleteRFQ(id);
    loadData();
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
        {showCloudSet && <CloudSettings onClose={() => setShowCloudSet(false)} />}
        {showCreateModal && <CreateRFQModal userId={user.id} onSave={handleSaveRFQ} onClose={() => setShowCreateModal(false)} />}
        
        <nav className="h-20 bg-white/80 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-100 px-6 md:px-12 flex items-center justify-between">
          <Link to="/" className="font-black text-2xl text-indigo-600 flex items-center gap-2"><div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg"><Icons.Shield /></div>QuickBid</Link>
          <div className="flex items-center gap-2">
             <button onClick={loadData} className={`p-3 text-gray-400 hover:text-indigo-600 transition-all ${loading ? 'animate-spin text-indigo-500' : ''}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2" /></svg></button>
             {isSysAdmin && <Link to="/users" className="p-3 text-gray-400 hover:text-indigo-600"><Icons.User /></Link>}
             {(isSysAdmin || user.role === UserRole.ADMIN) && <button onClick={() => setShowCloudSet(true)} className="p-3 text-gray-400 hover:text-indigo-600"><Icons.Settings /></button>}
             <button onClick={() => setUser(null)} className="ml-2 text-[10px] font-black text-red-500 bg-red-50 px-4 py-2 rounded-xl">登出</button>
          </div>
        </nav>

        <main className="flex-1 p-6 md:p-12 max-w-6xl mx-auto w-full">
          <Routes>
            <Route path="/" element={
              <div className="space-y-12">
                <div className="flex justify-between items-end">
                  <div><h2 className="text-4xl font-black text-gray-900 tracking-tight">项目中心</h2><p className="text-gray-400 text-[10px] font-black uppercase mt-2 tracking-widest">{isBuyer ? '我的采购项目' : '待处理竞投项目'}</p></div>
                  {isBuyer && <button onClick={() => setShowCreateModal(true)} className="bg-indigo-600 text-white p-6 rounded-[32px] shadow-2xl hover:scale-110 active:scale-95 transition-all"><Icons.Plus /></button>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {rfqs.map(r => <SwipeableRFQCard key={r.id} rfq={r} user={user} onDelete={handleDeleteRFQ} />)}
                  {rfqs.length === 0 && !loading && <div className="col-span-full py-48 text-center text-gray-300 font-black italic border-2 border-dashed border-gray-100 rounded-[60px]">这里暂时没有询价单</div>}
                </div>
              </div>
            } />
            <Route path="/rfq/:id" element={<RFQDetailWrapper rfqs={rfqs} bids={bids} user={user} setBids={setBids} />} />
            <Route path="/users" element={isSysAdmin ? <UsersManagement users={users} onUpdate={loadData} /> : <Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

// --- 管理页面组件 ---
const UsersManagement = ({ users, onUpdate }: { users: User[], onUpdate: () => void }) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center"><h2 className="text-3xl font-black text-gray-900">系统账户</h2><button onClick={async ()=>{ const id=prompt('ID:'); const name=prompt('姓名:'); if(id && name) await DataService.saveUser({id, name, role: UserRole.VENDOR, password:'123', createdAt: new Date().toISOString()}); onUpdate();}} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase">新增</button></div>
      <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden"><table className="w-full text-left"><thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase"><tr><th className="p-6">账号</th><th className="p-6">姓名</th><th className="p-6">角色</th><th className="p-6 text-right">操作</th></tr></thead><tbody className="divide-y divide-gray-50">{users.map(u=>(<tr key={u.id}><td className="p-6 font-black text-indigo-600">{u.id}</td><td className="p-6 font-bold">{u.name}</td><td className="p-6"><Badge status={u.role}/></td><td className="p-6 text-right"><button onClick={async ()=>{if(confirm('注销？')){await DataService.deleteUser(u.id); onUpdate();}}} className="p-3 text-red-500"><Icons.Trash/></button></td></tr>))}</tbody></table></div>
    </div>
  );
};

const RFQDetailWrapper = ({ rfqs, bids, user, setBids }: any) => {
  const { id } = useParams();
  const rfq = rfqs.find((r:any) => r.id === id);
  if (!rfq) return <div className="py-48 text-center text-gray-300 font-black italic animate-pulse">提取数据中...</div>;
  return <RFQDetail rfq={rfq} bids={bids} user={user} onAddBid={b => setBids((p:any) => {
    const idx = p.findIndex((x:any)=>x.rfqId===b.rfqId && x.vendorId===b.vendorId);
    if(idx>=0){ const n = [...p]; n[idx]=b; return n; }
    return [b, ...p];
  })} />;
};

const AuthPage: React.FC<{ onAuth: (user: User) => void }> = ({ onAuth }) => {
  const [formData, setFormData] = useState({ id: '', password: '' });
  const [loading, setLoading] = useState(false);
  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-6">
       <div className="bg-white w-full max-w-sm rounded-[64px] p-12 shadow-2xl">
         <div className="text-center mb-12"><div className="inline-block p-5 bg-indigo-600 text-white rounded-[28px] mb-6 shadow-2xl shadow-indigo-100"><Icons.Shield/></div><h1 className="text-4xl font-black text-gray-900 tracking-tighter">QuickBid</h1><p className="text-[10px] font-black text-gray-400 uppercase mt-2">企业级极简竞价系统</p></div>
         <form onSubmit={async (e)=>{e.preventDefault(); setLoading(true); const all=await DataService.getUsers(); const u=all.find(x=>x.id.toLowerCase()===formData.id.toLowerCase()&&x.password===formData.password); if(u) onAuth(u); else alert('验证失败'); setLoading(false);}} className="space-y-5">
           <input type="text" placeholder="账号" required className="w-full p-6 bg-gray-50 rounded-[28px] font-bold outline-none border-2 border-transparent focus:border-indigo-500" value={formData.id} onChange={e=>setFormData({...formData, id: e.target.value})} />
           <input type="password" placeholder="密码" required className="w-full p-6 bg-gray-50 rounded-[28px] font-bold outline-none border-2 border-transparent focus:border-indigo-500" value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} />
           <button className="w-full bg-indigo-600 text-white py-6 rounded-[32px] font-black shadow-2xl mt-6">{loading ? '登录中...' : '进入系统'}</button>
         </form>
         <div className="mt-12 text-center text-[10px] font-black text-gray-300 uppercase space-y-1"><p>甲方: buyer (123) | 乙方: vendor1 (123)</p><p className="text-indigo-300">管理员: admin (admin)</p></div>
       </div>
    </div>
  );
};

export default App;
