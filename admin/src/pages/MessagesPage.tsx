import React, { useEffect, useState } from 'react';
import { getMessages } from '../services/api';
import { MessageItem } from '../types';

const MessagesPage = () => {
  const [messages, setMessages] = useState<MessageItem[]>([]);

  useEffect(() => {
    getMessages().then(setMessages);
  }, []);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'DELIVERED': return 'bg-green-100 text-green-800';
      case 'SERVER_RECEIVED': return 'bg-blue-100 text-blue-800';
      case 'RELAYED': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Messages (Metadata Only)</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Msg ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sender</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hops</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route Preview</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {messages.map(msg => (
              <tr key={msg.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{msg.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{msg.senderId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{msg.recipientId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(msg.status)}`}>
                    {msg.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center font-semibold">{msg.hopCount}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs">{msg.routePreview}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(msg.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {messages.length === 0 && <div className="p-6 text-center text-gray-500">No messages found.</div>}
      </div>
    </div>
  );
};

export default MessagesPage;
