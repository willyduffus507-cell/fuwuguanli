
import React, { useState, useEffect } from 'react';
import { User, LeadStatus } from '../types';
import { dbService } from '../services/dbService';
import PullToRefresh from './PullToRefresh';

interface LeadPoolProps {
  user: User;
  onSelectLead: (lead: User) => void;
}

const LeadPool: React.FC<LeadPoolProps> = ({ user, onSelectLead }) => {
  const [activeTab, setActiveTab] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [leads, setLeads] = useState<User[]>([]);

  const fetchLeads = async () => {
    const data = await dbService.getLeads(user, activeTab, keyword);
    setLeads(data);
  };

  useEffect(() => {
    fetchLeads();
  }, [user, activeTab, keyword]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white px-4 pt-4 pb-2 sticky top-0 z-20 border-b">
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索门店或联系电话..."
            className="w-full bg-gray-100 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#07c160] outline-none"
          />
        </div>
        <div className="flex mt-3 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: '全部' },
            { id: 'new', label: '待处理' },
            { id: 'following', label: '跟进中' },
            { id: 'deal', label: '已成交' },
            { id: 'invalid', label: '无效' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-4 py-3 text-xs font-black transition-all ${activeTab === tab.id ? 'text-[#07c160] border-b-2 border-[#07c160]' : 'text-gray-400'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <PullToRefresh onRefresh={fetchLeads}>
        <div className="p-4 space-y-3 pb-24 min-h-[500px]">
          {leads.length > 0 ? leads.map(lead => (
            <div
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className={`bg-white rounded-xl border p-4 shadow-sm active:bg-gray-50 relative overflow-hidden transition-all ${lead.lead_status === LeadStatus.NEW ? 'ring-1 ring-orange-200 bg-orange-50/20' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-2">
                  <h4 className="font-bold text-gray-800 truncate">{lead.store_name}</h4>
                  <p className="text-[10px] text-gray-400 mt-1 truncate">
                    <i className="fa-solid fa-user mr-1"></i>{lead.nickname} · {lead.city_name}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end space-y-1.5 flex-shrink-0">
                  <div className="flex items-center space-x-1">
                    {lead.lead_status === LeadStatus.NEW && (
                      <span className="bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-black animate-pulse shadow-sm">待处理</span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${lead.lead_status === LeadStatus.DEAL ? 'bg-green-100 text-green-600' :
                      lead.lead_status === LeadStatus.INVALID ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-600'
                      }`}>
                      {lead.intent_score}% 意向
                    </span>
                  </div>
                  <p className="text-[9px] text-gray-300 font-mono">{lead.mobile}</p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400">
                <span className="opacity-60">来源: {lead.source_promoter_id ? '推广员推荐' : '自助注册'}</span>
                {lead.lead_status === LeadStatus.NEW ? (
                  <button className="bg-[#07c160] text-white px-3 py-1 rounded-full font-black text-[9px] shadow-lg animate-pulse">
                    <i className="fa-solid fa-bolt-lightning mr-1"></i> 立即跟进
                  </button>
                ) : (lead.lead_status === LeadStatus.FOLLOWING || lead.lead_status === LeadStatus.DEPOSIT) ? (
                  <button className="bg-blue-500 text-white px-3 py-1 rounded-full font-black text-[9px] shadow-md">
                    添加跟进
                  </button>
                ) : (
                  <span className="font-medium">{new Date(lead.created_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          )) : (
            <div className="py-20 text-center">
              <i className="fa-solid fa-inbox text-4xl text-gray-100 mb-3"></i>
              <p className="text-gray-300 text-xs italic">暂无相关线索数据</p>
            </div>
          )}
        </div>
      </PullToRefresh>
    </div>
  );
};

export default LeadPool;
