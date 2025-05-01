import DatePlannerApp from '@/components/dateplanner/DatePlannerApp';

export default function DatePlannerPage() {
  return (
    <div className="container mx-auto max-w-3xl py-12 px-4">
       <h1 className="text-3xl font-bold mb-8 text-center">AI Date Planner</h1>
       <DatePlannerApp />
    </div>
  );
}
