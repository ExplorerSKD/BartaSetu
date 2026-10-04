import React, { useEffect, useState } from 'react';
import { getDevices } from '../services/api';
import { DeviceItem } from '../types';
import { Wifi, WifiOff, MapPin } from 'lucide-react';

const DevicesPage = () => {
  const [devices, setDevices] = useState<DeviceItem[]>([]);

  useEffect(() => {
    getDevices().then(setDevices).catch((err) => console.error("Failed to load devices", err));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Devices</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Seen</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {devices.map(device => (
              <tr key={device.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{device.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.userId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md">{device.platform}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {device.isOnline ? 
                    <span className="flex items-center text-green-600 font-medium"><Wifi size={16} className="mr-1"/> Online</span> : 
                    <span className="flex items-center text-orange-500 font-medium"><WifiOff size={16} className="mr-1"/> Offline</span>
                  }
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(device.lastSeen).toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {device.location ? (
                    <span className="flex items-center">
                      <MapPin size={14} className="mr-1 text-gray-400" />
                      {device.location.lat.toFixed(4)}, {device.location.lon.toFixed(4)}
                    </span>
                  ) : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {devices.length === 0 && <div className="p-6 text-center text-gray-500">No devices found.</div>}
      </div>
    </div>
  );
};

export default DevicesPage;
