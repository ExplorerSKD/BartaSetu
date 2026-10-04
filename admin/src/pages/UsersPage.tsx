import React, { useEffect, useState } from 'react';
import { getUsers } from '../services/api';
import { UserItem } from '../types';
import { Search, CheckCircle, XCircle } from 'lucide-react';

const UsersPage = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch(() => setError('Could not reach the BartaSetu backend.'));
  }, []);

  const term = search.toLowerCase();
  const filtered = users.filter(u =>
    u.displayName.toLowerCase().includes(term) ||
    u.id.toLowerCase().includes(term) ||
    (u.bsId || '').toLowerCase().includes(term) ||
    (u.username || '').toLowerCase().includes(term)
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">BartaSetu ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Display Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Public Key</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.map(user => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="font-mono font-semibold text-gray-900">{user.bsId || '-'}</div>
                  <div className="text-xs text-gray-400">{user.id}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="text-gray-900">{user.displayName}</div>
                  {user.username && <div className="text-xs text-gray-400">@{user.username}</div>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {user.isOnline ?
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-green-700">Online</span> :
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">Offline</span>
                  }
                </td>
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
        {error && <div className="p-6 text-center text-red-600">{error}</div>}
        {!error && filtered.length === 0 && <div className="p-6 text-center text-gray-500">No users found.</div>}
      </div>
    </div>
  );
};

export default UsersPage;
