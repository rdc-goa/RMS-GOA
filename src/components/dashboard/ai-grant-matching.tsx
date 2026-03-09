'use client';

import { useState } from 'react';

interface FacultyProfile {
  researchInterests: string[];
}

export function AIGrantMatching() {
  const [facultyProfile, setFacultyProfile] = useState<FacultyProfile>({ researchInterests: [] });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const interests = e.target.value.split(',').map(s => s.trim());
    setFacultyProfile({ researchInterests: interests });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const response = await fetch('/api/grant-matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facultyProfile }),
      });
      const data = await response.json();
      if (data.success) {
        setSuggestions(data.suggestedGrants);
      } else {
        setError(data.error || 'Failed to get suggestions');
      }
    } catch (err) {
      setError('Error calling grant matching API');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-md max-w-lg mx-auto">
      <h2 className="text-xl font-semibold mb-2">AI-Powered Grant Matching</h2>
      <textarea
        className="w-full border p-2 rounded mb-2"
        placeholder="Enter research interests, separated by commas"
        onChange={handleInputChange}
        rows={4}
      />
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        onClick={handleSubmit}
        disabled={loading || facultyProfile.researchInterests.length === 0}
      >
        {loading ? 'Matching...' : 'Get Grant Suggestions'}
      </button>
      {error && <p className="text-red-600 mt-2">{error}</p>}
      {suggestions.length > 0 && (
        <ul className="mt-4 list-disc list-inside">
          {suggestions.map((suggestion, idx) => (
            <li key={idx}>{suggestion}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
