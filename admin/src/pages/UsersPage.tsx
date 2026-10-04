import React, { useEffect, useState } from 'react';
import { getUsers } from '../services/api';
import { UserItem } from '../types';
import { Search, CheckCircle, XCircle } from 'lucide-react';

const UsersPage = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getUsers().then(setUsers);
  }, []);

  const filtered = users.filter(u => 
    u.displayName.toLowerCase().includes(search.toLowerCase()) || 
    u.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Users</h1>
        <div className="relative">
          <input
            type="text"
            placeholder="Search users..."
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Display Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Public Key</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.map(user => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.displayName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(user.creationDate).toLocaleDateString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {user.hasPublicKey ? 
                    <span className="flex items-center text-green-600"><CheckCircle size={16} className="mr-1"/> Configured</span> : 
                    <span className="flex items-center text-red-500"><XCircle size={16} className="mr-1"/> Missing</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-6 text-center text-gray-500">No users found.</div>}
      </div>
    </div>
  );
};

export default UsersPage;
