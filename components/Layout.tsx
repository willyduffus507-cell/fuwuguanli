import React from 'react';
import { User, RoleCode } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  title: string;
  user?: User;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, title, user }) => {
  const handleScan = () => {
    alert('正在启动扫码识别功能... (市场经理专属权限已激活)');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 max-w-md mx-auto overflow-hidden shadow-2xl">
      {/* 头部 */}
      <header className="bg-white px-4 py-3 border-b flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-800">{title}</h1>
        <div className="flex space-x-4 text-gray-500">
           {/* 只有市场经理及以上可以看到扫码权限按钮 */}
           {user && user.role_code <= RoleCode.MANAGER && (
             <button onClick={handleScan} className="text-[#07c160] active:scale-90 transition-transform">
               <i className="fa-solid fa-qrcode text-xl"></i>
             </button>
           )}
           <i className="fa-solid fa-magnifying-glass"></i>
           <i className="fa-solid fa-ellipsis"></i>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* 底部导航 */}
      <nav className="bg-white border-t flex justify-around py-2 fixed bottom-0 left-0 right-0 max-w-md mx-auto z-10">
        <button 
          onClick={() => onTabChange('dashboard')}
          className={`flex-1 flex flex-col items-center space-y-1 ${activeTab === 'dashboard' ? 'text-[#07c160]' : 'text-gray-400'}`}
        >
          <i className="fa-solid fa-house-laptop text-xl"></i>
          <span className="text-[10px]">工作台</span>
        </button>
        <button 
          onClick={() => onTabChange('leads')}
          className={`flex-1 flex flex-col items-center space-y-1 ${activeTab === 'leads' ? 'text-[#07c160]' : 'text-gray-400'}`}
        >
          <i className="fa-solid fa-address-book text-xl"></i>
          <span className="text-[10px]">线索池</span>
        </button>
        <button 
          onClick={() => onTabChange('resources')}
          className={`flex-1 flex flex-col items-center space-y-1 ${activeTab === 'resources' ? 'text-[#07c160]' : 'text-gray-400'}`}
        >
          <i className="fa-solid fa-rectangle-ad text-xl"></i>
          <span className="text-[10px]">资源中心</span>
        </button>
        <button 
          onClick={() => onTabChange('profile')}
          className={`flex-1 flex flex-col items-center space-y-1 ${activeTab === 'profile' ? 'text-[#07c160]' : 'text-gray-400'}`}
        >
          <i className="fa-solid fa-user text-xl"></i>
          <span className="text-[10px]">我的</span>
        </button>
      </nav>
    </div>
  );
};

export default Layout;