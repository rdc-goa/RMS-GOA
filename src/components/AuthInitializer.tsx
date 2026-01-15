
"use client"

import { useEffect, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/config"
import { Skeleton } from "@/components/ui/skeleton"

// Global flag to track if Google script is loaded
let googleScriptLoaded = false
let googleScriptPromise: Promise<void> | null = null

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load Google Identity Services script once globally
    if (!googleScriptLoaded && !googleScriptPromise) {
      googleScriptPromise = new Promise((resolve) => {
        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.defer = true
        script.onload = () => {
          googleScriptLoaded = true
            // Create a lightweight global helper object to manage GSI initialization
            try {
              // @ts-ignore - augment window
              if (!window.__gsi) {
                // This helper ensures accounts.id.initialize is called only once and forwards
                // credentials to the currently-registered callback.
                // Methods:
                //  - init(clientId): initializes GSI once with internal forwarder
                //  - setCallback(cb): sets the function that will receive the credential response
                //  - renderButton(parent, opts): renders the sign-in button
                //  - promptSafe(): calls prompt() but guards against concurrent calls
                //  - isInitialized: boolean flag
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                window.__gsi = {
                  isInitialized: false,
                  clientId: null,
                  currentCallback: null,
                  // Tracks whether a prompt call is currently outstanding (best-effort)
                  _outstandingPrompt: false,
                  _lastInitTs: 0,
                  _lastPromptTs: 0,
                  init(clientId: string) {
                    const now = Date.now();
                    console.debug('[GSI] init called', { clientId, now });
                    if (this.isInitialized) {
                      console.debug('[GSI] already initialized, skipping');
                      return;
                    }
                    this.clientId = clientId;
                    try {
                      window.google.accounts.id.initialize({
                        client_id: clientId,
                        callback: (resp: any) => {
                          console.debug('[GSI] forwarded response to registered callback', { hasCallback: !!this.currentCallback });
                          if (this.currentCallback) {
                            try {
                              this.currentCallback(resp);
                            } catch (e) {
                              console.error('[GSI] forwarded callback error:', e);
                            }
                          }
                        },
                      });
                      this.isInitialized = true;
                      this._lastInitTs = now;
                      console.debug('[GSI] initialized successfully', { ts: now });
                    } catch (e) {
                      console.error('[GSI] initialization failed:', e);
                    }
                  },
                  setCallback(cb: ((response: any) => void) | null) {
                    console.debug('[GSI] setCallback', { hasCallback: !!cb });
                    this.currentCallback = cb;
                  },
                  renderButton(parent: HTMLElement | null, opts: any) {
                    if (!parent) return;
                    if (!window.google) return;
                    try {
                      console.debug('[GSI] renderButton called', { parentId: parent.id || null });
                      window.google.accounts.id.renderButton(parent, opts || {});
                    } catch (e) {
                      console.error('[GSI] renderButton failed:', e);
                    }
                  },
                  promptSafe() {
                    const now = Date.now();
                    console.debug('[GSI] promptSafe called', { now, outstanding: !!this._outstandingPrompt });
                    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
                      console.debug('[GSI] promptSafe aborted - google API not available');
                      return;
                    }
                    // If we recently called prompt, avoid calling again within short timeframe
                    if (this._outstandingPrompt) {
                      console.debug('[GSI] prompt skipped - outstanding prompt in progress');
                      return;
                    }
                    try {
                      this._outstandingPrompt = true;
                      this._lastPromptTs = now;
                      window.google.accounts.id.prompt();
                      // best-effort reset after a short delay; the actual callback will arrive separately
                      setTimeout(() => {
                        this._outstandingPrompt = false;
                        console.debug('[GSI] outstandingPrompt flag cleared (timeout)');
                      }, 5000);
                    } catch (e) {
                      this._outstandingPrompt = false;
                      console.debug('[GSI] prompt skipped or failed:', e);
                    }
                  },
                };
              }
            } catch (helperError) {
              console.error('Failed to create GSI helper on window:', helperError);
            }
            resolve()
        }
        script.onerror = () => {
          console.error('Failed to load Google Identity Services script')
          resolve()
        }
        document.body.appendChild(script)
      })
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Once we get the first response from Firebase auth, we know the connection is established.
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  if (loading) {
    // This provides a full-page loading skeleton while Firebase connects.
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="w-full max-w-4xl space-y-4 p-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
