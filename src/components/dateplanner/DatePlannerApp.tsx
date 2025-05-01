'use client';

import React, { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DatePlan {
  occasion: string;
  vibe: string;
  outfitSuggestion: string;
  locationSuggestion: string;
  activitySuggestion: string;
}

// Mock AI function (replace with actual API call)
const generateDatePlan = async (description: string): Promise<DatePlan> => {
  console.log("Generating date plan for:", description);
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Dummy response based on input (very basic)
  let occasion = "Romantic Dinner";
  let vibe = "Elegant";
  let outfit = "A classic black dress or a sharp suit.";
  let location = "A high-end restaurant with city views.";
  let activity = "Enjoy fine dining followed by a moonlit walk.";

  if (description.toLowerCase().includes("casual")) {
      occasion = "Casual Meetup";
      vibe = "Relaxed";
      outfit = "Comfortable jeans and a stylish top/shirt.";
      location = "A cozy cafe or a park.";
      activity = "Grab coffee, chat, or take a leisurely stroll.";
  } else if (description.toLowerCase().includes("adventure")) {
       occasion = "Adventurous Outing";
       vibe = "Exciting";
       outfit = "Practical outdoor wear - hiking boots, layers.";
       location = "A scenic hiking trail or rock climbing gym.";
       activity = "Hiking, exploring nature, or climbing.";
  }


  return {
    occasion: occasion,
    vibe: vibe,
    outfitSuggestion: outfit,
    locationSuggestion: location,
    activitySuggestion: activity,
  };
};


const DatePlannerApp: React.FC = () => {
  const [description, setDescription] = useState('');
  const [generatedPlan, setGeneratedPlan] = useState<DatePlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGeneratePlan = async () => {
    if (description.trim() === '') {
        setError('Please describe your desired date scenario.');
        return;
    }
    setIsLoading(true);
    setError(null);
    setGeneratedPlan(null);
    try {
      const plan = await generateDatePlan(description);
      setGeneratedPlan(plan);
    } catch (err) {
      console.error("Failed to generate date plan:", err);
      setError('Failed to generate plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Describe Your Ideal Date</CardTitle>
          <CardDescription>
            Tell the AI about the occasion, desired vibe, preferences, or any specific ideas you have.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           {error && (
             <Alert variant="destructive">
               <AlertTitle>Error</AlertTitle>
               <AlertDescription>{error}</AlertDescription>
             </Alert>
           )}
          <div className="grid w-full gap-1.5">
            <Label htmlFor="date-description">Date Scenario</Label>
            <Textarea
              id="date-description"
              placeholder="e.g., A romantic first date, elegant vibe, maybe Italian food?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              disabled={isLoading}
            />
          </div>
          <Button onClick={handleGeneratePlan} disabled={isLoading} className="w-full md:w-auto">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Date Plan'
            )}
          </Button>
        </CardContent>
      </Card>

      {generatedPlan && (
        <Card className="animate-in fade-in duration-500">
          <CardHeader>
            <CardTitle>Your AI-Generated Date Plan</CardTitle>
            <CardDescription>Occasion: {generatedPlan.occasion} | Vibe: {generatedPlan.vibe}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-1">Outfit Suggestion:</h4>
              <p className="text-muted-foreground">{generatedPlan.outfitSuggestion}</p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-1">Location Suggestion:</h4>
              <p className="text-muted-foreground">{generatedPlan.locationSuggestion}</p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-1">Activity Suggestion:</h4>
              <p className="text-muted-foreground">{generatedPlan.activitySuggestion}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DatePlannerApp;
