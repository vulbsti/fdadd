'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const intakeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  timezone: z.string().min(1, 'Timezone is required, e.g. Asia/Kolkata').max(100),
  place_name: z.string().max(300).optional(),
  time_source: z.string().max(50).optional(),
  time_confidence: z.string().max(50).optional(),
});

export type IntakeValues = z.infer<typeof intakeSchema>;

interface BirthIntakeFormProps {
  onSessionOpened: (sessionId: string) => void;
}

export default function BirthIntakeForm({ onSessionOpened }: BirthIntakeFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<IntakeValues>({ resolver: zodResolver(intakeSchema) });

  const onSubmit = async (values: IntakeValues) => {
    setServerError(null);
    const response = await fetch('/api/astrologer/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ birth: values }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.sessionId) {
      setServerError(payload?.error ?? 'Could not open a session. Please try again.');
      return;
    }
    onSessionOpened(payload.sessionId as string);
  };

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Birth details</CardTitle>
        <CardDescription>
          Your chart is calculated once and frozen — timing questions are answered against it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="astro-name">Name</Label>
            <Input id="astro-name" {...register('name')} placeholder="Full name" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="astro-date">Birth date</Label>
            <Input id="astro-date" {...register('date')} placeholder="2000-04-22" />
            {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
          </div>
          <div>
            <Label htmlFor="astro-time">Birth time</Label>
            <Input id="astro-time" {...register('time')} placeholder="09:15" />
            {errors.time && <p className="text-sm text-destructive">{errors.time.message}</p>}
          </div>
          <div>
            <Label htmlFor="astro-lat">Latitude</Label>
            <Input id="astro-lat" type="number" step="any" {...register('latitude')} placeholder="26.4499" />
            {errors.latitude && <p className="text-sm text-destructive">{errors.latitude.message}</p>}
          </div>
          <div>
            <Label htmlFor="astro-lng">Longitude</Label>
            <Input id="astro-lng" type="number" step="any" {...register('longitude')} placeholder="80.3319" />
            {errors.longitude && <p className="text-sm text-destructive">{errors.longitude.message}</p>}
          </div>
          <div>
            <Label htmlFor="astro-tz">Timezone</Label>
            <Input id="astro-tz" {...register('timezone')} placeholder="Asia/Kolkata" />
            {errors.timezone && <p className="text-sm text-destructive">{errors.timezone.message}</p>}
          </div>
          <div>
            <Label htmlFor="astro-source">Time source</Label>
            <Input id="astro-source" {...register('time_source')} placeholder="hospital, record, memory…" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="astro-place">Birth place</Label>
            <Input id="astro-place" {...register('place_name')} placeholder="Kanpur, Uttar Pradesh, India" />
          </div>
          {serverError && <p className="text-sm text-destructive sm:col-span-2">{serverError}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Calculating your chart…' : 'Open my reading'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
