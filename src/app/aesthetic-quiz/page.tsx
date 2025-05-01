import AestheticQuiz from '@/components/aesthetic-quiz/AestheticQuiz';

export default function AestheticQuizPage() {
  return (
    <div className="container mx-auto max-w-2xl py-16 px-4">
       <h1 className="text-4xl font-bold mb-8 text-center font-serif">Discover Your Fashion Aesthetic</h1>
        <p className="text-lg text-muted-foreground mb-12 text-center">
           Answer a few questions to understand your personal style and the vibes you project.
        </p>
       <AestheticQuiz />
    </div>
  );
}
