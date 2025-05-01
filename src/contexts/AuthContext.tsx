'use client';

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
// Import Supabase types if you have them, otherwise use placeholder types
// import { User } from '@supabase/supabase-js';
type User = { id: string; email?: string; user_metadata: { name?: string } } | null; // Placeholder user type

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  signInWithGithub: () => Promise<void>; // Add other providers as needed
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true); // Start loading until initial check is done
  const [error, setError] = useState<string | null>(null);

  // --- Placeholder Logic ---
  // In a real app, this useEffect would interact with the Supabase client
  // to check the initial auth state and subscribe to auth changes.

  useEffect(() => {
    // Simulate checking initial auth state
    setLoading(true);
    const timer = setTimeout(() => {
      // To test logged-in state:
      // setUser({ id: '123', email: 'test@example.com', user_metadata: { name: 'Test User'} });
      // To test logged-out state:
       setUser(null);
      setLoading(false);
    }, 1000); // Simulate network delay

    return () => clearTimeout(timer); // Cleanup timer

    /* --- Real Supabase Logic Example ---
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false); // Stop loading on auth change too
        setError(null); // Clear error on successful auth change
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
    */
  }, []);


  // --- Placeholder Auth Functions ---

  const signInWithEmail = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    console.log('Attempting sign in:', email);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call
    // Simulate success/failure
    if (email === 'test@example.com' && password === 'password') {
      setUser({ id: '123', email: 'test@example.com', user_metadata: { name: 'Test User'} });
       setLoading(false);
    } else {
      setError('Invalid email or password.');
      setLoading(false);
    }
     /* --- Real Supabase Logic ---
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
      // Auth state change handled by listener
      setLoading(false); // Listener might set loading false too
     */
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    setLoading(true);
    setError(null);
    console.log('Attempting sign up:', email, name);
     await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call
     // Simulate success (in real Supabase, might require email confirmation)
     setUser({ id: Date.now().toString(), email: email, user_metadata: { name: name } }); // Simulate immediate login
     console.log("Simulated signup successful, user set.");
     setLoading(false);
    /* --- Real Supabase Logic ---
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } } // Example adding metadata
      });
      if (signUpError) setError(signUpError.message);
       // Check if email confirmation is required. State change might happen after confirmation.
      setLoading(false);
    */
  };

   const signInWithGithub = async () => {
    setLoading(true);
    setError(null);
    console.log('Attempting GitHub sign in...');
    await new Promise(resolve => setTimeout(resolve, 1000));
     // Simulate immediate redirect or successful callback handling
     // In reality, Supabase handles the redirect and callback.
     // For testing, we can manually set a user after a delay.
      setUser({ id: 'gh-456', email: 'github_user@example.com', user_metadata: { name: 'GitHub User'} });
     setLoading(false);

    /* --- Real Supabase Logic ---
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      // options: { redirectTo: 'your-callback-url' } // Optional
    });
    if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
    }
    // Supabase handles redirect, listener handles state change on callback
    */
  };

  const signOut = async () => {
    setLoading(true);
    setError(null);
    console.log('Attempting sign out...');
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call
    setUser(null);
    setLoading(false);
    /* --- Real Supabase Logic ---
     const { error: signOutError } = await supabase.auth.signOut();
     if (signOutError) setError(signOutError.message);
     // State change handled by listener
     setLoading(false);
    */
  };

  const value = {
    user,
    loading,
    error,
    signInWithEmail,
    signUpWithEmail,
    signInWithGithub,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
