
export enum UserRole {
  SYS_ADMIN = 'SYSTEM_ADMIN', // 系统超级管理员
  ADMIN = 'ADMIN',           // 采购方 (甲方)
  VENDOR = 'VENDOR'          // 供应商 (乙方)
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  company?: string;
  password?: string; // 简易存储
  createdAt: string;
}

export enum RFQStatus {
  OPEN = '开启中',
  CLOSED = '已关闭',
  AWARDED = '已定标'
}

export interface RFQ {
  id: string;
  title: string;
  description: string;
  deadline: string;
  budget?: number;
  status: RFQStatus;
  createdAt: string;
  creatorId: string;
  items: RFQItem[];
}

export interface RFQItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface Bid {
  id: string;
  rfqId: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  currency: string;
  deliveryDate: string;
  notes: string;
  timestamp: string;
  itemQuotes: ItemQuote[];
}

export interface ItemQuote {
  itemId: string;
  unitPrice: number;
}
