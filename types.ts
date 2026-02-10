
declare module 'weixin-js-sdk';

export enum RoleCode {
  ADMIN = 0,
  MANAGER = 1,
  AGENT = 2,
  PROMOTER = 3,
  CUSTOMER = 4
}

export enum UserStatus {
  DISABLED = 0,
  NORMAL = 1,
  PENDING = 2,
  REJECTED = 3
}

export enum LeadStatus {
  NEW = 0,        // 待跟进
  FOLLOWING = 10, // 跟进中
  DEPOSIT = 20,   // 定金
  DEAL = 30,      // 已成交
  INVALID = 40,   // 无效
  PUBLIC = 99     // 公海
}

export interface User {
  id: number;
  role_code: RoleCode;
  mobile: string;
  username?: string;
  password?: string;
  nickname: string;
  status: UserStatus;
  reject_reason?: string;

  parent_id: number;
  manager_id: number;
  relation_path: string;
  owner_agent_id: number;
  source_promoter_id: number;
  source_poster_id: number;

  city_name?: string;
  region_scope?: string;
  store_name?: string;

  lead_status: LeadStatus;
  assign_time?: string;
  follow_up_history: string;

  intent_score: number;
  ai_summary?: string;
  last_intent_tag?: string;
  created_at: string;
  // UI 辅助字段
  subordinate_leads_count?: number;
  // UI Display Fields
  manager_name?: string;
  agent_name?: string;
  promoter_name?: string;
}

export interface ChatLog {
  id: number;
  user_id: number;
  session_id: string;
  sender_role: 'USER' | 'AI' | 'SYSTEM';
  content: string;
  is_voice_call: number;
  intent_score_snap: number;
  created_at: string;
}

export interface PosterTemplate {
  id: number;
  title: string;
  image_url: string;
  type: number;
  qr_config?: any;
  my_recruit_count: number;
  status: number;
  created_at: string;
}

export interface DashboardStats {
  status_counts: {
    total: number;
    new: number;
    following: number;
    deposit: number;
    deal: number;
    invalid: number;
  };
  team_counts: {
    managers: number;
    agents: number;
    promoters: number;
    valid_customers: number;
  };
  trend_data: {
    date: string;
    new_leads: number;
    deals: number; // 定金 + 成交
  }[];
}
