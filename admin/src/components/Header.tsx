import React from 'react';
import { Bell, User } from 'lucide-react';

const Header = () => {
  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6">
      <div className="text-lg font-semibold text-gray-700">
        BartaSetu Admin Dashboard
      </div>
      <div className="flex items-center space-x-4">
        <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
          <Bell size={20} />
        </button>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-600">
            <User size={18} />
          </div>
          <span className="text-sm font-medium text-gray-700">Admin</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
