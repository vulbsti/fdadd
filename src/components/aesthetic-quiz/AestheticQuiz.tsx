'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ArrowRight, RotateCcw } from 'lucide-react';

// Define the structure for questions
interface QuizQuestion {
  id: number;
  text: string;
  options: { value: string; label: string; image?: string, hint?: string }[];
  aestheticPoints: { [value: string]: string[] }; // Map option value to aesthetic(s) it points to
}

// Define the structure for aesthetics
interface Aesthetic {
  title: string;
  description: string;
  vibes: string;
  keywords: string[];
}

// Define the aesthetics
const aesthetics: Record<string, Aesthetic> = {
  classic: {
    title: 'Classic & Timeless',
    description: 'You gravitate towards well-tailored pieces, neutral palettes, and enduring silhouettes. Think Audrey Hepburn or Grace Kelly – elegant, sophisticated, and always appropriate.',
    vibes: 'Polished, sophisticated, elegant, reliable, understated luxury.',
    keywords: ['Tailored', 'Neutral', 'Blazer', 'Trench Coat', 'Pearls', 'Loafers'],
  },
  minimalist: {
    title: 'Modern Minimalist',
    description: 'Your style is clean, uncluttered, and focuses on high-quality basics. You prefer simple shapes, monochromatic looks, and functional design. Less is definitely more.',
    vibes: 'Chic, modern, effortless, calm, intentional, architectural.',
    keywords: ['Monochromatic', 'Clean Lines', 'Quality Basics', 'Structured', 'Uncluttered', 'Neutral'],
  },
  bohemian: {
    title: 'Free-Spirited Bohemian',
    description: 'You love flowy fabrics, earthy tones, intricate patterns, and a relaxed, artistic feel. Comfort and self-expression are key to your eclectic style.',
    vibes: 'Artistic, free-spirited, romantic, comfortable, earthy, eclectic.',
    keywords: ['Flowy', 'Earthy Tones', 'Patterns', 'Maxi Dress', 'Fringe', 'Layered Jewelry'],
  },
  edgy: {
    title: 'Urban Edge',
    description: 'Your wardrobe features dark colors, leather, statement pieces, and a touch of rebellion. You\'re not afraid to experiment and make a bold statement.',
    vibes: 'Confident, bold, rebellious, cool, sharp, unconventional.',
    keywords: ['Leather Jacket', 'Dark Colors', 'Boots', 'Statement Piece', 'Distressed Denim', 'Graphic Tee'],
  },
  romantic: {
    title: 'Soft Romantic',
    description: 'You adore feminine details like lace, ruffles, floral prints, and soft textures. Your style evokes a sense of sweetness, delicacy, and nostalgia.',
    vibes: 'Feminine, delicate, dreamy, sweet, nostalgic, graceful.',
    keywords: ['Floral Prints', 'Lace', 'Ruffles', 'Pastels', 'Skirts', 'Ballet Flats'],
  },
   preppy: {
    title: 'Polished Preppy',
    description: 'Your look is inspired by classic collegiate style. Think crisp shirts, tailored shorts, nautical stripes, and loafers. It\'s neat, put-together, and subtly sporty.',
    vibes: 'Clean, traditional, neat, sporty, collegiate, organized.',
    keywords: ['Crisp Shirt', 'Nautical Stripes', 'Loafers', 'Blazer', 'Khakis', 'Polo Shirt'],
  },
};

