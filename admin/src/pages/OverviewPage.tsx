import React, { useEffect, useState } from 'react';
import { Users, Smartphone, Wifi, WifiOff, MessageSquare, Clock, AlertTriangle } from 'lucide-react';
import { getStats, getMessages } from '../services/api';
import { AdminStats, MessageItem } from '../types';

const OverviewPage = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentMessages, setRecentMessages] = useState<MessageItem[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const statsData = await getStats();
      setStats(statsData);
      const msgs = await getMessages();
      setRecentMessages(msgs.slice(0, 5));
    };
    fetchData();
  }, []);

  if (!stats) return <div className="p-4">Loading stats...</div>;

  const kpis = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'bg-blue-500' },
    { label: 'Total Devices', value: stats.totalDevices, icon: Smartphone, color: 'bg-indigo-500' },
    { label: 'Online Devices', value: stats.onlineDevices, icon: Wifi, color: 'bg-green-500' },
    { label: 'Offline Relays', value: stats.offlineRelays, icon: WifiOff, color: 'bg-orange-500' },
    { label: 'Delivered Messages', value: stats.deliveredMessages, icon: MessageSquare, color: 'bg-purple-500' },
    { label: 'Pending in Mesh', value: stats.pendingInMesh, icon: Clock, color: 'bg-yellow-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard Overview</h1>
      </div>

      {stats.activeSOSEmergencies > 0 && (
        <div className="bg-red-500 text-white p-4 rounded-lg shadow-lg flex items-center justify-between animate-pulse">
          <div className="flex items-center space-x-3">
            <AlertTriangle size={24} />
            <div>
              <h3 className="font-bold text-lg">Active SOS Emergencies ({stats.activeSOSEmergencies})</h3>
              <p className="text-red-100 text-sm">Immediate attention required. Check SOS Alerts page.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center">
            <div className={`p-4 rounded-lg ${kpi.color} text-white mr-4`}>
              <kpi.icon size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
              <h4 className="text-2xl font-bold text-gray-900">{kpi.value.toLocaleString()}</h4>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">Recent Mesh Activity</h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {recentMessages.map((msg) => (
              <div key={msg.id} className="flex items-start space-x-4 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                <div className="bg-brand-100 p-2 rounded-full text-brand-600">
                  <NetworkIcon size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Message Relayed: {msg.routePreview}</p>
                  <div className="flex text-xs text-gray-500 mt-1 space-x-4">
                    <span>Sender: {msg.senderId}</span>
                    <span>Hops: {msg.hopCount}</span>
                    <span>{new Date(msg.timestamp).toLocaleString()}</span>
                  </div>
                </div>
                <div>
                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                    msg.status === 'DELIVERED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {msg.status}
                  </span>
                </div>
              </div>
            ))}
            {recentMessages.length === 0 && <p className="text-gray-500 text-sm">No recent activity.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// Fallback icon for inline use
const NetworkIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="16" y="16" width="6" height="6" rx="1" />
    <rect x="2" y="16" width="6" height="6" rx="1" />
    <rect x="9" y="2" width="6" height="6" rx="1" />
    <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
    <path d="M12 12V8" />
  </svg>
);

export default OverviewPage;
