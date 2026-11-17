import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReadOnlyCoachingInsightsProps {
  insights: string;
  generatedAt?: string | null;
}

/**
 * The coach's insights as a reader (athlete, parent on a public link) sees them. They are the coach's words whatever
 * produced the draft, so no model badge, no AI icon and no AI wording here.
 */
export function ReadOnlyCoachingInsights({ insights, generatedAt }: ReadOnlyCoachingInsightsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Coaching Insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]} disallowedElements={['img']}>{insights}</ReactMarkdown>
        </div>
        {generatedAt && (
          <div className="pt-4 border-t text-sm text-muted-foreground">
            Written:{" "}
            {new Date(generatedAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
