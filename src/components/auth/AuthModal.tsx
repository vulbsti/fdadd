'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, UserPlus, Github } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'login' | 'signup';
  setMode: (mode: 'login' | 'signup') => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, mode, setMode }) => {
  const { signInWithEmail, signUpWithEmail, signInWithGithub, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState(''); // For signup

  const isSignup = mode === 'signup';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSignup) {
      if (password !== confirmPassword) {
        // Use internal state for immediate feedback, AuthContext error for API errors
        alert("Passwords do not match."); // Simple alert, replace with better UI feedback
        return;
      }
      await signUpWithEmail(email, password, name);
    } else {
      await signInWithEmail(email, password);
    }
    // Keep modal open if loading or error, close on success (handled by AuthContext potentially)
    // If AuthContext doesn't auto-close, add: if (!loading && !error) onClose();
  };

   // Close modal and reset fields when auth state changes to logged in
   // This effect might need refinement based on how AuthProvider manages state updates.
   // React.useEffect(() => {
   //   if (user && isOpen) {
   //     onClose();
   //     setEmail('');
   //     setPassword('');
   //     setConfirmPassword('');
   //     setName('');
   //   }
   // }, [user, isOpen, onClose]);

  const handleOpenChange = (open: boolean) => {
      if (!open) {
          onClose();
          // Optionally reset fields on close regardless of success
           setEmail('');
           setPassword('');
           setConfirmPassword('');
           setName('');
           // Clear error from AuthContext? Depends on desired behavior
      }
  }

  const handleOAuthSignIn = async (provider: 'github') => {
      if (provider === 'github') {
          await signInWithGithub();
      }
      // Close modal potentially handled by AuthContext or redirect
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">
            {isSignup ? 'Create Account' : 'Welcome Back'}
          </DialogTitle>
          <DialogDescription>
            {isSignup ? 'Sign up to access exclusive features.' : 'Log in to continue to Aidoraa.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
         <Alert variant="destructive" className="my-4">
           <AlertTitle>Authentication Error</AlertTitle>
           <AlertDescription>{error}</AlertDescription>
         </Alert>
       )}

        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          {isSignup && (
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                className="col-span-3"
                required
                 disabled={loading}
              />
            </div>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="col-span-3"
              required
              disabled={loading}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="password" className="text-right">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="col-span-3"
              required
              disabled={loading}
            />
          </div>
           {isSignup && (
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="confirm-password" className="text-right">
                Confirm
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                 placeholder="••••••••"
                className="col-span-3"
                required
                 disabled={loading}
              />
            </div>
          )}
           <DialogFooter className="sm:flex-col sm:space-y-2 pt-4">
             <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isSignup ? <UserPlus className="mr-2 h-4 w-4"/> : <LogIn className="mr-2 h-4 w-4"/>) }
                {isSignup ? 'Sign Up' : 'Log In'}
             </Button>

             {/* OAuth Buttons Placeholder */}
            <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                    </span>
                </div>
            </div>
             <Button type="button" variant="outline" className="w-full" onClick={() => handleOAuthSignIn('github')} disabled={loading}>
               {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Github className="mr-2 h-4 w-4"/> }
                GitHub
             </Button>
             {/* Add other OAuth providers like Google here */}

             <Button
              type="button"
              variant="link"
              className="mt-2 text-sm"
              onClick={() => setMode(isSignup ? 'login' : 'signup')}
              disabled={loading}
            >
              {isSignup ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
            </Button>

           </DialogFooter>
        </form>

      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
