// frontend/src/components/ShapleyForm.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export default function ShapleyForm() {
  const [target, setTarget] = useState('');
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const resp = await axios.post('/api/calculate/shapley', { target_country: target, params: {}});
    setResult(resp.data.allocations);
  };

  const data = result ? Object.entries(result).map(([k, v]) => ({ name: k, value: v })) : [];

  return (
    <div>
      <form onSubmit={submit}>
        <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Target country code (e.g. USA)" />
        <button type="submit">Compute Shapley</button>
      </form>

      {data.length > 0 && (
        <BarChart width={600} height={300} data={data}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" />
        </BarChart>
      )}
    </div>
  );
}
