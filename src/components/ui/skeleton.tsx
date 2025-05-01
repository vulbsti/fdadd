import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-secondary", className)} // Changed from bg-muted to bg-secondary for better theme consistency
      {...props}
    />
  )
}

export { Skeleton }