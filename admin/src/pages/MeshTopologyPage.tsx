import React from 'react';
import { Smartphone, Server, ArrowRight } from 'lucide-react';

const MeshTopologyPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Mesh Topology Visualization</h1>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold mb-6 text-gray-700">Live Network Flow</h2>
        
        <div className="flex flex-col lg:flex-row items-center justify-between space-y-8 lg:space-y-0 lg:space-x-4 p-8 bg-gray-50 rounded-lg border border-gray-100">
          
          {/* Originator */}
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shadow-inner relative">
              <Smartphone size={32} />
              <span className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">A</span>
            </div>
            <p className="mt-3 font-semibold text-gray-700">Originator</p>
            <p className="text-xs text-gray-500 text-center w-32 mt-1">No Internet<br/>Sends msg via BLE/WiFi Direct</p>
          </div>

          <ArrowRight className="text-gray-400 hidden lg:block" size={32} />
          <div className="h-8 w-1 bg-gray-400 lg:hidden rounded-full"></div>

          {/* Relay */}
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center shadow-inner relative">
              <Smartphone size={32} />
              <span className="absolute -top-2 -right-2 bg-indigo-500 text-white text-xs font-bold px-2 py-1 rounded-full">B</span>
            </div>
            <p className="mt-3 font-semibold text-gray-700">Relay Node</p>
            <p className="text-xs text-gray-500 text-center w-32 mt-1">No Internet<br/>Store & Forward</p>
          </div>

          <ArrowRight className="text-gray-400 hidden lg:block" size={32} />
          <div className="h-8 w-1 bg-gray-400 lg:hidden rounded-full"></div>

          {/* Gateway */}
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-inner relative">
              <Smartphone size={32} />
              <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">C</span>
            </div>
            <p className="mt-3 font-semibold text-gray-700">Gateway Node</p>
            <p className="text-xs text-gray-500 text-center w-32 mt-1">Has Internet<br/>Uploads to Backend</p>
          </div>

          <ArrowRight className="text-brand-500 hidden lg:block" size={32} />
          <div className="h-8 w-1 bg-brand-500 lg:hidden rounded-full"></div>

          {/* Server */}
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 bg-gray-900 text-brand-500 rounded-2xl flex items-center justify-center shadow-lg relative">
              <Server size={40} />
            </div>
            <p className="mt-3 font-semibold text-gray-900">FastAPI Backend</p>
            <p className="text-xs text-gray-500 text-center w-32 mt-1">Processes & Routes<br/>to Recipient</p>
          </div>

        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-gray-200 rounded-lg p-6 bg-white">
            <h3 className="font-semibold text-gray-800 mb-2">Store-and-Forward Stats</h3>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">Avg. Delivery Time</span>
              <span className="font-mono text-gray-900">4m 12s</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">Max Hop Count observed</span>
              <span className="font-mono text-gray-900">7 hops</span>
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-6 bg-white">
            <h3 className="font-semibold text-gray-800 mb-2">Network Health</h3>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">Active Relays</span>
              <span className="font-mono text-green-600 font-bold">1,204</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">Messages in transit</span>
              <span className="font-mono text-yellow-600 font-bold">342</span>
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-6 bg-white">
            <h3 className="font-semibold text-gray-800 mb-2">Hop Efficiency</h3>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2 mt-4">
              <div className="bg-brand-500 h-2.5 rounded-full w-[85%]"></div>
            </div>
            <p className="text-xs text-gray-500">85% of messages reach gateway within 3 hops.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeshTopologyPage;
