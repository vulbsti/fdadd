'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'login' | 'signup';
  setMode: (mode: 'login' | 'signup') => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  mode,
  setMode,
}: AuthModalProps) {
  const {
    user,
    loading,
    configured,
    error,
    notice,
    clearFeedback,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setFormError(null);
    clearFeedback();
  };

  useEffect(() => {
    if (user && isOpen) {
      onClose();
    }
  }, [isOpen, onClose, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (isSignup) {
      if (password.length < 8) {
        setFormError('Use at least 8 characters for your password.');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Passwords do not match.');
        return;
      }

      const result = await signUpWithEmail(email.trim(), password, name);
      if (result.ok && !result.message) onClose();
      return;
    }

    const result = await signInWithEmail(email.trim(), password);
    if (result.ok) onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
      onClose();
    }
  };

  const switchMode = () => {
    setFormError(null);
    clearFeedback();
    setMode(isSignup ? 'login' : 'signup');
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">
            {isSignup ? 'Create Account' : 'Welcome Back'}
          </DialogTitle>
          <DialogDescription>
            {isSignup
              ? 'Create an account with email or Google.'
              : 'Sign in to continue to Aidoraa.'}
          </DialogDescription>
        </DialogHeader>

        {(!configured || formError || error) && (
          <Alert variant="destructive" className="my-2">
            <AlertTitle>Authentication error</AlertTitle>
            <AlertDescription>
              {!configured ? 'Authentication is being configured.' : formError || error}
            </AlertDescription>
          </Alert>
        )}

        {notice && (
          <Alert className="my-2">
            <AlertTitle>Almost there</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          {isSignup && (
            <div className="grid gap-2">
              <Label htmlFor="auth-name">Name</Label>
              <Input
                id="auth-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
                disabled={loading || !configured}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={loading || !configured}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="auth-password">Password</Label>
              {!isSignup && (
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={isSignup ? 8 : undefined}
              required
              disabled={loading || !configured}
            />
          </div>

          {isSignup && (
            <div className="grid gap-2">
              <Label htmlFor="auth-confirm-password">Confirm password</Label>
              <Input
                id="auth-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={loading || !configured}
              />
            </div>
          )}

          <DialogFooter className="sm:flex-col sm:space-y-2 pt-2">
            <Button type="submit" className="w-full" disabled={loading || !configured}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isSignup ? (
                <UserPlus className="mr-2 h-4 w-4" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              {isSignup ? 'Create account' : 'Sign in'}
            </Button>

            <div className="relative my-2 w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void signInWithGoogle()}
              disabled={loading || !configured}
            >
              <span className="mr-2 font-semibold" aria-hidden="true">G</span>
              Continue with Google
            </Button>

            <Button
              type="button"
              variant="link"
              className="mt-2 text-sm"
              onClick={switchMode}
              disabled={loading}
            >
              {isSignup
                ? 'Already have an account? Sign in'
                : "Don't have an account? Create one"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
