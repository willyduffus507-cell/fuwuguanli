
import { supabase } from './supabaseClient';
import { User, RoleCode, LeadStatus, UserStatus, DashboardStats, PosterTemplate, ChatLog } from '../types';

class DBService {

  async checkConnection() {
    console.log('Checking Supabase connection...');
    try {
      const { count, error } = await supabase
        .from('sys_users')
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error('Supabase Connection Error:', error.message);
        return false;
      }
      console.log('Supabase Connection Success! User count:', count);
      return true;
    } catch (e) {
      console.error('Supabase Connection Exception:', e);
      return false;
    }
  }

  async getUserById(userId: number): Promise<User | null> {
    const { data, error } = await supabase
      .from('sys_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) console.error('getUserById error:', error);
    return data as User || null;
  }

  async loginByMobile(mobile: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('sys_users')
      .select('*')
      .eq('mobile', mobile)
      .eq('status', UserStatus.NORMAL)
      .single();

    if (error && error.code !== 'PGRST116') console.error('loginByMobile error:', error); // PGRST116 is no rows
    return data as User || null;
  }

  // 上传图片到 Supabase Storage 'posters' bucket
  async uploadPosterImage(file: File): Promise<string | null> {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `custom/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('posters')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload Error:', uploadError);
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('posters')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('图片上传失败，请检查 Supabase Storage "posters" 桶是否存在并开启 Public 权限');
      return null;
    }
  }

  // 检查手机号是否存在（不区分状态）
  async checkUserByMobile(mobile: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('sys_users')
      .select('*')
      .eq('mobile', mobile)
      .single();

    if (error && error.code !== 'PGRST116') console.error('checkUserByMobile error:', error);
    return data as User || null;
  }

  // 获取某个用户的所有下属（递归）
  private async getSubordinates(user: User): Promise<User[]> {
    if (user.role_code === RoleCode.ADMIN) {
      // 超管获取除自己外的所有人
      const { data } = await supabase.from('sys_users').select('*').neq('id', user.id);
      return (data as User[]) || [];
    }

    // 使用 relation_path 查找下属
    // 假设 relation_path 格式如 "0/12/34/"，只要包含 "/userId/" 即可
    const { data, error } = await supabase
      .from('sys_users')
      .select('*')
      .like('relation_path', `%/${user.id}/%`)
      .neq('id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getSubordinates error:', error);
      return [];
    }
    return (data as User[]) || [];
  }

  async createPosterTemplate(data: Omit<PosterTemplate, 'id' | 'my_recruit_count' | 'status' | 'created_at'>): Promise<PosterTemplate | null> {
    const { image_url, ...rest } = data;
    const newPoster = {
      ...rest,
      bg_url: image_url, // Map to DB column
      status: 1,
      // created_at 自动生成
    };

    const { data: res, error } = await supabase
      .from('sys_poster_templates')
      .insert(newPoster)
      .select()
      .single();

    if (error) {
      console.error('createPosterTemplate error:', error);
      return null;
    }
    // 转换 DB 字段 (bg_url -> image_url, register_count -> my_recruit_count)
    return res ? { ...res, image_url: res.bg_url, my_recruit_count: res.register_count } : null;
  }

  async updatePoster(id: number, data: Partial<PosterTemplate>) {
    // 映射前端字段到后端
    const dbData: any = { ...data };
    if (dbData.my_recruit_count !== undefined) {
      dbData.register_count = dbData.my_recruit_count;
      delete dbData.my_recruit_count;
    }
    if (dbData.image_url !== undefined) {
      dbData.bg_url = dbData.image_url;
      delete dbData.image_url;
    }

    const { error } = await supabase
      .from('sys_poster_templates')
      .update(dbData)
      .eq('id', id);

    if (error) console.error('updatePoster error:', error);
  }

  async deletePoster(id: number) {
    const { error } = await supabase
      .from('sys_poster_templates')
      .delete()
      .eq('id', id);
    if (error) console.error('deletePoster error:', error);
  }

  async registerViaQR(params: {
    mobile: string;
    parentId: number;
    posterId: number;
    posterType: number;
    nickname?: string;
    storeName?: string;
    region?: string;
  }): Promise<User | null> {
    // 1. Check existing
    const existing = await this.loginByMobile(params.mobile); // check logical duplicate? needs handling
    if (existing) throw new Error("您已注册过，请不要重复注册或联系管理员");

    // DEBUG LOG
    console.log('[RegisterViaQR] Params:', params);

    // 2. Get Parent
    let parent = await this.getUserById(params.parentId);
    console.log('[RegisterViaQR] DB Lookup Result:', parent);

    // Failsafe: If Parent is 11 (Super Admin) but not in DB, use valid virtual parent
    // Use Number() to ensure type safety
    if (!parent && Number(params.parentId) === 11) {
      console.log('[RegisterViaQR] Using Virtual Parent for ID 11');
      parent = {
        id: 11,
        role_code: RoleCode.ADMIN,
        relation_path: '0/',
        manager_id: 0,
        owner_agent_id: 0,
        source_promoter_id: 0
      } as User;
    }

    if (!parent) {
      console.error('[RegisterViaQR] Parent Not Found!', { id: params.parentId, type: typeof params.parentId });
      throw new Error("无效的邀请来源 (ParentID 不存在)");
    }

    // 3. Determine Role
    let targetRole: RoleCode;
    let initialStatus = UserStatus.PENDING;

    if (params.parentId === 11) {
      // Super Admin Invite: Logic for Market Manager
      targetRole = RoleCode.MANAGER;
      initialStatus = UserStatus.PENDING;
    } else if (params.posterType === 0 || params.posterType === 1) {
      targetRole = parent.role_code === RoleCode.MANAGER ? RoleCode.AGENT : RoleCode.PROMOTER;
    } else {
      targetRole = RoleCode.CUSTOMER;
      initialStatus = UserStatus.NORMAL;
    }

    // 4. Create User
    const newUserObj = {
      role_code: targetRole,
      mobile: params.mobile,
      nickname: params.nickname || `新用户_${params.mobile.slice(-4)}`,
      status: initialStatus,
      parent_id: params.parentId,
      manager_id: parent.role_code === RoleCode.MANAGER ? parent.id : parent.manager_id,
      relation_path: `${parent.relation_path}${parent.id}/`,
      owner_agent_id: parent.role_code === RoleCode.AGENT ? parent.id : parent.owner_agent_id,
      source_promoter_id: parent.role_code === RoleCode.PROMOTER ? parent.id : parent.source_promoter_id,
      source_poster_id: params.posterId,
      follow_up_history: '[]',
      lead_status: LeadStatus.NEW,
      intent_score: targetRole === RoleCode.CUSTOMER ? 60 : 0,
      city_name: params.region || '探测中...',
      store_name: params.storeName || (targetRole === RoleCode.CUSTOMER ? '待补充门店' : undefined)
    };

    const { data: created, error } = await supabase
      .from('sys_users')
      .insert(newUserObj)
      .select()
      .single();

    if (error) {
      console.error('registerViaQR error:', error);
      throw error;
    }
    return created as User;
  }

  async createSuperAdmin(mobile: string, nickname: string): Promise<User | null> {
    const existing = await this.checkUserByMobile(mobile);
    if (existing) throw new Error('该手机号已存在');

    const newUserObj = {
      role_code: RoleCode.ADMIN,
      mobile: mobile,
      nickname: nickname,
      status: UserStatus.NORMAL,
      parent_id: 0,
      manager_id: 0,
      relation_path: '0/',
      owner_agent_id: 0,
      source_promoter_id: 0,
      source_poster_id: 0,
      follow_up_history: '[]',
      lead_status: LeadStatus.NEW,
      intent_score: 0
    };

    const { data: created, error } = await supabase
      .from('sys_users')
      .insert(newUserObj)
      .select()
      .single();

    if (error) {
      console.error('createSuperAdmin error:', error);
      throw error;
    }
    return created as User;
  }

  async approveUser(userId: number) {
    await supabase.from('sys_users').update({ status: UserStatus.NORMAL }).eq('id', userId);
  }

  async rejectUser(userId: number, reason: string) {
    await supabase.from('sys_users').update({
      status: UserStatus.REJECTED,
      reject_reason: reason
    }).eq('id', userId);
  }

  async deleteUser(userId: number) {
    await supabase.from('sys_users').delete().eq('id', userId);
  }

  async updateUser(userId: number, data: Partial<User>) {
    const { error } = await supabase.from('sys_users').update(data).eq('id', userId);
    if (error) console.error('updateUser error:', error);
  }

  async upgradeToManager(userId: number) {
    return this.applyForUpgrade(userId, RoleCode.MANAGER, 11);
  }

  async applyForUpgrade(userId: number, targetRole: RoleCode, parentId: number) {
    const { error } = await supabase.from('sys_users').update({
      role_code: targetRole,
      status: UserStatus.PENDING,
      parent_id: parentId, // Re-bind relationship
      reject_reason: null
    }).eq('id', userId);

    if (error) {
      console.error('applyForUpgrade error:', error);
      throw error;
    }
  }

  // New method for smart upgrade based on QR parent
  async upgradeUserByQR(userId: number, parentId: number): Promise<User | null> {
    // 1. Get Parent
    let parent = await this.getUserById(parentId);

    // Failsafe for Super Admin virtual parent
    if (!parent && Number(parentId) === 11) {
      parent = { role_code: RoleCode.ADMIN, id: 11 } as User;
    }

    if (!parent) throw new Error("无效的邀请人ID");

    // 2. Determine Role
    let targetRole: RoleCode;
    if (parentId === 11) {
      targetRole = RoleCode.MANAGER;
    } else if (parent.role_code === RoleCode.MANAGER) {
      targetRole = RoleCode.AGENT;
    } else {
      // Promoter or others -> Promoter
      targetRole = RoleCode.PROMOTER;
    }

    // 3. Apply
    await this.applyForUpgrade(userId, targetRole, parentId);

    // 4. Return updated user
    return this.getUserById(userId);
  }

  async getDashboardStats(user: User): Promise<DashboardStats> {
    const subordinates = await this.getSubordinates(user);

    let statusCounts = { total: 0, new: 0, following: 0, deposit: 0, deal: 0, invalid: 0 };
    let teamCounts = { managers: 0, agents: 0, promoters: 0, valid_customers: 0 };

    subordinates.forEach(s => {
      if (s.role_code === RoleCode.MANAGER) teamCounts.managers++;
      else if (s.role_code === RoleCode.AGENT) teamCounts.agents++;
      else if (s.role_code === RoleCode.PROMOTER) teamCounts.promoters++;

      if (s.role_code === RoleCode.CUSTOMER) {
        statusCounts.total++;
        if (s.lead_status === LeadStatus.NEW) statusCounts.new++;
        else if (s.lead_status === LeadStatus.FOLLOWING) {
          statusCounts.following++;
          teamCounts.valid_customers++;
        }
        else if (s.lead_status === LeadStatus.DEPOSIT) {
          statusCounts.deposit++;
          teamCounts.valid_customers++;
        }
        else if (s.lead_status === LeadStatus.DEAL) {
          statusCounts.deal++;
          teamCounts.valid_customers++;
        }
        else if (s.lead_status === LeadStatus.INVALID) statusCounts.invalid++;
      }
    });

    // Real trend data: Last 7 days
    const days = 7;
    const trend_data = Array.from({ length: days }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
      const monthDay = `${d.getMonth() + 1}/${d.getDate()}`; // M/D

      // Filter subordinates created on this date
      const leadsToday = subordinates.filter(s =>
        s.role_code === RoleCode.CUSTOMER &&
        s.created_at.startsWith(dateStr)
      );

      const new_leads = leadsToday.length;
      // Cohort Deal: leads created today that are currently converted
      const deals = leadsToday.filter(s =>
        s.lead_status === LeadStatus.DEPOSIT ||
        s.lead_status === LeadStatus.DEAL
      ).length;

      return {
        date: monthDay,
        new_leads,
        deals
      };
    });

    return { status_counts: statusCounts, team_counts: teamCounts, trend_data };
  }

  private async countLeadsForUser(targetUser: User): Promise<number> {
    // 即使是异步，在列表中逐个调用可能会慢。
    // 这里为了保持逻辑一致，先用 count(*) query
    const { count } = await supabase
      .from('sys_users')
      .select('*', { count: 'exact', head: true })
      .eq('role_code', RoleCode.CUSTOMER)
      .like('relation_path', `%/${targetUser.id}/%`);

    return count || 0;
  }

  async getTeamMembersByTab(user: User, tabCode: RoleCode | 'valid_customers'): Promise<User[]> {
    const subordinates = await this.getSubordinates(user);
    let filtered: User[] = [];

    if (tabCode === 'valid_customers') {
      filtered = subordinates.filter(u =>
        u.role_code === RoleCode.CUSTOMER &&
        [LeadStatus.FOLLOWING, LeadStatus.DEPOSIT, LeadStatus.DEAL].includes(u.lead_status)
      );
    } else {
      filtered = subordinates.filter(u => u.role_code === tabCode);
    }

    // 1. Collect all related IDs for batch fetching names
    const relatedIds = new Set<number>();
    filtered.forEach(u => {
      if (u.manager_id) relatedIds.add(u.manager_id);
      if (u.owner_agent_id) relatedIds.add(u.owner_agent_id);
      if (u.source_promoter_id) relatedIds.add(u.source_promoter_id);
    });

    // 2. Fetch names map
    const nameMap = new Map<number, string>();
    if (relatedIds.size > 0) {
      const { data: names } = await supabase
        .from('sys_users')
        .select('id, nickname')
        .in('id', Array.from(relatedIds));

      names?.forEach((n: any) => nameMap.set(n.id, n.nickname));
    }

    // 3. Parallel fetch subordinate counts & attach names
    const results = await Promise.all(filtered.map(async item => {
      const count = await this.countLeadsForUser(item);
      return {
        ...item,
        subordinate_leads_count: count,
        manager_name: nameMap.get(item.manager_id) || '',
        agent_name: nameMap.get(item.owner_agent_id) || '',
        promoter_name: nameMap.get(item.source_promoter_id) || ''
      };
    }));

    return results.sort((a, b) => {
      if (a.status === UserStatus.PENDING && b.status !== UserStatus.PENDING) return -1;
      if (a.status !== UserStatus.PENDING && b.status === UserStatus.PENDING) return 1;

      const diff = (b.subordinate_leads_count || 0) - (a.subordinate_leads_count || 0);
      if (diff !== 0) return diff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  async getLeads(user: User, tab: string, keyword: string = ''): Promise<User[]> {
    const subordinates = await this.getSubordinates(user);
    // 这里如果数据量大应该在 DB 端 filter。目前保持一致性先 fetch all subordinate customers
    let leads = subordinates.filter(u => u.role_code === RoleCode.CUSTOMER);

    if (tab === 'new') leads = leads.filter(l => l.lead_status === LeadStatus.NEW);
    else if (tab === 'following') leads = leads.filter(l => l.lead_status === LeadStatus.FOLLOWING || l.lead_status === LeadStatus.DEPOSIT);
    else if (tab === 'deal') leads = leads.filter(l => l.lead_status === LeadStatus.DEAL);
    else if (tab === 'invalid') leads = leads.filter(l => l.lead_status === LeadStatus.INVALID);

    if (keyword) {
      const k = keyword.toLowerCase();
      leads = leads.filter(l => l.store_name?.toLowerCase().includes(k) || l.mobile.includes(k));
    }
    return leads;
  }

  async getPosterResources(user: User, tabIndex: number): Promise<PosterTemplate[]> {
    const is_admin = user.role_code === RoleCode.ADMIN;

    let query = supabase.from('sys_poster_templates').select('*').eq('type', tabIndex);
    if (!is_admin) {
      query = query.eq('status', 1);
    }

    const { data: posters, error } = await query;
    if (error || !posters) return [];

    // 我们需要计算 my_recruit_count
    // 这个逻辑原本是: subordinates.filter(u => u.role_code === CUSTOMER && u.source_poster_id === p.id).length
    // 这意味着要统计“当前用户管辖范围内的线索，且来源是这个海报”的数量

    // 为了性能，我们可以先获取 subordinates (只包含 customers)
    const { data: subs } = await supabase
      .from('sys_users')
      .select('id, source_poster_id')
      .eq('role_code', RoleCode.CUSTOMER)
      .like('relation_path', `%/${user.id}/%`);

    const subList = subs || [];

    return posters.map((p: any) => {
      const leads_count = subList.filter((u: any) => u.source_poster_id === p.id).length;
      return {
        ...p,
        image_url: p.bg_url, // map DB bg_url to frontend image_url
        my_recruit_count: leads_count
      } as PosterTemplate;
    });
  }

  async getChatHistory(userId: number): Promise<ChatLog[]> {
    const { data, error } = await supabase
      .from('chat_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    return (data as ChatLog[]) || [];
  }

  async addFollowUp(leadId: number, operator: string, note: string, status?: LeadStatus) {
    // 需要先获取 user 拿到旧 history
    const user = await this.getUserById(leadId);
    if (!user) return;

    const history = JSON.parse(user.follow_up_history || '[]');
    history.push({ operator, time: new Date().toISOString(), note });

    const updates: any = {
      follow_up_history: JSON.stringify(history)
    };
    if (status !== undefined) updates.lead_status = status;

    await this.updateUser(leadId, updates);
  }
}

export const dbService = new DBService();
