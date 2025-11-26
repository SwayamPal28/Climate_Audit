import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link } from 'react-router-dom';

function Dashboard() {
  const [status, setStatus] = useState("Checking...");
  const [anomalies, setAnomalies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // Removed 'error' state to prevent warnings

  useEffect(() => {
    const fetchData = async () => {
      try {
        const anomaliesRes = await axios.get("http://localhost:8000/api/audit/anomalies");
        const combinedData = [
          ...(anomaliesRes.data.top_positive || []), 
          ...(anomaliesRes.data.top_negative || [])
        ];
        
        setAnomalies(combinedData);
        setStatus("OK");
      } catch (err) {
        setStatus("Backend not reachable");
        // We log the error to console instead of setting state
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Climate Audit X</h1>
          <div className="mt-2 flex items-center">
            <span className="text-sm font-medium">Backend Status: </span>
            <span className={`ml-2 px-2 py-1 text-xs rounded-full ${status === "OK" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
              {status}
            </span>
          </div>
        </header>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900">Anomaly Detection Results</h3>
            </div>
            <Link 
              to="/visualization" 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
            >
              View 3D Graph
            </Link>
          </div>

          <div className="border-t border-gray-200">
             {isLoading ? (
               <div className="p-6 text-center">Loading...</div>
             ) : (
                <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Country</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GDP</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CO2 Emissions</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Anomaly Score</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {anomalies.map((anomaly, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{anomaly.wb_code || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${anomaly.gdp_usd?.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{anomaly.co2_emissions_kt?.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                           <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            anomaly.anomaly_score > 0 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {anomaly.anomaly_score?.toFixed(4)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;