// Define the quiz questions
const quizQuestions: QuizQuestion[] = [
  {
    id: 1,
    text: 'Which color palette are you most drawn to?',
    options: [
      { value: 'neutrals', label: 'Neutral tones (black, white, beige, grey)', image: 'https://picsum.photos/seed/q1opt1/200/150', hint: 'neutral color swatches' },
      { value: 'earthy', label: 'Earthy shades (olive, terracotta, mustard)', image: 'https://picsum.photos/seed/q1opt2/200/150', hint: 'earthy color palette' },
      { value: 'pastels', label: 'Soft pastels (blush, baby blue, mint)', image: 'https://picsum.photos/seed/q1opt3/200/150', hint: 'pastel color scheme' },
      { value: 'dark', label: 'Dark hues (black, deep navy, burgundy)', image: 'https://picsum.photos/seed/q1opt4/200/150', hint: 'dark moody colors' },
      { value: 'brights', label: 'Crisp brights (navy, white, red, kelly green)', image: 'https://picsum.photos/seed/q1opt5/200/150', hint: 'bright preppy colors' },
    ],
    aestheticPoints: {
      neutrals: ['classic', 'minimalist'],
      earthy: ['bohemian'],
      pastels: ['romantic'],
      dark: ['edgy'],
      brights: ['preppy']
    },
  },
  {
    id: 2,
    text: 'Pick your ideal weekend outfit:',
    options: [
      { value: 'blazer_jeans', label: 'A tailored blazer, crisp white shirt, and dark wash jeans', image: 'https://picsum.photos/seed/q2opt1/200/150', hint: 'blazer jeans outfit' },
      { value: 'maxi_dress', label: 'A flowy floral maxi dress with sandals', image: 'https://picsum.photos/seed/q2opt2/200/150', hint: 'boho maxi dress' },
      { value: 'leather_boots', label: 'A band tee, ripped jeans, leather jacket, and combat boots', image: 'https://picsum.photos/seed/q2opt3/200/150', hint: 'edgy band tee outfit' },
      { value: 'cashmere_set', label: 'A high-quality cashmere sweater and perfectly fitting trousers', image: 'https://picsum.photos/seed/q2opt4/200/150', hint: 'minimalist cashmere outfit' },
      { value: 'polo_shorts', label: 'A polo shirt, chino shorts, and boat shoes', image: 'https://picsum.photos/seed/q2opt5/200/150', hint: 'preppy polo shorts outfit' },
    ],
    aestheticPoints: {
       blazer_jeans: ['classic', 'preppy'],
       maxi_dress: ['bohemian', 'romantic'],
       leather_boots: ['edgy'],
       cashmere_set: ['minimalist', 'classic'],
       polo_shorts: ['preppy']
    },
  },
  {
    id: 3,
    text: 'Which accessory is a must-have?',
    options: [
      { value: 'pearls', label: 'Classic pearl earrings or necklace', image: 'https://picsum.photos/seed/q3opt1/200/150', hint: 'pearl necklace classic' },
      { value: 'layered_necklaces', label: 'Layered delicate gold necklaces', image: 'https://picsum.photos/seed/q3opt2/200/150', hint: 'layered gold necklaces bohemian' },
      { value: 'statement_ring', label: 'A bold, unique statement ring', image: 'https://picsum.photos/seed/q3opt3/200/150', hint: 'statement ring edgy' },
      { value: 'structured_bag', label: 'A minimalist, structured handbag', image: 'https://picsum.photos/seed/q3opt4/200/150', hint: 'minimalist structured handbag' },
      { value: 'headband', label: 'A neat headband or hair ribbon', image: 'https://picsum.photos/seed/q3opt5/200/150', hint: 'preppy headband' },
    ],
     aestheticPoints: {
        pearls: ['classic', 'preppy'],
        layered_necklaces: ['bohemian', 'romantic'],
        statement_ring: ['edgy'],
        structured_bag: ['minimalist', 'classic'],
        headband: ['preppy', 'romantic']
     },
  },
    {
    id: 4,
    text: 'Choose your preferred fabric texture:',
    options: [
      { value: 'silk', label: 'Smooth Silk or Crisp Cotton', image: 'https://picsum.photos/seed/q4opt1/200/150', hint: 'silk fabric texture' },
      { value: 'linen', label: 'Natural Linen or Soft Crochet', image: 'https://picsum.photos/seed/q4opt2/200/150', hint: 'linen fabric detail' },
      { value: 'lace', label: 'Delicate Lace or Soft Velvet', image: 'https://picsum.photos/seed/q4opt3/200/150', hint: 'lace texture feminine' },
      { value: 'leather', label: 'Sleek Leather or Worn Denim', image: 'https://picsum.photos/seed/q4opt4/200/150', hint: 'leather texture detail' },
      { value: 'cashmere', label: 'Fine Cashmere or Polished Wool', image: 'https://picsum.photos/seed/q4opt5/200/150', hint: 'cashmere sweater close up' },
    ],
     aestheticPoints: {
        silk: ['classic', 'minimalist'],
        linen: ['bohemian'],
        lace: ['romantic'],
        leather: ['edgy'],
        cashmere: ['classic', 'minimalist', 'preppy']
     },
  },
   {
    id: 5,
    text: 'What\'s your ideal shopping experience?',
    options: [
      { value: 'curated_boutique', label: 'A curated boutique with timeless investment pieces', image: 'https://picsum.photos/seed/q5opt1/200/150', hint: 'luxury boutique interior' },
      { value: 'vintage_market', label: 'Browsing unique finds at a vintage market', image: 'https://picsum.photos/seed/q5opt2/200/150', hint: 'vintage clothing market stall' },
      { value: 'online_minimal', label: 'Efficient online shopping for high-quality basics', image: 'https://picsum.photos/seed/q5opt3/200/150', hint: 'online shopping minimalist interface' },
      { value: 'department_store', label: 'A well-organized department store with trusted brands', image: 'https://picsum.photos/seed/q5opt4/200/150', hint: 'classic department store interior' },
      { value: 'concept_store', label: 'An edgy concept store with avant-garde designers', image: 'https://picsum.photos/seed/q5opt5/200/150', hint: 'modern concept store fashion' },
    ],
     aestheticPoints: {
        curated_boutique: ['classic', 'minimalist'],
        vintage_market: ['bohemian', 'romantic', 'edgy'],
        online_minimal: ['minimalist'],
        department_store: ['classic', 'preppy'],
        concept_store: ['edgy', 'minimalist']
     },
  },
];

