export default function QuizPreviewPage({ params }: { params: Promise<{ quizId: string }> }) {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Quiz Preview</h1>
      <p className="text-foreground/60">Read-only quiz preview will appear here.</p>
    </div>
  );
}
