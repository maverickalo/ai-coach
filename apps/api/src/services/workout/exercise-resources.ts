export function exerciseDemoUrl(exerciseName: string): string {
  const query = new URLSearchParams({
    search_query: `${exerciseName} exercise demo proper form`
  });
  return `https://www.youtube.com/results?${query.toString()}`;
}
