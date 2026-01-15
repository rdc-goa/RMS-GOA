"use client"

import { useEffect, useState } from "react";

export default function GsiDebugPage() {
  const [gsiState, setGsiState] = useState<any>(null);

  useEffect(() => {
    try {
      // @ts-ignore
      const state = typeof window !== 'undefined' ? window.__gsi : null;
      setGsiState(state || null);
    } catch (e) {
      setGsiState({ error: String(e) });
    }

    const id = setInterval(() => {
      try {
        // @ts-ignore
        setGsiState(window.__gsi || null);
      } catch (e) {
        // ignore
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>GSI Helper Debug</h1>
      <p>This page shows the live <code>window.__gsi</code> helper state for local debugging.</p>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 6 }}>
        {JSON.stringify(gsiState, null, 2)}
      </pre>
      <p>
        Note: This is for local debugging only. Do not deploy this page with sensitive info enabled.
      </p>
    </div>
  );
}
