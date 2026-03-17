export default function EditQuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Edit Quiz</h1>
      <p className="text-foreground/60">Quiz editor will appear here.</p>
    </div>
  );
}
