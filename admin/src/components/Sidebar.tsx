import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Smartphone, 
  MessageSquare, 
  AlertTriangle, 
  Network
} from 'lucide-react';
import { getSOSAlerts } from '../services/api';

const Sidebar = () => {
  const [activeSOS, setActiveSOS] = useState(0);

  useEffect(() => {
    const fetchSOS = async () => {
      const alerts = await getSOSAlerts();
      setActiveSOS(alerts.filter(a => !a.resolved).length);
    };
    fetchSOS();
    const interval = setInterval(fetchSOS, 10000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { to: '/overview', icon: LayoutDashboard, label: 'Overview' },
    { to: '/users', icon: Users, label: 'Users' },
    { to: '/devices', icon: Smartphone, label: 'Devices' },
    { to: '/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/sos-alerts', icon: AlertTriangle, label: 'SOS Alerts', badge: activeSOS },
    { to: '/mesh-topology', icon: Network, label: 'Mesh Topology' },
  ];

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-brand-500">BartaSetu</h1>
        <p className="text-xs text-gray-400 mt-1">বার্তা পৌঁছাবে, Internet না থাকলেও।</p>
      </div>
      <nav className="flex-1 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between px-4 py-3 transition-colors ${
                    isActive ? 'bg-gray-800 text-brand-500 border-r-4 border-brand-500' : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <div className="flex items-center space-x-3">
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