const AestheticQuiz: React.FC = () => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<Aesthetic | null>(null);

  const handleAnswer = (value: string) => {
    setAnswers((prev) => ({ ...prev, [quizQuestions[currentQuestionIndex].id]: value }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < quizQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      calculateResult();
    }
  };

  const calculateResult = () => {
    const aestheticScores: Record<string, number> = {};
    Object.values(aesthetics).forEach(a => aestheticScores[a.title.toLowerCase().split(' ')[0]] = 0); // Initialize scores


    Object.entries(answers).forEach(([questionId, value]) => {
      const question = quizQuestions.find(q => q.id === parseInt(questionId));
      if (question && question.aestheticPoints[value]) {
        question.aestheticPoints[value].forEach(aestheticKey => {
          if (aestheticScores[aestheticKey] !== undefined) {
            aestheticScores[aestheticKey]++;
          }
        });
      }
    });

    // Find the aesthetic with the highest score
    let dominantAestheticKey = '';
    let maxScore = -1;
    Object.entries(aestheticScores).forEach(([key, score]) => {
      if (score > maxScore) {
        maxScore = score;
        dominantAestheticKey = key;
      }
    });

    // Handle ties (optional: could show multiple or a blend)
    const tiedAesthetics = Object.entries(aestheticScores)
        .filter(([key, score]) => score === maxScore)
        .map(([key]) => key);

    // For simplicity, pick the first dominant one found or default if error
    const finalAestheticKey = tiedAesthetics[0] || 'classic'; // Default fallback

    const resultAesthetic = Object.values(aesthetics).find(a => a.title.toLowerCase().startsWith(finalAestheticKey));
    setResult(resultAesthetic || aesthetics.classic); // Show result or default
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setAnswers({});
    setResult(null);
  };

  const currentQuestion = quizQuestions[currentQuestionIndex];
  const selectedValue = answers[currentQuestion.id];

  if (result) {
    return (
      <Card className="shadow-lg animate-in fade-in duration-500">
        <CardHeader>
          <CardTitle className="text-2xl font-serif text-center">{result.title}</CardTitle>
          <CardDescription className="text-center italic">This is your dominant fashion aesthetic!</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <p className="text-muted-foreground">{result.description}</p>
            <div>
              <h4 className="font-semibold text-foreground mb-1">Vibes You Give:</h4>
              <p className="text-muted-foreground">{result.vibes}</p>
            </div>
             <div>
              <h4 className="font-semibold text-foreground mb-1">Keywords:</h4>
              <div className="flex flex-wrap gap-2">
                 {result.keywords.map(kw => (
                    <span key={kw} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{kw}</span>
                 ))}
              </div>
            </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleRestart} variant="outline" className="w-full">
            <RotateCcw className="mr-2 h-4 w-4" /> Retake Quiz
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-serif">Question {currentQuestionIndex + 1} of {quizQuestions.length}</CardTitle>
        <CardDescription>{currentQuestion.text}</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={selectedValue} onValueChange={handleAnswer} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentQuestion.options.map((option) => (
            <Label
              key={option.value}
              htmlFor={`${currentQuestion.id}-${option.value}`}
              className={`flex flex-col items-center justify-center rounded-md border-2 p-4 transition-colors hover:bg-accent hover:text-accent-foreground ${selectedValue === option.value ? 'border-primary bg-accent' : 'border-muted'}`}
            >
              {option.image && (
                 <Image
                   src={option.image}
                   alt={option.label}
                   width={150}
                   height={100}
                   className="mb-3 rounded-md object-cover h-24 w-full"
                   data-ai-hint={option.hint || 'fashion aesthetic choice'}
                 />
              )}
              <RadioGroupItem
                 value={option.value}
                 id={`${currentQuestion.id}-${option.value}`}
                 className="sr-only" // Hide the actual radio button visually
               />
               <span className="text-center text-sm font-medium">{option.label}</span>
            </Label>
          ))}
        </RadioGroup>
      </CardContent>
      <CardFooter>
        <Button onClick={handleNext} disabled={!selectedValue} className="w-full">
          {currentQuestionIndex < quizQuestions.length - 1 ? 'Next Question' : 'See Results'}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AestheticQuiz;
