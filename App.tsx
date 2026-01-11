
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { User, UserRole, RFQ, Bid, RFQStatus, RFQItem, ItemQuote } from './types';
import { Icons, COLORS } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// --- 数据同步服务 ---
const Map = {
  rfq: {
    toModel: (d: any): RFQ => ({
      id: d.id, title: d.title, description: d.description, deadline: d.deadline,
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
    // 合并确保内置账号可用
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
  const deleteAction = (e: any) => { e.preventDefault(); e.stopPropagation(); onDelete(rfq.id); setIsOpen(false); setCurrentX(0); };

  return (
    <div className="relative overflow-hidden rounded-[40px] bg-red-600 group">
      {canDelete && (
        <button onClick={deleteAction} className="absolute right-0 top-0 bottom-0 w-[90px] flex flex-col items-center justify-center text-white font-black text-[10px] uppercase gap-1 active:bg-red-800 transition-all">
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
           <button onClick={deleteAction} className="hidden md:flex absolute top-6 right-6 p-4 bg-red-50 text-red-600 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:text-white shadow-xl shadow-red-100">
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
  const save = () => {
    localStorage.setItem('qb_cloud_url', cfg.url.trim());
    localStorage.setItem('qb_cloud_key', cfg.key.trim());
    window.location.reload();
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-[48px] p-12 shadow-2xl animate-in zoom-in-95 duration-300">
        <h3 className="text-2xl font-black mb-2 text-gray-900">云同步配置</h3>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-10">接入 Supabase 实现实时跨端竞价</p>
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
            <button onClick={save} className="flex-1 p-5 bg-indigo-600 text-white rounded-[24px] font-black text-xs uppercase shadow-xl shadow-indigo-100 hover:bg-indigo-700">确认并同步</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- 用户管理页面 ---
const UsersManagement = ({ users, onUpdate }: { users: User[], onUpdate: () => void }) => {
  const handleReset = async (u: User) => {
    const p = prompt(`重置 [${u.id}] 密码:`, '123456');
    if(!p) return;
    await DataService.saveUser({...u, password: p});
    onUpdate();
  };
  const handleDelete = async (id: string) => {
    if(id === 'admin') return alert('内置管理账号不可删除');
    if(!confirm(`确定注销账号 [${id}]？`)) return;
    await DataService.deleteUser(id);
    onUpdate();
  };
  const handleAdd = async () => {
    const id = prompt('输入账号 ID:'); if(!id) return;
    const name = prompt('输入名称:'); if(!name) return;
    const role = confirm('是否为采购方(甲方)？') ? UserRole.ADMIN : UserRole.VENDOR;
    await DataService.saveUser({ id, name, role, company: name, password: '123', createdAt: new Date().toISOString() });
    onUpdate();
  };
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-gray-900 tracking-tight">系统账户管理</h2>
        <button onClick={handleAdd} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase shadow-lg">新增账户</button>
      </div>
      <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[600px]">
          <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase">
            <tr><th className="p-6">账号 ID</th><th className="p-6">姓名/公司</th><th className="p-6">角色权限</th><th className="p-6 text-right">操作</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u=>(
              <tr key={u.id} className="hover:bg-gray-50/30 transition-colors">
                <td className="p-6 font-black text-indigo-600">{u.id}</td>
                <td className="p-6 font-bold">{u.name}</td>
                <td className="p-6"><Badge status={u.role}/></td>
                <td className="p-6 text-right space-x-2">
                  <button onClick={()=>handleReset(u)} className="p-3 hover:bg-indigo-50 rounded-2xl text-indigo-600"><Icons.Settings/></button>
                  {u.id !== 'admin' && <button onClick={()=>handleDelete(u.id)} className="p-3 hover:bg-red-50 rounded-2xl text-red-500"><Icons.Trash/></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- 创建询价单 Modal ---
const CreateRFQModal: React.FC<{ onSave: (rfq: RFQ) => void, onClose: () => void, userId: string }> = ({ onSave, onClose, userId }) => {
  const [form, setForm] = useState({ title: '', description: '', deadline: new Date(Date.now() + 7*24*3600*1000).toISOString().split('T')[0] });
  const [items, setItems] = useState<RFQItem[]>([{ id: 'I-1', name: '', quantity: 1, unit: '个' }]);

  const addItem = () => setItems([...items, { id: 'I-' + Date.now(), name: '', quantity: 1, unit: '个' }]);
  const updateItem = (id: string, field: keyof RFQItem, val: any) => setItems(items.map(i => i.id === id ? { ...i, [field]: val } : i));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[48px] p-8 md:p-12 shadow-2xl animate-in zoom-in-95 duration-300 my-8">
        <h3 className="text-2xl font-black mb-6">发起新询价</h3>
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase">项目标题</label>
            <input type="text" className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500" value={form.title} onChange={e=>setForm({...form, title: e.target.value})} placeholder="输入项目名称" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase">截止日期</label>
              <input type="date" className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none" value={form.deadline} onChange={e=>setForm({...form, deadline: e.target.value})} />
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center"><label className="text-[10px] font-black text-gray-400 uppercase">物品明细清单</label><button onClick={addItem} className="text-indigo-600 font-black text-[10px] uppercase">+ 增加行</button></div>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id} className="flex flex-col md:flex-row gap-3 bg-gray-50 p-4 rounded-3xl border border-gray-100">
                  <div className="flex-1 flex gap-2 items-center">
                    <span className="text-[10px] font-black text-gray-300 w-4">{idx+1}</span>
                    <input type="text" placeholder="品名(如：A4纸)" className="flex-1 bg-white p-3 rounded-xl text-sm font-bold outline-none" value={item.name} onChange={e=>updateItem(item.id, 'name', e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <input type="number" placeholder="数量" className="w-24 bg-white p-3 rounded-xl text-sm font-bold outline-none" value={item.quantity} onChange={e=>updateItem(item.id, 'quantity', Number(e.target.value))} />
                    <input type="text" placeholder="单位" className="w-20 bg-white p-3 rounded-xl text-sm font-bold outline-none" value={item.unit} onChange={e=>updateItem(item.id, 'unit', e.target.value)} />
                    {items.length > 1 && <button onClick={()=>setItems(items.filter(i=>i.id!==item.id))} className="text-red-400 p-3"><Icons.Trash /></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-4 pt-4"><button onClick={onClose} className="flex-1 p-5 bg-gray-100 rounded-[24px] font-black text-xs uppercase">取消</button><button onClick={()=>onSave({...form, items, status: RFQStatus.OPEN, createdAt: new Date().toISOString(), creatorId: userId, id: 'R-'+Date.now()})} className="flex-1 p-5 bg-indigo-600 text-white rounded-[24px] font-black text-xs uppercase shadow-xl">发布项目</button></div>
        </div>
      </div>
    </div>
  );
};

// --- 详情页面 ---
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
    const text = `【询价邀请】${rfq.title}\n截止日期：${rfq.deadline}\n请参与竞价：${window.location.href}`;
    navigator.clipboard.writeText(text).then(() => { setShowShareMask(true); });
  };

  const submitBid = async () => {
    if(itemQuotes.some(iq => iq.unitPrice <= 0)) return alert('请为所有物品填写有效的单价');
    setIsSyncing(true);
    try {
      const bid: Bid = {
        id: myBid?.id || 'B-'+Date.now(), rfqId: rfq.id, vendorId: user.id, vendorName: user.company || user.name,
        amount: totalAmount, currency: 'CNY', deliveryDate: '', notes: '', timestamp: new Date().toISOString(), itemQuotes
      };
      await DataService.saveBid(bid);
      onAddBid(bid);
      alert('报价成功同步！');
    } finally { setIsSyncing(false); }
  };

  return (
    <div className="space-y-6 pb-32 animate-in fade-in duration-500 relative">
      {showShareMask && (
        <div className="wechat-mask" onClick={() => setShowShareMask(false)}>
          <div className="flex flex-col items-end gap-4">
             <div className="text-4xl animate-bounce">☝️</div>
             <p className="text-xl font-bold">链接已复制！<br/>点击右上角发送给供应商</p>
             <button className="mt-4 px-6 py-2 bg-white text-black rounded-full text-xs font-black uppercase">我明白了</button>
          </div>
        </div>
      )}

      <div className="bg-white p-8 md:p-12 rounded-[48px] shadow-sm border border-gray-50">
        <div className="flex justify-between items-start">
           <Badge status={rfq.status} />
           {!isBuyer ? null : <button onClick={handleShare} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"><Icons.Share />微信分享</button>}
        </div>
        <h2 className="text-3xl font-black mt-6 mb-4">{rfq.title}</h2>
        <p className="text-gray-500 text-sm mb-10">{rfq.description || '无详细描述'}</p>
        
        <div className="bg-gray-50 rounded-3xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[400px]">
            <thead className="bg-gray-100/50 text-[10px] font-black text-gray-400 uppercase">
              <tr><th className="p-4">物品需求</th><th className="p-4">采购数量</th><th className="p-4">单位</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rfq.items?.map(item => (<tr key={item.id} className="text-gray-700"><td className="p-4 font-bold">{item.name}</td><td className="p-4 font-black">{item.quantity}</td><td className="p-4">{item.unit}</td></tr>))}
            </tbody>
          </table>
        </div>
      </div>

      {!isBuyer ? (
        <div className="bg-white p-8 md:p-10 rounded-[40px] shadow-2xl border border-indigo-100">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-indigo-600 text-white p-3 rounded-2xl"><Icons.Layout /></div>
            <h3 className="text-xl font-black text-gray-900">供应商报价工作台</h3>
          </div>
          <div className="space-y-4 mb-10">
            {rfq.items?.map(item => {
              const quote = itemQuotes.find(iq => iq.itemId === item.id);
              return (
                <div key={item.id} className="flex flex-col md:flex-row md:items-center gap-4 bg-gray-50 p-6 rounded-3xl border-2 border-transparent hover:border-indigo-200 transition-all">
                  <div className="flex-1"><p className="font-black text-gray-800 text-lg">{item.name}</p><p className="text-[10px] font-bold text-gray-400 uppercase">数量: {item.quantity} {item.unit}</p></div>
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">单价 ¥</span>
                      <input type="number" className="pl-14 pr-4 py-4 bg-white rounded-2xl font-black text-indigo-600 w-40 outline-none border-2 border-indigo-50 focus:border-indigo-500 transition-all shadow-sm" value={quote?.unitPrice || ''} onChange={e=>setItemQuotes(itemQuotes.map(iq => iq.itemId === item.id ? { ...iq, unitPrice: Number(e.target.value) } : iq))} placeholder="0.00" />
                    </div>
                    <div className="w-28 text-right"><p className="text-[10px] font-black text-gray-400 uppercase mb-1">小计金额</p><p className="font-black text-indigo-600 text-lg">¥ {((quote?.unitPrice || 0) * item.quantity).toLocaleString()}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between p-8 bg-indigo-600 text-white rounded-[32px] gap-6 shadow-xl shadow-indigo-100">
            <div><p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">含税总计报价 (CNY)</p><p className="text-4xl font-black">¥ {totalAmount.toLocaleString()}</p></div>
            <button onClick={submitBid} disabled={isSyncing} className="w-full md:w-auto bg-white text-indigo-600 px-12 py-5 rounded-[24px] font-black uppercase text-sm shadow-xl hover:scale-105 active:scale-95 transition-all">确认提交投标</button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
           <h3 className="font-black text-xl mb-10 text-gray-900">实时竞价分析看板</h3>
           {rfqBids.length > 0 ? (
             <div className="space-y-10">
               <div className="h-64 w-full"><ResponsiveContainer><BarChart data={[...rfqBids].sort((a,b)=>a.amount-b.amount)}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" /><XAxis dataKey="vendorName" fontSize={10} fontWeight="bold" /><YAxis fontSize={10}/><Tooltip cursor={{fill: '#F9FAFB'}} contentStyle={{borderRadius:'24px', border:'none'}}/><Bar dataKey="amount" fill="#4F46E5" radius={[10, 10, 0, 0]} barSize={40}/></BarChart></ResponsiveContainer></div>
               <div className="bg-gray-50 rounded-[32px] overflow-hidden"><table className="w-full text-left text-sm min-w-[500px]"><thead className="bg-gray-100 text-[10px] font-black text-gray-400 uppercase"><tr><th className="p-6">供应商</th><th className="p-6">总价</th><th className="p-6 text-right">报价时间</th></tr></thead><tbody className="divide-y divide-gray-100">{rfqBids.sort((a,b)=>a.amount-b.amount).map(b=>(<tr key={b.id} className="hover:bg-white transition-colors"><td className="p-6 font-bold">{b.vendorName}</td><td className="p-6 font-black text-indigo-600">¥ {b.amount.toLocaleString()}</td><td className="p-6 text-right text-gray-400 text-xs">{new Date(b.timestamp).toLocaleString()}</td></tr>))}</tbody></table></div>
             </div>
           ) : <div className="py-24 text-center text-gray-300 font-black italic border-2 border-dashed border-gray-100 rounded-[40px]">等待供应商报价数据同步...</div>}
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
    const [r, b, u] = await Promise.all([DataService.getRFQs(), DataService.getBids(), DataService.getUsers()]);
    setRfqs(r); setBids(b); setUsers(u); setLoading(false);
  };

  useEffect(() => { loadData(); if (supabase) { const sub = supabase.channel('realtime').on('postgres_changes', { event: '*', schema: 'public' }, loadData).subscribe(); return () => { supabase.removeChannel(sub); }; } }, []);

  if (!user) return <AuthPage onAuth={setUser} />;

  const isBuyer = user.role !== UserRole.VENDOR;
  const isSysAdmin = user.role === UserRole.SYS_ADMIN;

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col font-sans overflow-x-hidden">
        {showCloudSet && <CloudSettings onClose={() => setShowCloudSet(false)} />}
        {showCreateModal && <CreateRFQModal userId={user.id} onSave={async (r) => { await DataService.saveRFQ(r); setShowCreateModal(false); loadData(); }} onClose={() => setShowCreateModal(false)} />}
        
        <nav className="h-20 bg-white/80 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-100 px-6 md:px-12 flex items-center justify-between">
          <Link to="/" className="font-black text-2xl text-indigo-600 flex items-center gap-2"><div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-100"><Icons.Shield /></div>QuickBid</Link>
          <div className="flex items-center gap-2">
             <button onClick={loadData} className={`p-3 text-gray-400 hover:text-indigo-600 transition-all ${loading ? 'animate-spin' : ''}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2" /></svg></button>
             {isSysAdmin && <Link to="/users" className="p-3 text-gray-400 hover:text-indigo-600"><Icons.User /></Link>}
             {(isSysAdmin || user.role === UserRole.ADMIN) && <button onClick={() => setShowCloudSet(true)} className="p-3 text-gray-400 hover:text-indigo-600"><Icons.Settings /></button>}
             <div className="w-[1px] h-6 bg-gray-100 mx-2"></div>
             <button onClick={() => setUser(null)} className="text-[10px] font-black text-red-500 bg-red-50 px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all">登出</button>
          </div>
        </nav>

        <main className="flex-1 p-6 md:p-12 max-w-6xl mx-auto w-full">
          <Routes>
            <Route path="/" element={
              <div className="space-y-12 animate-in fade-in duration-500">
                <div className="flex justify-between items-end">
                  <div><h2 className="text-4xl font-black text-gray-900 tracking-tight">询价大厅</h2><p className="text-gray-400 text-[10px] font-black uppercase mt-2 tracking-widest">{isBuyer ? '管理我的项目档案' : '发现新的竞投机会'}</p></div>
                  {isBuyer && <button onClick={() => setShowCreateModal(true)} className="bg-indigo-600 text-white p-6 rounded-[32px] shadow-2xl hover:scale-110 active:scale-95 transition-all"><Icons.Plus /></button>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {rfqs.map(r => <SwipeableRFQCard key={r.id} rfq={r} user={user} onDelete={async (id) => { if(confirm('彻底删除该询价单及其所有报价？')) { await DataService.deleteRFQ(id); loadData(); } }} />)}
                  {rfqs.length === 0 && <div className="col-span-full py-40 text-center text-gray-300 font-black italic border-2 border-dashed border-gray-100 rounded-[60px]">暂无公开项目</div>}
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

const RFQDetailWrapper = ({ rfqs, bids, user, setBids }: any) => {
  const { id } = useParams();
  const rfq = rfqs.find((r:any) => r.id === id);
  if (!rfq) return <div className="py-48 text-center animate-pulse text-gray-300 font-black italic">档案提取中...</div>;
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
    e.preventDefault(); setLoading(true);
    try {
      const all = await DataService.getUsers();
      const u = all.find((x:any)=>x.id.toLowerCase()===formData.id.toLowerCase() && x.password===formData.password);
      if(u) onAuth(u); else alert('验证失败，请核对账号密码');
    } finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-6">
       <div className="bg-white w-full max-w-sm rounded-[64px] p-12 shadow-2xl animate-in zoom-in-95 duration-500">
         <div className="text-center mb-12"><div className="inline-block p-5 bg-indigo-600 text-white rounded-[28px] mb-6 shadow-2xl shadow-indigo-100"><Icons.Shield/></div><h1 className="text-4xl font-black text-gray-900 tracking-tighter">QuickBid</h1><p className="text-[10px] font-black text-gray-400 uppercase mt-2">企业级极简竞价系统</p></div>
         <form onSubmit={handleLogin} className="space-y-5">
           <input type="text" placeholder="账户 ID" required className="w-full p-6 bg-gray-50 rounded-[28px] font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition-all" value={formData.id} onChange={e=>setFormData({...formData, id: e.target.value})} />
           <input type="password" placeholder="访问密码" required className="w-full p-6 bg-gray-50 rounded-[28px] font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition-all" value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} />
           <button className="w-full bg-indigo-600 text-white py-6 rounded-[32px] font-black shadow-2xl mt-6 active:scale-95 transition-all">
             {loading ? '正在同步数据...' : '安全登录'}
           </button>
         </form>
         <div className="mt-12 text-center text-[10px] font-black text-gray-300 uppercase leading-relaxed space-y-1">
            <p>甲方: buyer (123) | 乙方: vendor1 (123)</p>
            <p className="text-indigo-300">超级管理员: admin (admin)</p>
         </div>
       </div>
    </div>
  );
};

export default App;
