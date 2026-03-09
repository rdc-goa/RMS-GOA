'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { type FirebaseApp } from 'firebase/app';
import { type Auth } from 'firebase/auth';
import { type Firestore } from 'firebase/firestore';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

interface FirebaseContextType {
    firebaseApp: FirebaseApp | null;
    auth: Auth | null;
    firestore: Firestore | null;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

interface FirebaseProviderProps {
    children: ReactNode;
    firebaseApp: FirebaseApp;
    auth: Auth;
    firestore: Firestore;
}

export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({ children, firebaseApp, auth, firestore }) => {
    return (
        <FirebaseContext.Provider value={{ firebaseApp, auth, firestore }}>
            {children}
            <FirebaseErrorListener />
        </FirebaseContext.Provider>
    );
};

export const useFirebase = (): FirebaseContextType => {
    const context = useContext(FirebaseContext);
    if (context === undefined) {
        throw new Error('useFirebase must be used within a FirebaseProvider');
    }
    return context;
};

export const useFirebaseApp = (): FirebaseApp => {
    const context = useFirebase();
    if (!context.firebaseApp) {
        throw new Error('Firebase app not available. Ensure FirebaseProvider is properly configured.');
    }
    return context.firebaseApp;
};

export const useAuth = (): Auth => {
    const context = useFirebase();
    if (!context.auth) {
        throw new Error('Firebase Auth not available. Ensure FirebaseProvider is properly configured.');
    }
    return context.auth;
};

export const useFirestore = (): Firestore => {
    const context = useFirebase();
    if (!context.firestore) {
        throw new Error('Firestore not available. Ensure FirebaseProvider is properly configured.');
    }
    return context.firestore;
};
