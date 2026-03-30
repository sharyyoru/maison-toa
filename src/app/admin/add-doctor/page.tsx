"use client";

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function AddDoctorPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const addNatalia = async () => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase
        .from('providers')
        .insert({
          name: 'Dr. Natalia Koltunova',
          email: 'info@maisontoa.com',
          specialty: 'Dermatology & Venereology'
        })
        .select()
        .single();

      if (error) {
        setError(error.message);
      } else {
        setMessage('Dr. Natalia Koltunova added successfully!');
        console.log('Added provider:', data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add doctor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Add Missing Doctor</h1>
        
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h2 className="font-semibold text-blue-900">Dr. Natalia Koltunova</h2>
            <p className="text-sm text-blue-700">Dermatology & Venereology</p>
            <p className="text-sm text-blue-600">info@maisontoa.com</p>
          </div>

          {message && (
            <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded">
              {message}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <button
            onClick={addNatalia}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Add Dr. Natalia Koltunova'}
          </button>
        </div>

        <div className="mt-6 text-sm text-gray-600">
          <p>After adding the doctor, refresh the appointments page to see all 5 doctors.</p>
        </div>
      </div>
    </div>
  );
}
