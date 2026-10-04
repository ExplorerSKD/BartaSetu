import React, { useEffect, useState } from 'react';
import { getSOSAlerts, resolveSOSAlert } from '../services/api';
import { SOSAlertItem } from '../types';
import { AlertOctagon, MapPin, Battery, CheckCircle } from 'lucide-react';

const SOSAlertsPage = () => {
  const [alerts, setAlerts] = useState<SOSAlertItem[]>([]);

  const fetchAlerts = () => {
    getSOSAlerts().then(setAlerts);
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleResolve = async (id: string) => {
    await resolveSOSAlert(id);
    fetchAlerts();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">SOS Emergency Management</h1>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {alerts.map(alert => (
          <div key={alert.id} className={`rounded-xl shadow-lg border overflow-hidden ${
            alert.resolved ? 'border-gray-200 bg-gray-50' : 'border-red-500 bg-red-50'
          }`}>
            <div className={`px-6 py-4 flex justify-between items-center ${
              alert.resolved ? 'bg-gray-100' : 'bg-red-500 text-white'
            }`}>
              <div className="flex items-center space-x-3">
                <AlertOctagon size={24} className={alert.resolved ? 'text-gray-400' : 'animate-pulse'} />
                <h3 className="font-bold text-lg">
                  {alert.resolved ? 'Resolved Emergency' : 'ACTIVE EMERGENCY'}
                </h3>
              </div>
              <div className="text-sm font-medium opacity-90">
                {new Date(alert.timestamp).toLocaleString()}
              </div>
            </div>
            
            <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-gray-700">
                  <span className="font-semibold w-20">User ID:</span> 
                  <span>{alert.userId}</span>
                </div>
                <div className="flex items-center space-x-2 text-gray-700">
                  <span className="font-semibold w-20">Device ID:</span> 
                  <span>{alert.deviceId}</span>
                </div>
                <div className="flex items-center space-x-2 text-gray-700">
                  <MapPin size={18} className="text-gray-400"/>
                  <span>Location: {alert.location.lat.toFixed(6)}, {alert.location.lon.toFixed(6)}</span>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${alert.location.lat},${alert.location.lon}`} target="_blank" rel="noreferrer" className="text-blue-600 text-sm hover:underline ml-2">
                    Open Map
                  </a>
                </div>
                <div className="flex items-center space-x-2 text-gray-700">
                  <Battery size={18} className={alert.batteryLevel < 20 ? 'text-red-500' : 'text-green-500'}/>
                  <span>Battery: {alert.batteryLevel}%</span>
                </div>
              </div>
              
              {!alert.resolved && (
                <button 
                  onClick={() => handleResolve(alert.id)}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition-colors flex items-center space-x-2"
                >
                  <CheckCircle size={20} />
                  <span>Mark as Resolved</span>
                </button>
              )}
            </div>
          </div>
        ))}
        {alerts.length === 0 && (
          <div className="bg-white p-12 text-center rounded-xl shadow-sm border border-gray-200">
            <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-bold text-gray-800">No active SOS alerts</h2>
            <p className="text-gray-500 mt-2">All clear in the network.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SOSAlertsPage;
